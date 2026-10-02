#!/usr/bin/env node
/** Real native/web Storage and StorageBase; only the platform AsyncStorage boundary is mocked. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..', 'frontend', 'src', 'utils', 'storage');
function harness(platform) {
  const disk = new Map(), writes = [], logs = [];
  const state = { failRead: false };
  const backend = {
    getItem: async key => { if (state.failRead) throw new Error('fixture-private-password-and-url'); return disk.has(key) ? disk.get(key) : null; },
    setItem: async (key, raw) => { writes.push({ key, raw }); disk.set(key, raw); },
    removeItem: async key => { disk.delete(key); },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require(id) {
      if (id === './storage-base') return load('storage-base.ts');
      if (id === '@react-native-async-storage/async-storage') return { default: backend };
      if (id === 'expo-secure-store') return { getItemAsync: backend.getItem, setItemAsync: backend.setItem, deleteItemAsync: backend.removeItem };
      throw new Error(`Unexpected module ${id}`);
    }, console: { warn: (...args) => logs.push(args) }, Number, JSON }, { filename: file });
    return exports;
  }
  return { storage: load(platform === 'native' ? 'index.ts' : 'index.web.ts').storage, disk, writes, logs, state };
}
let groups = 0;
(async () => {
  for (const platform of ['native', 'web']) {
    const h = harness(platform), s = h.storage, key = 'fixture-private-key';
    for (const fallback of ['', 0, false, null]) assert.equal(await s.getItemStrict(key, fallback), fallback);
    for (const value of ['Türkçe \"JSON\" 🔐', '', 0, -2.5, false, true, null]) {
      assert.equal(await s.setItem(key, value), true);
      assert.equal(await s.getItemStrict(key, null), value);
      if (value !== null) assert.equal(await s.getItemStrict(key, value), value);
    }
    groups++;
    for (const [raw, fallback] of [
      ['{fixture-private-password', ''], ['{}', null], ['[]', null], ['"text"', 0], ['false', ''],
      ['0', false], ['null', ''], ['null', 0], ['null', false], ['1e400', null], [undefined, null],
    ]) {
      h.disk.set(key, raw); const count = h.logs.length;
      await assert.rejects(() => s.getItemStrict(key, fallback), error => {
        assert.equal(/fixture-private/.test(String(error)), false);
        return /Yerel kayıt/.test(String(error));
      });
      assert.equal(h.logs.length, count, 'strict reads must not log keys, raw payload or platform errors');
    }
    h.state.failRead = true;
    await assert.rejects(() => s.getItemStrict(key, ''), error => !/fixture-private/.test(String(error)) && /okunamadı/.test(String(error)));
    assert.equal(h.logs.length, 0); h.state.failRead = false; groups++;
    // Legacy callers retain fallback/error handling and permissive parsed-value behavior.
    h.disk.set(key, '{broken'); assert.equal(await s.getItem(key, 'legacy'), 'legacy');
    h.state.failRead = true; assert.equal(await s.getItem(key, 'legacy'), 'legacy'); h.state.failRead = false;
    h.disk.set(key, 'false'); assert.equal(await s.getItem(key, ''), false); groups++;
    // Reproduce the provider read-then-write failure: rejected critical reads cannot overwrite source.
    const producer = async () => { const before = await s.getItemStrict(key, ''); return s.setItem(key, before || '[]'); };
    for (const failure of ['outer-json', 'platform-io', 'type']) {
      const original = failure === 'type' ? '{}' : '{broken-sensitive-source';
      h.disk.set(key, original); h.state.failRead = failure === 'platform-io'; const count = h.writes.length;
      await assert.rejects(producer); assert.equal(h.disk.get(key), original); assert.equal(h.writes.length, count);
      h.state.failRead = false;
    }
    h.disk.delete(key); assert.equal(await producer(), true); assert.equal(h.disk.get(key), '"[]"');
    h.disk.set(key, '"[{\\"id\\":\\"existing\\"}]"'); assert.equal(await producer(), true);
    assert.equal(await s.getItemStrict(key, ''), '[{"id":"existing"}]'); groups++;
  }
  console.log(`PASS: Strict storage native/web — ${groups} groups (primitive/missing, corrupt/type/I/O, legacy compatibility, source preservation).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
