#!/usr/bin/env node
// Downloads the Satoshi web fonts at build time (runs before `astro build`, see package.json).
//
// LICENCE: Satoshi is by Indian Type Foundry under the ITF Free Font License. Self-hosting it on our
// own website is allowed, but the font files must NOT be made available through a public repository,
// and must NOT be modified, subset or converted to another format. This repository is public, so:
//   - never commit a font file (.woff2/.woff/.ttf/.otf) or the Fontshare zip; public/fonts/ is
//     git-ignored, and this script writes there on every build;
//   - the three .woff2 files are copied byte-for-byte out of the official package, never altered.
//
// If the download fails the build fails, loudly. A build without the fonts never ships; the previous
// deployment stays live.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'fonts');
const URL_ZIP = 'https://api.fontshare.com/v2/fonts/download/satoshi';
const WANT = ['Satoshi-Regular.woff2', 'Satoshi-Medium.woff2', 'Satoshi-Bold.woff2'];
const PREFIX = 'Satoshi_Complete/Fonts/WEB/fonts/';

// Guard: no font file may ever be tracked in this public repo (skipped where git is unavailable).
try {
  const tracked = execFileSync('git', ['ls-files', '*.woff2', '*.woff', '*.ttf', '*.otf', '*.eot'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (tracked) { console.error(`fetch-fonts: font files are committed to this public repo (licence breach):\n${tracked}`); process.exit(1); }
} catch { /* no git checkout */ }

const isWoff2 = (buf) => buf.length > 4 && buf.toString('latin1', 0, 4) === 'wOF2';

function fail(msg) {
  console.error(`\nfetch-fonts: FAILED: ${msg}\nThe build stops here so a site without its fonts never ships.\n`);
  process.exit(1);
}

if (WANT.every((f) => existsSync(join(OUT, f)) && isWoff2(readFileSync(join(OUT, f))))) {
  console.log('fetch-fonts: Satoshi already present in public/fonts/');
  process.exit(0);
}

let zip;
try {
  const res = await fetch(URL_ZIP, { redirect: 'follow' });
  if (!res.ok) fail(`${URL_ZIP} answered HTTP ${res.status}`);
  zip = Buffer.from(await res.arrayBuffer());
} catch (e) {
  fail(`could not download ${URL_ZIP}: ${e.message}`);
}

// Minimal zip reader: find the end-of-central-directory record, walk the central directory, and
// inflate the three files we need. No dependency, no format conversion.
const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
if (eocd < 0) fail('the download is not a zip archive');
const count = zip.readUInt16LE(eocd + 10);
let p = zip.readUInt32LE(eocd + 16);
const found = new Map();
for (let i = 0; i < count; i++) {
  if (zip.readUInt32LE(p) !== 0x02014b50) fail('corrupt zip central directory');
  const method = zip.readUInt16LE(p + 10);
  const csize = zip.readUInt32LE(p + 20);
  const nameLen = zip.readUInt16LE(p + 28);
  const extraLen = zip.readUInt16LE(p + 30);
  const commentLen = zip.readUInt16LE(p + 32);
  const local = zip.readUInt32LE(p + 42);
  const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
  p += 46 + nameLen + extraLen + commentLen;
  const base = name.slice(PREFIX.length);
  if (!name.startsWith(PREFIX) || !WANT.includes(base)) continue;
  const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const raw = zip.subarray(dataStart, dataStart + csize);
  const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : fail(`unsupported zip method ${method}`);
  found.set(base, data);
}

mkdirSync(OUT, { recursive: true });
for (const f of WANT) {
  const data = found.get(f);
  if (!data) fail(`${PREFIX}${f} is missing from the Fontshare package`);
  if (!isWoff2(data)) fail(`${f} is not a WOFF2 file`);
  writeFileSync(join(OUT, f), data);
}
console.log(`fetch-fonts: wrote ${WANT.join(', ')} to public/fonts/ (unmodified, from Fontshare)`);
