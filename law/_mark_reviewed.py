"""
顯示所有「有更新」的法規，讓使用者選擇要標記為已鑑別的項目。
已鑑別 = 將 amend 更新為 live_amend（代表已依最新版本完成鑑別確認）。

執行流程：
  1. python _fetch_law_dates.py   ← 取得法規庫最新修正日期
  2. python _mark_reviewed.py     ← 選擇已鑑別的法規，更新 amend
  3. python build.py              ← 重新建置 index.html
  4. git push                     ← 發佈
"""
import json, sys, re
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

JSON_FILE = Path(r'C:\Users\gloom.lai\OHS-Portal\law\law-data.json')


def norm_date(roc: str | None) -> str | None:
    """民國 XXX 年 XX 月 XX 日 → YYYY-MM-DD，已是 YYYY-MM-DD 則直接回傳。"""
    if not roc:
        return None
    if re.match(r'\d{4}-\d{2}-\d{2}', str(roc)):
        return str(roc)[:10]
    m = re.search(r'(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日', str(roc))
    if not m:
        return roc
    return f"{int(m.group(1)) + 1911}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"


data = json.loads(JSON_FILE.read_text(encoding='utf-8'))

# 收集所有「有更新」法規，依 pcode 去重
pcode_to_entries: dict[str, list[tuple[dict, dict]]] = {}

for site in data:
    for entry in site.get('summary', []):
        url = entry.get('url', '')
        live = entry.get('live_amend')
        amend = entry.get('amend')
        if not live or not url:
            continue
        m = re.search(r'[?&]pcode=([A-Z0-9]+)', url, re.I)
        pcode = m.group(1) if m else url
        live_iso  = norm_date(live)
        amend_iso = norm_date(amend)
        # 只列出「法規庫更新日期比系統記錄更新」的情況
        if live_iso and live_iso > (amend_iso or ''):
            pcode_to_entries.setdefault(pcode, []).append((site, entry))

if not pcode_to_entries:
    print('[OK] 所有法規均為最新版本，無需訂正。')
    sys.exit(0)

# 顯示清單
items = list(pcode_to_entries.items())
print(f'發現 {len(items)} 部法規有更新：\n')
for i, (pcode, entries) in enumerate(items, 1):
    first_entry = entries[0][1]
    name     = first_entry.get('name', pcode)
    old_date = norm_date(first_entry.get('amend')) or '（無記錄）'
    new_date = norm_date(first_entry.get('live_amend')) or '—'
    sites    = '、'.join(f"{s['site_id']}/{s.get('sub', '')}" for s, _ in entries)
    print(f"  [{i:2d}] {name}")
    print(f"       系統版本：{old_date}  →  法規庫最新：{new_date}")
    print(f"       套用站點：{sites}")
    print()

print('請輸入要標記為已鑑別的編號（空格分隔），輸入 a 全選，直接 Enter 取消：')
raw = input('> ').strip()

if not raw:
    print('已取消，law-data.json 未變更。')
    sys.exit(0)

if raw.lower() == 'a':
    selected_indices = list(range(len(items)))
else:
    selected_indices = []
    for token in raw.split():
        try:
            idx = int(token) - 1
            if 0 <= idx < len(items):
                selected_indices.append(idx)
            else:
                print(f'  [WARN] 忽略無效編號：{token}')
        except ValueError:
            print(f'  [WARN] 忽略無效輸入：{token}')

if not selected_indices:
    print('未選擇任何項目，已取消。')
    sys.exit(0)

# 執行更新
print()
total_updated = 0
for idx in selected_indices:
    pcode, entries = items[idx]
    name     = entries[0][1].get('name', pcode)
    new_date = entries[0][1].get('live_amend', '')
    for site, entry in entries:
        entry['amend'] = new_date
    total_updated += len(entries)
    print(f"  [已鑑別] {name}  →  {norm_date(new_date)}  （{len(entries)} 個站點）")

JSON_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\n[OK] 共更新 {total_updated} 筆，已寫回 law-data.json')
print('[下一步] 執行 python build.py 重新建置，再 git push 發佈')
