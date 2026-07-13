/**
 * 各站點反應事項 — Google Apps Script 後端
 *
 * 部署方式：
 * 1. 開啟 Google Sheets（新建空白試算表）
 * 2. 延伸功能 → Apps Script → 貼上此程式碼
 * 3. 部署 → 新增部署作業 → 類型選「網頁應用程式」
 *    執行身分：我（your account）
 *    存取權限：所有人
 * 4. 複製部署網址，填入 response/index.html 的 GAS_URL 變數
 */

const SHEET_NAME = 'responses';

function doGet(e)  { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  try {
    const body = e.postData ? JSON.parse(e.postData.contents) : {};
    const act  = (e.parameter || {}).action || body.action || 'getAll';

    let result = {};
    if      (act === 'getAll')       result = getAll();
    else if (act === 'add')          result = add(body);
    else if (act === 'updateStatus') result = updateStatus(body);
    else if (act === 'delete')       result = deleteRec(body);
    else throw new Error('Unknown action: ' + act);

    return out({ success: true, ...result });
  } catch(err) {
    return out({ success: false, error: err.message });
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['id', 'submittedAt', 'department', 'issue', 'countermeasure', 'proposer', 'handler', 'status']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold');
  }
  return sh;
}

function getAll() {
  const sh   = getSheet();
  const rows = sh.getDataRange().getValues();
  const hdr  = rows[0];
  const records = rows.slice(1).map(r => {
    const o = {};
    hdr.forEach((h, i) => { o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
    return o;
  });
  return { records };
}

function add(body) {
  const sh  = getSheet();
  const id  = 'DF-' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  sh.appendRow([
    id, now,
    body.department    || '',
    body.issue         || '',
    body.countermeasure|| '',
    body.proposer      || '',
    body.handler       || '',
    'open'
  ]);
  return { id };
}

function updateStatus(body) {
  const sh   = getSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      sh.getRange(i + 1, 8).setValue(body.status);
      return { updated: true };
    }
  }
  throw new Error('找不到記錄：' + body.id);
}

function deleteRec(body) {
  const sh   = getSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      sh.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  throw new Error('找不到記錄：' + body.id);
}

function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
