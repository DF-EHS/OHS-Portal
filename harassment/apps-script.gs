// ═══════════════════════════════════════════════════════════════════
//  OHS Portal — 不法侵害防制系統 後端 (Google Apps Script)
//
//  部署步驟：
//  1. 建立新的 Google 試算表（專門用於本系統，勿與其他系統共用）
//  2. 擴充功能 → Apps Script → 貼上此程式碼
//  3. 部署 → 新增部署 → 網頁應用程式 → 執行身分：我自己 → 所有人可存取
//  4. 複製部署網址，貼至 harassment/index.html 的 API 常數
//
//  注意：ADMIN_TOKEN 必須與 harassment/index.html 的 ADMIN_PASS 一致
// ═══════════════════════════════════════════════════════════════════

const ADMIN_TOKEN = 'admin';  // ← 請修改此密碼（同步修改前端 ADMIN_PASS）

function doGet(e) {
  const token = e && e.parameter && e.parameter.token;
  if (token !== ADMIN_TOKEN) {
    return _resp({ error: '無效的管理員憑證' });
  }
  return _resp(_getAllCases());
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.action === 'submit') return _resp(_submitCase(b));
    if (b.action === 'query')  return _resp(_queryCase(b.caseNo));
    if (b.action === 'update') {
      if (b.token !== ADMIN_TOKEN) return _resp({ error: '無效的管理員憑證' });
      return _resp(_updateCase(b));
    }
    return _resp({ error: '未知的 action: ' + b.action });
  } catch(err) {
    return _resp({ error: err.toString() });
  }
}

function _sh() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function _ensureHeader(sh) {
  if (sh.getLastRow() > 0) return;
  sh.appendRow([
    '案件編號', '通報日期', '事件類型', '是否匿名',
    '申訴人姓名', '申訴人部門', '申訴人聯絡',
    '被申訴人姓名', '被申訴人部門', '被申訴人類別',
    '事件日期', '事件時間', '發生地點', '事件描述',
    '是否有目擊者', '目擊者說明', '是否有傷害', '傷害情形',
    'AI分析結果', '案件狀態', 'HR備註', '結案說明', '申訴人已知會', '最後更新'
  ]);
}

function _genCaseNo() {
  const now = new Date();
  const ym  = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return 'CASE-' + ym + '-' + rand;
}

function _fmt(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
  }
  return (v === null || v === undefined) ? '' : String(v);
}

function _submitCase(b) {
  const sh  = _sh();
  _ensureHeader(sh);

  const caseNo = _genCaseNo();
  const now    = _fmt(new Date());

  sh.appendRow([
    caseNo,
    now,
    (b.types || []).join('、'),
    b.anonymous ? '匿名' : '具名',
    b.reporterName    || '',
    b.reporterDept    || '',
    b.reporterContact || '',
    b.accusedName     || '',
    b.accusedDept     || '',
    b.accusedType     || '',
    b.incidentDate    || '',
    b.incidentTime    || '',
    b.location        || '',
    b.description     || '',
    b.hasWitness ? '是' : '否',
    b.witnessDesc     || '',
    b.hasInjury  ? '是' : '否',
    b.injuryDesc      || '',
    b.aiAnalysis      || '',
    '待處理',
    '', '', '否',
    now
  ]);

  return { caseNo: caseNo, submitDate: now };
}

function _queryCase(caseNo) {
  if (!caseNo) return { error: '請輸入案件編號' };
  const sh   = _sh();
  const data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(caseNo).trim()) {
      return {
        caseNo:      data[i][0],
        submitDate:  _fmt(data[i][1]),
        types:       data[i][2],
        status:      data[i][19],
        lastUpdated: _fmt(data[i][23]),
        hrMessage:   data[i][21] || ''
      };
    }
  }
  return { error: '找不到此案件編號，請確認後重試' };
}

function _getAllCases() {
  const sh   = _sh();
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { cases: [] };

  const headers = data[0];
  const cases   = data.slice(1)
    .filter(function(r){ return r[0]; })
    .map(function(row, idx){
      var obj = {};
      headers.forEach(function(h, i){ obj[h] = _fmt(row[i]); });
      obj._row = idx + 2;
      return obj;
    });

  return { cases: cases };
}

function _updateCase(b) {
  const sh   = _sh();
  const data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(b.caseNo).trim()) {
      const row = i + 1;
      if (b.status     !== undefined) sh.getRange(row, 20).setValue(b.status);
      if (b.hrNotes    !== undefined) sh.getRange(row, 21).setValue(b.hrNotes);
      if (b.resolution !== undefined) sh.getRange(row, 22).setValue(b.resolution);
      if (b.notified   !== undefined) sh.getRange(row, 23).setValue(b.notified);
      sh.getRange(row, 24).setValue(_fmt(new Date()));
      return { message: '已更新' };
    }
  }
  return { error: '案件不存在' };
}

function _resp(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
