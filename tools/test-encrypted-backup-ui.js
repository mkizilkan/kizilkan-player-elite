#!/usr/bin/env node
/** Execute the actual backup screen and crypto wrapper with mocked UI/native/filesystem I/O. Native cryptography has its own JVM suite. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('./_ts'), root = path.resolve(__dirname, '..', 'frontend');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const copy = value => JSON.parse(JSON.stringify(value));
const payload = { appName: 'KIZILKAN PLAYER ELITE', version: '2.1', summary: { profiles: 1, playlists: 2 }, lists: ['a', 'b'].map(key => ({ key, name: key, profileId: 'A', profileName: 'A', source: 'xtream', channels: 1, vod: 0, series: 0 })) };
function harness(options = {}) {
  const files = new Map(), modified = new Map(), deleted = [], shares = [], clipboard = [], cryptoCalls = [], cancellations = [], restores = [], alerts = [], imports = new Map(), cache = new Map();
  const state = { picker: { uri: 'file:///cache/picked.kzbe', name: 'picked.kzbe' }, pickerGate: null, cryptoGate: null, shareAvailable: true, shareFail: false, cryptoFail: false, cryptoFalse: false, decryptKind: options.full ? 'full' : 'json', restoreFail: false, beginGate: null, authCalls: 0, uploadCalls: 0, releases: 0, reloads: 0, fullExports: 0, previews: 0, fetches: 0, postUnmountWrites: 0, metadataScopes: [], profile: 'A' };
  const slots = [], effects = []; let cursor = 0, dirty = false, mounted = true, tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: initial => { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { if (!mounted) state.postUnmountWrites++; const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
    useRef: initial => { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useMemo: (work, deps) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: work() }; return slots[i].value; },
    useEffect: (work, deps) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = work(); }); } },
  };
  const native = {
    available: options.native !== false,
    cancelBackupCrypto: id => cancellations.push(id),
    encryptBackupFile: async (input, output, password, id) => { cryptoCalls.push({ kind: 'encrypt', input, output, password, id }); if (state.cryptoGate) { const gate = state.cryptoGate; state.cryptoGate = null; await gate.promise; } files.set(output, 'encrypted-ciphertext'); if (state.cryptoFail) throw new Error('native fixture failed'); return { ok: !state.cryptoFalse, uri: output }; },
    decryptBackupFile: async (input, output, password, id) => { cryptoCalls.push({ kind: 'decrypt', input, output, password, id }); if (state.cryptoGate) { const gate = state.cryptoGate; state.cryptoGate = null; await gate.promise; } files.set(output, JSON.stringify(payload)); if (state.cryptoFail) throw new Error('Parola yanlış veya şifreli yedek bozuk'); return { ok: !state.cryptoFalse, uri: output, kind: state.decryptKind }; },
  };
  const FileSystem = { cacheDirectory: 'file:///cache/', writeAsStringAsync: async (uri, text) => files.set(uri, text), readDirectoryAsync: async () => [...files.keys()].filter(uri => uri.startsWith('file:///cache/') && !uri.slice(14).includes('/')).map(uri => uri.slice(14)), getInfoAsync: async uri => ({ exists: files.has(uri), isDirectory: false, modificationTime: modified.get(uri) ?? Date.now() / 1000 }), deleteAsync: async uri => { deleted.push(uri); files.delete(uri); } };
  const result = { profiles: 1, playlists: 1, heavyPlaylists: 1, warnings: [] };
  const restore = async (kind, incoming, config) => { restores.push({ kind, incoming, config }); if (state.restoreFail) throw new Error('fixture restore failure'); return result; };
  Object.assign(imports, {
    react: { ...React, default: React },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'ScrollView', ActivityIndicator: 'Spinner', Modal: 'Modal', FlatList: 'FlatList', TextInput: 'Input', StyleSheet: { create: value => value }, Platform: { OS: options.web ? 'web' : 'android' }, Alert: { alert: (...args) => alerts.push(args) } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, 'expo-router': { useRouter: () => ({ back() {} }) }, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-document-picker': { getDocumentAsync: async () => { if (state.pickerGate) { const gate = state.pickerGate; state.pickerGate = null; await gate.promise; } return { canceled: false, assets: [state.picker] }; } },
    'expo-sharing': { isAvailableAsync: async () => state.shareAvailable, shareAsync: async (uri, config) => { shares.push({ uri, config }); if (state.shareFail) throw new Error('share fixture failure'); if (uri.endsWith('.kzbe')) assert.equal(files.has(cryptoCalls.at(-1).input), false, 'plaintext source is removed before opening the share chooser'); } },
    'expo-file-system/legacy': FileSystem, 'expo-clipboard': { setStringAsync: async value => clipboard.push(value) },
    '@/src/theme/ThemeContext': { useTheme: () => ({ colors: { surface: 'white', surfaceSecondary: 'grey', border: 'grey', brandPrimary: 'red', onSurface: 'black', onSurfaceSecondary: 'grey', onSurfaceTertiary: 'grey', onBrandPrimary: 'white', success: 'green', error: 'red' } }) },
    '@/src/theme/themes': { SPACING: { sm: 8, md: 12, lg: 16 }, RADIUS: { md: 8, pill: 99 }, FONT: { size: { sm: 12, base: 14, lg: 18 }, weight: { bold: 'bold' } } },
    '@/src/components/FocusButton': { FocusButton: 'Button' }, '@/modules/kizilkan-native-core': { KizilkanNativeCore: native },
    '@/src/store/ProfileContext': { useProfiles: () => ({ profiles: [{ id: 'A', name: 'A' }], activeProfile: { id: state.profile } }) },
    '@/src/store/PlaylistContext': { usePlaylists: () => ({ beginExternalRestore: async () => { if (state.beginGate) { const gate = state.beginGate; state.beginGate = null; await gate.promise; } return () => state.releases++; }, reloadAfterRestore: async () => state.reloads++ }) },
    '@/src/utils/backup': { createBackupMetadata: async scope => { state.metadataScopes.push(scope); return payload; }, restoreBackup: (p, c) => restore('legacy', p, c), restoreBackupMetadata: (p, c) => restore('device', p, c), restoreSelectedBackup: (p, c) => restore('selected', p, c), inspectBackupLists: p => p.lists || [], isKizilkanBackup: p => p.appName === payload.appName },
    '@/src/utils/backupV3': { exportFullBackupV3: async () => { state.fullExports++; const uri = 'file:///cache/full.kzb'; files.set(uri, 'streamed full catalogue'); return { uri, playlists: 2, items: 99, bytes: 999 }; }, restoreFullBackupV3: (p, c) => restore('full', p, c), previewFullBackupV3: async () => { state.previews++; return payload; }, isFullBackupV3Name: name => /\.kzb$/i.test(name || '') },
    '@/src/utils/googleDrive': { isGoogleDriveConfigured: () => true, authenticateGoogleDrive: async () => { state.authCalls++; return { accessToken: 'fixture' }; }, uploadJsonToDrive: async (_token, name, data, signal) => { state.uploadCalls++; assert.equal(signal.aborted, false); assert.ok(data.includes(payload.appName)); return { name }; } },
  });
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const exports = {}; cache.set(relative, exports);
    const source = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    vm.runInNewContext(source, { exports, require: id => Object.hasOwn(imports, id) ? imports[id] : id.startsWith('@/') ? load(id.slice(2) + '.ts') : require(id), Promise, Date, Math, URL, Set, Map, JSON, Object, Array, AbortController,
      fetch: async uri => { state.fetches++; return { text: async () => files.get(uri) || JSON.stringify(payload) }; } }, { filename: relative });
    return exports;
  }
  const Component = load('app/backup.tsx').default;
  function render() { cursor = 0; dirty = false; tree = Component(); while (effects.length) effects.shift()(); return tree; }
  function node(id, value = tree) { if (!value || typeof value !== 'object') return null; if (Array.isArray(value)) { for (const child of value) { const hit = node(id, child); if (hit) return hit; } return null; } if (value.props?.testID === id) return value; return node(id, value.children); }
  async function flush() { for (let i = 0; i < 80; i++) { await Promise.resolve(); if (dirty && mounted) render(); } }
  function press(id) { const found = node(id); assert.ok(found, id + ' exists'); return found.props.onPress(); }
  function change(id, value) { const found = node(id); assert.ok(found, id + ' exists'); found.props.onChangeText(value); render(); }
  render();
  return { state, files, modified, deleted, shares, clipboard, cryptoCalls, cancellations, restores, alerts, native, node, press, change, render, flush, load, unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); } };
}
let groups = 0;
async function wrapperOwnershipAndCancellation() {
  const h = harness(), crypto = h.load('src/utils/encryptedBackup.ts');
  await assert.rejects(crypto.encryptBackupFile('file:///cache/input.json', 'short'), /8 karakter/); assert.equal(h.cryptoCalls.length, 0);
  const pre = new AbortController(); pre.abort(); await assert.rejects(crypto.decryptBackupFile('file:///cache/in.kzbe', 'password', pre.signal), /durduruldu/); assert.equal(h.cryptoCalls.length, 0);
  const done = new AbortController(), uri = await crypto.encryptBackupFile('file:///cache/input.json', 'password', done.signal);
  const call = h.cryptoCalls[0]; assert.ok(uri.endsWith('.kzbe')); assert.match(call.id, /^[a-zA-Z0-9_-]{1,100}$/); done.abort(); assert.equal(h.cancellations.length, 0, 'successful operation removes abort listener');
  const gate = deferred(), abort = new AbortController(); h.state.cryptoGate = gate;
  const pending = crypto.decryptBackupFile('file:///cache/input.kzbe', 'password', abort.signal); abort.abort(); assert.equal(h.cancellations[0], h.cryptoCalls.at(-1).id); gate.resolve(); await assert.rejects(pending, /durduruldu/); assert.equal(h.files.has(h.cryptoCalls.at(-1).output), false);
  h.state.cryptoFalse = true; await assert.rejects(crypto.encryptBackupFile('file:///cache/input.json', 'password'), /oluşturulamadı/); assert.equal(h.files.has(h.cryptoCalls.at(-1).output), false); h.state.cryptoFalse = false;
  h.state.decryptKind = 'unknown'; await assert.rejects(crypto.decryptBackupFile('file:///cache/input.kzbe', 'password'), /tanınmadı/); assert.equal(h.files.has(h.cryptoCalls.at(-1).output), false);
  const before = h.deleted.length; await crypto.removeTemporaryBackup('file:///cache/../private/secret.json'); await crypto.removeTemporaryBackup('file:///cache/%2e%2e%2fprivate/secret.json'); await crypto.removeTemporaryBackup('file:///cache-sibling/private.json'); await crypto.removeTemporaryBackup('content://provider/cache/private'); assert.equal(h.deleted.length, before);
  h.unmount(); groups++;
}
async function allExportScopesEncryptAndCleanup() {
  for (const scope of ['quick', 'personal', 'full']) {
    const h = harness(); if (scope !== 'quick') { h.press('backup-scope-' + scope); h.render(); } h.change('backup-export-password', 'fixture-password'); await h.press('do-export-btn'); await h.flush();
    assert.equal(h.cryptoCalls.length, 1); assert.equal(h.cryptoCalls[0].kind, 'encrypt'); assert.ok(h.shares[0].uri.endsWith('.kzbe')); assert.equal(h.shares[0].config.mimeType, 'application/octet-stream'); assert.equal(h.clipboard.length, 0); assert.equal(h.files.size, 1); assert.equal(h.files.has(h.shares[0].uri), true, 'shared encrypted file remains available to the receiver');
    assert.equal(h.state.fullExports, scope === 'full' ? 1 : 0); assert.deepEqual(h.state.metadataScopes, scope === 'full' ? [] : [scope]); assert.equal(h.node('backup-export-password').props.value, ''); h.unmount(); await h.flush(); assert.equal(h.files.has(h.shares[0].uri), true);
  }
  groups++;
}
async function noPlaintextFallbackOrDriveLeak() {
  const h = harness(); h.state.shareAvailable = false; h.change('backup-export-password', 'fixture-password'); await h.press('do-export-btn'); await h.flush();
  assert.equal(h.clipboard.length, 0); assert.equal(h.shares.length, 0); assert.equal(h.files.size, 0); assert.equal(h.node('drive-upload-btn').props.disabled, true);
  await h.press('drive-upload-btn'); await h.flush(); assert.equal(h.state.authCalls, 0); assert.equal(h.state.uploadCalls, 0);
  h.press('backup-encryption-off'); h.render(); await h.press('do-export-btn'); await h.flush(); assert.equal(h.clipboard.length, 1);
  await h.press('drive-upload-btn'); await h.flush(); assert.equal(h.state.uploadCalls, 1); h.unmount();
  const unavailable = harness({ native: false }); await unavailable.press('do-export-btn'); await unavailable.flush(); assert.equal(unavailable.state.metadataScopes.length, 0); assert.equal(unavailable.clipboard.length, 0); unavailable.press('backup-encryption-off'); unavailable.render(); await unavailable.press('do-export-btn'); await unavailable.flush(); assert.equal(unavailable.shares.length, 1); unavailable.unmount(); groups++;
}
async function sharedExportRetentionTtlAndShareFailure() {
  const h = harness(), crypto = h.load('src/utils/encryptedBackup.ts'), now = Date.now();
  const old = ['backup-export-1-old.kzbe', 'kizilkan-player-elite-export-quick-1-old.json', 'kizilkan-player-elite-full-2026-01-01T00-00-00-000Z.kzb'];
  const retained = ['private.json', 'backup-restore-1-old.restore', 'backup-export-2-fresh.kzbe'];
  for (const name of [...old, ...retained]) { const uri = 'file:///cache/' + name; h.files.set(uri, 'fixture'); h.modified.set(uri, (now - 25 * 60 * 60 * 1000) / 1000); }
  h.modified.set('file:///cache/backup-export-2-fresh.kzbe', now / 1000); await crypto.cleanupExpiredBackupExports(undefined, now);
  old.forEach(name => assert.equal(h.files.has('file:///cache/' + name), false, name)); retained.forEach(name => assert.equal(h.files.has('file:///cache/' + name), true, name)); h.unmount();
  const fail = harness(); fail.state.shareFail = true; fail.change('backup-export-password', 'fixture-password'); await fail.press('do-export-btn'); await fail.flush(); assert.equal(fail.files.size, 0); assert.equal(fail.clipboard.length, 0); fail.unmount();
  const plain = harness(); plain.press('backup-encryption-off'); plain.render(); await plain.press('do-export-btn'); await plain.flush(); assert.equal(plain.files.has(plain.shares[0].uri), true); plain.unmount(); await plain.flush(); assert.equal(plain.files.has(plain.shares[0].uri), true); groups++;
}
async function encryptedImportPasswordSelectionAndCleanup() {
  const h = harness(); await h.press('do-import-btn'); await h.flush(); assert.equal(h.state.fetches, 0); assert.equal(h.cryptoCalls.length, 0); assert.equal(h.node('backup-password-close')?.props.disabled, false);
  h.state.cryptoFail = true; h.change('backup-import-password', 'wrong-password'); await h.press('backup-unlock-encrypted'); await h.flush(); assert.equal(h.restores.length, 0); assert.equal(h.state.fetches, 0); assert.equal(h.files.size, 0); assert.equal(h.node('backup-import-password').props.value, '');
  h.state.cryptoFail = false; h.change('backup-import-password', 'fixture-password'); await h.press('backup-unlock-encrypted'); await h.flush(); const plain = h.cryptoCalls.at(-1).output; assert.equal(h.files.has(plain), true); assert.equal(h.node('backup-import-password').props.value, '');
  h.press('backup-import-selected'); h.render(); h.press('backup-select-none'); h.render();
  const flat = (() => { const visit = value => { if (!value || typeof value !== 'object') return null; if (Array.isArray(value)) { for (const child of value) { const hit = visit(child); if (hit) return hit; } return null; } if (value.type === 'FlatList') return value; return visit(value.children); }; return visit(h.render()); })();
  flat.props.renderItem({ item: payload.lists[1] }).props.onPress(); h.render(); await h.press('backup-apply-selected'); await h.flush();
  assert.deepEqual(copy(h.restores[0].config.selectedKeys), ['b']); assert.equal(h.restores[0].config.authorizedProfileId, 'A'); assert.equal(h.state.releases, 1); assert.equal(h.state.reloads, 1); assert.equal(h.files.has(plain), false); assert.ok(h.deleted.includes(h.state.picker.uri)); h.unmount();
  const full = harness({ full: true }); await full.press('do-import-btn'); await full.flush(); full.change('backup-import-password', 'fixture-password'); await full.press('backup-unlock-encrypted'); await full.flush(); assert.equal(full.state.previews, 1); await full.press('backup-apply-selected'); await full.flush(); assert.equal(full.restores[0].kind, 'full'); assert.equal(full.files.size, 0); full.unmount(); groups++;
}
async function closeFailureAndLateUnmountCleanup() {
  for (const mode of ['close', 'failure']) {
    const h = harness(); await h.press('do-import-btn'); await h.flush(); h.change('backup-import-password', 'fixture-password'); await h.press('backup-unlock-encrypted'); await h.flush(); const plain = h.cryptoCalls.at(-1).output;
    if (mode === 'close') { h.press('backup-preview-close'); await h.flush(); } else { h.state.restoreFail = true; await h.press('backup-apply-selected'); await h.flush(); assert.equal(h.state.reloads, 1); assert.equal(h.state.releases, 1); }
    assert.equal(h.files.has(plain), false); h.unmount();
  }
  const h = harness(), gate = deferred(); await h.press('do-import-btn'); await h.flush(); h.change('backup-import-password', 'fixture-password'); h.state.cryptoGate = gate;
  const decrypting = h.press('backup-unlock-encrypted'); await h.flush(); h.unmount(); gate.resolve(); await decrypting;
  assert.equal(h.state.fetches, 0); assert.equal(h.state.postUnmountWrites, 0); assert.equal(h.files.size, 0); assert.equal(h.cancellations[0], h.cryptoCalls[0].id);
  const pick = harness(), pickerGate = deferred(); pick.state.pickerGate = pickerGate; const picking = pick.press('do-import-btn'); await pick.flush(); pick.unmount(); pickerGate.resolve(); await picking; assert.equal(pick.state.postUnmountWrites, 0); assert.ok(pick.deleted.includes(pick.state.picker.uri));
  const exp = harness(), exportGate = deferred(); exp.change('backup-export-password', 'fixture-password'); exp.state.cryptoGate = exportGate; const exporting = exp.press('do-export-btn'); await exp.flush(); exp.unmount(); exportGate.resolve(); await exporting; assert.equal(exp.shares.length, 0); assert.equal(exp.clipboard.length, 0); assert.equal(exp.files.size, 0); assert.equal(exp.state.postUnmountWrites, 0); groups++;
}
(async () => {
  for (const test of [wrapperOwnershipAndCancellation, allExportScopesEncryptAndCleanup, noPlaintextFallbackOrDriveLeak, sharedExportRetentionTtlAndShareFailure, encryptedImportPasswordSelectionAndCleanup, closeFailureAndLateUnmountCleanup]) { await test(); console.log('PASS:', test.name); }
  console.log(`PASS: Şifreli yedek ekranı / native iş sahipliği / geçici dosya temizliği — ${groups} davranış grubu.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
