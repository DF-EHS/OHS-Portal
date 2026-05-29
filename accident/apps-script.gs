// ═══════════════════════════════════════════════════════════════════
//  OHS Portal — 職業災害分析系統 後端 (Google Apps Script)
//
//  Sheets 第一列欄位標題（順序無關，按名稱對應）：
//  發生日期 | 事發地點 | 事故分類 | 事故類型 | 事發單位部門 | 改善完成日期
//  員工姓名 | 員工工號 | 預估休息天數 | 事故描述及處理狀況或受傷情形
//  不安全行為 | 不安全狀況 | 基本原因 | 本案責任初步判定 | 是否懲處
//
//  FR/SR 工時資料：在同一個試算表建立名為「工時」的第二個分頁
//  欄位：年度（A欄） | 總工時人時（B欄）
//
//  部署步驟：
//  1. 開啟職災 Google 試算表 → 擴充功能 → Apps Script
//  2. 貼上此程式碼並儲存
//  3. 部署 → 管理部署 → 編輯 → 新增版本 → 部署
//     （首次：部署 → 新增部署 → 網頁應用程式 → 執行身分：我自己 → 所有人可存取）
//  4. 複製新的部署網址，貼至 accident/index.html 的 DATA_URL 常數
// ═══════════════════════════════════════════════════════════════════

// 欄位標題 → JavaScript 欄位名稱
const COL_MAP = {
  '發生日期':                    'date',
  '事發地點':                    'location',
  '事故分類':                    'accClass',
  '事故類型':                    'accType',
  '事發單位部門':                'dept',
  '改善完成日期':                'fixDate',
  '員工姓名':                    'name',
  '員工工號':                    'empId',
  '預估休息天數':                'restDays',
  '事故描述及處理狀況或受傷情形': 'description',
  '不安全行為':                  'unsafeBehavior',
  '不安全狀況':                  'unsafeCondition',
  '基本原因':                    'rootCause',
  '本案責任初步判定':            'responsibility',
  '是否懲處':                    'punished',
};

// 各年度總工時（人數 × 8小時 × 年工作天）
// 計算根據：2023=175人×249天, 2024=250人×251天, 2025=270人×246天, 2026=240人×245天（預估）
const ANNUAL_HOURS = {
  '2023': 175 * 8 * 249,   // 348,600
  '2024': 250 * 8 * 251,   // 502,000
  '2025': 270 * 8 * 246,   // 531,360
  '2026': 240 * 8 * 245,   // 470,400（全年預估）
};

// 不計入 FR/SR 的年度（工時資料不完整）
const SKIP_FRSR_YEARS = ['2022'];

function _fmt(v) {
  if (v instanceof Date) {
    var y = v.getFullYear();
    var m = String(v.getMonth() + 1).padStart(2, '0');
    var d = String(v.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return (v === null || v === undefined) ? '' : String(v).trim();
}

function _quarter(month) {
  var m = parseInt(month, 10);
  if (m <= 3) return 'Q1';
  if (m <= 6) return 'Q2';
  if (m <= 9) return 'Q3';
  return 'Q4';
}

function doGet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── 事故明細（第一個分頁）──────────────────────────────────────
    var accSheet = ss.getSheets()[0];
    var accData  = accSheet.getDataRange().getValues();
    if (accData.length < 2) return _resp({ accidents: [], frsr: {} });

    var rawHeaders = accData[0].map(function(h){ return String(h).trim(); });
    var headers    = rawHeaders.map(function(h){ return COL_MAP[h] || h; });

    var accidents = accData.slice(1)
      .filter(function(row){ return row[0]; })
      .map(function(row){
        var obj = {};
        headers.forEach(function(key, i){ obj[key] = _fmt(row[i]); });
        // 衍生欄位（不存在於 Sheets，由此計算）
        // 支援 YYYYMMDD（無分隔）與 YYYY-MM-DD 兩種格式
        var raw = (obj.date || '').replace(/[^0-9]/g, ''); // 去掉所有非數字
        var y = '', mo = '';
        if (raw.length >= 8) {
          y  = raw.slice(0, 4);
          mo = raw.slice(4, 6);
          obj.date = y + '-' + mo + '-' + raw.slice(6, 8); // 統一格式化為 YYYY-MM-DD
        }
        obj.year     = y;
        obj.month    = mo;
        obj.quarter  = mo ? _quarter(mo) : '';
        obj.restDays = parseFloat(obj.restDays) || 0;
        return obj;
      });

    // ── 工時資料（優先讀「工時」分頁；若無則使用 ANNUAL_HOURS 常數）──
    var hoursMap   = Object.assign({}, ANNUAL_HOURS);
    var hoursSheet = ss.getSheetByName('工時') || ss.getSheetByName('frsr');
    if (hoursSheet) {
      var hData = hoursSheet.getDataRange().getValues();
      hData.slice(1).forEach(function(row){
        if (row[0]) hoursMap[String(row[0]).trim()] = parseFloat(row[1]) || 0;
      });
    }

    // ── 計算各年度 FR / SR ─────────────────────────────────────────
    var byYear = {};
    accidents.forEach(function(a){
      if (!a.year) return;
      if (!byYear[a.year]) byYear[a.year] = { total:0, disabling:0, days:0 };
      byYear[a.year].total++;
      if (a.restDays > 0) {
        byYear[a.year].disabling++;
        byYear[a.year].days += a.restDays;
      }
    });

    var frsr = {};
    Object.keys(byYear).forEach(function(yr){
      var d     = byYear[yr];
      var hours = hoursMap[yr] || 0;
      var skip  = SKIP_FRSR_YEARS.indexOf(yr) >= 0 || !hours;
      frsr[yr] = {
        total:     d.total,
        disabling: d.disabling,
        days:      d.days,
        hours:     hours,
        fr: skip ? null : Math.round(d.disabling / hours * 1e6 * 100) / 100,
        sr: skip ? null : Math.round(d.days      / hours * 1e6 * 100) / 100,
      };
    });

    return _resp({ accidents: accidents, frsr: frsr });

  } catch(e) {
    return _resp({ error: e.toString() });
  }
}

function _resp(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
