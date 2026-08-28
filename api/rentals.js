// Same-origin forwarder to the PPM listing-feed service (JSON variant for /rentals/).
// Runs as a Vercel Node serverless function; the client fetches here first so the primary
// path is immune to ad-blockers and CORS — the direct Supabase URL is the fallback.
// Mirrors api/lead.js's forwarder shape. GET-only; a short CDN cache keeps partner pulls cheap.
const UPSTREAM = 'https://tpwnpzpuqrgbzislgoif.supabase.co/functions/v1/listing-feed?format=json';
const TIMEOUT_MS = 8000;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let upstream;
  let text;
  try {
    upstream = await fetch(UPSTREAM, { signal: controller.signal });
    text = await upstream.text();
  } catch (err) {
    clearTimeout(timeoutId);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'upstream_unreachable' }));
    return;
  }
  clearTimeout(timeoutId);

  res.statusCode = upstream.status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300');
  res.end(text);
};
