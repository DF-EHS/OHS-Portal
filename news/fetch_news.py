#!/usr/bin/env python3
"""OHS Portal — 法規更新與職災情報自動化收集腳本"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
CACHE_FILE  = SCRIPT_DIR / "cache.json"
OUTPUT_HTML = SCRIPT_DIR / "index.html"

# ── Config ────────────────────────────────────────────────────────────────────
MAX_PER_SOURCE = 8
KEEP_DAYS      = 14
DESC_MAX_CHARS = 150   # RSS 原文描述顯示字數上限

TW = timezone(timedelta(hours=8))


def _gnews(q: str) -> str:
    return ("https://news.google.com/rss/search?hl=zh-TW&gl=TW&ceid=TW:zh-Hant&q="
            + urllib.parse.quote(q))


RSS_SOURCES = [
    {"id": "osha_news",      "name": "職安署最新消息", "badge": "blue",
     "url": "https://www.osha.gov.tw/48110/48417/48419/RssList"},
    {"id": "osha_announce",  "name": "職安署公告",     "badge": "green",
     "url": "https://www.osha.gov.tw/48110/48417/48423/RssList"},
    {"id": "gnews_incident", "name": "重大職災新聞",   "badge": "red",
     "url": _gnews("重大職災")},
    {"id": "gnews_ohs",      "name": "職安衛動態",     "badge": "purple",
     "url": _gnews("職業安全衛生")},
    {"id": "gnews_law",      "name": "法規更新",        "badge": "teal",
     "url": _gnews("勞動部法規")},
]


# ── Cache ─────────────────────────────────────────────────────────────────────
def load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text("utf-8"))
        except Exception:
            pass
    return {"items": []}


def save_cache(cache: dict) -> None:
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), "utf-8")


# ── RSS Parsing ───────────────────────────────────────────────────────────────
def _key(link: str) -> str:
    return hashlib.md5(link.encode()).hexdigest()[:16]


def _strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text)).strip()


def _parse_date(pub: str) -> datetime | None:
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(pub)
    except Exception:
        return None


def fetch_source(src: dict) -> list:
    try:
        req = Request(src["url"], headers={"User-Agent": "OHS-Portal-NewsBot/1.0"})
        with urlopen(req, timeout=20) as r:
            raw = r.read()
    except Exception as e:
        print(f"  [WARN] fetch failed ({src['name']}): {e}", file=sys.stderr)
        return []

    items = []
    try:
        root = ET.fromstring(raw)
        channel = root.find("channel") or root
        for el in channel.findall("item")[:MAX_PER_SOURCE]:
            title = _strip_html(el.findtext("title") or "")
            link  = (el.findtext("link") or "").strip()
            pub   = (el.findtext("pubDate") or "").strip()
            desc  = _strip_html(el.findtext("description") or "")
            # Google News 標題尾端附有「 - 媒體名稱」，去除
            if src["id"].startswith("gnews"):
                title = re.sub(r"\s+-\s+\S[^-]*$", "", title).strip()
            # 截短描述，超過上限加省略號
            if len(desc) > DESC_MAX_CHARS:
                desc = desc[:DESC_MAX_CHARS].rstrip() + "…"
            if title and link:
                dt = _parse_date(pub)
                items.append({
                    "key":         _key(link),
                    "title":       title,
                    "link":        link,
                    "pubDate":     pub,
                    "pubTs":       dt.timestamp() if dt else 0.0,
                    "desc":        desc,
                    "source_id":   src["id"],
                    "source_name": src["name"],
                    "badge":       src["badge"],
                })
    except Exception as e:
        print(f"  [WARN] parse failed ({src['name']}): {e}", file=sys.stderr)
    return items


# ── HTML Generation ───────────────────────────────────────────────────────────
_NAV_COLORS = {
    "blue":   "#2563eb",
    "green":  "#16a34a",
    "red":    "#dc2626",
    "purple": "#7c3aed",
    "teal":   "#0891b2",
}

def generate_html(items: list, updated_at: str) -> str:
    by_source: dict = {s["id"]: [] for s in RSS_SOURCES}
    for it in items:
        sid = it.get("source_id", "")
        if sid in by_source:
            by_source[sid].append(it)

    # 左側導覽按鈕（只顯示有內容的來源）
    nav_items = []
    for src in RSS_SOURCES:
        if not by_source[src["id"]]:
            continue
        color = _NAV_COLORS.get(src["badge"], "#64748b")
        nav_items.append(
            f'<a class="nav-btn" href="#{src["id"]}" data-id="{src["id"]}">'
            f'<span class="nav-dot" style="background:{color}"></span>'
            f'{src["name"]}</a>'
        )
    sidebar = "\n    ".join(nav_items)

    # 各來源區塊（section 加上 id 供錨點跳轉）
    sections = []
    for src in RSS_SOURCES:
        src_items = by_source[src["id"]]
        if not src_items:
            continue
        cards = []
        for it in src_items:
            dt = _parse_date(it.get("pubDate", ""))
            date_str = dt.astimezone(TW).strftime("%Y-%m-%d") if dt else it.get("pubDate", "")[:10]
            desc_html = ""
            if it.get("desc"):
                desc_html = f'\n        <p class="n-desc">{it["desc"]}</p>'
            cards.append(f"""
      <div class="n-card">
        <div class="n-meta">
          <span class="badge b-{it['badge']}">{it['source_name']}</span>
          <span class="n-date">{date_str}</span>
        </div>
        <a class="n-title" href="{it['link']}" target="_blank" rel="noopener">{it['title']}</a>{desc_html}
      </div>""")
        sections.append(f"""
  <section class="n-section" id="{src['id']}">
    <h2 class="sec-title">{src['name']}</h2>{"".join(cards)}
  </section>""")

    body = "".join(sections) if sections else '<p class="no-news">目前暫無消息，請稍後再試。</p>'

    return f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>法規更新與職災情報 — 大豐環保科技</title>
<style>
html{{scroll-behavior:smooth}}
:root{{--navy:#1e3a5f;--bg:#f1f5f9;--card:#fff;--border:#e2e8f0;--text:#1e293b;--sub:#64748b;--blue:#2563eb;--green:#16a34a;--red:#dc2626;--purple:#7c3aed;--teal:#0891b2}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:"Microsoft JhengHei","Noto Sans TC",sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column}}
header{{background:var(--navy);color:#fff;padding:12px 20px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:100}}
header h1{{font-size:17px;font-weight:700;flex:1}}
.hdr-btn{{padding:5px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff;font-size:12px;cursor:pointer;transition:background .15s;font-family:inherit}}
.hdr-btn:hover{{background:rgba(255,255,255,.2)}}
.hdr-brand{{display:flex;align-items:center;gap:7px;flex-shrink:0}}
.hdr-brand img{{height:24px;object-fit:contain}}
.hdr-brand span{{font-size:12px;color:#94a3b8;font-weight:600;white-space:nowrap}}

/* ── Layout ── */
.layout{{display:flex;flex:1;max-width:1140px;margin:0 auto;width:100%;padding:0 24px;gap:28px}}

/* ── Sidebar ── */
.sidebar{{width:172px;flex-shrink:0;padding-top:32px}}
.sidebar-inner{{position:sticky;top:68px}}
.nav-label{{font-size:10px;font-weight:700;color:var(--sub);letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)}}
.nav-btn{{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:9px;font-size:13px;font-weight:600;color:var(--sub);text-decoration:none;margin-bottom:3px;border-left:3px solid transparent;transition:background .15s,color .15s,border-color .15s}}
.nav-btn:hover{{background:var(--card);color:var(--text)}}
.nav-btn.active{{background:var(--card);color:var(--navy);border-left-color:var(--navy);box-shadow:0 1px 5px rgba(0,0,0,.06)}}
.nav-dot{{width:9px;height:9px;border-radius:50%;flex-shrink:0}}

/* ── Main ── */
main{{flex:1;min-width:0;padding:32px 0 60px}}
.page-hero{{margin-bottom:28px}}
.page-hero h2{{font-size:20px;font-weight:800;color:var(--navy);margin-bottom:6px}}
.page-hero p{{font-size:13px;color:var(--sub);margin-bottom:10px}}
.updated-at{{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--sub);background:#f8fafc;padding:4px 12px;border-radius:20px;border:1px solid var(--border)}}
.n-section{{margin-bottom:40px;scroll-margin-top:80px}}
.sec-title{{font-size:12px;font-weight:700;color:var(--sub);letter-spacing:3px;text-transform:uppercase;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--border);display:flex;align-items:center;gap:8px}}
.sec-title::before{{content:'';display:inline-block;width:4px;height:15px;border-radius:2px;background:var(--navy);flex-shrink:0}}
.n-card{{background:var(--card);border-radius:12px;padding:16px 18px;margin-bottom:10px;box-shadow:0 1px 5px rgba(0,0,0,.06);border:1px solid var(--border);transition:box-shadow .15s}}
.n-card:hover{{box-shadow:0 4px 18px rgba(0,0,0,.11)}}
.n-meta{{display:flex;align-items:center;gap:8px;margin-bottom:8px}}
.badge{{padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700}}
.b-blue  {{background:#dbeafe;color:#1d4ed8}}
.b-green {{background:#dcfce7;color:#15803d}}
.b-red   {{background:#fee2e2;color:#b91c1c}}
.b-purple{{background:#ede9fe;color:#6d28d9}}
.b-teal  {{background:#ccfbf1;color:#0e7490}}
.n-date{{font-size:12px;color:var(--sub)}}
.n-title{{display:block;font-size:15px;font-weight:700;color:var(--navy);text-decoration:none;line-height:1.4;margin-bottom:4px}}
.n-title:hover{{color:var(--blue);text-decoration:underline}}
.n-desc{{font-size:13px;color:var(--sub);line-height:1.65;border-left:3px solid var(--border);padding-left:11px;margin-top:10px}}
.no-news{{text-align:center;color:var(--sub);font-size:14px;padding:60px 0}}
footer{{text-align:center;padding:18px 24px;font-size:12px;color:var(--sub);border-top:1px solid var(--border);background:var(--card)}}

/* ── Mobile：側欄改為頂部橫向捲動列 ── */
@media(max-width:720px){{
  .layout{{flex-direction:column;padding:0 14px;gap:0}}
  .sidebar{{width:100%;padding-top:16px}}
  .sidebar-inner{{position:static;display:flex;gap:6px;overflow-x:auto;padding-bottom:12px}}
  .nav-label{{display:none}}
  .nav-btn{{flex-shrink:0;border-left:none;border-bottom:3px solid transparent;border-radius:20px;padding:6px 14px;background:var(--card);white-space:nowrap}}
  .nav-btn.active{{border-bottom-color:var(--navy);border-left-color:transparent}}
  main{{padding:16px 0 40px}}
}}
</style>
</head>
<body>

<header>
  <button class="hdr-btn" onclick="location.href='../'" title="回到系統入口">← 系統入口</button>
  <h1>📰 法規更新與職災情報</h1>
  <div class="hdr-brand">
    <img src="../dafon-logo.png" alt="大豐環保科技">
    <span>大豐環保科技</span>
  </div>
</header>

<div class="layout">

  <aside class="sidebar">
    <div class="sidebar-inner">
      <div class="nav-label">快速跳轉</div>
      {sidebar}
    </div>
  </aside>

  <main>
    <div class="page-hero">
      <h2>法規更新與重大職災新聞情報</h2>
      <p>自動彙整職安署公告、最新消息及相關新聞，工作日每四小時自動更新。</p>
      <div class="updated-at">🕐 最後更新：{updated_at}</div>
    </div>
    {body}
  </main>

</div>

<footer>大豐環保科技股份有限公司 &nbsp;·&nbsp; 資料來源：勞動部職業安全衛生署、Google News</footer>

<script>
// 滾動時自動高亮對應的左側按鈕
const sections = document.querySelectorAll('.n-section[id]');
const navBtns  = document.querySelectorAll('.nav-btn[data-id]');
if (sections.length && 'IntersectionObserver' in window) {{
  const obs = new IntersectionObserver(entries => {{
    entries.forEach(e => {{
      if (e.isIntersecting) {{
        navBtns.forEach(b => b.classList.toggle('active', b.dataset.id === e.target.id));
      }}
    }});
  }}, {{rootMargin: '-10% 0px -75% 0px'}});
  sections.forEach(s => obs.observe(s));
}}
</script>

</body>
</html>"""


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    cache = load_cache()
    existing: dict = {it["key"]: it for it in cache.get("items", [])}

    for src in RSS_SOURCES:
        print(f"Fetching {src['name']} ...", flush=True)
        fetched = fetch_source(src)
        print(f"  → {len(fetched)} items", flush=True)
        for it in fetched:
            existing[it["key"]] = it   # 新的覆蓋舊的（更新日期等欄位）

    # 保留最近 KEEP_DAYS 天的資料，職安署文章永久保留
    cutoff = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).timestamp()
    kept = [
        it for it in existing.values()
        if it.get("pubTs", 0) > cutoff or it.get("source_id", "").startswith("osha")
    ]
    kept.sort(key=lambda x: x.get("pubTs", 0), reverse=True)

    cache["items"]       = kept
    cache["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    save_cache(cache)

    now_tw = datetime.now(TW).strftime("%Y-%m-%d %H:%M")
    html = generate_html(kept, now_tw)
    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"\nDone — {OUTPUT_HTML.name} ({len(kept)} items)")


if __name__ == "__main__":
    main()
