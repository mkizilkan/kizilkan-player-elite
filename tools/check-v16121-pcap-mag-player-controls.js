#!/usr/bin/env node
/** KIZILKAN PLAYER v16.12.1 — PCAP MAG320 + ban-safe + player transition/controls HARD gate */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..');
const stalkerPath = path.join(root, 'frontend/src/utils/stalker.ts');
const playerPath = path.join(root, 'frontend/src/player/PlayerHost.tsx');
const stalker = fs.readFileSync(stalkerPath, 'utf8');
const player = fs.readFileSync(playerPath, 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(root, 'frontend/app.json'), 'utf8'));
const fail = (m) => { throw new Error(m); };
const must = (src, re, m) => { if (!re.test(src)) fail(m); };

function staticChecks() {
  // v16.13.0: sürüm SABİT kodlanmıştı; her yükseltmede kaçınılmaz kırılıyordu.
  // Amaç korunuyor: üçlü tutarlılık + en az 16.12.1.
  const _sv = v => { const m = String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/); return m ? Number(m[1])*1000000+Number(m[2])*1000+Number(m[3]) : -1; };
  const _code = v => { const m = String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/); return m ? Number(m[1])*10000+Number(m[2])*100+Number(m[3]) : -1; };
  if (_sv(pkg.version) < _sv('16.12.1') || app.expo?.version !== pkg.version || app.expo?.android?.versionCode !== _code(pkg.version)) fail('version contract');
  must(stalker, /pcap320-minimal/, 'MAG320 compatibility profile missing');
  must(stalker, /MAG320 stbapp ver: 2 rev: 250 Safari\/533\.3/, 'MAG320 PCAP user-agent missing');
  must(stalker, /Model: MAG320; Link: Ethernet/, 'MAG320 X-User-Agent missing');
  must(stalker, /timezone=Europe%2FParis/, 'PCAP timezone missing');
  must(stalker, /Accept: "application\/json"/, 'PCAP Accept header missing');
  must(stalker, /MAG320-pcap-minimal[\s\S]{0,180}type:"stb",action:"get_profile"[\s\S]{0,80}noJs:true/, 'minimal no-Js get_profile missing');
  // v16.13.0 SÖZLEŞME GÜNCELLEMESİ: PCAP profili artık PCAP SIRASINI kullanır.
  // Cihazdan alınan ÇALIŞAN istek: GET /portal.php?action=handshake&type=stb
  // v16.12.1'de HANDSHAKE_PARAM_VARIANTS[0] kullanılıyordu ve o varyantın sırası
  // "type=stb&action=handshake" idi — yani PCAP'e birebir uymuyordu. Artık
  // "pcap-order" varyantı önce, eski sıra yedek olarak denenir.
  must(stalker, /label: "pcap-order",\s*params: \{ action:"handshake", type:"stb" \}/, 'pcap-order handshake varyantı yok');
  must(stalker, /profile === "pcap320-minimal"\)[\s\S]{0,400}pcap-order/, 'PCAP profili pcap-order varyantını kullanmıyor');
  must(stalker, /HANDSHAKE_MAX_NETWORK_ATTEMPTS\s*=\s*8/, 'global handshake network budget missing');
  must(stalker, /HANDSHAKE_MAX_AUTH_REJECTS\s*=\s*4/, 'auth rejection governor missing');
  must(stalker, /HANDSHAKE_MIN_SPACING_MS\s*=\s*1_250/, 'strong request pacing missing');
  must(stalker, /HANDSHAKE_COOLDOWN_MS\s*=\s*5 \* 60_000/, '5-minute cooldown missing');
  must(stalker, /MAG_HANDSHAKE_GUARD_KEY/, 'persistent cooldown storage key missing');
  must(stalker, /handshakeInFlight\s*=\s*new Map/, 'same portal/MAC single-flight missing');
  must(stalker, /STALKER_HANDSHAKE_COOLDOWN/, 'cooldown telemetry missing');
  must(stalker, /rejectionFingerprints/, 'duplicate auth response governor missing');
  must(stalker, /normalizedOriginPort\(portal\) !== normalizedOriginPort\(target\)/, 'different-port sensitive credential boundary missing');
  must(stalker, /pcapDetachedMedia = ses\.compatProfile === "pcap320-minimal" && !trusted/, 'PCAP detached media header policy missing');
  must(player, /resolvedStalkerKey/, 'resolved Stalker ownership key missing');
  must(player, /resolvedStalkerKey === currentStalkerKey/, 'resolved URL ownership check missing');
  must(player, /activePlaylist\?\.source === "stalker"\s*\? \(resolvedForCurrentStalker \? resolvedUrl : null\)/, 'Stalker raw-url render gate missing');
  must(player, /setResolvedUrl\(null\);\s*setResolvedHeaders\(\{\}\);\s*setResolvedStalkerKey\(""\);\s*setResolving\(true\)/, 'old resolved URL not cleared before new resolve');
  must(player, /generation===stalkerResolveGenerationRef\.current/, 'stale async resolve generation guard missing');
  must(player, /key=\{`vv-\$\{effectiveSurface\}-\$\{activeSessionId\}`\}/, 'Media3 per-session surface remount regression');
  must(player, /resolvedMediaReadyForCurrentChannel/, 'native surface readiness gate missing');
  must(player, /v2ProfileReady && resolvedMediaReadyForCurrentChannel && !!playbackRequest\?\.url && v2Profile\.engine === "media3"/, 'Media3 old surface can remain during Stalker resolve');
  must(player, /v2ProfileReady && resolvedMediaReadyForCurrentChannel && !!playbackRequest\?\.url && useVLC/, 'VLC old surface can remain during Stalker resolve');
  must(player, /v2ProfileReady && resolvedMediaReadyForCurrentChannel && !!playbackRequest\?\.url && useMPV/, 'MPV old surface can remain during Stalker resolve');
  must(player, /uri=\{playbackRequest\?\.url \|\| playUrl \|\| ""\}/, 'VLC raw channel fallback still present');
  must(player, /const emergencyTouchActive/, 'emergency touch authority missing');
  must(player, /enabled\(visible && !isTv && !emergencyTouchActive\)/, 'gesture not disabled while emergency catcher owns touch');
  must(player, /Date\.now\(\) - lastControlsRevealAtRef\.current < 500/, 'double-toggle guard missing');
  must(player, /controlsHideGenerationRef/, 'stale hide timer generation guard missing');
  must(player, /generation !== controlsHideGenerationRef\.current/, 'stale hide callback guard missing');
}

