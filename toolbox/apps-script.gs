// ═══════════════════════════════════════════════════════════════════
//  OHS Portal — 工具箱會議系統 後端 (Google Apps Script)
//
//  試算表分頁：
//    meetings  — 每場會議主記錄
//    attendees — 每位簽到人員記錄
//    photos    — 每張現場照片的 SharePoint URL
//
//  部署方式：
//    1. 新建一份 Google Sheets（空白）
//    2. 延伸功能 → Apps Script → 貼上此程式碼 → Ctrl+S
//    3. 部署 → 新增部署作業 → 類型「網頁應用程式」
//       執行身分：我　存取權限：所有人
//    4. 複製部署 URL → 填入 toolbox/index.html 的 GAS_URL 變數
// ═══════════════════════════════════════════════════════════════════

const SS = () => SpreadsheetApp.getActiveSpreadsheet();

// ── 值格式化（防止 Sheets 把 date/time 字串轉成 Date 物件後讀回異常）──
function _fmtVal(colName, val) {
  if (!(val instanceof Date)) return val === null || val === undefined ? '' : val;
  var tz = Session.getScriptTimeZone();
  if (colName === 'date')     return Utilities.formatDate(val, tz, 'yyyy-MM-dd');
  if (colName === 'time')     return Utilities.formatDate(val, tz, 'HH:mm');
  return val.toISOString();
}

// ── 取得（或自動建立）分頁 ─────────────────────────────────────────

function _sheet(name, headers) {
  let sh = SS().getSheetByName(name);
  if (!sh) {
    sh = SS().insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

function _meetingsSheet() {
  return _sheet('meetings', [
    'id','type','date','time','location','area','workersCount',
    'hostName','hostRole','hostSignature',
    'extraData','notes','createdAt','closedAt','attendeeCount',
  ]);
}
function _attendeesSheet() {
  return _sheet('attendees', [
    'meetingId','name','department','employeeId','signature','signedAt',
  ]);
}
function _photosSheet() {
  return _sheet('photos', [
    'meetingId','sharepointUrl','fileName','description','uploadedAt',
  ]);
}

// ── HTTP 入口 ───────────────────────────────────────────────────────

function doGet(e)  { return _handle(e); }
function doPost(e) { return _handle(e); }

function _handle(e) {
  try {
    const body   = e.postData ? JSON.parse(e.postData.contents) : {};
    const action = (e.parameter || {}).action || body.action || 'listMeetings';
    const days   = parseInt((e.parameter || {}).days || body.days || 30);
    const id     = (e.parameter || {}).id || body.id;

    if      (action === 'createMeeting')        return _out(_createMeeting(body));
    else if (action === 'getMeeting')            return _out(_getMeeting(id));
    else if (action === 'listMeetings')          return _out(_listMeetings(days));
    else if (action === 'signIn')                return _out(_signIn(body));
    else if (action === 'getAttendees')          return _out(_getAttendees(id, false));
    else if (action === 'getAttendeesWithSig')   return _out(_getAttendees(id, true));
    else if (action === 'closeMeeting')          return _out(_closeMeeting(id));
    else if (action === 'savePhotoUrl')          return _out(_savePhotoUrl(body));
    else throw new Error('Unknown action: ' + action);
  } catch(err) {
    return _out({ success: false, error: err.message });
  }
}

function _out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── createMeeting ────────────────────────────────────────────────────

function _createMeeting(body) {
  const sh  = _meetingsSheet();
  const id  = _genId(body.type || 'tbm');
  const now = new Date().toISOString();

  sh.appendRow([
    id,
    body.type || 'tbm',
    body.date || '',
    body.time || '',
    body.location || '',
    body.area || '',
    body.workersCount || '',
    body.hostName || '',
    body.hostRole || '',
    body.hostSignature || '',
    body.extraData || '{}',
    body.notes || '',
    now,
    '',   // closedAt
    0,    // attendeeCount
  ]);

  // 強制 date(col3) 和 time(col4) 為文字格式，防止 Sheets 自動轉 Date
  var lastRow = sh.getLastRow();
  sh.getRange(lastRow, 3, 1, 2).setNumberFormat('@');

  return { success: true, id };
}

function _genId(type) {
  const prefix = type === 'kyt' ? 'KYT' : 'TBM';
  const date   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const sh     = _meetingsSheet();
  const last   = sh.getLastRow();
  let seq = 1;
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
    const todayIds = ids.filter(id => id.startsWith(prefix + '-' + date));
    seq = todayIds.length + 1;
  }
  return `${prefix}-${date}-${String(seq).padStart(3,'0')}`;
}

// ── getMeeting ───────────────────────────────────────────────────────

function _getMeeting(id) {
  const sh   = _meetingsSheet();
  const hdr  = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rows = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow()-1, hdr.length).getValues()
    : [];

  const row = rows.find(r => String(r[0]) === String(id));
  if (!row) throw new Error('找不到會議：' + id);

  const record = {};
  hdr.forEach((h, i) => { record[h] = _fmtVal(h, row[i]); });
  return { success: true, record };
}

