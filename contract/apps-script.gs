// ═══════════════════════════════════════════════════════════════════
//  OHS Portal — 承攬商管理系統 後端 (Google Apps Script)
//
//  部署步驟（首次）：
//  1. 開啟承攬商管理 Google 試算表
//  2. 上方選單 → 擴充功能 → Apps Script
//  3. 把這份程式碼「全選→刪除→貼上→儲存」
//  4. 部署 → 新增部署 → 類型選「網頁應用程式」
//       執行身分：我（試算表擁有者）
//       存取權限：所有人（含匿名）
//  5. 複製部署網址 → 貼回 contract/index.html 的 API_URL 常數
//
//  更新腳本（已有部署）：
//  1. 修改程式碼後儲存
//  2. 部署 → 管理部署 → 鉛筆圖示（編輯）→ 版本選「新增版本」→ 部署
//     （網址不變，不需更新 HTML）
//
//  Sheet 結構（自動建立）：
//  ┌─────────────┬──────────────────────────────────────┐
//  │  records    │  id | data（JSON）| submittedAt       │
//  ├─────────────┼──────────────────────────────────────┤
//  │ evaluations │  id | data（JSON）| savedAt | savedBy │
//  └─────────────┴──────────────────────────────────────┘
// ═══════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────
//  共用工具
// ────────────────────────────────────────────────────────────────────
function _resp(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// 取得申請紀錄 Sheet：
//   1. 優先取名為 'records' 且有資料的分頁
//   2. 其次取第一個有資料、非 'evaluations' 的分頁（相容原始分頁名稱）
//   3. 都沒有才建立新的 'records' 分頁
function _getRecordsSheet(ss) {
  var named = ss.getSheetByName('records');
  if (named && named.getLastRow() > 1) return named;

  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    if (s.getName() === 'evaluations') continue;
    if (s.getLastRow() > 1) return s; // 找到有資料的分頁
  }

  if (!named) {
    named = ss.insertSheet('records');
    named.appendRow(['id', 'data', 'submittedAt']);
    named.setFrozenRows(1);
  }
  return named;
}

