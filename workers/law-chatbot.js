// ═══════════════════════════════════════════════════════════════
//  OHS Portal — 法規問答機器人 Cloudflare Worker
//
//  功能：
//   1. CORS Proxy，轉發請求到公司 IT API 閘道器
//   2. 法規問答模式（text + context + webSearch:true）：
//      自動執行 Brave Web Search，將搜尋結果注入 Gemini prompt
//   3. 風險評估模式（text + images）：原有行為不變
//
//  需設定 Cloudflare Worker Secret：
//   BRAVE_KEY — Brave Search API Key（免費方案 2,000 次/月）
//   取得：https://brave.com/search/api/
// ═══════════════════════════════════════════════════════════════

const IT_URL     = 'https://df-it-openrouter-dispatch-api.it.zerozero.tw/api/v1/model/chat';
const IT_SDK_KEY = 'ordsk_5c68e4065189_52E0L6tOLtnV5eJV5fn16sNf832gs47K';
const IT_TOKEN   = '8HLYWF4-Z7egt6PbrcDi4_tN5dRtOAaxryMLmVOSHHhD-0WZcTNSzOOWEfygmiyllogMQ9uKVjPtJO8TPxZNKbtfI9RcRwv5ey9DQ0IQttLGqSOl5sjzB16tWX5Q8KjNhNWBplxs0I4-yYpSWoL-FPWS_opMJ-YXjjiGlJLaT2zhK-W1OP5A6-r0lQXjrK99iTspHoMCbHNpL_jOa5rqLlq2CfjxD5cArWnpwJ4d387HKBH4MJNXAD388oGQfM1iuYyDcTiH0urh5SM4Xlj_fPD8IZFDmmBbSdS1zYHCqyf6hWLyU8SpcWV_buKM--YWVnGrUynenCEgXpew0u39Ui85JQ';
const IT_PROJECT = '53670008080830464';
const MODEL      = 'google/gemini-2.5-flash';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Brave Web Search ─────────────────────────────────────────────
async function braveSearch(query, apiKey) {
  try {
    const q = encodeURIComponent('台灣 職業安全衛生法規 ' + query);
    const resp = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${q}&count=5&country=tw`,
      { headers: { 'X-Subscription-Token': apiKey, 'Accept': 'application/json' } }
    );
    if (!resp.ok) return '';
    const data = await resp.json();
    const results = (data?.web?.results || []).slice(0, 5);
    if (!results.length) return '';
    return '\n\n【網路搜尋結果（台灣職安法規）】\n' +
      results.map((r, i) =>
        `${i + 1}. ${r.title}\n   ${r.description || ''}\n   出處：${r.url}`
      ).join('\n\n');
  } catch {
    return '';
  }
}

// ── 法規問答 Prompt 組裝 ─────────────────────────────────────────
function buildLawPrompt(question, ragContext, webContext) {
  const hasBoth = webContext.length > 0;
  return (
    '你是大豐環保科技股份有限公司的職業安全衛生法規助理。公司業務為環保廢棄物回收處理，員工包含辦公室及現場作業人員。\n\n' +
    (hasBoth
      ? '請整合以下兩個來源回答，若兩者有出入請說明差異：\n'
      : '請依據公司法規鑑別資料庫回答，若條文不足請誠實說明：\n') +
    '\n回答原則：\n' +
    '1. 直接回答，不重述問題\n' +
    '2. 引用條文時標明《法規名稱》第X條\n' +
    '3. 公司鑑別表合規狀態「不符」的條文請加粗提醒\n' +
    '4. 語氣專業親切，適合職安管理師參考\n\n' +
    '【公司法規鑑別表摘錄】\n' + ragContext +
    webContext +
    '\n\n使用者問題：' + question
  );
}

// ── 主要 Handler ─────────────────────────────────────────────────
export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const { text, context, images, webSearch } = await request.json();

      if (!text) {
        return new Response(JSON.stringify({ error: 'missing text' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      // 法規問答模式：context 欄位存在時組裝完整 prompt（可含網路搜尋）
      let finalText = text;
      if (context !== undefined) {
        let webCtx = '';
        if (webSearch && env?.BRAVE_KEY) {
          webCtx = await braveSearch(text, env.BRAVE_KEY);
        }
        finalText = buildLawPrompt(text, context, webCtx);
      }

      const payload = { model: MODEL, text: finalText };
      if (Array.isArray(images) && images.length) payload.images = images;

      const upstream = await fetch(IT_URL, {
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'X-SDK-Key':      IT_SDK_KEY,
          'X-User-Token':   IT_TOKEN,
          'X-Project-Code': IT_PROJECT,
        },
        body: JSON.stringify(payload),
      });

      const body = await upstream.text();

      return new Response(body, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  },
};
