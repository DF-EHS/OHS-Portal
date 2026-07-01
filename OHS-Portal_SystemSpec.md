# OHS Portal — 系統技術規格文件

**文件編號：** OHS-SPEC-2026-001　　**版次：** 1.0　　**發行日期：** 2026-07-01
**分類：** 內部技術文件　　**維護：** 賴佑毓 / 人力資源部

---

## 1. 系統定位與設計原則

### 1.1 系統定位

OHS Portal 為大豐環保科技股份有限公司之職業安全衛生整合管理平台，依據職業安全衛生法第 23 條規定建置之職安衛管理系統數位化基礎設施。系統採零伺服器（Serverless-first）架構設計，以最低維運成本達成高可用性部署。

### 1.2 核心設計決策

| 決策 | 選型 | 決策理由 |
|------|------|---------|
| 應用程式架構 | Single-Page Application (SPA) | 免除頁面重載、降低頻寬需求、易於離線降級 |
| 靜態網站託管 | GitHub Pages (CDN) | 全球邊緣節點加速、零維運成本、原生 Git 版本控制 |
| 後端運算 | Google Apps Script Web App | 免基礎設施、直接存取 Google Workspace 資料，適合 CRUD 密集型低流量場景 |
| API 代理與 AI 閘道 | Cloudflare Workers (V8 Isolate) | 消除 CORS 限制、金鑰不落地前端、P50 冷啟動 < 5 ms |
| AI 推論 | Gemini 2.5 Flash via IT API Gateway | 統一由 IT 部門管控 API 金鑰與用量，符合企業資安政策 |
| 資料儲存 | Google Sheets (per-system isolated) | 各系統獨立 Spreadsheet，避免單點資料風險；具備原生 GUI 供管理員直接稽核資料 |

### 1.3 非功能性需求

| 指標 | 目標值 | 實現方式 |
|------|--------|---------|
| 可用性 | ≥ 99.9% | GitHub Pages SLA + Cloudflare 全球 Anycast |
| 首次載入時間 | < 2 s（4G 網路） | 靜態資源、無框架依賴、CSS/JS inline |
| 後端 API 延遲 | < 3 s（GAS 冷啟動） | Apps Script 執行器熱機後 P50 ≈ 300 ms |
| AI 推論延遲 | < 30 s（串流回應） | Gemini 2.5 Flash streaming mode，逐 token 回傳 |
| 資料隔離 | 各系統獨立 Spreadsheet | 單一 Sheet 故障不影響其他系統 |

---

## 2. 系統架構

### 2.1 整體架構圖

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  Browser (Chrome/Edge/Safari) — Static SPA, no JS framework     │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
          ┌──────────────┴──────────────┐
          ▼                             ▼
┌─────────────────┐           ┌──────────────────┐
│  GitHub Pages   │           │ Cloudflare Worker │
│  (CDN / Edge)   │           │  ohs-law-chatbot  │
│                 │           │  V8 Isolate       │
│  静態資產        │           │  CORS Proxy       │
│  HTML/CSS/JS    │           │  金鑰注入          │
└────────┬────────┘           └────────┬──────────┘
         │                             │ HTTPS + Bearer Token
         │ HTTPS (fetch)               ▼
         │                   ┌──────────────────────┐
         ▼                   │  IT API Gateway      │
┌─────────────────┐          │  /api/v1/model/chat  │
│ Google Apps     │          │  google/gemini-2.5-  │
│ Script Web App  │          │  flash               │
│ (per-system)    │          └──────────────────────┘
│                 │
│ doGet / doPost  │          ┌──────────────────────┐
│ action routing  │          │  GitHub Actions       │
└────────┬────────┘          │  news-update.yml      │
         │                   │  Cron: 0 1 * * *      │
         ▼                   │  (UTC) = 09:00 TPE    │
┌─────────────────┐          └──────────┬───────────┘
│  Google Sheets  │                     │
│  (per-system    │          ┌──────────▼───────────┐
│   Spreadsheet)  │          │  fetch_news.py        │
└─────────────────┘          │  RSS + Google News    │
                             │  → news/index.html    │
                             │  → git push [skip ci] │
                             └──────────────────────┘