// ── listMeetings ─────────────────────────────────────────────────────

function _listMeetings(days) {
  const sh   = _meetingsSheet();
  const hdr  = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (sh.getLastRow() < 2) return { success: true, records: [] };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const rows = sh.getRange(2, 1, sh.getLastRow()-1, hdr.length).getValues();
  const records = rows
    .filter(r => r[0] && String(r[2]) >= cutoffStr)
    .map(r => {
      const o = {};
      hdr.forEach((h, i) => {
        // 僅回傳摘要欄位（不含 hostSignature / extraData 以節省流量）
        if (h !== 'hostSignature' && h !== 'extraData') {
          o[h] = _fmtVal(h, r[i]);
        }
      });
      return o;
    });

  return { success: true, records };
}

// ── signIn ───────────────────────────────────────────────────────────

function _signIn(body) {
  if (!body.meetingId || !body.name) throw new Error('缺少 meetingId 或 name');

  const attSh = _attendeesSheet();
  attSh.appendRow([
    body.meetingId,
    body.name,
    body.department || '',
    body.employeeId || '',
    body.signature  || '',
    body.signedAt   || new Date().toISOString(),
  ]);

  // 更新 meetings 的 attendeeCount
  const mtgSh = _meetingsSheet();
  const hdr   = mtgSh.getRange(1, 1, 1, mtgSh.getLastColumn()).getValues()[0];
  const rows  = mtgSh.getLastRow() > 1
    ? mtgSh.getRange(2, 1, mtgSh.getLastRow()-1, hdr.length).getValues()
    : [];
  const rowIdx = rows.findIndex(r => String(r[0]) === String(body.meetingId));
  if (rowIdx >= 0) {
    const countCol = hdr.indexOf('attendeeCount') + 1;
    const oldCount = parseInt(rows[rowIdx][hdr.indexOf('attendeeCount')] || 0);
    mtgSh.getRange(rowIdx + 2, countCol).setValue(oldCount + 1);
  }

  return { success: true };
}

// ── getAttendees ─────────────────────────────────────────────────────

function _getAttendees(meetingId, includeSig) {
  const sh   = _attendeesSheet();
  const hdr  = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (sh.getLastRow() < 2) return { success: true, attendees: [] };

  const rows = sh.getRange(2, 1, sh.getLastRow()-1, hdr.length).getValues();
  const attendees = rows
    .filter(r => String(r[0]) === String(meetingId))
    .map(r => {
      const o = {};
      hdr.forEach((h, i) => {
        if (h === 'signature' && !includeSig) return; // 輪詢時不回傳簽名圖
        o[h] = _fmtVal(h, r[i]);
      });
      return o;
    });

  return { success: true, attendees };
}

// ── closeMeeting ─────────────────────────────────────────────────────

function _closeMeeting(id) {
  const sh   = _meetingsSheet();
  const hdr  = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rows = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow()-1, hdr.length).getValues()
    : [];
  const rowIdx = rows.findIndex(r => String(r[0]) === String(id));
  if (rowIdx < 0) throw new Error('找不到會議：' + id);

  const closedCol = hdr.indexOf('closedAt') + 1;
  sh.getRange(rowIdx + 2, closedCol).setValue(new Date().toISOString());
  return { success: true };
}

// ── savePhotoUrl ─────────────────────────────────────────────────────

function _savePhotoUrl(body) {
  _photosSheet().appendRow([
    body.meetingId  || '',
    body.url        || '',
    body.fileName   || '',
    body.description|| '',
    new Date().toISOString(),
  ]);
  return { success: true };
}
