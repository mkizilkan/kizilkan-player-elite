#!/usr/bin/env node
// Executes production TypeScript (including async closures extracted with the
// TypeScript AST). No React renderer, native emulator, or external package needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'frontend'), process.env.KIZILKAN_TEST_RUNTIME || ''] }));
const norm = value => JSON.parse(JSON.stringify(value));
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(compile(source(file)), { exports, require: name => {
    if (!(name in imports)) throw Error(`Unexpected import: ${name}`);
    return imports[name];
  }, console, URL, Buffer, TextDecoder, setTimeout, clearTimeout }, { filename: file });
  return exports;
}
function closure(file, name, context) {
  const ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (!found && ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) found = node.initializer.getText(ast);
    if (!found) ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `Production closure missing: ${name}`);
  return vm.runInNewContext(compile(`var target = ${found}; target;`), context, { filename: `${file}:${name}` });
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
async function main() {
  let groups = 0;
  const defaultUa = 'VLC/3.0.20 LibVLC/3.0.20';
  const R = load('frontend/src/player/v2/request.ts', { '@/src/utils/streamTest': { DEFAULT_USER_AGENT: defaultUa } });
  const I = load('frontend/src/utils/iptv.ts');

  // Real M3U parsing -> playback request: all three kinds retain required headers.
  const parsed = I.parseM3U([
    '#EXTM3U',
    '#EXTINF:-1 group-title="Canlı",Live', '#EXTVLCOPT:http-user-agent=LiveUA', 'https://example.test/live/1.ts',
    '#EXTINF:-1 group-title="Filmler",Film', '#EXTVLCOPT:http-referrer=https://example.test/', '#EXTVLCOPT:http-user-agent=FilmUA', 'https://example.test/movie/2.mp4',
    '#EXTINF:-1 group-title="Diziler",Dizi S01E01', '#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=SeriesUA&Cookie=token%3Dabc', 'https://example.test/series/3.m3u8',
  ].join('\n'));
  assert.equal(parsed.count, 3);
  const requests = [parsed.channels[0], parsed.vod[0], parsed.series[0]].map(channel => R.buildPlaybackRequest({ url: channel.url, channel, isLive: false }));
  assert.deepEqual(requests.map(r => r.headers['User-Agent']), ['LiveUA', 'FilmUA', 'SeriesUA']);
  assert.equal(requests[1].headers.Referer, 'https://example.test/');
  assert.equal(requests[2].headers.Cookie, 'token=abc');
  assert.ok(requests.every(r => r.requiresHttpHeaders));
  groups++;

  const inherited = R.buildPlaybackRequest({ url: 'https://example.test/a.ts', channel: { id: 'a', headers: { 'http-user-agent': 'Provider', 'http-referrer': 'https://provider.test', Cookie: 'provider=1' } },
    playlist: { playbackHeaders: { userAgent: 'Account', referer: 'https://account.test' } }, runtimeHeaders: { 'user-agent': 'Protocol', Origin: 'https://runtime.test' }, override: { headers: { 'USER-AGENT': 'Item', cookie: 'item=1' } }, isLive: true });
  assert.deepEqual(norm(inherited.headers), { 'User-Agent': 'Item', Referer: 'https://account.test', Cookie: 'item=1', Origin: 'https://runtime.test' });
  assert.deepEqual(norm(R.normalizePlaybackHeaders({ 'inputstream.adaptive.license_type': 'widevine', 'X-Test': 'ok', 'Bad\nKey': 'x', Cookie: 'a\r\nb' })), { 'X-Test': 'ok' });
  groups++;

  const a = { url: 'https://example.test/a', headers: { 'User-Agent': 'A', Referer: 'B' }, contentType: 'hls' };
  assert.equal(R.playbackSourceIdentity(a), R.playbackSourceIdentity({ ...a, headers: { referer: 'B', 'http-user-agent': 'A' } }));
  assert.notEqual(R.playbackSourceIdentity(a), R.playbackSourceIdentity({ ...a, headers: { 'User-Agent': 'New' } }));
  assert.equal(R.buildPlaybackRequest({ url: a.url, channel: {}, isLive: true }).requiresHttpHeaders, false);
  assert.equal(R.buildPlaybackRequest({ url: a.url, channel: { headers: { 'http-user-agent': defaultUa } }, isLive: true }).requiresHttpHeaders, true);
  groups++;

  const records = new Map();
  const M = load('frontend/src/player/v2/memo.ts', { '@/src/utils/storage': { storage: { getItem: async (k, fallback) => records.get(k) ?? fallback, setItem: async (k, v) => { records.set(k, v); }, removeItem: async k => { records.delete(k); } } }, '@/src/utils/diagnostics': { recordDiagnostic: async () => {} } });
  const profile = { engine: 'mpv', decoder: 'auto' };
  await M.recordEngineSuccess('xt-live-1', profile, 100, 'account-A');
  assert.equal(await M.loadEngineProfile('xt-live-1', 'account-B'), null);
  await M.recordEngineSuccess('xt-live-1', profile, 150, 'account-B');
  await M.recordEngineFailure('xt-live-1', profile, 'decoder', 'fixture', 'account-A');
  assert.equal((await M.loadEngineProfile('xt-live-1', 'account-B')).confidence, 2);
  assert.equal((await M.loadPlaybackTelemetry('xt-live-1', 'account-A')).length, 2);
  assert.equal((await M.loadPlaybackTelemetry('xt-live-1', 'account-B')).length, 1);
  assert.notEqual(M.engineMemoIdentity('x.y', 'a'), M.engineMemoIdentity('y', 'a.x'));
  groups++;

  // Real Media3 fallback: a channel change while storage is awaited must never
  // pause/detach the replacement player or change its engine/UI ownership.
  const wait = deferred();
  let owns = true;
  const writes = [];
  const state = { stillMine: () => owns, transitioningSessionRef: { current: null }, sid: 7,
    mpvEngineUsable: () => true, channel: { id: 'old' }, v2Profile: { engine: 'media3', surface: 'surface' }, recordEngineFailure: () => wait.promise,
    setRecoveryMessage: value => writes.push(value), player: { pause: () => writes.push('pause'), replace: () => writes.push('detach') } };
  const switchProfile = closure('frontend/src/player/PlayerHost.tsx', 'switchProfile', state);
  const oldFallback = switchProfile({ engine: 'vlc', decoder: 'hw' }, { kind: 'decoder' });
  owns = false;
  wait.resolve();
  await oldFallback;
  assert.deepEqual(writes, []);
  groups++;

  // Real Cast load closure: asynchronous handoff/resolver completions are owned
  // by their session+generation and cannot load a channel selected later.
  const castWait = deferred();
  const calls = [];
  const session = { client: { loadMedia: async payload => calls.push(payload) } };
  const castContext = { managePlayback: true, sourceRef: { current: { url: 'https://example.test/old.mp4', name: 'Old', beforeLoad: () => castWait.promise } },
    sessionRef: { current: session }, mountedRef: { current: true }, loadGenerationRef: { current: 0 }, lastLoadedKeyRef: { current: '' }, connectedRef: { current: true }, notifyRef: { current: () => {} },
    recordDiagnostic: async () => {}, Alert: { alert: () => {} }, haptic: { success: () => {} }, mkvWarning: () => null,
    toCastableUrl: url => url, guessMime: () => 'video/mp4', setTimeout, console };
  castContext.sourceKey = closure('frontend/src/components/CastButton.tsx', 'sourceKey', castContext);
  const loadInto = closure('frontend/src/components/CastButton.tsx', 'loadInto', castContext);
  const staleCast = loadInto(session, { force: true });
  castContext.loadGenerationRef.current += 1;
  castWait.resolve();
  await staleCast;
  assert.equal(calls.length, 0);
  castContext.sourceRef.current = { url: 'https://example.test/new.mp4', name: 'New' };
  await loadInto(session, { force: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mediaInfo.contentUrl, 'https://example.test/new.mp4');
  const resolveWait = deferred();
  castContext.sourceRef.current = { url: 'https://example.test/third.mp4', name: 'Third', resolveCastMedia: () => resolveWait.promise };
  const staleResolver = loadInto(session, { force: true });
  await Promise.resolve();
  castContext.mountedRef.current = false;
  resolveWait.resolve({ url: 'http://lan.test/stale', contentType: 'video/mp4', bridged: true, mode: 'proxy' });
  await staleResolver;
  assert.equal(calls.length, 1);
  groups++;

  // Real recording closures: preparing a tee path must not advertise REC, and
  // selected SAF URI is passed directly instead of depending on stale state.
  const recordEvents = [];
  const alerts = [];
  const copies = [];
  const recordContext = {
    v2Profile: { engine: 'media3' }, sessionKind: 'live', channel: { id: 'live', name: 'Live' }, playbackRequest: { url: 'https://example.test/a.ts' },
    activePlaylist: {}, recordScopeKey: 'scope-1', recordScopeRef: { current: 'scope-1' }, recordOwnerRef: { current: null }, recordGenerationRef: { current: 0 },
    vlcRef: { current: null }, mpvRef: { current: null }, pendingTeePathRef: { current: null }, liveTimeshiftReady: false, liveTimeshift: { sessionId: '' },
    customRecordDir: 'content://old-selection', prepareRecordDir: async () => '/private/recordings', recordFileName: () => 'fixture.ts',
    flashMessage: value => recordEvents.push(['flash', value]), recordDiagnostic: async () => {}, playerDiagnosticSessionRef: { current: 'session' },
    Alert: { alert: (...args) => alerts.push(args) }, require: name => { assert.equal(name, 'expo-file-system/legacy'); return { getInfoAsync: async () => ({ exists: true, size: 4096 }) }; },
    KizilkanNativeCore: { liveTimeshiftStopRecord: async id => { recordEvents.push(['stop-native', id]); return { ok: true, path: '/private/recordings/fixture.ts', bytes: 4096 }; },
      copyFileToPublicStorage: async (...args) => { copies.push(args); return { ok: true, uri: 'content://new-selection/fixture' }; } },
  };
  for (const name of ['setIsRecording', 'setRecordPreparing', 'setRecordPath', 'setRecordStart', 'setRecordEngine', 'setRecordDirLabel', 'setSheet', 'setRecordForcesTimeshift']) recordContext[name] = value => recordEvents.push([name, value]);
  for (const name of ['recordStillMine', 'clearRecordState', 'markRecordStarted', 'finishRecordOwner', 'startRecording']) recordContext[name] = closure('frontend/src/player/PlayerHost.tsx', name, recordContext);
  await recordContext.startRecording('custom', 'content://new-selection');
  const owner = recordContext.recordOwnerRef.current;
  assert.ok(owner);
  assert.equal(owner.exportTreeUri, 'content://new-selection');
  assert.equal(owner.startedAt, null);
  assert.equal(recordContext.pendingTeePathRef.current, '/private/recordings/fixture.ts');
  assert.ok(recordEvents.some(e => e[0] === 'setRecordPreparing' && e[1] === true));
  assert.ok(!recordEvents.some(e => e[0] === 'setIsRecording' && e[1] === true));
  owner.timeshiftId = 'original-session';
  recordContext.markRecordStarted(owner, '/private/recordings/fixture.ts');
  assert.ok(owner.startedAt > 0);
  recordContext.liveTimeshift.sessionId = 'replacement-session';
  await recordContext.finishRecordOwner(owner, true);
  assert.ok(recordEvents.some(e => e[0] === 'stop-native' && e[1] === 'original-session'));
  assert.ok(!recordEvents.some(e => e[0] === 'stop-native' && e[1] === 'replacement-session'));
  assert.equal(copies.length, 1);
  assert.equal(copies[0][4], 'content://new-selection');
  assert.ok(alerts.at(-1)[1].includes('content://new-selection/fixture'));
  groups++;

  // Ownership can change during folder I/O before any native writer exists.
  const folderWait = deferred();
  recordContext.prepareRecordDir = () => folderWait.promise;
  recordEvents.length = 0;
  const pendingRecord = recordContext.startRecording('app');
  const staleOwner = recordContext.recordOwnerRef.current;
  recordContext.recordScopeRef.current = 'scope-2';
  recordContext.recordScopeKey = 'scope-2';
  await recordContext.finishRecordOwner(staleOwner, false);
  folderWait.resolve('/private/recordings');
  await pendingRecord;
  assert.equal(recordContext.recordOwnerRef.current, null);
  assert.equal(recordContext.pendingTeePathRef.current, null);
  assert.ok(!recordEvents.some(e => e[0] === 'setIsRecording' && e[1] === true));
  assert.equal(copies.length, 1, 'stale preparation must never publish a file');
  groups++;

  const access = load('frontend/src/player/categoryAccess.ts').categoryAccess;
  const locked = group => group === 'Locked';
  assert.equal(access('Locked', true, locked, () => true), 'blocked');
  assert.equal(access('Locked', false, locked, () => false), 'pin');
  assert.equal(access('Locked', false, locked, () => true), 'allowed');
  assert.equal(access('Open', true, locked, () => false), 'allowed');
  groups++;

  // Real TV loader: reset during an in-flight query starts a new owner. The
  // previous result and finally block cannot publish data or unlock that owner.
  const oldPage = deferred(); const newPage = deferred();
  const pages = [];
  let queryCount = 0;
  const tv = { useCallback: fn => fn, nativeMode: true, activePlaylist: { id: 'list' }, nativeLoadRef: { current: null }, nativeGenerationRef: { current: 0 }, nativeOffsetRef: { current: 0 },
    tab: 'live', selectedCat: '__ALL__', ALL: '__ALL__', FAV: '__FAV__', RECENT: '__RECENT__', search: 'old', favorites: [], parental: { adultHidden: false }, recentRef: { current: [] },
    setNativeItems: value => { if (typeof value === 'function') pages.push(value(pages.at(-1) || [])); else pages.push(value); }, setNativeHasMore: () => {}, normalize: x => x.toLowerCase(),
    recordDiagnostic: async () => {}, KizilkanNativeCore: { queryItems: () => (++queryCount === 1 ? oldPage.promise : newPage.promise) } };
  const loadPage = closure('frontend/app/tv-home.tsx', 'loadNativePage', tv);
  const oldQuery = loadPage(true);
  tv.search = 'new';
  const newQuery = loadPage(true);
  assert.equal(queryCount, 2);
  oldPage.resolve({ items: [{ id: 'stale' }], offset: 0, returned: 1, hasMore: false });
  await oldQuery;
  assert.equal(tv.nativeLoadRef.current, 2);
  assert.deepEqual(norm(pages.at(-1)), []);
  newPage.resolve({ items: [{ id: 'current' }], offset: 0, returned: 1, hasMore: false });
  await newQuery;
  assert.deepEqual(norm(pages.at(-1)), [{ id: 'current' }]);
  assert.equal(tv.nativeLoadRef.current, null);
  assert.equal(tv.nativeOffsetRef.current, 1);
  groups++;

  let magCalls = 0;
  const resolver = load('frontend/src/player/resolveLivePlayback.ts', {
    '@/modules/kizilkan-native-core': { KizilkanNativeCore: { available: true, getItem: async () => ({ id: 'one', url: 'ffmpeg http://cmd', name: 'Canonical', group: 'Open', headers: { 'http-referrer': 'https://provider.test' } }) } },
    '@/src/utils/overrides': { loadOverrides: async () => ({ one: { userAgent: 'ItemUA' } }) }, './v2/request': R,
    '@/src/utils/stalker': { stalkerCredsFromPlaylist: p => p, stalkerResolveStream: async () => { magCalls++; return { url: 'ffmpeg https://media.test/play', headers: { Cookie: 'mag=token', Authorization: 'Bearer test' } }; }, stripStreamPrefix: u => u.replace(/^ffmpeg\s+/, '') },
  }).resolveLivePlayback;
  const resolved = await resolver({ id: 'mag', source: 'stalker' }, { id: 'one', url: 'stale' });
  assert.equal(resolved.item.name, 'Canonical');
  assert.equal(resolved.request.url, 'https://media.test/play');
  assert.deepEqual(norm(resolved.request.headers), { Referer: 'https://provider.test', Cookie: 'mag=token', Authorization: 'Bearer test', 'User-Agent': 'ItemUA' });
  await assert.rejects(resolver({ id: 'mag', source: 'stalker' }, { id: 'one' }, { allowItem: () => false }), /ebeveyn/);
  assert.equal(magCalls, 1, 'locked canonical item must be rejected before create_link');
  groups++;

  const cleanupWait = deferred();
  const connectionEvents = [];
  const connection = { castConnectionGenerationRef: { current: 0 }, castDetachedRef: { current: true }, castLiveSeekableRangeRef: { current: null },
    castRemotePositionRef: { current: 45 }, castResumePendingRef: { current: 0 }, visible: true, isSynthetic: true,
    setCastSession: value => connectionEvents.push(['session', value]), setCastDetachLocal: value => connectionEvents.push(['detach', value]), setPlaybackRetryNonce: () => connectionEvents.push(['retry']),
    KizilkanNativeCore: { castBridgeStopAll: () => cleanupWait.promise } };
  const connectionChanged = closure('frontend/src/player/PlayerHost.tsx', 'onCastConnectionChange', connection);
  connectionChanged(false, null);
  assert.ok(!connectionEvents.some(e => e[0] === 'detach' && e[1] === false));
  connectionChanged(true, { id: 'new-session' });
  cleanupWait.resolve(1);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.ok(!connectionEvents.some(e => e[0] === 'detach' && e[1] === false), 'old cleanup must not reattach local during a new Cast session');
  groups++;

  const selection = { id: 'vodplay-one' };
  const progressWrites = [];
  const progress = { React: { useCallback: fn => fn }, source: selection, selectedSourceOwnerRef: { current: { source: selection, profileId: 'old-profile', playlistId: 'old-list' } },
    currentLibraryScopeRef: { current: { profileId: 'new-profile', playlistId: 'new-list' } }, channel: { id: 'vodplay-one', name: 'Film', group: 'Open' }, isSynthetic: true, params: { id: 'vodplay-one' },
    externalStream: { poster: null }, setLibProgress: (...args) => { progressWrites.push(args); return Promise.resolve(); }, v2Profile: { engine: 'media3' } };
  closure('frontend/src/player/PlayerHost.tsx', 'persistSyntheticProgress', progress)();
  assert.deepEqual(progressWrites, [], 'previous synthetic media must never save progress into the new account scope');
  groups++;
  console.log(`PASS: Player regression — ${groups} production behavior groups`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
