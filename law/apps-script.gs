// ============================================================
// 職安法規鑑別記錄 — Google Apps Script 後端
// 部署方式：
//   1. 在 Google Sheets 建立新試算表，取名「法規鑑別記錄」
//   2. 工具 → Apps Script → 貼上此腳本 → 儲存
//   3. 部署 → 新部署 → 網頁應用程式
//      執行身分：「我」　存取權：「所有人（含匿名）」
//   4. 複製 Web App URL 填入 law/index.html 的 AUDIT_GAS_URL
// ============================================================

const SHEET_NAME = '法規鑑別記錄';

// ── GET：讀取記錄 ──────────────────────────────────────────
function doGet(e) {
  const p = e.parameter;
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return json({ records: [] });

  const [hdrs, ...data] = rows;
  let records = data.map(r => Object.fromEntries(hdrs.map((h, i) => [h, r[i]])));

  if (p.site_id) {
    records = records.filter(r =>
      String(r.site_id) === p.site_id &&
      String(r.sub)     === (p.sub || '')
    );
  }

  records.sort((a, b) => (b.ts > a.ts ? 1 : -1));
  return json({ records: records.slice(0, 30) });
}

// ── POST：新增記錄 ─────────────────────────────────────────
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const sheet = getSheet();
  sheet.appendRow([
    Utilities.getUuid(),
    d.site_id    || '',
    d.sub        || '',
    d.site_label || '',
    d.quarter    || '',
    d.ts         || new Date().toISOString(),
    d.summary?.ok      || 0,
    d.summary?.changed || 0,
    d.summary?.anomaly || 0,
    d.summary?.fail    || 0,
    JSON.stringify(d.results || [])
  ]);
  return json({ ok: true });
}

// ── 工具函數 ───────────────────────────────────────────────
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'id', 'site_id', 'sub', 'site_label',
      'quarter', 'ts',
      'ok', 'changed', 'anomaly', 'fail',
      'results_json'
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
