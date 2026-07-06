// ════════════════════════════════════════════════════
// 危害鑑別及風險評估  Apps Script API
// ════════════════════════════════════════════════════

const SPREADSHEET_ID = '1OPYxtVRu--L7NybnHOBvrwTCQVKxM9pGsu9DpbhJcy8';

// 廠別靜態資訊（圖示、類別等不常變動的欄位）
const DEPT_META = {
  hq: {
    dept_name:'總公司', dept_icon:'🏢', year:'114',
    fill_date:'114.08.01', author:'賴佑毓',
    use_categories: false, categories: []
  },
  qx: {
    dept_name:'全興廠', dept_icon:'🏭', year:'114',
    fill_date:'114.08.01', author:'洪健翔',
    use_categories: true,
    categories: [
      {id:'visitor',    name:'訪客與承攬商',       icon:'👥',  ic:'ic-blue'},
      {id:'production', name:'生產製程作業',       icon:'⚙️', ic:'ic-orange'},
      {id:'equipment',  name:'設備與機具作業',     icon:'🔧',  ic:'ic-purple'},
      {id:'utility',    name:'公用工程與環保設施',  icon:'🏭',  ic:'ic-blue'},
      {id:'admin',      name:'行政實驗室與建物',    icon:'🏢',  ic:'ic-purple'}
    ]
  },
  sg: { dept_name:'神岡站',  dept_icon:'🏭', year:'113', fill_date:'',           author:'林家煜', use_categories:false, categories:[] },
  hm: { dept_name:'和美站',  dept_icon:'🏭', year:'113', fill_date:'',           author:'劉昌明', use_categories:false, categories:[] },
  jm: { dept_name:'金馬站',  dept_icon:'🏭', year:'113', fill_date:'2024-06-27', author:'黃奕儒', use_categories:false, categories:[] },
  s1: { dept_name:'南一',    dept_icon:'🚛', year:'113', fill_date:'112.12.06',  author:'',       use_categories:false, categories:[] },
  n1: { dept_name:'北一',    dept_icon:'🚛', year:'113', fill_date:'',           author:'',       use_categories:false, categories:[] },
  n2: { dept_name:'北二',    dept_icon:'🚛', year:'113', fill_date:'',           author:'',       use_categories:false, categories:[] },
  z1: { dept_name:'中一',    dept_icon:'🚛', year:'114', fill_date:'',           author:'',       use_categories:false, categories:[] },
  yl: { dept_name:'員林站',  dept_icon:'🏭', year:'113', fill_date:'',           author:'',       use_categories:false, categories:[] },
  dl: { dept_name:'斗六站',  dept_icon:'🏭', year:'113', fill_date:'',           author:'',       use_categories:false, categories:[] },
  s2: { dept_name:'南二',    dept_icon:'🚛', year:'113', fill_date:'',           author:'',       use_categories:false, categories:[] },
  ct: { dept_name:'草屯站',  dept_icon:'🏭', year:'113', fill_date:'',           author:'',       use_categories:false, categories:[] },
};

const SHEET_ICONS = [
  ['訪客','👥'],['承攬商','🏗️'],['廢棄物','♻️'],['倉儲','📦'],
  ['分選','🔀'],['解包','📤'],['粉碎','⚙️'],['造粒','🔥'],
  ['色選','🎨'],['濾網','🧹'],['包裝','📦'],['堆高機','🚜'],
  ['磨刀','🔪'],['自動化','🤖'],['廢水','💧'],['電氣','⚡'],
  ['工務','🔧'],['空汙','🌬️'],['實驗室','🧪'],['屋頂','🏠'],['行政','📋']
];

const CAT_IC = {
  visitor:'ic-blue', production:'ic-orange',
  equipment:'ic-purple', utility:'ic-blue', admin:'ic-purple'
};

function getIcon(name) {
  for (const [kw, icon] of SHEET_ICONS) {
    if (String(name).includes(kw)) return icon;
  }
  return '📄';
}

// ── 讀取 ────────────────────────────────────────────
function doGet(e) {
  return respond(buildAllData());
}