```

### 2.2 前端 SPA 路由模型

所有子系統均採用單檔 HTML 實作多視圖切換，以 `showView(name)` 函式控制 `display` 屬性達到路由效果，避免引入框架依賴：

```javascript
// 典型視圖路由實作（以 contract/ 為例）
function showView(name) {
  if (name !== 'login' && !currentRole) { showView('login'); return; }
  ['login','home','wizard','wizard-hotwork','wizard-special',
   'success','records','rec-detail','eval-overview','vendors']
    .forEach(v => document.getElementById('v-' + v).style.display = 'none');
  document.getElementById('v-' + name).style.display = '';
}
```

URL 參數驅動模式（QR Code 入口）：

```
https://df-ehs.github.io/OHS-Portal/contract/?mode=fill          # 通用掃碼入口
https://df-ehs.github.io/OHS-Portal/contract/?mode=fill&v=VDR-001 # 廠商專屬入口
```

`initFromUrl()` 在 DOMContentLoaded 時執行，偵測 `mode=fill` 後跳過身份驗證流程，直接呈現選單視圖（`v-home`），並非同步查詢廠商名冊預填表單欄位。

### 2.3 共用側邊欄注入機制

`shared/sidebar.js` 以 IIFE 方式動態注入 HTML 至各子頁面 `<body>`，由各頁面設定 `window.OHS_SIDEBAR_BASE` 決定相對路徑前綴，避免重複維護：

```javascript
// 各子頁面宣告方式
window.OHS_SIDEBAR_BASE = '../';   // 一層子目錄
window.OHS_SIDEBAR_BASE = '../../'; // 二層子目錄（如 committee/2026/Q1/）
```

Active 狀態透過 `data-match` 屬性比對 `location.pathname` 自動套用高亮樣式。

---

## 3. 後端 API 規格（Google Apps Script）

### 3.1 通用設計規範

各系統後端均實作 `doGet(e)` / `doPost(e)` 兩個端點，以 `action` 參數進行路由分發。回應格式統一為 `application/json`，Content-Type 由 `ContentService.MimeType.JSON` 強制設定。

**端點呼叫模式：**

| 操作類型 | HTTP 方法 | 參數位置 | 典型 action |
|---------|-----------|---------|------------|
| 讀取清單 | GET | URL query string | `list`, `listEvals`, `listVendors` |
| 讀取單筆 | GET | URL query string | `get`, `getEval` |
| 新增資料 | POST | Request body (JSON) | `submit`, `saveVendor` |
| 更新資料 | POST | Request body (JSON) | `update`, `saveEval` |
| 刪除資料 | POST | Request body (JSON) | `delete`, `delVendor` |

**管理員端點驗證：**

```javascript
if (payload.token !== 'ergo-admin-2025') return _resp({ ok: false, error: 'unauthorized' });
```

Token 以明文傳輸（HTTP body），屬於低安全性設計，適用於內部非敏感資料場景。

### 3.2 承攬商管理系統（contract/）API

**Google Sheets 資料模型：**

```
進場申請（Sheet）
┌─────┬──────────┬──────────┬──────────┬──────────┬──────┬──────┬──────────┬──────────┬──────┬──────────┬────────┬──────────┬──────────┬────────────────────┐
│ C1  │ C2       │ C3       │ C4       │ C5       │ C6   │ C7   │ C8       │ C9       │ C10  │ C11      │ C12    │ C13      │ C14      │ C15                │
│ id  │submitted │company   │contract  │workname  │super │phone │dateStart │dateEnd   │area  │timePeriod│workers │signee    │editedAt  │FullJSON (備援)     │
└─────┴──────────┴──────────┴──────────┴──────────┴──────┴──────┴──────────┴──────────┴──────┴──────────┴────────┴──────────┴──────────┴────────────────────┘

