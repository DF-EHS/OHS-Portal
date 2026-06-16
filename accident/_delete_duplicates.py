import sys, json, requests
sys.stdout.reconfigure(encoding="utf-8")

API_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbwstSNYmWUBGmG4YykTVigF_eQ9eaw6TWC3_x6ToTNWIpWOmHTlvVpoJJtt6wS6X3I0yA/exec"
)

# 要刪除的重複筆（只刪多出來的那一份，保留第一筆）
# 這 3 筆在 Sheets 是第 171, 172, 173 列，也就是清單的 [170], [171], [172]
KEYS_TO_DELETE = [
    {"date": "2026-05-06", "empId": "4139"},   # 張秀妃（重複）
    {"date": "2026-05-13", "empId": "3897"},   # 蘇密（重複）
    {"date": "2026-05-22", "empId": "3973"},   # 魏嘉葦（重複）
]

# Apps Script 的 deleteByKeys 只刪符合的列，但會全部匹配都刪
# 為安全起見，先確認目前有幾筆這些 key
r = requests.get(API_URL, allow_redirects=True, timeout=20)
accidents = r.json().get("accidents", [])
print(f"刪除前：共 {len(accidents)} 筆")

for k in KEYS_TO_DELETE:
    matches = [a for a in accidents if a.get("date") == k["date"] and a.get("empId") == k["empId"]]
    print(f"  {k['date']} empId={k['empId']}: {len(matches)} 筆 → 刪除後應剩 1 筆")
    if len(matches) < 2:
        print("    (不需刪除)")
        KEYS_TO_DELETE = [x for x in KEYS_TO_DELETE if not (x["date"]==k["date"] and x["empId"]==k["empId"])]

print(f"\n準備呼叫 deleteByKeys，送出 {len(KEYS_TO_DELETE)} 組 key…")
payload = json.dumps({"action": "deleteByKeys", "keys": KEYS_TO_DELETE}, ensure_ascii=False)
r2 = requests.post(API_URL, data=payload.encode("utf-8"),
                   headers={"Content-Type": "text/plain"},
                   allow_redirects=True, timeout=30)
print("回應:", r2.text)
