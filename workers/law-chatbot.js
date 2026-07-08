// ═══════════════════════════════════════════════════════════════
//  OHS Portal — Cloudflare Worker  v2.0
//
//  路由：
//   POST /                   → 現有 AI 問答（法規/風險/化學品等）
//   POST /committee-generate → 委員會報告 AI 生成 + GitHub push
//   GET  /                   → 健康檢查
//   OPTIONS *                → CORS preflight
//
//  需在 Cloudflare Dashboard > Workers & Pages > ohs-law-chatbot
//  > Settings > Variables 新增 Secret：
//    GITHUB_TOKEN = 你的 GitHub PAT（repo write 權限）
// ═══════════════════════════════════════════════════════════════

const IT_URL     = 'https://df-it-openrouter-dispatch-api.it.zerozero.tw/api/v1/model/chat';
const IT_SDK_KEY = 'ordsk_5c68e4065189_52E0L6tOLtnV5eJV5fn16sNf832gs47K';
const IT_TOKEN   = '8HLYWF4-Z7egt6PbrcDi4_tN5dRtOAaxryMLmVOSHHhD-0WZcTNSzOOWEfygmiyllogMQ9uKVjPtJO8TPxZNKbtfI9RcRwv5ey9DQ0IQttLGqSOl5sjzB16tWX5Q8KjNhNWBplxs0I4-yYpSWoL-FPWS_opMJ-YXjjiGlJLaT2zhK-W1OP5A6-r0lQXjrK99iTspHoMCbHNpL_jOa5rqLlq2CfjxD5cArWnpwJ4d387HKBH4MJNXAD388oGQfM1iuYyDcTiH0urh5SM4Xlj_fPD8IZFDmmBbSdS1zYHCqyf6hWLyU8SpcWV_buKM--YWVnGrUynenCEgXpew0u39Ui85JQ';
const IT_PROJECT = '53670008080830464';
const MODEL      = 'google/gemini-2.5-flash';

const GH_OWNER = 'DF-EHS';
const GH_REPO  = 'OHS-Portal';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ══════════════════════════════════════════════════════════════
//  工具函式
// ══════════════════════════════════════════════════════════════

function e(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ── 季度工具 ──────────────────────────────────────────────────
function qInfo(q) {
  const year = parseInt(q, 10);
  const qn   = parseInt(q.slice(-1), 10);
  const roc  = year - 1911;
  const names = ['第一季', '第二季', '第三季', '第四季'];
  const ms    = [[1,3],[4,6],[7,9],[10,12]][qn - 1];
  return {
    year, qn, roc,
    label:     `${year}年Q${qn}`,
    rocLabel:  `${roc}年${names[qn - 1]}`,
    dateRange: `${year}年${ms[0]}月至${ms[1]}月`,
    half:      qn <= 2 ? '上半年' : '下半年',
    path:      `committee/${year}/Q${qn}/index.html`,
    meeting:   `${roc}年第${qn}次職業安全衛生委員會議`,
  };
}

// ── IT API AI 呼叫 ────────────────────────────────────────────
async function callAI(prompt) {
  const res = await fetch(IT_URL, {
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'X-SDK-Key':      IT_SDK_KEY,
      'X-User-Token':   IT_TOKEN,
      'X-Project-Code': IT_PROJECT,
    },
    body: JSON.stringify({ model: MODEL, text: prompt }),
  });
  const j = await res.json();
  return (
    j.content ||
    (j.choices && j.choices[0]?.message?.content) ||
    j.text ||
    j.response ||
    ''
  );
}

