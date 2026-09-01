#!/usr/bin/env node
const fs=require('fs'),path=require('path'),ts=require('./_ts');
const root=path.resolve(__dirname,'..'), front=path.join(root,'frontend'); let bad=0;
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const need=(r,t,l)=>{if(!read(r).includes(t)){console.log(`HATA — ${l}: ${t}`);bad++;}};
const pkg=JSON.parse(fs.readFileSync(path.join(front,'package.json'),'utf8'));
const app=JSON.parse(fs.readFileSync(path.join(front,'app.json'),'utf8'));
const _sv=v=>{const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/);return m?Number(m[1])*1000000+Number(m[2])*1000+Number(m[3]):-1;};
const _code=v=>{const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/);return m?Number(m[1])*10000+Number(m[2])*100+Number(m[3]):-1;};
// v16.1.0: denetleyici 15.2 serisine KİLİTLİYDİ; sürüm yükselince kaçınılmaz kırılıyordu.
// Amaç korunuyor: sürüm en az 15.2.23 olmalı ve üçlü tutarlı olmalı.
if(_sv(pkg.version)<_sv('15.2.23')||String(app.expo.version)!==String(pkg.version)||Number(app.expo.android.versionCode)!==_code(pkg.version)||Number(app.expo.android.versionCode)<150223){console.log('HATA — sürüm üçlüsü tutarsız veya asgari sürümün altında');bad++;}
{ const d=read('frontend/src/utils/diagnostics.ts'); const m=d.match(/KIZILKAN_FLIGHT_RECORDER_V(\d+)/); if(!m || Number(m[1])<5){ console.log('HATA — Flight Recorder V5+ export'); bad++; } }
need('frontend/src/utils/diagnostics.ts','const MAX_EVENTS = 50000','JS recorder 50K kapasite');
need('frontend/src/utils/diagnostics.ts','Array.from({ length: 7 }','8 segmentli JSONL journal');
need('frontend/src/utils/diagnostics.ts','32 * 1024 * 1024','32 MiB journal segmenti');
need('frontend/src/utils/diagnostics.ts','storage.removeItem(V4_KEY)','V4 legacy temizleme');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt','MAX_NORMAL_EVENTS = 100000','native 100K normal kapasite');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt','MAX_CRITICAL_DB_EVENTS = 10000','native 10K kritik kapasite');
need('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt','Function("clearDiagnostics")','native scan geçmiş temizleme');
need('frontend/modules/panel-scan/index.ts','clearDiagnostics: ()','scan JS bridge temizleme');
need('frontend/app/stats.tsx','PanelScan.clearDiagnostics()','istatistik ekranı scan temizleme');
need('frontend/src/utils/stalker.ts','STALKER_HTTP_RESPONSE','MAG HTTP uçtan uca telemetri');
need('frontend/src/utils/stalker.ts','STALKER_HTTP_TRANSPORT_ERROR','MAG transport telemetri');
need('frontend/src/utils/stalker.ts','STALKER_HTTP_PARSE_ERROR','MAG parse telemetri');
function compile(rel){return ts.transpileModule(fs.readFileSync(path.join(front,rel),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;}
try{compile('src/utils/diagnostics.ts');compile('src/utils/stalker.ts');compile('app/stats.tsx');compile('modules/panel-scan/index.ts');}catch(e){console.log('HATA — TS transpile:',e.message);bad++;}
if(bad){console.log(`\n❌ ${bad} v15.2.23 HARD-GATE HATASI`);process.exit(1);} console.log('TEMIZ — v15.2.23 Flight Recorder V5 + total reset + MAG HTTP telemetry contract');