廠商名冊（Sheet）
┌─────────┬──────┬─────────┬──────┬──────┬───────────┐
│ code    │ name │ contact │ phone│ note │ createdAt │
│ VDR-001 │ …    │ …       │ …    │ …    │ ISO 8601  │
└─────────┴──────┴─────────┴──────┴──────┴───────────┘
```

**C15 混合儲存策略：** 第 15 欄儲存完整記錄的 JSON 序列化字串，API 讀取時優先解析 C15，C15 為空時降級為從各欄重建物件，確保向後相容性：

```javascript
function _rowToRecord(row) {
  var jsonStr = row.length >= 15 ? String(row[14] || '') : '';
  if (jsonStr && jsonStr.charAt(0) === '{') {
    try { return JSON.parse(jsonStr); } catch (e) {}
  }
  // 降級重建…
}
```

**廠商代碼自動流水號：**

```javascript
function _nextVendorCode(sheet) {
  var nums = vendors.map(v => parseInt(v.code.replace('VDR-', '')) || 0);
  return 'VDR-' + String(Math.max(...nums) + 1).padStart(3, '0');
  // → 'VDR-001', 'VDR-002', …
}
```

**action 路由表：**

| action | 方法 | 說明 | 回應結構 |
|--------|------|------|---------|
| `list` | GET | 全筆摘要（不含 workers 明細） | `{ success, records[] }` |
| `get` | GET | 單筆完整（含 workers） | `{ success, record }` |
| `submit` | POST | 新增進場申請 | `{ success, id }` |
| `update` | POST | 覆寫單筆（含動火/特殊危害欄位） | `{ success, ok }` |
| `delete` | POST | 刪除列 | `{ success }` |
| `getEval` | GET | 讀取完工評核 JSON | `{ ok, data }` |
| `saveEval` | POST | 寫入完工評核 | `{ ok }` |
| `listVendors` | GET | 廠商名冊清單 | `{ ok, vendors[] }` |
| `saveVendor` | POST | 新增（無 code）/ 更新（有 code） | `{ ok, code? }` |
| `delVendor` | POST | 依 code 刪列 | `{ ok }` |

### 3.3 通用 Sheet 查找輔助函式

所有系統共用 `_findRow(sheet, id)` 模式，透過單欄範圍讀取轉陣列後以 `indexOf` 定位，避免逐列迭代：

```javascript
function _findRow(sheet, id) {
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
                 .getValues().flat().map(String);
  var idx = ids.indexOf(String(id));
  return idx < 0 ? -1 : idx + 2;  // 2-based row number
}
```

時間複雜度：O(n)，n = 列數。GAS 執行時間上限 6 分鐘，實際瓶頸為 `getRange` 網路 I/O，建議單 Sheet 資料量控制在 10,000 列以內。

---

## 4. Cloudflare Worker — AI 代理規格

### 4.1 部署資訊

| 項目 | 值 |
|------|-----|
| Worker 名稱 | `ohs-law-chatbot` |
| Runtime | Cloudflare Workers (V8 Isolate) |
| 帳號 | `df.hr.openai@df-recycle.com` |
| Endpoint | `https://ohs-law-chatbot.df-hr-openai.workers.dev` |
| 原始碼 | `workers/law-chatbot.js` |
| 部署指令 | `npx wrangler deploy workers/law-chatbot.js --name ohs-law-chatbot` |

### 4.2 請求代理流程

```
Client (fetch)
  → POST /  { model, messages, stream?, ... }
    → Worker 攔截
      → 附加 Authorization: Bearer ${env.API_KEY}
      → 轉發至 IT API Gateway /api/v1/model/chat
        → Gemini 2.5 Flash 推論
      → 串流回傳 (text/event-stream) 或一次性回傳 (application/json)
  ← 回傳至 Client
```

**CORS 政策（Worker 回應 Headers）：**

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### 4.3 IT API Gateway 規格

| 項目 | 值 |
|------|-----|
| Base URL | `https://df-it-openrouter-dispatch-api.it.zerozero.tw/api/v1` |
| 推論端點 | `/model/chat` |
| 使用模型 | `google/gemini-2.5-flash` |
| 認證方式 | Bearer Token（儲存於 Worker `env.API_KEY`，不落地 GitHub） |
| 串流支援 | Server-Sent Events (SSE)，`stream: true` |
| Vision 支援 | 需由 IT 部門確認開通（`risk/` AI 圖片辨識功能依賴此項） |

---

## 5. CI/CD 與自動化管線

### 5.1 GitHub Actions — 新聞自動更新

```yaml
# .github/workflows/news-update.yml（摘要）
on:
  schedule:
    - cron: '0 1 * * *'     # UTC 01:00 = 台灣 09:00
  push:
    paths: ['news/fetch_news.py']
  workflow_dispatch:

jobs:
  update-news:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install requests beautifulsoup4
      - run: python news/fetch_news.py
      - run: |
          git config user.email "github-actions@github.com"
          git commit -am "auto: update news [skip ci]"
          git push
```

`[skip ci]` 標記防止推送觸發循環執行。`fetch_news.py` 採用 14 天滾動快取（`cache.json`），避免重複處理相同新聞項目。

### 5.2 Windows 工作排程器 — 職安週報

| 項目 | 值 |
|------|-----|
| 任務名稱 | `OHS-Portal-WeeklyReport` |
| 觸發條件 | 每週一 09:00 |
| 執行程式 | `C:\Python314\python.exe` |
| 腳本路徑 | `C:\Users\gloom.lai\OHS-Portal\send_weekly_report.py` |
| 執行流程 | 讀取 `news/cache.json` → 呼叫 Gemini 2.5 Flash 生成週報 → 以 `win32com.client` 呼叫 Outlook COM 介面建立草稿 → 等候人工審核後手動發送 |

