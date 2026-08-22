#!/usr/bin/env node
/**
 * GPT KIZILKAN PLAYER ELITE — PLAYER CORE HARD GATE (v15.2.0 RC1 NATIVE CORE PHASE 1)
 *
 * Bu denetleyici, gerçek cihazda yaşanmış kritik playback regresyonlarının
 * tekrar paketlenmesini engeller. Genel lint değildir; PlayerHost sözleşmesidir.
 */
const fs = require('fs');
const path = require('path');
const ts = require('./_ts');

const root = process.cwd();
const player = path.join(root, 'src/player/PlayerHost.tsx');
const controller = path.join(root, 'src/player/v2/controller.ts');
const health = path.join(root, 'src/player/v2/health.ts');
const prefs = path.join(root, 'src/player/v2/preferences.ts');
const appJson = path.join(root, 'app.json');
const mpvTs = path.join(root, 'modules/mpv-player/index.tsx');
const mpvView = path.join(root, 'modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvView.kt');
const mpvModule = path.join(root, 'modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvModule.kt');
const mpvGradle = path.join(root, 'modules/mpv-player/android/build.gradle');

let problems = 0;
function problem(msg) { console.log(`  PLAYER-CORE  ${msg}`); problems++; }
function requireText(text, needle, label) { if (!text.includes(needle)) problem(`eksik: ${label}`); }
function forbidText(text, needle, label) { if (text.includes(needle)) problem(`yasak kalıntı: ${label}`); }

for (const f of [player, controller, health, prefs, appJson, mpvTs, mpvView, mpvModule, mpvGradle]) {
  if (!fs.existsSync(f)) problem(`dosya yok: ${path.relative(root, f)}`);
}
if (problems) { console.log(`\n${problems} SORUN`); process.exit(1); }

const src = fs.readFileSync(player, 'utf8');
const ctrl = fs.readFileSync(controller, 'utf8');
const hlth = fs.readFileSync(health, 'utf8');
const pref = fs.readFileSync(prefs, 'utf8');
const app = JSON.parse(fs.readFileSync(appJson, 'utf8'));
const mpvJs = fs.readFileSync(mpvTs, 'utf8');
const mpvKt = fs.readFileSync(mpvView, 'utf8');
const mpvModKt = fs.readFileSync(mpvModule, 'utf8');
const mpvGradleSrc = fs.readFileSync(mpvGradle, 'utf8');

// v14.2 açılış crash'i: ref.current yazımı useRef tanımından önce OLMAMALI.
const refNames = ['isPlayingRef','isBufferingRef','showControlsRef','sheetRef'];
for (const name of refNames) {
  const decl = src.indexOf(`const ${name} = useRef`);
  const write = src.indexOf(`${name}.current =`);
  if (decl < 0) problem(`${name} useRef tanımı bulunamadı`);
  if (write < 0) problem(`${name}.current senkronizasyonu bulunamadı`);
  if (decl >= 0 && write >= 0 && write < decl) problem(`${name}.current useRef'ten önce yazılıyor`);
}

// v14.1/v14.2: snapshot timeout çalışan VLC'yi öldürmemeli.
forbidText(src, 'verifyVlcRenderedFrame', 'snapshot AUTO health');
forbidText(src, 'vlcHealthCheckRef', 'snapshot health promise ref');
forbidText(src, 'vlcSnapshotWaiterRef', 'snapshot waiter ref');
forbidText(src, 'VLC_VIDEO_HEALTH_TIMEOUT', 'VLC timed health watchdog');
forbidText(src, 'gerçek-kare doğrulaması başarısız', 'destructive snapshot failure');

