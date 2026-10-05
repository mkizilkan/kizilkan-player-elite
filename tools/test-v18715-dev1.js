#!/usr/bin/env node
/** DEV1: gerçek TS modülleri; tüm HTTP/native/storage sınırları izole test verisi. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..', 'frontend');
const endpoint = 'http://fixture.invalid:8080/portal.php', mac = '00:1A:79:00:00:01';
const response = (body, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status,
  headers: { get: key => headers[key.toLowerCase()] || '' }, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
function environment(handler = () => response('', 404), overrides = {}) {
  const cache = new Map(), calls = [], events = [], stored = new Map();
  const route = async (url, init = {}) => { const u = new URL(url), params = init.body ? new URLSearchParams(init.body) : u.searchParams;
    const entry = { url, path: u.pathname, action: params.get('action'), type: params.get('type'), headers: init.headers || {}, signal: init.signal };
    calls.push(entry); return handler(entry); };
  const mocks = {
    'expo/fetch': { fetch: route },
    '@/src/utils/diagnostics': { recordDiagnostic: async (...args) => events.push(args), markTask: () => () => {} },
    '@/src/utils/storage': { storage: { getItem: async (key, fallback) => stored.get(key) ?? fallback, getItemStrict: async (key, fallback) => stored.get(key) ?? fallback, setItem: async (key, value) => stored.set(key, value) } },
    '@/modules/kizilkan-native-core': { KizilkanNativeCore: { available: false } },
    '@/modules/panel-scan': { PanelScan: { proxiedRequest: async () => { throw new Error('Unexpected proxy fixture'); } } },
    'expo-crypto': { CryptoDigestAlgorithm: { MD5: 'md5', SHA1: 'sha1', SHA256: 'sha256' }, digestStringAsync: async (algorithm, text) => crypto.createHash(algorithm).update(text).digest('hex') },
    ...overrides,
  };
  function load(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const exports = {}; cache.set(rel, exports);
    const filename = path.join(root, rel), code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const req = id => Object.prototype.hasOwnProperty.call(mocks, id) ? mocks[id] : id.startsWith('@/') ? load(id.slice(2) + '.ts') : id.startsWith('.') ? load(path.posix.normalize(path.posix.join(path.posix.dirname(rel), id)) + '.ts') : require(id);
    vm.runInNewContext(code, { exports, require: req, URL, URLSearchParams, AbortController, TextDecoder, Uint8Array, setTimeout, clearTimeout, console, fetch: route }, { filename });
    return exports;
  }
  return { load, calls, events, stored };
}
const norm = value => JSON.parse(JSON.stringify(value));
const host = value => ({ raw: value, host: value, hasPort: true, explicitPort: new URL(value).port || '80', hasPath: new URL(value).pathname !== '/' });
const noGate = { beforeRequest: async () => {} };
let groups = 0;
function pass(message) { groups++; console.log('PASS DEV1: ' + message); }
(async () => {
  {
    const r = environment().load('src/utils/magEndpointRegistry.ts');
    const verified = r.resolveMagPortal('http://fixture.invalid:8080/c/', endpoint, ['handshake-token'], 'handshake');
    const weak = r.resolveMagPortal('http://fixture.invalid:8080/c/', 'http://fixture.invalid:8080/c', ['stalker-version-js'], 'version');
    assert.equal(verified.endpointLocked, true); assert.equal(verified.confidence, 'verified');
    assert.equal(r.preferResolvedMagPortal(verified, weak).endpoint, endpoint);
    assert.equal(r.resolveMagPortal(endpoint, endpoint, ['HTTP200']).confidence, 'none');
    assert.throws(() => r.resolveMagPortal(endpoint, 'http://foreign.invalid/portal.php', ['handshake-token']));
    assert.equal(r.magInstallation('http://fixture.invalid/custom/stalker_portal/c/xpcom.common.js').base, '/custom/stalker_portal');
    pass('verified endpoint düşük kanıtla değişmez; HTTP200 tek başına kanıt değil');
  }
  {
    const resolver = environment().load('src/utils/magClientJsResolver.ts');
    const source = 'http://fixture.invalid/stalker_portal/c/xpcom.common.js';
    const good = resolver.resolveMagClientJs('this.portal_path="/stalker_portal/server/load.php";', source, 'application/javascript');
    assert.deepEqual(norm(good.endpoints), ['http://fixture.invalid/stalker_portal/server/load.php']);
    assert.equal(resolver.resolveMagClientJs('<html>var portal_path="/portal.php"</html>', source, 'text/html').endpoints.length, 0);
    for (const raw of ['https://foreign.invalid/portal.php', '/other/portal.php', '/stalker_portal/%2e%2e/portal.php', '/stalker_portal/%252e%252e/portal.php', 'javascript:alert(1)', 'data:text/javascript,x', 'file:///portal.php']) {
      assert.equal(resolver.resolveMagLocalReference(raw, source), null, raw);
    }
    assert.equal(resolver.resolveMagClientJs('var portal_ip="foreign.invalid";var portal_path="/stalker_portal/server/load.php";', source).endpoints.length, 0);
    assert.equal(resolver.isMagVersionScript('<!doctype html> version="4"', 'text/html'), false);
    assert.equal(resolver.isMagVersionScript('var ver="Stalker 5.6";', 'application/javascript'), true);
    pass('xpcom yalnız metin; origin/dizin/protokol/encoded traversal; version HTML reddi');
  }
  {
    const { MagDiscoveryBudget } = environment().load('src/utils/magDiscoveryBudget.ts');
    const budget = new MagDiscoveryBudget({ deadlineMs: 1000, maxRequests: 2 });
    try { budget.consume(); budget.consume(); assert.throws(() => budget.consume(), e => e.kind === 'MAG_DISCOVERY_BUDGET'); assert.equal(budget.requests, 2); } finally { budget.dispose(); }
    const deadline = new MagDiscoveryBudget({ deadlineMs: 20 });
    try { await assert.rejects(deadline.run(new Promise(() => {})), e => e.kind === 'MAG_DISCOVERY_BUDGET'); assert.equal(deadline.signal.aborted, true); } finally { deadline.dispose(); }
    const controller = new AbortController(), cancelled = new MagDiscoveryBudget({ signal: controller.signal }); controller.abort();
    try { assert.throws(() => cancelled.consume(), e => e.kind === 'CANCELLED'); } finally { cancelled.dispose(); }
    pass('request sınırı atomik; gerçek deadline uncooperative işi keser; kullanıcı iptali ayrı');
  }
  {
    const e = environment(c => c.path === '/c' ? response('<html>Stalker gSTB</html>')
      : c.path === '/c/xpcom.common.js' ? response('var portal_path="/portal.php";', 200, { 'content-type': 'application/javascript' })
      : c.path === '/portal.php' ? response({ js: { token: 'anonymous-fixture' } }, 200, { 'content-type': 'application/json' }) : response('missing', 404));
    const reports = await e.load('src/utils/magPortalDiscovery.ts').discoverMagHosts([host('http://fixture.invalid:8080/c')], { scope: 'fallback', gate: noGate });
    const candidate = reports[0].candidates.find(value => value.endpoint === endpoint && value.confidence === 'api');
    assert.ok(candidate); assert.equal(candidate.resolvedPortal.endpoint, endpoint);
    assert.equal(e.load('src/utils/magBulkScan.ts').chooseMagPortals(reports)[reports[0].host.host], endpoint);
    assert.ok(e.calls.some(c => c.path === '/c/xpcom.common.js'));
    assert.ok(!e.calls.some(c => /foreign/.test(c.url)));
    pass('/c → xpcom → gerçek API; typed aday ve otomatik seçim aynı endpoint');
  }
  {
    const e = environment(() => response('<html>just a generic page</html>'));
    const reports = await e.load('src/utils/magPortalDiscovery.ts').discoverMagHosts([host(endpoint)], { scope: 'exact', gate: noGate });
    assert.equal(reports[0].candidates.some(value => value.selectable), false);
    assert.ok(e.calls.every(c => c.path === '/portal.php'));
    const { MagDiscoveryBudget } = e.load('src/utils/magDiscoveryBudget.ts'), budget = new MagDiscoveryBudget({ maxRequests: 1, deadlineMs: 1000 });
    try {
      const reports = await e.load('src/utils/magPortalDiscovery.ts').discoverMagHosts([host(endpoint)], { scope: 'exact', gate: noGate, budgetForHost: () => budget });
      assert.equal(budget.requests, 1); assert.equal(reports[0].budget.exhausted, true); assert.match(reports[0].message, /bütçesi/);
    } finally { budget.dispose(); }
    pass('HTML200 hesap/portal sayılmaz; exact genişlemez; actual request bütçesi ölçülür');
  }
  {
    const e = environment(c => c.action === 'handshake' ? response({ js: { token: 'fixture-token' } })
      : c.action === 'get_profile' ? response({ js: { id: 7, login: 'fixture-login', mac } })
      : c.action === 'get_main_info' ? response({ js: { fname: 'Fixture Display', mac, max_connections: 2, active_cons: 0, allowed_output_formats: ['ts', 'm3u8'] } })
      : response({ js: { data: [{ id: 1, name: 'Fixture Channel', cmd: 'ffmpeg http://fixture.invalid/ch/1' }] } }));
    const s = e.load('src/utils/stalker.ts'), r = e.load('src/utils/magEndpointRegistry.ts');
    const cred = { portal: 'http://fixture.invalid:8080/c', mac, resolvedPortal: r.resolveMagPortal('http://fixture.invalid:8080/c', endpoint, ['handshake-token'], 'handshake') };
    const login = await s.stalkerLogin(cred);
    assert.equal(login.session.endpoint, endpoint); assert.equal(cred.endpointPolicy, 'exact'); assert.equal(login.session.resolvedPortal.endpointLocked, true);
    const verification = await s.stalkerVerifyAccount(cred, login.session, login.profile);
    assert.equal(verification.state, 'verified'); assert.equal(verification.accountInfo.username, 'fixture-login'); assert.equal(verification.accountInfo.display_name, 'Fixture Display');
    assert.equal(verification.accountInfo.active_cons, 0); assert.equal(verification.accountInfo.max_connections, 2);
    assert.ok(e.calls.every(c => c.path === '/portal.php'));
    const playlist = { stalkerPortal: endpoint, stalkerMac: mac, stalkerResolvedPortal: login.session.resolvedPortal };
    assert.equal(s.stalkerCredsFromPlaylist(playlist).endpointPolicy, 'exact');
    assert.equal(s.stalkerCredsFromPlaylist({ ...playlist, stalkerPortal: 'http://fixture.invalid:8080/other.php' }).resolvedPortal, undefined);
    pass('resolved endpoint login/snapshot/bulk/persist-creds boyunca aynı; edit eski kilidi kullanmaz');
  }
  {
    const e = environment(c => c.action === 'handshake' ? response({ js: { token: 'fixture-token' } }) : response({ js: { id: 9, login: 'fixture' } }));
    const r = e.load('src/utils/magEndpointRegistry.ts'), resolved = r.resolveMagPortal(endpoint, endpoint, ['handshake-token'], 'handshake', 'golden');
    await e.load('src/utils/stalker.ts').stalkerLogin({ portal: endpoint, mac, resolvedPortal: resolved, endpointPolicy: 'exact' });
    const attempts = e.events.filter(row => row[1] === 'STALKER_COMPAT_ATTEMPT');
    assert.equal(attempts[0][2].compatProfile, 'golden');
    const fail = environment(() => response({ js: null }));
    await assert.rejects(fail.load('src/utils/stalker.ts').stalkerLogin({ portal: endpoint, mac, endpointPolicy: 'exact' }));
    const profiles = new Set(fail.events.filter(row => row[1] === 'STALKER_COMPAT_ATTEMPT').map(row => row[2].compatProfile));
    assert.ok(profiles.size <= 3); assert.ok(profiles.has('pcap320-minimal')); assert.ok(profiles.has('wire250'));
    pass('öğrenilmiş legacy profil önce; toplam uyumluluk profil sayısı en çok üç');
  }
  {
    const e = environment(), s = e.load('src/utils/stalker.ts'), cards = e.load('src/utils/accountCard.ts');
    const edge = s.observeMagProtection({ endpoint, stage: 'fixture', status: 200, body: '{"js":{"id":1}}', headers: { server: 'cloudflare', 'cf-ray': 'fixture-ray', 'set-cookie': 'must-not-store' }, transport: 'direct' });
    assert.equal(edge.state, 'not_observed'); assert.equal(edge.edge, 'cloudflare'); assert.equal(edge.responseHeaders['set-cookie'], undefined);
    assert.equal(s.observeMagProtection({ endpoint, stage: 'fixture', status: 403, body: '', headers: {}, transport: 'direct' }).state, 'unknown');
    assert.equal(s.observeMagProtection({ endpoint, stage: 'fixture', status: 429, body: '', headers: {}, transport: 'direct' }).kind, 'rate_limit');
    assert.equal(cards.accountStatus({}).tone, 'unknown'); assert.equal(cards.accountStatus({ status: 'blocked' }).label, 'ENGELLİ');
    assert.equal(cards.accountExpiryLabel({ expiryKind: 'unlimited' }), 'Sınırsız'); assert.equal(cards.accountExpiryLabel({}), 'Belirlenemedi');
    const parser = e.load('src/utils/catalogProgress.ts');
    const progress = parser.applyCatalogProgress({ phase: 'content', message: '', live: 'done', liveCount: 12 }, { stage: 'vod', message: 'fixture', loaded: 28, total: 104745, page: 2 });
    assert.equal(progress.live, 'done'); assert.equal(progress.liveCount, 12); assert.equal(progress.vodCount, 28); assert.equal(progress.vodTotal, 104745); assert.equal(progress.vodPage, 2);
    pass('edge≠challenge; 403 belirsiz; kart bilinmeyen/sınırsız ayrımı; progress sayıları korunur');
  }
  {
    const { MagDiscoveryBudget, magPassiveDiscoveryBudget } = environment().load('src/utils/magDiscoveryBudget.ts');
    const shared = new MagDiscoveryBudget({ deadlineMs: 120, maxRequests: 30 }), passive = magPassiveDiscoveryBudget(shared);
    try {
      passive.consume(); passive.consume();
      await assert.rejects(passive.run(new Promise(() => {})), e => e.kind === 'MAG_DISCOVERY_BUDGET');
      assert.equal(shared.signal.aborted, false); assert.equal(shared.requests, 2);
      shared.consume(); assert.equal(shared.requests, 3); assert.ok(shared.remainingMs > 0);
    } finally { passive.dispose(); shared.dispose(); }
    pass('pasif faz aynı sayaçtan tüketir; phase deadline handshake payını iptal etmez');
  }
  {
    const e = environment(() => new Promise(() => {})), s = e.load('src/utils/stalker.ts');
    const { MagDiscoveryBudget } = e.load('src/utils/magDiscoveryBudget.ts'), budget = new MagDiscoveryBudget({ deadlineMs: 80 });
    try {
      const started = Date.now();
      await assert.rejects(s.discoverMagPortal({ portal: endpoint, mac, requestScope: { ...noGate, transport: 'direct', discoveryBudget: budget } }, [endpoint]), e => e.kind === 'MAG_DISCOVERY_BUDGET');
      assert.ok(Date.now() - started < 800); assert.equal(e.calls.length, 1); assert.equal(e.calls[0].signal.aborted, true);
    } finally { budget.dispose(); }
    const c = new AbortController(), profile = environment(entry => entry.action === 'handshake' ? response({ js: { token: 'fixture' } }) : new Promise(() => {}));
    const timer = setTimeout(() => c.abort(), 100);
    try { await assert.rejects(profile.load('src/utils/stalker.ts').stalkerLogin({ portal: endpoint, mac, endpointPolicy: 'exact', requestScope: { ...noGate, transport: 'direct' } }, { signal: c.signal }), e => e.kind === 'CANCELLED'); }
    finally { clearTimeout(timer); }
    assert.ok(profile.calls.length <= 2); assert.ok(profile.calls.every(entry => entry.signal.aborted));
    pass('gerçek handshake/profile transport iptal edilir; takılan fetch sonrasında yeni profil başlamaz');
  }
  {
    const e = environment(entry => entry.path === '/portal.php' && entry.url.startsWith('https:') ? response({ js: { token: 'anonymous-fixture' } }) : response('<html>generic responder</html>'));
    const input = { ...host('http://fixture.invalid:8080/c'), raw: 'fixture.invalid:8080/c' };
    const reports = await e.load('src/utils/magPortalDiscovery.ts').discoverMagHosts([input], { gate: noGate });
    const chosen = e.load('src/utils/magBulkScan.ts').chooseMagPortals(reports)[input.host];
    assert.equal(chosen, 'https://fixture.invalid:8080/portal.php');
    assert.ok(reports[0].candidates.find(c => c.endpoint === chosen).resolvedPortal.endpointLocked);
    const explicit = environment(() => response('<html>generic responder</html>'));
    await explicit.load('src/utils/magPortalDiscovery.ts').discoverMagHosts([host('http://fixture.invalid:80/c')], { gate: noGate });
    assert.ok(explicit.calls.every(entry => entry.url.startsWith('http:') && !new URL(entry.url).port));
    const literal = environment(() => response('', 404));
    await literal.load('src/utils/magPortalDiscovery.ts').discoverMagHosts([{ ...host('http://fixture.invalid/portal.php'), hasPort: false }], { gate: noGate });
    assert.equal(literal.calls.length, 1); assert.equal(literal.calls[0].path, '/portal.php');
    pass('scheme gerçek API kanıtıyla seçilir; açık HTTP/:80 korunur; otomatik literal PHP genişlemez');
  }
  {
    const budgets = [], portal = 'http://fixture.invalid:8080/c';
    const e = environment(undefined, {
      '@/src/utils/magPortalDiscovery': { discoverMagHosts: async entries => entries.map(host => ({ host, candidates: [], probes: 0, state: 'not-found' })) },
      '@/src/utils/stalker': { discoverMagPortal: async cred => { budgets.push(cred.requestScope.discoveryBudget); cred.requestScope.discoveryBudget.consume(); return null; } },
    });
    const jobs = [1, 2, 3, 4].map(i => ({ hostRaw: portal, portal, hasPort: true, hasPath: true, mac: `00:1A:79:00:00:0${i}` }));
    const results = await e.load('src/utils/magBulkScan.ts').runMagBulkScan(jobs);
    assert.equal(budgets.length, 3); assert.ok(budgets.every(b => b === budgets[0])); assert.equal(budgets[0].requests, 3); assert.equal(results.length, 4);
    pass('gerçek bulk orchestration üç MAC fallback boyunca aynı host bütçesini paylaşır');
  }
  {
    const selected = 'http://fixture.invalid:8080/server/load.php', portal = 'http://fixture.invalid:8080/c';
    const e = environment(entry => {
      if (!entry.headers.Cookie) return entry.path === '/portal.php' ? response({ js: { token: 'anonymous' } }) : entry.path === '/server/load.php' ? response('Authorization failed.') : response('', 404);
      if (entry.action === 'handshake') return response({ js: { token: 'account-fixture' } });
      if (entry.action === 'get_profile' || entry.action === 'get_main_info') return response({ js: { id: 17, login: 'fixture-login', mac, status: 'Active' } });
      return response({ js: { data: [{ id: 1, name: 'Fixture Live', cmd: 'ffmpeg http://fixture.invalid/ch/1' }] } });
    });
    let automatic;
    const results = await e.load('src/utils/magBulkScan.ts').runMagBulkScan([{ hostRaw: portal, portal, hasPort: true, hasPath: true, mac }], {
      scope: 'fallback', selectPortals: async reports => { automatic = e.load('src/utils/magBulkScan.ts').chooseMagPortals(reports)[portal];
        assert.equal(reports[0].candidates.find(c => c.endpoint === selected).confidence, 'fingerprint'); return { [portal]: selected }; },
    });
    assert.equal(automatic, endpoint); assert.equal(results[0].category, 'valid'); assert.equal(results[0].portal, selected);
    assert.equal(results[0].resolvedPortal.endpoint, selected); assert.equal(results[0].resolvedPortal.resolvedBy, 'handshake');
    assert.ok(e.calls.filter(c => c.headers.Cookie).every(c => c.path === '/server/load.php'));
    pass('manuel pending aday seçimi eski API etiketini taşımaz; hesap yalnız seçilen endpointte doğrulanır');
  }
  console.log(`PASS DEV1: ${groups} gerçek-modül davranış grubu`);
})().catch(error => { console.error(error); process.exitCode = 1; });
