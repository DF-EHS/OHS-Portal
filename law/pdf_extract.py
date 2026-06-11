# -*- coding: utf-8 -*-
"""
pdf_extract.py — 將法規 PDF 批次轉為 TXT，供季度更新 Agent 使用
用法：
  python law/pdf_extract.py law/sources/2026-Q3/
  python law/pdf_extract.py law/sources/2026-Q3/職業安全衛生法.pdf
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")


def extract_pdf(pdf_path: Path) -> str:
    import pdfplumber

    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=2, y_tolerance=3)
            if text:
                pages.append(text.strip())
    return "\n".join(pages)


def process_path(target: Path):
    if target.is_dir():
        pdfs = sorted(target.glob("*.pdf"))
        if not pdfs:
            print(f"[INFO] {target} 內無 PDF 檔案，略過。")
            return
        for p in pdfs:
            _convert(p)
    elif target.suffix.lower() == ".pdf" and target.is_file():
        _convert(target)
    else:
        print(f"[ERROR] 找不到目標：{target}")
        sys.exit(1)


def _convert(pdf_path: Path):
    txt_path = pdf_path.with_suffix(".txt")
    if txt_path.exists():
        print(f"[SKIP] {txt_path.name} 已存在")
        return

    print(f"[EXTRACT] {pdf_path.name} ...", end=" ", flush=True)
    try:
        text = extract_pdf(pdf_path)
    except Exception as e:
        print(f"\n[ERROR] {pdf_path.name}：{e}")
        return

    if not text.strip():
        print(f"\n[WARN] {pdf_path.name} 無法提取文字（可能是掃描版 PDF）")
        return

    txt_path.write_text(text, encoding="utf-8")
    kb = txt_path.stat().st_size / 1024
    print(f"OK（{kb:.0f} KB）→ {txt_path.name}")


def main():
    if len(sys.argv) < 2:
        print("用法：python law/pdf_extract.py <資料夾或 PDF 路徑>")
        sys.exit(1)
    process_path(Path(sys.argv[1]))


if __name__ == "__main__":
    main()
