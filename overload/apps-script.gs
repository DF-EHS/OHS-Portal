// ── 異常工作負荷促發疾病預防系統 GAS 後端 ────────────────────────────────────
// Sheets: 問卷回覆 / 工時紀錄 / 面談紀錄
// 部署：網頁應用程式，執行身分「我」，存取權「所有人」

const ADMIN_TOKEN = 'overload-admin-2025';

const SHEET_Q  = '問卷回覆'; // id,empId,empName,empDept,submitDate,personalScore,workScore,personalLevel,workLevel,overallLevel,cvRisk,consultRecommend,answers,notes,aiNote,status,updatedAt
const SHEET_OT = '工時紀錄'; // id,dept,year,month,overtimeHours,level,note,createdAt
const SHEET_IV = '面談紀錄'; // id,empId,empName,empDept,interviewDate,nurse,doctor,measures,followupDate,status,createdAt

const COLS_Q  = ['id','empId','empName','empDept','submitDate','personalScore','workScore','personalLevel','workLevel','overallLevel','cvRisk','consultRecommend','answers','notes','aiNote','status','updatedAt'];
const COLS_OT = ['id','dept','year','month','overtimeHours','level','note','createdAt'];
const COLS_IV = ['id','empId','empName','empDept','interviewDate','nurse','doctor','measures','followupDate','status','createdAt'];

// ── Entry points ────────────────────────────────────────────────────────────

function doGet(e)  { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  try {
    const p    = e.parameter || {};
    const body = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
    const params = Object.assign({}, p, body);
    const action = params.action;
    let result;
    switch (action) {
      case 'submitQ':       result = submitQ(params);      break;
      case 'listResp':      requireAdmin(params); result = listRows(SHEET_Q,  COLS_Q);      break;
      case 'updateResp':    requireAdmin(params); result = updateResp(params);               break;
      case 'listOvertime':  requireAdmin(params); result = listRows(SHEET_OT, COLS_OT);     break;
      case 'saveOvertime':  requireAdmin(params); result = saveRow(SHEET_OT, COLS_OT, params.data); break;
      case 'delOvertime':   requireAdmin(params); result = delRow(SHEET_OT, params.id);     break;
      case 'listInterview': requireAdmin(params); result = listRows(SHEET_IV, COLS_IV);     break;
      case 'saveInterview': requireAdmin(params); result = saveRow(SHEET_IV, COLS_IV, params.data); break;
      case 'delInterview':  requireAdmin(params); result = delRow(SHEET_IV, params.id);     break;
      default: result = { ok: false, error: 'unknown action: ' + action };
    }
    return json(result);
  } catch(err) {
    return json({ ok: false, error: err.message });
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function requireAdmin(params) {
  if (params.token !== ADMIN_TOKEN) throw new Error('unauthorized');
}

// ── Questionnaire ─────────────────────────────────────────────────────────────

function submitQ(params) {
  const sheet = getOrCreateSheet(SHEET_Q, COLS_Q);
  const now   = new Date().toISOString();
  const row   = [
    Utilities.getUuid(),
    params.empId         || '',
    params.empName       || '',
    params.empDept       || '',
    now.slice(0, 10),
    params.personalScore || 0,
    params.workScore     || 0,
    params.personalLevel || '',
    params.workLevel     || '',
    params.overallLevel  || '',
    '',   // cvRisk (filled by HR)
    '',   // consultRecommend (filled by HR)
    params.answers       || '{}',
    '',   // notes
    '',   // aiNote
    '待審查',
    now
  ];
  sheet.appendRow(row);
  return { ok: true };
}

function updateResp(params) {
  const sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_Q);
  const rowIdx = findRowById(sheet, params.id);
  if (!rowIdx) return { ok: false, error: 'not found' };
  const cm  = colIndex(COLS_Q);
  const now = new Date().toISOString();
  if (params.cvRisk           !== undefined) sheet.getRange(rowIdx, cm.cvRisk).setValue(params.cvRisk);
  if (params.consultRecommend !== undefined) sheet.getRange(rowIdx, cm.consultRecommend).setValue(params.consultRecommend);
  if (params.notes            !== undefined) sheet.getRange(rowIdx, cm.notes).setValue(params.notes);
  if (params.aiNote           !== undefined) sheet.getRange(rowIdx, cm.aiNote).setValue(params.aiNote);
  if (params.status           !== undefined) sheet.getRange(rowIdx, cm.status).setValue(params.status);
  sheet.getRange(rowIdx, cm.updatedAt).setValue(now);
  return { ok: true };
}

// ── Generic CRUD ──────────────────────────────────────────────────────────────

function listRows(sheetName, cols) {
  const sheet = getOrCreateSheet(sheetName, cols);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, rows: [] };
  const headers = data[0];
  const rows = data.slice(1).map(function(r) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = r[i] === '' ? '' : r[i]; });
    return obj;
  });
  return { ok: true, rows: rows };
}

function saveRow(sheetName, cols, dataStr) {
  const sheet = getOrCreateSheet(sheetName, cols);
  const data  = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
  const now   = new Date().toISOString();
  if (!data.id) {
    data.id = Utilities.getUuid();
    data.createdAt = now;
    const row = cols.map(function(c) { return data[c] !== undefined ? data[c] : ''; });
    sheet.appendRow(row);
  } else {
    const rowIdx = findRowById(sheet, data.id);
    if (!rowIdx) return { ok: false, error: 'not found' };
    const row = cols.map(function(c) { return data[c] !== undefined ? data[c] : ''; });
    sheet.getRange(rowIdx, 1, 1, cols.length).setValues([row]);
  }
  return { ok: true, id: data.id };
}

function delRow(sheetName, id) {
  const sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: 'sheet not found' };
  const rowIdx = findRowById(sheet, id);
  if (!rowIdx) return { ok: false, error: 'not found' };
  sheet.deleteRow(rowIdx);
  return { ok: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOrCreateSheet(name, cols) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(cols);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(cols);
  }
  return sheet;
}

function findRowById(sheet, id) {
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1;
  }
  return null;
}

function colIndex(cols) {
  var map = {};
  cols.forEach(function(c, i) { map[c] = i + 1; });
  return map;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
