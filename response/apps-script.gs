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
    else if (act === 'update')       result = update(body);
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
    sh.appendRow(['id', 'submittedAt', 'department', 'category', 'issue', 'countermeasure', 'proposer', 'handler', 'status']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 9).setFontWeight('bold');
  } else {
    // 自動遷移：若舊 Sheet 缺少 category 欄，在 department 之後插入
    const lastCol = sh.getLastColumn();
    const hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    if (!hdr.includes('category')) {
      const deptCol = hdr.indexOf('department') + 1; // 1-based
      sh.insertColumnAfter(deptCol);
      sh.getRange(1, deptCol + 1).setValue('category');
      sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
    }
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
    body.category      || '',
    body.issue         || '',
    body.countermeasure|| '',
    body.proposer      || '',
    body.handler       || '',
    'open'
  ]);
  return { id };
}

function update(body) {
  const sh   = getSheet();
  const data = sh.getDataRange().getValues();
  const hdr  = data[0];
  const idx  = {};
  hdr.forEach((h, i) => idx[h] = i);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      sh.getRange(i+1, idx.department    +1).setValue(body.department    || '');
      sh.getRange(i+1, idx.category      +1).setValue(body.category      || '');
      sh.getRange(i+1, idx.issue         +1).setValue(body.issue         || '');
      sh.getRange(i+1, idx.countermeasure+1).setValue(body.countermeasure|| '');
      sh.getRange(i+1, idx.proposer      +1).setValue(body.proposer      || '');
      sh.getRange(i+1, idx.handler       +1).setValue(body.handler       || '');
      return { updated: true };
    }
  }
  throw new Error('找不到記錄：' + body.id);
}

function updateStatus(body) {
  const sh   = getSheet();
  const data = sh.getDataRange().getValues();
  const hdr  = data[0];
  const idx  = {};
  hdr.forEach((h, i) => idx[h] = i);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      sh.getRange(i + 1, idx.status + 1).setValue(body.status);
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
