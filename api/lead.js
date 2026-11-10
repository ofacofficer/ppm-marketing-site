// Same-origin forwarder to the PPM lead-intake service.
// Runs as a Vercel Node serverless function; the client posts here first so
// the primary submission path is immune to ad-blockers and CORS.
const UPSTREAM = 'https://tpwnpzpuqrgbzislgoif.supabase.co/functions/v1/lead-intake';
const TIMEOUT_MS = 8000;

// The visitor's address, so upstream's per-IP rate limit sees the visitor and not this function's
// Vercel egress address. Sources in order: x-vercel-forwarded-for, x-real-ip, the first entry of
// x-forwarded-for, then the socket. Accepted only if it looks like an IPv4/IPv6 address.
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  // Vercel parses JSON bodies into req.body when Content-Type is
  // application/json; tolerate a raw string body as well.
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (err) {
      body = null;
    }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const upstreamHeaders = { 'Content-Type': 'application/json' };
  const ip = visitorIp(req);
  if (ip) upstreamHeaders['x-forwarded-for'] = ip;

  let upstream;
  let text;
  try {
    // Forward as-is: upstream owns validation and the honeypot logic.
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    text = await upstream.text();
  } catch (err) {
    clearTimeout(timeoutId);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'upstream_unreachable' }));
    return;
  }
  clearTimeout(timeoutId);

  // Mirror the upstream status and JSON body back to the client.
  res.statusCode = upstream.status;
  res.setHeader('Content-Type', 'application/json');
  res.end(text);
};