// ── CSS 從 Q2 報告繼承 ────────────────────────────────────────
async function fetchStyle() {
  try {
    const r = await fetch(
      'https://raw.githubusercontent.com/DF-EHS/OHS-Portal/main/committee/2026/Q2/index.html'
    );
    const html = await r.text();
    const m = html.match(/<style>([\s\S]*?)<\/style>/);
    if (m) return `<style>${m[1]}</style>`;
  } catch (_) { /* fallback */ }

  // 最簡備用 CSS（當 GitHub fetch 失敗時）
  return `<style>
:root{--primary:#1e4a6e;--accent:#4caf50;--warning:#ff9800;--danger:#e53935;--info:#2196f3;
--bg:#f5f7fa;--card-bg:#fff;--text:#333;--text-light:#666;--border:#e0e0e0;
--shadow:0 2px 8px rgba(0,0,0,.1);--radius:12px;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI','Microsoft JhengHei',sans-serif;background:var(--bg);color:var(--text);line-height:1.7;font-size:15px;}
.container{max-width:1100px;margin:0 auto;padding:20px;}
.top-nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;}
.back-link{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#fff;color:var(--primary);border-radius:8px;text-decoration:none;font-size:.9em;font-weight:600;box-shadow:var(--shadow);transition:all .2s;}
.back-link:hover{background:var(--primary);color:#fff;}
.cover-card{background:linear-gradient(135deg,var(--primary),#2a6496);color:#fff;border-radius:var(--radius);padding:50px 40px;text-align:center;margin-bottom:30px;box-shadow:0 4px 20px rgba(0,0,0,.15);}
.cover-card h1{font-size:1.8em;font-weight:700;margin-bottom:10px;}
.cover-sub{font-size:1em;opacity:.85;margin-top:6px;}
.chapter{margin:32px 0 12px;padding:12px 0 8px 20px;border-left:4px solid var(--primary);}
.chapter-title{font-size:1.35em;font-weight:700;color:var(--primary);}
.chapter-subtitle{font-size:.9em;color:var(--text-light);margin-top:4px;}
.card{background:var(--card-bg);border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:16px;}
.card-header{padding:14px 20px;font-weight:700;border-radius:var(--radius) var(--radius) 0 0;background:#f0f5ff;border-bottom:1px solid var(--border);}
.card-body{padding:16px 20px;}
table{width:100%;border-collapse:collapse;}
th{background:var(--primary);color:#fff;padding:8px 12px;text-align:left;}
td{padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:top;}
tr:nth-child(even) td{background:#f8fafc;}
.badge{display:inline-flex;padding:2px 9px;border-radius:10px;font-size:.8em;font-weight:700;}
.badge-success{background:#e8f5e9;color:#2e7d32;}.badge-warning{background:#fff8e1;color:#f57f17;}
.badge-danger{background:#ffebee;color:#c62828;}.badge-info{background:#e3f2fd;color:#1565c0;}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:20px;}
.kpi-card{background:var(--card-bg);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow);border-top:4px solid var(--primary);}
.kpi-card.accent{border-top-color:var(--accent);}.kpi-card.warning{border-top-color:var(--warning);}
.kpi-card.danger{border-top-color:var(--danger);}.kpi-card.info{border-top-color:var(--info);}
.big-number{font-size:2em;font-weight:700;color:var(--primary);}
.kpi-card.accent .big-number{color:var(--accent);}.kpi-card.warning .big-number{color:var(--warning);}
.kpi-card.danger .big-number{color:var(--danger);}.kpi-card.info .big-number{color:var(--info);}
.kpi-label{font-size:.85em;color:var(--text-light);margin-top:4px;}
.highlight-card{padding:14px 18px;border-radius:8px;border-left:4px solid var(--warning);background:#fff8e1;margin-bottom:16px;}
.styled-list{padding-left:20px;}.styled-list li{margin-bottom:6px;}
.muted{color:var(--text-light);}.small{font-size:.85em;}
.kpi-good{color:#2e7d32;font-weight:700;}.kpi-bad{color:#c62828;font-weight:700;}.kpi-na{color:#aaa;}
.risk-high{color:#c62828;font-weight:700;}.risk-medium{color:#e65100;font-weight:700;}.risk-low{color:#2e7d32;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;}
@media(max-width:640px){.kpi-grid{grid-template-columns:1fr 1fr;}.two-col{grid-template-columns:1fr;}}
</style>`;
}

// ══════════════════════════════════════════════════════════════
//  各節 HTML 生成（直接格式化，不需 AI）
// ══════════════════════════════════════════════════════════════

function secS1() {
  return `
<div class="chapter" id="s1">
  <div class="chapter-title">一、職業安全衛生政策</div>
</div>
<div class="card">
  <div class="card-header">本公司職業安全衛生政策</div>
  <div class="card-body">
    <p>大豐環保科技秉持「安全第一、預防為主」之核心理念，致力為全體員工提供安全、健康的工作環境。</p>
    <ul class="styled-list" style="margin-top:12px">
      <li>遵守職業安全衛生相關法令規定，持續改善安全衛生績效。</li>
      <li>提供安全衛生所需資源，建立並維持安全衛生管理系統。</li>
      <li>定期執行安全衛生教育訓練，提升全體員工安全意識與技能。</li>
      <li>辨識與評估作業危害，採取預防措施以降低職業災害風險。</li>
      <li>推動員工參與安全衛生事務，落實自主管理與持續改進精神。</li>
      <li>定期溝通、諮詢與審查，確保安全衛生目標與計畫切實落實。</li>
    </ul>
  </div>
</div>`;
}

