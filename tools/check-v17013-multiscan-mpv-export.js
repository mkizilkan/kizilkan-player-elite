#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('frontend/package.json'));
const app=JSON.parse(read('frontend/app.json'));
const add=read('frontend/app/add-playlist.tsx');
const bulk=read('frontend/src/utils/bulkAccounts.ts');
const diag=read('frontend/src/utils/diagnostics.ts');
const mpv=read('frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvView.kt');
const plugin=read('frontend/plugins/withMpvRuntime.js');
const denetle=read('tools/denetle.js');
function ok(c,m){if(!c){console.error('FAIL — '+m);process.exit(1)}console.log('✓ '+m)}
const semverAtLeast=(v,min)=>{const a=String(v).split('.').map(Number),b=String(min).split('.').map(Number);for(let i=0;i<3;i++){if((a[i]||0)>(b[i]||0))return true;if((a[i]||0)<(b[i]||0))return false}return true};
ok(semverAtLeast(pkg.version,'17.0.13')&&semverAtLeast(app.expo.version,'17.0.13')&&semverAtLeast(app.expo.ios.buildNumber,'17.0.13')&&app.expo.android.versionCode>=170013&&String(app.expo.extra?.kizilkanReleaseLabel||'').startsWith('GPT ELITE v17.'),'v17.0.13+ sürüm zinciri');
ok(add.includes('const [bulkFileParsed, setBulkFileParsed]')&&add.includes('const file = bulkFileParsed ??'),'büyük dosya tek-parse sonucu state ile tekrar kullanıluyor');
ok(!add.includes('bulkFileText.trim() ? parseBulkAccounts(bulkFileText)'),'dosya ikinci kez parse edilmiyor');
ok(add.includes('removeClippedSubviews={false}'),'Android/Fabric clipping crash yolu kapalı');
ok(add.includes('BULK_FILE_PREVIEW_READY')&&add.includes('parseMs:')&&add.includes('singleParse: true'),'büyük dosya import telemetry mevcut');
ok(bulk.includes('const rawLines = raw.split(/\\r?\\n/);')&&bulk.includes('for (const rawLine of rawLines)'),'parser map/filter ara kopyaları kaldırılmış');
ok(mpv.includes('surfaceView.background = null')&&!mpv.includes('surfaceView.setBackgroundColor(Color.BLACK)'),'MPV SurfaceView opak child background kaldırılmış');
ok(mpv.includes('surfaceSnapshot(holder)')&&mpv.includes('"surfaceValid"')&&mpv.includes('"hasBackground"'),'MPV surface görünürlük telemetry mevcut');
ok(diag.includes('Promise.all([eventsPromise, nativePromise, databasePromise])'),'Flight Recorder bağımsız snapshotları paralel okunuyor');
ok(diag.includes("'FLIGHT_EXPORT_TIMING'")&&diag.includes('preShareMs:')&&diag.includes('stringifyMs'),'Flight Recorder export aşama telemetry mevcut');
ok(plugin.includes('t.dependsOn(prepareKizilkanMpvLibcxx)')&&plugin.includes('dev.jdtech.mpv:libmpv:1.0.0@aar'),'v17.0.12 MPV Gradle/libc++ build düzeltmesi korunuyor');
ok(denetle.includes('["check-v17013-multiscan-mpv-export.js", "v17.0.13 multi-account Fabric/import + MPV surface + Flight export hard-gate", ""]'),'v17.0.13 gate denetle zincirine bağlı');
console.log('PASS: v17.0.13 multi-account + MPV surface + Flight export corrective contract TEMİZ');
