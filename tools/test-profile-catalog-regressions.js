#!/usr/bin/env node
/** Real providers and catalog lock code, mocked I/O: failed writes, ownership, zero counts and restore races. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..', 'frontend'), json = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function harness(providerName, initial = {}, options = {}) {
  const disk = new Map(Object.entries(initial)), heavy = new Map(), summaries = new Map(Object.entries(options.summaries || {})), events = [], writes = [], cache = new Map();
  const slots = [], effects = [], timers = new Map(); let cursor = 0, dirty = false, value, nextTimer = 0;
  const state = { profile: options.profile || 'A', failKey: '', strictFailKey: options.strictFailKey || '', failHeavy: false, failHash: false, readGate: null, writeGate: null, summaryGate: null, hashGate: options.hashGate || null, verifyGate: null, checkPinGate: null, refreshes: 0 };
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const React = {
    createContext: () => ({ Provider: {} }), createElement: (_type, props) => props.value,
    useState: initialValue => { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initialValue === 'function' ? initialValue() : initialValue }; return [slots[i].value, next => { const computed = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(computed, slots[i].value)) { slots[i].value = computed; dirty = true; } }]; },
    useRef: initialValue => { const i = cursor++; return slots[i] || (slots[i] = { current: initialValue }); },
    useMemo: (factory, deps) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() }; return slots[i].value; },
    useCallback: (callback, deps) => React.useMemo(() => callback, deps),
    useEffect: (effect, deps) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
    useContext: () => value,
  };
  const storage = {
    getItem: async (key, fallback) => { const result = disk.get(key) ?? fallback; if (state.readGate?.key === key) { const gate = state.readGate; state.readGate = null; await gate.promise; } return result; },
    setItem: async (key, next) => { writes.push({ key, next }); if (state.writeGate?.key === key) { const gate = state.writeGate; state.writeGate = null; await gate.promise; } if (key === state.failKey) return false; disk.set(key, next); return true; },
    removeItem: async key => { if (key === state.failKey) return false; disk.delete(key); return true; },
  };
  // Strict outer-envelope/platform-read behavior is covered by the actual storage I/O suite.
  storage.getItemStrict = async (key, fallback) => { if (state.strictFailKey === key) throw new Error('fixture strict storage read failure: ' + key); return storage.getItem(key, fallback); };
  const native = {
    available: options.native === true,
    hashPin: async pin => { if (state.hashGate) { const gate = state.hashGate; state.hashGate = null; await gate.promise; } if (state.failHash) throw new Error('fixture PIN protection failed'); return 'kzpin:fixture:' + Buffer.from(pin).toString('hex'); },
    verifyProtectedPin: async (entered, saved) => { if (state.verifyGate) { const gate = state.verifyGate; state.verifyGate = null; await gate.promise; } return saved === 'kzpin:fixture:' + Buffer.from(entered).toString('hex'); },
    getPlaylistSummaryVerified: async id => { if (state.summaryGate?.id === id) { const gate = state.summaryGate; state.summaryGate = null; await gate.promise; } if (!summaries.has(id)) throw new Error('fixture missing snapshot'); return summaries.get(id); },
    getPlaylistSummary: async id => summaries.get(id),
    getSnapshotInventory: async () => [], warmPlaylist: async () => {}, getTelemetry: () => ({}),
    syncPlaylistKindsJson: async (id, patch) => { const before = summaries.get(id) || { id, channels: 0, vod: 0, series: 0, roomIndexed: true }; const next = { ...before };
      for (const [field, kind] of [['channels', 'channels'], ['vod', 'vod'], ['series', 'series']]) if (patch[field] !== undefined) next[kind] = patch[field].length;
      summaries.set(id, next); return { roomVerified: true, summary: next, fingerprints: {}, changedKinds: [], skippedKinds: [], repairedKinds: [] }; },
  };
  const bigStore = {
    exists: async id => heavy.has(id) || summaries.has(id),
    write: async (id, data) => { if (state.failHeavy) return false; heavy.set(id, data); summaries.set(id, { id, channels: data.channels.length, vod: data.vod.length, series: data.series.length, roomIndexed: true }); return true; },
    read: async (id, fallback) => heavy.get(id) || fallback, remove: async id => { if (state.failHeavy) return false; heavy.delete(id); summaries.delete(id); return true; },
  };
  const mocks = {
    react: { ...React, default: React }, 'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '@/src/utils/storage': { storage }, '@/src/utils/storage/bigStore': { bigStore },
    './ProfileContext': { useProfiles: () => ({ activeProfile: { id: state.profile } }) },
    '@/src/utils/pin': { checkPin: async (a, b) => { if (state.checkPinGate) { const gate = state.checkPinGate; state.checkPinGate = null; await gate.promise; } return a === b || b === 'kzpin:fixture:' + Buffer.from(a).toString('hex') ? 'pin' : 'invalid'; }, isAccepted: value => value !== 'invalid' },
    '@/src/utils/diagnostics': { recordDiagnostic: async (...args) => events.push(args), beginFlightRecorderTrace: () => 'fixture', recordFlightRecorderStage: async () => {}, markTask: () => () => {} },
    '@/src/utils/adult': { scheduleAdultFlags: () => {} }, '@/modules/kizilkan-native-core': { KizilkanNativeCore: native },
    '@/src/utils/refreshPlaylist': { refreshPlaylistContent: async () => { state.refreshes++; throw new Error('fixture unavailable source'); } },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const exports = {}; cache.set(relative, exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    const req = id => Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith('@/') ? load(id.slice(2) + '.ts') : require(id);
    vm.runInNewContext(code, { exports, require: req, console: { ...console, warn: () => {}, info: () => {} }, Date, Promise, Object, JSON, Map, Set, URL, AbortController, encodeURIComponent,
      setTimeout: (work, delay = 0) => { const id = ++nextTimer; if (delay === 0) timers.set(id, work); return id; }, clearTimeout: id => timers.delete(id), setInterval: () => ++nextTimer, clearInterval: () => {} }, { filename: relative });
    return exports;
  }
  const component = load('src/store/' + providerName + 'Context.tsx')[providerName + 'Provider'];
  function render() { cursor = 0; dirty = false; value = component({ children: null }); while (effects.length) effects.shift()(); return value; }
  async function flush() { for (let i = 0; i < 140; i++) { await Promise.resolve(); if (dirty) render(); if (i > 20 && timers.size) { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(work => work()); } } return value; }
  render();
  return { state, disk, heavy, summaries, events, writes, render, flush, load, get value() { return value; }, unmount: () => slots.forEach(slot => slot?.cleanup?.()) };
}
const profiles = [{ id: 'A', name: 'A', color: 'red', hasPin: false, isAdmin: true }, { id: 'B', name: 'B', color: 'blue', hasPin: false }];
const playlist = (id, extra = {}) => ({ id, name: id, source: 'm3u_file', createdAt: '2026-01-01', channels: [], vod: [], series: [], ...extra });
let groups = 0;
async function profileFailuresAndSerial() {
  const h = harness('Profile', { 'kizilkan.profiles': JSON.stringify(profiles), 'kizilkan.activeProfileId': 'A' }); await h.flush();
  h.state.failKey = 'kizilkan.profiles'; await assert.rejects(h.value.updateProfile('A', { name: 'Not persisted' }), /kaydedilemedi/); await h.flush(); assert.equal(h.value.activeProfile.name, 'A');
  h.state.failKey = ''; await Promise.all([h.value.updateProfile('A', { name: 'New' }), h.value.updateProfile('A', { color: 'green' })]); await h.flush(); assert.equal(h.value.activeProfile.name, 'New'); assert.equal(h.value.activeProfile.color, 'green');
  h.state.failKey = 'kizilkan.activeProfileId'; await assert.rejects(h.value.switchProfile('B'), /kaydedilemedi/); await h.flush(); assert.equal(h.value.activeProfile.id, 'A');
  h.state.failKey = ''; const first = h.value.switchProfile('B').catch(error => error); const second = h.value.switchProfile('A'); assert.match(String(await first), /daha yeni/); await second; await h.flush(); assert.equal(h.value.activeProfile.id, 'A'); assert.equal(h.disk.get('kizilkan.activeProfileId'), 'A');
  const gate = deferred(); h.state.writeGate = { key: 'kizilkan.profiles', ...gate }; const pending = h.value.updateProfile('A', { name: 'Drained' }); await h.flush();
  const catalog = h.load('src/utils/catalogOperations.ts'), bus = h.load('src/utils/profileDataReload.ts'); const release = await catalog.beginCatalogRestore(); await assert.rejects(h.value.updateProfile('A', { name: 'Blocked' }), /Yedek/);
  let drained = false; const wait = bus.drainProfileDataWrites().then(() => { drained = true; }); await h.flush(); assert.equal(drained, false); gate.resolve(); await pending; await wait; release(); await h.flush(); assert.equal(h.value.activeProfile.name, 'Drained');
  h.unmount(); groups++;
}
async function staleProfileReload() {
  const original = profiles.map(({ isAdmin, ...rest }) => rest);
  const h = harness('Profile', { 'kizilkan.profiles': JSON.stringify(original), 'kizilkan.activeProfileId': 'A' });
  const gate = deferred(); h.state.readGate = { key: 'kizilkan.profiles', ...gate }; await h.flush();
  const restored = [{ ...profiles[0], name: 'Restored' }]; h.disk.set('kizilkan.profiles', JSON.stringify(restored)); h.load('src/utils/profileDataReload.ts').notifyProfileDataReload(); h.render(); gate.resolve(); await h.flush();
  assert.equal(h.value.profiles.length, 1); assert.equal(h.value.activeProfile.name, 'Restored'); assert.deepEqual(JSON.parse(h.disk.get('kizilkan.profiles')), restored);
  h.unmount(); groups++;
}
async function parentalFailureSerialAndSession() {
  const h = harness('Parental'); await h.flush();
  h.state.failKey = 'kizilkan.parental'; await assert.rejects(h.value.setPin('1234'), /kaydedilemedi/); await h.flush(); assert.equal(h.value.settings.enabled, false);
  h.state.failKey = ''; await Promise.all([h.value.setPin('1234'), h.value.toggleCategoryLock('Movies'), h.value.toggleCategoryLock('Series'), h.value.setAdultHidden(true)]); await h.flush();
  assert.equal(h.value.settings.enabled, true); assert.deepEqual(json(h.value.settings.lockedCategories), ['Movies', 'Series']); assert.equal(h.value.settings.adultHidden, true);
  h.value.unlockCategoryForSession('Movies'); await h.flush(); assert.equal(h.value.isUnlockedInSession('Movies'), true); const oldUnlock = h.value.unlockCategoryForSession; h.state.profile = 'B'; h.render(); await h.flush(); oldUnlock('Movies'); await h.flush(); assert.equal(h.value.isUnlockedInSession('Movies'), false);
  const release = await h.load('src/utils/catalogOperations.ts').beginCatalogRestore(); await assert.rejects(h.value.setAdultHidden(false), /Yedek/); release();
  h.unmount(); groups++;
}
async function profileCreationRollbackAndSharedRemoval() {
  const first = harness('Profile'); await first.flush(); assert.equal(first.value.profiles.length, 0);
  first.state.failKey = 'kizilkan.activeProfileId'; await assert.rejects(first.value.addProfile('First'), /kaydedilemedi/); await first.flush(); assert.equal(first.value.profiles.length, 0); assert.equal(first.disk.has('kizilkan.profiles'), false);
  first.state.failKey = 'kizilkan.profiles'; await assert.rejects(first.value.addProfile('First'), /kaydedilemedi/); await first.flush(); assert.equal(first.value.profiles.length, 0); assert.equal(first.disk.has('kizilkan.activeProfileId'), false);
  first.state.failKey = ''; const created = await first.value.addProfile('First'); await first.flush(); assert.equal(first.value.activeProfile.id, created.id); first.unmount();
  const h = harness('Profile', { 'kizilkan.profiles': JSON.stringify(profiles), 'kizilkan.activeProfileId': 'B', 'kizilkan.playlists.meta.A': JSON.stringify([playlist('shared')]), 'kizilkan.playlists.meta.B': JSON.stringify([playlist('shared'), playlist('own')]) }); await h.flush();
  h.heavy.set('shared', { channels: [], vod: [], series: [] }); h.heavy.set('own', { channels: [], vod: [], series: [] });
  h.state.failKey = 'kizilkan.activeProfileId'; await assert.rejects(h.value.removeProfile('B'), /kaydedilemedi/); await h.flush(); assert.equal(h.value.profiles.length, 2); assert.equal(h.value.activeProfile.id, 'B'); assert.equal(h.heavy.has('own'), true);
  h.state.failKey = ''; await h.value.removeProfile('B'); await h.flush(); assert.equal(h.value.activeProfile.id, 'A'); assert.equal(h.heavy.has('shared'), true); assert.equal(h.heavy.has('own'), false);
  h.unmount(); groups++;
}
async function catalogLockPendingBarrier() {
  const h = harness('Profile', { 'kizilkan.profiles': JSON.stringify(profiles) }); await h.flush();
  const catalog = h.load('src/utils/catalogOperations.ts'), gate = deferred(), order = [];
  const first = catalog.withCatalogLock('same', async () => { order.push('first'); await gate.promise; order.push('first-end'); });
  const second = catalog.withCatalogLock('same', async () => { order.push('second'); });
  await catalog.withCatalogLock('other', async () => { order.push('other'); }); assert.deepEqual(order, ['first', 'other']);
  let released; const restore = catalog.beginCatalogRestore().then(release => { released = release; order.push('restore'); });
  assert.equal(catalog.isCatalogRestoreActive(), true); await assert.rejects(catalog.withCatalogLock('new', async () => {}), /geri yüklenirken/); assert.equal(catalog.isCatalogRestoreWriting(), false);
  gate.resolve(); await first; await second; await restore; assert.deepEqual(order, ['first', 'other', 'first-end', 'second', 'restore']); assert.equal(catalog.isCatalogRestoreWriting(), true); released(); assert.equal(catalog.isCatalogRestoreActive(), false);
  h.unmount(); groups++;
}
async function playlistTruthfulCountsAndWrites() {
  const metas = [playlist('empty', { channelsCount: 99, vodCount: 88, seriesCount: 77, catalogLocalState: 'empty' }), playlist('missing', { source: undefined, channelsCount: 15 })];
  const h = harness('Playlist', { 'kizilkan.playlists.meta.A': JSON.stringify(metas) }, { native: true, summaries: { empty: { id: 'empty', channels: 0, vod: 0, series: 0, roomIndexed: true } } }); await h.flush();
  const empty = h.value.playlists.find(row => row.id === 'empty'), missing = h.value.playlists.find(row => row.id === 'missing'); assert.equal(empty.channelsCount, 0); assert.equal(empty.vodCount, 0); assert.equal(empty.seriesCount, 0); assert.equal(empty.catalogLocalState, 'empty'); assert.equal(missing.channelsCount, 0); assert.equal(missing.catalogLocalState, 'missing');
  assert.equal(JSON.parse(h.disk.get('kizilkan.playlists.meta.A')).find(row => row.id === 'empty').channelsCount, 0);
  await h.value.setActivePlaylist('empty'); await h.flush(); assert.equal(h.value.activePlaylist.id, 'empty'); assert.equal(h.state.refreshes, 0);
  await assert.rejects(h.value.setActivePlaylist('missing'), /kaynağı|metadata|onarım/); await h.flush(); assert.equal(h.value.activePlaylist.id, 'empty');
  h.state.failKey = 'kizilkan.playlists.meta.A'; await assert.rejects(h.value.updatePlaylist('empty', { name: 'Bad' }), /kaydedilemedi/); await h.flush(); assert.equal(h.value.playlists.find(row => row.id === 'empty').name, 'empty');
  h.state.failKey = ''; await Promise.all([h.value.addPlaylist(playlist('one')), h.value.addPlaylist(playlist('two'))]); await h.flush(); assert.ok(h.value.playlists.some(row => row.id === 'one')); assert.ok(h.value.playlists.some(row => row.id === 'two'));
  const oldActive = h.value.activePlaylist.id; h.state.failKey = 'kizilkan.activePlaylistId.A'; await assert.rejects(h.value.setActivePlaylist('empty'), /kaydedilemedi/); await h.flush(); assert.equal(h.value.activePlaylist.id, oldActive);
  h.state.failKey = ''; const release = await h.value.beginExternalRestore(); await assert.rejects(h.value.addPlaylist(playlist('blocked')), /geri yüklenirken/); await assert.rejects(h.value.toggleFavorite('blocked'), /Yedek/); release();
  h.unmount(); groups++;
}
async function playlistProfileRaceAndAux() {
  const h = harness('Playlist', { 'kizilkan.playlists.meta.A': JSON.stringify([playlist('a')]), 'kizilkan.playlists.meta.B': JSON.stringify([playlist('b')]) });
  const gate = deferred(); h.state.readGate = { key: 'kizilkan.playlists.meta.A', ...gate }; await h.flush(); h.state.profile = 'B'; h.render(); gate.resolve(); await h.flush(); assert.equal(h.value.loadedProfileId, 'B'); assert.deepEqual(h.value.playlists.map(row => row.id), ['b']);
  await h.value.setActivePlaylist('b'); await h.flush(); await Promise.all([h.value.toggleFavorite('1'), h.value.toggleFavorite('2'), h.value.addToRecent('1'), h.value.addToRecent('2')]); await h.flush(); assert.deepEqual(json(h.value.favorites).sort(), ['1', '2']); assert.deepEqual(json(h.value.recent), ['2', '1']);
  h.state.failKey = 'kizilkan.favorites.B'; await assert.rejects(h.value.toggleFavorite('3'), /kaydedilemedi/); await h.flush(); assert.equal(h.value.isFavorite('3'), false);
  h.state.failKey = ''; h.state.profile = 'A'; h.render(); await h.flush(); await h.value.setActivePlaylist('a'); await h.flush(); assert.deepEqual(json(h.value.favorites), []);
  h.unmount(); groups++;
}
async function migrationFailuresAndOwnerRetry() {
  const legacy = JSON.stringify([playlist('legacy', { channels: [{ id: '1' }] })]);
  for (const failure of ['heavy', 'kizilkan.playlists.meta', 'kizilkan.playlists']) {
    const h = harness('Playlist', { 'kizilkan.playlists': legacy }); if (failure === 'heavy') h.state.failHeavy = true; else h.state.failKey = failure;
    await h.flush(); assert.equal(h.disk.get('kizilkan.playlists'), legacy, failure + ' failure must retain the legacy source'); assert.ok(h.value.loadError); assert.equal(h.value.loadedProfileId, null); h.unmount();
  }
  const invalid = harness('Playlist', { 'kizilkan.playlists': '{broken' }); await invalid.flush(); assert.equal(invalid.disk.get('kizilkan.playlists'), '{broken'); assert.ok(invalid.value.loadError); invalid.unmount();
  const global = JSON.stringify([playlist('global')]);
  const failed = harness('Playlist', { 'kizilkan.playlists.meta': global, 'kizilkan.activePlaylistId': 'global' }); failed.state.failKey = 'kizilkan.playlists.meta.A'; await failed.flush();
  assert.equal(failed.disk.get('kizilkan.playlists.meta'), global); assert.equal(failed.disk.get('kizilkan.playlists.migratedTo'), 'A'); assert.equal(failed.disk.has('kizilkan.playlists.meta.A'), false);
  const saved = Object.fromEntries(failed.disk); failed.unmount(); const other = harness('Playlist', saved, { profile: 'B' }); await other.flush(); assert.equal(other.value.playlists.length, 0); assert.equal(other.disk.has('kizilkan.playlists.meta.B'), false);
  const retry = harness('Playlist', Object.fromEntries(other.disk)); other.unmount(); await retry.flush(); assert.deepEqual(retry.value.playlists.map(row => row.id), ['global']); assert.equal(retry.disk.has('kizilkan.playlists.meta'), false); assert.equal(retry.disk.get('kizilkan.activePlaylistId.A'), 'global'); retry.unmount();
  const activeFailed = harness('Playlist', { 'kizilkan.playlists.meta': global, 'kizilkan.activePlaylistId': 'global' }); activeFailed.state.failKey = 'kizilkan.activePlaylistId.A'; await activeFailed.flush(); assert.equal(activeFailed.disk.get('kizilkan.playlists.meta'), global); assert.ok(activeFailed.disk.get('kizilkan.playlists.meta.A'));
  activeFailed.state.failKey = ''; const resumed = activeFailed.value.reloadAfterRestore(); await activeFailed.flush(); await resumed; assert.equal(activeFailed.disk.has('kizilkan.playlists.meta'), false); assert.equal(activeFailed.value.activePlaylist.id, 'global'); activeFailed.unmount();
  groups++;
}
async function initialCountWriteFailureAndExistingRoomMigration() {
  const h = harness('Playlist', { 'kizilkan.playlists.meta.A': JSON.stringify([playlist('empty', { channelsCount: 100, catalogLocalState: 'empty' })]) }, { native: true, summaries: { empty: { id: 'empty', roomIndexed: true, channels: 0, vod: 0, series: 0 } } });
  h.state.failKey = 'kizilkan.playlists.meta.A'; await h.flush(); assert.ok(h.value.loadError); assert.equal(h.value.loadedProfileId, null); assert.equal(h.value.playlists.length, 0);
  const rejected = h.value.reloadAfterRestore(); const result = rejected.then(() => null, error => error); await h.flush(); assert.ok(await result); assert.equal(h.value.loadedProfileId, null);
  h.state.failKey = ''; const success = h.value.reloadAfterRestore(); await h.flush(); await success; assert.equal(h.value.loadedProfileId, 'A'); assert.equal(h.value.playlists[0].channelsCount, 0); h.unmount();
  const legacy = JSON.stringify([playlist('room', { channels: [{ id: 'old' }] })]); const existing = harness('Playlist', { 'kizilkan.playlists': legacy }, { native: true, summaries: { room: { id: 'room', roomIndexed: true, channels: 2, vod: 0, series: 0 } } }); await existing.flush();
  assert.equal(existing.heavy.has('room'), false); assert.equal(existing.summaries.get('room').channels, 2); assert.equal(existing.value.playlists[0].channelsCount, 2); existing.unmount(); groups++;
}
async function switchEditWriterAndRestoreRaces() {
  const h = harness('Playlist', { 'kizilkan.playlists.meta.A': JSON.stringify([playlist('a'), playlist('b')]) }, { native: true, summaries: { a: { id: 'a', roomIndexed: true, channels: 1, vod: 0, series: 0 }, b: { id: 'b', roomIndexed: true, channels: 1, vod: 0, series: 0 } } }); await h.flush(); await h.value.setActivePlaylist('a'); await h.flush();
  // An edit owns the metadata writer before selection builds its publication.
  const editGate = deferred(); h.state.writeGate = { key: 'kizilkan.playlists.meta.A', ...editGate };
  const edit = h.value.updatePlaylist('b', { name: 'Edited before switch' }); await h.flush();
  const switchAfterEdit = h.value.setActivePlaylist('b'); await h.flush(); editGate.resolve(); await edit; await switchAfterEdit; await h.flush();
  assert.equal(h.value.activePlaylist.name, 'Edited before switch'); assert.equal(JSON.parse(h.disk.get('kizilkan.playlists.meta.A')).find(row => row.id === 'b').name, 'Edited before switch');
  await h.value.setActivePlaylist('a'); await h.flush();
  // Selection's active-key write waits while a later edit has already persisted.
  const keyGate = deferred(); h.state.writeGate = { key: 'kizilkan.activePlaylistId.A', ...keyGate };
  const selection = h.value.setActivePlaylist('b'); await h.flush();
  await h.value.updatePlaylist('b', { name: 'Edited while key waited', accountInfo: { username: 'owner' } }); await h.flush(); keyGate.resolve(); await selection; await h.flush();
  assert.equal(h.value.activePlaylist.name, 'Edited while key waited'); assert.equal(h.value.activePlaylist.accountInfo.username, 'owner'); assert.equal(JSON.parse(h.disk.get('kizilkan.playlists.meta.A')).find(row => row.id === 'b').name, 'Edited while key waited');
  await h.value.setActivePlaylist('a'); await h.flush();
  // Restore closes admission first, then waits for the old active-key write.
  const restoreGate = deferred(); h.state.writeGate = { key: 'kizilkan.activePlaylistId.A', ...restoreGate };
  const oldSelection = h.value.setActivePlaylist('b'); await h.flush(); let restoreEntered = false;
  const restoring = h.value.beginExternalRestore().then(release => { restoreEntered = true; return release; }); await h.flush(); assert.equal(restoreEntered, false);
  await assert.rejects(h.value.setActivePlaylist('a'), /geri yüklenirken|geri yükleme|Yedek/);
  await assert.rejects(h.value.updatePlaylist('a', { name: 'blocked' }), /geri yüklenirken/);
  restoreGate.resolve(); await oldSelection; const release = await restoring; await h.flush(); assert.equal(h.value.activePlaylist.id, 'a');
  const restored = [playlist('a', { name: 'Restored', catalogLocalState: 'ready', channelsCount: 1 }), playlist('b', { name: 'Restored B', catalogLocalState: 'ready', channelsCount: 1 })];
  h.disk.set('kizilkan.playlists.meta.A', JSON.stringify(restored)); h.disk.set('kizilkan.activePlaylistId.A', 'a'); release(); const reload = h.value.reloadAfterRestore(); await h.flush(); await reload; await h.flush();
  assert.equal(h.value.activePlaylist.id, 'a'); assert.equal(h.value.activePlaylist.name, 'Restored'); assert.equal(JSON.parse(h.disk.get('kizilkan.playlists.meta.A')).find(row => row.id === 'b').name, 'Restored B');
  h.unmount(); groups++;
}
async function pinMigrationDrainsAndCorruptDeletionGuard() {
  for (const provider of ['Profile', 'Parental', 'Playlist']) {
    const key = provider === 'Profile' ? 'kizilkan.profiles' : provider === 'Parental' ? 'kizilkan.parental' : 'kizilkan.playlists.meta.A';
    const original = provider === 'Profile' ? [{ ...profiles[0], hasPin: true, pin: '1234' }] : provider === 'Parental' ? { enabled: true, pin: '1234', lockedCategories: ['Old'], adultHidden: false } : [playlist('pinned', { pin: '1234', hasPin: true })];
    const gate = deferred(), h = harness(provider, { [key]: JSON.stringify(original) }, { native: true, hashGate: gate }); await h.flush();
    const catalog = h.load('src/utils/catalogOperations.ts'), bus = h.load('src/utils/profileDataReload.ts'); const release = await catalog.beginCatalogRestore();
    let drained = false; const draining = bus.drainProfileDataWrites().then(() => { drained = true; }); await h.flush(); assert.equal(drained, false, provider + ' PIN migration must belong to the restore drain');
    gate.resolve(); await draining; await h.flush();
    assert.equal(h.disk.get(key), JSON.stringify(original), provider + ' deferred boot migration must not write while restore owns the catalog');
    const restored = provider === 'Profile' ? [{ ...profiles[0], name: 'Restored', hasPin: true, pin: 'kzpin:fixture:9999' }] : provider === 'Parental' ? { enabled: true, pin: 'kzpin:fixture:9999', lockedCategories: ['Restored'], adultHidden: true } : [playlist('restored', { name: 'Restored', pin: 'kzpin:fixture:9999' })];
    h.disk.set(key, JSON.stringify(restored)); release();
    const reload = provider === 'Playlist' ? h.value.reloadAfterRestore() : (bus.notifyProfileDataReload(), Promise.resolve()); h.render(); await h.flush(); await reload;
    if (provider === 'Playlist') { const saved = JSON.parse(h.disk.get(key)); assert.equal(saved.length, 1); assert.equal(saved[0].id, 'restored'); assert.equal(saved[0].pin, 'kzpin:fixture:9999'); }
    else assert.equal(h.disk.get(key), JSON.stringify(restored));
    if (provider === 'Profile') assert.equal(h.value.activeProfile.name, 'Restored');
    if (provider === 'Parental') assert.deepEqual(json(h.value.settings.lockedCategories), ['Restored']);
    if (provider === 'Playlist') assert.equal(h.value.playlists[0].name, 'Restored');
    h.unmount();
  }
  for (const corrupt of ['{broken', '{"id":"wrong-shape"}']) {
    const key = 'kizilkan.playlists.meta.A', h = harness('Playlist', { [key]: JSON.stringify([playlist('kept')]) }); await h.flush();
    h.disk.set(key, corrupt); await assert.rejects(h.value.updatePlaylist('kept', { name: 'Must not overwrite source' }), /doğrulanamadı/); await h.flush();
    assert.equal(h.disk.get(key), corrupt); assert.equal(h.value.playlists[0].name, 'kept'); h.unmount();
  }
  groups++;
}
async function providerCorruptionFailClosedAndRetry() {
  for (const provider of ['Profile', 'Parental']) {
    const key = provider === 'Profile' ? 'kizilkan.profiles' : 'kizilkan.parental';
    const invalid = provider === 'Profile' ? ['{broken', '{}', '[{"id":"A"}]'] : ['{broken', '[]', '{"enabled":"yes","pin":"","lockedCategories":[]}'];
    const valid = provider === 'Profile' ? profiles : { enabled: false, pin: '', lockedCategories: [], adultHidden: false };
    for (const raw of invalid) {
      const h = harness(provider, { [key]: raw }); await h.flush(); assert.ok(h.value.loadError); assert.equal(h.value.isLoading, false);
      const mutate = () => provider === 'Profile' ? h.value.updateProfile('A', { name: 'Rejected' }) : h.value.setAdultHidden(true);
      await assert.rejects(mutate(), /güvenle yüklenemedi/); await assert.rejects(provider === 'Profile' ? h.value.verifyPin('A', '1234') : h.value.verifyPin('1234'), /güvenle yüklenemedi/);
      if (provider === 'Profile') assert.equal(h.value.adminHasPin(), true); else assert.equal(h.value.isCategoryLocked('Any category'), true);
      assert.equal(h.disk.get(key), raw); assert.equal(h.writes.length, 0);
      h.disk.set(key, JSON.stringify(valid));
      if (raw === '{broken') h.value.retryLoad(); else h.load('src/utils/profileDataReload.ts').notifyProfileDataReload();
      await assert.rejects(mutate(), /güvenle yüklenemedi/); h.render(); await h.flush(); assert.equal(h.value.loadError, null); assert.equal(h.value.isLoading, false);
      if (provider === 'Profile') await h.value.updateProfile('A', { name: 'Recovered' }); else await h.value.setAdultHidden(true);
      await h.flush(); assert.equal(provider === 'Profile' ? h.value.activeProfile.name : h.value.settings.adultHidden, provider === 'Profile' ? 'Recovered' : true); h.unmount();
    }
    for (const failure of ['write', 'hash']) {
      const original = provider === 'Profile' ? [{ ...profiles[0], hasPin: true, pin: '1234' }] : { enabled: true, pin: '1234', lockedCategories: ['Locked'], adultHidden: false };
      const raw = JSON.stringify(original), h = harness(provider, { [key]: raw }, { native: true });
      if (failure === 'write') h.state.failKey = key; else h.state.failHash = true;
      await h.flush(); assert.ok(h.value.loadError); assert.equal(h.value.isLoading, false); assert.equal(h.disk.get(key), raw);
      await assert.rejects(provider === 'Profile' ? h.value.setPin('A', '4567') : h.value.setPin('4567'), /güvenle yüklenemedi/);
      h.state.failKey = ''; h.state.failHash = false; h.value.retryLoad(); h.render(); await h.flush(); assert.equal(h.value.loadError, null);
      assert.equal(provider === 'Profile' ? await h.value.verifyPin('A', '1234') : await h.value.verifyPin('1234'), true); h.unmount();
    }
  }
  groups++;
}
async function deferredPinVerificationRejectsChangedOwnership() {
  const saved = 'kzpin:fixture:' + Buffer.from('1234').toString('hex');
  for (const provider of ['Profile', 'Parental']) for (const method of provider === 'Profile' ? ['verifyPin', 'verifyPinAsync', 'verifyAdminPin'] : ['verifyPin', 'verifyPinAsync']) for (const race of ['edit', 'restore', 'owner', 'reload']) {
    const key = provider === 'Profile' ? 'kizilkan.profiles' : 'kizilkan.parental';
    const original = provider === 'Profile' ? [{ ...profiles[0], hasPin: true, pin: saved }, profiles[1]] : { enabled: true, pin: saved, lockedCategories: [], adultHidden: false };
    const h = harness(provider, { [key]: JSON.stringify(original), 'kizilkan.activeProfileId': 'A' }, { native: true }); await h.flush();
    const verify = () => provider === 'Profile' && method !== 'verifyAdminPin' ? h.value[method]('A', '1234') : h.value[method]('1234'); assert.equal(await verify(), true);
    const gate = deferred(); h.state[method === 'verifyPin' ? 'verifyGate' : 'checkPinGate'] = gate; let completed = false;
    const pending = verify().then(value => { completed = true; return value; }); await h.flush(); assert.equal(completed, false, provider + '/' + method + ' must await verification'); let release;
    if (race === 'edit') { if (provider === 'Profile') await h.value.setPin('A', '5678'); else await h.value.setPin('5678'); await h.flush(); }
    if (race === 'restore') release = await h.load('src/utils/catalogOperations.ts').beginCatalogRestore();
    if (race === 'owner') { if (provider === 'Profile') await h.value.switchProfile('B'); else h.state.profile = 'B'; h.render(); await h.flush(); }
    if (race === 'reload') { h.load('src/utils/profileDataReload.ts').notifyProfileDataReload(); h.render(); await h.flush(); }
    gate.resolve(); assert.equal(await pending, false, provider + '/' + method + '/' + race + ' must discard the old credential result'); release?.(); h.unmount();
  }
  groups++;
}
async function strictReadFailuresPreserveProviderSources() {
  for (const [provider, failedKey] of [['Profile', 'kizilkan.profiles'], ['Profile', 'kizilkan.activeProfileId'], ['Parental', 'kizilkan.parental'], ['Playlist', 'kizilkan.playlists.meta.A'], ['Playlist', 'kizilkan.activePlaylistId.A']]) {
    const initial = { 'kizilkan.profiles': JSON.stringify(profiles), 'kizilkan.activeProfileId': 'A', 'kizilkan.parental': JSON.stringify({ enabled: true, pin: '', lockedCategories: ['Protected'], adultHidden: true }), 'kizilkan.playlists.meta.A': JSON.stringify([playlist('a')]), 'kizilkan.activePlaylistId.A': 'a' };
    const h = harness(provider, initial, { strictFailKey: failedKey }); await h.flush(); assert.ok(h.value.loadError, provider + '/' + failedKey); assert.equal(h.value.isLoading, false);
    const mutate = () => provider === 'Profile' ? h.value.updateProfile('A', { name: 'Rejected' }) : provider === 'Parental' ? h.value.setAdultHidden(false) : h.value.updatePlaylist('a', { name: 'Rejected' });
    await assert.rejects(mutate(), /yüklen|güvenle|hazır|profil|bulunamadı/i);
    if (provider === 'Playlist') { await assert.rejects(h.value.addPlaylist(playlist('rejected-add')), /yüklen|güvenle|hazır|doğrulan|kaynak|liste/i); assert.equal(h.heavy.has('rejected-add'), false, 'unready provider must reject before creating a catalogue'); }
    for (const [key, raw] of Object.entries(initial)) assert.equal(h.disk.get(key), raw); assert.equal(h.writes.length, 0);
    h.state.strictFailKey = '';
    const reload = provider === 'Playlist' ? h.value.reloadAfterRestore() : (h.value.retryLoad(), Promise.resolve()); h.render(); await h.flush(); await reload; assert.equal(h.value.loadError, null);
    await mutate(); await h.flush(); assert.ok(h.writes.length > 0); h.unmount();
  }
  groups++;
}
async function auxiliaryCorruptionAndReadFailuresKeepSources() {
  const metaKey = 'kizilkan.playlists.meta.A';
  for (const field of ['favorites', 'recent']) for (const raw of ['{broken', '{}', '["kept",7]']) {
    const key = 'kizilkan.' + field + '.A';
    const h = harness('Playlist', { [metaKey]: JSON.stringify([playlist('a')]), 'kizilkan.activePlaylistId.A': 'a', 'kizilkan.libraryLegacyOwner.A': 'a', [key]: raw }); await h.flush();
    const mutate = () => field === 'favorites' ? h.value.toggleFavorite('new') : h.value.addToRecent('new');
    await assert.rejects(mutate(), /Kişisel kayıt hedefi|yüklen|bozuk|geçersiz/i); assert.equal(h.disk.get(key), raw); assert.equal(h.writes.filter(write => write.key === key).length, 0);
    h.disk.set(key, JSON.stringify(['kept'])); const reload = h.value.reloadAfterRestore(); await h.flush(); await reload; await mutate(); await h.flush();
    const ids = JSON.parse(h.disk.get(key)); assert.ok(ids.includes('@list:a:new')); assert.ok(ids.includes('@list:a:kept')); h.unmount();
  }
  for (const field of ['favorites', 'recent']) {
    const key = 'kizilkan.' + field + '.A', raw = JSON.stringify(['kept']);
    const h = harness('Playlist', { [metaKey]: JSON.stringify([playlist('a')]), 'kizilkan.activePlaylistId.A': 'a', 'kizilkan.libraryLegacyOwner.A': 'a', [key]: raw }); await h.flush();
    const mutate = () => field === 'favorites' ? h.value.toggleFavorite('new') : h.value.addToRecent('new');
    // A same-profile/list reload must invalidate the former auxiliary snapshot before I/O.
    h.state.strictFailKey = key; const reload = h.value.reloadAfterRestore(); await h.flush(); await reload;
    await assert.rejects(mutate(), /Kişisel kayıt hedefi|yüklen/i); assert.equal(h.disk.get(key), raw); assert.equal(h.writes.filter(write => write.key === key).length, 0);
    h.state.strictFailKey = ''; const retry = h.value.reloadAfterRestore(); await h.flush(); await retry; await mutate(); await h.flush(); assert.ok(JSON.parse(h.disk.get(key)).includes('@list:a:new')); h.unmount();
  }
  groups++;
}
(async () => {
  for (const test of [profileFailuresAndSerial, staleProfileReload, parentalFailureSerialAndSession, profileCreationRollbackAndSharedRemoval, catalogLockPendingBarrier, playlistTruthfulCountsAndWrites, playlistProfileRaceAndAux, migrationFailuresAndOwnerRetry, initialCountWriteFailureAndExistingRoomMigration, switchEditWriterAndRestoreRaces, pinMigrationDrainsAndCorruptDeletionGuard, providerCorruptionFailClosedAndRetry, deferredPinVerificationRejectsChangedOwnership, strictReadFailuresPreserveProviderSources, auxiliaryCorruptionAndReadFailuresKeepSources]) {
    try { await test(); console.log('PASS:', test.name); } catch (error) { console.error('FAIL:', test.name, error); process.exitCode = 1; }
  }
  console.log('PASS: Profile/catalog runtime —', groups, 'davranış grubu geçti.');
})().catch(error => { console.error(error); process.exitCode = 1; });