function secS3(rows, qi) {
  const body = rows.length
    ? `<table>
        <thead><tr><th>日期</th><th>訓練主題</th><th>地點</th><th>人數</th><th>備註</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${e(r.date)}</td><td>${e(r.topic)}</td><td>${e(r.location)}</td>
          <td style="text-align:center">${e(r.attendees)}</td><td>${e(r.notes)}</td>
        </tr>`).join('')}</tbody>
       </table>`
    : '<p class="muted">本季無教育訓練記錄。</p>';

  return `
<div class="chapter" id="s3">
  <div class="chapter-title">三、安全衛生教育訓練</div>
  <div class="chapter-subtitle">${qi.dateRange}${rows.length ? `，共 ${rows.length} 場` : ''}</div>
</div>
<div class="card">
  <div class="card-header">教育訓練紀錄</div>
  <div class="card-body">${body}</div>
</div>`;
}

function secS4(data, qi) {
  if (!data || !data.fetched) {
    return `
<div class="chapter" id="s4">
  <div class="chapter-title">四、作業環境監測</div>
  <div class="chapter-subtitle">${qi.year}年${qi.half}</div>
</div>
<div class="card"><div class="card-body"><p class="muted">本${qi.half}無作業環境監測資料。</p></div></div>`;
  }

  const recRows = data.records.map(r => `<tr>
    <td>${e(r.site)}</td>
    <td><span class="badge badge-${r.status === 'completed' ? 'success' : 'warning'}">${e(r.status)}</span></td>
    <td>${r.reportUrl ? `<a href="${e(r.reportUrl)}" target="_blank">查看報告</a>` : '—'}</td>
  </tr>`).join('');

  const valRows = data.values.map(v => {
    const pass = v.pass === 'true' || v.pass === true;
    return `<tr>
      <td>${e(v.site)}</td><td>${e(v.item)}</td><td>${e(v.location)}</td>
      <td>${e(v.value)} ${e(v.unit)}</td><td>${e(v.limit)}</td>
      <td><span class="badge badge-${pass ? 'success' : 'danger'}">${pass ? '符合' : '不符合'}</span></td>
    </tr>`;
  }).join('');

  return `
<div class="chapter" id="s4">
  <div class="chapter-title">四、作業環境監測</div>
  <div class="chapter-subtitle">${qi.year}年${qi.half}監測成果</div>
</div>
<div class="card">
  <div class="card-header">監測狀態（${data.records.length} 場）</div>
  <div class="card-body">
    ${data.records.length
      ? `<table><thead><tr><th>廠別</th><th>狀態</th><th>報告</th></tr></thead><tbody>${recRows}</tbody></table>`
      : '<p class="muted">無監測狀態記錄。</p>'}
  </div>
</div>
<div class="card">
  <div class="card-header">監測數值（${data.values.length} 筆）</div>
  <div class="card-body">
    ${data.values.length
      ? `<table><thead><tr><th>廠別</th><th>監測項目</th><th>地點</th><th>量測值</th><th>限值</th><th>判定</th></tr></thead><tbody>${valRows}</tbody></table>`
      : '<p class="muted">無監測數值記錄。</p>'}
  </div>
</div>`;
}

function secS5(data, qi) {
  if (!data || !data.fetched || !data.data.length) {
    return `
<div class="chapter" id="s5">
  <div class="chapter-title">五、健康管理</div>
  <div class="chapter-subtitle">${qi.dateRange}</div>
</div>
<div class="card"><div class="card-body"><p class="muted">本季無職護服務紀錄。</p></div></div>`;
  }

  const rows = data.data.map(r => `<tr>
    <td>${e(r['面談日期'] || '')}</td>
    <td>${e(r['姓名'] || '')}</td>
    <td>${e(r['部門'] || '')}</td>
    <td>${e(r['職護'] || '')}</td>
    <td>${e(r['備註'] || '')}</td>
  </tr>`).join('');

  return `