// Player V2/V15 temel güvenlik sözleşmeleri.
requireText(src, 'PlaybackSessionGate', 'session izolasyonu');
requireText(src, 'activeProfileKeyRef', 'profile-generation izolasyonu');
requireText(src, 'onFirstFrameRender', 'Media3 gerçek first-frame');
requireText(src, 'markVlcHealthy', 'VLC non-destructive health');
requireText(src, 'vlcPlaybackIsAlive', 'VLC geç/spurious error koruması');
requireText(src, 'Runtime stall: ${profileKey} playback clock ilerlemedi; aynı profil restart', 'stall aynı-profile restart');
requireText(src, 'setPlaybackRetryNonce(n => n + 1)', 'temiz session restart');
requireText(src, 'playbackCandidates', 'Xtream alternatif URL zinciri');
requireText(src, 'lower.includes(".m3u8") ? "hls"', 'HLS explicit content type');
requireText(pref, 'PLAYER_BUFFER_PRESETS', 'Hızlı/Dengeli/Stabil buffer profilleri');
requireText(pref, 'PLAYER_BUFFER_DEFAULT_MS = 1500', 'Dengeli varsayılan');
requireText(hlth, 'LIVE_SOFT_STALL_MS', 'runtime stall health eşikleri');

// v15 MPV/FFmpeg native engine sözleşmesi.
requireText(src, 'KizilkanMpvView', 'PlayerHost MPV native view');
requireText(src, 'key={`kizilkan-mpv-core-${activeSessionId}-${mpvRecoveryGeneration}`}', 'MPV session-isolated native view key');
requireText(src, 'nextSessionProfileRef', 'alternatif URL motor profili koruması');
requireText(src, 'v2Profile.engine === "mpv" ? mpvClockRef.current', 'stall monitor MPV clock');
requireText(src, 'testID="engine-mpv-btn"', 'kullanıcı MPV motor seçimi');
requireText(src, 'translateX: -20000', 'TV player hidden off-screen surface policy');
forbidText(src, 'playerHidden: { opacity:', 'TV SurfaceView alpha ile gizleme regresyonu');
forbidText(src, 'playerHidden: { opacity: 0, zIndex: -1 }', 'eski şerit/tint playerHidden regresyonu');

requireText(mpvJs, 'nativeRef.current?.play?.()', 'Expo View ref play bridge');
requireText(mpvJs, 'nativeRef.current?.seekTo?.(seconds)', 'Expo View ref seek bridge');
forbidText(mpvJs, 'NativeModule.play(', 'yanlış module-level MPV View çağrısı');

