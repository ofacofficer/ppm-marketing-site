// Same-origin forwarder to the PPM lead-intake service.
// Runs as a Vercel Node serverless function; the client posts here first so
// the primary submission path is immune to ad-blockers and CORS.
const UPSTREAM = 'https://tpwnpzpuqrgbzislgoif.supabase.co/functions/v1/lead-intake';
const TIMEOUT_MS = 8000;

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

  let upstream;
  let text;
  try {
    // Forward as-is: upstream owns validation and the honeypot logic.
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
