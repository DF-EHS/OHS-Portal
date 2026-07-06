// ═══════════════════════════════════════════════════════════════
//  作業環境監測系統 — Google Apps Script 後端
//
//  Google Sheets 頁籤：
//    「監測狀態」— year | site | half | status | reportUrl | updatedAt
//    「監測數值」— year | half | site | item | location | value | unit | limit | pass
//
//  部署方式：
//    工具 > 新部署 > 類型選「網頁應用程式」
//    執行身分：「我」  ／  誰可以存取：「所有人」
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  const p = e.parameter || {};
  if (p.action === 'getAll') return handleGetAll();
  return json({ status: 'ok', version: 'monitoring-v1' });
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.action === 'updateStatus') return handleUpdateStatus(p);
    if (p.action === 'addValues')    return handleAddValues(p);
    return json({ error: 'unknown action' });
  } catch (err) {
    return json({ error: err.message });
  }
}

// ── 讀取所有資料 ─────────────────────────────────────────────────
function handleGetAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const records = sheetToArray(getOrCreate(ss, '監測狀態'));
  const values  = sheetToArray(getOrCreate(ss, '監測數值'));
  return json({ success: true, data: { records, values } });
}

// ── 更新狀態（done / pending）和報告連結 ─────────────────────────
function handleUpdateStatus(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreate(ss, '監測狀態');
  const { year, site, half, status, reportUrl } = p;

  ensureHeader(sheet, ['year','site','half','status','reportUrl','updatedAt']);

  const data = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(year) &&
        data[i][1] === site &&
        data[i][2] === half) {
      sheet.getRange(i + 1, 4, 1, 3).setValues([[
        status, reportUrl || '', new Date().toISOString()
      ]]);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([year, site, half, status, reportUrl || '', new Date().toISOString()]);
  }
  return json({ success: true });
}

// ── 寫入監測數值（同一 year/half/site 先刪後寫）──────────────────
function handleAddValues(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreate(ss, '監測數值');
  const { year, half, site, items } = p;

  ensureHeader(sheet, ['year','half','site','item','location','value','unit','limit','pass']);

  // 刪除相同年度/半年/站點的舊資料（由下往上刪，避免 row index 移位）
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(year) &&
        data[i][1] === half &&
        data[i][2] === site) {
      sheet.deleteRow(i + 1);
    }
  }

  if (!items || !items.length) return json({ success: true, added: 0 });

  items.forEach(it => sheet.appendRow([
    year, half, site,
    it.item, it.location, it.value, it.unit, it.limit,
    it.pass ? 1 : 0
  ]));

  return json({ success: true, added: items.length });
}

// ── 工具函式 ──────────────────────────────────────────────────────
function getOrCreate(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureHeader(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
}

function sheetToArray(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(String);
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
