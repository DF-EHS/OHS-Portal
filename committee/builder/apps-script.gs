// ════════════════════════════════════════════════════════════════
//  委員會報告生成器  Apps Script API
//  Spreadsheet 結構：7 個分頁（section_status / s2~s3 / s6~s8 / s10 / s12）
// ════════════════════════════════════════════════════════════════

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';

const SHEET_DEFS = {
  status: {
    name: 'section_status',
    headers: ['quarter','s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12','updatedAt']
  },
  s2: {
    name: 's2_plans',
    headers: ['quarter','type','item','date','updatedAt']
  },
  s3: {
    name: 's3_training',
    headers: ['quarter','date','topic','location','attendees','photoUrls','notes','updatedAt']
  },
  s6: {
    name: 's6_proposals',
    headers: ['quarter','propId','title','status','note','updatedAt']
  },
  s7: {
    name: 's7_inspection',
    headers: ['quarter','date','location','findings','improvements','updatedAt']
  },
  s8: {
    name: 's8_hazard',
    headers: ['quarter','equipment','hazardType','riskLevel','measures','status','updatedAt']
  },
  s10: {
    name: 's10_kpi',
    headers: ['quarter','kpiId','target','actual','status','note','updatedAt']
  },
  s12: {
    name: 's12_notes',
    headers: ['quarter','title','content','updatedAt']
  }
};

// ── HTTP 入口 ────────────────────────────────────────────────────

function doGet(e) {
  const p = e.parameter || {};
  if (p.action === 'getAll') return respond(getAllData(p.quarter));
  if (p.action === 'getStatus') return respond(getStatus(p.quarter));
  return respond({ ok: true, version: 'builder-v1' });
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.action === 'getAll')       return respond(getAllData(p.quarter));
    if (p.action === 'getStatus')    return respond(getStatus(p.quarter));
    if (p.action === 'saveSection')  return respond(saveSection(p));
    if (p.action === 'saveStatus')   return respond(saveStatus(p));
    return respond({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return respond({ ok: false, error: err.toString() });
  }
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 讀取指定季度的所有資料 ──────────────────────────────────────

function getAllData(quarter) {
  if (!quarter) return { ok: false, error: 'quarter required' };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const result = { ok: true, quarter };

  Object.entries(SHEET_DEFS).forEach(([key, def]) => {
    const sheet = getOrCreate(ss, def.name, def.headers);
    const rows = sheetToObjects(sheet);
    result[key] = rows.filter(r => String(r.quarter) === String(quarter));
  });

  return result;
}

// ── 讀取 12 節完成狀態 ──────────────────────────────────────────

function getStatus(quarter) {
  if (!quarter) return { ok: false, error: 'quarter required' };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreate(ss, SHEET_DEFS.status.name, SHEET_DEFS.status.headers);
  const rows = sheetToObjects(sheet);
  const row = rows.find(r => String(r.quarter) === String(quarter));
  if (!row) {
    // 回傳全 0 初始狀態
    const empty = { quarter };
    for (let i = 1; i <= 12; i++) empty[`s${i}`] = 0;
    return { ok: true, status: empty };
  }
  return { ok: true, status: row };
}

// ── 儲存某節資料（先清除該 quarter 的舊資料，再批次寫入）───────

function saveSection(p) {
  const { quarter, section, rows } = p;
  if (!quarter || !section || !Array.isArray(rows)) {
    return { ok: false, error: 'quarter, section, rows required' };
  }

  const def = SHEET_DEFS[section];
  if (!def) return { ok: false, error: 'Unknown section: ' + section };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreate(ss, def.name, def.headers);
  const now = new Date().toISOString().slice(0, 10);

  // 刪除該 quarter 的所有舊列（倒序刪）
  const vals = sheet.getDataRange().getValues();
  const qIdx = def.headers.indexOf('quarter');
  for (let i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][qIdx]) === String(quarter)) {
      sheet.deleteRow(i + 1);
    }
  }

  // 寫入新資料
  if (rows.length > 0) {
    const matrix = rows.map(r =>
      def.headers.map(h => h === 'updatedAt' ? now : (r[h] !== undefined ? r[h] : ''))
    );
    sheet.getRange(sheet.getLastRow() + 1, 1, matrix.length, def.headers.length).setValues(matrix);
  }

  return { ok: true, saved: rows.length };
}

// ── 儲存 12 節完成狀態 ──────────────────────────────────────────

function saveStatus(p) {
  const { quarter, statuses } = p;
  if (!quarter || !statuses) return { ok: false, error: 'quarter, statuses required' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const def = SHEET_DEFS.status;
  const sheet = getOrCreate(ss, def.name, def.headers);
  const now = new Date().toISOString().slice(0, 10);

  const vals = sheet.getDataRange().getValues();
  const qIdx = def.headers.indexOf('quarter');

  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][qIdx]) === String(quarter)) {
      def.headers.forEach((h, j) => {
        if (h === 'updatedAt') sheet.getRange(i + 1, j + 1).setValue(now);
        else if (h === 'quarter') sheet.getRange(i + 1, j + 1).setValue(quarter);
        else if (statuses[h] !== undefined) sheet.getRange(i + 1, j + 1).setValue(statuses[h]);
      });
      return { ok: true, action: 'updated' };
    }
  }

  // 新增
  const row = def.headers.map(h => {
    if (h === 'updatedAt') return now;
    if (h === 'quarter') return quarter;
    return statuses[h] !== undefined ? statuses[h] : 0;
  });
  sheet.appendRow(row);
  return { ok: true, action: 'inserted' };
}

// ── 工具函式 ─────────────────────────────────────────────────────

function getOrCreate(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const vals = sheet.getDataRange().getValues();
  if (vals.length < 2) return [];
  const hdr = vals[0];
  return vals.slice(1).map(r => {
    const o = {};
    hdr.forEach((h, i) => o[h] = r[i]);
    return o;
  });
}