<div class="chapter" id="s5">
  <div class="chapter-title">五、健康管理</div>
  <div class="chapter-subtitle">${qi.dateRange}，共 ${data.data.length} 筆服務記錄</div>
</div>
<div class="card">
  <div class="card-header">職護臨場服務紀錄（${data.data.length} 筆）</div>
  <div class="card-body">
    <table><thead><tr><th>服務日期</th><th>員工姓名</th><th>部門</th><th>職護</th><th>備註</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>
</div>`;
}

function secS9(data, qi) {
  const accidents = data && data.accidents ? data.accidents : [];
  if (!accidents.length) {
    return `
<div class="chapter" id="s9">
  <div class="chapter-title">九、審議職業災害調查報告</div>
  <div class="chapter-subtitle">${qi.rocLabel}職災調查</div>
</div>
<div class="card"><div class="card-body">
  <div class="highlight-card" style="border-left-color:var(--accent);background:#e8f5e9">
    <strong>✅ 本季無職業災害事故。</strong>
  </div>
</div></div>`;
  }

  const disabling  = accidents.filter(a => (a.restDays || 0) > 0);
  const totalDays  = disabling.reduce((s, a) => s + (a.restDays || 0), 0);

  const rows = accidents.map((a, i) => `<tr>
    <td>${i + 1}</td>
    <td>${e(a.date)}</td>
    <td>${e(a.name)}（${e(a.empId)}）</td>
    <td>${e(a.dept || a.location || '')}</td>
    <td>${e(a.accType)}</td>
    <td class="${a.restDays > 0 ? 'kpi-bad' : 'kpi-good'}">${a.restDays > 0 ? `失能（${a.restDays}天）` : '0天'}</td>
    <td>${e(a.fixDate || '')}</td>
  </tr>`).join('');

  return `
<div class="chapter" id="s9">
  <div class="chapter-title">九、審議職業災害調查報告</div>
  <div class="chapter-subtitle">${qi.rocLabel}職災調查</div>
</div>
<div class="card"><div class="card-body">
  <div class="highlight-card">
    <strong>${qi.rocLabel}共發生 ${accidents.length} 件工安事故</strong>（${qi.dateRange}），
    失能傷害 ${disabling.length} 件，合計失能日數 ${totalDays} 天。
  </div>
  <div class="kpi-grid" style="margin-top:16px">
    <div class="kpi-card danger"><div class="big-number">${accidents.length}</div><div class="kpi-label">工安事故</div></div>
    <div class="kpi-card warning"><div class="big-number">${disabling.length}</div><div class="kpi-label">失能傷害（≥1天）</div></div>
    <div class="kpi-card accent"><div class="big-number">0</div><div class="kpi-label">交通事故</div></div>
    <div class="kpi-card accent"><div class="big-number">0</div><div class="kpi-label">上下班交通事故</div></div>
  </div>
  <table style="margin-top:16px">
    <thead><tr><th>#</th><th>發生日期</th><th>員工</th><th>事發地點</th><th>事故類型</th><th>失能狀況</th><th>改善完成日</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div></div>`;
}

function secS10(rows, qi) {
  const stBadge = { done:'success', in_progress:'info', pending:'warning', na:'info' };
  const stLabel = { done:'已完成', in_progress:'進行中', pending:'待執行', na:'本年不適用' };

  const trs = rows.map(k => `<tr>
    <td>${k.kpiId}</td>
    <td><strong>${e(k.name)}</strong><br><span class="small muted">${e(k.detail)}</span></td>
    <td>${e(k.target)}</td>
    <td class="${k.kpiStatus === 'done' ? 'kpi-good' : k.kpiStatus === 'na' ? 'kpi-na' : ''}">${e(k.actual) || '—'}</td>
    <td><span class="badge badge-${stBadge[k.kpiStatus] || 'info'}">${stLabel[k.kpiStatus] || e(k.kpiStatus)}</span></td>
  </tr>`).join('');

  return `
<div class="chapter" id="s10">
  <div class="chapter-title">十、考核現場安全衛生管理績效（KPI）</div>
  <div class="chapter-subtitle">${qi.rocLabel}執行成效</div>
</div>
<div class="card">
  <div class="card-header">KPI 達成狀況</div>
  <div class="card-body">
    <table>
      <thead><tr><th>#</th><th>指標名稱</th><th>目標值</th><th>${qi.label} 實際值</th><th>達成狀態</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>
</div>`;
}

