// ════════════════════════════════════════════════════
// 機械設備清冊  Apps Script API
// ════════════════════════════════════════════════════

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';

const HEADERS = [
  'assetNo','name','spec','deptCode','deptName',
  'keeper','location','category','qty','unit',
  'date','status','updatedAt'
];

function doGet(e) {
  return respond(getAllEquipment());
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.action === 'getAll')       return respond(getAllEquipment());
    if (p.action === 'bulkImport')   return respond(bulkImport(p.rows));
    if (p.action === 'update')       return respond(updateRow(p.row));
    if (p.action === 'delete')       return respond(deleteRow(p.assetNo));
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
  let sheet = ss.getSheetByName('設備清冊');
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName('設備清冊');
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function getAllEquipment() {
  const vals = getSheet().getDataRange().getValues();
  if (vals.length < 2) return { ok: true, rows: [], total: 0 };
  const hdr = vals[0];
  const rows = vals.slice(1).map(r => {
    const o = {};
    hdr.forEach((h, i) => o[h] = r[i]);
    return o;
  });
  return { ok: true, rows, total: rows.length };
}

function bulkImport(rows) {
  if (!Array.isArray(rows) || !rows.length) return { ok: true, added: 0 };
  const sheet = getSheet();
  // 清除現有資料（保留標題列）
  const last = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1);
  const now = new Date().toISOString().slice(0, 10);
  const matrix = rows.map(r =>
    HEADERS.map(h => h === 'updatedAt' ? now : (r[h] !== undefined ? r[h] : ''))
  );
  sheet.getRange(2, 1, matrix.length, HEADERS.length).setValues(matrix);
  return { ok: true, added: matrix.length };
}

function updateRow(row) {
  const sheet = getSheet();
  const vals = sheet.getDataRange().getValues();
  const hdr = vals[0];
  const idCol = hdr.indexOf('assetNo');
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][idCol]) === String(row.assetNo)) {
      hdr.forEach((h, j) => {
        if (row[h] !== undefined) sheet.getRange(i + 1, j + 1).setValue(row[h]);
      });
      return { ok: true };
    }
  }
  return { ok: false, error: 'Not found' };
}

function deleteRow(assetNo) {
  const sheet = getSheet();
  const vals = sheet.getDataRange().getValues();
  const idCol = vals[0].indexOf('assetNo');
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][idCol]) === String(assetNo)) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Not found' };
}
