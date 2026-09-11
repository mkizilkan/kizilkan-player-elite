#!/usr/bin/env node
const fs=require('fs'),path=require('path'); const root=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const mod=read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt');
const svc=read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
const idx=read('frontend/modules/panel-scan/index.ts'); const ui=read('frontend/app/add-playlist.tsx');
const checks=[
 ['streaming API',/startStreamingFileScanV172/.test(mod)&&/startStreamingFileScanV172/.test(idx)],
 ['ContentResolver 64K streaming',/openInputStream/.test(svc)&&/BufferedReader\(InputStreamReader\(stream, Charsets\.UTF_8\), 64 \* 1024\)/.test(svc)],
 ['bounded backpressure queue',/ArrayBlockingQueue<StreamAccountV172>/.test(svc)&&/queueCapacity/.test(svc)],
 ['producer consumer split',/producerDone/.test(svc)&&/worker/.test(svc)],
 ['adaptive effective concurrency',/val adaptiveLimit = AtomicInteger/.test(svc)&&/effectiveConcurrency/.test(svc)],
 ['immediate encrypted journal result',/journal\.addResult/.test(svc)&&/checkpointUnified/.test(svc)],
 ['pause cancel aware',/paused/.test(svc)&&/cancel/.test(svc)],
 ['recovery mode',/streaming-file-v172/.test(svc)&&/ACTION_RECOVER/.test(svc)&&/accountCursor/.test(svc)&&/checkpointUnified/.test(svc)],
 ['UI uses native inspect + streaming scan',/inspectBulkAccountsFile/.test(ui)&&/runNativeStreamingBulkFile/.test(ui)&&/bulkFileStreamSource/.test(ui)],
]; let bad=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${n}`);if(!ok)bad++;} if(bad)process.exit(1); console.log('PASS: v17.2.0 native producer/consumer streaming scan pipeline');
