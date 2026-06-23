// ── 人因性危害預防系統 GAS 後端 ─────────────────────────────────────────────
// Sheets: 問卷回覆 / 作業危害 / 改善措施
// 部署：網頁應用程式，執行身分「我」，存取權「所有人」

const ADMIN_TOKEN = 'ergo-admin-2025';

const SHEET_Q   = '問卷回覆';  // id,empId,empName,empDept,date,symptoms,nurseNote,aiNote,status,updatedAt
const SHEET_HAZ = '作業危害';  // id,taskName,station,types,freq,intensity,risk,note,createdAt
const SHEET_IMP = '改善措施';  // id,measure,type,hazardId,owner,dueDate,doneDate,status,effect,createdAt

const COLS_Q   = ['id','empId','empName','empDept','date','symptoms','nurseNote','aiNote','status','updatedAt'];
const COLS_HAZ = ['id','taskName','station','types','freq','intensity','risk','note','createdAt'];
const COLS_IMP = ['id','measure','type','hazardId','owner','dueDate','doneDate','status','effect','createdAt'];

// ── Entry points ────────────────────────────────────────────────────────────

function doGet(e) {
  return handle(e);
}

function doPost(e) {
  return handle(e);
}

function handle(e) {
  try {
    const p = e.parameter || {};
    const body = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
    const params = Object.assign({}, p, body);
    const action = params.action;

    let result;
    switch (action) {
      // ── Employee questionnaire (public) ──────────────────────────────────
      case 'submitQ':    result = submitQ(params);    break;

      // ── Admin: questionnaire management ──────────────────────────────────
      case 'listResp':   requireAdmin(params); result = listRows(SHEET_Q, COLS_Q);     break;
      case 'updateResp': requireAdmin(params); result = updateResp(params);             break;

      // ── Admin: hazard inventory ───────────────────────────────────────────
      case 'listHaz':  requireAdmin(params); result = listRows(SHEET_HAZ, COLS_HAZ); break;
      case 'saveHaz':  requireAdmin(params); result = saveRow(SHEET_HAZ, COLS_HAZ, params.data); break;
      case 'delHaz':   requireAdmin(params); result = delRow(SHEET_HAZ, params.id);  break;

      // ── Admin: improvement measures ───────────────────────────────────────
      case 'listImp':  requireAdmin(params); result = listRows(SHEET_IMP, COLS_IMP); break;
      case 'saveImp':  requireAdmin(params); result = saveRow(SHEET_IMP, COLS_IMP, params.data); break;
      case 'delImp':   requireAdmin(params); result = delRow(SHEET_IMP, params.id);  break;

      default: result = { ok: false, error: 'unknown action: ' + action };
    }
    return json(result);
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function requireAdmin(params) {
  if (params.token !== ADMIN_TOKEN) throw new Error('unauthorized');
}

// ── Questionnaire ─────────────────────────────────────────────────────────────

function submitQ(params) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_Q);
  ensureHeader(sheet, COLS_Q);

  const now = new Date().toISOString();
  const row = [
    Utilities.getUuid(),
    params.empId   || '',
    params.empName || '',
    params.empDept || '',
    params.date    || now.slice(0, 10),
    params.symptoms || '{}',
    '',  // nurseNote
    '',  // aiNote
    '待審',
    now
  ];
  sheet.appendRow(row);
  return { ok: true };
}

function updateResp(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_Q);
  const rowIdx = findRowById(sheet, params.id);
  if (!rowIdx) return { ok: false, error: 'not found' };

  const colMap = colIndex(COLS_Q);
  const now = new Date().toISOString();
  if (params.nurseNote !== undefined) sheet.getRange(rowIdx, colMap.nurseNote).setValue(params.nurseNote);
  if (params.aiNote    !== undefined) sheet.getRange(rowIdx, colMap.aiNote).setValue(params.aiNote);
  if (params.status    !== undefined) sheet.getRange(rowIdx, colMap.status).setValue(params.status);
  sheet.getRange(rowIdx, colMap.updatedAt).setValue(now);
  return { ok: true };
}

// ── Generic CRUD ──────────────────────────────────────────────────────────────

function listRows(sheetName, cols) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  ensureHeader(sheet, cols);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, rows: [] };
  const headers = data[0];
  const rows = data.slice(1).map(function(r) {
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = r[i] === '' ? '' : r[i]; });
    return obj;
  });
  return { ok: true, rows: rows };
}

function saveRow(sheetName, cols, dataStr) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  ensureHeader(sheet, cols);

  const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
  const now  = new Date().toISOString();

  if (!data.id) {
    // New row
    data.id = Utilities.getUuid();
    data.createdAt = now;
    const row = cols.map(function(c) { return data[c] !== undefined ? data[c] : ''; });
    sheet.appendRow(row);
  } else {
    // Update existing row
    const rowIdx = findRowById(sheet, data.id);
    if (!rowIdx) return { ok: false, error: 'not found' };
    const row = cols.map(function(c) { return data[c] !== undefined ? data[c] : ''; });
    sheet.getRange(rowIdx, 1, 1, cols.length).setValues([row]);
  }
  return { ok: true, id: data.id };
}

function delRow(sheetName, id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const rowIdx = findRowById(sheet, id);
  if (!rowIdx) return { ok: false, error: 'not found' };
  sheet.deleteRow(rowIdx);
  return { ok: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureHeader(sheet, cols) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(cols);
  } else {
    const header = sheet.getRange(1, 1, 1, cols.length).getValues()[0];
    if (header[0] !== cols[0]) sheet.insertRowBefore(1).getRange(1, 1, 1, cols.length).setValues([cols]);
  }
}

function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1;
  }
  return null;
}

function colIndex(cols) {
  const map = {};
  cols.forEach(function(c, i) { map[c] = i + 1; });
  return map;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
