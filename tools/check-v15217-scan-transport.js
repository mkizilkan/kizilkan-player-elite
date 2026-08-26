#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..', 'frontend');
let bad = 0;
function src(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
function need(rel, token, label){ const s=src(rel); if(!s.includes(token)){ console.log(`HATA — ${label}: ${token}`); bad++; } }
function forbid(rel, token, label){ const s=src(rel); if(s.includes(token)){ console.log(`HATA — ${label}: yasak ${token}`); bad++; } }
need('modules/panel-scan/index.ts', 'candidateSets', 'unified candidate-set dedupe');
need('modules/panel-scan/index.ts', 'candidateSet: index', 'job candidate-set referansı');
need('modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt', 'panel-scan-staging', 'app-private scan staging');
need('modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt', 'putExtra("stagingKey", runId)', 'küçük Intent staging anahtarı');
forbid('modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt', 'putExtra("jobsJson", jobsJson)', 'büyük jobs JSON Intent/Binder taşıması');
need('modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt', 'runUnifiedScanFromStaging', 'service staging okuma');
need('modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt', 'setProcessStateSummary', 'process death state summary');
need('modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt', 'setDefaultUncaughtExceptionHandler', 'Java crash flight recorder');
need('modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt', 'previous.uncaughtException(thread, error)', 'crash handler default zinciri');
need('modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt', 'WORKER_FAILED', 'worker exception görünürlüğü');
need('modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt', 'AtomicReference<Throwable?>', 'worker failure propagation');
need('modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt', 'processStateSummary', 'exit history process summary bridge');
need('app/stats.tsx', 'Son Java crash', 'scan crash UI');
need('app/stats.tsx', 'Ölüm öncesi durum', 'process summary UI');
need('src/utils/stalker.ts', 'STALKER_ENDPOINT_ATTEMPT', 'MAG endpoint katmanlı tanılama');
need('src/utils/stalker.ts', 'contentType', 'MAG response content-type tanılama');
need('src/utils/stalker.ts', 'redirected', 'MAG redirect tanılama');
need('src/utils/stalker.ts', 'kind = /^</.test(trimmed) ? "HTML" : "NON_JSON"', 'MAG non-JSON sınıflandırma');

async function compactFixture(){
  const source = src('modules/panel-scan/index.ts');
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  let payload = null;
  const native = {
    startUnifiedScan: async (json) => { payload = JSON.parse(json); return {accepted:true,state:'STARTING',runId:'r',activeRunId:'r'}; },
    getDiagnosticEvents:()=> '[]', getSnapshot:()=> '{}', getLastCrash:()=> '{}'
  };
  const req = (id) => id === 'expo-modules-core' ? { requireNativeModule:()=>native } : require(id);
  const box={module:{exports:{}},exports:{},require:req,console,JSON,Map,URL,URLSearchParams}; box.exports=box.module.exports;
  vm.runInNewContext(js,box,{filename:'panel-scan/index.ts'});
  const m=box.module.exports;
  const candidates=[{panelName:'A',code:'1',server:'http://a'},{panelName:'B',code:'2',server:'http://b'}];
  await m.PanelScan.startUnifiedScan([
    {row:1,name:'u1',username:'u1',password:'p1',candidates},
    {row:2,name:'u2',username:'u2',password:'p2',candidates:[...candidates]},
  ],8,8000);
  if(!payload || payload.version!==2 || payload.candidateSets.length!==1 || payload.jobs.length!==2 || payload.jobs[0].candidateSet!==0 || payload.jobs[1].candidateSet!==0){
    throw new Error('candidate-set dedupe fixture başarısız');
  }
  if('candidates' in payload.jobs[0] || 'candidates' in payload.jobs[1]) throw new Error('jobs içinde duplicate candidates kaldı');
}

const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
const parts = String(pkg.version || '').split('.').map(Number);
const expectedCode = parts.length===3 && parts.every(Number.isFinite) ? parts[0]*10000 + parts[1]*100 + parts[2] : null;
if(app?.expo?.version !== pkg.version){ console.log(`HATA — app/package version uyumsuz: ${app?.expo?.version}/${pkg.version}`); bad++; }
if(expectedCode===null || Number(app?.expo?.android?.versionCode)!==expectedCode){ console.log(`HATA — versionCode uyumsuz: ${app?.expo?.android?.versionCode}; beklenen ${expectedCode}`); bad++; }
(async()=>{
  try { await compactFixture(); } catch(e){ console.log('HATA — compact unified fixture:', e.message); bad++; }
  if(bad){ console.log(`\n❌ ${bad} v15.2.17 SCAN TRANSPORT HATASI`); process.exit(1); }
  console.log('TEMIZ — v15.2.17 scan transport / crash diagnostics / MAG connection contract');
})();
