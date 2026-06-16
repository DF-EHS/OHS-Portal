import sys, requests
from collections import defaultdict
sys.stdout.reconfigure(encoding="utf-8")

API_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbwstSNYmWUBGmG4YykTVigF_eQ9eaw6TWC3_x6ToTNWIpWOmHTlvVpoJJtt6wS6X3I0yA/exec"
)

r = requests.get(API_URL, allow_redirects=True, timeout=20)
data = r.json()
accidents = data.get("accidents", [])
print(f"Google Sheets 共 {len(accidents)} 筆\n")

for i, a in enumerate(accidents, 1):
    print(f"  [{i:02d}] {a.get('date','')}  {a.get('name',''):<6}  {a.get('type',''):<15}  empId={a.get('empId','')}")

print("\n--- 重複檢查 (date + empId) ---")
groups = defaultdict(list)
for i, a in enumerate(accidents, 1):
    key = (a.get("date",""), a.get("empId",""))
    groups[key].append(i)

found = False
for key, idxs in groups.items():
    if len(idxs) > 1:
        found = True
        print(f"  重複 date={key[0]} empId={key[1]}  出現在第 {idxs} 筆")
if not found:
    print("  無重複")
