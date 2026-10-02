#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'frontend')] }));
const moduleObject = { exports: {} };
const file = 'frontend/src/utils/backupSelection.ts';
const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(source, { exports: moduleObject.exports, module: moduleObject, require: name => { throw new Error(`Saf model dış bağımlılık içeriyor: ${name}`); }, Map, Set, JSON, Date, Math, Number, String, Array }, { filename: file });
const M = moduleObject.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const list = (id, overrides = {}) => ({ id, name: id, source: 'xtream', xtreamServer: `https://${id}.test`, channelsCount: 10, ...overrides });
function payload(profiles) {
  const data = { 'kizilkan.profiles': JSON.stringify(Object.keys(profiles).map(id => ({ id, name: id }))) };
  const bundles = {};
  for (const [id, lists] of Object.entries(profiles)) {
    data[`kizilkan.playlists.meta.${id}`] = JSON.stringify(lists);
    bundles[id] = { metadata: JSON.stringify(lists), playlistIds: lists.map(x => x.id) };
  }
  return { appName: 'KIZILKAN PLAYER ELITE', version: '2.1', data, playlists: { profiles: bundles, heavy: {} } };
}
let pass = 0;
const current = payload({ p: [list('A'), list('D')], other: [list('Z')] });
current.data['kizilkan.activePlaylistId.p'] = 'D';
const incoming = payload({ old: [list('B'), list('C')] });
const entries = M.inspectBackupLists(incoming);
{
  const plan = M.planSelectedRestore(incoming, [entries[0].key], current, 'p', 'test');
  assert.deepEqual(plain(plan.metadata.map(x => x.id)), ['A', 'D', 'B']);
  assert.equal(plan.activeId, 'D');
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].sourceId, 'B');
  assert.equal(current.playlists.profiles.other.metadata, JSON.stringify([list('Z')]));
  pass++;
}
{
  const plan = M.planSelectedRestore(incoming, entries.map(x => x.key), current, 'p', 'test');
  assert.deepEqual(plain(plan.metadata.map(x => x.id)), ['A', 'D', 'B', 'C']);
  assert.equal(plan.items.length, 2); pass++;
}
{
  const collision = payload({ p: [list('B', { xtreamServer: 'https://different.test' })] });
  const plan = M.planSelectedRestore(incoming, [entries[0].key], collision, 'p', 's');
  assert.equal(plan.items[0].targetId, 'restored-s-1');
  assert.equal(plan.metadata[0].xtreamServer, 'https://different.test'); pass++;
}
{
  const shared = payload({ p: [list('B')], other: [list('B')] });
  assert.equal(M.planSelectedRestore(incoming, [entries[0].key], shared, 'p', 's').items[0].targetId, 'restored-s-1');
  assert.equal(M.planSelectedRestore(incoming, [entries[0].key], payload({ p: [list('B')] }), 'p', 's').items[0].targetId, 'B'); pass++;
}
{
  assert.throws(() => M.planSelectedRestore(incoming, [], current, 'p', 's'));
  assert.throws(() => M.planSelectedRestore(incoming, ['unknown'], current, 'p', 's'));
  assert.throws(() => M.planSelectedRestore(incoming, [entries[0].key], current, 'missing', 's'));
  const broken = payload({ p: [list('B')] }); broken.playlists.profiles.p.playlistIds = ['C'];
  assert.throws(() => M.inspectBackupLists(broken)); pass++;
}
{
  const legacy = { version: '1', data: { 'kizilkan.profiles': JSON.stringify([{ id: 'p', name: 'Ben' }]), 'kizilkan.playlists': JSON.stringify([list('L', { channels: [{ id: '1' }], vod: [], series: [] })]) } };
  const entry = M.inspectBackupLists(legacy)[0]; assert.equal(entry.profileId, 'p'); assert.equal(entry.metadata.channels, undefined);
  const personal = { version: '2.1', data: { 'kizilkan.profiles': JSON.stringify([{ id: 'p' }]) } };
  assert.equal(M.inspectBackupLists(personal).length, 0); pass++;
}
{
  const sharedBackup = payload({ p1: [list('B')], p2: [list('B')] });
  const options = M.inspectBackupLists(sharedBackup);
  assert.notEqual(options[0].key, options[1].key);
  const plan = M.planSelectedRestore(sharedBackup, options.map(x => x.key), current, 'p', 's');
  assert.equal(plan.items.length, 1);
  assert.equal(M.planSelectedRestore(incoming, [entries[0].key], current, 'p', 's', ['B']).items[0].targetId, 'restored-s-1'); pass++;
}
console.log(`PASS: Seçmeli yedek modeli: ${pass} grup geçti.`);