function secS11(data, qi) {
  const records = data && data.records ? data.records : [];
  if (!records.length) {
    return `
<div class="chapter" id="s11">
  <div class="chapter-title">十一、承攬業務管理</div>
  <div class="chapter-subtitle">${qi.dateRange}</div>
</div>
<div class="card"><div class="card-body">
  <div class="highlight-card" style="border-left-color:var(--info);background:#e3f2fd">本季無承攬商進場作業記錄。</div>
</div></div>`;
  }

  const rows = records.map((r, i) => {
    const b = r.basic || {};
    return `<tr>
      <td>${i + 1}</td><td>${e(b.company)}</td><td>${e(b.workname)}</td>
      <td>${e(b.dateStart)} ~ ${e(b.dateEnd)}</td><td>${e(b.area || b.supervisor || '')}</td>
    </tr>`;
  }).join('');

  return `
<div class="chapter" id="s11">
  <div class="chapter-title">十一、承攬業務管理</div>
  <div class="chapter-subtitle">${qi.dateRange}</div>
</div>
<div class="card"><div class="card-body">
  <div class="highlight-card" style="border-left-color:var(--info);background:#e3f2fd">
    ${qi.rocLabel}共有 <strong>${records.length} 件</strong>承攬商進場作業，均已完成危害告知及安全衛生協議，作業期間無異常事件。
  </div>
  <div class="kpi-grid" style="margin-top:16px">
    <div class="kpi-card info"><div class="big-number">${records.length}</div><div class="kpi-label">本季進場廠商</div></div>
    <div class="kpi-card accent"><div class="big-number">0</div><div class="kpi-label">異常事件</div></div>
  </div>
  <table style="margin-top:16px">
    <thead><tr><th>#</th><th>承攬商</th><th>工程名稱</th><th>作業期間</th><th>工作區域</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div></div>`;
}

// ══════════════════════════════════════════════════════════════
//  AI 輔助節次生成（S2/S6/S7/S8/S12，含 fallback）
// ══════════════════════════════════════════════════════════════

const AI_SYS = `你是大豐環保科技的職安委員會報告助理。
請根據提供的資料生成對應章節的 HTML 內容。
輸出規則：
1. 只輸出 HTML，不含 <!DOCTYPE>/<html>/<body>/<head>
2. 使用 CSS class：card、card-header、card-body、badge（badge-success/warning/danger/info）、styled-list、highlight-card、two-col、kpi-grid、kpi-card、muted、small
3. 章節格式：<div class="chapter" id="sN"><div class="chapter-title">N、章節名稱</div><div class="chapter-subtitle">副標</div></div>
4. 繁體中文，語氣正式，適合委員會議閱讀
5. 禁止輸出 <script> 或 <style>`;

async function aiSec(sysPrompt, dataPrompt, fallbackFn) {
  try {
    const result = await callAI(`${sysPrompt}\n\n${dataPrompt}`);
    if (result && result.trim().length > 50) return result;
  } catch (_) { /* fall through */ }
  return fallbackFn();
}

async function secS2_ai(data, qi) {
  const done = data.done || [];
  const todo = data.todo || [];
  return aiSec(
    AI_SYS,
    `章節：二、安全衛生管理計畫執行情形（id="s2"）
季度：${qi.rocLabel}（${qi.dateRange}）

本季已完成事項（${done.length} 筆）：
${JSON.stringify(done)}

下季計畫事項（${todo.length} 筆）：
${JSON.stringify(todo)}

請生成本節 HTML，使用 two-col 分欄呈現「本季完成」與「下季計畫」。`,
    () => {
      const dRows = done.map(r => `<li>${r.date ? `<strong>${e(r.date)}</strong> — ` : ''}${e(r.item)}</li>`).join('');
      const tRows = todo.map(r => `<li>${r.date ? `<strong>${e(r.date)}</strong> — ` : ''}${e(r.item)}</li>`).join('');
      return `
<div class="chapter" id="s2">
  <div class="chapter-title">二、安全衛生管理計畫執行情形</div>
  <div class="chapter-subtitle">${qi.dateRange}</div>
</div>
<div class="two-col">
  <div class="card">
    <div class="card-header">本季完成事項（${done.length} 項）</div>
    <div class="card-body"><ul class="styled-list">${dRows || '<li class="muted">尚無記錄</li>'}</ul></div>
  </div>
  <div class="card">
    <div class="card-header">下季計畫事項（${todo.length} 項）</div>
    <div class="card-body"><ul class="styled-list">${tRows || '<li class="muted">尚無記錄</li>'}</ul></div>
  </div>
</div>`;
    }
  );
}

