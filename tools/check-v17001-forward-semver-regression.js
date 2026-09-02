#!/usr/bin/env node
/** KIZILKAN PLAYER v17.0.1 RC1 — forward-semver regression-gate corrective release hard-gate. */
const fs=require('fs'),path=require('path'),cp=require('child_process');
const R=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(R,p),'utf8'); let bad=0;
const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}: ${m}`);if(!c)bad++;};
const pkg=JSON.parse(read('frontend/package.json')),app=JSON.parse(read('frontend/app.json'));
const [M,m,p]=pkg.version.split('.').map(Number), expected=M*10000+m*100+p;
const atLeast17001 = M>17 || (M===17 && (m>0 || (m===0 && p>=1)));
ok(atLeast17001,'frontend/package.json preserves v17.0.1+');
ok(app.expo.version===pkg.version&&app.expo.ios.buildNumber===pkg.version,'Expo/iOS version synchronized');
ok(app.expo.android.versionCode>=170001&&app.expo.android.versionCode===expected,'Android versionCode preserves v17.0.1+ and is formula-consistent');
ok(String(app.expo.extra?.kizilkanReleaseLabel||'').includes(`v${pkg.version} RC1`),'release label synchronized');
const gate16142=read('tools/check-v16142-regression-contract.js');
ok(gate16142.includes("semverAtLeast(pkg.version,'16.14.2')")&&!/maj\s*===\s*16\s*&&/.test(gate16142),'v16.14.2 regression metadata gate is forward-semver compatible');
try { cp.execFileSync(process.execPath,[path.join(__dirname,'check-v16142-regression-contract.js')],{stdio:'pipe'}); ok(true,'v16.14.2 regression contract passes on v17.0.1+'); }
catch(e){ ok(false,'v16.14.2 regression contract passes on v17.0.1+'); if(e.stdout)process.stdout.write(String(e.stdout));if(e.stderr)process.stderr.write(String(e.stderr)); }
try { cp.execFileSync(process.execPath,[path.join(__dirname,'check-v17000-tv-navigation-focus-player.js')],{stdio:'pipe'}); ok(true,'v17.0.0 TV/navigation/focus/player contract preserved'); }
catch(e){ ok(false,'v17.0.0 TV/navigation/focus/player contract preserved'); if(e.stdout)process.stdout.write(String(e.stdout));if(e.stderr)process.stderr.write(String(e.stderr)); }
const toolFiles=fs.readdirSync(path.join(R,'tools')).filter(f=>f.endsWith('.js'));
const majorLocks=[];
for(const f of toolFiles){const s=read(`tools/${f}`);if(/maj\s*===\s*16\s*&&/.test(s)&&!/maj\s*>\s*16/.test(s))majorLocks.push(f);}
ok(majorLocks.length===0,`no unguarded major-16 metadata lock remains${majorLocks.length?`: ${majorLocks.join(', ')}`:''}`);
if(bad){console.error(`FAIL — v17.0.1+ forward-semver preservation hard-gate: ${bad}`);process.exit(1)}
console.log('TEMIZ — v17.0.1+ forward-semver regression-gate preservation hard-gate');
