// ═══════════════════════════════════════════════════════════════════
//  承攬商評核系統 — GAS 後端擴充程式碼
//
//  使用方式：
//  1. 開啟合約管理系統的 Google Apps Script 專案
//  2. 將下方三個函數加入現有的 doGet / doPost 的 switch 區塊
//  3. 重新「部署」→「管理部署」→ 更新版本後取得新網址（或舊網址不變即可）
//
//  Google Sheet 結構：
//  - 自動建立名為「evaluations」的分頁
//  - 欄位：id | data（JSON）| savedAt | savedBy
// ═══════════════════════════════════════════════════════════════════


// ── 在 doGet 的 switch(action) 內加入以下兩個 case ──────────────────

/*
case 'getEval':
  return _resp(handleGetEval(params));

case 'listEvals':
  return _resp(handleListEvals());
*/


// ── 在 doPost 的 switch(payload.action) 內加入以下一個 case ─────────

/*
case 'saveEval':
  return _resp(handleSaveEval(payload));
*/


// ── 以下為三個函數的實作，貼到 GAS 檔案任意位置 ──────────────────────

const EVAL_SHEET = 'evaluations';
const EVAL_HEADERS = ['id', 'data', 'savedAt', 'savedBy'];

function _getEvalSheet(ss) {
  var sheet = ss.getSheetByName(EVAL_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(EVAL_SHEET);
    sheet.appendRow(EVAL_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function handleGetEval(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EVAL_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { ok: false, data: null };

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(params.id)) {
      try {
        return { ok: true, data: JSON.parse(rows[i][1]) };
      } catch (e) {
        return { ok: false, data: null };
      }
    }
  }
  return { ok: false, data: null };
}

function handleSaveEval(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = _getEvalSheet(ss);
  var now = new Date().toISOString();
  var dataStr = JSON.stringify(payload.data);

  if (sheet.getLastRow() >= 2) {
    var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().map(String);
    var idx = ids.indexOf(String(payload.id));
    if (idx >= 0) {
      // 更新現有列（第 2 列起，+2 補回 header）
      sheet.getRange(idx + 2, 2, 1, 3).setValues([[dataStr, now, payload.savedBy || '']]);
      return { ok: true };
    }
  }
  // 新增
  sheet.appendRow([String(payload.id), dataStr, now, payload.savedBy || '']);
  return { ok: true };
}

function handleListEvals() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EVAL_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, ids: [] };

  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().map(String).filter(Boolean);
  return { ok: true, ids: ids };
}
