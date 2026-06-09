# 大豐環保科技 — 職業安全衛生入口網站 (OHS Portal)

大豐環保科技股份有限公司內部職安衛管理平台，整合承攬商管理、AI 風險評估、法規查詢、情報追蹤等功能，部署於 GitHub Pages。

---

## 功能模組

| 模組 | 說明 |
|------|------|
| 🏠 系統入口 | 各功能頁面統一入口，含公告欄 |
| 📄 承攬商安全衛生協議書 | 線上填寫並列印承攬商協議書，支援多工作區域 |
| ⚠️ AI 風險評估 | 上傳現場照片，由 Gemini AI 辨識危害並給出改善建議 |
| ⚖️ 法規問答機器人 | 整合公司法規鑑別資料庫＋Gemini AI 知識，回答台灣職安法規問題 |
| 📰 職災情報與安衛動態 | 自動彙整職安署公告、重大職災新聞、法規動態；每週一 AI 自動產生職安週報 |
| 📋 職安衛委員會 | 歷次委員會會議記錄與附件 |
| 🎓 教育訓練 | 教育訓練教材線上瀏覽 |

---

## 各頁面連結

| 頁面 | 網址 |
|------|------|
| 系統入口 | https://df-ehs.github.io/OHS-Portal/ |
| 承攬商協議書 | https://df-ehs.github.io/OHS-Portal/contract/ |
| AI 風險評估 | https://df-ehs.github.io/OHS-Portal/risk/ |
| 法規問答機器人 | https://df-ehs.github.io/OHS-Portal/law/ |
| 職災情報與安衛動態 | https://df-ehs.github.io/OHS-Portal/news/ |
| 職安衛委員會 | https://df-ehs.github.io/OHS-Portal/committee/ |

---

## 部署與維護

### 系統架構

```
GitHub Pages (靜態前端)
    │
    ├─ 法規/風險 AI 查詢 ──→ Cloudflare Worker (CORS Proxy)
    │                              │
    │                              └──→ 公司 IT API Gateway (Gemini 2.5 Flash)
    │
    └─ 新聞自動更新 ──→ GitHub Actions (每日排程)
                              │
                              └──→ news/fetch_news.py → news/index.html
```

### Cloudflare Worker

- **Worker 名稱**：`ohs-law-chatbot`
- **帳號**：`df.hr.openai@df-recycle.com`
- **網址**：`https://ohs-law-chatbot.df-hr-openai.workers.dev`
- **用途**：解決瀏覽器 CORS 限制，轉發 AI 請求至公司 IT API Gateway
- **原始碼**：`workers/law-chatbot.js`
- **部署指令**：
  ```bash
  npx wrangler deploy workers/law-chatbot.js --name ohs-law-chatbot
  ```
- **修改後需重新部署**：Worker 不會因 GitHub push 自動更新，須手動執行上方指令

### GitHub Actions — 新聞自動更新

- **設定檔**：`.github/workflows/news-update.yml`
- **觸發條件**：
  - 每日 UTC 01:00（台灣時間 09:00）自動執行
  - 手動觸發（Actions → Run workflow）
  - push `news/fetch_news.py` 時自動觸發
- **執行內容**：
  1. 執行 `news/fetch_news.py`，抓取職安署 RSS 與 Google News
  2. 更新 `news/cache.json`（14 天資料）
  3. 重新產生 `news/index.html`
  4. 自動 commit & push（`[skip ci]` 標記，不再觸發 workflow）
- **手動新增新聞來源**：編輯 `news/fetch_news.py` 中的 `RSS_SOURCES` 清單

### Windows 工作排程器 — 職安週報自動寄信

- **任務名稱**：`OHS-Portal-WeeklyReport`
- **執行時間**：每週一 09:00
- **腳本**：`send_weekly_report.py`
- **流程**：讀取 `news/cache.json` 上週資料 → 呼叫 AI 產生週報 → 開啟 Outlook 草稿供確認後手動發送
- **收件者**：`gloom.lai@df-recycle.com`
- **重新註冊排程**（若任務消失）：
  ```powershell
  schtasks /create /tn "OHS-Portal-WeeklyReport" /tr "C:\Python314\python.exe \"C:\Users\gloom.lai\OHS-Portal\send_weekly_report.py\"" /sc WEEKLY /d MON /st 09:00 /f
  ```

### IT API Gateway

- **Endpoint**：`https://df-it-openrouter-dispatch-api.it.zerozero.tw/api/v1/model/chat`
- **使用模型**：`google/gemini-2.5-flash`
- **認證金鑰**：儲存於 Cloudflare Worker 環境變數，不存放於 GitHub
- **功能開通**：聯繫 IT 部門確認 Vision（圖片辨識）功能已啟用

### 本地開發

```bash
# 複製專案
git clone https://github.com/DF-EHS/OHS-Portal.git
cd OHS-Portal

# 手動觸發新聞更新
python news/fetch_news.py

# 手動觸發週報寄信（dry-run，不實際寄出）
python send_weekly_report.py --dry-run

# 部署 Cloudflare Worker
npx wrangler deploy workers/law-chatbot.js --name ohs-law-chatbot
```

---

## 目錄結構

```
OHS-Portal/
├── index.html              # 系統入口
├── contract/               # 承攬商安全衛生協議書
├── risk/                   # AI 風險評估
├── law/                    # 法規問答機器人
├── news/
│   ├── fetch_news.py       # 新聞抓取與 HTML 產生腳本
│   ├── index.html          # 自動產生，勿手動編輯
│   └── cache.json          # 新聞快取（14 天）
├── committee/              # 職安衛委員會
├── training/               # 教育訓練教材
├── workers/
│   └── law-chatbot.js      # Cloudflare Worker 原始碼
├── send_weekly_report.py   # 職安週報自動寄信腳本
└── .github/workflows/
    └── news-update.yml     # GitHub Actions 排程設定
```

---

*維護人員：賴佑毓 / 人力資源部 / gloom.lai@df-recycle.com*
