// ═══════════════════════════════════════════════════════════════════
//  OHS Portal — 承攬商管理系統 後端 (Google Apps Script)
//
//  試算表「進場申請」分頁欄位結構（共 15 欄）：
//  col1  紀錄編號    col2  送出時間    col3  承攬商名稱  col4  合約/訂單編號
//  col5  工程名稱    col6  現場負責人  col7  聯絡電話   col8  作業開始日期
//  col9  作業結束日期 col10 工作區域   col11 作業時段   col12 作業人員數
//  col13 負責人姓名  col14 已編輯時間  col15 完整資料JSON（API 讀取用）
//
//  廠商名冊分頁欄位（共 6 欄）：
//  A  廠商代碼(VDR-001)  B  廠商名稱  C  聯絡人  D  電話  E  備註  F  建立時間
//
//  更新步驟：
//  1. 全選→刪除→貼上此程式碼→儲存（Ctrl+S）
//  2. 部署 → 管理部署 → 鉛筆圖示 → 版本選「新增版本」→ 部署
// ═══════════════════════════════════════════════════════════════════

// ── 共用工具 ─────────────────────────────────────────────────────────
function _resp(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function _fmt(v) {
  if (v instanceof Date) {
    return v.getFullYear() + '-' +
      String(v.getMonth() + 1).padStart(2, '0') + '-' +
      String(v.getDate()).padStart(2, '0');
  }
  return (v === null || v === undefined) ? '' : String(v);
}

// 取得申請紀錄分頁（優先找有資料的「進場申請」）
function _getRecordsSheet(ss) {
  var candidates = ['進場申請', 'records', '工作表1', 'Sheet1'];
  for (var i = 0; i < candidates.length; i++) {
    var s = ss.getSheetByName(candidates[i]);
    if (s && s.getLastRow() > 1) return s;
  }
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName() === 'evaluations') continue;
    if (sheets[i].getName() === '廠商名冊') continue;
    if (sheets[i].getLastRow() > 1) return sheets[i];
  }
  var fallback = ss.getSheetByName('進場申請') || ss.insertSheet('進場申請');
  return fallback;
}