function compileStalker() {
  const out = ts.transpileModule(stalker, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
    fileName: stalkerPath,
  });
  const errors = (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) fail('stalker transpile diagnostics: ' + errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(' | '));
  return out.outputText;
}

function response(body, status = 200, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? contentType : null },
    url: 'http://portal.test/portal.php',
    redirected: false,
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
  };
}

function load(fetchImpl) {
  const memory = new Map();
  const js = compileStalker();
  const req = (id) => {
    if (id === '@/src/utils/diagnostics') return { recordDiagnostic: async () => {}, markTask: () => () => {} };
    if (id === '@/src/utils/storage') return { storage: {
      getItem: async (k, fallback) => memory.has(k) ? memory.get(k) : fallback,
      setItem: async (k, v) => { memory.set(k, v); return true; },
      removeItem: async (k) => { memory.delete(k); return true; },
    }};
    if (id === 'expo-crypto') return { CryptoDigestAlgorithm: { MD5:'MD5', SHA1:'SHA1', SHA256:'SHA256' }, digestStringAsync: async (_a, v) => ('abc123' + v).padEnd(64, '0').slice(0,64) };
    return require(id);
  };
  const box = { module:{exports:{}}, exports:{}, require:req, console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, fetch:fetchImpl };
  box.exports = box.module.exports;
  vm.runInNewContext(js, box, { filename: 'stalker-v16121.js' });
  return { api: box.module.exports, memory };
}

