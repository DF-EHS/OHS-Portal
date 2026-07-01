/**
 * 廠商名冊 GAS 後端片段
 * 將以下程式碼貼入現有承攬商管理 GAS 腳本，並在 Google Sheets 新增一個頁籤「廠商名冊」
 *
 * 廠商名冊頁籤欄位（A~F）：
 *   A: code       (例 VDR-001)
 *   B: name       廠商名稱
 *   C: contact    聯絡人
 *   D: phone      電話
 *   E: note       備註
 *   F: createdAt  建立時間 (ISO 8601)
 *
 * 使用方式：在現有 doGet / doPost 的 action 路由區段加入以下三段 if
 */

// ── 廠商名冊 Sheet 取得 ──────────────────────────
const VENDOR_SHEET_NAME = '廠商名冊';

function getVendorSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(VENDOR_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(VENDOR_SHEET_NAME);
    sheet.appendRow(['code','name','contact','phone','note','createdAt']);
  }
  return sheet;
}

function vendorSheetToObjects(sheet) {
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(r => ({
    code:      r[0] || '',
    name:      r[1] || '',
    contact:   r[2] || '',
    phone:     r[3] || '',
    note:      r[4] || '',
    createdAt: r[5] || '',
  })).filter(v => v.code);
}

function nextVendorCode(sheet) {
  const vendors = vendorSheetToObjects(sheet);
  if (!vendors.length) return 'VDR-001';
  const nums = vendors.map(v => parseInt((v.code || '').replace('VDR-', '')) || 0);
  return 'VDR-' + String(Math.max(...nums) + 1).padStart(3, '0');
}

// ────────────────────────────────────────────────
// 在現有 doGet / doPost 的 action 判斷區段貼入：
// ────────────────────────────────────────────────

  // ── listVendors (GET) ──
  if (p.action === 'listVendors') {
    const sheet = getVendorSheet();
    const vendors = vendorSheetToObjects(sheet);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, vendors }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── saveVendor (POST) ──
  // 無 code → 新增；有 code → 更新對應列
  if (p.action === 'saveVendor') {
    const sheet = getVendorSheet();
    const v = p.vendor || {};
    if (!v.name) return error('name required');

    if (!v.code) {
      // 新增
      const code = nextVendorCode(sheet);
      sheet.appendRow([code, v.name, v.contact||'', v.phone||'', v.note||'', new Date().toISOString()]);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, code }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      // 更新
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === v.code) {
          sheet.getRange(i + 1, 2, 1, 4).setValues([[v.name, v.contact||'', v.phone||'', v.note||'']]);
          return ContentService
            .createTextOutput(JSON.stringify({ ok: true }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      return error('vendor not found: ' + v.code);
    }
  }

  // ── delVendor (POST) ──
  if (p.action === 'delVendor') {
    const sheet = getVendorSheet();
    const code = p.code;
    if (!code) return error('code required');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === code) {
        sheet.deleteRow(i + 1);
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    return error('vendor not found: ' + code);
  }

// ────────────────────────────────────────────────
// helper function（若現有腳本已有 error() 則不需重複定義）
// ────────────────────────────────────────────────
function error(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
