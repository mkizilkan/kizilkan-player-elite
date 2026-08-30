#!/usr/bin/env node
/** KIZILKAN PLAYER v16.12.2 — PCAP-first + learned migration + rate-limit-aware cooldown + request fingerprint HARD gate */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..');
const stalkerPath = path.join(root, 'frontend/src/utils/stalker.ts');
const stalker = fs.readFileSync(stalkerPath, 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(root, 'frontend/app.json'), 'utf8'));
const fail = (m) => { throw new Error(m); };
const must = (src, re, m) => { if (!re.test(src)) fail(m); };

function staticChecks() {
  if (pkg.version !== app.expo?.version || Number(app.expo?.android?.versionCode || 0) < 161202) fail('version contract/regression floor');
  must(stalker, /return \["pcap320-minimal", learned\.profile,/, 'learned profile can still outrank PCAP');
  must(stalker, /push\(all\[0\]\);[\s\S]{0,160}push\(learned\?\.endpoint\);/, 'primary portal endpoint must outrank learned endpoint');
  must(stalker, /STALKER_HANDSHAKE_REQUEST_FINGERPRINT/, 'request fingerprint telemetry missing');
  must(stalker, /cookieMacShape/, 'safe cookie shape telemetry missing');
  must(stalker, /queryKeys/, 'query-key telemetry missing');
  must(stalker, /function isRateLimitRejection/, 'rate-limit classifier missing');
  must(stalker, /if \(isRateLimitRejection\(e\)\)[\s\S]{0,140}MAG_RATE_LIMIT/, 'rate-limit is not classified before auth reject');
  must(stalker, /if \(isAuthRejection\(e\)\)/, 'auth classifier missing');
  must(stalker, /if \(e\?\.kind === "MAG_RATE_LIMIT"\)/, 'persistent cooldown must be rate-limit only');
  must(stalker, /MAG_HANDSHAKE_GUARD_KEY = "kizilkan\.mag\.guard\.v16122"/, 'old auth-only cooldown state not migrated');
  must(stalker, /learned\?\.profile===compatProfile && isAuthRejection\(e\)/, 'failed learned profile is not demoted');
  must(stalker, /HANDSHAKE_MIN_SPACING_MS\s*=\s*1_250/, 'adaptive spacing regressed');
  must(stalker, /HANDSHAKE_MAX_AUTH_REJECTS\s*=\s*4/, 'auth safe budget regressed');
  must(stalker, /HANDSHAKE_COOLDOWN_MS\s*=\s*5 \* 60_000/, 'real rate-limit cooldown regressed');
}

function compileStalker() {
  const out = ts.transpileModule(stalker, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
    fileName: stalkerPath,
  });
  const errors = (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) fail('stalker transpile diagnostics: ' + errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(' | '));
  return out.outputText;
}

function response(body, status = 200, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? contentType : null },
    url: 'http://portal.test/portal.php',
    redirected: false,
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
  };
}

function load(fetchImpl) {
  const memory = new Map();
  const diagnostics = [];
  const js = compileStalker();
  const req = (id) => {
    if (id === '@/src/utils/diagnostics') return { recordDiagnostic: async (domain,event,data) => { diagnostics.push({domain,event,data}); }, markTask: () => () => {} };
    if (id === '@/src/utils/storage') return { storage: {
      getItem: async (k, fallback) => memory.has(k) ? memory.get(k) : fallback,
      setItem: async (k, v) => { memory.set(k, v); return true; },
      removeItem: async (k) => { memory.delete(k); return true; },
    }};
    if (id === 'expo-crypto') return { CryptoDigestAlgorithm: { MD5:'MD5', SHA1:'SHA1', SHA256:'SHA256' }, digestStringAsync: async (_a, v) => ('abc123' + v).padEnd(64, '0').slice(0,64) };
    return require(id);
  };
  const fastSetTimeout = (fn, ms, ...args) => ms <= 6000 ? setTimeout(fn, 0, ...args) : setTimeout(fn, ms, ...args);
  const box = { module:{exports:{}}, exports:{}, require:req, console, URL, URLSearchParams, AbortController, setTimeout:fastSetTimeout, clearTimeout, fetch:fetchImpl };
  box.exports = box.module.exports;
  vm.runInNewContext(js, box, { filename: 'stalker-v16122.js' });
  return { api: box.module.exports, memory, diagnostics };
}