**重新註冊指令（排程遺失時）：**

```powershell
schtasks /create /tn "OHS-Portal-WeeklyReport" `
  /tr "C:\Python314\python.exe ""C:\Users\gloom.lai\OHS-Portal\send_weekly_report.py""" `
  /sc WEEKLY /d MON /st 09:00 /f
```

### 5.3 季度法規合規自動稽核（Remote Agent）

透過 Claude Code Remote Trigger 建立四組季度 Cron Routine，於每季首日觸發遠端 Agent 執行法規鑑別資料庫比對任務：

| 季度 | Cron（UTC） | 台灣時間 |
|------|------------|---------|
| Q1 | `0 1 1 3 *` | 3月1日 09:00 |
| Q2 | `0 1 1 6 *` | 6月1日 09:00 |
| Q3 | `0 1 1 9 *` | 9月1日 09:00 |
| Q4 | `0 1 1 12 *` | 12月1日 09:00 |

---

## 6. 系統模組技術摘要

### 6.1 模組清單與後端配置

| 模組 | 路徑 | 後端 | GAS Sheet 數 | AI 整合 | 狀態 |
|------|------|------|-------------|---------|------|
| 危害鑑別及風險評估 | `risk/` | GAS | 多站分頁 | ✅ Vision + Chat | ✅ |
| 職業災害分析系統 | `accident/` | GAS | 1 | — | ✅ |
| 職災情報與安衛動態 | `news/` | GitHub Actions | — | ✅ 自動摘要 | ✅ |
| 機械設備管理系統 | `equipment/` | 靜態 | — | — | ✅ |
| 危害性化學品管理系統 | `chemical/` | 靜態 | — | — | ✅ |
| 自動點檢系統 | 外部連結 | — | — | — | ✅ |
| 承攬商管理系統 | `contract/` | GAS | 3（進場申請/評核/廠商名冊） | — | ✅ |
| 職護臨場服務 | `nurse/` | GAS | 1 | ✅ Chat | ✅ |
| 證照管理系統 | 外部連結 | — | — | — | ✅ |
| 教育訓練教材庫 | `training/` | 靜態 | — | — | ✅ |
| 法規鑑別查詢系統 | `law/` | GAS | 1 | ✅ Chat | ✅ |
| 作業環境監測 | `monitoring/` | — | — | — | 🚧 |
| 安全衛生委員會報告 | `committee/` | 靜態 + Worker | — | ✅ 歷史報告摘要 | ✅ |
| 職業安全衛生計畫書 | `plans/` | 靜態 | — | — | ✅ |
| 人因性危害預防系統 | `ergonomic/` | GAS | 3（問卷/危害/措施） | ✅ Chat | ✅ |
| 異常工作負荷預防系統 | `overload/` | GAS | 多頁（含 nurse/ 跨表讀取） | ✅ Chat | ✅ |
| 不法侵害防治系統 | `harassment/` | GAS | 1 | ✅ Chat | ✅ |
| 母性健康保護系統 | `maternity/` | GAS | 多頁 | ✅ Chat | ✅ |
| 消防管理系統 | `fire/` | 靜態 | — | — | ✅ |
| 職安工作中樞 | `tasks/` | GAS | 1 | — | ✅ |
| 熱危害風險即時查詢 | `heat/` | 氣象局 Open API | — | — | ✅ |

### 6.2 QR Code 掃碼填報流程（contract/）

```
承攬商掃描 QR Code
    │
    ├─ 通用 URL: ?mode=fill
    │    └─ initFromUrl() → currentRole='guest' → showView('home')
    │         └─ 顯示：進場申請 / 動火作業 / 特殊危害 三選一
    │
    └─ 廠商專屬 URL: ?mode=fill&v=VDR-001
         └─ initFromUrl() → 同上 + 非同步查詢廠商名冊
              └─ apiGet({action:'listVendors'})
                   └─ _prefillVendor(vendor) → 填入 f-company / f-supervisor / f-phone
                        └─ 欄位背景色改為 #eff6ff（視覺提示「已自動帶入」）
```

QR Code 圖片產生採用 `api.qrserver.com` REST API，規避前端 CDN 依賴問題：

```javascript
const apiUrl = 'https://api.qrserver.com/v1/create-qr-code/'
  + '?size=256x256&color=1e3a5f&bgcolor=ffffff&margin=10'
  + '&data=' + encodeURIComponent(url);
```

### 6.3 異常工作負荷系統跨表讀取（overload/）

