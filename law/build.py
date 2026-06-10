# -*- coding: utf-8 -*-
"""
build.py — 將 law-data.json 注入 law/index.html（替換 ALL_DATA）
用法：python law/build.py
不碰 chatbot、CSS、其他 JS，只替換資料區塊。
"""
import json, sys, shutil
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

LAW_DIR    = Path(__file__).parent
HTML_FILE  = LAW_DIR / "index.html"
JSON_FILE  = LAW_DIR / "law-data.json"
BACKUP_DIR = LAW_DIR / "backups"

MARKER = "const ALL_DATA = "

def main():
    if not JSON_FILE.exists():
        sys.exit(f"[ERROR] 找不到 {JSON_FILE}，請先執行 extract.py")
    if not HTML_FILE.exists():
        sys.exit(f"[ERROR] 找不到 {HTML_FILE}")

    print(f"[1] 讀取 {JSON_FILE} ...")
    data = json.loads(JSON_FILE.read_text(encoding="utf-8"))
    print(f"    → {len(data)} 個 site 物件")

    print(f"[2] 讀取 {HTML_FILE} ...")
    content = HTML_FILE.read_text(encoding="utf-8")

    idx = content.find(MARKER)
    if idx < 0:
        sys.exit("[ERROR] 找不到 ALL_DATA 起始標記")

    array_start = content.find("[", idx)
    depth = 0
    array_end = array_start
    for i, c in enumerate(content[array_start:]):
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                array_end = array_start + i + 1
                break

    # 跳過緊接的分號
    tail_start = array_end
    if content[tail_start:tail_start + 1] == ";":
        tail_start += 1

    # 備份
    BACKUP_DIR.mkdir(exist_ok=True)
    tz8 = timezone(timedelta(hours=8))
    ts  = datetime.now(tz8).strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"index_{ts}.html"
    shutil.copy2(HTML_FILE, backup_path)
    print(f"[3] 備份至 backups/{backup_path.name}")

    print("[4] 序列化並寫回 ...")
    new_json    = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    new_content = content[:array_start] + new_json + ";" + content[tail_start:]

    HTML_FILE.write_text(new_content, encoding="utf-8")
    size_mb = HTML_FILE.stat().st_size / 1024 / 1024
    print(f"[OK] 完成，index.html 大小 {size_mb:.2f} MB")

    for s in data:
        sub_label = f"/{s['sub']}" if s.get("sub") else ""
        total_arts = sum(
            len(v.get("articles", []))
            for v in s.get("laws", {}).values()
        )
        conform = sum(
            1 for v in s.get("laws", {}).values()
            for a in v.get("articles", [])
            if a.get("status") == "符合"
        )
        print(f"    {s['site_id']}{sub_label}: {total_arts} 條，{conform} 條符合")

if __name__ == "__main__":
    main()
