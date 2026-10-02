#!/usr/bin/env node
/** Actual LibraryProvider with mocked hooks/storage: list isolation, load/write races and truthful persistence. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('./_ts');
const strictValue = require('./_strict-storage-fixture');
const root = path.resolve(__dirname, '..', 'frontend');
const json = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function harness(initial = {}) {
  const disk = new Map(Object.entries(initial)), writes = [], diagnostics = [], cache = new Map();
  const hooks = [], effects = []; let cursor = 0, dirty = false, value;
  const state = { profile: 'A', list: 'list:A', restoring: false, failKey: '', failReadKey: '', readGate: null, writeGate: null };
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const React = {
    createContext: () => ({ Provider: {} }),
    createElement: (_type, props) => props.value,
    useState: initialValue => { const index = cursor++; if (!hooks[index]) hooks[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue }; return [hooks[index].value, next => { const computed = typeof next === 'function' ? next(hooks[index].value) : next; if (!Object.is(computed, hooks[index].value)) { hooks[index].value = computed; dirty = true; } }]; },
    useRef: initialValue => { const index = cursor++; if (!hooks[index]) hooks[index] = { current: initialValue }; return hooks[index]; },
    useMemo: (factory, deps) => { const index = cursor++; if (!hooks[index] || !same(hooks[index].deps, deps)) hooks[index] = { deps, value: factory() }; return hooks[index].value; },
    useCallback: (callback, deps) => React.useMemo(() => callback, deps),
    useEffect: (effect, deps) => { const index = cursor++; if (!hooks[index] || !same(hooks[index].deps, deps)) { const old = hooks[index]; hooks[index] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); hooks[index].cleanup = effect(); }); } },
    useContext: () => value,
  };
  const storage = {
    getItem: async (key, fallback) => { const result = disk.has(key) ? disk.get(key) : fallback; if (state.readGate?.key === key) { const gate = state.readGate; state.readGate = null; await gate.promise; } return result; },
    setItem: async (key, next) => { writes.push({ key, next }); if (state.writeGate?.key === key) { const gate = state.writeGate; state.writeGate = null; await gate.promise; } if (state.failKey === key) return false; disk.set(key, next); return true; },
  };
  storage.getItemStrict = async (key, fallback) => {
    if (state.failReadKey === key) throw new Error('Yerel kayıt okunamadı.');
    const present = disk.has(key);
    const result = await storage.getItem(key, fallback);
    return strictValue(result, fallback, present);
  };
  const mocks = {
    react: { ...React, default: React },
    '@/src/utils/storage': { storage },
    './ProfileContext': { useProfiles: () => ({ activeProfile: { id: state.profile } }) },
    './PlaylistContext': { usePlaylists: () => ({ activePlaylist: state.list ? { id: state.list } : null }) },
    '@/src/utils/catalogOperations': { isCatalogRestoreActive: () => state.restoring },
    '@/src/utils/diagnostics': { recordDiagnostic: async (...args) => { diagnostics.push(args); } },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const exports = {}; cache.set(relative, exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    const requireMock = id => Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith('@/') ? load(id.slice(2) + '.ts') : require(id);
    vm.runInNewContext(code, { exports, require: requireMock, console, Date, Promise, Set, Map, Object, JSON, encodeURIComponent }, { filename: relative });
    return exports;
  }
  const provider = load('src/store/LibraryContext.tsx');
  function render() { cursor = 0; dirty = false; value = provider.LibraryProvider({ children: null }); while (effects.length) effects.shift()(); return value; }
  async function flush() { for (let i = 0; i < 45; i++) { await Promise.resolve(); if (dirty) render(); } return value; }
  render();
  return { state, disk, writes, diagnostics, render, flush, load, get value() { return value; }, get storage() { return storage; }, unmount: () => { for (const hook of hooks) hook?.cleanup?.(); } };
}
const progress = current => ({ current, duration: 100, updatedAt: 1, kind: 'vod', name: 'Film', group: 'Movies' });
let groups = 0;
async function scopeHelpersAndLegacy() {
  const h = harness({ 'kizilkan.progress.A': JSON.stringify({ 1: progress(10), '@list:list%3AB:1': progress(50) }), 'kizilkan.watchlist.A': JSON.stringify(['1']), 'kizilkan.hiddenItems.A': JSON.stringify(['1']) });
  const scope = h.load('src/utils/libraryScope.ts');
  assert.notEqual(scope.libraryItemKey('a:b', '1'), scope.libraryItemKey('a', 'b:1'));
  assert.deepEqual(json(scope.libraryScopedMap({ raw: 1, '@list:list%3AA:raw': 2, '@list:list%3AB:raw': 3 }, 'list:A', 'list:A')), { raw: 2 });
  await h.flush(); assert.equal(h.disk.get('kizilkan.libraryLegacyOwner.A'), 'list:A'); assert.equal(h.value.watchProgress['1'].current, 10);
  assert.deepEqual(json(h.value.watchlist), ['1']); assert.equal(h.value.isItemHidden('1'), true);
  h.value.unlockHiddenSession(); await h.flush(); assert.equal(h.value.hiddenModeUnlocked, true);
  h.state.list = 'list:B'; h.render(); assert.deepEqual(json(h.value.watchProgress), {}); assert.equal(h.value.hiddenModeUnlocked, false);
  await h.flush(); assert.equal(h.value.watchProgress['1'].current, 50); assert.deepEqual(json(h.value.watchlist), []); assert.equal(h.value.isItemHidden('1'), false);
  await h.value.setProgress('1', progress(60)); await h.flush();
  const saved = JSON.parse(h.disk.get('kizilkan.progress.A')); assert.equal(saved['1'].current, 10); assert.equal(saved['@list:list%3AB:1'].current, 60);
  await h.value.clearAllProgress(); await h.flush(); assert.deepEqual(json(h.value.watchProgress), {}); assert.equal(JSON.parse(h.disk.get('kizilkan.progress.A'))['1'].current, 10);
  h.state.list = 'list:A'; h.render(); await h.flush(); await h.value.clearAllProgress(); await h.flush(); assert.deepEqual(JSON.parse(h.disk.get('kizilkan.progress.A')), {});
  assert.equal(h.disk.get('kizilkan.libraryLegacyOwner.A'), 'list:A'); h.unmount(); groups++;
}
async function serializedWritesAndFailure() {
  const h = harness(); await h.flush();
  await Promise.all([h.value.toggleWatchlist('1'), h.value.toggleWatchlist('2'), h.value.toggleHiddenGroup('Movies'), h.value.toggleHiddenItem('1')]); await h.flush();
  assert.deepEqual(json(h.value.watchlist).sort(), ['1', '2']); assert.equal(h.value.isGroupHidden('Movies'), true); assert.equal(h.value.isItemHidden('1'), true);
  await Promise.all([h.value.toggleWatchlist('1'), h.value.toggleWatchlist('1')]); await h.flush(); assert.equal(h.value.inWatchlist('1'), true);
  await h.value.setProgress('3', progress(91)); await h.flush(); assert.equal(h.value.isWatched('3'), true); assert.equal(h.value.watchProgress['3'].current, 91);
  await h.value.setProgress('3', progress(96)); await h.flush(); assert.equal(h.value.isWatched('3'), true); assert.equal(h.value.watchProgress['3'], undefined);
  h.state.failKey = 'kizilkan.progress.A'; await assert.rejects(h.value.setProgress('4', progress(20)), /yazılamadı/); await h.flush(); assert.equal(h.value.watchProgress['4'], undefined);
  h.state.failKey = ''; await h.value.setProgress('4', progress(25)); await h.flush(); assert.equal(h.value.watchProgress['4'].current, 25);
  h.value.setSeriesLast('s1', { season: 2, episode: 3, episodeId: '3' }); await h.flush(); assert.equal(h.value.seriesLast.s1.episode, 3);
  await Promise.all([h.value.pushSearch('Test'), h.value.pushSearch('test'), h.value.pushSearch('Second')]); await h.flush(); assert.deepEqual(json(h.value.searchHistory), ['Second', 'test']);
  h.unmount(); groups++;
}
async function staleLoadAndWrite() {
  const h = harness({ 'kizilkan.progress.A': JSON.stringify({ 1: progress(10) }), 'kizilkan.progress.B': JSON.stringify({ 2: progress(20) }) });
  // The first render's load enters the read while profile A is still current.
  const read = deferred(); h.state.readGate = { key: 'kizilkan.progress.A', ...read }; await h.flush();
  const oldSetter = h.value.setProgress; h.state.profile = 'B'; h.state.list = 'list:B'; h.render(); assert.deepEqual(json(h.value.watchProgress), {});
  await oldSetter('bad', progress(30)); read.resolve(); await h.flush(); assert.deepEqual(Object.keys(h.value.watchProgress), ['2']); assert.equal(h.disk.has('kizilkan.libraryLegacyOwner.A'), false);
  const write = deferred(); h.state.writeGate = { key: 'kizilkan.progress.B', ...write };
  const pending = h.value.setProgress('pending', progress(30)); await h.flush(); const stale = h.value.setProgress;
  const queued = stale('must-not-write', progress(40));
  h.state.profile = 'A'; h.state.list = 'list:A'; h.render(); write.resolve(); await pending; await queued; await h.flush();
  assert.equal(h.value.watchProgress['1'].current, 10); assert.equal(h.value.watchProgress.pending, undefined); assert.equal(h.value.watchProgress['must-not-write'], undefined);
  assert.equal(JSON.parse(h.disk.get('kizilkan.progress.B'))['@list:list%3AB:pending'].current, 30); assert.equal(JSON.parse(h.disk.get('kizilkan.progress.B'))['@list:list%3AB:must-not-write'], undefined);
  h.unmount(); groups++;
}
async function reloadAndRestoreDrain() {
  const h = harness(); await h.flush(); const bus = h.load('src/utils/profileDataReload.ts');
  await h.value.setProgress('before', progress(10)); await h.flush(); const oldSetter = h.value.setProgress;
  h.disk.set('kizilkan.progress.A', JSON.stringify({ '@list:list%3AA:restored': progress(45) })); bus.notifyProfileDataReload();
  await oldSetter('late', progress(20)); await h.flush(); assert.deepEqual(Object.keys(h.value.watchProgress), ['restored']);
  const gate = deferred(); h.state.writeGate = { key: 'kizilkan.progress.A', ...gate }; const pending = h.value.setProgress('inflight', progress(30)); await h.flush();
  h.state.restoring = true; await assert.rejects(h.value.toggleWatchlist('blocked'), /geri yüklenirken/);
  let drained = false; const draining = bus.drainProfileDataWrites().then(() => { drained = true; }); await h.flush(); assert.equal(drained, false);
  gate.resolve(); await pending; await draining; assert.equal(drained, true); assert.ok(JSON.parse(h.disk.get('kizilkan.progress.A'))['@list:list%3AA:inflight']);
  h.state.restoring = false; bus.notifyProfileDataReload(); await h.flush(); assert.equal(h.value.watchProgress.inflight.current, 30);
  h.unmount(); groups++;
}
async function checkedLocalMigration() {
  const h = harness({ 'kizilkan.progress.A': JSON.stringify({ 'local-1': progress(10), 1: progress(20) }) });
  h.state.failKey = 'kizilkan.localmedia.progress.v1'; await h.flush(); assert.ok(JSON.parse(h.disk.get('kizilkan.progress.A'))['local-1']); assert.ok(h.diagnostics.some(args => args[1] === 'LOCAL_PROGRESS_MIGRATION_FAILED'));
  h.state.failKey = ''; h.load('src/utils/profileDataReload.ts').notifyProfileDataReload(); await h.flush();
  assert.equal(JSON.parse(h.disk.get('kizilkan.progress.A'))['local-1'], undefined); assert.equal(JSON.parse(h.disk.get('kizilkan.localmedia.progress.v1'))['local-1'].current, 10);
  h.unmount(); groups++;
}
async function sharedOwnerClaimAndDrain() {
  const h = harness(); await h.flush(); const owner = h.load('src/utils/libraryLegacyOwner.ts');
  assert.deepEqual(await Promise.all([owner.claimLibraryLegacyOwner('new', 'list:A'), owner.claimLibraryLegacyOwner('new', 'list:B')]), ['list:A', 'list:A']);
  const gate = deferred(); h.state.writeGate = { key: 'kizilkan.libraryLegacyOwner.pending', ...gate };
  const claim = owner.claimLibraryLegacyOwner('pending', 'list:A'); await h.flush(); h.state.restoring = true;
  await assert.rejects(owner.claimLibraryLegacyOwner('pending', 'list:B'), /geri yüklenirken/);
  let drained = false; const wait = h.load('src/utils/profileDataReload.ts').drainProfileDataWrites().then(() => { drained = true; }); await h.flush(); assert.equal(drained, false);
  gate.resolve(); await claim; await wait; assert.equal(drained, true); h.state.restoring = false;
  h.unmount(); groups++;
}
async function corruptSourcePreservedAndRecovery() {
  for (const [key, raw] of [
    ['kizilkan.progress.A', '{broken-sensitive-source'], ['kizilkan.progress.A', '[]'],
    ['kizilkan.watchlist.A', '{}'], ['kizilkan.watchlist.A', '["1",2]'],
    ['kizilkan.hiddenGroups.A', '[false]'], ['kizilkan.watched.A', 'null'],
    ['kizilkan.progress.A', false], ['kizilkan.progress.A', null],
  ]) {
    const h = harness({ [key]: raw }); await h.flush();
    assert.ok(h.diagnostics.some(args => args[1] === 'LIBRARY_LOAD_FAILED'));
    await assert.rejects(h.value.setProgress('replacement', progress(10)), /henüz yüklenmedi/);
    await assert.rejects(h.value.toggleWatchlist('replacement'), /henüz yüklenmedi/);
    assert.equal(h.disk.get(key), raw); assert.equal(h.writes.length, 0);
    h.disk.set(key, key.includes('progress') || key.includes('watched') ? '{}' : '[]');
    h.load('src/utils/profileDataReload.ts').notifyProfileDataReload(); await h.flush();
    await h.value.setProgress('recovered', progress(25)); await h.value.toggleWatchlist('recovered'); await h.flush();
    assert.equal(h.value.watchProgress.recovered.current, 25); assert.equal(h.value.inWatchlist('recovered'), true);
    h.unmount();
  }
  // A failed reload must invalidate an already loaded snapshot before later mutations.
  const h = harness(); await h.flush(); const oldSetter = h.value.setProgress;
  h.state.failReadKey = 'kizilkan.progress.A'; h.load('src/utils/profileDataReload.ts').notifyProfileDataReload();
  await oldSetter('stale', progress(15)); await h.flush(); const count = h.writes.length;
  await assert.rejects(h.value.setProgress('bad', progress(15)), /henüz yüklenmedi/);
  assert.equal(h.writes.length, count); assert.equal(h.value.watchProgress.bad, undefined);
  h.state.failReadKey = ''; h.load('src/utils/profileDataReload.ts').notifyProfileDataReload(); await h.flush();
  await h.value.setProgress('good', progress(20)); await h.flush(); assert.equal(h.value.watchProgress.good.current, 20);
  h.unmount(); groups++;
}
async function nestedLibraryRecordsAndLegacyCompatibility() {
  const p = progress(10), last = { season: 1, episode: 2, episodeId: 'episode', at: 1 };
  const invalid = [
    ['progress', null], ['progress', []], ['progress', { ...p, current: '10' }],
    ['progress', { ...p, duration: false }], ['progress', { ...p, updatedAt: null }],
    ['progress', { ...p, kind: 'unknown' }], ['progress', { ...p, name: {} }],
    ['progress', { ...p, poster: 7 }], ['progress', { ...p, group: false }],
    ['watched', null], ['watched', []], ['watched', '10'], ['watched', {}],
    ['seriesLast', null], ['seriesLast', []], ['seriesLast', { ...last, episodeId: 12 }],
    ['seriesLast', { ...last, season: false }], ['seriesLast', { ...last, episode: {} }],
    ['seriesLast', { ...last, at: '1' }],
  ].map(([field, entry]) => [`kizilkan.${field}.A`, JSON.stringify({ bad: entry })]);
  invalid.push(['kizilkan.progress.A', '{"bad":{"current":1e400,"duration":100,"updatedAt":1,"kind":"vod"}}'],
    ['kizilkan.watched.A', '{"bad":1e400}'], ['kizilkan.seriesLast.A', '{"bad":{"season":1,"episode":2,"episodeId":"e","at":1e400}}']);
  for (const [key, raw] of invalid) {
    const h = harness({ [key]: raw }); await h.flush();
    assert.ok(h.diagnostics.some(args => args[1] === 'LIBRARY_LOAD_FAILED'), `must reject nested record in ${key}`);
    assert.deepEqual(json(h.value.watchProgress), {});
    await assert.rejects(h.value.setProgress('replacement', progress(10)), /henüz yüklenmedi/);
    await assert.rejects(h.value.toggleWatchlist('replacement'), /henüz yüklenmedi/);
    assert.equal(h.disk.get(key), raw); assert.equal(h.writes.length, 0);
    h.disk.set(key, '{}'); h.load('src/utils/profileDataReload.ts').notifyProfileDataReload(); await h.flush();
    await h.value.setProgress('recovered', progress(20)); await h.flush(); assert.equal(h.value.watchProgress.recovered.current, 20);
    h.unmount();
  }
  // Old unscoped rows and current scoped rows with optional metadata must retain their meaning.
  const h = harness({
    'kizilkan.progress.A': JSON.stringify({ legacy: { current: 10, duration: 100, updatedAt: 1, kind: 'vod' }, '@list:list%3AA:scoped': { ...p, poster: null, group: 'Movies' } }),
    'kizilkan.watched.A': JSON.stringify({ legacy: 1, '@list:list%3AA:scoped': 2 }),
    'kizilkan.seriesLast.A': JSON.stringify({ legacy: { season: '1', episode: '2', episodeId: 'legacy-e', at: 1 }, '@list:list%3AA:scoped': { ...last, title: 'Episode' } }),
  });
  await h.flush(); assert.equal(h.diagnostics.some(args => args[1] === 'LIBRARY_LOAD_FAILED'), false);
  assert.equal(h.value.watchProgress.legacy.current, 10); assert.equal(h.value.watchProgress.scoped.poster, null);
  assert.equal(h.value.isWatched('legacy'), true); assert.equal(h.value.isWatched('scoped'), true);
  assert.equal(h.value.seriesLast.legacy.episode, '2'); assert.equal(h.value.seriesLast.scoped.title, 'Episode');
  await h.value.setProgress('new', progress(20)); await h.flush(); assert.equal(h.value.watchProgress.legacy.current, 10);
  h.unmount(); groups++;
}
(async () => { for (const test of [scopeHelpersAndLegacy, serializedWritesAndFailure, staleLoadAndWrite, reloadAndRestoreDrain, checkedLocalMigration, sharedOwnerClaimAndDrain, corruptSourcePreservedAndRecovery, nestedLibraryRecordsAndLegacyCompatibility]) await test(); console.log(`PASS: Library runtime — ${groups} davranış grubu geçti.`); })().catch(error => { console.error(error); process.exitCode = 1; });
