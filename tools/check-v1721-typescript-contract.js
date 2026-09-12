#!/usr/bin/env node
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('frontend/package.json'));
const app=JSON.parse(read('frontend/app.json'));
const session=read('frontend/src/utils/appSession.ts');
const diag=read('frontend/src/utils/diagnostics.ts');
const atLeast1721 = (() => {
 const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
 if(!m) return false;
 const [maj,min,patch]=m.slice(1).map(Number);
 return maj>17 || (maj===17 && (min>2 || (min===2 && patch>=1)));
})();
const checks=[
 ['version 17.2.1+', atLeast1721 && pkg.version===app.expo.version && app.expo.android.versionCode>=170201 && app.expo.ios.buildNumber===pkg.version && app.expo.extra?.kizilkanReleaseLabel===`GPT ELITE v${pkg.version} RC1`],
 ['streaming recovery mode TypeScript contract', /mode\?:\s*"single"\s*\|\s*"bulk"\s*\|\s*"unified"\s*\|\s*"streaming-file-v172"/.test(session)],
 ['diagnostics single-flight uses valid system domain', /recordDiagnostic\('system',\s*'EXPORT_SINGLE_FLIGHT_REUSED'/.test(diag)],
 ['invalid diagnostics domain removed', !/recordDiagnostic\('diagnostics',\s*'EXPORT_SINGLE_FLIGHT_REUSED'/.test(diag)],
];
let bad=0;
for(const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'}: ${name}`); if(!ok) bad++; }
if(bad){ console.error(`FAIL: ${bad} v17.2.1 TypeScript contract check(s)`); process.exit(1); }
console.log('PASS: v17.2.1+ TypeScript semantic corrective contract');
