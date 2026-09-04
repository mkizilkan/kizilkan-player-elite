#!/usr/bin/env node
/** KIZILKAN PLAYER v17.0.3 RC1 — MPV runtime + Room recovery + TV/scan terminal-state hard-gate. */
const fs=require('fs'),path=require('path'),cp=require('child_process');
const R=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(R,p),'utf8'); let bad=0;
const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}: ${m}`);if(!c)bad++;};
const pkg=JSON.parse(read('frontend/package.json')),app=JSON.parse(read('frontend/app.json'));
const v17003Parts = String(pkg.version || '').split('.').map(Number);
ok(v17003Parts.length === 3 && v17003Parts.every(Number.isFinite) && (v17003Parts[0] > 17 || (v17003Parts[0] === 17 && (v17003Parts[1] > 0 || (v17003Parts[1] === 0 && v17003Parts[2] >= 3)))),'frontend/package.json preserves v17.0.3+');
ok(app.expo.version===pkg.version&&app.expo.ios.buildNumber===pkg.version,'Expo/iOS metadata synchronized');
ok(Number(app.expo.android.versionCode)>=170003,'Android versionCode preserves 170003+');
ok(String(app.expo.extra?.kizilkanReleaseLabel||'').includes(`v${pkg.version} RC1`),'release label synchronized');

const mpvMod=read('frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvModule.kt');
ok(mpvMod.includes('Class.forName("dev.jdtech.mpv.MPVLib", true')&&mpvMod.includes('classInitialized'),'MPV runtime gate forces class initialization separately');
ok(mpvMod.includes('classInitThrowable')&&mpvMod.includes('apkScanThrowable')&&mpvMod.includes('throwableChain'),'MPV runtime gate preserves causal chains and APK scan failures');
ok(/nativeLibrariesVerified = classLoaded && classInitialized && apkLibmpv && apkLibcxx/.test(mpvMod),'MPV runtime verification requires initialized class + libmpv + libc++ + ABI');
const mpvView=read('frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvView.kt');
for(const token of ['MPV_CREATE_BEGIN','MPV_CREATE_OK','MPV_INIT_BEGIN','MPV_INIT_OK','INITIALIZE_MPV','NATIVE_THROWABLE','causeChain']) ok(mpvView.includes(token),`MPV forensic stage ${token} exists`);
for(const token of ['REMOVE_SURFACE_CALLBACK','STOP_ON_DESTROY','SURFACE_DETACH_ON_DESTROY','REMOVE_EVENT_OBSERVER','REMOVE_LOG_OBSERVER','MPV_DESTROY']) ok(mpvView.includes(token),`MPV cleanup stage ${token} exists`);

const nativeCore=read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
ok(nativeCore.includes('SNAPSHOT_REBUILT_FROM_ROWS')&&nativeCore.includes('SNAPSHOT_BOOTSTRAP_EMPTY_FULL_PAYLOAD')&&nativeCore.includes('SNAPSHOT_MISSING_EMPTY_PARTIAL'),'Room missing-snapshot recovery/fail-closed states exist');
ok(nativeCore.includes('snapshotRecovered')&&nativeCore.includes('snapshotRecoveryState'),'Room sync returns snapshot recovery evidence');
ok(nativeCore.includes('partial replace fail-closed'),'partial kind replace fails closed on empty canonical store');
const nativeTs=read('frontend/modules/kizilkan-native-core/index.ts');
ok(nativeTs.includes('snapshotRecovered?: boolean')&&nativeTs.includes('snapshotRecoveryState?: string'),'TS bridge exposes Room recovery evidence');

const scan=read('frontend/app/add-playlist.tsx'),scanNative=read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt'),scanTs=read('frontend/modules/panel-scan/index.ts');
ok(scan.includes('terminal sonuç kullanıcı onayı olmadan kaybolmaz')&&scan.includes('acknowledgeBulkScanResult'),'multi-account terminal results survive UI/process restore until user acknowledgement');
ok(scanNative.includes('Function("acknowledgeSnapshot")')&&scanTs.includes('acknowledgeSnapshot'),'terminal native scan snapshot has explicit user-acknowledgement path');
ok(scanNative.includes('PROCESS_RESTARTED')&&scanNative.includes('ORPHANED_AFTER_PROCESS_RESTART'),'orphan RUNNING scan snapshot is terminalized after real process restart while preserving matches');
ok(scan.includes('a.found > 0 ? colors.brandPrimary'),'per-account Bulunan > 0 uses active theme accent');
ok(scan.includes('bulkCandidates.length > 0 ? colors.brandPrimary'),'total Bulunan > 0 uses active theme accent');

const settings=read('frontend/app/(tabs)/settings.tsx');
ok(settings.includes('autoFocus={tvLayout === opt.v}'),'TV layout settings focus follows selected layout');
const focusBtn=read('frontend/src/components/FocusButton.tsx');
ok(focusBtn.includes('React.forwardRef')&&focusBtn.includes('ref={ref}')&&focusBtn.includes('FocusButton.displayName'),'FocusButton forwards native ref');
const focusMem=read('frontend/src/store/TvFocusMemoryContext.tsx');
ok(focusMem.includes('requestRestore: (scope?: string, key?: string)')&&focusMem.includes('requestedKey'),'focus memory supports exact stable-key restore');
const tv=read('frontend/app/tv-home.tsx');
ok(tv.includes('<TvFocusScope scope="tv-home">')&&tv.includes('focusKey={`tv-home:section:${sec.key}`}')&&tv.includes('focusKey={`tv-home:live:${item.id}`}'),'TV guide has stable scoped focus identities');
ok(tv.includes('resolveGenerationRef')&&tv.includes('TV_PREVIEW_RESOLVE_FAILED'),'TV preview rejects stale async stream resolutions');
const player=read('frontend/src/player/PlayerHost.tsx');
ok(player.includes('"guide" | null')&&player.includes('TV_QUICK_GUIDE_OPEN')&&player.includes('getNowNext'),'player Quick Guide uses bounded Now/Next EPG');
ok(player.includes('TV_RECENT_CHANNEL_WRITE_FAILED')&&player.includes('addToRecent'),'player navigation writes Recent Channels');
ok(player.includes('TV_NUMERIC_ZAP_SCOPE')&&player.includes('loadPlayerNavigationScope'),'numeric zap honors exact navigation scope');
ok(player.includes('causeChain: Array.isArray(ev.causeChain)'),'PlayerHost preserves native MPV throwable chain');

for(const gate of ['check-v17002-pin-input-header-timezone.js','check-v17000-tv-navigation-focus-player.js','check-v16148-performance-runtime.js']){
  try{cp.execFileSync(process.execPath,[path.join(__dirname,gate)],{stdio:'pipe'});ok(true,`${gate} preservation gate passes`)}
  catch(e){ok(false,`${gate} preservation gate passes`);if(e.stdout)process.stdout.write(String(e.stdout));if(e.stderr)process.stderr.write(String(e.stderr));}
}
if(bad){console.error(`FAIL — v17.0.3 RC1 hard-gate: ${bad}`);process.exit(1)}
console.log('TEMIZ — v17.0.3 RC1 MPV runtime + Room snapshot recovery + multi-scan terminal UI + TV foundation hard-gate');
