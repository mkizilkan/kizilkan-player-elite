#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(R,p),'utf8');
let fail=0; const ok=(c,m)=>{console.log(`${c?'✓':'✗'} ${m}`);if(!c)fail++};
const pkg=JSON.parse(read('frontend/package.json')),app=JSON.parse(read('frontend/app.json'));
const core=read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const coreJs=read('frontend/modules/kizilkan-native-core/index.ts');
const ctx=read('frontend/src/store/PlaylistContext.tsx');
const types=read('frontend/src/types/index.ts');
const rf=read('frontend/src/utils/refreshPlaylist.ts');
const diag=read('frontend/src/utils/diagnostics.ts');
const player=read('frontend/src/player/PlayerHost.tsx');
const mpvMod=read('frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvModule.kt');
const mpvGate=read('tools/check-mpv-packaging-v16143.js');
const semverAtLeast=(v,min)=>{const a=String(v).split('.').map(Number),b=String(min).split('.').map(Number);if(a.length!==3||a.some(Number.isNaN))return false;for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false;}return true;};
const expectedCode=(()=>{const [M,m,p]=String(pkg.version).split('.').map(Number);return M*10000+m*100+p;})();
ok(semverAtLeast(pkg.version,'16.14.3')&&app.expo.version===pkg.version&&app.expo.android.versionCode===expectedCode,'v16.14.3+ metadata');
ok(app.expo.ios.buildNumber===pkg.version&&String(app.expo.extra?.kizilkanReleaseLabel||'').includes(pkg.version),'iOS/release label synchronized');
// P0 incremental sync: fingerprint alone never authorizes skip.
ok(core.includes('actualRows == expected && actualSnapshot == expected'),'skip requires Room row-count + snapshot-count match');
ok(core.includes('if (fingerprintMatches) repaired += kind'),'fingerprint-match corruption becomes repair-write');
ok(core.includes('Room supplied-kind final verify başarısız'),'all supplied kinds final fail-closed verify');
ok(core.includes('"repairedKinds" to repaired'),'native repairedKinds telemetry/result');
ok(coreJs.includes('repairedKinds?: Array<\"live\" | \"vod\" | \"series\">')&&types.includes("lastRepairedKinds?: Array<'live' | 'vod' | 'series'>"),'JS/types repaired-kind contract');
ok(ctx.includes('lastRepairedKinds: sync.repairedKinds || []')&&ctx.includes('skipVerifiedAgainstRoom: true'),'catalog metadata records verified skip/repair');
// MAG all-empty capability persistence without content wipe.
ok(rf.includes('const capabilityPatch: Partial<Playlist>'),'MAG capability patch built before all-empty decision');
ok(rf.includes('ok: false, patch: capabilityPatch')&&rf.includes('kataloglar boş'),'all-empty MAG returns metadata patch');
ok(rf.includes('...capabilityPatch'),'successful MAG refresh persists same discovery contract');
ok(!rf.includes('ok: true, patch: { channels: [], vod: [], series: []'),'all-empty path does not wipe catalog arrays');
// Flight recorder parent/child.
ok(diag.includes('createFlightRecorderChildTrace'),'Flight V7 child-trace API');
ok(player.includes("createFlightRecorderChildTrace(parentTraceId, 'channel'")&&player.includes('parentTraceId'),'each channel forks playlist parent trace');
ok(player.includes('lifecycleTraceRef.current = traceId'),'player lifecycle uses channel child trace');
// MPV: runtime APK evidence + fail-closed final APK gate.
ok(mpvMod.includes('ZipFile(sourceDir)')&&mpvMod.includes('lib/$abi/libmpv.so')&&mpvMod.includes('lib/$abi/libc++_shared.so'),'MPV runtime inspects installed APK native libs');
ok(mpvMod.includes('nativeLibrariesVerified'),'MPV runtime exposes combined native verification');
ok(player.includes("outcome: status?.nativeLibrariesVerified ? 'success' : 'failed'"),'MPV runtime telemetry no longer treats class-only as success');
ok(mpvGate.includes('AAR-only release PASS değildir'),'AAR presence explicitly not release PASS');
ok(mpvGate.includes('FINAL APK')&&mpvGate.includes("process.exit(2)"),'MPV gate requires final build artifact; prebuild is BLOCKED');
ok(mpvGate.includes("libc++_shared.so")&&mpvGate.includes("arm64-v8a"),'MPV gate requires C++ runtime and arm64 pair');
if(fail){console.error(`FAIL — v16.14.3 corrective hard-gate: ${fail} sorun`);process.exit(1)}
console.log('TEMIZ — v16.14.3 corrective source hard-gate');