async function fixturePcapExactFirst() {
  const seen = [];
  const { api } = load(async (url, opts = {}) => {
    const u = new URL(url); const action = u.searchParams.get('action');
    seen.push({ url, headers: opts.headers || {}, method: opts.method || 'GET' });
    if (action === 'handshake') return response({ js:{ token:'fixture-token', random:'r' } });
    if (action === 'get_profile') return response({ js:{ id:'1', mac:'00:11:22:33:44:55', stb_type:'MAG320' } });
    throw new Error('unexpected fixture request ' + url);
  });
  const cred = { portal:'http://portal.test:2095/c/', mac:'00:11:22:33:44:55', deviceModel:'MAG254' };
  const ses = await api.stalkerHandshake(cred);
  await api.stalkerProfile(cred, ses);
  if (seen.length !== 2) fail('PCAP fixture request count expected 2, got ' + seen.length);
  const hs = new URL(seen[0].url);
  if (hs.pathname !== '/portal.php' || hs.searchParams.get('action') !== 'handshake' || hs.searchParams.get('type') !== 'stb') fail('PCAP handshake path/query mismatch');
  if (hs.searchParams.has('JsHttpRequest') || hs.searchParams.has('token') || hs.searchParams.has('prehash')) fail('PCAP first handshake must be minimal/no-Js');
  const h = seen[0].headers;
  if (!/MAG320 stbapp ver: 2 rev: 250/.test(String(h['User-Agent'] || ''))) fail('PCAP UA mismatch');
  if (h['X-User-Agent'] !== 'Model: MAG320; Link: Ethernet') fail('PCAP X-UA mismatch');
  if (h.Accept !== 'application/json') fail('PCAP Accept mismatch');
  if (!String(h.Cookie || '').includes('timezone=Europe%2FParis')) fail('PCAP timezone mismatch');
  const gp = new URL(seen[1].url);
  if (gp.searchParams.get('action') !== 'get_profile' || gp.searchParams.get('type') !== 'stb' || gp.searchParams.has('JsHttpRequest')) fail('PCAP minimal get_profile mismatch');
  if (String(seen[1].headers.Authorization || '') !== 'Bearer fixture-token') fail('Bearer token not reused for get_profile');
  if (ses.compatProfile !== 'pcap320-minimal') fail('PCAP profile was not learned as active profile');
}

async function fixturePcapPlaybackHeaderBoundary() {
  const seen = [];
  const { api } = load(async (url, opts = {}) => {
    seen.push({ url, headers: opts.headers || {} });
    const u = new URL(url);
    if (u.searchParams.get('action') === 'create_link') {
      return response({ js:{ cmd:'ffmpeg http://portal.test:8080/live/fixture.ts?play_token=x' } });
    }
    throw new Error('unexpected playback fixture request ' + url);
  });
  const cred = { portal:'http://portal.test:2095/c/', mac:'00:11:22:33:44:55', deviceModel:'MAG254' };
  const ses = { token:'fixture-token', endpoint:'http://portal.test:2095/portal.php', compatProfile:'pcap320-minimal', handshakeVariant:'wire-nojs' };
  const ctx = await api.stalkerResolveStream(cred, ses, 'ffmpeg http://localhost/ch/fixture_');
  if (ctx.url !== 'http://portal.test:8080/live/fixture.ts?play_token=x') fail('resolved playback URL mismatch');
  const names = Object.keys(ctx.headers || {}).sort();
  if (names.length !== 1 || names[0] !== 'Accept') fail('detached PCAP media leaked MAG headers: ' + names.join(','));
  if (ctx.headers.Authorization || ctx.headers.Cookie || ctx.headers['User-Agent'] || ctx.headers['X-User-Agent'] || ctx.headers.Referer) fail('detached media leaked portal identity');
}

async function fixtureBanGovernorAndCooldown() {
  let calls = 0;
  const { api } = load(async () => { calls += 1; return response('Authorization failed.', 200, 'text/javascript;charset=UTF-8'); });
  const cred = { portal:'http://reject.test/c/', mac:'00:11:22:33:44:55', deviceModel:'MAG254' };
  let first = '';
  try { await api.stalkerHandshake(cred); } catch (e) { first = String(e?.message || e); }
  if (!first) fail('auth reject fixture unexpectedly succeeded');
  if (calls > 4) fail('ban governor exceeded 4 auth requests: ' + calls);
  const before = calls;
  let second = '';
  try { await api.stalkerHandshake(cred); } catch (e) { second = String(e?.message || e); }
  if (!/koruma bekleme süresi/i.test(second)) fail('second call did not hit cooldown: ' + second);
  if (calls !== before) fail('cooldown call touched network: before=' + before + ' after=' + calls);
}

(async () => {
  try {
    staticChecks();
    await fixturePcapExactFirst();
    await fixturePcapPlaybackHeaderBoundary();
    await fixtureBanGovernorAndCooldown();
    console.log('PASS: v16.12.1 PCAP MAG320 / ban-safe / stale-frame / controls contract TEMİZ');
  } catch (e) {
    console.error('FAIL: v16.12.1 HARD gate:', e?.stack || e);
    process.exit(1);
  }
})();