// 取得評核 Sheet（固定名稱，需要就建立）
function _getEvalSheet(ss) {
  var sheet = ss.getSheetByName('evaluations');
  if (!sheet) {
    sheet = ss.insertSheet('evaluations');
    sheet.appendRow(['id', 'data', 'savedAt', 'savedBy']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _findRow(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
  var idx = ids.indexOf(String(id));
  return idx < 0 ? -1 : idx + 2; // 1-based, +1 for header row
}

// ────────────────────────────────────────────────────────────────────
//  doGet — 處理 GET 請求
//  ?action=list | get&id=xxx | getEval&id=xxx | listEvals
// ────────────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    var params = e.parameter || {};
    var action = params.action || 'list';
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {

      // ── 取得所有申請紀錄（列表）────────────────────────────────────
      case 'list': {
        var sheet = _getRecordsSheet(ss);
        var last = sheet.getLastRow();
        if (last < 2) return _resp({ success: true, records: [] });
        var rows = sheet.getRange(2, 1, last - 1, 2).getValues();
        var records = [];
        rows.forEach(function(row) {
          if (!row[0]) return;
          try {
            var rec = JSON.parse(row[1]);
            // 僅傳輸列表頁需要的欄位，減少資料量
            records.push({
              id: rec.id,
              submittedAt: rec.submittedAt,
              basic: {
                company:    rec.basic && rec.basic.company    || '',
                workname:   rec.basic && rec.basic.workname   || '',
                supervisor: rec.basic && rec.basic.supervisor || '',
                dateStart:  rec.basic && rec.basic.dateStart  || '',
                dateEnd:    rec.basic && rec.basic.dateEnd    || '',
                timePeriod: rec.basic && rec.basic.timePeriod || [],
              }
            });
          } catch(e) { /* 跳過格式錯誤列 */ }
        });
        return _resp({ success: true, records: records });
      }

      // ── 取得單筆申請紀錄（完整）────────────────────────────────────
      case 'get': {
        var id = params.id;
        if (!id) return _resp({ success: false, error: '缺少 id 參數' });
        var sheet = _getRecordsSheet(ss);
        var rowNum = _findRow(sheet, id);
        if (rowNum < 0) return _resp({ success: false, error: '找不到此紀錄' });
        var dataStr = sheet.getRange(rowNum, 2).getValue();
        var record = JSON.parse(dataStr);
        return _resp({ success: true, record: record });
      }

      // ── 取得單筆評核資料──────────────────────────────────────────
      case 'getEval': {
        var id = params.id;
        if (!id) return _resp({ ok: false, data: null });
        var sheet = ss.getSheetByName('evaluations');
        if (!sheet || sheet.getLastRow() < 2) return _resp({ ok: false, data: null });
        var rowNum = _findRow(sheet, id);
        if (rowNum < 0) return _resp({ ok: false, data: null });
        var dataStr = sheet.getRange(rowNum, 2).getValue();
        return _resp({ ok: true, data: JSON.parse(dataStr) });
      }

      // ── 取得所有已評核的申請 ID 清單─────────────────────────────
      case 'listEvals': {
        var sheet = ss.getSheetByName('evaluations');
        if (!sheet || sheet.getLastRow() < 2) return _resp({ ok: true, ids: [] });
        var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
          .getValues().flat().map(String).filter(Boolean);
        return _resp({ ok: true, ids: ids });
      }

      default:
        return _resp({ success: false, error: '未知的 action: ' + action });
    }

  } catch (err) {
    return _resp({ success: false, error: err.toString() });
  }
}

// ────────────────────────────────────────────────────────────────────
//  doPost — 處理 POST 請求
//  payload.action: submit | update | delete | saveEval
// ────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {

      // ── 新增申請紀錄────────────────────────────────────────────
      case 'submit': {
        var data = payload.data;
        if (!data || !data.id) return _resp({ success: false, error: '資料格式錯誤' });
        var sheet = _getRecordsSheet(ss);
        sheet.appendRow([
          String(data.id),
          JSON.stringify(data),
          data.submittedAt || new Date().toISOString()
        ]);
        return _resp({ success: true, id: data.id });
      }

      // ── 更新申請紀錄────────────────────────────────────────────
      case 'update': {
        var id = payload.id;
        var data = payload.data;
        if (!id || !data) return _resp({ success: false, error: '缺少 id 或 data' });
        var sheet = _getRecordsSheet(ss);
        var rowNum = _findRow(sheet, id);
        if (rowNum < 0) return _resp({ success: false, error: '找不到此紀錄' });
        sheet.getRange(rowNum, 2).setValue(JSON.stringify(data));
        return _resp({ success: true });
      }

      // ── 刪除申請紀錄────────────────────────────────────────────
      case 'delete': {
        var id = payload.id;
        if (!id) return _resp({ success: false, error: '缺少 id' });
        var sheet = _getRecordsSheet(ss);
        var rowNum = _findRow(sheet, id);
        if (rowNum < 0) return _resp({ success: false, error: '找不到此紀錄' });
        sheet.deleteRow(rowNum);
        return _resp({ success: true });
      }

      // ── 儲存 / 更新評核資料────────────────────────────────────
      case 'saveEval': {
        var id = payload.id;
        var data = payload.data;
        if (!id || !data) return _resp({ ok: false, error: '缺少 id 或 data' });
        var sheet = _getEvalSheet(ss);
        var now = new Date().toISOString();
        var dataStr = JSON.stringify(data);
        var rowNum = _findRow(sheet, id);
        if (rowNum >= 2) {
          // 更新現有列
          sheet.getRange(rowNum, 2, 1, 3).setValues([[dataStr, now, payload.savedBy || '']]);
        } else {
          // 新增
          sheet.appendRow([String(id), dataStr, now, payload.savedBy || '']);
        }
        return _resp({ ok: true });
      }

      default:
        return _resp({ success: false, error: '未知的 action: ' + action });
    }

  } catch (err) {
    return _resp({ success: false, error: err.toString() });
  }
}
