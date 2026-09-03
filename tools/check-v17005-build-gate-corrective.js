#!/usr/bin/env node
const fs=require('fs'),path=require('path'); const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8'); let fail=0;
function ok(name,c){console.log(`${c?'PASS':'FAIL'} — ${name}`); if(!c) fail++;}
const pkg=JSON.parse(read('frontend/package.json')), app=JSON.parse(read('frontend/app.json'));
const legacy=read('tools/check-v15224-rc2-memory-native.js');
const svc=read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
const v17004=read('tools/check-v17004-ultra-scale-account-archive.js');
const parts=String(pkg.version||'0.0.0').split('.').map(Number); const semver=parts[0]*1000000+parts[1]*1000+parts[2];
ok('package v17.0.5+',semver>=17000005);
const ep=String(app.expo.version||'0.0.0').split('.').map(Number); const expoSemver=ep[0]*1000000+ep[1]*1000+ep[2];
ok('Expo v17.0.5+',expoSemver>=17000005);
ok('versionCode 170005+',Number(app.expo.android.versionCode)>=170005);
const lm=String(app.expo.extra.kizilkanReleaseLabel||'').match(/^GPT ELITE v(\d+)\.(\d+)\.(\d+) RC1$/); const labelSemver=lm?Number(lm[1])*1000000+Number(lm[2])*1000+Number(lm[3]):0;
ok('release label v17.0.5+',labelSemver>=17000005);
ok('native resolver remains 64-bit',svc.includes('fun resolveWork(index: Long): Pair<Int, Int>'));
ok('legacy RC2 gate accepts Long resolver',legacy.includes('needAny(scan')&&legacy.includes('fun resolveWork(index: Long): Pair<Int, Int>'));
ok('v17.0.4 preservation gate is forward-compatible',v17004.includes("package v17.0.4+")&&v17004.includes('versionCode 170004+'));
if(fail){console.error(`\n${fail} v17.0.5 corrective gate başarısız.`);process.exit(1)}
console.log('\nTEMIZ — v17.0.5 RC1 build-gate forward-compat corrective');
