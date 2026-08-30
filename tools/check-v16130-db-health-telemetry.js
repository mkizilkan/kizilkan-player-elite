#!/usr/bin/env node
/** KIZILKAN PLAYER v16.13.0 — DB Health Center + safe maintenance + Flight Recorder V6 HARD gate */
const fs = require('fs');
const path = require('path');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const pkg = JSON.parse(read('frontend/package.json'));
const app = JSON.parse(read('frontend/app.json'));
const db = read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeDatabase.kt');
const ent = read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeDataEntities.kt');
const dao = read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeDataDao.kt');
const mod = read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const bb = read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt');
const diag = read('frontend/src/utils/diagnostics.ts');
const ui = read('frontend/app/diagnostic.tsx');
const nativeIndex = read('frontend/modules/kizilkan-native-core/index.ts');
const fail = m => { throw new Error(m); };
const must = (src,re,m) => { if(!re.test(src)) fail(m); };
function transpile(file, jsx=false){
 const src=read(file); const compilerOptions={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}; if(jsx) compilerOptions.jsx=ts.JsxEmit.ReactJSX; const out=ts.transpileModule(src,{compilerOptions,reportDiagnostics:true,fileName:file});
 const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 if(errors.length) fail(`${file} transpile: `+errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join(' | '));
}
function checks(){
 const [maj,min,patch]=String(pkg.version).split('.').map(Number);
 if(maj!==16||min!==13||patch<0||app.expo?.version!==pkg.version||app.expo?.android?.versionCode<161300||app.expo?.ios?.buildNumber!==pkg.version) fail('version >=16.13.0 preservation contract');
 must(db,/version\s*=\s*4/, 'Room schema v4 missing');
 must(db,/MIGRATION_3_4/, 'explicit 3->4 migration missing');
 must(db,/ALTER TABLE `diagnostic_events` ADD COLUMN `traceId`/, 'traceId migration missing');
 must(db,/ALTER TABLE `diagnostic_events` ADD COLUMN `operationId`/, 'operationId migration missing');
 if(/fallbackToDestructiveMigration/.test(db+mod)) fail('destructive migration forbidden');
 for(const field of ['traceId','operationId','stage','durationMs','outcome','errorClass']) must(ent,new RegExp(`val ${field}[: ]`),`entity field ${field} missing`);
 must(dao,/fun orphanCount\(\): Int/, 'orphan analysis DAO missing');
 must(dao,/fun deleteOrphans\(\): Int/, 'orphan cleanup DAO missing');
 must(dao,/deleteExpiredNormal/, 'telemetry retention cleanup missing');
 must(dao,/deleteExpiredCritical/, 'critical telemetry retention cleanup missing');
 must(mod,/AsyncFunction\("getDatabaseHealth"\)/, 'DB health native API missing');
 must(mod,/PRAGMA page_count/, 'page_count metric missing');
 must(mod,/PRAGMA freelist_count/, 'freelist metric missing');
 must(mod,/PRAGMA quick_check/, 'quick_check missing');
 must(mod,/PRAGMA foreign_key_check/, 'foreign key integrity missing');
 must(mod,/PRAGMA wal_checkpoint\(/, 'WAL checkpoint missing');
 must(mod,/PRAGMA optimize/, 'SQLite optimize missing');
 must(mod,/if \(mode == "deep"\)[\s\S]{0,220}VACUUM/, 'VACUUM must be deep-only');
 must(mod,/NORMAL_TELEMETRY_RETENTION_MS\s*=\s*7L/, 'normal telemetry retention contract missing');
 must(mod,/CRITICAL_TELEMETRY_RETENTION_MS\s*=\s*30L/, 'critical telemetry retention contract missing');
 must(mod,/EPG_RETENTION_SEC\s*=\s*14L/, 'EPG retention contract missing');
 must(mod,/DB_MAINTENANCE_START/, 'maintenance start telemetry missing');
 must(mod,/DB_MAINTENANCE_COMPLETED/, 'maintenance completion telemetry missing');
 must(mod,/DB_MAINTENANCE_FAILED/, 'maintenance failure telemetry missing');
 must(mod,/recommendedMaintenance/, 'measured maintenance recommendation missing');
 must(mod,/healthReasons/, 'DB health reason classification missing');
 must(mod,/logicalMediaPayloadBytes/, 'playlist logical payload byte metric missing');
 must(mod,/coerceAtLeast\(0L\)/, 'negative reclaimed-byte guard missing');
 must(mod,/totalBytesDelta/, 'signed DB size delta metric missing');
 must(bb,/traceId = obj\.optString\("traceId"/, 'native structured trace ingest missing');
 must(bb,/"traceId" to e\.traceId/, 'native trace export missing');
 must(diag,/beginDiagnosticTrace/, 'trace correlation API missing');
 must(diag,/measureDiagnosticStage/, 'stage timer API missing');
 must(diag,/buildPerformanceSummary/, 'performance aggregation missing');
 must(diag,/buildTraceSummary/, 'trace summary missing');
 must(diag,/KIZILKAN_FLIGHT_RECORDER_V6/, 'Flight Recorder V6 export missing');
 must(diag,/databaseHealth:/, 'database health export missing');
 must(diag,/Bearer \[REDACTED\]/, 'Bearer redaction hardening missing');
 must(diag,/SAFE_SENSITIVE_METADATA_KEY/, 'safe structural fingerprint metadata policy missing');
 must(nativeIndex,/getDatabaseHealth/, 'native TS health wrapper missing');
 must(nativeIndex,/runDatabaseMaintenance/, 'native TS maintenance wrapper missing');
 for(const id of ['db-maint-diagnose','db-maint-quick','db-maint-normal','db-maint-deep']) must(ui,new RegExp(id),`DB UI ${id} missing`);
 must(ui,/Derin veritabanı bakımı/, 'deep maintenance confirmation missing');
 transpile('frontend/src/utils/diagnostics.ts');
 transpile('frontend/app/diagnostic.tsx', true);
 transpile('frontend/modules/kizilkan-native-core/index.ts');
}
try { checks(); console.log('PASS: v16.13.0 DB Health Center / safe maintenance / Flight Recorder V6 TEMİZ'); }
catch(e){ console.error('FAIL: v16.13.0 HARD gate:',e?.stack||e); process.exit(1); }
