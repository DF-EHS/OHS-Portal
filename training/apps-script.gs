// ════════════════════════════════════════════════════
// 教育訓練紀錄  Apps Script API
// ════════════════════════════════════════════════════

const SPREADSHEET_ID = '1dcY-vebi2qZIDbGRbgBRJg3oT4fxnHzeuiWWB9tXujU';
const SHEET_NAME     = '訓練紀錄';
const HEADERS        = ['id','roc','location','name','status','date','url','updatedAt'];

function doGet(e) {
  return respond(loadSessions());
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.action === 'loadSessions')  return respond(loadSessions());
    if (p.action === 'saveSession')   return respond(saveSession(p));
    if (p.action === 'deleteSession') return respond(deleteSession(p));
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
  }
  return sheet;
}

function loadSessions() {
  const vals = getSheet().getDataRange().getValues();
  if (vals.length < 2) return { ok: true, rows: [] };
  const hdr  = vals[0];
  const rows = vals.slice(1).map(r => {
    const o = {};
    hdr.forEach((h, i) => o[h] = r[i] == null ? '' : String(r[i]));
    return o;
  });
  return { ok: true, rows };
}

// Upsert by id
function saveSession(p) {
  const sheet = getSheet();
  const vals  = sheet.getDataRange().getValues();
  const hdr   = vals[0];
  const idCol = hdr.indexOf('id');
  const now   = new Date().toISOString().slice(0, 10);

  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][idCol]) === String(p.id)) {
      hdr.forEach((h, j) => {
        if (h === 'updatedAt') sheet.getRange(i+1, j+1).setValue(now);
        else if (p[h] !== undefined) sheet.getRange(i+1, j+1).setValue(p[h]);
      });
      return { ok: true, action: 'updated' };
    }
  }

  const row = HEADERS.map(h => {
    if (h === 'updatedAt') return now;
    return p[h] !== undefined ? p[h] : '';
  });
  sheet.appendRow(row);
  return { ok: true, action: 'inserted' };
}

// Delete by id
function deleteSession(p) {
  const sheet = getSheet();
  const vals  = sheet.getDataRange().getValues();
  const hdr   = vals[0];
  const idCol = hdr.indexOf('id');

  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][idCol]) === String(p.id)) {
      sheet.deleteRow(i + 1);
      return { ok: true, action: 'deleted' };
    }
  }
  return { ok: false, error: 'id not found' };
}
