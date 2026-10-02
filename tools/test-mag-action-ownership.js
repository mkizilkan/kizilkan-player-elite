#!/usr/bin/env node
/**
 * v18.7.4 — Çoklu MAC ekle/kaydet işlemi SAHİPLİĞİ (M174-12, ABA).
 * Gerçek `app/mag-bulk.tsx` içindeki addValid/saveFound callback GÖVDESİ çıkarılıp çalıştırılır
 * (assertion gevşetme / kod taklidi yok). Doğrulananlar:
 *  1) Sahip değilken (profil epoch değişmiş) addValid erken çıkar; busy set etmez, hesap eklemez.
 *  2) A→B→A: A işlemi sürerken profil/epoch B'ye geçerse eski A yeni işlemi ezmez; stale A hesap
 *     eklemeyi durdurur ve B'nin busy/abort/controller durumunu bozmaz.
 */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..', 'frontend');
const source = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const compile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const portal = 'http://portal.example.com:80/custom/portal.php';
const mac = index => `00:1A:79:00:00:${index.toString(16).padStart(2, '0').toUpperCase()}`;
const result = index => ({ hostRaw: portal, portal, mac: mac(index), hasPort: true, category: 'valid', status: 'Active', expiry: '2030-01-01', accountInfo: { username: 'owner', tariff_expired_date: '2030-01-01' }, protection: { state: 'not_observed' } });

// Callback gövdesini mag-bulk.tsx'ten çıkar ve verilen kapsamda çalıştır.
function uiAction(name, values, req) {
  const text = source('app/mag-bulk.tsx'); const ast = ts.createSourceFile('mag-bulk.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let arrow; (function walk(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) arrow = node.initializer.arguments[0]; ts.forEachChild(node, walk); })(ast);
  assert.ok(arrow, name + ' callback exists');
  const exports = {};
  vm.runInNewContext(compile('exports.action = ' + arrow.getText(ast)), { exports, require: req, console, AbortController, Date, ...values }, { filename: name + '.tsx' });
  return exports.action;
}

// stalker/native modüllerini dinamik import eden callback için req.
function makeReq(stalker) {
  const mocks = {
    '@/src/utils/stalker': stalker,
    '@/modules/kizilkan-native-core': { KizilkanNativeCore: { writePublicTextFile: async (_s, name) => ({ ok: true, uri: 'content://' + name, path: name }) } },
  };
  return id => Object.prototype.hasOwnProperty.call(mocks, id) ? mocks[id] : require(id);
}

const baseValues = (over = {}) => ({
  selectedValid: [result(1), result(2)], selectedResults: [result(1)], validResults: [result(1), result(2)], playlists: [],
  busyRef: { current: false }, mountedRef: { current: true }, profileRef: { current: 'A' }, actionAbortRef: { current: null },
  profileEpoch: 0, profileEpochRef: { current: 0 }, resetProfileEpochRef: { current: 0 }, actionRunRef: { current: 0 }, runRef: { current: 0 },
  setAdding() {}, setSaving() {}, setActionProgress() {}, useProxy: false,
  createMagRequestGate: () => ({}), magIdentity: (p, m) => `${p}|${m}`, stableId: (_p, id) => id,
  formatAccountExpiry: () => '2030', formatMagArchiveTxt: () => 'TXT',
  addPlaylist: async () => {}, updatePlaylist: async () => {}, enrichPlaylistMedia: async () => {},
  recordDiagnostic: async () => {}, router: { replace() {} }, Alert: { alert() {} }, ...over,
});

let groups = 0;

async function notOwnerEarlyReturn() {
  const added = [];
  const values = baseValues({
    profileEpoch: 0, profileEpochRef: { current: 1 },   // epoch değişmiş → sahip değil
    addPlaylist: async item => added.push(item),
  });
  const stalker = { stalkerLogin: async () => { throw new Error('login çağrılmamalı'); }, normalizeStalkerAccountInfo: p => p,
    stalkerCatalog: async () => ({ channels: [] }), stalkerEnrichment: async () => ({ vod: [], series: [] }),
    stalkerVerifyAccount: async () => ({ state: 'verified', accountInfo: {} }) };
  await uiAction('addValid', values, makeReq(stalker))();
  assert.equal(values.busyRef.current, false, 'sahip değilken busy set edilmemeli');
  assert.equal(added.length, 0, 'sahip değilken hesap eklenmemeli');
  groups++;
}

async function abaDoesNotClobber() {
  const added = [];
  // A işlemi: ilk stalkerLogin sırasında B devralsın (profil/epoch değişsin, yeni controller kurulsun).
  const values = baseValues({ addPlaylist: async item => added.push(item) });
  let takenOver = false;
  const stalker = {
    normalizeStalkerAccountInfo: p => p,
    stalkerCatalog: async () => ({ channels: [] }), stalkerEnrichment: async () => ({ vod: [], series: [] }),
    stalkerVerifyAccount: async () => ({ state: 'verified', accountInfo: { username: 'owner' } }),
    stalkerLogin: async () => {
      if (!takenOver) {
        takenOver = true;
        // B devralır: epoch artar, yeni controller ve yeni action set edilir (B'nin durumu).
        values.profileEpochRef.current++;
        values.actionRunRef.current++;
        const bController = { signal: { aborted: false }, abort() { this.signal.aborted = true; } };
        values.actionAbortRef.current = bController;
        values.__bController = bController;
      }
      return { session: { endpoint: portal, token: 't' }, profile: { status: 'Active' } };
    },
  };
  await uiAction('addValid', values, makeReq(stalker))();
  // Stale A, devralmadan sonra hesap eklemeyi sürdürmemeli (ownership guard).
  assert.equal(added.length, 0, 'stale A devralmadan sonra hesap eklememeli');
  // B'nin controller'ı A tarafından iptal edilmemeli / değiştirilmemeli.
  assert.ok(values.__bController && values.actionAbortRef.current === values.__bController, 'A, B controller\'ını ezmemeli');
  assert.equal(values.__bController.signal.aborted, false, 'A, B controller\'ını iptal etmemeli');
  groups++;
}

(async () => {
  try {
    await notOwnerEarlyReturn();
    await abaDoesNotClobber();
    console.log(`PASS: MAG işlem sahipliği/ABA — ${groups} davranış grubu (gerçek mag-bulk callback gövdesi)`);
  } catch (e) { console.error(e); process.exit(1); }
})();
