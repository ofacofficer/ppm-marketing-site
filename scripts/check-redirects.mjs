#!/usr/bin/env node
// Verify every legacy URL in content/redirects/*.csv against a live deployment.
//
//   node scripts/check-redirects.mjs https://www.njpropertymanager.com
//   node scripts/check-redirects.mjs https://<preview>.vercel.app --header "Cookie: _vercel_jwt=..."
//
// Each row must land on its "to" page with a 200 in at most 2 hops (the trailing-slash 308
// plus the redirect itself). Pattern rows are probed with a made-up slug. Exits 1 on any
// failure, so it can gate the DNS cutover and run again right after it.
// Behind an HTTP proxy, run with NODE_USE_ENV_PROXY=1.
import { loadRows } from './build-redirects.mjs';

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) || '').replace(/\/$/, '');
if (!base) { console.error('usage: node scripts/check-redirects.mjs <base-url> [--header "Name: value"]'); process.exit(1); }
const headers = {};
args.forEach((a, i) => {
  if (a === '--header' && args[i + 1]) {
    const [k, ...v] = args[i + 1].split(':');
    headers[k.trim()] = v.join(':').trim();
  }
});

const MAX_HOPS = 2;
const probePath = (from) => from.replace(/:[a-z]+\*?/gi, 'zz-legacy-probe');

async function follow(path) {
  const hops = [];
  let url = `${base}${path}`;
  for (let i = 0; i <= 6; i++) {
    const res = await fetch(url, { redirect: 'manual', headers });
    if (res.status >= 300 && res.status < 400) {
      const next = new URL(res.headers.get('location'), url).toString();
      hops.push(`${res.status} ${new URL(next).pathname}`);
      url = next;
      continue;
    }
    return { status: res.status, finalPath: new URL(url).pathname, hops };
  }
  return { status: 0, finalPath: '(redirect loop)', hops };
}

const rows = loadRows();
let failed = 0;
const queue = [...rows];
async function worker() {
  for (let r = queue.shift(); r; r = queue.shift()) {
    const path = probePath(r.from);
    let res;
    try { res = await follow(path); } catch (e) { res = { status: 0, finalPath: `(error: ${e.message})`, hops: [] }; }
    const ok = res.status === 200 && res.finalPath === r.to && res.hops.length <= MAX_HOPS;
    if (!ok) {
      failed++;
      console.log(`FAIL ${path} → expected ${r.to}, got ${res.status} ${res.finalPath} via [${res.hops.join(' → ')}]`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`${rows.length - failed}/${rows.length} legacy URLs land on their target (${base})`);
process.exit(failed ? 1 : 0);
