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
  }
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
    if      (p.action === 'add')    result = addItem(p.item);
    else if (p.action === 'update') result = updateItem(p.item);
    else if (p.action === 'delete') result = deleteItem(p.id);
    else                            result = {ok:false, error:'Unknown action'};
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
