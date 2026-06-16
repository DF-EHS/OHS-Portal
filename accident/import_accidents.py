"""
import_accidents.py — 將公司工傷事故 Excel 匯入 OHS Portal 職業災害分析系統

用法：
    python import_accidents.py                          # 自動抓最新 Excel
    python import_accidents.py path/to/Workbook.xlsx   # 指定檔案
    python import_accidents.py --dry-run               # 預覽，不實際寫入

需求：
    pip install pandas openpyxl requests
"""

import sys
import json
import re
from pathlib import Path

try:
    import pandas as pd
    import requests
except ImportError:
    print("請先安裝：pip install pandas openpyxl requests")
    sys.exit(1)

# ── 設定 ────────────────────────────────────────────────────────────────
API_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbwstSNYmWUBGmG4YykTVigF_eQ9eaw6TWC3_x6ToTNWIpWOmHTlvVpoJJtt6wS6X3I0yA/exec"
)

# Excel 所在預設資料夾（自動抓最新 .xlsx）
DEFAULT_FOLDER = Path(r"C:\Users\gloom.lai\Documents\職安\職業災害分析")

# 用來判斷重複的主鍵欄位（發生日期 + 員工工號）
DEDUP_KEYS = ("發生日期", "員工工號")
# ────────────────────────────────────────────────────────────────────────


def normalize_empid(v: str) -> str:
    """去除工號前導零，統一比對格式。04139 → 4139"""
    s = str(v).strip()
    return str(int(s)) if s.isdigit() else s


def normalize_date(v: str) -> str:
    """將各種日期格式統一為 YYYY-MM-DD；無法解析時原樣回傳。"""
    s = str(v).strip()
    digits = re.sub(r"[^0-9]", "", s)
    if len(digits) == 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:]}"
    # 已是 YYYY-MM-DD 格式
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    return s


def load_excel(path: Path) -> list[dict]:
    df = pd.read_excel(path, dtype=str).fillna("")
    for col in ["發生日期", "改善完成日期"]:
        if col in df.columns:
            df[col] = df[col].apply(normalize_date)
    return df.to_dict(orient="records")


def fetch_existing() -> set[tuple]:
    """從 Apps Script 取得現有記錄的主鍵集合，用於去重。"""
    try:
        r = requests.get(API_URL, allow_redirects=True, timeout=20)
        data = r.json()
        existing = set()
        for acc in data.get("accidents", []):
            key = (acc.get("date", ""), normalize_empid(acc.get("empId", "")))
            existing.add(key)
        return existing
    except Exception as e:
        print(f"  [警告] 無法取得現有資料進行去重（{e}），將直接全部新增")
        return set()


def record_key(row: dict) -> tuple:
    return (row.get("發生日期", ""), normalize_empid(row.get("員工工號", "")))


def post_rows(rows: list[dict]) -> dict:
    payload = json.dumps({"action": "append", "rows": rows}, ensure_ascii=False)
    r = requests.post(
        API_URL,
        data=payload.encode("utf-8"),
        headers={"Content-Type": "text/plain"},
        allow_redirects=True,
        timeout=30,
    )
    return r.json()


def main():
    dry_run = "--dry-run" in sys.argv
    auto_yes = "--yes" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    # 決定 Excel 路徑
    if args:
        xlsx_path = Path(args[0])
    else:
        files = sorted(DEFAULT_FOLDER.glob("*.xlsx"), key=lambda f: f.stat().st_mtime, reverse=True)
        if not files:
            print(f"找不到 Excel 檔案，請確認資料夾：{DEFAULT_FOLDER}")
            sys.exit(1)
        xlsx_path = files[0]

    if not xlsx_path.exists():
        print(f"檔案不存在：{xlsx_path}")
        sys.exit(1)

    print(f"📂  讀取：{xlsx_path.name}")
    rows = load_excel(xlsx_path)
    print(f"    共 {len(rows)} 筆")

    # 去重
    print("🔍  取得系統現有資料…")
    existing_keys = fetch_existing()
    new_rows = [r for r in rows if record_key(r) not in existing_keys]
    skip_rows = [r for r in rows if record_key(r) in existing_keys]

    if skip_rows:
        print(f"    已存在（略過） {len(skip_rows)} 筆：")
        for r in skip_rows:
            print(f"      • {r.get('發生日期','')}  {r.get('員工姓名','')}  {r.get('事故類型','')}")

    if not new_rows:
        print("✅  無新資料需要新增，系統已是最新狀態。")
        return

    print(f"\n📋  待新增 {len(new_rows)} 筆：")
    for r in new_rows:
        print(f"  • {r.get('發生日期','')}  {r.get('員工姓名','')}  {r.get('事故類型','')}  [{r.get('事發地點','')}]")

    if dry_run:
        print("\n[dry-run] 預覽完畢，未實際寫入。")
        return

    if auto_yes:
        print(f"\n[--yes] 自動確認，新增 {len(new_rows)} 筆…")
    else:
        confirm = input(f"\n確定要新增以上 {len(new_rows)} 筆到 Google Sheets？(y/N) ").strip().lower()
        if confirm != "y":
            print("已取消")
            return

    print("⬆️   上傳中…")
    result = post_rows(new_rows)

    if "added" in result:
        print(f"✅  成功新增 {result['added']} 筆！")
        print("    請重新整理 https://df-ehs.github.io/OHS-Portal/accident/ 確認資料")
    elif "error" in result:
        print(f"❌  錯誤：{result['error']}")
    else:
        print(f"    回應：{result}")


if __name__ == "__main__":
    main()
