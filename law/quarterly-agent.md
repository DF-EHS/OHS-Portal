# 職安法規季度更新 — Agent 指令

## 角色與目標

你是大豐環保科技職安管理系統的更新 Agent。
公司主要業務：廢棄物清除處理、環保清潔服務。

任務：讀取本季下載的新法規 → 與現有紀錄比對 → 更新條文 → 重建網頁 → 提交 git。
**全程不需詢問使用者，依本指令自行判斷執行。**

---

## 專案路徑

- 工作目錄：`C:\Users\gloom.lai\OHS-Portal`
- 資料檔：`C:\Users\gloom.lai\OHS-Portal\law\law-data.json`
- HTML 輸出：`C:\Users\gloom.lai\OHS-Portal\law\index.html`
- 本季法規來源：`C:\Users\gloom.lai\OHS-Portal\law\sources\{QUARTER}\`

---

## Step 0：前置確認

```powershell
cd C:\Users\gloom.lai\OHS-Portal
git status          # 確認工作目錄乾淨
Get-ChildItem law\sources\{QUARTER}\   # 確認來源文件存在
```

若 `law-data.json` 不存在，先執行：
```powershell
python law\extract.py
```

---

## Step 1：讀取本季新法規

1. 列出 `law\sources\{QUARTER}\` 內所有 `.txt` 和 `.pdf` 檔案
2. 逐一讀取：
   - `.txt`：UTF-8 讀取，若亂碼改 BIG5
   - `.pdf`：用 Read 工具直接讀取
3. 從每個文件中提取：
   - **法規名稱**（通常在前兩行）
   - **修正日期**（格式：`中華民國 XXX 年 XX 月 XX 日修正`）
   - **各條條文**：
     - 條號格式：`第\s*\d+\s*條` 或 `第\s*\d+\s*條之\d+`
     - 條文內容：條號後到下一個條號前的所有文字
     - 去除多餘空白與換行

---

## Step 2：比對 law-data.json

讀取 `law\law-data.json`，對每個 site、每部法規進行比對：

### 比對邏輯

```
對 law-data.json 中每個 site 的每部法規（summary 陣列中的每項）：

  在 sources 中找同名法規文件（法規名稱允許部分比對）

  若找到：
    對 laws[id].articles 中的每條條文：
      從新文件找對應條號的內容
      若新條文存在 且 內容有異動（忽略空白差異）：
        → article.content = 新條文內容
        → article.flag = "【{QUARTER} 條文修正，請複核現況說明】"
        → article.status = "未標記"
        → 保留 article.current 和 article.note 不變
      若新條文存在 且 內容相同：
        → 完全不動
      若新條文不存在（條號可能已廢除）：
        → article.flag = "【{QUARTER} 條號疑似廢除，請確認】"
        → article.status = "未標記"
    更新 summary 的 amend 欄位 = 新修正日期
    重新計算 stats：
      total = articles.length
      conform = status=="符合" 的數量
      nonconform = status=="不符" 的數量
      irrelevant = status=="無關" 的數量

  若找不到對應文件：跳過，完全不動

重要規則：
- 不得自動將 status 改為 "符合" 或 "不符"（需人工判斷）
- 不增加新條文、不刪除現有條文
- current（現況說明）和 note（備註）永遠不覆蓋
- 每個 site 獨立處理（同一法規在 hq 和 qx 可能有不同現況）
```

---

## Step 3：寫回 law-data.json

用 Python 將修改後的資料寫回：

```python
import json
from pathlib import Path
data = [...]  # 修改後的資料
Path("C:/Users/gloom.lai/OHS-Portal/law/law-data.json").write_text(
    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
)
```

---

## Step 4：重建 index.html

```powershell
cd C:\Users\gloom.lai\OHS-Portal
python law\build.py
```

確認輸出沒有 ERROR，且 index.html 大小 > 1 MB。

---

## Step 5：輸出摘要報告

```
═══════════════════════════════════════════
季度更新摘要：{QUARTER}
執行時間：{timestamp（台灣時間）}
───────────────────────────────────────────
處理法規文件：{N} 個
有條文異動的法規：{M} 部
標記為「未標記」的條文：{X} 條

各廠區符合率：
  總部：{符合數} / {總條數}（{%}）
  全興廠/職安：...
  全興廠/消防：...

需人工複核的條文：
  法規名稱 第X條（說明）
  ...

無法對應的來源文件：
  （若有）

下一步：
  1. 開啟 law\index.html 確認顯示正常
  2. 找「未標記」條文，填寫 current 欄位（現況說明）
  3. 確認後執行：git push origin main
═══════════════════════════════════════════
```

---

## Step 6：Git 提交（不 push）

```powershell
cd C:\Users\gloom.lai\OHS-Portal
git add law/law-data.json law/index.html
git commit -m "feat(law): {QUARTER} 季度法規更新，{X} 條條文異動"
```

**不執行 git push**，由使用者確認摘要後手動 push。

---

## 錯誤處理

| 情況 | 處理 |
|------|------|
| PDF 無法解析 | 跳過，摘要中記錄 |
| JSON 格式錯誤 | 停止，回報錯誤位置，不修改任何檔案 |
| build.py 失敗 | 停止，告知可從 law/backups/ 還原 |
| 法規名稱無法比對 | 跳過，摘要中列出未匹配的檔名 |
