#!/usr/bin/env node
/** Offline behavior tests: actual discovery/bridge/protection code; no IPTV network. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..', 'frontend');
function environment(overrides = {}) {
  const cache = new Map();
  const mocks = {
    'expo/fetch': { fetch: overrides.fetch },
    '@/src/utils/diagnostics': { recordDiagnostic: async () => {}, markTask: () => () => {} },
    '@/src/utils/storage': { storage: { getItem: async (_key, fallback) => fallback, setItem: async () => true } },
    '@/modules/kizilkan-native-core': { KizilkanNativeCore: { available: false } },
    'expo-modules-core': { requireNativeModule: () => overrides.native || null, requireOptionalNativeModule: () => overrides.native || null },
    ...overrides,
  };
  const requireModule = id => Object.prototype.hasOwnProperty.call(mocks, id) ? mocks[id] : id.startsWith('@/') ? load(id.slice(2) + '.ts') : require(id);
  function load(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const exports = {}; cache.set(rel, exports);
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports, require: requireModule, URL, URLSearchParams, AbortController, TextDecoder, Uint8Array, setTimeout, clearTimeout, console, fetch: overrides.globalFetch || overrides.fetch }, { filename: rel });
    return exports;
  }
  return { load };
}
const portal = 'http://portal.example.test:8080/portal.php';
const entry = value => ({ raw: value, host: value, hasPort: true, explicitPort: new URL(value).port || '80', hasPath: new URL(value).pathname !== '/' });
const response = (body, status = 200, headers = {}, url) => ({ status, url, headers: { get: name => headers[name.toLowerCase()] || '' }, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
const gate = { beforeRequest: async () => {} };
const run = async (fetch, hosts = [entry(portal)], options = {}) => environment({ fetch }).load('src/utils/magPortalDiscovery.ts').discoverMagHosts(hosts, { gate, scope: 'exact', ...options });
function noCredentials(url, options) {
  assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'manual');
  assert.ok(!Object.keys(options.headers).some(key => /cookie|authorization|x-user-agent/i.test(key)));
  assert.ok(!/[?&](?:mac|token|device_id|sn)=/i.test(url));
}
let groups = 0;
(async () => {
  {
    let expoCalls = 0, globalCalls = 0;
    const env = environment({
      fetch: async (_url, options) => { expoCalls++; assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit'); return response('', 302, { location: 'http://foreign.example/portal.php' }); },
      globalFetch: async () => { globalCalls++; throw new Error('unsafe RN global fetch must not be used'); },
    });
    const reports = await env.load('src/utils/magPortalDiscovery.ts').discoverMagHosts([entry(portal)], { gate, scope: 'exact' });
    assert.equal(expoCalls, 1); assert.equal(globalCalls, 0); assert.equal(reports[0].state, 'error');
    console.log('PASS: direct discovery uses Expo manual/omit transport and never follows foreign redirect via RN fetch'); groups++;
  }
  {
    const calls = [];
    const reports = await run(async (url, options) => { noCredentials(url, options); calls.push(url); return response(new URL(url).searchParams.get('action') === 'handshake' ? { js: { token: 'ANONYMOUS_FIXTURE' } } : { error: 'authentication required' }); }, Array.from({ length: 100 }, () => entry(portal)));
    assert.equal(reports.length, 1); assert.equal(reports[0].state, 'ready'); assert.equal(reports[0].probes, 2); assert.equal(calls.length, 2);
    assert.equal(reports[0].candidates[0].confidence, 'api'); assert.ok(reports[0].candidates[0].selectable);
    assert.ok(calls.every(url => new URL(url).pathname === '/portal.php'));
    assert.ok(!JSON.stringify(reports).includes('ANONYMOUS_FIXTURE'), 'discovery must not share token/session');
    console.log('PASS: 100 duplicate hosts discover once; literal PHP exact; anonymous GET contains no account credentials'); groups++;
  }
  {
    for (const body of [{ js: {} }, { js: { foo: 'bar' } }, { js: { stb_type: null, stb_lang: null } }, { token: 'not-a-stb-response' }, '<html>our API and stalker discussion</html>']) {
      const report = (await run(async () => response(body)))[0]; assert.equal(report.state, 'not-found'); assert.equal(report.candidates.length, 0);
    }
    const report = (await run(async () => response({ js: { stb_type: 'MAG250', stb_lang: 'en' } })))[0]; assert.equal(report.state, 'ready');
    console.log('PASS: generic JSON/HTML do not become API; distinct STB shape does'); groups++;
  }
  {
    for (const body of ['Authorization failed.', { js: { error: 'Not authorized' } }, { js: null }]) {
      let calls = 0;
      const report = (await run(async () => { calls++; return response(body); }, [entry(portal)], { scope: 'fallback' }))[0];
      assert.equal(report.state, 'ready'); assert.equal(calls, 1); assert.equal(report.candidates[0].confidence, 'fingerprint'); assert.ok(report.candidates[0].selectable); assert.ok(report.candidates[0].evidence.includes('mac-validation-required'));
    }
    const all = (await run(async () => response({ js: null }), [entry(portal)], { scope: 'all' }))[0]; assert.equal(all.state, 'not-found'); assert.equal(all.candidates.length, 0);
    const denied = (await run(async () => response('generic denied', 401)))[0]; assert.equal(denied.state, 'not-found');
    const calls = [], html = '<html>Stalker Portal<script src="stb.js"></script><script>server="/portal.php";</script></html>';
    const linked = (await run(async url => { calls.push(url); return new URL(url).pathname === '/c' ? response(html) : response('generic page'); }, [entry('http://portal.example.test:8080/c')]))[0];
    assert.ok(linked.candidates.filter(candidate => candidate.endpoint.endsWith('/portal.php')).every(candidate => !candidate.selectable)); assert.equal(linked.state, 'not-found');
    console.log('PASS: entered PHP auth-denial/js-null requires MAC validation; all-scope js-null and unconfirmed HTML links are not auto-selectable'); groups++;
  }
  {
    const calls = [], host = entry('http://portal.example.test:8080/stalker_portal/c');
    const html = '<html>Stalker Portal<script src="stb.js"></script><script>server="../server/load.php";other="https://foreign.example/portal.php";</script></html>';
    const reports = await run(async (url, options) => { noCredentials(url, options); calls.push(url); const u = new URL(url); if (u.pathname === '/stalker_portal/c') return response('', 302, { location: '/stalker_portal/c/' }); if (u.pathname === '/stalker_portal/c/') return response(html); if (u.pathname === '/stalker_portal/server/load.php') return response({ js: { token: 'fixture' } }); return response('missing', 404); }, [host]);
    assert.equal(reports[0].state, 'ready'); assert.ok(reports[0].candidates.some(candidate => candidate.endpoint.endsWith('/stalker_portal/server/load.php') && candidate.confidence === 'api'));
    assert.ok(calls.every(url => new URL(url).origin === 'http://portal.example.test:8080' && new URL(url).pathname.startsWith('/stalker_portal/')));
    const indexed = (await run(async url => new URL(url).pathname === '/stalker_portal/c/index.html' ? response(html) : new URL(url).pathname === '/stalker_portal/server/load.php' ? response({ js: { token: 'fixture' } }) : response('missing', 404), [entry('http://portal.example.test:8080/stalker_portal/c/index.html')]))[0];
    assert.ok(indexed.candidates.some(candidate => candidate.endpoint.endsWith('/stalker_portal/server/load.php') && candidate.confidence === 'api'));
    console.log('PASS: /c installation family, slash redirect and relative API; foreign references never requested'); groups++;
  }
  {
    const html = '<html>Stalker Portal<script src="stb.js"></script><script>server="/portal.php";</script></html>';
    const report = (await run(async () => response(html), [entry('http://portal.example.test:8080/c')]))[0];
    assert.equal(report.state, 'not-found'); assert.ok(!report.candidates.some(candidate => candidate.selectable));
    const foreign = (await run(async () => response('', 302, { location: 'http://foreign.example/portal.php' })))[0]; assert.equal(foreign.state, 'error'); assert.equal(foreign.probes, 1);
    console.log('PASS: identical soft-404 fingerprint rejected; foreign redirect stopped'); groups++;
  }
  {
    let calls = 0, hold = 0;
    const report = (await run(async () => { calls++; return response('', 429, { 'retry-after': '120' }); }, [entry(portal)], { scope: 'all', gate: { beforeRequest: async () => {}, onRateLimit: (_url, ms) => { hold = ms; } } }))[0];
    assert.equal(report.state, 'protected'); assert.equal(calls, 1); assert.equal(hold, 120000); assert.equal(report.candidates[0].selectable, false);
    const cf = (await run(async () => response('<html>challenge</html>', 403, { 'cf-mitigated': 'challenge' })))[0]; assert.equal(cf.state, 'protected');
    console.log('PASS: full 120-second Retry-After and challenge stop host without widening'); groups++;
  }
  {
    let cancelled = 0;
    const contentLength = (await run(async () => ({ ...response('never read', 200, { 'content-length': '65537' }), body: { cancel: () => { cancelled++; } }, text: () => { throw new Error('must not materialize body'); } })))[0];
    assert.equal(contentLength.state, 'error'); assert.equal(cancelled, 1);
    const stream = (await run(async () => ({ ...response(''), body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(65537) }), cancel: async () => { cancelled++; } }) } })))[0];
    assert.equal(stream.state, 'error'); assert.equal(cancelled, 2);
    const multibyte = (await run(async () => response('ğ'.repeat(32769))))[0]; assert.equal(multibyte.state, 'error');
    console.log('PASS: Content-Length/stream byte cap and UTF-8 text cap'); groups++;
  }
  {
    const calls = [], stages = [];
    const host = entry('http://portal.example.test:8080/c');
    const report = (await run(async url => { calls.push(url); const pathname = new URL(url).pathname; return pathname === '/c' ? response('large client', 200, { 'content-length': '65537' }) : pathname === '/portal.php' ? response({ js: { token: 'fixture' } }) : response('missing', 404); }, [host], { onStage: text => stages.push(text) }))[0];
    assert.equal(report.state, 'ready'); assert.ok(report.candidates.some(candidate => candidate.endpoint.endsWith('/portal.php') && candidate.confidence === 'api'));
    assert.ok(calls.some(url => new URL(url).pathname === '/portal.php'), 'oversized client page must not stop other API candidates');
    assert.ok(stages.some(text => /aday \d+\/\d+ · \d+ istek/.test(text)), 'stage must expose candidate and request counts');
    const limitedCalls = [];
    const limited = (await run(async url => { limitedCalls.push(url); return response('missing', 404); }, [host], { maxCandidatesPerHost: 2 }))[0];
    assert.equal(limitedCalls.length, 2); assert.equal(limited.probes, 2); assert.ok(limited.message.includes('aday sınırına'));
    console.log('PASS: oversized /c client does not block valid API; unique candidate budget and live probe counts'); groups++;
  }
  {
    const calls = [];
    const fetch = async url => { calls.push(url); return ['/portal.php', '/server/load.php'].includes(new URL(url).pathname) ? response({ js: { token: 'fixture' } }) : response('missing', 404); };
    const host = entry('http://portal.example.test:8080/c');
    const fallback = (await run(fetch, [host], { scope: 'fallback' }))[0];
    assert.equal(fallback.state, 'ready'); assert.ok(fallback.candidates.some(candidate => candidate.endpoint.endsWith('/portal.php'))); assert.ok(fallback.candidates.some(candidate => candidate.endpoint.endsWith('/server/load.php')));
    assert.ok(calls.every(url => new URL(url).port === '8080'), 'family success must not expand fallback ports');
    calls.length = 0;
    const all = (await run(fetch, [host], { scope: 'all' }))[0]; assert.equal(all.state, 'ready'); assert.ok(all.candidates.filter(candidate => candidate.confidence === 'api').length > 2);
    const keys = calls.map(url => new URL(url).origin + new URL(url).pathname); assert.equal(new Set(keys).size, keys.length, 'all candidate aliases must not resweep same endpoint');
    console.log('PASS: fallback collects entered-family endpoints; all collects multiple endpoints once across protocols/ports'); groups++;
  }
  {
    const times = [];
    const env = environment({ fetch: async url => { times.push(Date.now()); return response(new URL(url).searchParams.has('action') ? { js: { token: 'fixture' } } : { error: 'missing' }); } });
    const report = (await env.load('src/utils/magPortalDiscovery.ts').discoverMagHosts([entry(portal)], { scope: 'exact' }))[0];
    assert.equal(report.state, 'ready'); assert.equal(times.length, 2); assert.ok(times[1] - times[0] >= 600, 'optional local gate must retain 650 ms host spacing');
    console.log('PASS: default discovery gate spaces requests on same host'); groups++;
  }
  {
    const controller = new AbortController(); let calls = 0;
    const promise = run(async () => { calls++; return new Promise(() => {}); }, [entry(portal)], { control: { signal: controller.signal } });
    setTimeout(() => controller.abort(), 15); await assert.rejects(promise, error => error.kind === 'CANCELLED'); assert.equal(calls, 1);
    const timeout = (await run(async () => new Promise(() => {}), [entry(portal)], { timeoutMs: 250 }))[0]; assert.equal(timeout.state, 'error');
    const paused = new AbortController(); calls = 0;
    const waiting = run(async () => { calls++; return response(''); }, [entry(portal)], { control: { signal: paused.signal, waitIfPaused: () => new Promise(() => {}) } }); setTimeout(() => paused.abort(), 15);
    await assert.rejects(waiting, error => error.kind === 'CANCELLED'); assert.equal(calls, 0);
    let readerCancelled = 0;
    const bodyTimeout = (await run(async () => ({ ...response(''), body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => { readerCancelled++; } }) } }), [entry(portal)], { timeoutMs: 250 }))[0];
    assert.equal(bodyTimeout.state, 'error'); assert.ok(readerCancelled >= 1, 'deadline must cancel stalled readable body');
    console.log('PASS: uncooperative fetch/body deadline, abort and paused cancellation'); groups++;
  }
  {
    let direct = 0, proxy = 0;
    const env = environment({ fetch: async () => { direct++; throw new Error('proxy must not fall back'); }, '@/modules/panel-scan': { PanelScan: { proxiedRequest: async (_url, method, headers, body, _timeout, signal, limit) => { proxy++; assert.equal(method, 'GET'); assert.equal(body, ''); assert.equal(limit, 65536); assert.ok(signal); assert.ok(!Object.keys(headers).some(key => /cookie|authorization/i.test(key))); return { status: 0, error: 'native-body-limit-unavailable', body: '' }; } } } });
    const report = (await env.load('src/utils/magPortalDiscovery.ts').discoverMagHosts([entry(portal)], { scope: 'all', useProxy: true, gate }))[0];
    assert.equal(report.state, 'error'); assert.equal(proxy, 1); assert.equal(direct, 0);
    const oldCalls = [];
    const old = environment({ native: { proxiedRequest: async () => { oldCalls.push('unsafe'); return '{}'; } } }).load('modules/panel-scan/index.ts').PanelScan;
    assert.equal((await old.proxiedRequest(portal, 'GET', {}, '', 1000, new AbortController().signal, 65536)).error, 'native-body-limit-unavailable'); assert.equal(oldCalls.length, 0);
    let receivedCap = 0;
    const current = environment({ native: { proxiedRequest: async () => '{}', proxiedRequestBoundedCancelable: async (_id, _url, _method, _headers, _body, _timeout, cap) => { receivedCap = cap; return '{"ok":true,"status":200,"body":"{}"}'; } } }).load('modules/panel-scan/index.ts').PanelScan;
    assert.equal((await current.proxiedRequest(portal, 'GET', {}, '', 1000, undefined, 1048576)).ok, true); assert.equal(receivedCap, 1048576);
    assert.equal((await current.proxiedRequest(portal, 'GET', {}, '', 1000, undefined, 1048577)).error, 'invalid-body-limit');
    console.log('PASS: proxy receives native byte cap; old module fails clearly without direct/unbounded fallback'); groups++;
  }
  {
    // v18.7.6: PORT BİLİNMEYEN host → PARALEL port erişilebilirlik; yalnız açık port(lar)da yol denenir.
    const noPort = { raw: 'portal.example.test', host: 'http://portal.example.test', hasPort: false, hasPath: false };
    const touchedPorts = new Set(), stages = [];
    const fetch = async url => {
      const u = new URL(url); touchedPorts.add(u.port || '80');
      if (u.port === '8080') return response({ js: { token: 'fixture' } });
      throw new Error('ECONNREFUSED'); // kapalı port anında reddedilir
    };
    const report = (await run(fetch, [noPort], { scope: 'fallback', onStage: text => stages.push(text) }))[0];
    assert.equal(report.state, 'ready', 'açık portta API bulunmalı');
    assert.ok(report.candidates.some(c => new URL(c.endpoint).port === '8080' && c.confidence === 'api' && c.selectable), '8080 API adayı seçilebilir olmalı');
    assert.ok(report.candidates.every(c => new URL(c.endpoint).port === '8080'), 'yalnız açık portta yol denenmeli (ölü portlar budanır)');
    assert.ok(touchedPorts.size > 5, 'paralel erişilebilirlik birden çok portu denemeli');
    assert.ok(stages.some(t => /paralel taranıyor/.test(t)) && stages.some(t => /açık portlar:/.test(t)), 'aşama: paralel tarama + açık portlar gösterilmeli');
    console.log('PASS: port-first parallel reachability — only open ports get path probes'); groups++;
  }
  console.log(`PASS: MAC-independent portal discovery — ${groups} offline behavior groups`);
})().catch(error => { console.error(error); process.exitCode = 1; });
