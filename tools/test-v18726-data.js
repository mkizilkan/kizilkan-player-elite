#!/usr/bin/env node
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('./_ts'), root = path.resolve(__dirname, '..', 'frontend');
const cache = new Map(), disk = new Map(); let auth = 1; const calls = [];
const fetchFixture = async value => {
  const url = new URL(value); calls.push(url.searchParams.get('action') || 'login');
  const action = url.searchParams.get('action');
  const data = !action ? { user_info: { auth } } : action === 'get_vod_streams' ? [{ stream_id: 72, name: 'Fixture film', container_extension: 'mp4' }] : action === 'get_series' ? [{ series_id: 73, name: 'Fixture series' }] : action.endsWith('_categories') ? [] : [{ stream_id: 71 }, { stream_id: 'bad' }];
  return { ok: true, status:200,headers:{get:()=>null},text: async () => JSON.stringify(data) };
};
function load(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const exports = {}; cache.set(rel, exports);
  let src = fs.readFileSync(path.join(root, rel), 'utf8');
  if (rel === 'src/utils/stalker.ts') src += '\nexport const __cacheForTest = streamDerivedCreds; export const __scopeForTest = streamCredentialScope;';
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = { '@/src/utils/diagnostics': { markTask: () => () => {}, startDiagnosticTask: () => () => {}, recordDiagnostic: async () => {} },
    '@/modules/kizilkan-native-core': { KizilkanNativeCore: { available: false } },
    '@/src/utils/storage': { storage: { getItem: async (k, fallback) => disk.get(k) ?? fallback, setItem: async (k, v) => { disk.set(k, v); return true; } } } };
  vm.runInNewContext(js, { exports, require: id => mocks[id] || load(id.startsWith('@/') ? id.slice(2) + '.ts' : path.join(path.dirname(rel), id + '.ts')), URL, URLSearchParams, AbortController, setTimeout, clearTimeout, fetch: fetchFixture, console }, { filename: rel });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
(async () => {
  let groups = 0;
  const { createScanResultReader } = load('src/utils/scanResultReader.ts');
  const records = Array.from({ length: 7340 }, (_, i) => ({ id: i + 1 }));
  const nativePage = async (runId, cursor, limit) => { const matches = records.filter(r => r.id > cursor).slice(0, limit); return { runId, matches, nextCursor: matches.at(-1)?.id || cursor, hasMore: matches.at(-1)?.id < records.length, total: records.length }; };
  const read = createScanResultReader(nativePage); const delivered = new Set();
  await read('run', true, rows => rows.forEach(r => delivered.add(r.id)));
  assert.equal(delivered.size, 7340); groups++;
  // Progress snapshot remains 200 wide; rows added after it fills must still arrive.
  records.push(...Array.from({ length: 255 }, (_, i) => ({ id: 7341 + i })));
  await read('run', true, rows => rows.forEach(r => delivered.add(r.id)));
  assert.equal(delivered.size, 7595); groups++;
  const retry = createScanResultReader(nativePage); let seenCursor = -1;
  await assert.rejects(retry('retry', false, async () => { throw Error('UI delivery failed'); }), /UI delivery/);
  await retry('retry', false, rows => { seenCursor = rows[0].id; }); assert.equal(seenCursor, 1); groups++;
  const bad = createScanResultReader(async runId => ({ runId, matches: [], nextCursor: 0, hasMore: true, total: 1 }));
  await assert.rejects(bad('bad', true, () => {}), /cursor/); groups++;
  const endpoints = load('src/utils/playlistEndpoints.ts');
  const pl = { id: 'one', source: 'stalker', stalkerPortal: 'http://PORTAL.example:8080/a/portal.php', stalkerBackupPortals: ['http://portal.example:8080/b/portal.php'], endpoints: [] };
  assert.equal(endpoints.playlistEndpoints(pl).length, 2);
  assert.equal(endpoints.canonicalEndpointUrl('http://portal.example:8080/a/portal.php'), 'http://portal.example:8080/a/portal.php');
  assert.equal(endpoints.canonicalEndpointUrl('http://portal.example/a?token=secret'), '');
  assert.match(endpoints.endpointProofLabel({ accountVerifiedAt: new Date().toISOString() }), /ilk kare sınanmadı/); groups++;
  const archive = load('src/utils/accountArchive.ts');
  const hosts = ['http://dns.example:8080', 'https://second.example:8443'];
  const proofs = hosts.map((url, i) => ({ url, kind: 'xtream', primary: i === 0, source: 'manual', ...(i ? { firstFrameAt: '2026-10-08T12:00:00Z' } : { accountVerifiedAt: '2026-10-08T12:00:00Z' }) }));
  const text = archive.buildKizilkanAccountArchive([{ username: 'fixture', password: 'fixture', server: hosts[0], validatedHosts: hosts, endpoints: proofs }]);
  const restored = archive.parseKizilkanAccountArchive(text).accounts[0];
  assert.deepEqual(plain(restored.validatedHosts), hosts); assert.deepEqual(plain(restored.endpoints), proofs); groups++;
  const stalker = load('src/utils/stalker.ts'), mac = '00:1A:79:00:00:01';
  const a = 'http://portal.example:8080/a/portal.php', b = 'http://portal.example:8080/b/portal.php';
  stalker.__cacheForTest.set(mac, { username: 'legacy-unsafe', password: 'fixture' });
  stalker.__cacheForTest.set(stalker.__scopeForTest(mac, a, 'A'), { username: 'fixture', password: 'secret', server: 'http://dns.example', at: Date.now() });
  assert.equal(stalker.getStreamDerivedCredentials(mac, b, 'A'), null);
  assert.equal(stalker.getStreamDerivedCredentials(mac, a, 'B'), null);
  assert.equal(stalker.getStreamDerivedCredentials(mac, a.replace(':8080', ':8081'), 'A'), null);
  assert.equal(stalker.getStreamDerivedCredentials(mac, a, 'A').username, 'fixture'); groups++;
  const cred = { mac, portal: a, profileId: 'A' };
  const direct = await stalker.stalkerResolveStream(cred, null, 'xtream-verified:http://dns.example/movie/fixture/secret/71.mp4');
  assert.equal(direct.session, null); assert.equal(direct.url, 'http://dns.example/movie/fixture/secret/71.mp4');
  await assert.rejects(stalker.stalkerResolveStream(cred, null, 'xtream-verified:http://other.example/movie/fixture/secret/71.mp4'), /eşleşmedi/);
  await assert.rejects(stalker.stalkerResolveStream(cred, null, 'xtream-verified:http://dns.example/movie/wrong/secret/71.mp4'), /eşleşmedi/); groups++;
  const api = load('src/utils/iptv.ts'); calls.length = 0;
  assert.equal(await api.xtreamLiveCatalogProbe({ server: 'http://dns.example', username: 'fixture', password: 'secret' }), 1);
  assert.deepEqual(calls, ['get_live_streams']);
  auth = 0; await assert.rejects(api.xtreamLiveSample({ server: 'http://dns.example', username: 'fixture', password: 'secret' }), /hatalı|doğrulanamadı/); groups++;
  auth = 1; calls.length = 0;
  const enriched = await stalker.stalkerEnrichment(cred, { endpoint: a, token: 'fixture' });
  assert.equal(enriched.vod[0].stream_id, '72');
  assert.equal(enriched.vod[0].url, 'xtream-verified:http://dns.example/movie/fixture/secret/72.mp4');
  assert.equal(enriched.series[0].series_id, '73');
  assert.equal(enriched.series[0].catalogBackend, 'xtream-verified');
  for (const action of ['login', 'get_live_streams', 'get_vod_streams', 'get_series']) assert.ok(calls.includes(action)); groups++;
  const lease = load('src/player/playbackProbeLease.ts');
  assert.equal(lease.playbackProbeActive(), false);
  await assert.rejects(lease.acquirePlaybackProbe(), /hazır değil/);
  let finishRelease; const mainStopped = new Promise(resolve => { finishRelease = resolve; });
  const unregister = lease.registerPlaybackRelease(() => mainStopped);
  const pendingProbe = lease.acquirePlaybackProbe();
  assert.equal(lease.playbackProbeActive(), true);
  await assert.rejects(lease.acquirePlaybackProbe(), /Başka/);
  finishRelease(); const release = await pendingProbe; release();
  assert.equal(lease.playbackProbeActive(), false); unregister(); groups++;
  console.log(`PASS: v18.7.26 — ${groups} davranış grubu: 7340+255 sonuç, teslim retry, cursor, DNS/yol, TXT proof roundtrip, profil izolasyonu, doğrulanmış API/mapping ve hafif probe.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