async function secS6_ai(data, qi) {
  if (!data || !data.length) {
    return `
<div class="chapter" id="s6">
  <div class="chapter-title">六、安全衛生提案</div>
  <div class="chapter-subtitle">${qi.dateRange}</div>
</div>
<div class="card"><div class="card-body"><p class="muted">本季無安全衛生提案記錄。</p></div></div>`;
  }
  return aiSec(
    AI_SYS,
    `章節：六、安全衛生提案（id="s6"）
季度：${qi.rocLabel}（${qi.dateRange}）

提案清單（${data.length} 件）：
${JSON.stringify(data)}

請生成本節 HTML，包含提案進度表格（編號、名稱、狀態 badge、說明）。`,
    () => {
      const rows = data.map(r => `<tr>
        <td>${e(r.propId)}</td><td>${e(r.title)}</td>
        <td><span class="badge badge-${r.status === '已完成' ? 'success' : r.status === '進行中' ? 'info' : 'warning'}">${e(r.status)}</span></td>
        <td>${e(r.note)}</td>
      </tr>`).join('');
      return `
<div class="chapter" id="s6">
  <div class="chapter-title">六、安全衛生提案</div>
  <div class="chapter-subtitle">${qi.dateRange}，共 ${data.length} 件</div>
</div>
<div class="card">
  <div class="card-header">安全衛生提案進度</div>
  <div class="card-body">
    <table><thead><tr><th>編號</th><th>提案名稱</th><th>狀態</th><th>說明</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>
</div>`;
    }
  );
}

async function secS7_ai(data, qi) {
  if (!data || !data.length) {
    return `
<div class="chapter" id="s7">
  <div class="chapter-title">七、自動檢查</div>
  <div class="chapter-subtitle">${qi.dateRange}</div>
</div>
<div class="card"><div class="card-body"><p class="muted">本季無自動檢查稽核記錄。</p></div></div>`;
  }
  return aiSec(
    AI_SYS,
    `章節：七、自動檢查（id="s7"）
季度：${qi.rocLabel}（${qi.dateRange}）

稽查紀錄（${data.length} 筆）：
${JSON.stringify(data)}

請生成本節 HTML，表格呈現日期、地點、發現缺失、改善結果。`,
    () => {
      const rows = data.map(r => `<tr>
        <td>${e(r.date)}</td><td>${e(r.location)}</td>
        <td>${e(r.findings)}</td><td>${e(r.improvements)}</td>
      </tr>`).join('');
      return `
<div class="chapter" id="s7">
  <div class="chapter-title">七、自動檢查</div>
  <div class="chapter-subtitle">${qi.dateRange}，共 ${data.length} 筆稽查記錄</div>
</div>
<div class="card">
  <div class="card-header">稽查紀錄</div>
  <div class="card-body">
    <table><thead><tr><th>日期</th><th>地點</th><th>發現事項</th><th>改善結果</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>
</div>`;
    }
  );
}

async function secS8_ai(data, qi) {
  if (!data || !data.length) {
    return `
<div class="chapter" id="s8">
  <div class="chapter-title">八、審議機械、設備或原料、材料危害之預防措施</div>
  <div class="chapter-subtitle">本季無新增機械設備重大異動</div>
</div>
<div class="card"><div class="card-body"><p class="muted">本季無審議事項。</p></div></div>`;
  }
  return aiSec(
    AI_SYS,
    `章節：八、審議機械、設備或原料、材料危害之預防措施（id="s8"）
季度：${qi.rocLabel}

審議事項（${data.length} 筆）：
${JSON.stringify(data)}

請生成本節 HTML，包含危害預防措施審議表格（設備/材料、危害類型、風險等級、採行措施、執行狀態）。風險等級高/中/低請分別用 badge-danger/warning/success。`,
    () => {
      const rows = data.map(r => `<tr>
        <td>${e(r.equipment)}</td><td>${e(r.hazardType)}</td>
        <td><span class="badge badge-${r.riskLevel === '高' ? 'danger' : r.riskLevel === '中' ? 'warning' : 'success'}">${e(r.riskLevel)}</span></td>
        <td>${e(r.measures)}</td><td>${e(r.status)}</td>
      </tr>`).join('');
      return `
<div class="chapter" id="s8">
  <div class="chapter-title">八、審議機械、設備或原料、材料危害之預防措施</div>
  <div class="chapter-subtitle">${qi.dateRange}</div>
</div>
<div class="card">
  <div class="card-header">危害預防措施審議（${data.length} 項）</div>
  <div class="card-body">
    <table><thead><tr><th>設備/材料</th><th>危害類型</th><th>風險等級</th><th>採行措施</th><th>執行狀態</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>
</div>`;
    }
  );
}

