"""
從全國法規資料庫取得每部法規的最新修正日期，寫回 law-data.json。
執行：python _fetch_law_dates.py
建議每季季度盤點前執行一次，再執行 build.py。
"""
import json, re, time, sys, ssl
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError
from datetime import date

sys.stdout.reconfigure(encoding='utf-8')

# law.moj.gov.tw 憑證缺少 Subject Key Identifier，Python SSL 驗證失敗
# 這是讀取公開政府資料，停用驗證是安全的
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE

JSON_FILE = Path(r'C:\Users\gloom.lai\OHS-Portal\law\law-data.json')
DELAY = 0.8  # seconds between requests to avoid overloading the server


def fetch_amend_date(url: str) -> str | None:
    try:
        req = Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; OHS-Audit/1.0)'})
        with urlopen(req, timeout=20, context=_CTX) as resp:
            html = resp.read().decode('utf-8')
        # HTML structure: <th>修正日期：</th>\n\t<td>民國 114 年 12 月 19 日 </td>
        m = re.search(r'修正日期[：:][\s\S]*?<td[^>]*>\s*(民國[^<]+)', html)
        if m:
            return m.group(1).strip()
        return None
    except Exception as e:
        print(f'    [WARN] {type(e).__name__}: {e}')
        return None


data = json.loads(JSON_FILE.read_text(encoding='utf-8'))
today = date.today().isoformat()
pcode_cache: dict[str, str | None] = {}
total_updated = 0

for site in data:
    site_label = f"{site['site_id']}/{site.get('sub', '')}"
    laws_with_url = [e for e in site.get('summary', []) if e.get('url')]
    if not laws_with_url:
        continue
    print(f'\n=== {site_label} ({len(laws_with_url)} 部法規) ===')

    updated = 0
    for entry in laws_with_url:
        url = entry['url']
        m = re.search(r'[?&]pcode=([A-Z0-9]+)', url, re.I)
        pcode = m.group(1) if m else url
        name = (entry.get('name') or str(entry.get('id', '')))[:30]

        if pcode not in pcode_cache:
            print(f'  {name}… ', end='', flush=True)
            live = fetch_amend_date(url)
            pcode_cache[pcode] = live
            print(live or '取得失敗')
            time.sleep(DELAY)
        else:
            live = pcode_cache[pcode]
            print(f'  {name} [已快取] → {live or "無資料"}')

        if live:
            entry['live_amend'] = live
            updated += 1
        else:
            entry.pop('live_amend', None)

    site['live_amend_checked'] = today
    total_updated += updated
    print(f'  [{site_label}] 成功更新 {updated}/{len(laws_with_url)} 筆')

JSON_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\n[OK] 共更新 {total_updated} 筆，live_amend_checked = {today}')
print('[下一步] 執行 python build.py 重新建置 index.html')
