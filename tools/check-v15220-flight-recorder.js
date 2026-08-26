#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const froot = path.join(root, 'frontend');
let bad = 0;
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const need = (rel, token, label) => { const s=read(rel); if(!s.includes(token)){ console.log(`HATA — ${label}: ${token}`); bad++; } };
const forbid = (rel, token, label) => { const s=read(rel); if(s.includes(token)){ console.log(`HATA — ${label}: yasak ${token}`); bad++; } };
const pkg = JSON.parse(fs.readFileSync(path.join(froot,'package.json'),'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(froot,'app.json'),'utf8'));
const parts=String(pkg.version||'').match(/^(\d+)\.(\d+)\.(\d+)$/);
const expectedCode=parts ? Number(parts[1])*10000 + Number(parts[2])*100 + Number(parts[3]) : -1;
if(!parts || expectedCode < 150220) { console.log(`HATA — package ${pkg.version} v15.2.20 altında`); bad++; }
if(app?.expo?.version !== pkg.version || Number(app?.expo?.android?.versionCode)!==expectedCode){ console.log(`HATA — app/package sürüm tutarsız: ${app?.expo?.version}/${app?.expo?.android?.versionCode} package=${pkg.version}`); bad++; }

// v15.2.19 CI TS2322 kök nedeninin gerçek düzeltmesi: Promise<void> kuyruğu boolean döndürmemeli.
need('frontend/src/store/PlaylistContext.tsx', '.then(async () => {', 'playlist persist queue void callback');
need('frontend/src/store/PlaylistContext.tsx', 'await storage.setItem(key, id);', 'playlist persist await');
forbid('frontend/src/store/PlaylistContext.tsx', '.then(() => storage.setItem(key, id))', 'Promise<boolean> -> Promise<void> regresyonu');

// Native uçuş kayıt sistemi.
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeDataEntities.kt', 'data class DiagnosticEventEntity', 'Room diagnostic entity');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeDataDao.kt', 'interface DiagnosticEventDao', 'Room diagnostic DAO');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeDatabase.kt', 'version = 3', 'Room schema v3');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeDatabase.kt', 'MIGRATION_2_3', 'Room 2→3 migration');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt', 'object NativeBlackBox', 'native flight recorder core');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt', 'UNCAUGHT_EXCEPTION', 'native crash journal');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt', 'ANR_WATCHDOG_STALL', 'ANR watchdog evidence');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt', 'previous.uncaughtException(thread, throwable)', 'crash handler delegate');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt', 'setProcessStateSummary', 'ApplicationExitInfo checkpoint');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt', 'MAX_CRITICAL_FILE_BYTES', 'critical journal rotation');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt', 'appendBlackBoxEvent', 'native event bridge');
need('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt', 'getBlackBoxSnapshot', 'native snapshot bridge');

// JS coordinator + privacy + export.
need('frontend/src/utils/diagnostics.ts', 'KIZILKAN_FLIGHT_RECORDER_V3', 'Flight Recorder V3 export');
need('frontend/src/utils/diagnostics.ts', 'appendBlackBoxEvent', 'native-first persistence');
need('frontend/src/utils/diagnostics.ts', 'appendCriticalBlackBoxEvent', 'terminal olay sync critical journal');
need('frontend/src/utils/diagnostics.ts', 'setBlackBoxCheckpoint', 'process checkpoint correlation');
need('frontend/src/utils/diagnostics.ts', 'processExitHistory', 'exit-history export');
need('frontend/src/utils/diagnostics.ts', 'runtimeAtExport', 'runtime snapshot export');
need('frontend/src/utils/diagnostics.ts', 'deriveAnomalies', 'automatic anomaly classifier');
need('frontend/src/utils/diagnostics.ts', 'SENSITIVE_KEY', 'privacy sanitizer');
need('frontend/src/utils/diagnostics.ts', "u.username = ''; u.password = '';", 'URL credential scrub');
need('frontend/app/_layout.tsx', 'initializeDiagnostics', 'startup initialization');
need('frontend/app/_layout.tsx', 'APP_BACKGROUND', 'lifecycle background event');
need('frontend/app/_layout.tsx', 'APP_FOREGROUND', 'lifecycle foreground event');
need('frontend/app/_layout.tsx', 'ROUTE_CHANGED', 'navigation route correlation');
need('frontend/app/stats.tsx', 'Flight Recorder v', 'flight recorder health UI');
need('frontend/app/stats.tsx', 'ANR watchdog', 'watchdog UI health');
need('tools/denetle.js', 'check-v15220-flight-recorder.js', 'v15.2.20 gate ana zincirde');

if (bad) { console.log(`\n❌ ${bad} v15.2.20 FLIGHT RECORDER HATASI`); process.exit(1); }
console.log('TEMIZ — v15.2.20 TypeScript corrective + native Flight Recorder v3 contracts');
