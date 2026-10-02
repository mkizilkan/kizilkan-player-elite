#!/usr/bin/env node
/** Actual PIN screen + actual central PIN code, mocked React/native I/O: input and async owner races. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function load(relative, imports) {
  const box = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, crypto: webcrypto, TextEncoder, Uint8Array,
    require: name => { assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`); return imports[name]; } }, { filename: relative });
  return box.exports;
}
function harness() {
  const state = { profile: 'A', profilePin: '', category: 'Locked', parentalPin: '012345', parentalLoading: false, profileLoading: false,
    parentalError: null, profileError: null, restore: false, gate: null };
  const calls = [], events = [], slots = [], effects = [];
  let cursor = 0, tree, dirty = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const i = cursor++; slots[i] ||= { value: initial }; return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
    useRef: initial => { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useEffect: (effect, deps) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const protection = load('frontend/src/utils/pinProtection.ts', { '@/modules/kizilkan-native-core': { KizilkanNativeCore: { available: false } } });
  const recovery = '0876543210';
  const pin = load('frontend/src/utils/pin.ts', {
    './pinProtection': protection, './storage': { storage: { getItem: async () => recovery, getItemStrict: async () => recovery } },
    './profileDataReload': { registerProfileDataDrain: () => () => {} }, './catalogOperations': { isCatalogRestoreActive: () => state.restore },
    'expo-crypto': {},
  });
  const colors = new Proxy({}, { get: () => '#000' });
  const numberTheme = new Proxy({}, { get: () => 8 });
  const imports = {
    react: { ...React, default: React },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput', StyleSheet: { create: x => x } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useRouter: () => ({ back: () => events.push({ type: 'back' }) }), useLocalSearchParams: () => ({ category: state.category }) },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, '@/src/theme/ThemeContext': { useTheme: () => ({ colors }) },
    '@/src/theme/themes': { SPACING: numberTheme, RADIUS: numberTheme, FONT: { size: numberTheme, weight: numberTheme } },
    '@/src/components/FocusButton': { FocusButton: 'FocusButton' }, '@/src/store/TvContext': { useTv: () => ({ isTv: true }) },
    '@/src/store/ProfileContext': { useProfiles: () => ({ activeProfile: { id: state.profile, pin: state.profilePin }, isLoading: state.profileLoading, loadError: state.profileError }) },
    '@/src/store/ParentalContext': { useParental: () => ({ settings: { pin: state.parentalPin, enabled: true }, isLoading: state.parentalLoading, loadError: state.parentalError,
      verifyPinAsync: async entered => { calls.push(entered); if (state.gate) { const gate = state.gate; return gate.promise; } return pin.isAccepted(await pin.checkPin(entered, state.parentalPin)); },
      unlockCategoryForSession: category => events.push({ type: 'unlock', category }),
    }) },
    '@/src/utils/pin': pin, '@/src/utils/catalogOperations': { isCatalogRestoreActive: () => state.restore },
  };
  const component = load('frontend/app/pin-entry.tsx', imports).default;
  function render() { cursor = 0; dirty = false; tree = component(); while (effects.length) effects.shift()(); return tree; }
  function nodes(value) { if (!value) return []; if (Array.isArray(value)) return value.flatMap(nodes); return typeof value === 'object' ? [value, ...nodes(value.props?.children)] : []; }
  function node(id) { const found = nodes(tree).find(x => x.props?.testID === id); assert.ok(found, `Node ${id} missing`); return found; }
  async function flush() { for (let i = 0; i < 20; i++) { await Promise.resolve(); if (dirty) render(); } }
  async function type(input) { node('parental-pin-input').props.onChangeText(input); await flush(); }
  render();
  return { state, calls, events, pin, recovery, render, node, flush, type, submit: () => node('pin-submit-btn').props.onPress(), unmount: () => slots.forEach(slot => slot?.cleanup?.()) };
}
let groups = 0;
async function inputAndCentralPinRoutes() {
  const h = harness(); await h.flush();
  await h.type('12a345678901234'); assert.equal(h.node('parental-pin-input').props.value, '1234567890');
  assert.equal(h.node('parental-pin-input').props.maxLength, h.pin.PIN_MAX_LENGTH); assert.equal(h.pin.PIN_MAX_LENGTH, 10);
  h.unmount();
  for (const kind of ['real', 'master', 'recovery']) {
    const current = harness(); await current.flush();
    const value = kind === 'master' ? current.pin.MASTER_PIN : kind === 'recovery' ? current.recovery : '012345';
    await current.type(value); assert.equal(current.node('parental-pin-input').props.value, value, 'PIN screen must preserve full shared-policy PIN length');
    await current.submit(); await current.flush();
    assert.deepEqual(current.events, [{ type: 'unlock', category: 'Locked' }, { type: 'back' }], kind + ' actual PIN route'); current.unmount();
  }
  groups++;
}
async function busyFailureAndRetry() {
  const h = harness(); await h.flush(); await h.type('012345'); h.state.gate = deferred();
  const handler = h.node('pin-submit-btn').props.onPress;
  const pending = handler(); await handler(); await h.flush(); assert.equal(h.calls.length, 1, 'double tap must not submit a second verification');
  assert.equal(h.node('pin-submit-btn').props.disabled, true); assert.equal(h.node('parental-pin-input').props.editable, false);
  h.state.gate.resolve(false); await pending; await h.flush(); assert.equal(h.node('parental-pin-error').props.children[0], 'Yanlış PIN');
  assert.equal(h.node('parental-pin-input').props.value, ''); assert.deepEqual(h.events, []);
  h.state.gate = deferred(); await h.type('012345'); const rejected = h.submit(); h.state.gate.reject(new Error('fixture verification failed')); await rejected; await h.flush();
  assert.match(h.node('parental-pin-error').props.children[0], /fixture verification failed/); assert.equal(h.node('pin-submit-btn').props.disabled, false);
  h.state.gate = null; await h.submit(); assert.deepEqual(h.events, [{ type: 'unlock', category: 'Locked' }, { type: 'back' }]); h.unmount(); groups++;
}
async function staleScopeAndReadiness() {
  const changes = [s => { s.profile = 'B'; }, s => { s.category = 'Other'; }, s => { s.parentalPin = '999999'; }, s => { s.profilePin = 'changed'; },
    s => { s.parentalLoading = true; }, s => { s.profileLoading = true; }, s => { s.parentalError = 'bad parental data'; }, s => { s.profileError = 'bad profile data'; }, s => { s.restore = true; }];
  for (const change of changes) {
    const h = harness(); await h.flush(); await h.type('012345'); h.state.gate = deferred(); const pending = h.submit();
    change(h.state); h.render(); await h.flush(); h.state.gate.resolve(true); await pending; await h.flush();
    assert.deepEqual(h.events, [], 'stale proof must not unlock or navigate'); h.unmount();
  }
  const h = harness(); await h.flush(); await h.type('012345'); h.state.gate = deferred(); const pending = h.submit(); h.unmount(); h.state.gate.resolve(true); await pending;
  assert.deepEqual(h.events, [], 'unmounted screen must not unlock or navigate'); groups++;
}
async function blockedEntryAndNewerAttempt() {
  for (const field of ['parentalLoading', 'profileLoading', 'parentalError', 'profileError', 'restore']) {
    const h = harness(); await h.flush(); h.state[field] = field.endsWith('Error') ? 'bad data' : true; h.render(); await h.flush(); await h.type('012345');
    assert.equal(h.node('pin-submit-btn').props.disabled, true); await h.submit(); assert.equal(h.calls.length, 0); assert.deepEqual(h.events, []);
    h.state[field] = field.endsWith('Error') ? null : false; h.render(); await h.flush(); await h.submit(); assert.equal(h.calls.length, 1); h.unmount();
  }
  const h = harness(); await h.flush(); await h.type('012345'); const old = deferred(); h.state.gate = old; const first = h.submit();
  h.state.profile = 'B'; h.state.category = 'Other'; h.render(); await h.flush(); await h.type('012345'); const next = deferred(); h.state.gate = next; const second = h.submit(); await h.flush();
  old.resolve(true); await first; await h.flush(); assert.deepEqual(h.events, []); assert.equal(h.node('pin-submit-btn').props.disabled, true, 'older finally must not release newer busy state');
  next.resolve(true); await second; await h.flush(); assert.deepEqual(h.events, [{ type: 'unlock', category: 'Other' }, { type: 'back' }]); h.unmount(); groups++;
}
(async () => {
  for (const test of [inputAndCentralPinRoutes, busyFailureAndRetry, staleScopeAndReadiness, blockedEntryAndNewerAttempt]) await test();
  console.log(`PASS: actual PIN entry screen + central PIN — ${groups} behavior groups (full PIN/master/recovery, busy/error/retry, async ownership, fail-closed readiness)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
