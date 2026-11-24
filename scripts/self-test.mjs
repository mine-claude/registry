#!/usr/bin/env node
// Tests the validator's own rules, so a change to it is caught here and not on somebody's pull request.
//
//   node scripts/self-test.mjs
//
// What it covers is the part that cannot be covered by the files in this repository: the IMAGE rules of a mod entry
// (`icon`, `screenshots`). The URLs are checked against the schema, and the BYTES are checked by feeding
// `imageProblems` a stubbed `fetch` — crafted PNG and WebP headers, an HTML page wearing a .png name, an oversize
// file, a non-square icon. No network, and no asset has to exist anywhere.
//
// Exit 0 = everything passed. Every failure is printed before exiting 1.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { imageProblems, readImage, IMAGE_HOST, MAX_ICON_BYTES, MAX_SHOT_BYTES, MAX_ICON_SIDE } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const results = [];
const check = (ok, what) => { results.push(!!ok); if (!ok) failures.push(what); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };

// ---- a PNG header of a given size, and a WebP one. Only the first bytes matter to `readImage`. ----
function pngOf(width, height, extra = 0) {
  const head = Buffer.alloc(24 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write('IHDR', 12, 'latin1');
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return head;
}
const webp = (extra = 0) => {
  const b = Buffer.alloc(16 + extra);
  b.write('RIFF', 0, 'latin1');
  b.write('WEBP', 8, 'latin1');
  return b;
};
const html = () => Buffer.from('<!doctype html><title>404</title>');

/** `imageProblems` against bytes we chose, with no network at all. */
async function problemsFor(url, bytes, opts, { status = 200 } = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  try { return await imageProblems('mods[x].icon', url, opts); } finally { globalThis.fetch = real; }
}

const ICON = { maxBytes: MAX_ICON_BYTES, square: true };
const SHOT = { maxBytes: MAX_SHOT_BYTES, square: false };
const RAW = `https://${IMAGE_HOST}/mine-claude/mod-x/main`;

// ---- 1. the bytes decide the format, never the name ----
check(readImage(pngOf(64, 64)).format === 'png', 'PNG bytes read as a PNG');
check(readImage(pngOf(64, 64)).width === 64 && readImage(pngOf(32, 64)).height === 64, 'the size comes out of the IHDR');
check(readImage(webp()).format === 'webp', 'WebP bytes read as a WebP');
check(readImage(html()).format === null, 'an HTML page is not an image');

// ---- 2. a good icon and a good screenshot pass ----
check((await problemsFor(`${RAW}/icon.png`, pngOf(64, 64), ICON)).length === 0, 'a square 64x64 PNG icon passes');
check((await problemsFor(`${RAW}/icon.webp`, webp(), ICON)).length === 0, 'a WebP icon passes (its size is not read, the byte cap covers it)');
check((await problemsFor(`${RAW}/shot.png`, pngOf(1280, 720), SHOT)).length === 0, 'a wide screenshot passes: only an icon has to be square');

// ---- 3. and each way of being wrong is caught, one at a time ----
const cases = [
  ['a 404 (the file was never committed)', `${RAW}/icon.png`, pngOf(64, 64), ICON, { status: 404 }, /HTTP 404/],
  ['an HTML page served as .png', `${RAW}/icon.png`, html(), ICON, {}, /neither a PNG nor a WebP/],
  ['a PNG behind a .webp name', `${RAW}/icon.webp`, pngOf(64, 64), ICON, {}, /ends in .webp but the bytes are a png/],
  ['an icon that is not square', `${RAW}/icon.png`, pngOf(64, 32), ICON, {}, /has to be square/],
  ['an icon bigger than the side limit', `${RAW}/icon.png`, pngOf(512, 512), ICON, {}, new RegExp(`${MAX_ICON_SIDE}x${MAX_ICON_SIDE} at most`)],
  ['an icon over the byte cap', `${RAW}/icon.png`, pngOf(64, 64, MAX_ICON_BYTES), ICON, {}, /over the \d+ limit/],
  ['a screenshot over the byte cap', `${RAW}/shot.png`, pngOf(64, 64, MAX_SHOT_BYTES), SHOT, {}, /over the \d+ limit/],
];
for (const [what, url, bytes, opts, init, re] of cases) {
  const got = await problemsFor(url, bytes, opts, init);
  check(got.some((p) => re.test(p)), `refused: ${what} (${got.join('; ') || 'nothing was said'})`);
}
// A screenshot of 64x64 is fine; the square rule must not leak from the icon to the screenshots.
check((await problemsFor(`${RAW}/shot.png`, pngOf(64, 32), SHOT)).length === 0, 'and a non-square SCREENSHOT is not refused');

// ---- 4. the schema: which URLs may even be written down ----
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const schema = JSON.parse(await readFile(path.join(ROOT, 'schema/mods.schema.json'), 'utf8'));
const validate = ajv.compile(schema);
const entry = (extra) => ({
  version: 1, updated: '2026-11-24',
  mods: [{
    id: 'xmod', name: 'X', repo: 'mine-claude/mod-x', version: '0.1.0', side: 'both', description: 'Um mod.',
    download: 'https://github.com/mine-claude/mod-x/releases/download/v0.1.0/x-0.1.0.mcmod', sha256: 'a'.repeat(64),
    ...extra,
  }],
});
check(validate(entry({ icon: `${RAW}/icon.png` })) === true, 'the schema takes an icon on raw.githubusercontent.com');
check(validate(entry({ screenshots: [`${RAW}/1.png`, `${RAW}/2.webp`] })) === true, 'and up to four screenshots');
check(validate(entry({})) === true, 'an entry with no image at all is still valid: both fields are optional');
for (const [what, extra] of [
  ['an icon on another host', { icon: 'https://exemplo.com/icon.png' }],
  ['an icon over http', { icon: `http://${IMAGE_HOST}/mine-claude/mod-x/main/icon.png` }],
  ['an icon with a query string', { icon: `${RAW}/icon.png?v=2` }],
  ['an icon that is not a PNG or a WebP', { icon: `${RAW}/icon.svg` }],
  ['five screenshots', { screenshots: [1, 2, 3, 4, 5].map((n) => `${RAW}/${n}.png`) }],
  ['a screenshot on another host', { screenshots: [`https://exemplo.com/1.png`] }],
]) check(validate(entry(extra)) === false, `the schema refuses: ${what}`);

const bad = results.filter((r) => !r).length;
if (bad) {
  console.error(`\n${bad} failure(s) of ${results.length}:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nAll good (${results.length} checks).`);
