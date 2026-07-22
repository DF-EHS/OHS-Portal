// ═══════════════════════════════════════════════════════════════
//  安全衛生工作守則備查記錄 — Google Apps Script 後端
//
//  Google Sheets 頁籤：
//    「備查記錄」— id | url | regDate | regNo | agency | updatedAt
//
//  部署方式：
//    工具 > 新部署 > 類型選「網頁應用程式」
//    執行身分：「我」  ／  誰可以存取：「所有人」
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  const p = e.parameter || {};
  if (p.action === 'getAll') return handleGetAll();
  return json({ status: 'ok', version: 'workreg-v1' });
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.action === 'getAll')      return handleGetAll();
    if (p.action === 'saveRecord')  return handleSaveRecord(p);
    return json({ error: 'unknown action' });
  } catch (err) {
    return json({ error: err.message });
  }
}

// ── 讀取所有備查記錄 ─────────────────────────────────────────────
function handleGetAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreate(ss, '備查記錄');
  const rows = sheetToArray(sheet);
  // 轉成以 id 為 key 的物件，方便前端直接取用
  const result = {};
  rows.forEach(r => { if (r.id) result[r.id] = r; });
  return json({ success: true, data: result });
}

// ── 新增或更新單筆備查記錄 ──────────────────────────────────────
function handleSaveRecord(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreate(ss, '備查記錄');
  const HEADERS = ['id', 'url', 'regDate', 'regNo', 'agency', 'updatedAt'];
  ensureHeader(sheet, HEADERS);

  const { recId, url, regDate, regNo, agency } = p;
  const data = sheet.getDataRange().getValues();
  const now = new Date().toISOString();

  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(recId)) {
      // 只覆蓋有傳入的欄位，其餘保留原值
      sheet.getRange(i + 1, 1, 1, 6).setValues([[
        recId,
        url      !== undefined ? url      : data[i][1],
        regDate  !== undefined ? regDate  : data[i][2],
        regNo    !== undefined ? regNo    : data[i][3],
        agency   !== undefined ? agency   : data[i][4],
        now
      ]]);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([recId, url || '', regDate || '', regNo || '', agency || '', now]);
  }
  return json({ success: true });
}

// ── 工具函式 ──────────────────────────────────────────────────────
function getOrCreate(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureHeader(sheet, headers) {
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
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
