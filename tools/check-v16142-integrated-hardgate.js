#!/usr/bin/env node
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
let fail=0; const ok=(c,m)=>{console.log(`${c?'✓':'✗'} ${m}`); if(!c) fail++;};
const pkg=JSON.parse(read('frontend/package.json'));
const app=JSON.parse(read('frontend/app.json'));
const types=read('frontend/src/types/index.ts');
const pc=read('frontend/src/store/PlaylistContext.tsx');
const core=read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const coreJs=read('frontend/modules/kizilkan-native-core/index.ts');
const stalker=read('frontend/src/utils/stalker.ts');
const player=read('frontend/src/player/PlayerHost.tsx');
const diag=read('frontend/src/utils/diagnostics.ts');
const mpvGradle=read('frontend/modules/mpv-player/android/build.gradle');
const mpvModule=read('frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvModule.kt');
const refresh=read('frontend/src/utils/refreshPlaylist.ts');
const recovery=read('frontend/src/player/v2/sourceRecovery.ts');

const semverAtLeast=(v,min)=>{const a=String(v).split('.').map(Number),b=String(min).split('.').map(Number); if(a.length!==3||b.length!==3||a.some(Number.isNaN)||b.some(Number.isNaN)) return false; for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false;}return true;};
const expectedCode=(()=>{const [M,m,p]=String(pkg.version).split('.').map(Number); return M*10000+m*100+p;})();
ok(semverAtLeast(pkg.version,'16.14.2'),'version preserves >=16.14.2');
ok(app.expo.version===pkg.version && app.expo.android.versionCode===expectedCode,'app version/versionCode synchronized');
ok(app.expo.ios.buildNumber===pkg.version,'iOS buildNumber synchronized');
ok(String(app.expo.extra?.kizilkanReleaseLabel||'').includes(pkg.version),'release label synchronized');

ok(types.includes('lastChangedKinds')&&types.includes('roomVerified'),'Incremental Sync V2 metadata contract');
ok(core.includes('AsyncFunction("syncPlaylistKindsJson")'),'native incremental sync function');
ok(core.includes('MessageDigest.getInstance("SHA-256")'),'native SHA-256 snapshot fingerprints');
ok(core.includes('db.runInTransaction')&&core.includes('changed.forEach { kind ->'),'changed kinds share Room transaction');
ok(core.includes('Room kind verify başarısız'),'transaction row-count verification');
ok(coreJs.includes('syncPlaylistKindsJson:'),'JS/native incremental sync bridge');
ok(pc.includes('Map<string, Promise<void>>')&&pc.includes('PLAYLIST_SWITCH_SINGLEFLIGHT_JOIN'),'true Promise same-target single-flight');
ok(!pc.includes('activeSwitchInFlight = useRef<Set<string>>'),'old Set pseudo-single-flight removed');
ok(pc.includes('STARTUP_ROOM_ACTIVATION_DEFERRED')&&pc.includes('room-canonical-no-auto-heavy-hydrate'),'Room-canonical startup/deferred controlled recovery');
ok(pc.includes('CATALOG_INCREMENTAL_SYNC_V2')&&pc.includes('serverDelta: false'),'client snapshot diff explicitly not server-delta');

ok(refresh.includes('magCapabilities')&&refresh.includes('catalogCapabilities'),'MAG capability persistence patch');
ok(stalker.includes('vod: "OK"|"EMPTY"|"UNSUPPORTED"|"ERROR"'),'MAG unsupported/error distinction');
ok(stalker.includes('magPcapShapeParity')&&stalker.includes('pcapShapeParity'),'MAG PCAP shape parity telemetry');
ok(core.includes('magBaseClient')&&core.includes('connectionReused'),'MAG Exact Wire V2 keep-alive/reuse telemetry');
ok(!core.includes('hostAddress'),'no plaintext resolved IP telemetry');

ok(recovery.includes('status === 444')&&recovery.includes('status === 456')&&recovery.includes('status === 520'),'HTTP 444/456/520 source recovery classes');
ok(recovery.includes('fingerprintPlaybackUrl')&&recovery.includes('SHA256'),'URL fingerprint provenance');
ok(player.includes('source-renewal-before-engine-fallback'),'renew stale Stalker URL before blind engine fallback');
ok(player.includes("requestStalkerSourceRenewal(raw, 'mpv')")&&player.includes("requestStalkerSourceRenewal(String(message || ''), 'vlc')"),'source renewal covers VLC + MPV');

ok(player.includes('playbackOwnerRef')&&player.includes('ownsCurrentRender'),'playlist/channel/session/candidate/engine ownership gate');
ok(player.includes('!ownsCurrentRender()'),'native callback stale-owner rejection');

ok(diag.includes('schemaVersion: 7')&&diag.includes('structuredTraceSchema: 2'),'Flight Recorder true V7 schema');
for (const stage of ['playlistSelect','roomVerify','catalogRecovery','channelSelect','urlResolve','enginePrepare','httpResponse','fallback','firstFrame']) ok(diag.includes(`'${stage}'`),`Flight V7 stage ${stage}`);
ok(pc.includes("recordFlightRecorderStage(traceId, 'playlistSelect'")&&player.includes("recordFlightRecorderStage(traceId, 'urlResolve'")&&player.includes("'firstFrame'"),'V7 lifecycle correlation wired across playlist/player');

ok(mpvGradle.includes("dev.jdtech.mpv:libmpv:1.0.0"),'MPV libmpv 1.0.0 dependency');
ok(mpvModule.includes('getRuntimeStatus')&&mpvModule.includes('Class.forName("dev.jdtech.mpv.MPVLib")'),'MPV runtime class/ABI status API');
ok(fs.existsSync(path.join(ROOT,'tools/check-mpv-packaging-v16142.js')),'MPV AAR/JNI packaging build gate exists');

if(fail){console.error(`FAIL — v16.14.2+ integrated hard-gate: ${fail} sorun`);process.exit(1)}
console.log('TEMIZ — v16.14.2+ integrated source preservation hard-gate');
