#!/usr/bin/env python3
"""
OHS Portal — 颱風陸上警報自動派送腳本
工作排程器每 30 分鐘執行：偵測台中市/彰化縣陸上警報 → 建立 Outlook 草稿（含附件）

Usage:
    python typhoon_dispatch.py           正常模式
    python typhoon_dispatch.py --test    僅印出 API 回應，不建立草稿（除錯用）
    python typhoon_dispatch.py --force   忽略重複偵測，強制建立草稿（格式測試用）
"""

import json
import os
import shutil
import ssl
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

# 公司網路 SSL 攔截導致憑證驗證失敗，建立不驗證憑證的 context
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

SCRIPT_DIR   = Path(__file__).parent
STATE_FILE   = SCRIPT_DIR / "typhoon_state.json"
LOCAL_COPY   = SCRIPT_DIR / "typhoon" / "災前及災後檢核表.doc"
K_DRIVE_DOC  = Path(r"K:\HR-人資\7.工安\18.節日天災宣導資料及檢核表\災前及災後檢核表.doc")
CWA_KEY      = "CWA-6A18801C-3D96-4113-93F6-8198BD0712F2"
CWA_API      = (
    "https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-001"
    f"?Authorization={CWA_KEY}&format=JSON"
)
TARGET_AREAS = {"台中市", "彰化縣"}
TW           = timezone(timedelta(hours=8))

MAIL_TO = "df09@df-recycle.com.tw; da12@df-recycle.com.tw"
MAIL_CC = "01801@df-recycle.com.tw; 01761@df-recycle.com.tw"


# ── 氣象署 API ────────────────────────────────────────────────────────────────
def check_land_warning():
    """
    呼叫 CWA W-C0034-001 API。
    回傳 (has_warning: bool, typhoon_name: str, matched_areas: list[str])

    實際 JSON 結構（經測試確認）：
      records.info[]
        .urgency       — "Immediate"/"Expected" = 生效，"Past" = 已解除
        .headline      — 包含 "陸上颱風警報" 表示有陸上警報
        .cwa_typhoon_name — 中文颱風名稱
        .areaDesc      — 受影響地區字串（空格分隔縣市名）
    """
    try:
        req = urllib.request.Request(
            CWA_API,
            headers={"User-Agent": "OHS-Portal-TyphoonDispatch/1.0"}
        )
        with urllib.request.urlopen(req, timeout=15, context=_SSL_CTX) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[ERROR] 氣象署 API 呼叫失敗：{e}", file=sys.stderr)
        return False, "", []

    entry_list = data.get("records", {}).get("info", [])
    if isinstance(entry_list, dict):
        entry_list = [entry_list]

    for entry in entry_list:
        # 已解除的警報略過
        if entry.get("urgency", "") == "Past":
            continue

        headline = entry.get("headline", "")
        if "陸上" not in headline:
            continue

        # 颱風名稱
        name = (
            entry.get("cwa_typhoon_name") or
            entry.get("typhoon_name") or
            "未知颱風"
        )

        # areaDesc 為空格分隔的縣市字串，例如 "宜蘭縣 花蓮縣 台中市 彰化縣"
        area_desc = entry.get("areaDesc", "")
        tokens = area_desc.replace("、", " ").replace(",", " ").split()
        matched = {t for t in tokens if t in TARGET_AREAS}

        if matched:
            return True, name, sorted(matched)

    return False, "", []


# ── 狀態管理（防止重複派送）────────────────────────────────────────────────────
def already_dispatched(typhoon_name: str) -> bool:
    """同一颱風今日已派送則回傳 True"""
    if not STATE_FILE.exists():
        return False
    try:
        state = json.loads(STATE_FILE.read_text("utf-8"))
        today = datetime.now(TW).strftime("%Y-%m-%d")
        return state.get("typhoon") == typhoon_name and state.get("date") == today
    except Exception:
        return False


