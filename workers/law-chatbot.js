// ═══════════════════════════════════════════════════════════════
//  OHS Portal — 法規問答機器人 Cloudflare Worker
//
//  功能：作為 CORS Proxy，將瀏覽器請求轉發到公司 IT API 閘道器
//  部署目標：ohs-law-chatbot（workers.dev）
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

export default {
  async fetch(request) {

    // CORS 預檢請求
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const { text, images } = await request.json();

      if (!text) {
        return new Response(JSON.stringify({ error: 'missing text' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      // 轉發到 IT 閘道器
      const payload = { model: MODEL, text };
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