`overload/` GAS 後端透過 Google Sheets API 跨 Spreadsheet 讀取 `nurse/` 系統的腦心血管風險評估結果：

```javascript
// nurse/ Spreadsheet ID
const NURSE_SHEET_ID = '1YGYnBRusJAwE3gNQ7ot39Bk79apRf6KQTKogQsT23x8';

SpreadsheetApp.openById(NURSE_SHEET_ID)
  .getSheetByName('面談記錄')
  .getDataRange().getValues()
  // 篩選「腦心血管風險 = 建議面談」人員 → 自動帶入 overload/ 高風險追蹤清單
```

---

## 7. 安全性考量

### 7.1 現行安全設計

| 面向 | 機制 | 備註 |
|------|------|------|
| AI API 金鑰 | 儲存於 Cloudflare Worker `env`，不存放於 GitHub | 符合最低權限原則 |
| GAS 端點 | 「所有人（含匿名）」可存取 | 設計上為公開 API，適用於無敏感個資場景 |
| HR 後台驗證 | 靜態 Token 比對 | 低安全性，適用於內部低風險管理介面 |
| 承攬商 guest 模式 | URL 參數 `?mode=fill` 直接進入，無驗證 | 設計為公開填報，不儲存敏感資料 |
| 個資處理 | 職護系統採密碼登入隔離；姓名/電話為一般業務資料 | 無特種個資 |

### 7.2 已知限制

- GAS Web App URL 一旦公開即可由任何人呼叫（無 IP 限制），惡意方可任意寫入 Google Sheets。現行設計接受此風險，理由為資料無敏感性且有 Sheet GUI 可人工稽核。
- 靜態 Token（如 `ergo-admin-2025`）未設置到期機制，建議每年度輪換。

---

## 8. 維護操作手冊

### 8.1 新增子系統標準程序

1. 建立 `new-system/index.html`（沿用現有 SPA 架構）
2. 在 GAS 建立對應 Spreadsheet，部署 Web App（執行身分：我 / 存取權：所有人）
3. 將 Web App URL 填入 `const API = '...'`
4. 修改 `shared/sidebar.js`，在對應 `nav-section` 區塊新增 `<a class="nav-item">` 項目
5. 修改 `index.html`，在對應 `section-label` 區塊新增 `<div class="sys-card">` 卡片
6. 更新 `導覽文件.md` 與本文件

### 8.2 Cloudflare Worker 更新流程

```bash
# 1. 修改原始碼
vim workers/law-chatbot.js

# 2. 本機測試（選用）
npx wrangler dev workers/law-chatbot.js

# 3. 部署至生產環境
npx wrangler deploy workers/law-chatbot.js --name ohs-law-chatbot

# 注意：Worker 更新不會因 git push 自動觸發，須手動執行此步驟
```

### 8.3 GAS 更新流程

1. 開啟對應 Google Spreadsheet → 擴充功能 → Apps Script
2. 貼上新版程式碼（全選 → 刪除 → 貼上）
3. 部署 → 管理部署 → 鉛筆圖示 → 版本選「新增版本」→ 部署
4. Web App URL 不變，現有前端不需修改 `const API`

### 8.4 監控與故障排除

| 症狀 | 排查步驟 |
|------|---------|
| AI 功能無回應 | 1. 確認 Cloudflare Worker 正常（`https://ohs-law-chatbot.df-hr-openai.workers.dev`）<br>2. 聯繫 IT 確認 API Gateway 狀態 |
| GAS API 502/逾時 | 1. 直接以瀏覽器開啟 GAS Web App URL 確認部署狀態<br>2. 確認 Spreadsheet 未被刪除或移轉 |
| 新聞未自動更新 | 1. 至 GitHub Actions 查看 `news-update` workflow 執行記錄<br>2. 手動觸發 `workflow_dispatch` |
| 週報排程未執行 | `schtasks /query /tn "OHS-Portal-WeeklyReport"` 確認任務存在 |
| QR Code 圖片無法顯示 | 確認 `api.qrserver.com` 可連線（需對外網路存取） |

---

## 9. 版本異動記錄

| 版次 | 日期 | 主要變更 |
|------|------|---------|
| 1.0 | 2026-07-01 | 初版發行。涵蓋系統架構、GAS API 規格、Cloudflare Worker、CI/CD 管線、20 個模組技術摘要、QR Code 填報流程 |

---

*文件維護：賴佑毓 / 人力資源部 / gloom.lai@df-recycle.com*
*技術問題請聯繫 IT 部門確認 API Gateway 與金鑰管控相關事項*
