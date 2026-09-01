const fs=require('fs');
function ok(c,m){if(!c){console.error('FAIL — '+m);process.exit(1)} console.log('✓ '+m)}
const pkg=JSON.parse(fs.readFileSync('frontend/package.json','utf8'));
const app=JSON.parse(fs.readFileSync('frontend/app.json','utf8'));
const types=fs.readFileSync('frontend/src/types/index.ts','utf8');
const diag=fs.readFileSync('frontend/src/utils/diagnostics.ts','utf8');
const kt=fs.readFileSync('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt','utf8');
const stalker=fs.readFileSync('frontend/src/utils/stalker.ts','utf8');
ok(pkg.version==='16.14.1','version 16.14.1');
ok(app.expo.android.versionCode===161401,'versionCode 161401');
ok(types.includes('catalogSync?:'),'catalog sync schema');
ok(types.includes('magCapabilities?:'),'MAG capability schema');
ok(diag.includes('KIZILKAN_FLIGHT_RECORDER_V7'),'Flight Recorder export V7');
ok(kt.includes('httpProtocol')&&kt.includes('addressFamilies')&&kt.includes('cookieTrailingSemicolon'),'native safe wire metadata');
ok(!kt.includes('hostAddress'),'no plaintext resolved IP telemetry');
ok(stalker.includes('wireHeaderSequence')&&stalker.includes('cookieHasEncodedMac'),'JS wire telemetry forwarding');
console.log('TEMIZ — v16.14.1 recovery checkpoint gate');