async function fixtureLearnedGoldenCannotOutrankPcap() {
  const seen = [];
  const { api, memory, diagnostics } = load(async (url, opts = {}) => {
    seen.push({url, headers:opts.headers||{}});
    return response({js:{token:'fixture-token',random:'r'}});
  });
  const cred = { portal:'http://portal.test:2095/c/', mac:'00:11:22:33:44:55', deviceModel:'MAG254' };
  const key = 'http://portal.test:2095|00:11:22:33:44:55';
  memory.set('kizilkan.mag.compat.v15225', JSON.stringify({
    [key]: { endpoint:'http://portal.test:2095/portal.php', profile:'golden', model:'MAG250', at:Date.now(), failures:0 }
  }));
  const ses = await api.stalkerHandshake(cred);
  if (ses.compatProfile !== 'pcap320-minimal') fail('learned golden still won first handshake');
  if (seen.length !== 1) fail('PCAP-first fixture should succeed in one request');
  const u = new URL(seen[0].url);
  if (u.searchParams.has('JsHttpRequest') || u.searchParams.has('token') || u.searchParams.has('prehash')) fail('first request is not minimal PCAP');
  if (!/MAG320 stbapp ver: 2 rev: 250/.test(String(seen[0].headers['User-Agent']||''))) fail('first request is not MAG320');
  const fp = diagnostics.find(x => x.event === 'STALKER_HANDSHAKE_REQUEST_FINGERPRINT');
  if (!fp) fail('fingerprint telemetry not emitted');
  if (fp.data?.userAgentProfile !== 'MAG320-PCAP' || fp.data?.jsHttpPresent !== false || fp.data?.cookieMacShape !== 'encoded') fail('fingerprint telemetry does not describe PCAP request');
}

async function fixtureAuthRejectDoesNotPersistCooldown() {
  let calls = 0;
  const { api } = load(async () => { calls += 1; return response('Authorization failed.', 200, 'text/javascript;charset=UTF-8'); });
  const cred = { portal:'http://authreject.test/c/', mac:'00:11:22:33:44:55', deviceModel:'MAG254' };
  try { await api.stalkerHandshake(cred); } catch {}
  const firstCalls = calls;
  if (firstCalls < 1 || firstCalls > 4) fail('auth governor request budget invalid: ' + firstCalls);
  try { await api.stalkerHandshake(cred); } catch {}
  if (calls <= firstCalls) fail('manual retry was blocked by persistent auth-only cooldown');
}

async function fixtureReal429DoesPersistCooldown() {
  let calls = 0;
  const { api } = load(async () => { calls += 1; return response('Too Many Requests', 429, 'text/plain'); });
  const cred = { portal:'http://ratelimit.test/c/', mac:'00:11:22:33:44:55', deviceModel:'MAG254' };
  let first='';
  try { await api.stalkerHandshake(cred); } catch (e) { first=String(e?.message||e); }
  if (!first) fail('429 fixture unexpectedly succeeded');
  const before = calls;
  let second='';
  try { await api.stalkerHandshake(cred); } catch (e) { second=String(e?.message||e); }
  if (!/koruma bekleme süresi/i.test(second)) fail('real 429 did not create persistent cooldown: ' + second);
  if (calls !== before) fail('429 cooldown retry touched network');
}

(async () => {
  try {
    staticChecks();
    await fixtureLearnedGoldenCannotOutrankPcap();
    await fixtureAuthRejectDoesNotPersistCooldown();
    await fixtureReal429DoesPersistCooldown();
    console.log('PASS: v16.12.2 PCAP-first / learned migration / rate-limit-aware cooldown / telemetry TEMİZ');
  } catch (e) {
    console.error('FAIL: v16.12.2 HARD gate:', e?.stack || e);
    process.exit(1);
  }
})();
