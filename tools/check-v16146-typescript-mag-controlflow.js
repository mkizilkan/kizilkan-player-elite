#!/usr/bin/env node
const fs=require('fs'),path=require('path'),cp=require('child_process'),os=require('os');
const R=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(R,p),'utf8'); let bad=0;
const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}: ${m}`); if(!c) bad++;};
const pkg=JSON.parse(read('frontend/package.json')), app=JSON.parse(read('frontend/app.json')), add=read('frontend/app/add-playlist.tsx');
const [M,m,p]=pkg.version.split('.').map(Number), expected=M*10000+m*100+p;
const semver=v=>{const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/);return m?Number(m[1])*1000000+Number(m[2])*1000+Number(m[3]):-1;};
ok(semver(pkg.version)>=semver('16.14.6')&&app.expo.version===pkg.version&&app.expo.android.versionCode===expected,'v16.14.6+ metadata synchronized');
ok(app.expo.ios.buildNumber===pkg.version&&String(app.expo.extra?.kizilkanReleaseLabel||'').includes(pkg.version),'iOS/release label synchronized');
ok(add.includes('} else if (method === "stalker") {'),'MAG branch explicit TypeScript control-flow branch');
ok(!add.includes('magEnrichment'),'obsolete unreachable magEnrichment bridge removed after behavior migration');
const stalker=add.indexOf('} else if (method === \"stalker\") {');
const catchPos=add.indexOf('} catch (e: any)',stalker);
ok(stalker>0&&catchPos>stalker,'explicit MAG terminal branch exists');
if(stalker>0&&catchPos>stalker){const tail=add.slice(stalker,catchPos); ok(!/magEnrichment/.test(tail),'MAG branch has no obsolete unreachable enrichment bridge');}
ok(add.indexOf('commitPlaylist(shell)')>0&&add.indexOf('commitPlaylist(shell)')<add.indexOf('stalkerCatalog(cred, session'),'verified MAG persist still precedes catalog');
ok(/liveOnly:\s*true/.test(add)&&add.includes('void bootstrap(false)'),'live-first and non-blocking async catalog preserved');
ok(add.includes('onProgress: interactiveSelection ? (progress) => setProgress(progress.message) : undefined'),'interactive MAG progress callback preserved');
// Local semantic regression probe: global TypeScript may run without project deps. We intentionally
// noResolve + wildcard-stub unresolved imports and ONLY fail on the exact historical control-flow codes
// in the corrected submit block (TS2367 overlap / TS2339 never-property).
try{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kizilkan-v16146-'));
  const stub=path.join(tmp,'stubs.d.ts'); fs.writeFileSync(stub,'declare module "*";\ndeclare namespace JSX { interface IntrinsicElements { [k:string]: any } }\n');
  const tsc=process.env.TSC_BIN||'tsc';
  const r=cp.spawnSync(tsc,['--noEmit','--noResolve','--skipLibCheck','--jsx','react-jsx','--target','ES2022','--module','ESNext','--moduleResolution','Bundler',stub,path.join(R,'frontend/app/add-playlist.tsx')],{encoding:'utf8'});
  const out=(r.stdout||'')+(r.stderr||'');
  const lines=out.split(/\r?\n/).filter(Boolean);
  const regress=lines.filter(line=>{
    const m=line.match(/add-playlist\.tsx\((\d+),(\d+)\): error TS(2367|2339):/); if(!m) return false;
    return Number(m[1])>=1500 && Number(m[1])<=1750;
  });
  ok(regress.length===0,'TypeScript semantic probe has no TS2367/TS2339 in MAG/generic commit block');
  if(regress.length) console.log(regress.join('\n'));
  fs.rmSync(tmp,{recursive:true,force:true});
}catch(e){console.log('FAIL: TypeScript semantic probe could not run:',e.message);bad++;}
if(bad){console.error(`FAIL — v16.14.6+ TypeScript/MAG control-flow hard-gate: ${bad}`);process.exit(1)}
console.log('TEMIZ — v16.14.6+ TypeScript control-flow + MAG persistence/progress preservation');
