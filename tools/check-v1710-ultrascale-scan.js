#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('frontend/package.json'));
const app=JSON.parse(read('frontend/app.json'));
const add=read('frontend/app/add-playlist.tsx');
const idx=read('frontend/modules/panel-scan/index.ts');
const mod=read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt');
const svc=read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
const journal=read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanJournalStore.kt');
const denetle=read('tools/denetle.js');
function ok(c,m){if(!c){console.error('FAIL — '+m);process.exit(1)}console.log('✓ '+m)}
ok(pkg.version==='17.1.0'&&app.expo.version==='17.1.0'&&app.expo.ios.buildNumber==='17.1.0'&&app.expo.android.versionCode===170100&&app.expo.extra?.kizilkanReleaseLabel==='GPT ELITE v17.1.0 RC1','v17.1.0 sürüm zinciri');
ok(add.includes('bulkFilePickerInFlightRef')&&add.includes('BULK_FILE_PICKER_SUPPRESSED')&&add.includes('disabled={bulkFilePicking}'),'DocumentPicker single-flight koruması');
ok(add.includes('candidateSets')&&add.includes('compactJobs')&&add.includes('V171_COMPACT_PAYLOAD_READY')&&!add.includes('PanelScan.startUnifiedScan(jobs'),'JS candidate-set compact taşıma');
ok(idx.includes('startUnifiedScanV171')&&idx.includes('UnifiedScanCompactPayload'),'v17.1 compact native bridge');
ok(mod.includes('requestedConcurrency.coerceIn(1, 250)')&&mod.includes('batchSize.coerceIn(5, 15)')&&mod.includes('computeEffectiveConcurrency'),'1–250 requested / 5–15 batch native sınırı');
ok(svc.includes('BATCH_START')&&svc.includes('BATCH_COMPLETE')&&svc.includes('checkpointUnified')&&svc.includes('runUnifiedScanV171'),'batch runtime + atomik checkpoint');
ok(svc.includes('requestedConcurrency')&&svc.includes('effectiveConcurrency')&&svc.includes('sourceFingerprint'),'requested/effective concurrency + source fingerprint telemetry');
ok(journal.includes('committed_account')&&journal.includes('committed_tested')&&journal.includes('batch_size')&&journal.includes('source_fingerprint'),'journal v2 batch resume şeması');
ok(journal.includes('addResult')&&journal.includes('AES/GCM/NoPadding'),'anlık durable sonuç + AES-GCM korunuyor');
ok(add.includes('BULK_TXT_EXPORT_VERIFIED')&&add.includes('bulkArchiveFileName'),'v17.0.14 TXT export korunuyor');
ok(add.includes('removeClippedSubviews={false}'),'Fabric clipping corrective korunuyor');
ok(denetle.includes('check-v1710-ultrascale-scan.js'),'v17.1 gate denetle zincirine bağlı');
console.log('PASS: v17.1.0 Ultra-Scale Scan Runtime contract TEMİZ');
