#!/usr/bin/env node
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('./_ts');
const root = path.resolve(__dirname, '../frontend');
const plain = v => JSON.parse(JSON.stringify(v));
function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  const load = id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    const rel = id.replace(/^@\//, '').replace(/^\.\//, 'src/utils/');
    const file = path.join(root, rel + (rel.endsWith('.tsx') ? '' : '.ts'));
    if (cache.has(file)) return cache.get(file);
    if (!fs.existsSync(file)) throw new Error('Unmocked import: ' + id);
    const exports = {}; cache.set(file, exports);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    vm.runInNewContext(js, { exports, require: load, URL, URLSearchParams, AbortController, console, setTimeout, clearTimeout, ...globals }, { filename: file });
    return exports;
  };
  return load;
}

function dnsUI(iptv = {}) {
  let cursor = 0; const slots = new Map(); let effects = []; const chosen = [], evidence = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: initial => { const i = cursor++; if (!slots.has(i)) slots.set(i, { value: typeof initial === 'function' ? initial() : initial });
      const set = value => { const slot = slots.get(i); slot.value = typeof value === 'function' ? value(slot.value) : value; }; return [slots.get(i).value, set]; },
    useRef: value => { const i = cursor++; if (!slots.has(i)) slots.set(i, { current: value }); return slots.get(i); },
    useCallback: fn => { cursor++; return fn; },
    useEffect: (fn, deps) => { const i = cursor++, previous = slots.get(i); if (!previous || deps.some((v, j) => !Object.is(v, previous.deps[j]))) {
      slots.set(i, { deps }); effects.push(() => { previous?.cleanup?.(); slots.get(i).cleanup = fn(); }); } },
  };
  const load = loader({
    react: { __esModule: true, default: react, ...react },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/src/theme/ThemeContext': { useTheme: () => ({ colors: { surface: '#000', error: 'red', success: 'green' } }) },
    '@/src/theme/themes': { SPACING: { lg: 16, sm: 8 }, RADIUS: { md: 8 }, FONT: { size: { sm: 12, xs: 10, base: 14 }, weight: { bold: 'bold' } } },
    './FocusButton': { FocusButton: 'Button' }, './EndpointPlaybackTest': { EndpointPlaybackTest: 'Probe' },
    '@/src/player/hostFailover': { normalizeHost: x => x }, '@/src/utils/iptv': iptv, '@/src/utils/diagnostics': { recordDiagnostic: async () => {} },
  });
  const props = { primary: 'http://a.example', hosts: ['http://b.example', 'http://c.example'], username: 'fixture', password: 'fixture', endpoints: [],
    onChange: () => {}, onMakePrimary: h => chosen.push(h), onEvidence: e => evidence.push(e) };
  const manager = load('src/components/DnsManager.tsx').DnsManager;
  let tree;
  const render = () => { cursor = 0; effects = []; tree = manager(props); const pending = effects; effects = []; pending.forEach(fn => fn()); return tree; };
  const find = (predicate, value) => {
    if (!value) return null;
    if (Array.isArray(value)) { for (const v of value) { const hit = find(predicate, v); if (hit) return hit; } return null; }
    if (predicate(value)) return value;
    return value.children ? find(predicate, value.children) : null;
  };
  render(); render();
  return { props, render, chosen, evidence, find: predicate => find(predicate, tree), click: id => { const node = find(n => n.props?.testID === id, tree); assert(node, id); node.props.onPress(); render(); }, probe: () => find(n => n.type === 'Probe', tree) };
}

