#!/usr/bin/env node
const {spawnSync}=require('child_process');
const path=require('path');
const root=path.resolve(__dirname,'..');
const checks=[
  ['tools/check-v16142-regression-contract.js', root],
  ['tools/check-v16142-integrated-hardgate.js', root],
  ['tools/checkdefs.js', path.join(root,'frontend')],['tools/checkcalls.js', path.join(root,'frontend')],
  ['tools/checkctx.js', path.join(root,'frontend')],['tools/checkhooksrc.js', path.join(root,'frontend')],
  ['tools/checkimports.js', path.join(root,'frontend')],['tools/checkdeps.js', path.join(root,'frontend')],
  ['tools/checkjsx.js', path.join(root,'frontend')],['tools/checktdz.js', path.join(root,'frontend')]
];
let failed=false;
for(const [file,cwd] of checks){
  console.log(`\n=== ${file} ===`);
  const r=spawnSync(process.execPath,[path.join(root,file)],{cwd,stdio:'inherit'});
  if(r.status!==0){failed=true;console.error(`FAIL: ${file} (${r.status})`);break;}
}
console.log('\n=== tools/check-mpv-packaging-v16142.js ===');
const mpv=spawnSync(process.execPath,[path.join(root,'tools/check-mpv-packaging-v16142.js')],{cwd:root,stdio:'inherit'});
if(mpv.status===0) console.log('MPV PACKAGING: VERIFIED');
else if(mpv.status===2) console.log('MPV PACKAGING: BLOCKED — resolved AAR veya release merged_native_libs bu kaynak arşivinde yok. Kaynak denetimi başarısız sayılmadı; release/build gate ayrı kalır.');
else { failed=true; console.error(`MPV PACKAGING GATE FAIL: ${mpv.status}`); }
if(failed) process.exit(1);
console.log('\nTEMIZ — v16.14.2 source validation suite');
