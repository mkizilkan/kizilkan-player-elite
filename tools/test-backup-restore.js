#!/usr/bin/env node
// Run real TypeScript restore functions against controlled in-memory storage/Room/File adapters.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'frontend')] }));
const strictValue = require('./_strict-storage-fixture');
const kv = new Map(), rows = new Map(), states = new Map(), oldRows = new Map(), chunks = new Map(), files = new Map();
let failMetaOnce = false, failStage = false, failFinalize = false, failLegacyCleanupOnce = false, failMetaKey = 'kizilkan.playlists.meta.p';
let failReadKey = '', stageWrites = 0, metadataWrites = 0;
const copy = value => JSON.parse(JSON.stringify(value));
const storage = { getItem: async (key, fallback) => kv.has(key) ? kv.get(key) : fallback,
  getItemStrict: async (key, fallback) => { if (key === failReadKey) throw new Error('Yerel kayıt okunamadı.'); return strictValue(kv.get(key), fallback, kv.has(key)); },
  setItem: async (key, value) => { metadataWrites++; if (failMetaOnce && key === failMetaKey) { failMetaOnce = false; return false; } kv.set(key, value); return true; },
  removeItem: async key => { kv.delete(key); return true; } };
const summary = id => { const row = rows.get(id); if (!row) throw new Error('Missing Room index'); return { id, roomIndexed: true, channels: row.channels.length, vod: row.vod.length, series: row.series.length }; };
const core = { available: true,
  getSnapshotInventory: async () => [...rows.keys()].map(playlistId => ({ playlistId })),
  hasPlaylistIndex: async id => rows.has(id), getPlaylistSummary: async id => summary(id), getPlaylistSummaryVerified: async id => summary(id),
  beginChunkedPlaylistImport: async id => { stageWrites++; chunks.set(id, { channels: [], vod: [], series: [] }); return true; },
  appendPlaylistChunk: async (id, kind, text) => { const data = JSON.parse(text); chunks.get(id)[kind === 'live' ? 'channels' : kind].push(...data); return data.length; },
  finishChunkedPlaylistImport: async id => { rows.set(id, chunks.get(id)); chunks.delete(id); return summary(id); },
  cancelChunkedPlaylistImport: async id => { chunks.delete(id); return true; }, removePlaylistIndex: async id => { rows.delete(id); return true; },
  deleteLegacyPlaylistFile: async () => { if (failLegacyCleanupOnce) { failLegacyCleanupOnce = false; return false; } return true; },
  getAtomicPlaylistRestoreState: async session => states.get(session) || 'none', clearAtomicPlaylistRestoreState: async session => { states.delete(session); return true; },
  applyAtomicPlaylistRestore: async (session, mappings) => {
    for (const m of mappings) { oldRows.set(`${session}:${m.targetId}`, rows.has(m.targetId) ? copy(rows.get(m.targetId)) : null); rows.delete(m.targetId); if (m.stageId) { rows.set(m.targetId, rows.get(m.stageId)); rows.delete(m.stageId); } }
    states.set(session, 'applied'); return true;
  },
  finalizeAtomicPlaylistRestore: async (session, ids) => { if (failFinalize) return false; for (const id of ids) oldRows.delete(`${session}:${id}`); states.set(session, 'finalized'); return true; },
  rollbackAtomicPlaylistRestore: async (session, ids) => { if (states.get(session) !== 'applied') return true; for (const id of ids) { rows.delete(id); const old = oldRows.get(`${session}:${id}`); if (old) rows.set(id, old); oldRows.delete(`${session}:${id}`); } states.delete(session); return true; },
};
const bigStore = { write: async (id, data) => { stageWrites++; if (failStage && id.startsWith('__kzb_stage_')) return false; rows.set(id, copy(data)); return true; },
  read: async (id, fallback) => rows.has(id) ? copy(rows.get(id)) : fallback, exists: async id => rows.has(id), remove: async id => { rows.delete(id); return true; } };
