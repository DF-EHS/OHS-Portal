// ═══════════════════════════════════════════════════════════════════
//  OHS Portal — 職安工作中樞 後端 (Google Apps Script)
//
//  部署步驟：
//  1. 開新 Google 試算表，命名「職安工作清單」
//  2. 擴充功能 → Apps Script → 貼上此程式碼
//  3. 部署 → 新增部署 → 類型選「網頁應用程式」
//     · 執行身分：我自己
//     · 存取權限：所有人（包含匿名使用者）
//  4. 複製部署後的網址，貼至 tasks/index.html 的 GS_API 常數
// ═══════════════════════════════════════════════════════════════════

const SHEET_NAME = "tasks";
const HEADERS = [
  "id", "title", "category", "dueAt", "repeatRule", "status", "priority", "owner",
  "description", "reminderDays", "reminderTime", "tags", "documents",
  "createdAt", "updatedAt", "noDueDate",
  "repeatWeekday", "repeatMonthDay", "repeatQuarterMonth", "repeatQuarterDay",
  "repeatHalfYearMonth", "repeatHalfYearDay", "repeatYearMonth", "repeatYearDay",
  "repeatCustomText"
];

function _resp(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function _ensureSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function _findRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(1, 1, lastRow, 1).getValues().flat().map(String);
  const idx = ids.indexOf(String(id));
  return idx <= 0 ? -1 : idx + 1;
}

function _taskToRow(task) {
  return HEADERS.map(function(h) {
    if (h === "tags" || h === "documents") {
      var v = task[h];
      return Array.isArray(v) ? JSON.stringify(v) : "[]";
    }
    if (h === "noDueDate") return task[h] ? "TRUE" : "FALSE";
    var v = task[h];
    return (v === undefined || v === null) ? "" : String(v);
  });
}

function _rowToTask(headers, row) {
  var obj = {};
  headers.forEach(function(h, i) {
    var v = row[i];
    if (h === "tags" || h === "documents") {
      try { obj[h] = JSON.parse(v || "[]"); } catch(e) { obj[h] = []; }
    } else if (h === "noDueDate") {
      obj[h] = v === true || v === "TRUE" || v === "true";
    } else if (h === "reminderDays") {
      obj[h] = (v === "" || v === null || v === undefined) ? 7 : Number(v);
    } else {
      obj[h] = (v === null || v === undefined) ? "" : String(v);
    }
  });
  return obj;
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = _ensureSheet(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return _resp({ tasks: [] });
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(String);
    var tasks = data.slice(1)
      .filter(function(row) { return row[0]; })
      .map(function(row) { return _rowToTask(headers, row); });
    return _resp({ tasks: tasks });
  } catch(err) {
    return _resp({ error: err.toString() });
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = _ensureSheet(ss);

    if (action === "bulkWrite") {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
      var tasks = payload.tasks || [];
      tasks.forEach(function(task) { sheet.appendRow(_taskToRow(task)); });
      return _resp({ ok: true });
    }

    if (action === "add") {
      sheet.appendRow(_taskToRow(payload.task));
      return _resp({ ok: true });
    }

    if (action === "update") {
      var rowIdx = _findRowById(sheet, payload.task.id);
      if (rowIdx < 2) {
        sheet.appendRow(_taskToRow(payload.task));
      } else {
        sheet.getRange(rowIdx, 1, 1, HEADERS.length).setValues([_taskToRow(payload.task)]);
      }
      return _resp({ ok: true });
    }

    if (action === "delete") {
      var rowIdx2 = _findRowById(sheet, payload.id);
      if (rowIdx2 >= 2) sheet.deleteRow(rowIdx2);
      return _resp({ ok: true });
    }

    return _resp({ error: "Unknown action: " + action });
  } catch(err) {
    return _resp({ error: err.toString() });
  }
}