def mark_dispatched(typhoon_name: str):
    now = datetime.now(TW)
    state = {
        "typhoon": typhoon_name,
        "date": now.strftime("%Y-%m-%d"),
        "dispatched_at": now.strftime("%Y-%m-%d %H:%M:%S"),
    }
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[INFO] 派送記錄已寫入 {STATE_FILE.name}")


# ── 附件路徑（本機優先，K 槽備援）──────────────────────────────────────────────
def get_attachment_path() -> str:
    """
    優先使用本機備份。
    若 K 槽可連線，順便更新本機備份。
    兩者皆無則拋出 FileNotFoundError。
    """
    LOCAL_COPY.parent.mkdir(parents=True, exist_ok=True)

    if K_DRIVE_DOC.exists():
        try:
            shutil.copy2(K_DRIVE_DOC, LOCAL_COPY)
            print(f"[INFO] 已從 K 槽同步最新版本至本機備份")
        except Exception as e:
            print(f"[WARN] K 槽同步失敗，使用既有本機備份：{e}")

    if LOCAL_COPY.exists():
        return str(LOCAL_COPY)

    raise FileNotFoundError(
        "找不到災前及災後檢核表！\n"
        f"  本機路徑：{LOCAL_COPY}\n"
        f"  K 槽路徑：{K_DRIVE_DOC}\n"
        "請先執行初次備份：\n"
        r'  Copy-Item "K:\HR-人資\7.工安\18.節日天災宣導資料及檢核表\災前及災後檢核表.doc" '
        r'"C:\Users\gloom.lai\OHS-Portal\typhoon\災前及災後檢核表.doc"'
    )


# ── 郵件內容 ──────────────────────────────────────────────────────────────────
def build_email_html(typhoon_name: str, trigger_dt: datetime, matched_areas: list) -> str:
    area_str = "、".join(matched_areas) if matched_areas else "台中市／彰化縣"
    date_str = trigger_dt.strftime("%Y 年 %m 月 %d 日")
    return f"""<div style="font-family:'Microsoft JhengHei','Noto Sans TC',sans-serif;font-size:14px;color:#1e293b;line-height:1.9;max-width:700px">
<p>各位好，</p>
<p>中央氣象署已於 <strong>{date_str}</strong> 對 <strong>{area_str}</strong>
發布<span style="color:#dc2626;font-weight:700">【{typhoon_name} 陸上颱風警報】</span>。</p>
<p>請依附件「<strong>災前及災後檢核表</strong>」逐項確認，並於颱風過後將填寫結果回傳職安室存查，謝謝配合。</p>
<hr style="border:none;border-top:2px solid #e2e8f0;margin:22px 0">
<table style="border-collapse:collapse;width:100%;font-size:13px;color:#334155">
  <tr style="background:#f1f5f9">
    <td style="padding:10px 14px;font-weight:700;width:130px;border:1px solid #e2e8f0">附件檔案</td>
    <td style="padding:10px 14px;border:1px solid #e2e8f0">災前及災後檢核表.doc</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;font-weight:700;border:1px solid #e2e8f0">提醒事項</td>
    <td style="padding:10px 14px;border:1px solid #e2e8f0">請於颱風警報解除後 <strong>3 個工作日</strong>內完成回傳</td>
  </tr>
  <tr style="background:#f1f5f9">
    <td style="padding:10px 14px;font-weight:700;border:1px solid #e2e8f0">聯絡窗口</td>
    <td style="padding:10px 14px;border:1px solid #e2e8f0">人力資源部 賴佑毓（職安管理師）</td>
  </tr>
</table>
<hr style="border:none;border-top:2px solid #e2e8f0;margin:22px 0">
<p>如有任何疑問，歡迎與職安室聯繫。</p>
<p style="margin-top:20px">
  賴佑毓<br>
  <span style="font-size:12px;color:#64748b">人力資源部 職業安全衛生管理師</span>
</p>
<p style="font-size:11px;color:#94a3b8;margin-top:16px">
  本郵件由 OHS Portal 颱風警報自動派送系統產生 · {trigger_dt.strftime('%Y-%m-%d %H:%M')}
</p>
</div>"""


