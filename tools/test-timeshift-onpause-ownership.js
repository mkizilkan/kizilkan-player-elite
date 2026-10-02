#!/usr/bin/env node
// Runs production ownership and PlayerHost decision/callback/effect bodies via TS AST.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'frontend'), process.env.KIZILKAN_TEST_RUNTIME || ''] }));
const hostPath = 'frontend/src/player/PlayerHost.tsx';
const hostText = fs.readFileSync(path.join(root, hostPath), 'utf8');
const ast = ts.createSourceFile(hostPath, hostText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, file), 'utf8')), { exports, require: name => {
    assert.ok(name in imports, `Unexpected production import: ${name}`); return imports[name];
  }, URL, console });
  return exports;
}
function find(predicate) {
  let found;
  function visit(node) { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); }
  visit(ast); assert.ok(found, 'Production AST boundary missing'); return found;
}
const initializer = name => find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name).initializer;
function containsIdentifier(node, name) {
  let found = false;
  function visit(part) { if (ts.isIdentifier(part) && part.text === name) found = true; if (!found) ts.forEachChild(part, visit); }
  visit(node); return found;
}
const effect = name => find(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && containsIdentifier(node.arguments[0], name));
const resetEffect = effect('setLiveTimeshiftArmKey');
const prepareEffect = effect('pollReady');
const modeEffect = effect('loadLiveTimeshiftMode');
const resetPaused = find(node => ts.isIfStatement(node) && node.expression.getText(ast) === 'liveTimeshiftPauseOwnerRef.current !== liveTimeshiftCurrentArmKey');
const prepareContext = find(node => ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) && node.expression.left.getText(ast) === 'liveTimeshiftPrepareContextRef.current');
const settingsPath = 'frontend/app/(tabs)/settings.tsx';
const settingsAst = ts.createSourceFile(settingsPath, fs.readFileSync(path.join(root, settingsPath), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function settingsNode(predicate) {
  let found;
  function visit(node) { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); }
  visit(settingsAst); assert.ok(found, 'Production settings AST boundary missing'); return found;
}
const settingsChange = settingsNode(node => ts.isVariableDeclaration(node) && node.name.getText(settingsAst) === 'changeLiveTimeshiftMode').initializer;
const settingsLoadEffect = settingsNode(node => ts.isCallExpression(node) && node.expression.getText(settingsAst) === 'useEffect' && containsIdentifier(node.arguments[0], 'loadLiveTimeshiftMode')).arguments[0];
const runSettings = (node, context) => vm.runInNewContext(compile(`(${node.getText(settingsAst)})`), context);
const { TimeshiftPauseOwnership } = load('frontend/src/player/timeshiftPauseOwnership.ts');
const { playbackSourceIdentity } = load('frontend/src/player/v2/request.ts', { '@/src/utils/streamTest': { DEFAULT_USER_AGENT: 'Fixture-UA' } });
const run = (node, context) => vm.runInNewContext(compile(`(${node.getText(ast)})`), context);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function harness(knownSettings = true) {
  const starts = [], stops = [], events = [], seeks = [];
  let cleanup = null, modeCleanup = null, modeDeps = null, resetDeps = null, prepareDeps = null, nextStart = null;
  const request = { url: 'https://example.test/live/a.ts', headers: { 'User-Agent': 'A', Referer: 'https://example.test/' }, contentType: 'auto' };
  const context = {
    source: { id: 'A', kind: 'live' }, visible: true, activeProfile: { id: 'profile-A' }, activePlaylist: { id: 'list-A' },
    channel: { id: 'A' }, params: { id: 'A' }, playbackRequest: request, loadedLiveTimeshiftMode: 'onPause', liveTimeshiftModeLoadedOwner: '', liveTimeshiftArmKey: '',
    liveTimeshiftModeLoadOwnershipRef: { current: new TimeshiftPauseOwnership() },
    liveTimeshiftPauseOwnershipRef: { current: new TimeshiftPauseOwnership() }, liveTimeshiftPauseOwnerRef: { current: '' },
    liveTimeshiftStartPausedRef: { current: false }, liveTimeshiftRequestOwnerRef: { current: '' }, liveTimeshiftGenerationRef: { current: 0 },
    liveTimeshiftPrepareContextRef: { current: {} }, liveTimeshiftModeRef: { current: 'onPause' },
    liveTimeshift: { phase: 'idle', upstreamUrl: '', sessionId: '', localUrl: '' },
    EMPTY_LIVE_TIMESHIFT: { phase: 'idle', upstreamUrl: '', sessionId: '', localUrl: '' },
    playbackSourceIdentity, sessionKind: 'live', castSession: null, castDetachLocal: false, recordForcesTimeshift: false,
    LIVE_TIMESHIFT_MODE_DEFAULT: 'onPause', loadLiveTimeshiftMode: async () => 'onPause',
    setLiveTimeshiftMode: value => { context.loadedLiveTimeshiftMode = value; },
    setLiveTimeshiftModeLoadedOwner: value => { context.liveTimeshiftModeLoadedOwner = value; },
    playbackUrlIndex: 0, activeSessionId: 1, v2Profile: { engine: 'mpv' }, isPlaying: true,
    Platform: { OS: 'android' }, LIVE_TIMESHIFT_WINDOW_SECONDS: 1800, LIVE_TIMESHIFT_MAX_BYTES: 1024, LIVE_TIMESHIFT_PREPARE_TIMEOUT_MS: 12000,
    playerDiagnosticSessionRef: { current: 1 }, liveStallStatsRef: { current: {} },
    releaseLocalSourceRef: { current: async () => {} },
    pickTimeshiftStats: value => value || {},
    setLiveTimeshiftArmKey: value => { context.liveTimeshiftArmKey = typeof value === 'function' ? value(context.liveTimeshiftArmKey) : value; },
    setLiveTimeshift: value => { context.liveTimeshift = typeof value === 'function' ? value(context.liveTimeshift) : value; },
    setRecoveryMessage: () => {}, setIsSeekable: () => {}, setIsPlaying: value => { context.isPlaying = value; },
    recordDiagnostic: (area, name, data) => { events.push({ area, name, data }); return Promise.resolve(); },
    revealControls: () => {}, flashMessage: () => {},
    mpvRef: { current: { pause: async () => {}, play: async () => {} } }, vlcRef: { current: { pause: () => {}, play: () => {} } },
    player: { pause: () => {}, play: () => {} },
    videoStats: { duration: 20 }, playbackDurationRef: { current: 20 }, seekTo: value => seeks.push(value),
    setTimeout, clearTimeout, console, Date, Promise,
    KizilkanNativeCore: {
      available: true,
      startLiveTimeshift: async (...args) => { starts.push(args); if (nextStart) { const pending = nextStart; nextStart = null; return pending; } return { sessionId: `session-${starts.length}`, mode: 'ts' }; },
      getLiveTimeshiftStatus: async id => ({ ready: true, running: true, localUrl: `http://127.0.0.1/${id}/playlist.m3u8`, windowSeconds: 20 }),
      stopLiveTimeshift: async id => { stops.push(id); return true; },
    },
  };
  function changed(before, next) { return !before || before.length !== next.length || next.some((value, index) => value !== before[index]); }
  function render(patch = {}, commitEffects = true) {
    Object.assign(context, patch);
    context.params = { id: context.channel?.id || '' };
    context.liveTimeshiftModeLoadOwner = run(initializer('liveTimeshiftModeLoadOwner'), context);
    // The first nine fixtures start from a completed, owned setting read; the
    // async fixtures below run the real setting-load effect with deferred I/O.
    if (knownSettings) {
      if ('liveTimeshiftMode' in patch) context.loadedLiveTimeshiftMode = patch.liveTimeshiftMode;
      context.liveTimeshiftModeLoadedOwner = context.liveTimeshiftModeLoadOwner;
    }
    context.liveTimeshiftModeReady = run(initializer('liveTimeshiftModeReady'), context);
    context.liveTimeshiftMode = run(initializer('liveTimeshiftMode'), context);
    context.liveTimeshiftCurrentArmKey = run(initializer('liveTimeshiftCurrentArmKey'), context);
    vm.runInNewContext(compile(resetPaused.getText(ast)), context);
    const nextResetDeps = run(resetEffect.arguments[1], context);
    if (commitEffects && changed(resetDeps, nextResetDeps)) { run(resetEffect.arguments[0], context)(); resetDeps = nextResetDeps; }
    context.liveTimeshiftArmedByPause = run(initializer('liveTimeshiftArmedByPause'), context);
    context.liveTimeshiftEligible = run(initializer('liveTimeshiftEligible'), context);
    context.liveTimeshiftModeRef.current = context.liveTimeshiftMode;
    vm.runInNewContext(compile(prepareContext.getText(ast)), context);
    context.liveTimeshiftHeadersKey = run(initializer('liveTimeshiftHeadersKey').arguments[0], context)();
    context.liveTimeshiftRequestKey = run(initializer('liveTimeshiftRequestKey'), context);
    const nextModeDeps = run(modeEffect.arguments[1], context);
    if (!knownSettings && commitEffects && changed(modeDeps, nextModeDeps)) {
      modeCleanup?.(); modeCleanup = run(modeEffect.arguments[0], { ...context })(); modeDeps = nextModeDeps;
    }
    const nextPrepareDeps = run(prepareEffect.arguments[1], context);
    // A React effect captures render scalars; refs and setters remain shared.
    if (commitEffects && changed(prepareDeps, nextPrepareDeps)) { cleanup?.(); cleanup = run(prepareEffect.arguments[0], { ...context })(); prepareDeps = nextPrepareDeps; }
    context.liveTimeshiftMatches = run(initializer('liveTimeshiftMatches'), context);
    context.liveTimeshiftReady = run(initializer('liveTimeshiftReady'), context);
    context.enginePlaybackRequest = run(initializer('enginePlaybackRequest').arguments[0], context)();
    return context;
  }
  return { context, starts, stops, events, seeks, render,
    pause: () => run(initializer('togglePlay'), context)(),
    goLive: () => run(initializer('goToLiveEdge'), context)(),
    stalePause: () => run(initializer('togglePlay'), { ...context }),
    deferStart: promise => { nextStart = promise; }, close: () => { modeCleanup?.(); cleanup?.(); },
  };
}

async function main() {
  let groups = 0;
  const fresh = harness();
  fresh.render(); await flush();
  assert.equal(fresh.starts.length, 0);
  assert.equal(fresh.context.liveTimeshiftEligible, false);
  assert.equal(fresh.context.enginePlaybackRequest.url, fresh.context.playbackRequest.url);
  fresh.pause(); fresh.render(); await flush(); fresh.render();
  assert.equal(fresh.starts.length, 1);
  assert.equal(fresh.context.liveTimeshiftArmedByPause, true);
  assert.ok(fresh.context.enginePlaybackRequest.url.startsWith('http://127.0.0.1/'));
  assert.ok(fresh.events.find(event => event.name === 'LIVE_TIMESHIFT_ARM_ON_PAUSE').data.pauseOwner);
  assert.equal(fresh.events.find(event => event.name === 'LIVE_TIMESHIFT_PREPARE').data.armedByPause, true);
  groups++;

  const firstOwner = fresh.context.liveTimeshiftCurrentArmKey;
  fresh.render({ source: { id: 'B', kind: 'live' }, channel: { id: 'B' }, playbackRequest: { ...fresh.context.playbackRequest, url: 'https://example.test/live/b.ts' } });
  fresh.render({ source: { id: 'A', kind: 'live' }, channel: { id: 'A' }, playbackRequest: { ...fresh.context.playbackRequest, url: 'https://example.test/live/a.ts' } });
  await flush();
  assert.notEqual(fresh.context.liveTimeshiftCurrentArmKey, firstOwner);
  assert.equal(fresh.context.liveTimeshiftArmKey, '');
  assert.equal(fresh.context.liveTimeshiftEligible, false);
  assert.equal(fresh.starts.length, 1, 'A → B → A must require a new user pause');
  groups++;

  const close = harness(); close.render(); close.pause(); close.render(); await flush();
  const originalSource = close.context.source, oldOwner = close.context.liveTimeshiftCurrentArmKey;
  close.render({ source: null, visible: false });
  close.render({ source: originalSource, visible: true }); await flush();
  assert.notEqual(close.context.liveTimeshiftCurrentArmKey, oldOwner);
  assert.equal(close.context.liveTimeshiftEligible, false);
  assert.equal(close.context.liveTimeshiftStartPausedRef.current, false);
  assert.equal(close.starts.length, 1, 'Close → same A must not start a recorder');
  groups++;

  for (const patch of [
    { source: { id: 'A', kind: 'live' } }, { activeProfile: { id: 'profile-B' } }, { activePlaylist: { id: 'list-B' } },
    { playbackRequest: { url: 'https://example.test/live/a.ts', headers: { 'User-Agent': 'Changed' }, contentType: 'auto' } },
  ]) {
    const owner = harness(); owner.render(); owner.pause(); owner.render(); await flush();
    const token = owner.context.liveTimeshiftCurrentArmKey;
    owner.render(patch); await flush();
    assert.notEqual(owner.context.liveTimeshiftCurrentArmKey, token);
    assert.equal(owner.context.liveTimeshiftEligible, false);
    assert.equal(owner.starts.length, 1);
    owner.close();
  }
  groups++;

  const continuation = harness(); continuation.render(); continuation.pause(); continuation.render(); await flush(); continuation.render();
  const token = continuation.context.liveTimeshiftCurrentArmKey;
  continuation.render({ activeSessionId: 2, v2Profile: { engine: 'vlc', decoder: 'sw' }, playbackRetryNonce: 1,
    playbackRequest: { ...continuation.context.playbackRequest, headers: { referer: 'https://example.test/', 'http-user-agent': 'A' } } });
  continuation.goLive(); continuation.render({ videoStats: { duration: 25, position: 10 } }); await flush();
  assert.equal(continuation.context.liveTimeshiftCurrentArmKey, token);
  assert.equal(continuation.context.liveTimeshiftArmedByPause, true);
  assert.equal(continuation.starts.length, 1, 'Engine retry/normalized headers/seek/go-live stay in one external session');
  assert.equal(continuation.seeks[0], 19.75);
  groups++;

  const modes = harness(); modes.render({ liveTimeshiftMode: 'always' }); await flush(); modes.render();
  assert.equal(modes.starts.length, 1);
  assert.equal(modes.context.liveTimeshiftEligible, true);
  modes.render({ recordForcesTimeshift: true }); modes.render({ recordForcesTimeshift: false }); await flush();
  assert.equal(modes.starts.length, 1, 'Recording must keep an already eligible always recorder');
  modes.render({ liveTimeshiftMode: 'off' }); await flush();
  assert.equal(modes.context.liveTimeshiftEligible, false);
  modes.render({ liveTimeshiftMode: 'onPause' }); await flush();
  assert.equal(modes.context.liveTimeshiftEligible, false);
  modes.render({ recordForcesTimeshift: true }); await flush();
  assert.equal(modes.starts.length, 2, 'Recording still forces the shared recorder in onPause mode');
  assert.equal(modes.context.liveTimeshiftEligible, true);
  groups++;

  const stale = harness(); stale.render(); const oldPause = stale.stalePause();
  stale.render({ source: { id: 'B', kind: 'live' }, channel: { id: 'B' } }); oldPause(); stale.render(); await flush();
  assert.equal(stale.context.liveTimeshiftArmKey, '');
  assert.equal(stale.starts.length, 0, 'A stale pause closure cannot arm another owner');
  groups++;

  const race = harness(), late = deferred(); race.deferStart(late.promise);
  race.render(); race.pause(); race.render(); await flush();
  assert.equal(race.starts.length, 1);
  race.render({ source: { id: 'A', kind: 'live' } });
  late.resolve({ sessionId: 'late-old-A', mode: 'ts' }); await flush(); race.render();
  assert.ok(race.stops.includes('late-old-A'));
  assert.equal(race.context.liveTimeshift.phase, 'idle');
  assert.equal(race.context.liveTimeshiftEligible, false);
  assert.equal(race.starts.length, 1);
  assert.equal(race.events.some(event => event.name === 'LIVE_TIMESHIFT_READY'), false);
  groups++;

  const preCommit = harness(), pending = deferred(); preCommit.deferStart(pending.promise);
  preCommit.render(); preCommit.pause(); preCommit.render(); await flush();
  const generation = preCommit.context.liveTimeshiftGenerationRef.current;
  preCommit.render({ source: { id: 'A', kind: 'live' } }, false);
  assert.equal(preCommit.context.liveTimeshiftGenerationRef.current, generation, 'New render precedes old effect cleanup');
  pending.resolve({ sessionId: 'old-before-cleanup', mode: 'ts' }); await flush();
  assert.ok(preCommit.stops.includes('old-before-cleanup'), 'Owner guard must reject before generation cleanup runs');
  assert.equal(preCommit.events.some(event => event.name === 'LIVE_TIMESHIFT_READY'), false);
  assert.equal(preCommit.context.liveTimeshift.localUrl, '');
  preCommit.render(); await flush();
  assert.equal(preCommit.context.liveTimeshift.phase, 'idle');
  assert.equal(preCommit.starts.length, 1);
  groups++;

  const settingsRace = harness(false), settingRead = deferred();
  settingsRace.context.loadLiveTimeshiftMode = () => settingRead.promise;
  settingsRace.render({ visible: false, source: null, loadedLiveTimeshiftMode: 'always' });
  settingsRace.render({ visible: true, source: { id: 'A', kind: 'live' } });
  await flush();
  assert.equal(settingsRace.context.liveTimeshiftModeReady, false);
  assert.equal(settingsRace.context.liveTimeshiftMode, 'onPause');
  assert.equal(settingsRace.starts.length, 0, 'Stale always must not start before the new owned setting read');
  assert.equal(settingsRace.context.enginePlaybackRequest.url, settingsRace.context.playbackRequest.url);
  settingRead.resolve('onPause'); await flush(); settingsRace.render();
  assert.equal(settingsRace.context.liveTimeshiftModeReady, true);
  assert.equal(settingsRace.context.liveTimeshiftEligible, false);
  assert.equal(settingsRace.starts.length, 0);
  groups++;

  const ownedAlways = harness(false), alwaysRead = deferred();
  ownedAlways.context.loadLiveTimeshiftMode = () => alwaysRead.promise;
  ownedAlways.render(); await flush();
  assert.equal(ownedAlways.starts.length, 0);
  alwaysRead.resolve('always'); await flush(); ownedAlways.render(); await flush(); ownedAlways.render();
  assert.equal(ownedAlways.starts.length, 1, 'Always starts only after its owned mode read completes');
  assert.ok(ownedAlways.context.enginePlaybackRequest.url.startsWith('http://127.0.0.1/'));
  groups++;

  for (const patch of [
    { source: { id: 'B', kind: 'live' }, channel: { id: 'B' } },
    { visible: false }, { activeProfile: { id: 'profile-B' } }, { activePlaylist: { id: 'list-B' } },
  ]) {
    const owner = harness(false), oldRead = deferred();
    owner.context.loadLiveTimeshiftMode = () => oldRead.promise;
    owner.render();
    const token = owner.context.liveTimeshiftModeLoadOwner;
    owner.render(patch, false); // Reject a late result even before effect cleanup.
    oldRead.resolve('always'); await flush();
    assert.notEqual(owner.context.liveTimeshiftModeLoadOwner, token);
    assert.equal(owner.context.loadedLiveTimeshiftMode, 'onPause');
    assert.equal(owner.context.liveTimeshiftModeLoadedOwner, '');
    assert.equal(owner.starts.length, 0);
    owner.close();
  }
  groups++;

  const ownedPause = harness(false), pauseRead = deferred();
  ownedPause.context.loadLiveTimeshiftMode = () => pauseRead.promise;
  ownedPause.render(); ownedPause.pause(); ownedPause.render(); await flush();
  assert.equal(ownedPause.starts.length, 0, 'An early pause waits for the setting, with no speculative recorder');
  const settingOwner = ownedPause.context.liveTimeshiftModeLoadOwner;
  pauseRead.resolve('onPause'); await flush(); ownedPause.render(); await flush(); ownedPause.render();
  assert.equal(ownedPause.starts.length, 1, 'The real pause intent survives a matching onPause setting read');
  ownedPause.render({ activeSessionId: 2, v2Profile: { engine: 'vlc' }, playbackRetryNonce: 1 });
  ownedPause.goLive(); ownedPause.render(); await flush();
  assert.equal(ownedPause.context.liveTimeshiftModeLoadOwner, settingOwner);
  assert.equal(ownedPause.context.liveTimeshiftArmedByPause, true);
  assert.equal(ownedPause.starts.length, 1);
  groups++;

  const unavailable = harness(false);
  unavailable.context.loadLiveTimeshiftMode = async () => { throw new Error('storage unavailable'); };
  unavailable.render({ loadedLiveTimeshiftMode: 'always' }); await flush(); unavailable.render();
  assert.equal(unavailable.context.liveTimeshiftModeReady, true);
  assert.equal(unavailable.context.liveTimeshiftMode, 'onPause');
  assert.equal(unavailable.starts.length, 0);
  unavailable.pause(); unavailable.render(); await flush(); unavailable.render();
  assert.equal(unavailable.starts.length, 1, 'Unavailable setting keeps the initial onPause contract');
  groups++;

  let writeResult = false;
  const settingWrites = [];
  const timeshiftSettings = load('frontend/src/player/timeshiftMode.ts', { '@/src/utils/storage': { storage: {
    getItem: async () => { throw new Error('read failure'); },
    setItem: async (key, mode) => { settingWrites.push({ key, mode }); if (writeResult instanceof Error) throw writeResult; return writeResult; },
  } } });
  assert.equal(await timeshiftSettings.loadLiveTimeshiftMode(), 'onPause');
  await assert.rejects(timeshiftSettings.saveLiveTimeshiftMode('always'), /kaydedilemedi/);
  writeResult = new Error('write failure');
  await assert.rejects(timeshiftSettings.saveLiveTimeshiftMode('off'), /write failure/);
  writeResult = true;
  await timeshiftSettings.saveLiveTimeshiftMode('always');
  assert.equal(settingWrites.at(-1).mode, 'always');
  groups++;

  const alerts = [], publications = [], settingsContext = {
    timeshiftSavePendingRef: { current: false }, timeshiftSettingsOwnerRef: { current: 0 },
    timeshiftMode: 'onPause', timeshiftSaving: false,
    setTimeshiftMode: mode => { settingsContext.timeshiftMode = mode; publications.push(mode); },
    setTimeshiftSaving: value => { settingsContext.timeshiftSaving = value; },
    saveLiveTimeshiftMode: timeshiftSettings.saveLiveTimeshiftMode,
    loadLiveTimeshiftMode: timeshiftSettings.loadLiveTimeshiftMode,
    Alert: { alert: (...args) => alerts.push(args) },
  };
  const changeMode = runSettings(settingsChange, settingsContext);
  writeResult = false;
  await changeMode('always');
  assert.equal(settingsContext.timeshiftMode, 'onPause', 'A failed write must keep the previous visible selection');
  assert.equal(alerts.length, 1);
  assert.equal(settingsContext.timeshiftSaving, false);

  const savePending = deferred(); writeResult = savePending.promise;
  const saving = changeMode('always');
  assert.equal(settingsContext.timeshiftMode, 'onPause', 'Do not publish a selection before its durable write');
  assert.equal(settingsContext.timeshiftSaving, true);
  const writesBeforeSecondPress = settingWrites.length;
  await changeMode('off');
  assert.equal(settingWrites.length, writesBeforeSecondPress, 'A second press cannot race the in-flight setting write');
  savePending.resolve(true); await saving;
  assert.equal(settingsContext.timeshiftMode, 'always');

  const initialRead = deferred(); settingsContext.loadLiveTimeshiftMode = () => initialRead.promise;
  const closeSettings = runSettings(settingsLoadEffect, settingsContext)();
  writeResult = true; await changeMode('off');
  initialRead.resolve('always'); await flush();
  assert.equal(settingsContext.timeshiftMode, 'off', 'Late initial read cannot undo a newer saved choice');
  const unmountedWrite = deferred(); writeResult = unmountedWrite.promise;
  const beforeUnmount = changeMode('onPause');
  closeSettings(); const publicationCount = publications.length;
  unmountedWrite.resolve(true); await beforeUnmount;
  assert.equal(publications.length, publicationCount, 'Do not publish a late write to an unmounted settings screen');
  assert.equal(alerts.length, 1);
  groups++;

  for (const item of [fresh, close, continuation, modes, stale, race, preCommit, settingsRace, ownedAlways, ownedPause, unavailable]) item.close();
  await flush();
  console.log(`PASS: timeshift onPause ownership ${groups} groups (production helper/PlayerHost decisions, callbacks and effects)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
