// Same-origin forwarder to the PPM self-serve sign-up service (the `signup` edge function).
// Runs as a Vercel Node serverless function, like api/lead.js, so the Get Started flow is immune to
// ad-blockers and CORS. Not part of the lead path: a lead is still created by lead-intake, which
// the sign-up service calls itself.
//
//   GET  /api/signup/   the flow's configuration (is it open, the steps, the fee facts). Nothing in
//                       it is personal, so it is cached at the edge for a minute: the page asks on
//                       every load and must not wait on a database for the answer.
//   POST /api/signup/   one action ({ action: 'config' | 'start' | 'get' | 'quote' | 'contact' }),
//                       forwarded as-is. Upstream owns validation, limits and the honeypot.
const UPSTREAM = 'https://tpwnpzpuqrgbzislgoif.supabase.co/functions/v1/signup';
const TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 16000;

// The visitor's address, so upstream's per-visitor limits see the visitor and not this function's
// Vercel egress address. Same sources and the same test as api/lead.js.
const IP_LIKE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|(?=(?:[^:]*:){2})[0-9A-Fa-f:.]+)$/;

function headerValue(req, name) {
  const v = req.headers && req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function visitorIp(req) {
  const xff = headerValue(req, 'x-forwarded-for');
  const candidates = [
    headerValue(req, 'x-vercel-forwarded-for'),
    headerValue(req, 'x-real-ip'),
    typeof xff === 'string' ? xff.split(',')[0] : undefined,
    req.socket && req.socket.remoteAddress
  ];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const v = c.trim();
    if (v) return v.length <= 45 && IP_LIKE.test(v) ? v : null;
  }
  return null;
}

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function forward(req, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = { 'Content-Type': 'application/json' };
  const ip = visitorIp(req);
  if (ip) headers['x-forwarded-for'] = ip;
  try {
    const upstream = await fetch(UPSTREAM, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
    return { status: upstream.status, text: await upstream.text() };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // The public configuration only: a GET never carries the preview key, so what is cached is
    // what every visitor is entitled to see.
    try {
      const out = await forward(req, { action: 'config' });
      let ok = false;
      try { ok = out.status === 200 && JSON.parse(out.text).ok === true; } catch (err) { ok = false; }
      if (ok) return send(res, 200, out.text, 'public, s-maxage=60, stale-while-revalidate=600');
    } catch (err) { /* fall through: closed */ }
    // Anything else reads as closed, briefly, so the page shows its contact form and asks again soon.
    return send(res, 200, { ok: true, mode: 'off' }, 'public, s-maxage=15');
  }

  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (err) { body = null; }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { ok: false, error: 'invalid_json' });
  if (JSON.stringify(body).length > MAX_BODY_BYTES) return send(res, 413, { ok: false, error: 'too_large' });

  try {
    const out = await forward(req, body);
    // Mirror the upstream status and JSON body back to the client.
    return send(res, out.status, out.text);
  } catch (err) {
    return send(res, 502, { ok: false, error: 'unavailable' });
  }
};
