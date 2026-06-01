// ═══════════════════════════════════════════════════════════════
//  OHS Portal — 法規問答機器人 Cloudflare Worker
//
//  功能：
//   1. CORS Proxy，轉發請求到公司 IT API 閘道器
//   2. 法規問答模式（text + context）：
//      整合公司鑑別表 + Gemini 內建台灣職安法規知識
//   3. 風險評估模式（text + images）：原有行為不變
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

// ── 法規問答 Prompt 組裝 ─────────────────────────────────────────
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
    '5. 若法規可能在近期有修訂，請提醒使用者確認最新版本\n' +
    '6. 語氣專業親切，適合職安管理師參考\n\n' +
    '【公司法規鑑別表摘錄】\n' + ragContext +
    '\n\n使用者問題：' + question
  );
}

// ── 主要 Handler ─────────────────────────────────────────────────
export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === 'GET') {
      return new Response(JSON.stringify({ version: 'gemini-knowledge-v2', status: 'ok' }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const { text, context, images } = await request.json();

      if (!text) {
        return new Response(JSON.stringify({ error: 'missing text' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      // 法規問答模式：context 欄位存在時組裝完整 prompt
      const finalText = (context !== undefined)
        ? buildLawPrompt(text, context)
        : text;

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
