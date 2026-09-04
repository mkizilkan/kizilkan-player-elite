#!/usr/bin/env node
// v17.1.0 BUILD-GATE CORRECTIVE: forward-semver version acceptance; feature assertions unchanged.
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let fail=0;
function req(ok,msg){ if(!ok){console.error('HATA:',msg); fail++;} }
const pkg=JSON.parse(read('frontend/package.json'));
const app=JSON.parse(read('frontend/app.json'));
const index=read('frontend/app/index.tsx');
const profile=read('frontend/app/profile-select.tsx');
const add=read('frontend/app/add-playlist.tsx');
const session=read('frontend/src/utils/appSession.ts');
const mod=read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt');
const service=read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
const bridge=read('frontend/modules/panel-scan/index.ts');
const manifest=read('frontend/modules/panel-scan/android/src/main/AndroidManifest.xml');
const semver=v=>String(v||'').split('.').map(Number); const atLeast=(v,a,b,c)=>{const x=semver(v);return (x[0]>a)||(x[0]===a&&x[1]>b)||(x[0]===a&&x[1]===b&&x[2]>=c)};
req(atLeast(pkg.version,17,0,6),'package version 17.0.6+ değil');
req(app.expo?.version===pkg.version && Number(app.expo?.android?.versionCode)>=170006,'app/versionCode 17.0.6+ değil');
req(index.includes('recoverableScan') && index.includes('setScanRecoveryIntent') && index.includes('router.replace("/add-playlist")'),'bootstrap scan recovery route eksik');
req(profile.includes('postAuthRoute') && profile.includes('getScanRecoveryIntent') && !profile.includes('recent === "/add-playlist"'),'PIN/profile recovery intent veya bayat route koruması eksik');
req(session.includes('kizilkan.scanRecovery.v17.0.6') && session.includes('clearScanRecoveryIntent'),'kalıcı recovery intent eksik');
req(add.includes('scan.mode === "single"') && add.includes('Native panel taraması geri yüklendi'),'single/server-discovery snapshot restore eksik');
req(add.includes('confirmBackgroundScanProtection') && add.includes('getBatteryOptimizationStatus'),'pil optimizasyonu kullanıcı akışı eksik');
req(mod.includes('isIgnoringBatteryOptimizations') && mod.includes('ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS'),'native battery status/settings eksik');
req(bridge.includes('openBatteryOptimizationSettings') && bridge.includes('getBatteryOptimizationStatus'),'TS battery bridge eksik');
req(manifest.includes('FOREGROUND_SERVICE_DATA_SYNC') && manifest.includes('foregroundServiceType="dataSync"'),'foreground dataSync contract eksik');
req(service.includes('startForeground(NOTIF_ID') && service.includes('START_NOT_STICKY'),'foreground service davranışı beklenmedik');
req(add.includes('scan.mode === "bulk" || scan.mode === "unified"'),'bulk/unified restore korunmadı');
if(fail){console.error(`FAIL: ${fail} v17.0.6 gate hatası`); process.exit(1);} console.log('PASS: v17.0.6 background scan recovery / battery protection contract TEMİZ');
