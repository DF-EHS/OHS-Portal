// ════════════════════════════════════════════════════
// 公共危險物品申報記錄  Apps Script API
// ════════════════════════════════════════════════════

const SPREADSHEET_ID   = 'YOUR_SPREADSHEET_ID';
const SHEET_NAME       = '申報記錄';
const HEADERS          = ['roc','period','status','date','note','url','updatedAt'];

const PRIORITY_SHEET   = '優先申報';
const PRIORITY_HEADERS = ['roc','url','updatedAt'];

function doGet(e) {
  return respond(getAllRows());
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.action === 'getAll')        return respond(getAllRows());
    if (p.action === 'save')          return respond(saveRow(p));
    if (p.action === 'savePriority')  return respond(savePriority(p));
    if (p.action === 'loadPriority')  return respond(loadPriority());
    return respond({ ok: false, error: 'Unknown action' });
  } catch(err) {
    return respond({ ok: false, error: err.toString() });
  }
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  } else {
    // 若現有表格缺少 url 欄，自動補上（schema migration）
    const hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!hdr.includes('url')) {
      const updatedAtCol = hdr.indexOf('updatedAt') + 1; // 1-based
      sheet.insertColumnBefore(updatedAtCol);
      sheet.getRange(1, updatedAtCol).setValue('url');
    }
  }
  return sheet;
}

function getAllRows() {
  const vals = getSheet().getDataRange().getValues();
  if (vals.length < 2) return { ok: true, rows: [] };
  const hdr  = vals[0];
  const rows = vals.slice(1).map(r => {
    const o = {};
    hdr.forEach((h, i) => o[h] = r[i]);
    return o;
  });
  return { ok: true, rows };
}

// ── 優先申報連結（upsert by roc）─────────────────────

function getPrioritySheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(PRIORITY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PRIORITY_SHEET);
    sheet.appendRow(PRIORITY_HEADERS);
  }
  return sheet;
}

function loadPriority() {
  const vals = getPrioritySheet().getDataRange().getValues();
  if (vals.length < 2) return { ok: true, rows: [] };
  const hdr = vals[0];
  const rows = vals.slice(1).map(r => {
    const o = {};
    hdr.forEach((h, i) => o[h] = String(r[i] == null ? '' : r[i]));
    return o;
  });
  return { ok: true, rows };
}

function savePriority(p) {
  const sheet = getPrioritySheet();
  const vals  = sheet.getDataRange().getValues();
  const hdr   = vals[0];
  const rocCol = hdr.indexOf('roc');
  const now = new Date().toISOString().slice(0, 10);

  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][rocCol]) === String(p.roc)) {
      hdr.forEach((h, j) => {
        if (h === 'updatedAt') sheet.getRange(i+1, j+1).setValue(now);
        else if (p[h] !== undefined) sheet.getRange(i+1, j+1).setValue(p[h]);
      });
      return { ok: true, action: 'updated' };
    }
  }

  const row = PRIORITY_HEADERS.map(h => h === 'updatedAt' ? now : (p[h] !== undefined ? p[h] : ''));
  sheet.appendRow(row);
  return { ok: true, action: 'inserted' };
}

// Upsert: match by roc + period
function saveRow(p) {
  const sheet = getSheet();
  const vals  = sheet.getDataRange().getValues();
  const hdr   = vals[0];
  const rocCol    = hdr.indexOf('roc');
  const periodCol = hdr.indexOf('period');
  const now   = new Date().toISOString().slice(0, 10);

  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][rocCol]) === String(p.roc) &&
        String(vals[i][periodCol]) === String(p.period)) {
      // update existing row
      hdr.forEach((h, j) => {
        if (h === 'updatedAt') sheet.getRange(i+1, j+1).setValue(now);
        else if (p[h] !== undefined) sheet.getRange(i+1, j+1).setValue(p[h]);
      });
      return { ok: true, action: 'updated' };
    }
  }

  // insert new row
  const row = HEADERS.map(h => {
    if (h === 'updatedAt') return now;
    return p[h] !== undefined ? p[h] : '';
  });
  sheet.appendRow(row);
  return { ok: true, action: 'inserted' };
}