requireText(mpvKt, 'player.observeProperty("time-pos", MpvFormat.MPV_FORMAT_DOUBLE)', 'MPV 1.0 instance playback progress property');
forbidText(mpvKt, '"time-pos/full"', 'MPV yanlış observed time-pos/full');
requireText(mpvKt, 'fun destroyPlayer()', 'MPV explicit destroy lifecycle');
requireText(mpvKt, 'PixelFormat.OPAQUE', 'MPV TV opaque SurfaceView');
requireText(mpvKt, 'setZOrderOnTop(false)', 'MPV normal SurfaceView Z-order');
requireText(mpvKt, 'SURFACE_LIFECYCLE_FOLLOWS_ATTACHMENT', 'Android 14 MPV attachment surface lifecycle');
forbidText(mpvKt, 'override fun onDetachedFromWindow()', 'geçici detach sırasında MPV destroy');
requireText(mpvKt, 'playbackStarted', 'MPV stale END_FILE error koruması');
requireText(mpvModKt, 'OnViewDestroys', 'Expo MPV gerçek view destroy lifecycle');
requireText(mpvGradleSrc, "dev.jdtech.mpv:libmpv:1.0.0", 'MPV/FFmpeg 1.0.0 AAR dependency');
// v15.1.0-RC1: libmpv-android 1.0.0 multiple-instance API sözleşmesi.
requireText(mpvKt, 'private var mpv: MPVLib? = null', 'libmpv 1.0 instance ownership');
requireText(mpvKt, 'val player = MPVLib.create(context)', 'libmpv 1.0 instance create');
requireText(mpvKt, 'player.init()', 'libmpv 1.0 instance init');
requireText(mpvKt, 'player.addObserver(this)', 'libmpv 1.0 instance observer');
requireText(mpvKt, 'player.addLogObserver(this)', 'libmpv 1.0 instance log observer');
requireText(mpvKt, 'MpvFormat.MPV_FORMAT_DOUBLE', 'libmpv 1.0 nested format constant');
requireText(mpvKt, 'MpvEvent.MPV_EVENT_FILE_LOADED', 'libmpv 1.0 nested event constant');
requireText(mpvKt, 'MpvLogLevel.MPV_LOG_LEVEL_ERROR', 'libmpv 1.0 nested log constant');
requireText(mpvKt, 'mapOf<String, Any>(', 'MPV EventDispatcher non-null video-ready payload');
requireText(mpvKt, 'linkedMapOf<String, Any>(', 'MPV EventDispatcher non-null diagnostic payload');
forbidText(mpvKt, 'linkedMapOf<String, Any?>(', 'nullable MPV diagnostic EventDispatcher payload');
requireText(mpvKt, 'emitDiagnostic("SURFACE_ATTACH")', 'MPV surface telemetry');
requireText(mpvKt, 'emitDiagnostic("NATIVE_DESTROY_BEGIN")', 'MPV destroy telemetry');
requireText(mpvModKt, '"onDiagnostic"', 'Expo MPV diagnostic bridge');
requireText(mpvKt, 'source["softwareDecode"]', 'MPV source-controlled software decode recovery');
requireText(mpvKt, 'if (softwareDecode) "no" else "mediacodec,mediacodec-copy"', 'MPV fresh HW→SW decode selection');
requireText(src, 'mpvForceSoftware', 'PlayerHost MPV software recovery state');
requireText(src, 'MPV FIRST-FRAME / 4K RECOVERY', 'MPV verified first-frame watchdog');
requireText(src, 'MPV HW+SW first-frame timeout', 'MPV HW→SW→VLC controlled fallback telemetry');
forbidText(mpvKt, 'MPVLib.setProperty', 'libmpv 1.0 static property call');
forbidText(mpvKt, 'MPVLib.command(', 'libmpv 1.0 static command call');
forbidText(mpvKt, 'MPVLib.destroy()', 'libmpv 1.0 static destroy call');

// Resume artık sadece komut göndermekle başarılı sayılmaz.
requireText(src, 'resumeAttemptRef', 'resume state/attempt tracking');
requireText(src, 'Resume seek doğrulanamadı', 'resume position confirmation failure telemetry');
requireText(src, 'checkpoints = [120, 900, 1900, 3300]', 'resume controlled retries');

if (app?.expo?.version !== '15.2.0') problem(`app version ${app?.expo?.version} (15.2.0 bekleniyor)`);
if (app?.expo?.android?.versionCode !== 150200) problem(`versionCode ${app?.expo?.android?.versionCode} (150200 bekleniyor)`);
if (app?.expo?.android?.package !== 'com.gpt.kizilkan.player') problem(`package ${app?.expo?.android?.package} yanlış`);


// v15.0.4: release certificate identity must live in GitHub Secrets, never hard-coded.
const projectRoot = path.resolve(root, '..');
const workflowPath = path.join(projectRoot, '.github', 'workflows', 'build-apk.yml');
if (!fs.existsSync(workflowPath)) {
  problem('CI workflow yok: .github/workflows/build-apk.yml');
} else {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  if (!workflow.includes('ANDROID_CERT_SHA256: ${{ secrets.ANDROID_CERT_SHA256 }}')) {
    problem('CI release sertifika fingerprint secret baglantisi eksik (ANDROID_CERT_SHA256)');
  }
  if (!workflow.includes('EXPECTED_CERT_SHA256=$(printf')) {
    problem('CI sertifika SHA-256 normalize/secret karsilastirma kapisi eksik');
  }
  if (/EXPECTED_CERT_SHA256="[0-9A-Fa-f]{64}"/.test(workflow)) {
    problem('CI icinde hard-coded release certificate SHA-256 yasak; GitHub Secret kullanilmali');
  }
}

