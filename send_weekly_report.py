#!/usr/bin/env python3
"""
OHS Portal — 職安週報自動寄信腳本
每週一由工作排程器自動執行：讀 news/cache.json → 呼叫 AI → Outlook COM 寄出

Usage:
    python send_weekly_report.py [--to email] [--dry-run]
"""

import json
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
CACHE_FILE  = SCRIPT_DIR / "news" / "cache.json"
WORKER_URL  = "https://ohs-law-chatbot.df-hr-openai.workers.dev"
DEFAULT_TO  = "df.hr.openai@df-recycle.com"
TW          = timezone(timedelta(hours=8))


# ── 日期計算：上週週日～週六 ─────────────────────────────────────────
def get_last_week_range():
    today  = datetime.now(TW).date()
    isowd  = today.isoweekday()          # 1=Mon ... 7=Sun
    days_since_sun = isowd % 7           # Sun=0, Mon=1 ... Sat=6
    this_sun      = today - timedelta(days=days_since_sun)
    last_week_sun = this_sun - timedelta(days=7)
    last_week_sat = this_sun - timedelta(days=1)
    return last_week_sun, last_week_sat


# ── 讀取 cache.json ──────────────────────────────────────────────────
def load_cache():
    if not CACHE_FILE.exists():
        print(f"[ERROR] 找不到 {CACHE_FILE}", file=sys.stderr)
        return []
    try:
        return json.loads(CACHE_FILE.read_text("utf-8")).get("items", [])
    except Exception as e:
        print(f"[ERROR] cache.json 讀取失敗：{e}", file=sys.stderr)
        return []


# ── 過濾上週新聞（依新聞本身發布日期，非抓取日期） ──────────────────
def get_week_news(items, sun, sat):
    """以新聞 RSS pubDate 為條件過濾，回傳 (格式化列表, 實際日期標籤)"""
    from email.utils import parsedate_to_datetime
    result = []
    dates  = []
    for it in items:
        pub_ts = it.get("pubTs", 0)
        if not pub_ts:
            # pubTs 解析失敗時，直接嘗試解析原始 pubDate 字串
            try:
                pub_ts = parsedate_to_datetime(it.get("pubDate", "")).timestamp()
            except Exception:
                continue
        dt = datetime.fromtimestamp(pub_ts, tz=TW).date()
        if sun <= dt <= sat:
            dates.append(dt)
            source = it.get("source_name", "")
            title  = it.get("title", "")
            desc   = it.get("desc", "")
            desc_s = "：" + desc[:60] if desc else ""
            result.append(f"[{source}] {title}{desc_s}")

    # 以實際新聞日期決定標籤，而非腳本執行日期
    if dates:
        d_min, d_max  = min(dates), max(dates)
        actual_label  = f"{d_min.month}/{d_min.day} ～ {d_max.month}/{d_max.day}"
    else:
        actual_label  = f"{sun.month}/{sun.day} ～ {sat.month}/{sat.day}"

    return result, actual_label


# ── 組裝 Prompt ──────────────────────────────────────────────────────
def build_prompt(news_items, week_label):
    lines = "\n".join(news_items)
    return (
        "你是大豐環保科技股份有限公司職安週報的撰寫者。公司業務為環保廢棄物回收處理，"
        "作業環境包含辦公室及現場作業區。\n\n"
        f"以下是上週（{week_label}）的職安相關新聞與公告（共 {len(news_items)} 則）：\n\n"
        + lines
        + "\n\n請依下列格式撰寫本週職安週報，使用繁體中文，語氣親切易懂，"
        "適合一般員工閱讀，避免艱澀術語，讓非職安專業的同仁也能輕鬆理解：\n\n"
        "## 📋 本週情勢概覽\n（2-3句簡要說明這週整體職安狀況）\n\n"
        "## 🔴 重大事故與職災摘要\n（條列本週重要事故，每則一行；若無則寫「本週無重大職災新聞」）\n\n"
        "## 📢 法規與政策動態\n（整理法規修訂、政府公告、政策方向）\n\n"
        "## 💡 帶給我們的啟示\n（2-3點用平易近人的語氣，說明這些新聞對我們同仁的意義與提醒）"
    )


# ── 呼叫 Cloudflare Worker → AI ──────────────────────────────────────
def call_worker(prompt):
    payload = json.dumps({"text": prompt}).encode("utf-8")
    req = urllib.request.Request(
        WORKER_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Origin": "https://df-ehs.github.io",
            "Referer": "https://df-ehs.github.io/OHS-Portal/news/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return (
        body.get("data")
        or ((body.get("choices") or [{}])[0].get("message") or {}).get("content")
        or body.get("text")
        or ""
    )


