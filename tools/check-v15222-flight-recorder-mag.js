#!/usr/bin/env node
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('./_ts');
const root=path.resolve(__dirname,'..'), front=path.join(root,'frontend'); let bad=0;
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const need=(r,t,l)=>{if(!read(r).includes(t)){console.log(`HATA — ${l}: ${t}`);bad++;}};
const pkg=JSON.parse(fs.readFileSync(path.join(front,'package.json'),'utf8')); const app=JSON.parse(fs.readFileSync(path.join(front,'app.json'),'utf8'));
if(pkg.version!==app.expo.version||Number(app.expo.android.versionCode)<150222){console.log('HATA — v15.2.22+ sürüm üçlüsü tutarsız');bad++;}
if(!/KIZILKAN_FLIGHT_RECORDER_V[45]/.test(read('frontend/src/utils/diagnostics.ts'))){console.log('HATA — Flight Recorder V4+ export yok');bad++;}
if(!/const MAX_EVENTS = (?:[1-9]\d{4,})/.test(read('frontend/src/utils/diagnostics.ts'))){console.log('HATA — JS recorder kapasitesi 10000 altı');bad++;}
need('frontend/src/utils/diagnostics.ts','JOURNAL_ARCHIVE_NAMES','çok segmentli JSONL journal');
need('frontend/src/utils/diagnostics.ts','clearEpochMs','clear epoch exit-history filtresi');
if(!/MAX_NORMAL_EVENTS = (?:[2-9]\d{4,}|[1-9]\d{5,})/.test(read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt'))){console.log('HATA — native normal kapasite 20000 altı');bad++;}
if(!/MAX_CRITICAL_DB_EVENTS = (?:[2-9]\d{3,}|[1-9]\d{4,})/.test(read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt'))){console.log('HATA — native kritik kapasite 2000 altı');bad++;}
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt','CLEAR_EPOCH','native clear epoch');
need('frontend/app/stats.tsx','clearAllProgress(), clearRecent(), clearDiagnostics()','bembeyaz istatistik/tanılama reset');
need('frontend/src/utils/stalker.ts','MAG254-legacy','MAG254 profil fallback');
need('frontend/src/utils/stalker.ts','STALKER_LIVE_FALLBACK','live ordered-list fallback');
need('frontend/src/utils/stalker.ts','STALKER_VOD_PARTIAL_FAILURE','VOD partial success');
need('frontend/src/utils/stalker.ts','STALKER_SERIES_PARTIAL_FAILURE','Series partial success');
if (!read('frontend/src/utils/stalker.ts').includes('random: primitiveString(data?.js?.random)') &&
    !read('frontend/src/utils/stalker.ts').includes('random:primitiveString(data?.js?.random)')) { console.error('HATA — handshake random koruma'); bad++; }
function compile(rel){return ts.transpileModule(fs.readFileSync(path.join(front,rel),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}
try{compile('src/utils/diagnostics.ts');compile('src/utils/stalker.ts');compile('app/stats.tsx');}catch(e){console.log('HATA — TS transpile:',e.message);bad++;}
if(bad){console.log(`\n❌ ${bad} v15.2.22 HARD-GATE HATASI`);process.exit(1);} console.log('TEMIZ — v15.2.22 Flight Recorder V4 + MAG compatibility contract');
