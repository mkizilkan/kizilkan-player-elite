#!/usr/bin/env node
/** Actual date/MAG modules; all HTTP/native/proxy replies are isolated fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('./_ts');
const frontend = path.resolve(__dirname, '..', 'frontend');
const endpoint = 'http://fixture.invalid:8080/custom/portal.php';
const mac = '00:1A:79:00:00:01';
const session = () => ({ endpoint, token: 'isolated-token', compatProfile: 'pcap320-minimal' });
const profile = () => ({ id: 17, login: 'fixture-account', mac, blocked: 0, expire_billing_date: '2030-01-01' });
const item = () => ({ id: 41, name: 'Fixture channel', cmd: 'ffmpeg http://localhost/ch/41_' });
const response = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: key => headers[key.toLowerCase()] || '' },
  text: async () => typeof body === 'string' ? body : JSON.stringify(body),
});
function environment(handler, options = {}) {
  const cache = new Map(), calls = [], diagnostics = [], stored = new Map();
  const route = async (url, headers, signal, transport, body = '') => {
    const u = new URL(url), params = body ? new URLSearchParams(body) : u.searchParams;
    const entry = { url, headers, signal, transport, type: params.get('type'), action: params.get('action'), page: params.get('p') };
    calls.push(entry); return handler(entry);
  };
  const mocks = {
    '@/src/utils/diagnostics': { recordDiagnostic: async (...args) => diagnostics.push(args), markTask: () => () => {} },
    '@/src/utils/storage': { storage: {
      getItem: async (key, fallback) => stored.get(key) ?? fallback,
      getItemStrict: async (key, fallback) => stored.get(key) ?? fallback,
      setItem: async (key, value) => { stored.set(key, value); return true; }, removeItem: async key => stored.delete(key),
    } },
    '@/modules/kizilkan-native-core': { KizilkanNativeCore: {
      available: !!options.native,
      magExactRequest: async (url, headers) => {
        const r = await route(url, headers, undefined, 'native');
        return { status: r.status, body: await r.text(), finalUrl: url };
      },
    } },
    '@/modules/panel-scan': { PanelScan: { proxiedRequest: async (url, _method, headers, body, _timeout, signal, maxBodyBytes) => {
      if (options.proxyBodyLimit) { calls.push({ transport: 'proxy', maxBodyBytes }); return { status: 0, body: '', error: 'BODY_LIMIT' }; }
      if (maxBodyBytes !== undefined) assert.equal(maxBodyBytes, 1048576);
      const r = await route(url, headers, signal, 'proxy', body);
      return { status: r.status, body: await r.text(), headers: { 'content-type': 'application/json' } };
    } } },
    'expo-crypto': { CryptoDigestAlgorithm: { MD5: 'md5', SHA1: 'sha1', SHA256: 'sha256' }, digestStringAsync: async (algorithm, value) => crypto.createHash(algorithm).update(value).digest('hex') },
    // v18.7.4: exact endpoint yolu Expo native fetch kullanır (manuel redirect / cookie-omit).
    // Harness bunu aynı route'a bağlar; transport 'native' olarak kaydedilir.
    'expo/fetch': { fetch: async (url, init = {}) => route(url, init.headers, init.signal, 'native', typeof init.body === 'string' ? init.body : '') },
  };
  function load(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const exports = {}; cache.set(rel, exports);
    const source = fs.readFileSync(path.join(frontend, rel), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, {
      exports, require: id => Object.prototype.hasOwnProperty.call(mocks, id) ? mocks[id] : id.startsWith('@/') ? load(id.slice(2) + '.ts') : require(id),
      console, URL, URLSearchParams, AbortController,
      setTimeout: options.setTimeout || setTimeout, clearTimeout,
      fetch: (url, init) => route(url, init.headers, init.signal, 'direct', init.body),
    }, { filename: rel });
    return exports;
  }
  return { load, calls, diagnostics };
}
const env = environment(() => { throw new Error('unexpected fixture request'); });
const dates = env.load('src/utils/accountExpiry.ts');
let groups = 0;
function dateContract() {
  for (const value of ['0002-01-01', '0002-01-01 00:00:00', '0000-00-00 00:00:00', '2', 2, '12345', 0, -1, Infinity, NaN, null, {}, [], true, 'never', 'unlimited', 'sınırsız', '2030-02-31', '2029-02-29', '2030-13-01', '01.13.2030', '2030-01-01T24:00:00Z', '2030-01-01T00:60:00Z', '2501-01-01', '1969-12-31', 'March 32, 2030', '2030-01-01junk']) {
    assert.equal(dates.parseAccountExpiryMs(value), null, String(value));
  }
  const valid = new Map([
    ['2030-01-01', Date.UTC(2030, 0, 1)], ['2030-01-01T03:00:00+03:00', Date.UTC(2030, 0, 1)],
    ['2030-01-01 01:30:45.12Z', Date.UTC(2030, 0, 1, 1, 30, 45, 120)],
    ['2030-01-01T00:00:00-0130', Date.UTC(2030, 0, 1, 1, 30)],
    ['01.01.2030', Date.UTC(2030, 0, 1)], ['1/1/2030', Date.UTC(2030, 0, 1)],
    ['2028-02-29', Date.UTC(2028, 1, 29)], ['2500-01-01', Date.UTC(2500, 0, 1)],
    ['1893456000', Date.UTC(2030, 0, 1)], [1893456000, Date.UTC(2030, 0, 1)], ['1893456000000', Date.UTC(2030, 0, 1)],
    ['January 1, 2030', Date.UTC(2030, 0, 1)], ['Jan 1 2030', Date.UTC(2030, 0, 1)],
  ]);
  for (const [value, expected] of valid) assert.equal(dates.parseAccountExpiryMs(value), expected, String(value));
  assert.equal(dates.parseAccountExpiryMs('01.01.2030 13:14:15'), new Date(2030, 0, 1, 13, 14, 15).getTime());
  assert.equal(dates.parseAccountExpiryMs('January 1, 2030 1:14 pm'), new Date(2030, 0, 1, 13, 14).getTime());
  // v18.7.7 (P1): "D Month YYYY [HH:MM:SS]" (cihaz: "11 May 2027 18:18:00") + Türkçe ay.
  assert.equal(dates.parseAccountExpiryMs('11 May 2027 18:18:00'), new Date(2027, 4, 11, 18, 18, 0).getTime());
  // Saatsiz tarihler UTC gün başı sayılır (modül sözleşmesi).
  assert.equal(dates.parseAccountExpiryMs('8 Ocak 2027'), Date.UTC(2027, 0, 8));
  assert.equal(dates.parseAccountExpiryMs('20 Ara 2026'), Date.UTC(2026, 11, 20));
  assert.equal(dates.parseAccountExpiryMs('January 8, 2027, 3:45 pm'), new Date(2027, 0, 8, 15, 45).getTime());
  assert.equal(dates.parseAccountExpiryMs('garbage month 2027'), null);
  assert.equal(dates.formatAccountExpiry({ tariff_expired_date: '0002-01-01' }), null);
  groups++;
}
function flagsAndExpiry() {
  const stalker = env.load('src/utils/stalker.ts');
  assert.equal(stalker.normalizeStalkerAccountInfo({ blocked: 0 }).status, undefined);
  for (const flag of [false, 0, 'false', '0', 'off']) assert.equal(stalker.normalizeStalkerAccountInfo({ active: flag, status: 'Active' }).status, 'inactive');
  for (const flag of [true, 1, 'true', '1', 'on']) assert.equal(stalker.normalizeStalkerAccountInfo({ blocked: flag, status: 'Active' }).status, 'blocked');
  assert.equal(stalker.normalizeStalkerAccountInfo({ authorized: false, status: 'Active' }).status, 'blocked');
  assert.equal(stalker.normalizeStalkerAccountInfo({ active: true }).status, 'Active');
  assert.equal(stalker.normalizeStalkerAccountInfo({ expired: true }).status, 'expired');
  assert.equal(stalker.normalizeStalkerAccountInfo({ end_date: '0002-01-01', phone: {} }).tariff_expired_date, null);
  assert.equal(stalker.normalizeStalkerAccountInfo({ expire_billing_date: '0002-01-01', end_date: '2030-01-01' }).tariff_expired_date, '2030-01-01');
  // v18.7.7 (P1): açık bitiş yoksa phone tarihi bitiş sayılır; phone alanı olarak GÖSTERİLMEZ.
  {
    const a = stalker.normalizeStalkerAccountInfo({ mac: '00:1A:79:30:3A:A7', phone: 'January 8, 2027, 3:45 pm' });
    assert.ok(a.tariff_expired_date && dates.parseAccountExpiryMs(a.tariff_expired_date) !== null, 'phone→bitiş olmalı');
    assert.equal(a.phone, undefined, 'bitiş olarak kullanılan phone gösterilmemeli');
    // Gerçek telefon (tarih değil) phone alanında kalır.
    assert.equal(stalker.normalizeStalkerAccountInfo({ phone: '+90 555 111 2233', end_date: '2030-01-01' }).phone, '+90 555 111 2233');
  }
  // v18.7.7 (P3): Stalker'da sayısal status 0 = AKTİF (eskiden "SÜRESİ DOLDU" sanılıyordu).
  assert.equal(stalker.normalizeStalkerAccountInfo({ status: 0, id: 7, login: 'x' }).status, 'Active');
  assert.equal(stalker.normalizeStalkerAccountInfo({ status: '0', id: 7 }).status, 'Active');
  assert.equal(stalker.normalizeStalkerAccountInfo({ status: 0, id: 7 }).status !== 'blocked', true);
  // v18.7.7 (P4): base64 MAC/login çözülür; password okunur.
  assert.equal(stalker.normalizeStalkerAccountInfo({ mac: 'MDA6MUE6Nzk6MzA6M0E6QTc=' }).mac, '00:1A:79:30:3A:A7');
  assert.equal(stalker.normalizeStalkerAccountInfo({ login: 'realuser', password: 's3cret' }).password, 's3cret');
  assert.equal(stalker.normalizeStalkerAccountInfo({ mac: '00:1A:79:30:3A:A7' }).mac, '00:1A:79:30:3A:A7');
  groups++;
}
async function invalidTokensAndProfileFallback() {
  for (const token of [{ bogus: true }, [], true, 1, '   ']) {
    const e = environment(() => response({ js: { token } }), { setTimeout: (fn, ms) => setTimeout(fn, ms < 2000 ? 0 : ms) });
    await assert.rejects(e.load('src/utils/stalker.ts').stalkerHandshake({ portal: endpoint, mac, deviceModel: 'MAG320', endpointPolicy: 'exact' }));
    assert.ok(e.calls.length > 0 && e.calls.every(c => c.action === 'handshake'));
  }
  for (const payload of [{ stb_type: 'MAG320' }, { id: 0 }, { blocked: 0 }, { name: 'Generic device' }]) {
    const e = environment(c => response(c.action === 'handshake' ? { js: { token: 'isolated-token' } } : c.action === 'get_profile' ? { js: payload } : c.action === 'get_all_channels' ? { js: [item()] } : { js: [] }));
    const stalker = e.load('src/utils/stalker.ts');
    const login = await stalker.stalkerLogin({ portal: endpoint, mac, deviceModel: 'MAG320', endpointPolicy: 'exact' });
    assert.equal(login.profile, null); assert.ok(login.session.profileError);
    const channels = await stalker.stalkerChannels({ portal: endpoint, mac }, login.session);
    assert.equal(channels.length, 1, 'normal player still permits a profile-unsupported catalogue');
  }
  groups++;
}
async function accountAndLiveProof() {
  const e = environment(c => response(c.action === 'get_main_info' ? { js: { login: 'fixture-account', end_date: '2030-01-01' } } : { js: { data: [item()], total_items: 200000 } }));
  const result = await e.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile());
  assert.equal(result.state, 'verified'); assert.equal(result.accessKind, 'live'); assert.equal(result.liveCount, 1); assert.equal(result.sampledItems, 1);
  assert.equal(e.calls.length, 2); assert.equal(e.calls[0].type, 'account_info'); assert.equal(e.calls[0].action, 'get_main_info');
  assert.equal(e.calls[1].page, '0');
  for (const c of e.calls) {
    const u = new URL(c.url); assert.equal(u.origin + u.pathname, endpoint);
    assert.ok(decodeURIComponent(c.headers.Cookie).includes(mac)); assert.equal(c.headers.Authorization, 'Bearer isolated-token');
    assert.ok(!['get_all_channels', 'create_link', 'handshake', 'get_profile'].includes(c.action));
  }
  assert.ok(e.diagnostics.filter(d => d[1] === 'STALKER_ACCOUNT_VERIFIED').every(d => !JSON.stringify(d[2]).includes(mac)));
  const fallback = environment(c => c.action === 'get_main_info' ? response('unsupported', 404) : response({ js: [item()] }));
  assert.equal((await fallback.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile())).state, 'verified');
  const mainOnly = environment(c => response(c.action === 'get_main_info' ? { js: { account_id: 18, login: 'fixture-account' } } : { js: [item()] }));
  assert.equal((await mainOnly.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), null)).state, 'verified');
  groups++;
}
async function unverifiedAndDenials() {
  for (const payload of [{ stb_type: 'MAG320' }, { id: 0 }, { id: -2 }, { id: 1.2 }, { id: 'true' }, { login: 'unknown' }, { blocked: 0 }, { mac }, { name: 'Generic device' }, null, {}, []]) {
    const e = environment(() => response({ js: payload }));
    const result = await e.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), payload);
    assert.equal(result.state, 'unverified', JSON.stringify(payload)); assert.equal(e.calls.length, 1);
  }
  for (const payload of [{ active: 0, status: 'Active' }, { active: 'false' }, { blocked: 'true' }, { auth: false }, { status: 'blocked' }, { error: 'Authorization failed.' }]) {
    const e = environment(() => response({ js: [item()] }));
    assert.equal((await e.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), { ...profile(), ...payload })).state, 'blocked');
    assert.equal(e.calls.length, 0);
  }
  for (const payload of [{ status: 'Expired' }, { expired: 'true' }, { expire_billing_date: '2020-01-01' }]) {
    const e = environment(() => response({ js: [item()] }));
    assert.equal((await e.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), { ...profile(), ...payload })).state, 'expired');
    assert.equal(e.calls.length, 0);
  }
  const bogusExpiry = environment(c => response(c.action === 'get_main_info' ? { js: {} } : { js: [item()] }));
  const good = await bogusExpiry.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), { id: 17, end_date: '0002-01-01' });
  assert.equal(good.state, 'verified'); assert.equal(good.accountInfo.tariff_expired_date, null);
  for (const value of ['00:1A:79:00:00:02', {}, 'garbage']) {
    const e = environment(() => response({ js: [item()] }));
    const result = await e.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), { ...profile(), mac: value });
    assert.equal(result.state, 'unverified'); assert.equal(e.calls.length, 0); assert.equal(result.accountInfo.username, undefined);
  }
  const mismatch = environment(() => response({ js: { ...profile(), mac: '00:1A:79:00:00:02' } }));
  assert.equal((await mismatch.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile())).state, 'unverified');
  assert.equal(mismatch.calls.length, 1);
  const merged = environment(c => response(c.action === 'get_main_info' ? { js: { login: '', phone: null, expire_billing_date: '0002-01-01' } } : { js: [item()] }));
  const kept = await merged.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), { ...profile(), phone: 'fixture-phone' });
  assert.equal(kept.state, 'verified'); assert.equal(kept.accountInfo.username, 'fixture-account'); assert.equal(kept.accountInfo.phone, 'fixture-phone'); assert.equal(kept.accountInfo.tariff_expired_date, '2030-01-01');
  groups++;
}
async function sampleKindsAndBounds() {
  for (const kind of ['live', 'vod', 'series']) {
    const type = kind === 'live' ? 'itv' : kind;
    const e = environment(c => response(c.action === 'get_main_info' ? { js: {} } : c.type === type && c.page === '1' ? { js: { data: [kind === 'series' ? { id: 19, name: 'Fixture series' } : item()] } } : { js: [] }));
    const result = await e.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile());
    assert.equal(result.state, 'verified'); assert.equal(result.accessKind, kind); assert.equal(result.liveCount, kind === 'live' ? 1 : 0);
    assert.ok(e.calls.length <= 7);
  }
  const malformed = [null, [], {}, { error: 'unauthorized' }, { id: 0, name: 'name', cmd: 'ffmpeg http://localhost/ch/0' }, { id: 2, name: 'name' }, { id: {}, name: 'name', cmd: 'http://localhost/ch/2' }, { id: 2, name: {}, cmd: 'http://localhost/ch/2' }, { id: 2, name: 'name', cmd: 'unauthorized' }, { id: 2, name: 'name', cmd: 'http://%' }, { id: 2, name: 'name', cmd: '//invalid' }];
  const empty = environment(c => response(c.action === 'get_main_info' ? { js: {} } : c.type === 'series' ? { js: { data: [] } } : { js: { data: malformed, total_items: 999999 } }));
  assert.equal((await empty.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile())).state, 'unverified');
  assert.equal(empty.calls.length, 7, 'no full-catalogue traversal despite declared huge total');
  const capped = environment(c => response(c.action === 'get_main_info' ? { js: {} } : { js: Array.from({ length: 200 }, item) }));
  assert.equal((await capped.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile())).sampledItems, 128);
  const oversized = environment(() => response({ js: { login: 'fixture-account', padding: 'ş'.repeat(530000) } }));
  const huge = await oversized.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile());
  assert.equal(huge.state, 'unverified'); assert.ok(huge.evidence.includes('response-size-limit')); assert.equal(oversized.calls.length, 1, 'UTF8 bytes, not just JS chars, limit the probe');
  groups++;
}
async function mainAndCatalogueDenial() {
  for (const payload of [{ auth: false }, { blocked: true }, { expired: true }, { end_date: '2020-01-01' }]) {
    const e = environment(() => response({ js: payload }));
    const result = await e.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile());
    assert.equal(result.state, payload.expired || payload.end_date ? 'expired' : 'blocked'); assert.equal(e.calls.length, 1);
  }
  for (const body of ['Authorization failed.', { js: { error: 'Access denied' } }]) {
    const e = environment(c => response(c.action === 'get_main_info' ? { js: {} } : body));
    assert.equal((await e.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile())).state, 'blocked');
    assert.equal(e.calls.length, 2);
  }
  const opaque = environment(() => response('<html>ordinary homepage</html>'));
  assert.equal((await opaque.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile())).state, 'unverified');
  assert.equal(opaque.calls.length, 7);
  groups++;
}
async function protectionCancellationAndDeadline() {
  for (const [body, status, headers, expected] of [
    ['<html>challenge</html>', 403, { 'cf-mitigated': 'challenge' }, 'MAG_PROTECTION'],
    ['<html><div class="g-recaptcha"></div></html>', 200, {}, 'MAG_PROTECTION'],
    ['', 429, { 'retry-after': '3' }, 'MAG_RATE_LIMIT'],
  ]) {
    const e = environment(() => response(body, status, headers));
    let gated = 0, rates = 0;
    const cred = { portal: endpoint, mac, requestScope: { transport: 'direct', beforeRequest: async () => gated++, onRateLimit: () => rates++ } };
    await assert.rejects(e.load('src/utils/stalker.ts').stalkerVerifyAccount(cred, session(), profile()), error => error.kind === expected);
    assert.equal(e.calls.length, 1); assert.equal(gated, 1); assert.equal(rates, expected === 'MAG_RATE_LIMIT' ? 1 : 0);
    await assert.rejects(e.load('src/utils/stalker.ts').stalkerVerifyAccount(cred, session(), profile()), error => error.kind === expected);
    assert.equal(e.calls.length, 1, 'terminal account scope never sends a second request');
  }
  const controller = new AbortController();
  const cancelled = environment(() => new Promise(() => {}));
  const pending = cancelled.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac, requestScope: { transport: 'direct', signal: controller.signal } }, session(), profile());
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, error => error.kind === 'CANCELLED'); assert.equal(cancelled.calls.length, 1);
  const separateScope = new AbortController(), separateOpts = new AbortController();
  const differentSignals = environment(() => new Promise(() => {}));
  const both = differentSignals.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac, requestScope: { transport: 'direct', signal: separateScope.signal } }, session(), profile(), { signal: separateOpts.signal });
  setTimeout(() => separateScope.abort(), 5);
  await assert.rejects(both, error => error.kind === 'CANCELLED'); assert.equal(differentSignals.calls.length, 1);
  const gateController = new AbortController();
  const waiting = environment(() => { throw new Error('gate must hold'); });
  const held = waiting.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac, requestScope: { transport: 'direct', signal: gateController.signal, beforeRequest: (_url, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { kind: 'CANCELLED' })))) } }, session(), profile());
  setTimeout(() => gateController.abort(), 5);
  await assert.rejects(held, error => error.kind === 'CANCELLED'); assert.equal(waiting.calls.length, 0);
  const deadline = environment(() => new Promise(() => {}), { setTimeout: (fn, ms) => setTimeout(fn, ms === 20000 ? 5 : ms) });
  const limited = await deadline.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, session(), profile());
  assert.equal(limited.state, 'unverified'); assert.ok(limited.evidence.includes('verification-time-budget')); assert.equal(deadline.calls.length, 1);
  groups++;
}
async function nativeProxyAndInputSafety() {
  for (const transport of ['native', 'proxy']) {
    const e = environment(c => response(c.action === 'get_main_info' ? { js: {} } : { js: [item()] }), { native: true });
    const cred = { portal: endpoint, mac, ...(transport === 'proxy' ? { requestScope: { transport: 'proxy' } } : {}) };
    assert.equal((await e.load('src/utils/stalker.ts').stalkerVerifyAccount(cred, session(), profile())).state, 'verified');
    assert.equal(e.calls.length, 2); assert.ok(e.calls.every(c => c.transport === transport));
  }
  for (const supplied of [{ mac: 'garbage' }, { token: {} }, { endpoint: 'javascript:invalid' }, { endpoint: endpoint + '?token=unexpected' }]) {
    const e = environment(() => { throw new Error('invalid inputs must not call transport'); });
    const result = await e.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac: supplied.mac ?? mac }, { ...session(), ...supplied }, profile());
    assert.equal(result.state, 'unverified'); assert.equal(e.calls.length, 0);
  }
  const moved = environment(() => { throw new Error('endpoint must stay selected'); });
  const different = await moved.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac }, { ...session(), endpoint: 'http://fixture.invalid:8080/different/portal.php' }, profile());
  assert.equal(different.state, 'unverified'); assert.ok(different.evidence.includes('session-endpoint-mismatch')); assert.equal(moved.calls.length, 0);
  const limitedProxy = environment(() => { throw new Error('bounded native response is already rejected'); }, { proxyBodyLimit: true });
  const rejected = await limitedProxy.load('src/utils/stalker.ts').stalkerVerifyAccount({ portal: endpoint, mac, requestScope: { transport: 'proxy' } }, session(), profile());
  assert.equal(rejected.state, 'unverified'); assert.ok(rejected.evidence.includes('response-size-limit')); assert.equal(limitedProxy.calls.length, 1); assert.equal(limitedProxy.calls[0].maxBodyBytes, 1048576);
  groups++;
}
(async () => {
  dateContract(); flagsAndExpiry();
  await invalidTokensAndProfileFallback(); await accountAndLiveProof(); await unverifiedAndDenials();
  await sampleKindsAndBounds(); await mainAndCatalogueDenial(); await protectionCancellationAndDeadline(); await nativeProxyAndInputSafety();
  console.log(`PASS MAG account validation: ${groups} actual-module behavior groups (date/calendar, token/profile, identity/access, denials, bounded samples, transport, terminal/cancel).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