// 取得評核分頁（固定名稱，需要時自動建立）
function _getEvalSheet(ss) {
  var sheet = ss.getSheetByName('evaluations');
  if (!sheet) {
    sheet = ss.insertSheet('evaluations');
    sheet.appendRow(['id', 'data', 'savedAt', 'savedBy']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 取得廠商名冊分頁（需要時自動建立）
function _getVendorSheet(ss) {
  var sheet = ss.getSheetByName('廠商名冊');
  if (!sheet) {
    sheet = ss.insertSheet('廠商名冊');
    sheet.appendRow(['code', 'name', 'contact', 'phone', 'note', 'createdAt']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 依 col1 找出列號（2-based），找不到回傳 -1
function _findRow(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
  var idx = ids.indexOf(String(id));
  return idx < 0 ? -1 : idx + 2;
}

// 將 Sheet 一列轉為完整紀錄物件
// 優先讀 col15 完整JSON，若無則從各欄重建基本資料
function _rowToRecord(row) {
  var ncols = row.length;
  var jsonStr = ncols >= 15 ? String(row[14] || '') : '';
  if (jsonStr && jsonStr.charAt(0) === '{') {
    try { return JSON.parse(jsonStr); } catch (e) {}
  }
  // 備用：從各欄重建
  var timePeriodRaw = String(row[10] || '');
  var timePeriod = timePeriodRaw ? timePeriodRaw.split('/').filter(Boolean) : [];
  return {
    id: String(row[0] || ''),
    submittedAt: String(row[1] || ''),
    basic: {
      company:    _fmt(row[2]),
      contract:   _fmt(row[3]),
      workname:   _fmt(row[4]),
      supervisor: _fmt(row[5]),
      phone:      _fmt(row[6]),
      dateStart:  _fmt(row[7]),
      dateEnd:    _fmt(row[8]),
      area:       _fmt(row[9]),
      timePeriod: timePeriod,
    },
    signee:   _fmt(row[12]),
    editedAt: _fmt(row[13]),
  };
}

// 將電話等數字字串以文字格式寫入試算表（前綴 ' 讓 Sheets 保留開頭 0）
function _asText(s) {
  var str = String(s || '');
  return str ? "'" + str : '';
}

// 將紀錄物件轉為 15 欄列陣列（供 appendRow / setValues 使用）
function _recordToRow(data) {
  var b = data.basic || {};
  var tp = Array.isArray(b.timePeriod) ? b.timePeriod.join('/') : String(b.timePeriod || '');
  return [
    String(data.id || ''),
    data.submittedAt || '',
    String(b.company || ''),
    String(b.contract || ''),
    String(b.workname || ''),
    String(b.supervisor || ''),
    _asText(b.phone),                            // col7 電話 → 強制文字，保留開頭 0
    String(b.dateStart || ''),
    String(b.dateEnd || ''),
    String(b.area || ''),
    tp,
    Array.isArray(data.workers) ? data.workers.length : 0,
    String(data.signee || ''),
    data.editedAt || '',
    JSON.stringify(data),   // col15：完整資料JSON
  ];
}

// 將廠商名冊列轉為物件
function _vendorSheetToObjects(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var rows = sheet.getRange(2, 1, last - 1, 6).getValues();
  return rows
    .filter(function(r) { return r[0]; })
    .map(function(r) {
      return {
        code:      String(r[0] || ''),
        name:      String(r[1] || ''),
        contact:   String(r[2] || ''),
        phone:     String(r[3] || ''),
        note:      String(r[4] || ''),
        createdAt: String(r[5] || ''),
      };
    });
}

// 自動產生下一個廠商代碼（VDR-001, VDR-002, …）
function _nextVendorCode(sheet) {
  var vendors = _vendorSheetToObjects(sheet);
  if (!vendors.length) return 'VDR-001';
  var nums = vendors.map(function(v) {
    return parseInt((v.code || '').replace('VDR-', '')) || 0;
  });
  return 'VDR-' + String(Math.max.apply(null, nums) + 1).padStart(3, '0');
}

// ── doGet ──────────────────────────────────────────────────────────
function doGet(e) {
  try {
    var params = e.parameter || {};
    var action = params.action || 'list';
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── 列出所有進場申請（摘要）──
    if (action === 'list') {
      var sheet = _getRecordsSheet(ss);
      var last = sheet.getLastRow();
      if (last < 2) return _resp({ success: true, records: [] });
      var ncols = Math.max(sheet.getLastColumn(), 15);
      var rows = sheet.getRange(2, 1, last - 1, ncols).getValues();
      var records = [];
      rows.forEach(function (row) {
        if (!row[0]) return;
        var rec = _rowToRecord(row);
        records.push({
          id: rec.id,
          submittedAt: rec.submittedAt,
          editedAt: rec.editedAt || null,
          type: rec.type || 'regular',
          basic: {
            company:    (rec.basic && rec.basic.company)    || '',
            workname:   (rec.basic && rec.basic.workname)   || '',
            supervisor: (rec.basic && rec.basic.supervisor) || '',
            phone:      (rec.basic && rec.basic.phone)      || '',
            dateStart:  (rec.basic && rec.basic.dateStart)  || '',
            dateEnd:    (rec.basic && rec.basic.dateEnd)    || '',
            timePeriod: (rec.basic && rec.basic.timePeriod) || [],
          },
        });
      });
      return _resp({ success: true, records: records });
    }

    // ── 取得單筆完整紀錄 ──
    if (action === 'get') {
      var id = params.id;
      if (!id) return _resp({ success: false, error: '缺少 id 參數' });
      var sheet = _getRecordsSheet(ss);
      var rowNum = _findRow(sheet, id);
      if (rowNum < 0) return _resp({ success: false, error: '找不到此紀錄' });
      var ncols = Math.max(sheet.getLastColumn(), 15);
      var row = sheet.getRange(rowNum, 1, 1, ncols).getValues()[0];
      return _resp({ success: true, record: _rowToRecord(row) });
    }

    // ── 取得單筆評核 ──
    if (action === 'getEval') {
      var id = params.id;
      if (!id) return _resp({ ok: false, data: null });
      var sheet = ss.getSheetByName('evaluations');
      if (!sheet || sheet.getLastRow() < 2) return _resp({ ok: false, data: null });
      var rowNum = _findRow(sheet, id);
      if (rowNum < 0) return _resp({ ok: false, data: null });
      var dataStr = sheet.getRange(rowNum, 2).getValue();
      return _resp({ ok: true, data: JSON.parse(dataStr) });
    }

    // ── 列出所有有評核的紀錄 ID ──
    if (action === 'listEvals') {
      var sheet = ss.getSheetByName('evaluations');
      if (!sheet || sheet.getLastRow() < 2) return _resp({ ok: true, ids: [] });
      var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
        .getValues().flat().map(String).filter(Boolean);
      return _resp({ ok: true, ids: ids });
    }

    // ── 列出所有廠商 ──
    if (action === 'listVendors') {
      var sheet = _getVendorSheet(ss);
      var vendors = _vendorSheetToObjects(sheet);
      return _resp({ ok: true, vendors: vendors });
    }

    return _resp({ success: false, error: '未知的 action: ' + action });

  } catch (err) {
    return _resp({ success: false, error: err.toString() });
  }
}

// ── doPost ─────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── 新增進場申請 ──
    if (action === 'submit') {
      var data = payload.data;
      if (!data || !data.id) return _resp({ success: false, error: '資料格式錯誤' });
      var sheet = _getRecordsSheet(ss);
      sheet.appendRow(_recordToRow(data));
      return _resp({ success: true, id: data.id });
    }

    // ── 更新進場申請（含動火/特殊危害巡檢）──
    if (action === 'update') {
      var id = payload.id;
      var data = payload.data;
      if (!id || !data) return _resp({ success: false, error: '缺少 id 或 data' });
      var sheet = _getRecordsSheet(ss);
      var rowNum = _findRow(sheet, id);
      if (rowNum < 0) return _resp({ success: false, error: '找不到此紀錄' });
      var row = _recordToRow(data);
      sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
      return _resp({ success: true, ok: true });
    }

    // ── 刪除進場申請 ──
    if (action === 'delete') {
      var id = payload.id;
      if (!id) return _resp({ success: false, error: '缺少 id' });
      var sheet = _getRecordsSheet(ss);
      var rowNum = _findRow(sheet, id);
      if (rowNum < 0) return _resp({ success: false, error: '找不到此紀錄' });
      sheet.deleteRow(rowNum);
      return _resp({ success: true });
    }

    // ── 儲存完工評核 ──
    if (action === 'saveEval') {
      var id = payload.id;
      var data = payload.data;
      if (!id || !data) return _resp({ ok: false, error: '缺少 id 或 data' });
      var sheet = _getEvalSheet(ss);
      var now = new Date().toISOString();
      var dataStr = JSON.stringify(data);
      var rowNum = _findRow(sheet, id);
      if (rowNum >= 2) {
        sheet.getRange(rowNum, 2, 1, 3).setValues([[dataStr, now, payload.savedBy || '']]);
      } else {
        sheet.appendRow([String(id), dataStr, now, payload.savedBy || '']);
      }
      return _resp({ ok: true });
    }

    // ── 新增或更新廠商 ──
    if (action === 'saveVendor') {
      var v = payload.vendor || {};
      if (!v.name) return _resp({ ok: false, error: 'name required' });
      var sheet = _getVendorSheet(ss);

      if (!v.code) {
        // 無代碼 → 新增，自動產生流水號
        var code = _nextVendorCode(sheet);
        sheet.appendRow([code, v.name, v.contact || '', _asText(v.phone), v.note || '', new Date().toISOString()]);
        return _resp({ ok: true, code: code });
      } else {
        // 有代碼 → 找到對應列更新
        var rowNum = _findRow(sheet, v.code);
        if (rowNum < 0) return _resp({ ok: false, error: 'vendor not found: ' + v.code });
        sheet.getRange(rowNum, 2, 1, 4).setValues([[v.name, v.contact || '', _asText(v.phone), v.note || '']]);
        return _resp({ ok: true });
      }
    }

    // ── 刪除廠商 ──
    if (action === 'delVendor') {
      var code = payload.code;
      if (!code) return _resp({ ok: false, error: 'code required' });
      var sheet = _getVendorSheet(ss);
      var rowNum = _findRow(sheet, code);
      if (rowNum < 0) return _resp({ ok: false, error: 'vendor not found: ' + code });
      sheet.deleteRow(rowNum);
      return _resp({ ok: true });
    }

    return _resp({ success: false, error: '未知的 action: ' + action });

  } catch (err) {
    return _resp({ success: false, error: err.toString() });
  }
}
