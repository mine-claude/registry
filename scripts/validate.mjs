#!/usr/bin/env node
// Validates the registry files. What CI runs on every pull request, and what you can run locally:
//
//   node scripts/validate.mjs             schema + rules + network checks (release asset exists, sha256 matches)
//   node scripts/validate.mjs --offline   schema + rules only (no network)
//
// Exit code 0 = everything passed. Every problem is printed, one per line, before exiting 1.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFLINE = process.argv.includes('--offline');
// `official: true` is a claim the registry makes about itself: only the owner's own hosts may carry it.
const OFFICIAL_HOSTS = ['mineclaude.com', 'www.mineclaude.com'];
const MAX_ASSET_BYTES = 32 * 1024 * 1024;

const problems = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);

const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));

/** A host nobody outside a LAN can reach has no business in a public registry. */
function privateHost(host) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // no IP literals at all: a public entry has a name
  return false;
}

/** The URL checks every entry shares: the scheme the field demands, and a reachable public host. */
function checkUrl(file, where, url, scheme) {
  let u;
  try { u = new URL(url); } catch { fail(file, `${where}: "${url}" is not a URL`); return null; }
  if (u.protocol !== `${scheme}:`) fail(file, `${where}: only ${scheme}:// is allowed, got ${u.protocol}//`);
  if (privateHost(u.hostname)) fail(file, `${where}: "${u.hostname}" is a local/internal host`);
  return u;
}

function uniqueIds(file, list, label) {
  const seen = new Set();
  for (const [i, item] of list.entries()) {
    const id = item?.id;
    if (typeof id !== 'string') continue;
    if (seen.has(id)) fail(file, `${label}[${i}]: id "${id}" is used more than once`);
    seen.add(id);
  }
  return seen;
}

// ---- schema ----

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

async function validateSchema(file, schemaFile, data) {
  const schema = await readJson(schemaFile);
  const validate = ajv.compile(schema);
  if (validate(data)) return true;
  for (const e of validate.errors ?? []) fail(file, `${e.instancePath || '/'} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);
  return false;
}

// ---- the release asset: it must be there, and it must be the bytes the sha256 pins ----

async function checkAsset(mod) {
  const where = `mods[${mod.id}]`;
  let res;
  try {
    res = await fetch(mod.download, { redirect: 'follow' });
  } catch (e) {
    fail('mods.json', `${where}: download failed (${e?.message ?? e})`);
    return;
  }
  if (!res.ok) { fail('mods.json', `${where}: download answered HTTP ${res.status} - is the release asset published?`); return; }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_ASSET_BYTES) { fail('mods.json', `${where}: asset is ${bytes.byteLength} bytes, over the ${MAX_ASSET_BYTES} limit`); return; }
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== mod.sha256) fail('mods.json', `${where}: sha256 does not match the asset (declared ${mod.sha256}, asset ${got})`);
  if (typeof mod.size === 'number' && mod.size !== bytes.byteLength) fail('mods.json', `${where}: size says ${mod.size}, asset has ${bytes.byteLength} bytes`);
  // The .mcmod is a zip: "PK\x03\x04". Catches a page of HTML served in place of the asset.
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) fail('mods.json', `${where}: the asset is not a zip (.mcmod) file`);
}

// ---- each file ----

async function checkRelays() {
  const file = 'relays.json';
  const data = await readJson(file);
  if (!(await validateSchema(file, 'schema/relays.schema.json', data))) return;
  uniqueIds(file, data.relays, 'relays');
  for (const r of data.relays) {
    checkUrl(file, `relays[${r.id}].url`, r.url, 'wss');
    if (r.health) checkUrl(file, `relays[${r.id}].health`, r.health, 'https');
  }
}

async function checkServers() {
  const file = 'servers.json';
  const data = await readJson(file);
  if (!(await validateSchema(file, 'schema/servers.schema.json', data))) return;
  uniqueIds(file, data.servers, 'servers');
  const addresses = new Set();
  for (const s of data.servers) {
    const u = checkUrl(file, `servers[${s.id}].address`, s.address, 'https');
    if (u) {
      if (u.pathname !== '/' || u.search || u.hash) fail(file, `servers[${s.id}].address: an origin only, no path or query`);
      if (addresses.has(u.origin)) fail(file, `servers[${s.id}]: address ${u.origin} is already listed`);
      addresses.add(u.origin);
      if (s.official && !OFFICIAL_HOSTS.includes(u.hostname.toLowerCase())) {
        fail(file, `servers[${s.id}]: only the owner's own hosts may set "official": true`);
      }
    }
    if (s.ws) {
      const w = checkUrl(file, `servers[${s.id}].ws`, s.ws, 'wss');
      if (w && u && w.hostname !== u.hostname) fail(file, `servers[${s.id}].ws: host ${w.hostname} differs from the address host ${u.hostname}`);
    }
    if (s.site) checkUrl(file, `servers[${s.id}].site`, s.site, 'https');
  }
}

async function checkMods() {
  const file = 'mods.json';
  const data = await readJson(file);
  if (!(await validateSchema(file, 'schema/mods.schema.json', data))) return;
  const ids = uniqueIds(file, data.mods, 'mods');
  const downloads = new Set();
  for (const m of data.mods) {
    const u = checkUrl(file, `mods[${m.id}].download`, m.download, 'https');
    if (u) {
      // The asset must live in the release of the repo the entry names: nobody slips a foreign host past review.
      if (!u.pathname.startsWith(`/${m.repo}/releases/download/`)) fail(file, `mods[${m.id}].download: the URL is not a release asset of ${m.repo}`);
      if (downloads.has(m.download)) fail(file, `mods[${m.id}]: this download URL is already listed`);
      downloads.add(m.download);
    }
    if (m.homepage) checkUrl(file, `mods[${m.id}].homepage`, m.homepage, 'https');
    for (const dep of m.requires ?? []) {
      if (dep === m.id) fail(file, `mods[${m.id}].requires: a mod cannot require itself`);
      else if (!ids.has(dep)) fail(file, `mods[${m.id}].requires: "${dep}" is not in this file`);
    }
  }
  if (OFFLINE) return;
  await Promise.all(data.mods.filter((m) => /^[0-9a-f]{64}$/.test(m.sha256 ?? '')).map(checkAsset));
}

try {
  await checkRelays();
  await checkServers();
  await checkMods();
} catch (e) {
  problems.push(`unexpected failure: ${e?.stack ?? e}`);
}

if (problems.length) {
  console.error(`The registry has ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(OFFLINE ? 'Registry OK (schema and rules; network checks skipped).' : 'Registry OK (schema, rules, release assets and sha256).');