function controlUI(playlist) {
  let cursor = 0, effects = [], tree, focusCleanup; const slots = new Map(), writes = [], preferences = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: initial => { const i = cursor++; if (!slots.has(i)) slots.set(i, { value: typeof initial === 'function' ? initial() : initial }); return [slots.get(i).value, v => { const s = slots.get(i); s.value = typeof v === 'function' ? v(s.value) : v; }]; },
    useRef: v => { const i = cursor++; if (!slots.has(i)) slots.set(i, { current: v }); return slots.get(i); },
    useCallback: (fn, deps) => { const i = cursor++; if (!slots.has(i)) slots.set(i, fn); return slots.get(i); },
    useEffect: (fn, deps) => { const i = cursor++, before = slots.get(i); if (!before || deps.some((v, j) => !Object.is(v, before.deps[j]))) { slots.set(i, { deps }); effects.push(fn); } },
  };
  const load = loader({ react: { __esModule: true, default: react, ...react }, 'react-native': { View: 'View', Text: 'Text' },
    'expo-router': { useFocusEffect: fn => { const i = cursor++; if (!slots.has(i)) { slots.set(i, true); effects.push(() => { focusCleanup = fn(); }); } } },
    '@/src/store/PlaylistContext': { usePlaylists: () => ({ updatePlaylist: (id, payload) => new Promise((resolve, reject) => writes.push({ id, payload, resolve, reject })) }) },
    '@/src/store/ProfileContext': { useProfiles: () => ({ activeProfile: { id: 'fixture-profile' } }) }, '@/src/theme/ThemeContext': { useTheme: () => ({ colors: { error: 'red' } }) },
    './PortalHealthCard': {PortalHealthCard:'Health'}, './DnsManager': { DnsManager: 'DNS' }, '@/src/player/hostFailover': { rememberWorkingHost: async (_, host) => { preferences.push(host); } },
    '@/src/utils/panelDnsFailover': { boundPanelDnsCandidates: async () => [], magDnsCandidate: x => x } });
  const Component = load('src/components/PlaylistDnsControls.tsx').PlaylistDnsControls;
  const render = () => { cursor = 0; effects = []; tree = Component({ playlist }); effects.forEach(fn => fn()); return tree; };
  const dns = () => tree?.children.find(n => n?.type === 'DNS'); render(); render();
  return { render, dns, writes, preferences, blur: () => { focusCleanup(); render(); } };
}

