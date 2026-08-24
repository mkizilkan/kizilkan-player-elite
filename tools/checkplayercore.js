#!/usr/bin/env node
/**
 * GPT KIZILKAN PLAYER ELITE — PLAYER CORE HARD GATE (v15.2.9 RC1 SERVER DISCOVERY ORCHESTRATOR HARDENING)
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

if (app?.expo?.version !== '15.2.9') problem(`app version ${app?.expo?.version} (15.2.9 bekleniyor)`);
if (app?.expo?.android?.versionCode !== 150209) problem(`versionCode ${app?.expo?.android?.versionCode} (150209 bekleniyor)`);
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
    'v15.2.7-RC1',
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
  for (const token of ['"very_safe"', '"turbo"', 'accountConcurrency', 'bulkScanPausedRef', 'bulkScanCancelledRef', 'PanelScan.pauseScan(', 'PanelScan.resumeScan(']) {
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

// v15.2.2-RC1 Room/SQLite Native Data Core hard gates.
const nativeCoreDir = path.join(root, 'modules/kizilkan-native-core');
const nativeCoreGradlePath = path.join(nativeCoreDir, 'android/build.gradle');
const nativeCoreTsPath = path.join(nativeCoreDir, 'index.ts');
const nativeCoreKtPath = path.join(nativeCoreDir, 'android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const nativeDbPath = path.join(nativeCoreDir, 'android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeDatabase.kt');
const nativeDaoPath = path.join(nativeCoreDir, 'android/src/main/java/expo/modules/kizilkannativecore/NativeDataDao.kt');
const nativeEntityPath = path.join(nativeCoreDir, 'android/src/main/java/expo/modules/kizilkannativecore/NativeDataEntities.kt');
const nativeBulkImportPath = path.join(nativeCoreDir, 'android/src/main/java/expo/modules/kizilkannativecore/BulkPlaylistImportService.kt');
const bigStoreNativePath = path.join(root, 'src/utils/storage/bigStore.native.ts');
const liveScreenPath = path.join(root, 'app/(tabs)/index.tsx');
for (const f of [nativeCoreGradlePath,nativeCoreTsPath,nativeCoreKtPath,nativeDbPath,nativeDaoPath,nativeEntityPath,nativeBulkImportPath,bigStoreNativePath,liveScreenPath]) {
  if (!fs.existsSync(f)) problem(`Room Native Core dosya yok: ${path.relative(root, f)}`);
}
if (fs.existsSync(nativeCoreGradlePath)) {
  const roomGradle = fs.readFileSync(nativeCoreGradlePath, 'utf8');
  requireText(roomGradle, 'androidx.room:room-runtime:${roomVersion}', 'Room runtime dependency');
  requireText(roomGradle, 'androidx.room:room-compiler:${roomVersion}', 'Room KSP compiler');
  requireText(roomGradle, 'def roomVersion = "2.8.3"', 'Room 2.8.3 pinned version');
  requireText(roomGradle, "apply plugin: 'com.google.devtools.ksp'", 'Room KSP plugin');
  forbidText(roomGradle, 'rootProject[\\"kspVersion\\"]', 'Groovy KSP version escape regression');
  requireText(roomGradle, '${rootProject["kspVersion"]}', 'Expo KSP root version syntax');
}
if (fs.existsSync(nativeDbPath)) {
  const dbSrc = fs.readFileSync(nativeDbPath, 'utf8');
  requireText(dbSrc, '@Database(', 'Room @Database');
  requireText(dbSrc, 'Room.databaseBuilder(', 'Room database builder');
  requireText(dbSrc, 'WRITE_AHEAD_LOGGING', 'Room WAL mode');
}
if (fs.existsSync(nativeEntityPath)) {
  const entSrc = fs.readFileSync(nativeEntityPath, 'utf8');
  requireText(entSrc, 'tableName = "media_items"', 'Room media_items table');
  requireText(entSrc, 'Index(value = ["playlistId", "kind", "groupName", "sortOrder"])', 'Room category paging index');
  requireText(entSrc, 'val rawJson: String', 'lossless media raw JSON');
}
if (fs.existsSync(nativeDaoPath)) {
  const daoSrc = fs.readFileSync(nativeDaoPath, 'utf8');
  requireText(daoSrc, 'LIMIT :limit OFFSET :offset', 'Room paged query');
  requireText(daoSrc, 'GROUP BY groupName', 'Room indexed category aggregation');
  requireText(daoSrc, 'fun queryCount(', 'Room page total query');
}
if (fs.existsSync(nativeCoreKtPath)) {
  const coreSrc = fs.readFileSync(nativeCoreKtPath, 'utf8');
  requireText(coreSrc, 'private const val BATCH_SIZE = 750', 'Room bounded batch insert');
  requireText(coreSrc, 'db.runInTransaction', 'Room atomic reindex transaction');
  requireText(coreSrc, 'AsyncFunction("queryItems")', 'Room native paging bridge');
  requireText(coreSrc, 'AsyncFunction("removePlaylistIndex")', 'Room index cleanup');
  forbidText(coreSrc, 'ConcurrentHashMap<String, CacheEntry>', 'legacy full JSONObject memory cache');
}
if (fs.existsSync(bigStoreNativePath)) {
  const bs = fs.readFileSync(bigStoreNativePath, 'utf8');
  requireText(bs, 'KizilkanNativeCore.removePlaylistIndex(id)', 'bigStore Room cleanup');
}
if (fs.existsSync(liveScreenPath)) {
  const live = fs.readFileSync(liveScreenPath, 'utf8');
  requireText(live, 'const nativeLivePaged =', 'Live Room paged mode');
  requireText(live, 'KizilkanNativeCore.queryItems<any>', 'Live native page query');
  requireText(live, 'onEndReachedThreshold={0.55}', 'Live incremental page loading');
  requireText(live, 'KizilkanNativeCore.getCategories', 'Live native category query');
}

if (fs.existsSync(nativeBulkImportPath)) {
  const bulkImport = fs.readFileSync(nativeBulkImportPath, 'utf8');
  requireText(bulkImport, 'class BulkPlaylistImportService : Service()', 'native foreground bulk playlist importer');
  requireText(bulkImport, 'Executors.newFixedThreadPool', 'bounded native bulk account workers');
  requireText(bulkImport, 'Room/SQLite indeksleniyor', 'native Room import stage');
  requireText(bulkImport, 'ACTION_PAUSE', 'native bulk import pause');
  requireText(bulkImport, 'ACTION_RESUME', 'native bulk import resume');
  requireText(bulkImport, 'ACTION_CANCEL', 'native bulk import cancel');
  forbidText(bulkImport, '.put("password"', 'bulk import snapshot password leak');
}
if (fs.existsSync(addPlaylistPath)) {
  const addPlaylist = fs.readFileSync(addPlaylistPath, 'utf8');
  requireText(addPlaylist, 'KizilkanNativeCore.startBulkImport', 'selected account native import pipeline');
  requireText(addPlaylist, 'addPreparedPlaylist(playlist)', 'native prepared playlist metadata adoption');
  requireText(addPlaylist, 'KizilkanNativeCore.pauseBulkImport()', 'bulk import pause UI');
  requireText(addPlaylist, 'KizilkanNativeCore.cancelBulkImport()', 'bulk import stop UI');
}


// v15.2.3-RC1 lifecycle / unified discovery / RAM / EPG / stale fallback hard gates.
const appSessionPath = path.join(root, 'src/utils/appSession.ts');
const rootLayoutPath = path.join(root, 'app/_layout.tsx');
const rootIndexPath = path.join(root, 'app/index.tsx');
const playlistContextPath = path.join(root, 'src/store/PlaylistContext.tsx');
const panelScanModulePath = path.join(root, 'modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt');
const panelScanTsPath = path.join(root, 'modules/panel-scan/index.ts');
for (const f of [appSessionPath,rootLayoutPath,rootIndexPath,playlistContextPath,panelScanModulePath,panelScanTsPath]) {
  if (!fs.existsSync(f)) problem(`v15.2.3 dosya yok: ${path.relative(root, f)}`);
}
if (fs.existsSync(appSessionPath)) {
  const a = fs.readFileSync(appSessionPath,'utf8');
  requireText(a, 'RECENT_RESUME_MS', 'recent background session restore window');
  requireText(a, 'backgroundAt', 'background timestamp persistence');
  requireText(a, '"/(tabs)"', 'live tab safe resume route');
}
if (fs.existsSync(rootLayoutPath)) {
  const l = fs.readFileSync(rootLayoutPath,'utf8');
  requireText(l, 'AppState.addEventListener("change"', 'app lifecycle persistence listener');
  requireText(l, 'markAppBackground', 'background session persistence');
}
if (fs.existsSync(rootIndexPath)) {
  const i = fs.readFileSync(rootIndexPath,'utf8');
  requireText(i, 'getRecentResumePath()', 'recent route restore');
  requireText(i, '}, 80);', 'fast root redirect');
}
if (fs.existsSync(playlistContextPath)) {
  const pc = fs.readFileSync(playlistContextPath,'utf8');
  requireText(pc, 'v15.2.3 P0 RAM FIX', 'playlist JS heap compaction');
  requireText(pc, 'KizilkanNativeCore.getPlaylistSummary(p.id)', 'canonical Room snapshot verification');
  requireText(pc, 'fromMeta(toMeta(pl))', 'inactive playlist heavy eviction');
}
if (fs.existsSync(panelScanServicePath)) {
  const ps = fs.readFileSync(panelScanServicePath,'utf8');
  requireText(ps, 'ACTION_UNIFIED_START', 'unified native discovery action');
  requireText(ps, 'runUnifiedScan(', 'per-account native discovery worker');
}
if (fs.existsSync(panelScanModulePath)) {
  const pm = fs.readFileSync(panelScanModulePath,'utf8');
  requireText(pm, 'AsyncFunction("startUnifiedScan")', 'unified discovery Expo bridge');
}
if (fs.existsSync(panelScanTsPath)) {
  const pt = fs.readFileSync(panelScanTsPath,'utf8');
  requireText(pt, 'startUnifiedScan:', 'unified discovery TS bridge');
}
if (fs.existsSync(addPlaylistPath)) {
  const ap = fs.readFileSync(addPlaylistPath,'utf8');
  requireText(ap, 'stableXtreamPlaylistId', 'idempotent Xtream playlist identity');
  requireText(ap, 'directImportLocksRef', 'duplicate tap in-flight guard');
  requireText(ap, 'PanelScan.startUnifiedScan', 'all bulk locator modes native discovery');
  requireText(ap, 'PENDING_BULK_SCAN_KEY', 'native scan secure restore state');
  requireText(ap, 'PENDING_BULK_IMPORT_KEY', 'native import secure restore state');
}
if (fs.existsSync(liveScreenPath)) {
  const live = fs.readFileSync(liveScreenPath,'utf8');
  requireText(live, 'EPG ISOLATION', 'EPG non-blocking isolation');
  requireText(live, 'InteractionManager.runAfterInteractions', 'EPG deferred after interactions');
  requireText(live, '.slice(0, 16)', 'bounded initial EPG window');
}
requireText(src, 'successfulSessionAtRef', 'late playback error success timestamp');
requireText(src, 'bayat source error', 'stale post-first-frame error guard');

// v15.2.4-RC1 Native Core Phase 2 hard gates.
const epgPath = path.join(root, 'src/utils/epg.ts');
const searchPath = path.join(root, 'app/(tabs)/search.tsx');
const favoritesPath = path.join(root, 'app/(tabs)/favorites.tsx');
const detailPath = path.join(root, 'app/detail.tsx');
const statsPath = path.join(root, 'app/stats.tsx');
const editPlaylistPath = path.join(root, 'app/edit-playlist.tsx');
const sessionGatePath = path.join(root, 'src/player/v2/session.ts');
const posterGridPath = path.join(root, 'src/components/PosterGrid.tsx');
const apkAnalyzerPath = path.join(projectRoot, 'tools/analyze-apk.js');
for (const f of [epgPath,searchPath,favoritesPath,detailPath,statsPath,editPlaylistPath,sessionGatePath,posterGridPath,apkAnalyzerPath]) {
  if (!fs.existsSync(f)) problem(`v15.2.4 dosya yok: ${path.relative(root, f)}`);
}
if (fs.existsSync(nativeCoreKtPath)) {
  const core = fs.readFileSync(nativeCoreKtPath,'utf8');
  requireText(core, 'AsyncFunction("importM3uText")', 'native M3U file parser/import');
  requireText(core, 'AsyncFunction("fetchAndImportM3u")', 'native M3U URL fetch/import');
  requireText(core, 'AsyncFunction("fetchAndCacheEpg")', 'native EPG fetch/cache');
  requireText(core, 'Function("getRuntimeMemory")', 'real Android RAM telemetry');
  requireText(core, 'Function("beginPlayerSession")', 'native player session generation authority');
  requireText(core, 'sourceStamp == 0L', 'Room canonical source without legacy file');
  requireText(core, 'private fun storageFootprint()', 'Room/legacy storage footprint telemetry');
}
if (fs.existsSync(nativeEntityPath)) {
  const ent = fs.readFileSync(nativeEntityPath,'utf8');
  requireText(ent, 'tableName = "epg_programs"', 'Room native EPG table');
}
if (fs.existsSync(nativeDbPath)) {
  const db = fs.readFileSync(nativeDbPath,'utf8');
  requireText(db, 'MIGRATION_1_2', 'Room explicit EPG migration');
}
if (fs.existsSync(epgPath)) {
  const epg = fs.readFileSync(epgPath,'utf8');
  requireText(epg, 'KizilkanNativeCore.fetchAndCacheEpg', 'EPG Android native pipeline');
  requireText(epg, 'KizilkanNativeCore.getEpgNowNext', 'EPG visible-channel native query');
}
if (fs.existsSync(searchPath)) requireText(fs.readFileSync(searchPath,'utf8'), 'KizilkanNativeCore.queryItems', 'Search Room query');
if (fs.existsSync(favoritesPath)) requireText(fs.readFileSync(favoritesPath,'utf8'), 'KizilkanNativeCore.getItemsByIds', 'Favorites ID-based Room query');
if (fs.existsSync(detailPath)) requireText(fs.readFileSync(detailPath,'utf8'), 'KizilkanNativeCore.getItem', 'Detail single-item Room query');
if (fs.existsSync(statsPath)) {
  const statsSrc = fs.readFileSync(statsPath,'utf8');
  requireText(statsSrc, 'KizilkanNativeCore.getRuntimeMemory()', 'Stats real RAM telemetry');
  requireText(statsSrc, 'KizilkanNativeCore.getStorageFootprint()', 'Stats storage telemetry');
}
if (fs.existsSync(liveScreenPath)) {
  const live = fs.readFileSync(liveScreenPath,'utf8');
  requireText(live, 'nativeLibraryPaged', 'VOD/Series Room paging mode');
  requireText(live, 'loadNativeLibraryPage', 'VOD/Series incremental native page');
  requireText(live, 'serverCodeBinding?.code', 'live account header server code');
}
if (fs.existsSync(editPlaylistPath)) {
  const edit = fs.readFileSync(editPlaylistPath,'utf8');
  requireText(edit, 'resolveServerCode', 'manual server code real validation');
  requireText(edit, 'DNS otomatik güncelle', 'server code/DNS self-heal visible control');
}
if (fs.existsSync(addPlaylistPath)) {
  const add = fs.readFileSync(addPlaylistPath,'utf8');
  requireText(add, 'KizilkanNativeCore.fetchAndImportM3u', 'M3U URL native Room import');
  requireText(add, 'KizilkanNativeCore.importM3uText', 'M3U file native Room import');
  requireText(add, 'Çok Güvenli', 'five-profile scan UI');
  requireText(add, 'bulkAccountProgress', 'per-account discovery progress');
}
if (fs.existsSync(sessionGatePath)) {
  const sess = fs.readFileSync(sessionGatePath,'utf8');
  requireText(sess, 'KizilkanNativeCore.beginPlayerSession()', 'native-backed player session begin');
  requireText(sess, 'KizilkanNativeCore.isPlayerSessionActive(id)', 'native-backed stale callback gate');
}
if (fs.existsSync(workflowPath)) {
  const wf = fs.readFileSync(workflowPath,'utf8');
  requireText(wf, 'APK ABI ve native boyut raporu', 'CI APK footprint audit');
  requireText(wf, 'APK-BOYUT-RAPORU-', 'CI footprint artifact');
}


// v15.2.6-RC1 TypeScript hard-gate + v15.2.5 Cast/chunked import hard gates.
const castButtonPath = path.join(root, 'src/components/CastButton.tsx');
for (const f of [castButtonPath, bigStoreNativePath]) {
  if (!fs.existsSync(f)) problem(`v15.2.5 dosya yok: ${path.relative(root, f)}`);
}
if (fs.existsSync(castButtonPath)) {
  const cast = fs.readFileSync(castButtonPath, 'utf8');
  requireText(cast, 'onSessionResumed', 'Cast resumed-session rebind');
  requireText(cast, 'source-change', 'Cast source/channel change remote reload');
  requireText(cast, 'background/activity recreation', 'Cast remount no forced reload guard');
  requireText(cast, 'loadGenerationRef', 'Cast stale load generation guard');
}
if (fs.existsSync(bigStoreNativePath)) {
  const bs = fs.readFileSync(bigStoreNativePath, 'utf8');
  requireText(bs, 'beginChunkedPlaylistImport', 'chunked native playlist staging');
  requireText(bs, 'chunkSize = 500', 'bounded JS serialization chunk');
  requireText(bs, 'setTimeout(resolve, 0)', 'event-loop yield between chunks');
}
if (fs.existsSync(nativeCoreKtPath)) {
  const core = fs.readFileSync(nativeCoreKtPath, 'utf8');
  requireText(core, 'AsyncFunction("beginChunkedPlaylistImport")', 'native chunk staging begin');
  requireText(core, 'AsyncFunction("appendPlaylistChunk")', 'native chunk staging append');
  requireText(core, 'AsyncFunction("finishChunkedPlaylistImport")', 'native chunk staging finalize');
  requireText(core, 'db.runInTransaction', 'canonical Room atomic transaction');
}
requireText(src, 'castRemotePositionRef', 'Cast remote position handoff');
requireText(src, 'client.getMediaStatus?.()', 'Cast initial remote status rebind');
requireText(src, 'liveSeekableRange', 'Cast live DVR capability');
requireText(src, 'remote?.stop?.()', 'Cast remote stop on player exit');
requireText(src, 'Cast receiver authoritative', 'Cast remote authoritative play/pause');

// v15.2.6 TypeScript HARD-gate regression guards.
if (!fs.existsSync(searchPath)) {
  problem('v15.2.6 Search dosyasi yok: app/(tabs)/search.tsx');
} else {
  const search = fs.readFileSync(searchPath, 'utf8');
  requireText(search, 'useMemo<Channel[]>', 'Search live result single-shape model');
  requireText(search, 'useMemo<VodItem[]>', 'Search VOD result single-shape model');
  requireText(search, 'useMemo<SeriesItem[]>', 'Search series result single-shape model');
  requireText(search, 'nativeSeriesResults.slice(0, 60)', 'Search native Series Room result path');
  requireText(search, '.map(result => result.item)', 'Search fuzzy result normalization');
  if (/\br\.item\b/.test(search)) problem("v15.2.6 Search render tekrar FuzzyResult.item shape'ine baglanmis");
}
if (fs.existsSync(addPlaylistPath)) {
  const add = fs.readFileSync(addPlaylistPath, 'utf8');
  if (add.includes('else if (method === "xtream")')) problem('v15.2.6 duplicate/erisilemez ikinci Xtream branch geri gelmis');
  requireText(add, 'await submitXtreamDirect({ server: xtServer.trim(), username: xtUser.trim(), password: xtPass.trim() });', 'Xtream tek submitXtreamDirect girisi');
}

// v15.2.7 Kotlin HARD-gate regression guard: OutputStream.bufferedWriter only accepts charset.
if (fs.existsSync(nativeCoreKtPath)) {
  const core = fs.readFileSync(nativeCoreKtPath, 'utf8');
  requireText(core, 'BufferedWriter(OutputStreamWriter(FileOutputStream(file, true), Charsets.UTF_8), 64 * 1024)', 'Kotlin chunk staging writer explicit buffer');
  if (/\.bufferedWriter\(Charsets\.UTF_8\s*,/.test(core)) problem('v15.2.7 gecersiz OutputStream.bufferedWriter(charset, bufferSize) geri gelmis');
}

// v15.2.8 lifecycle / health / duplicate guards
try {
  const panelModule = fs.readFileSync(path.join(root, 'modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt'), 'utf8');
  const panelService = fs.readFileSync(path.join(root, 'modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt'), 'utf8');
  const add = fs.readFileSync(path.join(root, 'app/add-playlist.tsx'), 'utf8');
  const core = fs.readFileSync(path.join(root, 'modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt'), 'utf8');
  const bulk = fs.readFileSync(path.join(root, 'modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/BulkPlaylistImportService.kt'), 'utf8');
  if (!panelModule.includes('claimRun') || !panelModule.includes('runId')) problem('v15.2.8+ panel scan runId lifecycle eksik');
  if (!panelService.includes('STARTING') || !panelService.includes('currentRunId')) problem('v15.2.8 panel snapshot lifecycle eksik');
  if (!core.includes('BulkPlaylistImportService.seedStartingSnapshot') || !bulk.includes('currentRunId')) problem('v15.2.8 bulk import runId lifecycle eksik');
  if (bulk.includes('fetchArraySafe(')) problem('v15.2.8 endpoint hatalarini yutan fetchArraySafe geri gelmis');
  if (!add.includes('canonicalUrlIdentity') || !add.includes('Bu M3U kaynağı zaten ekli.')) problem('v15.2.8 canonical M3U duplicate guard eksik');
  if (src.includes('Yayın kısa süre ilerlemedi; aynı motor yeniden senkronlanıyor')) problem('v15.2.8 eski false-stall soft recovery geri gelmis');
} catch (e) { problem(`v15.2.8 guard okunamadi: ${e.message}`); }


// v15.2.9 Server Discovery Orchestrator hard gates.
try {
  const panelModule = fs.readFileSync(path.join(root, 'modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt'), 'utf8');
  const panelService = fs.readFileSync(path.join(root, 'modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt'), 'utf8');
  const panelTs = fs.readFileSync(path.join(root, 'modules/panel-scan/index.ts'), 'utf8');
  const serverCode = fs.readFileSync(path.join(root, 'src/utils/serverCode.ts'), 'utf8');
  const add = fs.readFileSync(path.join(root, 'app/add-playlist.tsx'), 'utf8');
  requireText(panelModule, 'PanelScanService.claimRun', 'atomic scan job claim');
  requireText(panelModule, 'state" to "BUSY"', 'explicit BUSY start result');
  requireText(panelModule, 'AsyncFunction("cancelScan") { runId: String', 'runId-scoped cancel');
  requireText(panelModule, 'AsyncFunction("pauseScan") { runId: String', 'runId-scoped pause');
  requireText(panelModule, 'AsyncFunction("resumeScan") { runId: String', 'runId-scoped resume');
  requireText(panelService, 'private var claimedRunId', 'single active scan ownership');
  requireText(panelService, 'releaseRun(finishedRunId)', 'scan ownership release');
  if (/ACTION_(?:START|BULK_START|UNIFIED_START) -> if \(!running\)/.test(panelService)) problem('v15.2.9 sessiz if(!running) job reddi geri gelmis');
  requireText(panelTs, 'NativeScanStartResult', 'typed ACCEPTED/BUSY bridge');
  requireText(panelTs, 'getActiveRunId', 'native active-run visibility');
  requireText(serverCode, 'PANEL_DIRECTORY_CACHE_KEY', 'panel directory local cache');
  requireText(serverCode, 'AbortController', 'panel catalog client timeout');
  requireText(serverCode, 'timeout=${sec}s', 'Firebase server-side timeout');
  requireText(serverCode, 'forceRefresh', 'panel directory explicit refresh');
  requireText(serverCode, 'resolvePanelDirectoryItem', 'code-to-cached-directory resolver');
  requireText(add, 'selectedPanelItem', 'directory selected hosts persistence');
  requireText(add, 'startAcceptedScan', 'common accepted/busy scan start');
  requireText(add, 'Durdur ve Yeni Tara', 'busy scan user arbitration');
  requireText(add, 'PanelScan.cancelScan(active)', 'busy active-run cancellation');
  requireText(add, 'isActiveDiscoveryMatch', 'active-only default discovery selection');
  requireText(add, 'const grouped = new Map<string, PanelCredentialMatch[]>()', 'same-panel DNS alias playlist grouping');
  if (add.includes('const panelName = await resolvePanelName(src, codeVal.trim())')) problem('v15.2.9 Paneli biliyorum tekrar Firebase resolve yoluna dusuyor');
} catch (e) { problem(`v15.2.9 guard okunamadi: ${e.message}`); }

// Parse PlayerHost itself; syntax regressions must not pass this gate.
const sf = ts.createSourceFile(player, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
const parseErrors = sf.parseDiagnostics || [];
if (parseErrors.length) {
  for (const e of parseErrors.slice(0, 10)) problem(`parse: ${ts.flattenDiagnosticMessageText(e.messageText, ' ')}`);
}

console.log(problems === 0 ? '\nTEMIZ — Player Core v15 sozlesmesi saglam' : `\n${problems} SORUN`);
process.exit(problems === 0 ? 0 : 1);
