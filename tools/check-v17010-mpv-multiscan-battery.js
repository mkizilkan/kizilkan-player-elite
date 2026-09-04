#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=JSON.parse(read('frontend/app.json')); const pkg=JSON.parse(read('frontend/package.json'));
const ui=read('frontend/app/add-playlist.tsx'); const mod=read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt');
const bridge=read('frontend/modules/panel-scan/index.ts'); const plugin=read('frontend/plugins/withMpvRuntime.js'); const mpv=read('frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvView.kt'); const mpvModule=read('frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvModule.kt'); const mpvJs=read('frontend/modules/mpv-player/index.tsx'); const host=read('frontend/src/player/PlayerHost.tsx'); const gate=read('tools/check-mpv-packaging-v16143.js');
function ok(c,m){if(!c){console.error('FAIL — '+m);process.exit(1)}console.log('✓ '+m)}
const parts=String(pkg.version||'').split('.').map(Number); const atLeast17010=parts.length===3&&parts.every(Number.isFinite)&&(parts[0]>17||(parts[0]===17&&(parts[1]>0||(parts[1]===0&&parts[2]>=10))));
ok(atLeast17010&&app.expo.version===pkg.version&&app.expo.ios.buildNumber===pkg.version&&app.expo.android.versionCode>=170010&&app.expo.extra?.kizilkanReleaseLabel===`GPT ELITE v${pkg.version} RC1`,'v17.0.10+ sürüm zinciri');
ok(app.expo.android.permissions.includes('android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'),'battery exemption manifest permission');
ok(mod.includes('ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS')&&mod.includes('package:${context.packageName}')&&bridge.includes('requestBatteryOptimizationExemption'),'pakete özel pil optimizasyon muafiyet akışı');
ok(ui.includes('<SectionList')&&ui.includes('bulkScrollableBody')&&!ui.includes('style={{ maxHeight: 430 }}'),'çoklu hesap modalı tek virtualized kaydırılabilir gövde');
ok(ui.includes('bulkFoundTotal')&&ui.includes('bulkFoundBadgeText')&&ui.includes('Bulunan {a.found}'),'bulunan sayısı güçlü ayrı vurgu');
ok(ui.includes('Duraklat')&&ui.includes('Durdur')&&ui.includes('Tümünü Seç')&&ui.includes('addSelectedBulkCandidates'),'sticky dış aksiyon/seçim/ekleme akışı korunuyor');
ok(!app.expo.plugins.some(x=>Array.isArray(x)&&x[0]==='expo-build-properties'&&((x[1]?.android?.packagingOptions?.pickFirst)||[]).includes('**/libc++_shared.so')),'genel rastgele libc++ pickFirst app.json’dan kaldırıldı');
ok(plugin.includes('libmpv-owned libc++ runtime')&&plugin.includes('prepareKizilkanMpvLibcxx')&&plugin.includes('dev.jdtech.mpv:libmpv:1.0.0@aar'),'libmpv AAR-owned libc++ build entegrasyonu');
ok(gate.includes('verifyCxxSymbolCompatibility')&&gate.includes('__ndk1'),'final APK C++ ABI sembol hard-gate');
ok(mpv.includes('MPV_NATIVE_LINK_ERROR_MISSING_CXX_SYMBOL'),'MPV native linker telemetri sınıflandırması');
ok(mpv.includes('System.loadLibrary("c++_shared")')&&mpvModule.includes('System.loadLibrary("c++_shared")'),'MPV öncesi libc++ preload savunması');
ok(mpvJs.includes('isKizilkanMpvNativeReady')&&mpvJs.includes('classInitialized')&&host.includes('mpvEngineUsable()')&&host.includes('isMpvAvailable'),'motor seçimi gerçek MPV runtime hazırlığına bağlı');
ok(gate.includes('for(const abi of complete)')&&gate.includes('__from_chars_floating_point'),'final APK C++ ABI gate tüm ortak ABI çiftlerini doğruluyor');
console.log('PASS: v17.0.10 MPV + multi-scan UX + battery corrective contract TEMİZ');