class File {
  constructor(asset) { this.uri = typeof asset === 'string' ? asset : asset.uri; }
  get size() { return Buffer.byteLength(files.get(this.uri) || ''); }
  open() { const data = new Uint8Array(Buffer.from(files.get(this.uri) || '')); return { offset: 0, size: data.length, readBytes(n) { const bytes = data.slice(this.offset, this.offset + n); this.offset += bytes.length; return bytes; }, close() {} }; }
}
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name === './storage' || name === '@/src/utils/storage') return { storage };
    if (name === './storage/bigStore' || name === '@/src/utils/storage/bigStore') return { bigStore };
    if (name === '@/modules/kizilkan-native-core') return { KizilkanNativeCore: core };
    if (name === 'expo-file-system') return { File, Paths: { cache: 'cache' } };
    const local = name === '@/src/utils/backup' ? 'frontend/src/utils/backup.ts' : path.join(path.dirname(file), name + '.ts');
    return load(local);
  }, console, Map, Set, Date, Math, JSON, Number, String, Array, Object, TextEncoder, TextDecoder, Uint8Array, AbortController, setTimeout }, { filename: file });
  return exports;
}
const B = load('frontend/src/utils/backup.ts'), V3 = load('frontend/src/utils/backupV3.ts'), Tx = load('frontend/src/utils/backupRestoreTransaction.ts');
const list = id => ({ id, name: id, source: 'xtream', xtreamServer: `https://${id}.test`, channelsCount: 999, vodCount: 888, seriesCount: 777 });
const heavy = id => ({ channels: [{ id: `${id}-channel`, name: id, url: 'https://test/stream' }], vod: [], series: [] });
function fixture(ids = ['B', 'C'], catalogue = true) {
  const values = ids.map(list), raw = JSON.stringify(values);
  return { appName: 'KIZILKAN PLAYER ELITE', version: catalogue ? '2.0' : '2.1', data: { 'kizilkan.profiles': JSON.stringify([{ id: 'backup-profile', name: 'Yedek' }]), 'kizilkan.playlists.meta.backup-profile': raw, 'kizilkan.theme': 'light' },
    playlists: { profiles: { 'backup-profile': { metadata: raw, playlistIds: ids } }, heavy: catalogue ? Object.fromEntries(ids.map(id => [id, heavy(id)])) : {} } };
}
function reset() {
  kv.clear(); rows.clear(); states.clear(); oldRows.clear(); chunks.clear(); files.clear(); core.available = true; failMetaOnce = false; failStage = false; failFinalize = false; failLegacyCleanupOnce = false; failMetaKey = 'kizilkan.playlists.meta.p';
  kv.set('kizilkan.profiles', JSON.stringify([{ id: 'p', name: 'Ben' }]));
  kv.set('kizilkan.playlists.meta.p', JSON.stringify([list('A'), list('D')])); kv.set('kizilkan.activePlaylistId.p', 'D'); kv.set('kizilkan.theme', 'dark');
  rows.set('A', heavy('A')); rows.set('D', heavy('D'));
  failReadKey = ''; stageWrites = 0; metadataWrites = 0;
}
function selected(payload, ids) { return B.inspectBackupLists(payload).filter(e => ids.includes(e.id)).map(e => e.key); }
function verifyUntouched() { assert.equal(kv.get('kizilkan.theme'), 'dark'); assert.equal(kv.get('kizilkan.activePlaylistId.p'), 'D'); assert.deepEqual(rows.get('A'), heavy('A')); assert.deepEqual(rows.get('D'), heavy('D')); assert.equal([...rows.keys()].some(id => id.startsWith('__kzb_')), false); }
function v3Text(payload) {
  const records = [{ magic: 'KIZILKAN_BACKUP_V3', version: 3, metadata: payload }];
  for (const id of payload.playlists.profiles['backup-profile'].playlistIds) records.push({ type: 'playlist-start', playlistId: id }, { type: 'chunk', playlistId: id, kind: 'live', items: heavy(id).channels }, { type: 'playlist-end', playlistId: id });
  records.push({ type: 'end', playlists: payload.playlists.profiles['backup-profile'].playlistIds.length, items: payload.playlists.profiles['backup-profile'].playlistIds.length });
  return records.map(r => JSON.stringify(r)).join('\n') + '\n';
}
(async () => {
  let pass = 0;
  reset(); let incoming = fixture();
  let result = await B.restoreSelectedBackup(incoming, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p' });
  assert.equal(result.playlists, 1); assert.equal(result.heavyPlaylists, 1); assert.equal(rows.has('B'), true); assert.equal(rows.has('C'), false); verifyUntouched();
  let restored = JSON.parse(kv.get('kizilkan.playlists.meta.p')).find(x => x.id === 'B'); assert.equal(restored.channelsCount, 1); assert.equal(restored.vodCount, 0); assert.equal(restored.catalogLocalState, 'ready'); pass++;
  reset(); incoming = fixture(['B'], false); result = await B.restoreSelectedBackup(incoming, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p' });
  assert.equal(result.heavyPlaylists, 0); assert.equal(rows.has('B'), false); restored = JSON.parse(kv.get('kizilkan.playlists.meta.p')).find(x => x.id === 'B'); assert.equal(restored.channelsCount, 0); assert.equal(restored.catalogExpectedCounts.channels, 999); assert.equal(restored.catalogLocalState, 'missing'); verifyUntouched(); pass++;
  for (const failure of ['stage', 'meta', 'finalize']) {
    reset(); incoming = fixture(); const before = kv.get('kizilkan.playlists.meta.p'); failStage = failure === 'stage'; failMetaOnce = failure === 'meta'; failFinalize = failure === 'finalize';
    await assert.rejects(() => B.restoreSelectedBackup(incoming, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p' }));
    assert.equal(kv.get('kizilkan.playlists.meta.p'), before); assert.equal(rows.has('B'), false); verifyUntouched(); pass++;
  }
  reset(); incoming = fixture(); const abort = new AbortController(); abort.abort();
  await assert.rejects(() => B.restoreSelectedBackup(incoming, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p', signal: abort.signal })); assert.equal(rows.has('B'), false); verifyUntouched(); pass++;
  reset(); incoming = fixture(); files.set('file://backup.kzb', v3Text(incoming));
  const preview = await V3.previewFullBackupV3({ uri: 'file://backup.kzb' }); assert.equal(B.inspectBackupLists(preview).length, 2); assert.equal(rows.size, 2);
  result = await V3.restoreFullBackupV3({ uri: 'file://backup.kzb' }, { selectedKeys: selected(preview, ['B']), targetProfileId: 'p' });
  assert.equal(result.playlists, 1); assert.equal(rows.has('B'), true); assert.equal(rows.has('C'), false); verifyUntouched(); pass++;
  reset(); incoming = fixture(); files.set('file://broken.kzb', v3Text(incoming).replace(/\{"type":"end"[^\n]+\n$/, ''));
  await assert.rejects(() => V3.restoreFullBackupV3({ uri: 'file://broken.kzb' }, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p' })); assert.equal(rows.has('B'), false); verifyUntouched(); pass++;
  reset(); incoming = fixture(); core.available = false; failMetaOnce = true;
  await assert.rejects(() => B.restoreSelectedBackup(incoming, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p' })); assert.equal(rows.has('B'), false); verifyUntouched(); pass++;
  // Simulated process death after Room swap; only persisted journal survives.
  reset(); const before = kv.get('kizilkan.playlists.meta.p'); rows.set('__kzb_stage_crash_B', heavy('B'));
  const mappings = [{ targetId: 'B', stageId: '__kzb_stage_crash_B' }]; await core.applyAtomicPlaylistRestore('crash', mappings);
  kv.set('kizilkan.playlists.meta.p', 'half-written'); kv.set('kizilkan.backup.restoreJournal.v1', JSON.stringify({ version: 1, sessionId: 'crash', native: true, phase: 'applying', mappings, legacyOld: [], before: { 'kizilkan.playlists.meta.p': before }, after: { 'kizilkan.playlists.meta.p': 'new' } }));
  assert.equal(await Tx.recoverPendingPlaylistRestore(), true); assert.equal(kv.get('kizilkan.playlists.meta.p'), before); assert.equal(rows.has('B'), false); verifyUntouched(); pass++;
  reset(); rows.set('__kzb_stage_done_B', heavy('B')); const doneMappings = [{ targetId: 'B', stageId: '__kzb_stage_done_B' }]; await core.applyAtomicPlaylistRestore('done', doneMappings); await core.finalizeAtomicPlaylistRestore('done', ['B']);
  kv.set('kizilkan.backup.restoreJournal.v1', JSON.stringify({ version: 1, sessionId: 'done', native: true, phase: 'applying', mappings: doneMappings, legacyOld: [], before: { 'kizilkan.restore-test': 'old' }, after: { 'kizilkan.restore-test': 'new' } }));
  await Tx.recoverPendingPlaylistRestore(); assert.equal(kv.get('kizilkan.restore-test'), 'new'); assert.equal(rows.has('B'), true); verifyUntouched(); pass++;
  // Explicit whole-device restore keeps replacement semantics, but all writes
  // now use the same durable journal as selected restore.
  reset(); incoming = fixture(['B']); result = await B.restoreBackup(incoming);
  assert.equal(result.heavyPlaylists, 1); assert.equal(rows.has('A'), false); assert.equal(rows.has('D'), false); assert.equal(rows.has('B'), true);
  assert.equal(kv.get('kizilkan.theme'), 'light'); assert.equal(kv.has('kizilkan.playlists.meta.p'), false);
  assert.equal(JSON.parse(kv.get('kizilkan.playlists.meta.backup-profile'))[0].channelsCount, 1); assert.equal(kv.has('kizilkan.backup.restoreJournal.v1'), false); pass++;
  for (const native of [true, false]) {
    reset(); core.available = native; incoming = fixture(['B']); const saved = Object.fromEntries(kv); failMetaOnce = true; failMetaKey = 'kizilkan.playlists.meta.backup-profile';
    await assert.rejects(() => B.restoreBackup(incoming)); assert.deepEqual(Object.fromEntries(kv), saved);
    assert.deepEqual(rows.get('A'), heavy('A')); assert.deepEqual(rows.get('D'), heavy('D')); assert.equal(rows.has('B'), false); assert.equal([...rows.keys()].some(id => id.startsWith('__kzb_')), false); pass++;
  }
  reset(); incoming = fixture(['B']); files.set('file://device.kzb', v3Text(incoming)); result = await V3.restoreFullBackupV3({ uri: 'file://device.kzb' });
  assert.equal(result.heavyPlaylists, 1); assert.equal(rows.has('A'), false); assert.equal(rows.has('D'), false); assert.equal(rows.has('B'), true); assert.equal(JSON.parse(kv.get('kizilkan.playlists.meta.backup-profile'))[0].channelsCount, 1); pass++;
  reset(); incoming = fixture(['B']); files.set('file://device-failed.kzb', v3Text(incoming)); const saved = Object.fromEntries(kv); failFinalize = true;
  await assert.rejects(() => V3.restoreFullBackupV3({ uri: 'file://device-failed.kzb' })); assert.deepEqual(Object.fromEntries(kv), saved); assert.equal(rows.has('B'), false); verifyUntouched(); pass++;
  reset(); incoming = fixture(['B'], false); result = await B.restoreBackupMetadata(incoming);
  assert.equal(result.heavyPlaylists, 0); assert.equal(rows.size, 0); restored = JSON.parse(kv.get('kizilkan.playlists.meta.backup-profile'))[0]; assert.equal(restored.channelsCount, 0); assert.equal(restored.catalogExpectedCounts.channels, 999); assert.equal(restored.catalogLocalState, 'missing'); pass++;
  reset(); const oldMeta = kv.get('kizilkan.playlists.meta.p'); const personal = { appName: 'KIZILKAN PLAYER ELITE', version: '2.1', data: { 'kizilkan.theme': 'light', 'kizilkan.progress.p': '{"video":{"positionMs":5}}' } };
  result = await B.restoreBackupMetadata(personal); assert.equal(kv.get('kizilkan.playlists.meta.p'), oldMeta); assert.deepEqual(rows.get('A'), heavy('A')); assert.deepEqual(rows.get('D'), heavy('D')); assert.equal(kv.get('kizilkan.theme'), 'light'); assert.equal(kv.get('kizilkan.progress.p'), personal.data['kizilkan.progress.p']); pass++;
  reset(); incoming = fixture(['B']); incoming.playlists.heavy.B = { channels: [], vod: [], series: [] };
  result = await B.restoreSelectedBackup(incoming, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p' }); restored = JSON.parse(kv.get('kizilkan.playlists.meta.p')).find(x => x.id === 'B');
  assert.equal(result.heavyPlaylists, 1); assert.equal(restored.channelsCount, 0); assert.equal(restored.catalogLocalState, 'empty'); assert.equal(restored.catalogRecovery.state, 'ready'); verifyUntouched(); pass++;
  reset(); incoming = fixture(['B']); kv.set('kizilkan.profiles', JSON.stringify([{ id: 'p', name: 'Ben', hasPin: true }]));
  await assert.rejects(() => B.restoreSelectedBackup(incoming, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p' }), /PIN/); assert.equal(rows.has('B'), false); verifyUntouched(); pass++;
  reset(); incoming = fixture(['B']); failLegacyCleanupOnce = true;
  await assert.rejects(() => B.restoreSelectedBackup(incoming, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p' }), /Eski katalog/);
  assert.equal(rows.has('B'), true); assert.equal(JSON.parse(kv.get('kizilkan.playlists.meta.p')).some(x => x.id === 'B'), true); assert.equal(kv.has('kizilkan.backup.restoreJournal.v1'), false); verifyUntouched(); pass++;
  reset(); incoming = fixture(['B']); incoming.playlists.profiles['backup-profile'].metadata = JSON.stringify([{ ...list('B'), notes: 'x'.repeat(1600000) }]);
  await assert.rejects(() => B.restoreSelectedBackup(incoming, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p' }), /güvenlik kaydı çok büyük/);
  assert.equal(rows.has('B'), false); assert.equal(kv.has('kizilkan.backup.restoreJournal.v1'), false); verifyUntouched(); pass++;
  // Snapshot and transactional restore must preserve falsy primitive settings exactly.
  reset(); kv.set('kizilkan.profileSetupDone', false); kv.set('kizilkan.tv.preview', false);
  kv.set('kizilkan.player.audioDelay', 0); kv.set('kizilkan.player.autoNext.p', false);
  const primitiveSnapshot = await B.createBackupMetadata('personal');
  for (const key of ['kizilkan.profileSetupDone', 'kizilkan.tv.preview', 'kizilkan.player.autoNext.p']) assert.equal(primitiveSnapshot.data[key], false);
  assert.equal(primitiveSnapshot.data['kizilkan.player.audioDelay'], 0);
  kv.set('kizilkan.profileSetupDone', true); kv.set('kizilkan.tv.preview', true); kv.set('kizilkan.player.autoNext.p', true); kv.set('kizilkan.player.audioDelay', 250);
  await B.restoreBackupMetadata(primitiveSnapshot);
  for (const key of ['kizilkan.profileSetupDone', 'kizilkan.tv.preview', 'kizilkan.player.autoNext.p']) assert.equal(kv.get(key), false);
  assert.equal(kv.get('kizilkan.player.audioDelay'), 0); verifyUntouched(); pass++;
  // Critical read failures stop both selected and full restore before any catalog staging/write.
  for (const mode of ['selected', 'full', 'metadata']) for (const failure of ['io', 'type', 'inner-json', 'inner-shape']) {
    reset(); incoming = fixture(['B']);
    if (failure === 'io') failReadKey = 'kizilkan.profiles';
    if (failure === 'type') kv.set('kizilkan.profiles', false);
    if (failure === 'inner-json') kv.set('kizilkan.profiles', '{broken-sensitive-source');
    if (failure === 'inner-shape') kv.set('kizilkan.profiles', '{}');
    const beforeRead = Object.fromEntries(kv), rowsBefore = copy(Object.fromEntries(rows));
    const restore = mode === 'selected' ? () => B.restoreSelectedBackup(incoming, { selectedKeys: selected(incoming, ['B']), targetProfileId: 'p' })
      : mode === 'full' ? () => B.restoreBackup(incoming) : () => B.restoreBackupMetadata(incoming);
    await assert.rejects(restore); assert.deepEqual(Object.fromEntries(kv), beforeRead);
    assert.deepEqual(Object.fromEntries(rows), rowsBefore); assert.equal(stageWrites, 0); assert.equal(metadataWrites, 0);
    assert.equal(chunks.size, 0); assert.equal(kv.has('kizilkan.backup.restoreJournal.v1'), false); pass++;
  }
  // The persisted transaction log must reject JSON-valid wrong shapes before touching live data.
  const journalKey = 'kizilkan.backup.restoreJournal.v1';
  const validJournal = { version: 1, sessionId: 'fixture-valid', native: false, phase: 'applying', mappings: [], legacyOld: [],
    before: { 'kizilkan.profiles': '[]' }, after: { 'kizilkan.profiles': '[]' } };
  for (const invalid of [
    { before: { 'kizilkan.profiles': { broken: true } } }, { after: { 'kizilkan.profiles': [] } },
    { before: [] }, { native: 'false' }, { phase: 'unknown' }, { sessionId: 12 },
    { mappings: [{}] }, { legacyOld: {} },
  ]) {
    reset(); const raw = JSON.stringify({ ...validJournal, ...invalid }); kv.set(journalKey, raw);
    const original = Object.fromEntries(kv), originalRows = copy(Object.fromEntries(rows));
    await assert.rejects(() => Tx.recoverPendingPlaylistRestore());
    assert.deepEqual(Object.fromEntries(kv), original); assert.deepEqual(Object.fromEntries(rows), originalRows);
    assert.equal(kv.get(journalKey), raw); assert.equal(metadataWrites, 0); assert.equal(stageWrites, 0); pass++;
  }
  // Crash recovery and a checked rollback preserve boolean false / numeric zero in the journal.
  for (const native of [false, true]) for (const phase of ['applying', 'finalized']) {
    reset(); kv.set('kizilkan.tv.preview', true); kv.set('kizilkan.player.audioDelay', 250);
    const falsy = { 'kizilkan.tv.preview': false, 'kizilkan.player.audioDelay': 0 };
    kv.set(journalKey, JSON.stringify({ ...validJournal, native, phase, before: falsy, after: falsy }));
    await Tx.recoverPendingPlaylistRestore(); assert.equal(kv.get('kizilkan.tv.preview'), false);
    assert.equal(kv.get('kizilkan.player.audioDelay'), 0); assert.equal(kv.has(journalKey), false); pass++;
  }
  reset(); kv.set('kizilkan.tv.preview', false); kv.set('kizilkan.player.audioDelay', 0);
  failMetaOnce = true; failMetaKey = 'kizilkan.player.audioDelay';
  await assert.rejects(() => Tx.commitBackupRestoreTransaction('primitive-rollback', [], () => ({ 'kizilkan.tv.preview': true, 'kizilkan.player.audioDelay': 250 }), async () => {}));
  assert.equal(kv.get('kizilkan.tv.preview'), false); assert.equal(kv.get('kizilkan.player.audioDelay'), 0); assert.equal(kv.has(journalKey), false); pass++;
  for (const invalidProfiles of [false, '{broken-incoming', '{}', JSON.stringify([{ id: 3, name: 'Invalid' }])]) {
    reset(); incoming = fixture(['B']); incoming.data['kizilkan.profiles'] = invalidProfiles;
    const original = Object.fromEntries(kv), originalRows = copy(Object.fromEntries(rows));
    await assert.rejects(() => B.restoreBackup(incoming));
    assert.deepEqual(Object.fromEntries(kv), original); assert.deepEqual(Object.fromEntries(rows), originalRows);
    assert.equal(metadataWrites, 0); assert.equal(stageWrites, 0); pass++;
  }
  console.log(`PASS: Yedek akışı: ${pass} grup geçti (seçmeli/cihaz JSON, .kzb, kişisel/hızlı, gerçek sayılar, boş katalog, rollback, iptal, süreç ölümü).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
