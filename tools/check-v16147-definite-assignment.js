#!/usr/bin/env node
const fs=require('fs'),path=require('path'),cp=require('child_process'),os=require('os');
const R=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(R,p),'utf8'); let bad=0;
const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}: ${m}`);if(!c)bad++;};
const pkg=JSON.parse(read('frontend/package.json')), app=JSON.parse(read('frontend/app.json')), add=read('frontend/app/add-playlist.tsx');
const [M,m,p]=pkg.version.split('.').map(Number), expected=M*10000+m*100+p;
ok(pkg.version==='16.14.7'&&app.expo.version===pkg.version&&app.expo.android.versionCode===expected,'v16.14.7 metadata synchronized');
ok(app.expo.ios.buildNumber===pkg.version&&String(app.expo.extra?.kizilkanReleaseLabel||'').includes(pkg.version),'iOS/release label synchronized');
const submitStart=add.indexOf('const submit = async');
const submitEnd=add.indexOf('const methods:',submitStart);
const submit=submitStart>=0&&submitEnd>submitStart?add.slice(submitStart,submitEnd):add;
ok(!/let\s+playlist\s*:\s*Playlist\s*;/.test(submit),'unassigned shared Playlist declaration removed');
ok(submit.includes('const commitLegacyParsedPlaylist = async (candidate: Playlist) =>'),'branch-owned M3U finalizer exists');
ok(submit.includes('const m3uPlaylist: Playlist = {')&&submit.includes('commitLegacyParsedPlaylist(m3uPlaylist)'),'M3U URL owns and commits its definite Playlist');
ok(submit.includes('const filePlaylist: Playlist = {')&&submit.includes('commitLegacyParsedPlaylist(filePlaylist)'),'M3U file owns and commits its definite Playlist');
ok(!/\bplaylist!\b/.test(submit)&&!/\bplaylist\s+as\s+Playlist\b/.test(submit),'no non-null/type-assertion compiler bypass for playlist');
ok(submit.includes('} else if (method === "stalker") {'),'MAG remains explicit terminal branch');
ok(submit.indexOf('commitPlaylist(shell)')>0&&submit.indexOf('commitPlaylist(shell)')<submit.indexOf('stalkerCatalog(cred, session'),'verified MAG persist still precedes catalog');
ok(/liveOnly:\s*true/.test(submit)&&submit.includes('void bootstrap(false)'),'MAG live-first async enrichment preserved');
ok(submit.includes('onProgress: interactiveSelection ? (progress) => setProgress(progress.message) : undefined'),'interactive MAG progress preserved');
try{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kizilkan-v16147-'));
  const stub=path.join(tmp,'stubs.d.ts');
  fs.writeFileSync(stub,'declare module "*";\ndeclare namespace JSX { interface IntrinsicElements { [k:string]: any } }\n');
  const tsc=process.env.TSC_BIN||'tsc';
  const r=cp.spawnSync(tsc,['--noEmit','--noResolve','--skipLibCheck','--jsx','react-jsx','--target','ES2022','--module','ESNext','--moduleResolution','Bundler',stub,path.join(R,'frontend/app/add-playlist.tsx')],{encoding:'utf8'});
  const out=(r.stdout||'')+(r.stderr||'');
  const regress=out.split(/\r?\n/).filter(line=>{
    const m=line.match(/add-playlist\.tsx\((\d+),(\d+)\): error TS(2454|2367|2339):/);
    return m && Number(m[1])>=1400 && Number(m[1])<=1700;
  });
  ok(regress.length===0,'TypeScript semantic probe has no TS2454/TS2367/TS2339 in submit control-flow');
  if(regress.length) console.log(regress.join('\n'));
  fs.rmSync(tmp,{recursive:true,force:true});
}catch(e){console.log('FAIL: TypeScript semantic probe could not run:',e.message);bad++;}
if(bad){console.error(`FAIL — v16.14.7 definite-assignment corrective hard-gate: ${bad}`);process.exit(1)}
console.log('TEMIZ — v16.14.7 definite-assignment + MAG/M3U control-flow corrective');
