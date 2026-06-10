# -*- coding: utf-8 -*-
"""
extract.py — 從 law/index.html 的 ALL_DATA 抽出，存成 law-data.json
用法：python law/extract.py
只需執行一次，之後 law-data.json 成為 source of truth。
"""
import json, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

LAW_DIR   = Path(__file__).parent
HTML_FILE = LAW_DIR / "index.html"
JSON_FILE = LAW_DIR / "law-data.json"

def main():
    print(f"[1] 讀取 {HTML_FILE} ...")
    content = HTML_FILE.read_text(encoding="utf-8")

    MARKER = "const ALL_DATA = "
    idx = content.find(MARKER)
    if idx < 0:
        sys.exit("[ERROR] 找不到 'const ALL_DATA = ' 標記")

    array_start = content.find("[", idx)
    if array_start < 0:
        sys.exit("[ERROR] 找不到 ALL_DATA 陣列起點")

    # 計算括號深度找結尾
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

    json_str = content[array_start:array_end]

    print("[2] 解析 JSON ...")
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        sys.exit(f"[ERROR] JSON 解析失敗：{e}")

    print(f"    → {len(data)} 個 site 物件")
    for s in data:
        law_count = len(s.get("summary", []))
        art_total = sum(
            len(v.get("articles", []))
            for v in s.get("laws", {}).values()
        )
        sub_label = f"/{s['sub']}" if s.get("sub") else ""
        print(f"    {s['site_id']}{sub_label}: {law_count} 部法規，{art_total} 條條文")

    print(f"[3] 寫出 {JSON_FILE} ...")
    JSON_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    size_kb = JSON_FILE.stat().st_size / 1024
    print(f"[OK] 完成，大小 {size_kb:.0f} KB")

if __name__ == "__main__":
    main()
