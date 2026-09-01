#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..'), read=p=>fs.readFileSync(path.join(R,p),'utf8');
let bad=0; const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}: ${m}`); if(!c)bad++};
const pkg=JSON.parse(read('frontend/package.json')), app=JSON.parse(read('frontend/app.json'));
const wf=read('.github/workflows/build-apk.yml'), den=read('tools/denetle.js');
const expected=(()=>{const [M,m,p]=pkg.version.split('.').map(Number);return M*10000+m*100+p})();
const [maj,min,pat]=pkg.version.split('.').map(Number);
ok((maj>16||(maj===16&&(min>14||(min===14&&pat>=4))))&&app.expo.version===pkg.version&&app.expo.android.versionCode===expected,'v16.14.4+ metadata synchronized');
ok(app.expo.ios.buildNumber===pkg.version&&String(app.expo.extra?.kizilkanReleaseLabel||'').includes(pkg.version),'iOS/release label synchronized');
ok(wf.includes('workflow_dispatch:'),'manual workflow trigger preserved');
ok(wf.includes('yarn install --frozen-lockfile --production=false'),'frozen lockfile + devDependencies CI install');
ok(wf.includes('TypeScript CLI on-kontrolu - HARD gate')&&wf.includes("require.resolve('typescript/bin/tsc')")&&wf.includes('yarn exec tsc --version'),'TypeScript preflight proof');
ok(wf.includes('node ../tools/denetle.js')&&wf.includes('yarn exec tsc --noEmit'),'master + semantic TypeScript gates');
ok(wf.includes('check-mpv-packaging-v16143.js --apk'),'final APK MPV native gate wired after build');
ok(wf.indexOf('check-mpv-packaging-v16143.js --apk')>wf.indexOf('APK derle'),'MPV APK gate runs after Gradle build');
ok(wf.includes('apksigner')&&wf.includes('EXPECTED_VERSION_CODE')&&wf.includes('ANDROID_CERT_SHA256'),'APK identity/signature gate preserved');
ok(den.includes('check-v16143-regression-contract.js')&&den.includes('check-v16143-corrective-hardgate.js')&&den.includes('check-v16144-ci-hardening.js'),'master gate includes current preservation/corrective/CI gates');
ok(fs.existsSync(path.join(R,'.github/workflows/build-apk.yml')),'workflow file packaged in source tree');
if(bad){console.error(`FAIL — v16.14.4 CI hardening: ${bad}`);process.exit(1)}
console.log('TEMIZ — v16.14.4 CI / legacy-forward / MPV release-chain hard-gate');
