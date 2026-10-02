#!/usr/bin/env node
/** Gerçek kaynaklarla, ağ/dosya yazmadan MAG kapsamı, yarışları, iptal, koruma ve seçimli arşiv regresyonları. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..', 'frontend');
const source = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const compile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const json = value => JSON.parse(JSON.stringify(value));
const response = (body, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: key => headers[key.toLowerCase()] || '' }, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
function environment(overrides = {}) {
  // Boundary stubs for orchestration/export tests; account proof itself has a separate real-module suite.
  const fakeStalker = overrides['@/src/utils/stalker'];
  if (fakeStalker && !fakeStalker.stalkerVerifyAccount) fakeStalker.stalkerVerifyAccount = async (_cred, _session, profile) => ({
    state: 'verified', accountInfo: fakeStalker.normalizeStalkerAccountInfo(profile), evidence: ['fixture-account-access'], liveCount: 1,
  });
  if (fakeStalker && !overrides['@/src/utils/magPortalDiscovery']) overrides['@/src/utils/magPortalDiscovery'] = {
    discoverMagHosts: async hosts => hosts.map(host => report(host, host.host)),
  };
  const cache = new Map(), storage = new Map();
  const mocks = {
    '@/src/utils/diagnostics': { recordDiagnostic: async () => {}, markTask: () => () => {} },
    '@/src/utils/storage': { storage: { getItem: async (key, fallback) => storage.get(key) ?? fallback, setItem: async (key, value) => { storage.set(key, value); return true; }, removeItem: async key => { storage.delete(key); return true; } } },
    '@/modules/kizilkan-native-core': { KizilkanNativeCore: { available: false } },
    'expo-crypto': { CryptoDigestAlgorithm: { MD5: 'md5', SHA1: 'sha1', SHA256: 'sha256' }, digestStringAsync: async (algorithm, value) => crypto.createHash(algorithm).update(value).digest('hex') },
    // v18.7.4: exact endpoint yolu Expo native fetch kullanır; harness'te sağlanan fetch'e bağla.
    'expo/fetch': { fetch: (...args) => { if (typeof overrides.fetch !== 'function') throw new Error('expo/fetch not provided'); return overrides.fetch(...args); } },
    ...overrides,
  };
  function req(id) {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
    return require(id);
  }
  function load(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const exports = {}; cache.set(rel, exports);
    vm.runInNewContext(compile(source(rel)), { exports, require: req, console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, fetch: overrides.fetch }, { filename: rel });
    return exports;
  }
  return { load, req };
}
const portal = 'http://portal.example.com:80/custom/portal.php';
const mac = index => `00:1A:79:00:00:${index.toString(16).padStart(2, '0').toUpperCase()}`;
const job = index => ({ hostRaw: portal, portal, mac: mac(index), hasPort: true, explicitPort: '80', hasPath: true });
const account = (endpoint, status = 'Active') => ({ session: { endpoint, token: 'fixture' }, profile: { status, expire_billing_date: '2030-01-01', login: 'owner' } });
const report = (host, endpoint) => ({ host, probes: 1, state: endpoint ? 'ready' : 'not-found', candidates: endpoint ? [{
  endpoint, httpStatus: 200, confidence: 'api', selectable: true, evidence: ['fixture-api'], elapsedMs: 10,
}] : [] });
const modules = environment();
const model = modules.load('src/utils/magBulk.ts');
const expiry = modules.load('src/utils/accountExpiry.ts');
let groups = 0;

async function scopeAndIdentity() {
  for (const input of ['http://portal.example.com:80/custom/portal.php', 'https://portal.example.com:443/custom/portal.php']) {
    const parsed = model.parsePortalHosts(input).hosts[0];
    assert.equal(parsed.hasPort, true); assert.ok(parsed.explicitPort);
    assert.ok(model.portalDiscoveryCandidates(parsed).every(url => new URL(url).port === new URL(input).port));
  }
  assert.notEqual(model.magAccountIdentity('http://portal.example.com/a/portal.php', mac(1)), model.magAccountIdentity('http://portal.example.com/b/portal.php', mac(1)));
  assert.equal(model.magAccountIdentity('http://portal.example.com:80/a/portal.php', mac(1)), model.magAccountIdentity('http://portal.example.com/a/portal.php', mac(1)));
  assert.equal(model.expandMacRange('FF:FF:FF:FF:FF:FF', { count: 2 }).macs.length, 0);
  assert.equal(model.normalizeMacStrict('garbage00:1A:79:00:00:01'), null);
  let discovers = 0, policies = [];
  const fake = {
    stalkerLogin: async cred => { policies.push(cred.endpointPolicy); return account(cred.portal); },
    normalizeStalkerAccountInfo: profile => ({ status: profile.status, tariff_expired_date: profile.expire_billing_date }),
  };
  const runner = environment({ '@/src/utils/stalker': fake, '@/src/utils/magPortalDiscovery': {
    discoverMagHosts: async hosts => { discovers++; return hosts.map(host => report(host, host.host)); },
  } }).load('src/utils/magBulkScan.ts');
  for (const scope of ['exact', 'fallback', 'all']) assert.equal((await runner.runMagBulkScan([job(1), job(2)], { scope }))[0].category, 'valid');
  assert.equal(discovers, 3, 'discovery once per run/host rather than once per MAC');
  assert.deepEqual(policies, Array(6).fill('exact'));
  groups++;
}
async function negativeAndSingleFlight() {
  let discoveries = 0, logins = 0;
  const fake = {
    stalkerLogin: async cred => { logins++; if (cred.mac === mac(1)) throw new Error('Authorization failed.'); return account(cred.portal); },
    normalizeStalkerAccountInfo: profile => ({ status: profile.status }),
  };
  const failed = environment({ '@/src/utils/stalker': fake, '@/src/utils/magPortalDiscovery': {
    discoverMagHosts: async hosts => { discoveries++; return hosts.map(host => report(host, null)); },
  } }).load('src/utils/magBulkScan.ts');
  const noPortal = await failed.runMagBulkScan([job(1), job(2), job(3)], { scope: 'all', concurrency: 3 });
  assert.ok(noPortal.every(r => r.category === 'no-portal')); assert.equal(discoveries, 1); assert.equal(logins, 0);
  const selectedEndpoint = 'http://portal.example.com:8080/portal.php';
  const successful = environment({ '@/src/utils/stalker': fake, '@/src/utils/magPortalDiscovery': {
    discoverMagHosts: async hosts => { discoveries++; return hosts.map(host => report(host, selectedEndpoint)); },
  } }).load('src/utils/magBulkScan.ts');
  const results = await successful.runMagBulkScan([job(1), job(2), job(3)], { scope: 'all', concurrency: 3 });
  assert.equal(results.find(r => r.mac === mac(1)).category, 'blocked'); assert.equal(results.filter(r => r.category === 'valid').length, 2);
  assert.equal(discoveries, 2); assert.ok(results.every(r => r.portal === selectedEndpoint));
  groups++;
}
async function cancellationAndParallel() {
  let calls = 0, active = 0, maximum = 0;
  const fake = {
    stalkerLogin: async cred => { calls++; active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; return account(cred.portal); },
    normalizeStalkerAccountInfo: profile => ({ status: profile.status }), discoverMagPortal: async () => null,
  };
  const runner = environment({ '@/src/utils/stalker': fake }).load('src/utils/magBulkScan.ts');
  await runner.runMagBulkScan(Array.from({ length: 20 }, (_, index) => job(index + 1)), { scope: 'exact', concurrency: 16 });
  assert.equal(maximum, 16); assert.equal(calls, 20);
  const controller = new AbortController(); calls = 0;
  await runner.runMagBulkScan([job(1)], { scope: 'exact', control: { signal: controller.signal, waitIfPaused: async () => controller.abort() } });
  assert.equal(calls, 0, 'pause sonrası iptal yeni iş göndermemeli');
  const actual = environment({ fetch: async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); });
  }) }).load('src/utils/stalker.ts');
  const pending = new AbortController();
  const request = actual.stalkerLogin({ portal, mac: mac(1), endpointPolicy: 'exact', requestScope: { transport: 'direct', signal: pending.signal } }, { signal: pending.signal });
  setTimeout(() => pending.abort(), 10);
  await assert.rejects(request, error => error.kind === 'CANCELLED');
  groups++;
}
async function protectionAndRates() {
  const stalker = modules.load('src/utils/stalker.ts');
  const observe = (status, body, headers = {}) => stalker.observeMagProtection({ endpoint: portal + '?token=SECRET', stage: 'handshake', status, body, headers, transport: 'direct', now: 0 });
  assert.equal(observe(403, '<html>denied</html>').state, 'unknown');
  assert.equal(observe(200, '<html>normal portal homepage</html>').state, 'unknown');
  assert.equal(observe(200, '{"js":{"token":"fixture"}}').state, 'not_observed');
  const challenge = observe(403, '<html>challenge</html>', { 'CF-Mitigated': 'challenge' });
  assert.equal(challenge.state, 'present'); assert.equal(challenge.kind, 'challenge'); assert.ok(!challenge.endpoint.includes('SECRET'));
  assert.equal(observe(200, '<html><script src="/cdn-cgi/challenge-platform/h/g/orchestrate"></script></html>').kind, 'challenge');
  assert.equal(observe(200, '<html><div class="g-recaptcha"></div></html>').kind, 'captcha');
  assert.equal(observe(429, '').kind, 'rate_limit');
  assert.equal(observe(403, '<html>Your IP address is temporarily blocked</html>').kind, 'waf');
  const rateController = new AbortController();
  const gate = modules.load('src/utils/magBulkScan.ts').createMagRequestGate({ signal: rateController.signal });
  gate.onRateLimit(portal, 60_000);
  const held = gate.beforeRequest('http://portal.example.com:8080/portal.php');
  await gate.beforeRequest('http://other.example.com/portal.php');
  rateController.abort(); await assert.rejects(held, error => error.kind === 'CANCELLED');
  const actual = environment({ fetch: async () => response('<html>challenge</html>', 403, { 'cf-mitigated': 'challenge' }) });
  const blocked = await actual.load('src/utils/magBulkScan.ts').runMagBulkScan([job(1)], { scope: 'exact' });
  assert.equal(blocked[0].category, 'protected'); assert.equal(blocked[0].protection.kind, 'challenge');
  groups++;
}
async function realExactScopeAndExpiry() {
  const calls = [];
  const env = environment({ fetch: async url => {
    calls.push(url); const action = new URL(url).searchParams.get('action');
    return response(action === 'handshake' ? { js: { token: 'fixture' } } : action === 'get_ordered_list'
      ? { js: { data: [{ id: '17', name: 'Haber', cmd: 'ffmpeg http://stream.example.com/live.ts' }], total_items: 1 } }
      : { js: { id: 17, login: 'owner', expire_billing_date: '2030-01-01' } });
  } });
  const result = await env.load('src/utils/magBulkScan.ts').runMagBulkScan([job(1)], { scope: 'exact' });
  assert.equal(result[0].category, 'valid'); assert.equal(result[0].expiry, '2030-01-01');
  assert.equal(result[0].protection.state, 'not_observed');
  assert.ok(calls.every(url => new URL(url).pathname === '/custom/portal.php' && !new URL(url).port));
  const normalized = env.load('src/utils/stalker.ts').normalizeStalkerAccountInfo({ expire_billing_date: '2030-01-01', blocked: 1 });
  assert.equal(normalized.status, 'blocked'); assert.equal(expiry.parseAccountExpiryMs(normalized.tariff_expired_date), Date.parse('2030-01-01'));
  assert.equal(expiry.parseAccountExpiryMs('1893456000'), Date.parse('2030-01-01'));
  groups++;
}
async function terminalCatalogProtectionAndQueuedArchive() {
  const session = { endpoint: portal, token: 'fixture' };
  for (const method of ['stalkerEnrichment', 'stalkerCatalog']) {
    const calls = [];
    const env = environment({ fetch: async url => { calls.push(url); return response('<html><div class="g-recaptcha"></div></html>', 403); } });
    const stalker = env.load('src/utils/stalker.ts'), gate = env.load('src/utils/magBulkScan.ts').createMagRequestGate();
    const cred = { portal, mac: mac(1), endpointPolicy: 'exact', requestScope: { ...gate, transport: 'direct' } };
    await assert.rejects(stalker[method](cred, session, { kinds: ['vod', 'series'] }), error => error.kind === 'MAG_PROTECTION' && error.observation.kind === 'captcha');
    assert.equal(calls.length, 1, method + ' must not request series after the VOD challenge'); assert.equal(new URL(calls[0]).searchParams.get('type'), 'vod');
  }
  const calls = [], seen = [];
  const env = environment({ fetch: async url => {
    calls.push(url); const type = new URL(url).searchParams.get('type');
    return type === 'vod' && new URL(url).hostname === 'portal.example.com' ? response('<html>challenge</html>', 403, { 'cf-mitigated': 'challenge' }) : response({ js: [] });
  } });
  const stalker = env.load('src/utils/stalker.ts'), gate = env.load('src/utils/magBulkScan.ts').createMagRequestGate();
  const cred = { portal, mac: mac(1), requestScope: { ...gate, transport: 'direct', onObservation: observation => seen.push(observation) } };
  await assert.rejects(stalker.stalkerCategoryPreview(cred, session), error => error.kind === 'MAG_PROTECTION' && error.observation.kind === 'challenge');
  assert.deepEqual(calls.map(url => new URL(url).searchParams.get('type')), ['itv', 'vod']); assert.ok(seen.some(observation => observation.state === 'present'));
  const prior = calls.length; await assert.rejects(stalker.stalkerCategoryPreview(cred, session), error => error.kind === 'MAG_PROTECTION'); assert.equal(calls.length, prior);
  const otherPortal = 'http://other.example.com/portal.php';
  await stalker.stalkerCategoryPreview({ portal: otherPortal, mac: mac(2), requestScope: { ...gate, transport: 'direct' } }, { endpoint: otherPortal, token: 'fixture' });
  assert.ok(calls.slice(prior).every(url => new URL(url).hostname === 'other.example.com'), 'one stopped account does not cancel unrelated accounts');
  const controller = new AbortController(), cancelledCalls = [];
  const cancelEnv = environment({ fetch: async url => { cancelledCalls.push(url); return response({ js: [] }); } });
  const heldGate = cancelEnv.load('src/utils/magBulkScan.ts').createMagRequestGate({ signal: controller.signal }); heldGate.onRateLimit(portal, 60_000);
  const pending = cancelEnv.load('src/utils/stalker.ts').stalkerCategoryPreview({ portal, mac: mac(1), requestScope: { ...heldGate, signal: controller.signal, transport: 'direct' } }, session);
  controller.abort(); await assert.rejects(pending, error => error.kind === 'CANCELLED'); assert.equal(cancelledCalls.length, 0);
  groups++;
}
function uiAction(name, values, req) {
  const text = source('app/mag-bulk.tsx'); const ast = ts.createSourceFile('mag-bulk.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let arrow; function walk(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) arrow = node.initializer.arguments[0]; ts.forEachChild(node, walk); } walk(ast);
  assert.ok(arrow, name + ' callback exists');
  const exports = {};
  vm.runInNewContext(compile('exports.action = ' + arrow.getText(ast)), { exports, require: req, console, AbortController, ...values }, { filename: name + '.tsx' });
  return exports.action;
}
async function selectedActionsAndArchive() {
  const selected = [1, 3].map(index => ({ ...job(index), category: 'valid', status: 'Active', expiry: '2030-01-01', accountInfo: { username: 'owner', tariff_expired_date: '2030-01-01' }, protection: { state: 'not_observed', kind: 'none', evidence: ['expected-portal-json'], endpoint: portal, observedAt: '2026-10-01', stage: 'get_profile', transport: 'direct' } }));
  const writes = [], alerts = [], added = [];
  let txtFails = false, jsonFails = false;
  const fake = {
    stalkerLogin: async cred => account(cred.portal),
    normalizeStalkerAccountInfo: profile => ({ status: profile.status, tariff_expired_date: profile.expire_billing_date }),
    stalkerCategoryPreview: async () => ({ live: ['Haber'], vod: ['Aksiyon'], series: [], warnings: ['Series kategori önizleme: desteklenmiyor'] }),
    stalkerCatalog: async () => ({ channels: [{ id: 'live' }], diagnostics: { warnings: [] } }),
    stalkerEnrichment: async () => ({ vod: [{ id: 'movie' }], series: [], diagnostics: { warnings: [] } }),
  };
  const env = environment({ '@/src/utils/stalker': fake, '@/modules/kizilkan-native-core': { KizilkanNativeCore: { writePublicTextFile: async (_subdir, name, _mime, data) => { writes.push({ name, data }); return name.endsWith('.txt') && txtFails || name.endsWith('.json') && jsonFails ? { ok: false, error: 'fixture write failed' } : { ok: true, uri: 'content://fixture/' + name, path: name }; } } } });
  const values = {
    selectedResults: selected, selectedValid: selected, validResults: [...selected, { ...job(2), category: 'valid' }], playlists: [],
    busyRef: { current: false }, profileRef: { current: 'owner' }, mountedRef: { current: true }, actionAbortRef: { current: null },
    // v18.7.4 sahiplik/ABA kapsamı: callback bu serbest değişkenlere kapanıyor.
    profileEpoch: 0, profileEpochRef: { current: 0 }, resetProfileEpochRef: { current: 0 }, actionRunRef: { current: 0 }, runRef: { current: 0 },
    setSaving() {}, setAdding() {}, setActionProgress() {}, useProxy: false,
    createMagRequestGate: () => ({}), formatAccountExpiry: expiry.formatAccountExpiry, formatMagArchiveTxt: model.formatMagArchiveTxt,
    magIdentity: model.magAccountIdentity, stableId: (_prefix, identity) => identity,
    addPlaylist: async item => added.push(item), updatePlaylist: async () => {}, enrichPlaylistMedia: async () => {},
    recordDiagnostic: async () => {}, router: { replace() {} }, Alert: { alert: (...args) => alerts.push(args) },
  };
  await uiAction('saveFound', values, env.req)();
  assert.equal(writes.length, 2); assert.ok(writes[0].data.includes('MAC=' + mac(1))); assert.ok(writes[0].data.includes('MAC=' + mac(3)));
  assert.ok(!writes[0].data.includes('MAC=' + mac(2))); assert.ok(writes[0].data.includes('Haber') && writes[0].data.includes('Aksiyon'));
  assert.ok(writes[0].data.includes('DIZI (0 kategori): Alınamadı / desteklenmiyor')); assert.ok(writes[0].data.includes('KULLANICI=owner'));
  assert.deepEqual(json(model.parseMacList(writes[0].data).macs), [mac(1), mac(3)]);
  writes.length = 0; alerts.length = 0; txtFails = true;
  await uiAction('saveFound', values, env.req)(); assert.equal(writes.length, 1); assert.equal(alerts[0][0], 'Kaydedilemedi');
  writes.length = 0; alerts.length = 0; txtFails = false; jsonFails = true;
  await uiAction('saveFound', values, env.req)(); assert.equal(alerts[0][0], 'TXT kaydedildi · JSON başarısız');
  alerts.length = 0; await uiAction('addValid', values, env.req)();
  assert.deepEqual(added.map(item => item.stalkerMac), [mac(1), mac(3)]); assert.ok(added.every(item => item.accountInfo.extra.magProtection.state === 'not_observed'));
  groups++;
}
async function portalChoiceAndUnverified() {
  const first = portal, second = 'http://portal.example.com:80/second/portal.php';
  let logins = [], selected = false;
  const fake = {
    stalkerLogin: async cred => { assert.ok(selected); logins.push(cred.portal); return account(cred.portal); },
    stalkerVerifyAccount: async () => ({ state: 'unverified', accountInfo: {}, evidence: ['no-account-proof'], liveCount: 0 }),
  };
  const env = environment({ '@/src/utils/stalker': fake, '@/src/utils/magPortalDiscovery': {
    discoverMagHosts: async hosts => hosts.map(host => ({ ...report(host, first), candidates: [...report(host, first).candidates, ...report(host, second).candidates] })),
  } });
  const runner = env.load('src/utils/magBulkScan.ts');
  const results = await runner.runMagBulkScan([job(1), job(2)], { selectPortals: async reports => { assert.equal(logins.length, 0); selected = true; return { [reports[0].host.host]: second }; } });
  assert.deepEqual(logins, [second, second]); assert.ok(results.every(r => r.category === 'unverified'));
  await assert.rejects(runner.runMagBulkScan([job(1)], { selectPortals: async () => ({ [portal]: 'http://foreign.example.com/portal.php' }) }), /Seçilen API/);
  const controller = new AbortController(); logins = [];
  const pending = runner.runMagBulkScan([job(1)], { control: { signal: controller.signal }, selectPortals: async () => { controller.abort(); return new Promise(() => {}); } });
  assert.equal((await pending).length, 0); assert.equal(logins.length, 0);
  groups++;
}
async function terminalDiscoveryStopsAccountStage() {
  const otherPortal = 'http://other.example.com:8080/portal.php';
  const otherJob = { ...job(3), portal: otherPortal, hostRaw: otherPortal, explicitPort: '8080' };
  for (const state of ['protected', 'error']) {
    const logins = [], verifications = [];
    const protection = { state: 'present', kind: 'captcha', endpoint: portal + '/challenge', stage: 'portal-discovery',
      evidence: ['captcha-widget'], observedAt: '2026-10-02', transport: 'direct' };
    const fake = {
      stalkerLogin: async cred => { logins.push(cred.portal); return account(cred.portal); },
      stalkerVerifyAccount: async cred => { verifications.push(cred.portal); return { state: 'verified', accountInfo: {}, evidence: ['fixture-account-access'], liveCount: 1 }; },
    };
    const runner = environment({ '@/src/utils/stalker': fake, '@/src/utils/magPortalDiscovery': {
      discoverMagHosts: async hosts => hosts.map(host => host.host === otherPortal ? report(host, otherPortal) : ({
        ...report(host, portal), state, message: 'Host discovery stopped after an earlier API response',
        candidates: [...report(host, portal).candidates, ...(state === 'protected' ? [{
          endpoint: portal + '/challenge', confidence: 'protected', selectable: false, httpStatus: 403,
          evidence: ['captcha-widget'], elapsedMs: 5, protection,
        }] : [])],
      })),
    } }).load('src/utils/magBulkScan.ts');
    const input = [job(1), job(2)];
    for (const manual of [false, true]) {
      let selectionCalls = 0;
      const results = await runner.runMagBulkScan(input, manual ? { selectPortals: async () => { selectionCalls++; return { [portal]: portal }; } } : {});
      assert.equal(results.length, 2); assert.ok(results.every(r => r.category === state));
      assert.equal(logins.length, 0); assert.equal(verifications.length, 0);
      assert.equal(selectionCalls, 0, 'terminal-only reports must not enter a manual selection wait');
      if (state === 'protected') assert.ok(results.every(r => r.protection.kind === 'captcha'), 'discovery protection evidence survives the account result');
    }
    await assert.rejects(runner.runMagBulkScan([...input, otherJob], {
      selectPortals: async () => ({ [otherPortal]: otherPortal, [portal]: portal }),
    }), /Seçilen API/, 'a manual choice must not reactivate an earlier candidate from a terminal host');
    assert.equal(logins.length, 0); assert.equal(verifications.length, 0);
    const mixed = await runner.runMagBulkScan([...input, otherJob], {
      selectPortals: async () => ({ [otherPortal]: otherPortal }),
    });
    assert.equal(mixed.length, 3); assert.equal(mixed.filter(r => r.category === state).length, 2);
    assert.equal(mixed.find(r => r.portal === otherPortal).category, 'valid');
    assert.deepEqual(logins, [otherPortal]); assert.deepEqual(verifications, [otherPortal]);
    const skipped = await runner.runMagBulkScan([otherJob], { selectPortals: async () => ({}) });
    assert.equal(skipped.length, 0, 'manual omission of a ready host still skips that host');
    assert.deepEqual(logins, [otherPortal]);
  }
  groups++;
}
async function nativeProxyCancel() {
  let activeId, finish, cancelledId;
  const native = {
    proxiedRequest: async () => '{}',
    proxiedRequestCancelable: async id => { activeId = id; return new Promise(resolve => { finish = resolve; }); },
    cancelProxiedRequest: id => { cancelledId = id; finish(JSON.stringify({ ok: false, status: 0, body: '', error: 'CANCELLED' })); },
  };
  const bridge = environment({ 'expo-modules-core': { requireNativeModule: () => native } }).load('modules/panel-scan/index.ts').PanelScan;
  const controller = new AbortController();
  const pending = bridge.proxiedRequest(portal, 'GET', {}, '', 1000, controller.signal);
  controller.abort(); const result = await pending;
  assert.equal(cancelledId, activeId); assert.equal(result.error, 'CANCELLED');
  groups++;
}
(async () => {
  await scopeAndIdentity(); await negativeAndSingleFlight(); await cancellationAndParallel(); await protectionAndRates(); await realExactScopeAndExpiry(); await terminalCatalogProtectionAndQueuedArchive(); await selectedActionsAndArchive(); await portalChoiceAndUnverified(); await terminalDiscoveryStopsAccountStage(); await nativeProxyCancel();
  console.log(`PASS: MAG kapsam/yarış/iptal/koruma/seçim/TXT/proxy — ${groups} davranış grubu`);
})().catch(error => { console.error(error); process.exitCode = 1; });
