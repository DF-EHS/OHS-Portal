// ── 工作場所母性健康保護系統 GAS 後端 ─────────────────────────────────────────
// Sheets: 人員名冊 / 自我評估 / 危害評估 / 面談調整
// 部署：網頁應用程式，執行身分「我」，存取權「所有人」

const ADMIN_TOKEN = 'maternity-admin-2025';

const SHEET_P  = '人員名冊';   // id,empId,empName,dept,phone,dueDate,status,note,createdAt,updatedAt
const SHEET_SA = '自我評估';   // id,empId,empName,empDept,dueDate,stage,symptoms,chemExposure,liftHeavy,shiftWork,workConcern,medicalHistory,note,submitDate
const SHEET_HA = '危害評估';   // id,empId,empName,assessDate,physical,chemical,biological,ergonomic,workType,envLevel,healthLevel,riskGrade,measures,assessor,note,createdAt
const SHEET_IV = '面談調整';   // id,empId,empName,empDept,interviewDate,interviewer,adjustType,adjustContent,followupDate,status,note,createdAt

const COLS_P  = ['id','empId','empName','dept','phone','dueDate','status','note','createdAt','updatedAt'];
const COLS_SA = ['id','empId','empName','empDept','dueDate','stage','symptoms','chemExposure','liftHeavy','shiftWork','workConcern','medicalHistory','note','submitDate'];
const COLS_HA = ['id','empId','empName','assessDate','physical','chemical','biological','ergonomic','workType','envLevel','healthLevel','riskGrade','measures','assessor','note','createdAt'];
const COLS_IV = ['id','empId','empName','empDept','interviewDate','interviewer','adjustType','adjustContent','followupDate','status','note','createdAt'];

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
      case 'submitSelfAssess':  result = submitSelfAssess(params);  break;
      case 'listPersonnel':     requireAdmin(params); result = listRows(SHEET_P,  COLS_P);   break;
      case 'savePersonnel':     requireAdmin(params); result = saveRow(SHEET_P,  COLS_P,  params.data); break;
      case 'delPersonnel':      requireAdmin(params); result = delRow(SHEET_P,   params.id); break;
      case 'listSelfAssess':    requireAdmin(params); result = listRows(SHEET_SA, COLS_SA);  break;
      case 'listHazard':        requireAdmin(params); result = listRows(SHEET_HA, COLS_HA);  break;
      case 'saveHazard':        requireAdmin(params); result = saveRow(SHEET_HA, COLS_HA, params.data); break;
      case 'delHazard':         requireAdmin(params); result = delRow(SHEET_HA,  params.id); break;
      case 'listInterview':     requireAdmin(params); result = listRows(SHEET_IV, COLS_IV);  break;
      case 'saveInterview':     requireAdmin(params); result = saveRow(SHEET_IV, COLS_IV, params.data); break;
      case 'delInterview':      requireAdmin(params); result = delRow(SHEET_IV,  params.id); break;
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

// ── Employee Self-Assessment (public) ─────────────────────────────────────────

function submitSelfAssess(params) {
  const sheet = getOrCreateSheet(SHEET_SA, COLS_SA);
  const now   = new Date().toISOString();
  const row = [
    Utilities.getUuid(),
    params.empId          || '',
    params.empName        || '',
    params.empDept        || '',
    params.dueDate        || '',
    params.stage          || '',
    params.symptoms       || '{}',
    params.chemExposure   || '',
    params.liftHeavy      || '',
    params.shiftWork      || '',
    params.workConcern    || '',
    params.medicalHistory || '',
    params.note           || '',
    now.slice(0, 10)
  ];
  sheet.appendRow(row);
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
    if (cols.includes('updatedAt')) data.updatedAt = now;
    const row = cols.map(function(c) { return data[c] !== undefined ? data[c] : ''; });
    sheet.appendRow(row);
  } else {
    const rowIdx = findRowById(sheet, data.id);
    if (!rowIdx) return { ok: false, error: 'not found' };
    if (cols.includes('updatedAt')) data.updatedAt = now;
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

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