async function secS12_ai(data, qi) {
  if (!data || !data.length) {
    return `
<div class="chapter" id="s12">
  <div class="chapter-title">十二、其他事項</div>
</div>
<div class="card"><div class="card-body"><p class="muted">本季無其他補充事項。</p></div></div>`;
  }
  return aiSec(
    AI_SYS,
    `章節：十二、其他事項（id="s12"）
季度：${qi.rocLabel}

補充事項（${data.length} 筆）：
${JSON.stringify(data)}

請生成本節 HTML，每個主題獨立一張 card，內容以段落或條列呈現。`,
    () => {
      const cards = data.map(r => `
<div class="card">
  <div class="card-header">${e(r.title)}</div>
  <div class="card-body"><p>${e(r.content).replace(/\n/g, '<br>')}</p></div>
</div>`).join('');
      return `<div class="chapter" id="s12"><div class="chapter-title">十二、其他事項</div></div>${cards}`;
    }
  );
}

// ══════════════════════════════════════════════════════════════
//  報告組裝
// ══════════════════════════════════════════════════════════════

async function assembleReport(qi, secs) {
  const styleTag = await fetchStyle();
  const genDate  = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <link rel="icon" href="../../../favicon.svg" type="image/svg+xml">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${qi.label} 職安衛委員會報告｜大豐環保</title>
  ${styleTag}
</head>
<body>
<div class="container">

  <div class="top-nav">
    <a class="back-link" href="../../">← 返回委員會首頁</a>
    <span class="muted small">生成日期：${genDate}（AI 輔助生成）</span>
  </div>

  <div class="cover-card">
    <h1>${qi.meeting}</h1>
    <p class="cover-sub">${qi.rocLabel}（${qi.dateRange}）</p>
    <p class="cover-sub" style="opacity:.7;font-size:.9em;margin-top:8px">大豐環保科技股份有限公司</p>
  </div>

  ${secs.s1}
  ${secs.s2}
  ${secs.s3}
  ${secs.s4}
  ${secs.s5}
  ${secs.s6}
  ${secs.s7}
  ${secs.s8}
  ${secs.s9}
  ${secs.s10}
  ${secs.s11}
  ${secs.s12}

  <footer style="text-align:center;padding:30px 0;color:#999;font-size:12px;border-top:1px solid #eee;margin-top:40px">
    大豐環保科技股份有限公司職業安全衛生委員會 · ${qi.rocLabel} · 本報告由 AI 輔助生成
  </footer>

</div>
<script src="../../../shared/sidebar.js"></script>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════
//  GitHub API
// ══════════════════════════════════════════════════════════════

async function getFileSha(path, token) {
  const res = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
    { headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'OHS-Portal-Worker' } }
  );
  if (res.status === 404) return null;
  const j = await res.json();
  return j.sha || null;
}

async function pushToGitHub(path, html, token, quarter) {
  const sha     = await getFileSha(path, token);
  const encoded = btoa(unescape(encodeURIComponent(html))); // UTF-8 safe

  const body = {
    message:   `feat: auto-generate ${quarter} committee report\n\nGenerated by OHS Portal Builder + Gemini AI`,
    content:   encoded,
    committer: { name: 'OHS Portal Bot', email: 'ohs-portal@df-recycle.com' },
  };
  if (sha) body.sha = sha;

  const res = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
    {
      method:  'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'User-Agent':    'OHS-Portal-Worker',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub push failed (${res.status}): ${err}`);
  }
  return res.json();
}

// ══════════════════════════════════════════════════════════════
//  /committee-generate 主處理
// ══════════════════════════════════════════════════════════════