async function main() {
  const load = loader(); const dns = load('./playlistDnsManagement'), proof = load('./playlistEndpoints'), ops = load('./catalogOperations');
  const pl = { id: 'fixture', source: 'xtream', xtreamServer: 'http://a.example', backupHosts: ['http://b.example'], endpoints: [],
    serverCodeBinding: { code: '1', autoResolve: true, selectedHosts: ['http://a.example'], allowDirectoryAlternatives: false, validatedHosts: ['http://a.example'] } };
  const patch = dns.playlistDnsPatch(pl, ['http://a.example', 'http://b.example', 'http://c.example'], 'http://b.example');
  assert.equal(patch.xtreamServer, 'http://b.example'); assert.equal(patch.serverCodeBinding.autoResolve, true);
  assert.deepEqual(plain(patch.serverCodeBinding.selectedHosts), ['http://a.example', 'http://b.example', 'http://c.example']);
  assert.deepEqual(plain(patch.serverCodeBinding.validatedHosts), ['http://a.example']);
  assert.equal(patch.endpoints.filter(e => e.primary).length, 1);
  const mag = dns.playlistDnsPatch({ id: 'mag', source: 'stalker', stalkerPortal: 'http://a.example:8080/c/portal.php', stalkerResolvedPortal: { endpoint: 'old' } }, ['http://a.example:8080/c/portal.php', 'http://b.example:8081/custom/portal.php'], 'http://b.example:8081/custom/portal.php');
  assert.equal(mag.stalkerPortal, 'http://b.example:8081/custom/portal.php'); assert.equal(mag.stalkerResolvedPortal, undefined);
  const aliases = proof;
  assert.equal(aliases.selectedMagDnsCandidate('http://b.example:8081/custom/portal.php', 'http://a.example:8080/c'), 'http://b.example:8081/custom/portal.php');
  assert.equal(aliases.selectedMagDnsCandidate('http://b.example:8081', 'http://a.example:8080/c'), 'http://b.example:8081/c');
  assert.equal(aliases.selectedMagDnsCandidate('http://b.example/c?token=fixture', 'http://a.example/c'), '');
  assert.throws(() => dns.playlistDnsPatch(pl, ['http://a.example'], 'http://z.example'), /listesinde/);
  const frame = { url: 'http://a.example', firstFrameAt: '2026-10-11T12:00:00Z', firstFrameElapsedMs: 20 };
  const failed = { ...frame, playbackTestAt: '2026-10-11T12:01:00Z', playbackTestState: 'no_frame' };
  assert.equal(dns.bestPlaybackEndpoint([failed]), undefined); assert.match(proof.endpointProofLabel(failed), /görüntü alınamadı/);
  assert.equal(dns.bestPlaybackEndpoint([frame, { ...frame, url: 'http://b.example', firstFrameElapsedMs: 10 }]).url, 'http://b.example');
  for (const days of [1, 2, 3, 7, 30]) { assert(ops.FRESHNESS_OPTIONS.includes(days * 1440)); assert.equal(ops.freshnessDue(0, days * 1440, days * 86400000 - 1), false); assert.equal(ops.freshnessDue(0, days * 1440, days * 86400000), true); }
  console.log('PASS: DNS metadata selection/proof isolation and actual day/week/month scheduling');

  let calls = [];
  const server = loader({ '@/src/utils/iptv': { xtreamLogin: async ({ server }) => { calls.push(server); if (server.includes('a.example')) throw Object.assign(Error('auth=0'), { kind: 'ACCOUNT_REJECTED' }); return { user_info: { auth: 1 } }; } },
    '@/src/utils/storage': { storage: {} }, '../../modules/panel-scan': { PanelScan: {} } });
  assert.equal((await server('./serverCode').pickWorkingHost(['http://a.example', 'http://b.example'], 'fixture', 'fixture')).server, 'http://b.example');
  assert.deepEqual(calls, ['http://a.example', 'http://b.example']);
  calls = [];
  const guarded = loader({ '@/src/utils/iptv': { xtreamLogin: async ({ server }) => { calls.push(server); throw Object.assign(Error('challenge'), { kind: 'PROTECTION' }); } }, '@/src/utils/storage': { storage: {} }, '../../modules/panel-scan': { PanelScan: {} } });
  await assert.rejects(guarded('./serverCode').pickWorkingHost(['http://a.example', 'http://b.example'], 'fixture', 'fixture'), /challenge/); assert.equal(calls.length, 1);
  const sharedMocks = { '@/src/utils/storage': { storage: {} }, '../../modules/panel-scan': { PanelScan: {} } };
  let fireDeadline, deadlineCalls = [];
  const timed = loader({ ...sharedMocks, '@/src/utils/iptv': { xtreamLogin: async ({ server }, signal) => {
    deadlineCalls.push(server);
    if (server.includes('a.example')) { fireDeadline(); assert(signal.aborted); throw Object.assign(Error('local abort'), { kind: 'BACKGROUND_PAUSE' }); }
    return { user_info: { auth: 1 } };
  } } }, { setTimeout: fn => { fireDeadline = fn; return 1; }, clearTimeout: () => {} });
  assert.equal((await timed('./serverCode').pickWorkingHost(['http://a.example', 'http://b.example'], 'fixture', 'fixture')).server, 'http://b.example');
  assert.equal(deadlineCalls.length, 2);
  for (const kind of ['PROTECTION', 'RATE_LIMIT']) {
    deadlineCalls = [];
    const blockedDeadline = loader({ ...sharedMocks, '@/src/utils/iptv': { xtreamLogin: async ({ server }) => { deadlineCalls.push(server); fireDeadline(); throw Object.assign(Error(kind), { kind }); } } }, { setTimeout: fn => { fireDeadline = fn; return 1; }, clearTimeout: () => {} });
    await assert.rejects(blockedDeadline('./serverCode').pickWorkingHost(['http://a.example', 'http://b.example'], 'fixture', 'fixture'), e => e.kind === kind); assert.equal(deadlineCalls.length, 1);
  }
  const parent = new AbortController(); let parentCalls = 0;
  const stopped = loader({ ...sharedMocks, '@/src/utils/iptv': { xtreamLogin: async (_, signal) => { parentCalls++; parent.abort(); assert(signal.aborted); throw Object.assign(Error('stop'), { kind: 'BACKGROUND_PAUSE' }); } } });
  await assert.rejects(stopped('./serverCode').pickWorkingHost(['http://a.example', 'http://b.example'], 'fixture', 'fixture', parent.signal), /stop/); assert.equal(parentCalls, 1);
  console.log('PASS: actual panel resolver auth=0/timeout alias recovery, parent cancellation and protection even at the deadline');

  const iptvText = fs.readFileSync(path.join(root, 'src/utils/iptv.ts'), 'utf8');
  const iptvAST = ts.createSourceFile('iptv.ts', iptvText, ts.ScriptTarget.Latest, true);
  const xtGet = iptvAST.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'xtGet'); assert(xtGet);
  const xtGetJS = ts.transpileModule('export ' + xtGet.getText(iptvAST), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const xtExports = {}; let requests = 0, deferrals = 0, releases = 0;
  vm.runInNewContext(xtGetJS, { exports: xtExports, URL, fetch: async () => { requests++; return { ok: false, status: 429, headers: { get: () => '2' } }; },
    throwIfExternallyAborted: () => {}, linkedAbortController: () => ({ controller: new AbortController(), cleanup: () => {} }),
    scanResponseFailure: () => null, require: () => ({ acquireHostRequest: async () => () => { releases++; }, deferHost: () => { deferrals++; }, retryAfterMilliseconds: () => 2000,
      abortableDelay: () => { throw Error('429 must return to the bounded retry queue, not rotate DNS after an internal timeout'); } }) });
  await assert.rejects(xtExports.xtGet('http://fixture.example/player_api.php'), e => e.kind === 'RATE_LIMIT' && e.status === 429);
  assert.equal(requests, 1); assert.equal(deferrals, 1); assert.equal(releases, 1);
  console.log('PASS: real Xtream request preserves HTTP 429 and host cooldown without a hidden inline retry');

  const ui = dnsUI(); ui.click('dns-select-best');
  const first = ui.probe(); assert.equal(first.props.endpoint, 'http://a.example');
  const result = (url, state, ms, errorKind) => ({ url, kind: 'xtream', source: 'playback', playbackTestAt: '2026-10-11T12:00:00Z', playbackTestState: state,
    ...(state === 'frame' ? { firstFrameAt: '2026-10-11T12:00:00Z', firstFrameElapsedMs: ms } : {}), lastErrorKind: errorKind });
  const a = result('http://a.example', 'blocked', 0, 'ACCOUNT_REJECTED'); first.props.onEvidence(a); first.props.onComplete(a); ui.render();
  assert.equal(ui.probe().props.endpoint, 'http://b.example'); first.props.onComplete(a); ui.render(); assert.equal(ui.probe().props.endpoint, 'http://b.example');
  for (const [url, ms] of [['http://b.example', 50], ['http://c.example', 100]]) { const current = ui.probe(); const e = result(url, 'frame', ms); current.props.onEvidence(e); current.props.onComplete(e); ui.render(); }
  assert.deepEqual(ui.chosen, ['http://b.example']); assert.equal(ui.probe(), null); assert.equal(ui.evidence.length, 3);
  const protectedUI = dnsUI(); protectedUI.click('dns-select-best'); const p = protectedUI.probe(); const cf = result('http://a.example', 'blocked', 0, 'PROTECTION'); p.props.onEvidence(cf); p.props.onComplete(cf); protectedUI.render(); assert.equal(protectedUI.probe(), null); assert.equal(protectedUI.chosen.length, 0);
  const cancelledUI = dnsUI(); cancelledUI.click('dns-test-all'); const old = cancelledUI.probe(); old.props.onClose(); cancelledUI.render(); old.props.onComplete(result('http://a.example', 'frame', 1)); cancelledUI.render(); assert.equal(cancelledUI.probe(), null); assert.equal(cancelledUI.chosen.length, 0);
  console.log('PASS: real DNS component sequential video queue, fastest choice, late callback/cancel and protection stop');

  const settleUI = () => new Promise(resolve => setImmediate(resolve)); const authCalls = [];
  const authUI = dnsUI({ xtreamLogin: async ({ server }) => { authCalls.push(server); return { user_info: { auth: 1 } }; } });
  authUI.click('dns-test-accounts'); await settleUI(); authUI.render(); assert.deepEqual(authCalls, ['http://a.example', 'http://b.example', 'http://c.example']); assert.equal(authUI.evidence.length, 3); assert.equal(authUI.probe(), null);
  const added = []; authUI.props.onChange = values => added.push(values);
  authUI.find(n => n.props?.testID === 'dns-add-input').props.onChangeText('http://d.example'); authUI.render(); authUI.click('dns-add-btn'); await settleUI(); authUI.render();
  assert(added[0].includes('http://d.example')); assert.equal(authCalls.at(-1), 'http://d.example');
  const authProtected = []; const protectedAuthUI = dnsUI({ xtreamLogin: async ({ server }) => { authProtected.push(server); throw Object.assign(Error('CF'), { kind: 'PROTECTION' }); } });
  protectedAuthUI.click('dns-test-accounts'); await settleUI(); protectedAuthUI.render(); assert.equal(authProtected.length, 1);
  let finishAuth; const cancelledAuthUI = dnsUI({ xtreamLogin: () => new Promise(resolve => { finishAuth = resolve; }) });
  cancelledAuthUI.click('dns-test-accounts'); cancelledAuthUI.click('dns-cancel'); finishAuth({ user_info: { auth: 1 } }); await settleUI(); cancelledAuthUI.render(); assert.equal(cancelledAuthUI.evidence.length, 0);
  console.log('PASS: existing auth-only batch and automatic new-DNS account test preserved, with protection and cancel guards');

  const control = controlUI(pl), settle = () => new Promise(resolve => setImmediate(resolve));
  control.dns().props.onEvidence({ url: 'http://b.example', kind: 'xtream', source: 'manual', accountVerifiedAt: '2026-10-11T12:00:00Z' });
  control.dns().props.onMakePrimary('http://b.example'); await settle(); assert.equal(control.writes.length, 1);
  control.writes[0].reject(Error('first save failed')); await settle(); assert.equal(control.writes.length, 2);
  const queued = control.writes[1].payload; assert.equal(queued.xtreamServer, 'http://b.example'); assert.equal(queued.endpoints.filter(e => e.primary).length, 1);
  assert(queued.endpoints.find(e => e.url === 'http://b.example').accountVerifiedAt); assert(queued.backupHosts.includes('http://a.example'));
  control.writes[1].resolve(); await settle(); control.render(); assert.equal(control.dns().props.primary, 'http://b.example');
  control.dns().props.onMakePrimary('http://a.example'); await settle(); control.writes[2].reject(Error('last save failed')); await settle(); control.render();
  assert.equal(control.dns().props.primary, 'http://b.example'); assert.equal(control.preferences.at(-1), 'http://b.example');
  const staleControls = control.dns().props; control.blur(); assert.equal(control.dns(), undefined);
  staleControls.onMakePrimary('http://a.example'); await settle(); assert.equal(control.writes.length, 3);
  console.log('PASS: real account DNS controls serialize complete metadata, recover an earlier save failure, roll back a final failure and ignore blurred callbacks');

  const playerText = fs.readFileSync(path.join(root, 'src/player/PlayerHost.tsx'), 'utf8'), playerAST = ts.createSourceFile('PlayerHost.tsx', playerText, ts.ScriptTarget.Latest, true);
  let preferenceEffect;
  function visitPlayer(n) { if (ts.isCallExpression(n) && n.expression.getText(playerAST) === 'useEffect' && n.arguments[0]?.getText(playerAST).includes('loadPreferredHost')) preferenceEffect = n.arguments[0]; ts.forEachChild(n, visitPlayer); }
  visitPlayer(playerAST); assert(preferenceEffect);
  const preferenceJS = ts.transpileModule('module.exports = ' + preferenceEffect.getText(playerAST), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const preferredChanges = [], remembered = [], playerContext = { module: { exports: {} }, activePlaylist: { id: 'fixture', xtreamServer: 'http://b.example' },
    preferredAccount: { current: { id: 'fixture', server: 'http://a.example' } }, setPreferredHost: h => preferredChanges.push(h), originOf: h => new URL(h).origin,
    rememberWorkingHost: async (_, h) => remembered.push(h), loadPreferredHost: async () => 'http://a.example' };
  vm.runInNewContext(preferenceJS, playerContext); playerContext.module.exports(); await settleUI();
  assert.deepEqual(preferredChanges, ['http://b.example']); assert.deepEqual(remembered, ['http://b.example']);
  console.log('PASS: actual player preference effect prioritizes a committed primary DNS change over the old remembered DNS');

  const stalkerText = fs.readFileSync(path.join(root, 'src/utils/stalker.ts'), 'utf8');
  const ast = ts.createSourceFile('stalker.ts', stalkerText, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'verifiedXtreamEnrichment');
  assert(declaration);
  const hydrate = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'hydrateStreamDerivedCredentials'); assert(hydrate);
  const hydrateJS = ts.transpileModule(hydrate.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const hydrateExports = {}, credentialsMap = new Map(); const key = 'v2|fixture-profile|fixture-mac|http://portal.example'; let returnStorage;
  vm.runInNewContext(hydrateJS, { exports: hydrateExports, streamDerivedCreds: credentialsMap, STREAM_CREDS_KEY: 'fixture-storage',
    storage: { getItem: () => new Promise(resolve => { returnStorage = resolve; }) } });
  const hydration = hydrateExports.hydrateStreamDerivedCredentials(); credentialsMap.set(key, { username: 'new', password: 'new', server: 'http://new.example', at: 200 });
  returnStorage(JSON.stringify({ [key]: { username: 'old', password: 'old', server: 'http://old.example', at: 100 } })); await hydration;
  assert.equal(credentialsMap.get(key).server, 'http://new.example');
  const js = ts.transpileModule('export ' + declaration.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  function bridgeFixture(mode) {
    const events = []; let bridge;
    const credentials = { server: 'http://api.example', username: 'fixture', password: 'fixture' };
    const exports = {};
    vm.runInNewContext(js, { exports, AbortController, setTimeout, clearTimeout, console, nativeOnlyBridgeChecks: new Map(),
      storage: { getItem: async () => 'fixture-profile' }, hydrateStreamDerivedCredentials: async () => {}, getStreamDerivedCredentials: () => bridge,
      streamCredentialScope: () => 'fixture-scope', stalkerResolveStream: async () => { events.push('create_link'); if (mode !== 'native') bridge = credentials; },
      stalkerLiveSample: async () => { events.push('bounded-sample'); bridge = credentials; },
      scopeCancelledError: () => Object.assign(Error('cancelled'), { kind: 'CANCELLED' }), terminalMagError: e => ['CANCELLED', 'MAG_PROTECTION'].includes(e.kind),
      recordDiagnostic: async () => {}, emitCatalogProgress: () => {},
      require: () => ({ xtreamLiveSample: async () => { events.push('authenticate-api'); if (mode === 'protected') throw Object.assign(Error('CF'), { kind: 'PROTECTION' }); if (mode === 'bad-auth') throw Object.assign(Error('auth=0'), { kind: 'ACCOUNT_REJECTED' }); },
        xtreamVod: async () => { events.push('one-vod-catalog'); return [{ url: 'http://api.example/movie/fixture/fixture/1.mp4' }]; }, xtreamSeries: async () => { events.push('one-series-catalog'); return [{ series_id: '2' }]; } }),
    });
    return { run: exports.verifiedXtreamEnrichment, events };
  }
  const cred = { portal: 'http://portal.example/c/portal.php', mac: '00:1A:79:00:00:01', profileId: 'fixture-profile' }, session = { endpoint: cred.portal };
  const cold = bridgeFixture('cold'); const fast = await cold.run(cred, {}, session, [{ url: 'ffmpeg fixture-command' }]);
  assert.deepEqual(cold.events, ['create_link', 'authenticate-api', 'one-vod-catalog', 'one-series-catalog']); assert(fast.vod[0].url.startsWith('xtream-verified:'));
  const filmOnly = bridgeFixture('cold'); await filmOnly.run(cred, { kinds: ['vod'] }, session); assert.deepEqual(filmOnly.events, ['bounded-sample', 'authenticate-api', 'one-vod-catalog']);
  const native = bridgeFixture('native'); assert.equal(await native.run(cred, {}, session, [{ url: 'fixture' }]), null); assert.equal(await native.run(cred, {}, session, [{ url: 'fixture' }]), null); assert.deepEqual(native.events, ['create_link']);
  const blocked = bridgeFixture('protected'); await assert.rejects(blocked.run(cred, {}, session, [{ url: 'fixture' }]), /CF/); assert(!blocked.events.includes('one-vod-catalog'));
  const falseApi = bridgeFixture('bad-auth'); assert.equal(await falseApi.run(cred, {}, session, [{ url: 'fixture' }]), null); assert(!falseApi.events.includes('one-vod-catalog'));
  console.log('PASS: real MAG cold-cache bridge, film-only bounded sample, native fallback cache and no unverified API promotion');
  console.log('PASS: v18.7.31 DNS/video/failover/catalog/schedule behavior TEMIZ');
}
main().catch(e => { console.error(e); process.exit(1); });