// ── 寫入 ────────────────────────────────────────────
function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    let result;
    if (p.action === 'add' || p.action === 'update') {
      const item = Object.assign({}, p.item, {
        dept_id:    p.dept_id    || '',
        sheet_id:   p.sheet_id   || '',
        sheet_name: p.sheet_name || '',
        category:   p.category   || ''
      });
      result = p.action === 'add' ? addItem(item) : updateItem(item);
    } else if (p.action === 'delete') {
      result = deleteItem(p.item_id || p.id);
    } else if (p.action === 'deleteSheet') {
      result = deleteSheet(p.dept_id, p.sheet_id);
    } else if (p.action === 'bulkSync') {
      result = bulkSync(p.rows);
    } else {
      result = {ok:false, error:'Unknown action'};
    }
    return respond(result);
  } catch(err) {
    return respond({ok:false, error:err.toString()});
  }
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 工具：讀取全部資料列 ─────────────────────────────
function getSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
}

function getAllRows() {
  const vals = getSheet().getDataRange().getValues();
  if (vals.length < 2) return { headers: vals[0] || [], rows: [] };
  const headers = vals[0];
  const rows = vals.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  });
  return { headers, rows };
}

// ── 把 Sheets 資料重組成前端需要的巢狀結構 ───────────
function buildAllData() {
  const { rows } = getAllRows();
  const depts = {};

  rows.forEach(r => {
    const did = r.dept_id;
    if (!did) return;
    if (!depts[did]) {
      depts[did] = { ...DEPT_META[did], dept_id: did, _sheets: {} };
    }
    const sid = r.sheet_id;
    if (!depts[did]._sheets[sid]) {
      depts[did]._sheets[sid] = {
        id: sid, name: r.sheet_name,
        icon: getIcon(r.sheet_name),
        ic: CAT_IC[r.category] || 'ic-blue',
        category: r.category || '',
        items: []
      };
    }
    depts[did]._sheets[sid].items.push({
      id:          String(r.id          || ''),
      process:     String(r.process     || ''),
      step:        String(r.step        || ''),
      hazard:      String(r.hazard      || ''),
      cause:       String(r.cause       || ''),
      consequence: String(r.consequence || ''),
      code:        String(r.code        || ''),
      control:     String(r.control     || ''),
      freq:        r.freq     !== '' ? Number(r.freq)     : null,
      prob:        r.prob     !== '' ? Number(r.prob)     : null,
      severity:    String(r.severity || '') || null,
      level:       r.level    !== '' ? Number(r.level)    : null,
      plan:        String(r.plan || '')
    });
  });

  return Object.values(depts).map(d => {
    const { _sheets, ...rest } = d;
    return { ...rest, sheets: Object.values(_sheets) };
  });
}

// ── 新增 ─────────────────────────────────────────────
function addItem(item) {
  const { headers } = getAllRows();
  const row = headers.map(h => item[h] !== undefined ? item[h] : '');
  getSheet().appendRow(row);
  return { ok: true };
}

// ── 更新 ─────────────────────────────────────────────
function updateItem(item) {
  const sheet = getSheet();
  const vals  = sheet.getDataRange().getValues();
  const hdr   = vals[0];
  const idCol = hdr.indexOf('id');
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][idCol] === item.id) {
      hdr.forEach((h, j) => {
        if (item[h] !== undefined) sheet.getRange(i+1, j+1).setValue(item[h]);
      });
      return { ok: true };
    }
  }
  return { ok: false, error: 'Record not found' };
}

// ── 刪除 ─────────────────────────────────────────────
function deleteItem(id) {
  const sheet = getSheet();
  const vals  = sheet.getDataRange().getValues();
  const idCol = vals[0].indexOf('id');
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][idCol] === id) {
      sheet.deleteRow(i+1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Record not found' };
}

// ── 刪除整個作業表（所有 sheet_id 符合的列）───────────
function deleteSheet(deptId, sheetId) {
  const sheet = getSheet();
  const vals  = sheet.getDataRange().getValues();
  if (vals.length < 2) return { ok: true, deleted: 0 };
  const hdr      = vals[0];
  const deptCol  = hdr.indexOf('dept_id');
  const sheetCol = hdr.indexOf('sheet_id');
  let deleted = 0;
  for (let i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][deptCol]) === String(deptId) &&
        String(vals[i][sheetCol]) === String(sheetId)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  return { ok: true, deleted };
}

// ── 批次新增（初始遷移用）────────────────────────────
function bulkSync(rows) {
  if (!Array.isArray(rows) || !rows.length) return { ok: true, added: 0 };
  const { headers } = getAllRows();
  const sheet = getSheet();
  const matrix = rows.map(item => headers.map(h => item[h] !== undefined ? item[h] : ''));
  sheet.getRange(sheet.getLastRow() + 1, 1, matrix.length, headers.length).setValues(matrix);
  return { ok: true, added: matrix.length };
}