# ── Outlook COM 草稿 ──────────────────────────────────────────────────────────
def create_outlook_draft(
    typhoon_name: str,
    trigger_dt: datetime,
    matched_areas: list,
    attachment_path: str,
):
    try:
        import win32com.client
    except ImportError:
        print("[ERROR] 缺少 pywin32，請執行：pip install pywin32", file=sys.stderr)
        sys.exit(1)

    area_str  = "、".join(matched_areas) if matched_areas else "台中市／彰化縣"
    subject   = f"【颱風警報】{typhoon_name} 陸上警報 — {area_str} 災前及災後檢核表派送"
    html_body = build_email_html(typhoon_name, trigger_dt, matched_areas)

    try:
        outlook = win32com.client.Dispatch("Outlook.Application")
        mail    = outlook.CreateItem(0)
        mail.To = MAIL_TO
        mail.CC = MAIL_CC
        mail.Subject  = subject
        mail.HTMLBody = html_body
        mail.Attachments.Add(attachment_path)
        mail.Save()
        mail.Display(False)
        print(f"[OK] Outlook 草稿已開啟，請確認收件人與附件後按「發送」")
        print(f"     主旨：{subject}")
        print(f"     收件：{MAIL_TO}")
        print(f"     副本：{MAIL_CC}")
        print(f"     附件：{attachment_path}")
    except Exception as e:
        print(f"[ERROR] Outlook 草稿建立失敗：{e}", file=sys.stderr)
        sys.exit(1)


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    test_mode  = "--test"  in sys.argv
    force_mode = "--force" in sys.argv
    now_tw     = datetime.now(TW)

    print(f"[INFO] {now_tw.strftime('%Y-%m-%d %H:%M:%S')} 開始檢查颱風警報...")
    has_warning, typhoon_name, matched_areas = check_land_warning()

    if test_mode:
        print(f"\n[TEST] ── API 解析結果 ──────────────────")
        print(f"[TEST] has_warning   = {has_warning}")
        print(f"[TEST] typhoon_name  = {typhoon_name!r}")
        print(f"[TEST] matched_areas = {matched_areas}")
        print(f"\n[TEST] ── 原始 API 回應（前 3000 字）── ")
        try:
            req = urllib.request.Request(
                CWA_API,
                headers={"User-Agent": "OHS-Portal-TyphoonDispatch/1.0"}
            )
            with urllib.request.urlopen(req, timeout=15, context=_SSL_CTX) as resp:
                raw = resp.read().decode("utf-8")
            print(raw[:3000])
            if len(raw) > 3000:
                print(f"... （共 {len(raw)} 字，已截斷）")
        except Exception as e:
            print(f"[TEST] 無法取得原始回應：{e}")
        return

    if not has_warning:
        if not force_mode:
            print("[INFO] 目前無台中市／彰化縣陸上颱風警報，無需派送")
            return
        # --force 模式：以模擬資料建立草稿
        print("[FORCE] 目前無警報，以模擬資料建立測試草稿")
        typhoon_name  = "測試颱風"
        matched_areas = ["台中市", "彰化縣"]
    elif not force_mode and already_dispatched(typhoon_name):
        print(f"[INFO] {typhoon_name} 今日已派送，略過（使用 --force 可強制重送）")
        return

    print(f"[INFO] 偵測到陸上警報：{typhoon_name}，影響地區：{matched_areas}")

    try:
        attachment_path = get_attachment_path()
        print(f"[INFO] 附件路徑：{attachment_path}")
    except FileNotFoundError as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)

    create_outlook_draft(typhoon_name, now_tw, matched_areas, attachment_path)
    mark_dispatched(typhoon_name)


if __name__ == "__main__":
    main()