async function handleGenerate(request, env) {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    return jsonResp({ ok: false, error: 'GITHUB_TOKEN 未設定，請至 Cloudflare Dashboard > Workers > Settings > Variables 新增 Secret' }, 500);
  }

  let body;
  try { body = await request.json(); }
  catch (_) { return jsonResp({ ok: false, error: 'Invalid JSON' }, 400); }

  const { quarter, data } = body;
  if (!quarter || !data) return jsonResp({ ok: false, error: 'quarter 和 data 必填' }, 400);

  const qi = qInfo(quarter);
  const d  = data;

  // AI 節次並行生成（S2/S6/S7/S8/S12 同時送出）
  const [s2, s6, s7, s8, s12] = await Promise.all([
    secS2_ai(d.s2  || { done: [], todo: [] }, qi),
    secS6_ai(d.s6  || [], qi),
    secS7_ai(d.s7  || [], qi),
    secS8_ai(d.s8  || [], qi),
    secS12_ai(d.s12 || [], qi),
  ]);

  const secs = {
    s1:  secS1(),
    s2,
    s3:  secS3(d.s3  || [], qi),
    s4:  secS4(d.s4  || {}, qi),
    s5:  secS5(d.s5  || {}, qi),
    s6,
    s7,
    s8,
    s9:  secS9(d.s9  || {}, qi),
    s10: secS10(d.s10 || [], qi),
    s11: secS11(d.s11 || {}, qi),
    s12,
  };

  const html = await assembleReport(qi, secs);

  try {
    await pushToGitHub(qi.path, html, token, quarter);
  } catch (err) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }

  return jsonResp({
    ok:      true,
    url:     `https://df-ehs.github.io/OHS-Portal/${qi.path}`,
    quarter,
    path:    qi.path,
  });
}

// ══════════════════════════════════════════════════════════════
//  法規問答 Prompt（原有功能，保留不動）
// ══════════════════════════════════════════════════════════════

function buildLawPrompt(question, ragContext) {
  return (
    '你是大豐環保科技股份有限公司的職業安全衛生法規助理。公司業務為環保廢棄物回收處理，員工包含辦公室及現場作業人員。\n\n' +
    '請以下列兩個來源整合回答，若有出入請說明差異：\n' +
    '① 公司「法規鑑別資料庫」摘錄（如下）\n' +
    '② 你對台灣《職業安全衛生法》及相關法規的訓練知識\n\n' +
    '回答原則：\n' +
    '1. 直接回答，不重述問題\n' +
    '2. 引用條文時標明《法規名稱》第X條\n' +
    '3. 公司鑑別表合規狀態「不符」的條文請加粗提醒\n' +
    '4. 若鑑別表找不到相關條文，請直接依你的法規知識回答，並說明「鑑別表未收錄，以下依法規知識回覆」\n' +
    '5. 若問題涉及最新修法動態、施行日期或條文現況，請主動使用網路搜尋確認最新版本，並標註來源與查詢時間\n' +
    '6. 語氣專業親切，適合職安管理師參考\n\n' +
    '【公司法規鑑別表摘錄】\n' + ragContext +
    '\n\n使用者問題：' + question
  );
}

// ══════════════════════════════════════════════════════════════
//  主路由
// ══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // 新路由：委員會報告生成
    if (url.pathname === '/committee-generate') {
      if (request.method !== 'POST') return new Response('POST only', { status: 405 });
      return handleGenerate(request, env);
    }

    if (request.method === 'GET') {
      return new Response(
        JSON.stringify({ version: 'ohs-worker-v2', status: 'ok', routes: ['POST /', 'POST /committee-generate'] }),
        { headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 原有 AI 問答路由（法規/風險/化學品機器人）
    try {
      const { text, context, images } = await request.json();

      if (!text) return jsonResp({ error: 'missing text' }, 400);

      const finalText = context !== undefined ? buildLawPrompt(text, context) : text;
      const payload   = { model: MODEL, text: finalText, tools: [{ type: 'openrouter:web_search' }] };
      if (Array.isArray(images) && images.length) payload.images = images;

      const upstream = await fetch(IT_URL, {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'X-SDK-Key':      IT_SDK_KEY,
          'X-User-Token':   IT_TOKEN,
          'X-Project-Code': IT_PROJECT,
        },
        body: JSON.stringify(payload),
      });

      return new Response(await upstream.text(), {
        status:  upstream.status,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });

    } catch (err) {
      return jsonResp({ error: err.message }, 500);
    }
  },
};
