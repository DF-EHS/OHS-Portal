// ════════════════════════════════════════════════════
//  消防安全管理 Apps Script API
//  Sheets: 消防演練, 年度檢修申報
//  部署後，將 Web App URL 填入 fire/index.html FIRE_GAS_URL
// ════════════════════════════════════════════════════

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // ← 填入你的 Google Sheet ID

const DRILL_SHEET   = '消防演練';
const INSP_SHEET    = '年度檢修申報';

const DRILL_HEADERS = ['roc','station','half','status','date','url','updatedAt'];
const INSP_HEADERS  = ['roc','site','status','date','url','updatedAt'];

// ── HTTP handlers ─────────────────────────────────

function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === 'loadDrills') return respond(loadDrills());
    if (p.action === 'loadInsps')  return respond(loadInsps());
    return respond({ ok: true, info: '消防安全管理 GAS API' });
  } catch(err) { return respond({ ok: false, error: err.toString() }); }
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.action === 'saveDrill')  return respond(saveDrill(p));
    if (p.action === 'loadDrills') return respond(loadDrills());
    if (p.action === 'saveInsp')   return respond(saveInsp(p));
    if (p.action === 'loadInsps')  return respond(loadInsps());
    return respond({ ok: false, error: 'Unknown action' });
  } catch(err) { return respond({ ok: false, error: err.toString() }); }
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Sheet helpers ─────────────────────────────────

function getSheet(name, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function getAllRows(sheetName, headers) {
  const vals = getSheet(sheetName, headers).getDataRange().getValues();
  if (vals.length < 2) return [];
  const hdr = vals[0];
  return vals.slice(1).map(r => {
    const o = {};
    hdr.forEach((h, i) => o[h] = String(r[i] == null ? '' : r[i]));
    return o;
  });
}

function upsertRow(sheetName, headers, keyFields, p) {
  const sheet = getSheet(sheetName, headers);
  const vals  = sheet.getDataRange().getValues();
  const hdr   = vals[0];
  const keyCols = keyFields.map(k => hdr.indexOf(k));
  const now = new Date().toISOString().slice(0, 10);

  for (let i = 1; i < vals.length; i++) {
    const match = keyFields.every((k, ki) =>
      String(vals[i][keyCols[ki]]) === String(p[k])
    );
    if (match) {
      hdr.forEach((h, j) => {
        if (h === 'updatedAt') sheet.getRange(i+1, j+1).setValue(now);
        else if (p[h] !== undefined) sheet.getRange(i+1, j+1).setValue(p[h]);
      });
      return { ok: true, action: 'updated' };
    }
  }

  const row = headers.map(h => h === 'updatedAt' ? now : (p[h] !== undefined ? p[h] : ''));
  sheet.appendRow(row);
  return { ok: true, action: 'inserted' };
}

// ── 消防演練（upsert by roc + station + half）────────

function loadDrills() {
  return { ok: true, rows: getAllRows(DRILL_SHEET, DRILL_HEADERS) };
}

function saveDrill(p) {
  return upsertRow(DRILL_SHEET, DRILL_HEADERS, ['roc','station','half'], p);
}

// ── 年度檢修申報（upsert by roc + site）─────────────

function loadInsps() {
  return { ok: true, rows: getAllRows(INSP_SHEET, INSP_HEADERS) };
}

function saveInsp(p) {
  return upsertRow(INSP_SHEET, INSP_HEADERS, ['roc','site'], p);
}