# ── Markdown → HTML（郵件用） ─────────────────────────────────────────
def md_to_html(text):
    import re
    lines = text.strip().split("\n")
    html, in_ul = [], False
    for line in lines:
        s = line.strip()
        if not s:
            if in_ul:
                html.append("</ul>"); in_ul = False
            continue
        if s.startswith("## "):
            if in_ul: html.append("</ul>"); in_ul = False
            t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s[3:])
            html.append(
                f'<h3 style="color:#1e3a5f;border-left:4px solid #1e3a5f;'
                f'padding-left:10px;margin-top:22px;margin-bottom:8px">{t}</h3>'
            )
        elif s.startswith("### "):
            if in_ul: html.append("</ul>"); in_ul = False
            t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s[4:])
            html.append(f'<h4 style="color:#334155;margin-top:14px;margin-bottom:6px">{t}</h4>')
        elif re.match(r'^[-*]\s+', s):
            if not in_ul:
                html.append('<ul style="padding-left:20px;margin:6px 0 10px">'); in_ul = True
            item = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s[2:])
            html.append(f"<li style='margin-bottom:4px'>{item}</li>")
        else:
            if in_ul: html.append("</ul>"); in_ul = False
            p = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
            html.append(f"<p style='margin:6px 0'>{p}</p>")
    if in_ul:
        html.append("</ul>")
    return "\n".join(html)


# ── 組裝完整郵件 HTML ─────────────────────────────────────────────────
def build_email_html(report_text, week_label, news_count):
    body = md_to_html(report_text)
    return f"""<div style="font-family:'Microsoft JhengHei','Noto Sans TC',sans-serif;font-size:14px;color:#333;line-height:1.75;max-width:720px">
<p>您好，</p>
<p>以下是本週自動產生的職安週報（新聞發布日期：<strong>{week_label}</strong>，共 {news_count} 則），敬請參閱。</p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">
{body}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">
<p style="font-size:12px;color:#64748b">本週報由 OHS Portal 系統自動產生 · Gemini AI 彙整</p>
<p style="margin-top:18px">賴佑毓<br/><span style="font-size:12px;color:#666">人力資源部</span></p>
</div>"""


# ── 寄出（Outlook COM，與工作日誌相同方式） ───────────────────────────
def send_email(subject, html_body, to_email):
    try:
        import win32com.client
    except ImportError:
        print("[ERROR] 缺少 pywin32，請執行: pip install pywin32", file=sys.stderr)
        sys.exit(1)

    outlook = win32com.client.Dispatch("Outlook.Application")
    ns      = outlook.GetNamespace("MAPI")
    mail    = outlook.CreateItem(0)
    recip   = mail.Recipients.Add(to_email)
    recip.Resolve()
    mail.Subject  = subject
    mail.HTMLBody = html_body
    mail.Send()
    del mail
    time.sleep(2)

    for i in range(1, ns.SyncObjects.Count + 1):
        ns.SyncObjects.Item(i).Start()
    time.sleep(10)

    outbox = ns.GetDefaultFolder(4)
    stuck  = any(
        outbox.Items.Item(i).Subject == subject
        for i in range(1, outbox.Items.Count + 1)
    )
    if stuck:
        for i in range(1, ns.SyncObjects.Count + 1):
            ns.SyncObjects.Item(i).Start()
        time.sleep(10)
        print("[WARN] 請手動確認 Outlook 寄件匣", file=sys.stderr)
    else:
        print(f"[OK] 週報已寄出至 {to_email}")


# ── Main ──────────────────────────────────────────────────────────────
def main():
    dry_run  = "--dry-run" in sys.argv
    to_email = DEFAULT_TO
    if "--to" in sys.argv:
        idx = sys.argv.index("--to")
        if idx + 1 < len(sys.argv):
            to_email = sys.argv[idx + 1]

    sun, sat = get_last_week_range()
    print(f"[INFO] 篩選區間：{sun} ～ {sat}（上週週日～週六）")

    items = load_cache()
    news, actual_label = get_week_news(items, sun, sat)
    print(f"[INFO] 找到 {len(news)} 則新聞（實際發布日期：{actual_label}）")

    if not news:
        print("[WARN] 上週無新聞資料，略過寄信。")
        return

    print("[INFO] 呼叫 AI 產生週報（約需 30 秒）...")
    prompt = build_prompt(news, actual_label)
    try:
        report_text = call_worker(prompt)
    except Exception as e:
        print(f"[ERROR] AI 呼叫失敗：{e}", file=sys.stderr)
        sys.exit(1)

    if not report_text:
        print("[ERROR] AI 回應為空", file=sys.stderr)
        sys.exit(1)

    subject   = f"職安週報 {actual_label}（AI 自動彙整）"
    html_body = build_email_html(report_text, actual_label, len(news))

    if dry_run:
        safe = lambda s: s.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8")
        print(f"[DRY-RUN] 標題：{safe(subject)}")
        print(f"[DRY-RUN] 收件者：{to_email}")
        print("[DRY-RUN] 內容預覽（前 600 字）：")
        print(safe(report_text[:600]))
        return

    send_email(subject, html_body, to_email)


if __name__ == "__main__":
    main()
