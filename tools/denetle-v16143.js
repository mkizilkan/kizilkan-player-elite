#!/usr/bin/env node
const {spawnSync}=require('child_process'); const path=require('path');
const root=path.resolve(__dirname,'..');
const checks=[
 ['tools/check-v16143-regression-contract.js',root],['tools/check-v16143-corrective-hardgate.js',root],
 ['tools/checkdefs.js',path.join(root,'frontend')],['tools/checkcalls.js',path.join(root,'frontend')],
 ['tools/checkctx.js',path.join(root,'frontend')],['tools/checkhooksrc.js',path.join(root,'frontend')],
 ['tools/checkimports.js',path.join(root,'frontend')],['tools/checkdeps.js',path.join(root,'frontend')],
 ['tools/checkjsx.js',path.join(root,'frontend')],['tools/checktdz.js',path.join(root,'frontend')]
];
let failed=false;
for(const [file,cwd] of checks){console.log(`\n=== ${file} ===`);const r=spawnSync(process.execPath,[path.join(root,file)],{cwd,stdio:'inherit'});if(r.status!==0){failed=true;console.error(`FAIL: ${file} (${r.status})`);break}}
if(failed)process.exit(1);
console.log('\n=== tools/check-mpv-packaging-v16143.js ===');
const mpv=spawnSync(process.execPath,[path.join(root,'tools/check-mpv-packaging-v16143.js')],{cwd:root,stdio:'inherit'});
if(mpv.status===0) console.log('MPV RELEASE PACKAGING: VERIFIED');
else if(mpv.status===2) console.log('MPV RELEASE PACKAGING: NOT VERIFIED YET — build artefact yok; bu PREBUILD kaynak kontrolünde beklenen durumdur.');
else {console.error(`MPV PACKAGING GATE FAIL: ${mpv.status}`);process.exit(1)}
console.log('\nSOURCE PREBUILD: PASS');
console.log(`MPV RELEASE PACKAGING: ${mpv.status===0?'VERIFIED':'NOT VERIFIED'}`);
console.log(`OVERALL RELEASE: ${mpv.status===0?'SOURCE+MPV PACKAGING VERIFIED (device smoke yine gerekir)':'NOT VERIFIED — build/device adımları bekliyor'}`);