// Sohbet devri sözleşmesi: her paket güncel ve ayrıntılı AI bağlam belgesi taşır.
const handoffPath = path.join(projectRoot, 'AI-PROJE-DEVIR-BAGLAM.md');
if (!fs.existsSync(handoffPath)) {
  problem('AI-PROJE-DEVIR-BAGLAM.md eksik');
} else {
  const handoff = fs.readFileSync(handoffPath, 'utf8');
  const requiredHandoffTokens = [
    'v15.2.0-RC1',
    'Media3 → MPV/FFmpeg → VLC',
    'ANDROID_CERT_SHA256',
    'KALAN / SONRAKI ISLER',
    'SOHBET DEVİR SÖZLEŞMESİ',
    'APK v15.0.4 DERLENDI',
  ];
  for (const token of requiredHandoffTokens) {
    if (!handoff.includes(token)) problem(`AI devir belgesi guncel/eksiksiz degil: ${token}`);
  }
}


// v15.1.0-RC1 Scan Engine / responsive UI hard gates.
const addPlaylistPath = path.join(root, 'app/add-playlist.tsx');
const panelScanServicePath = path.join(root, 'modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
const settingsPath = path.join(root, 'app/(tabs)/settings.tsx');
for (const f of [addPlaylistPath, panelScanServicePath, settingsPath]) { if (!fs.existsSync(f)) problem(`dosya yok: ${path.relative(root, f)}`); }
if (fs.existsSync(addPlaylistPath)) {
  const addPlaylist = fs.readFileSync(addPlaylistPath, 'utf8');
  for (const token of ['"very_safe"', '"turbo"', 'accountConcurrency', 'bulkScanPausedRef', 'bulkScanCancelledRef', 'PanelScan.pauseScan()', 'PanelScan.resumeScan()']) {
    requireText(addPlaylist, token, `Scan Engine v2: ${token}`);
  }
  requireText(addPlaylist, 'flexWrap: "wrap"', '5 scan profile phone responsive wrap');
  requireText(addPlaylist, 'directoryCache.promise ??=', 'parallel account directory fetch deduplication');
}
if (fs.existsSync(panelScanServicePath)) {
  const panelSvc = fs.readFileSync(panelScanServicePath, 'utf8');
  requireText(panelSvc, 'ACTION_PAUSE', 'native scan pause action');
  requireText(panelSvc, 'ACTION_RESUME', 'native scan resume action');
  requireText(panelSvc, 'while (paused.get()', 'native scan cooperative pause');
}
if (fs.existsSync(settingsPath)) {
  const settings = fs.readFileSync(settingsPath, 'utf8');
  requireText(settings, 'settingsPanelCard', 'telefon ayarlar dinamik panel kartı');
  forbidText(settings, 'height: 52, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.lg', 'sabit 52px link kartı overlap regresyonu');
}

// Parse PlayerHost itself; syntax regressions must not pass this gate.
const sf = ts.createSourceFile(player, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
const parseErrors = sf.parseDiagnostics || [];
if (parseErrors.length) {
  for (const e of parseErrors.slice(0, 10)) problem(`parse: ${ts.flattenDiagnosticMessageText(e.messageText, ' ')}`);
}

console.log(problems === 0 ? '\nTEMIZ — Player Core v15 sozlesmesi saglam' : `\n${problems} SORUN`);
process.exit(problems === 0 ? 0 : 1);

// v15.2 Native Core Phase 1 sözleşmesi
const nativeCoreTs = read('frontend/modules/kizilkan-native-core/index.ts');
const nativeCoreKt = read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const bigStoreNative = read('frontend/src/utils/storage/bigStore.native.ts');
const panelScanModule = read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt');
requireText(nativeCoreTs, 'KizilkanNativeCore', 'Native Core JS adapter');
requireText(nativeCoreKt, 'AsyncFunction("warmPlaylist")', 'Native playlist warm-up');
requireText(nativeCoreKt, 'AsyncFunction("readPlaylistHeavy")', 'Native playlist JSON parse');
requireText(bigStoreNative, 'KizilkanNativeCore.readPlaylistHeavy', 'bigStore Native Core parse path');
requireText(panelScanModule, 'AsyncFunction("startBulkScan")', 'Native background bulk scan');
