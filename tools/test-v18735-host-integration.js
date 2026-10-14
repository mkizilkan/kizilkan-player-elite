#!/usr/bin/env node
// Real production functions, synthetic accounts only; no provider/server scanning.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('./_ts'),root=path.resolve(__dirname,'../frontend'),plain=v=>JSON.parse(JSON.stringify(v));
function loader(mocks={},globals={}){
 const cache=new Map();const load=(id,parent='src/utils/entry.ts')=>{
  if(Object.hasOwn(mocks,id))return mocks[id];
  let rel=id.startsWith('@/')?id.slice(2):id.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(parent),id)):id;
  let file=path.join(root,rel);if(!path.extname(file))file+='.ts';
  if(!fs.existsSync(file))throw Error('Unmocked '+id+' from '+parent);if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  vm.runInNewContext(code,{exports,module:{exports},require:id=>load(id,path.relative(root,file).replace(/\\/g,'/')),URL,URLSearchParams,AbortController,Headers,TextEncoder,TextDecoder,Buffer,setTimeout,clearTimeout,console,Date,...globals},{filename:file});return exports;
 };return load;
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));let groups=0;
async function main(){
 const load=loader();const identity=load('@/src/utils/accountIdentity');
 assert.notEqual(identity.xtreamCandidateIdentity('https://P.example/A','User','Pass'),identity.xtreamCandidateIdentity('https://p.example/A','user','Pass'));
 assert.notEqual(identity.xtreamCandidateIdentity('https://p.example/A','User','Pass'),identity.xtreamCandidateIdentity('https://p.example/A','User','pass'));
 assert.notEqual(identity.xtreamCandidateIdentity('http://p.example/A','User','Pass'),identity.xtreamCandidateIdentity('https://p.example/A','User','Pass'));
 assert.notEqual(identity.accountServerIdentity('http://p.example/A'),identity.accountServerIdentity('http://p.example/a'));
 assert.equal(identity.accountServerIdentity('https://P.example:443/A/'),'https://p.example/A');
 assert.equal(identity.reusableXtreamPlaylistId([{id:'legacy-room-id',source:'xtream',xtreamServer:'https://P.example:443/A/',xtreamUsername:'User',xtreamPassword:'Pass'}],'https://p.example/A','User','Pass'),'legacy-room-id');
 console.log('PASS: scheme/path/credential case and password isolation; existing Room ID retained');groups++;

 const importer=load('@/src/utils/hitFileImporter');
 const host=importer.parseHitFile('HOST.txt','Sunucu ➤ p.example\nPort ➤ 8080\nKullanıcı Adı ➤ User\nŞifre ➤ Pass\nhttp://p.example:8080/get.php?username=User&password=Pass&type=m3u_plus | max:2');
 assert.equal(host.records.length,1);assert.equal(host.records[0].username,'User');assert.equal(host.records[0].server,'http://p.example:8080');assert.equal(host.records[0].sources.length,2);
 const second=importer.parseHitFile('other.txt','http://p.example:8080/get.php?username=user&password=Pass&type=m3u_plus\nhttp://p.example:8080/get.php?username=User&password=pass&type=m3u_plus');
 assert.equal(importer.mergeHitRecords([...host.records,...second.records]).records.length,3);
 const combo=importer.parseHitFile('unknown.txt','User:Pass');assert.equal(combo.records[0].server,'');assert.ok(combo.records[0].warnings.length);
 assert.equal(importer.parseHitFile('playlist.m3u','#EXTM3U\n#EXTINF:-1,Demo\nhttp://media.example/a.ts').records[0].kind,'m3u_file');
 assert.equal(importer.parseHitFile('mag.txt','{"portal":"https://p.example/stalker_portal/server/load.php","mac":"00:1A:79:00:00:01","category":"valid"}').records[0].kind,'stalker');
 console.log('PASS: HOST labels/M3U URLs, missing DNS, source lines, case-sensitive multifile dedupe and MAG JSON');groups++;

 const writer=load('@/src/utils/diagnosticWriter');let release;const gate=new Promise(r=>release=r),saved=[],important=[];
 const w=writer.createDiagnosticWriter({maxRows:2,maxBytes:20,batchSize:2,maxBatchBytes:10,write:async rows=>{await gate;saved.push(...rows);},importantOverflow:r=>important.push(r)});
 const promises=[w.enqueue('a',6,'normal'),w.enqueue('b',6,'normal'),w.enqueue('drop',6,'normal'),w.enqueue('critical',6,'important')];
 await Promise.resolve();assert.equal(w.health().dropped,1);assert.equal(w.health().importantOverflow,1);assert.deepEqual(important,['critical']);
 release();await Promise.all(promises);await w.flush();assert.deepEqual(saved,['a','b']);assert.equal(w.health().pendingBytes,0);assert.equal(w.health().batches,2);
 const bad=writer.createDiagnosticWriter({maxRows:0,maxBytes:1,batchSize:1,write:async()=>{},importantOverflow:()=>{throw Error('disk failed');}});await assert.rejects(bad.enqueue('x',2,'important'),/disk failed/);assert.equal(bad.health().failures,1);
 console.log('PASS: bounded writer pressure, byte-bounded batch, durable important overflow and visible write failure');groups++;

 const timing=load('@/src/utils/adaptiveNetworkPolicy');assert.equal(timing.adaptiveTimeout('http://p.example','account',20000),20000);
 for(let i=0;i<5;i++)timing.rememberHostTiming('http://p.example','account',100,'success');assert.equal(timing.adaptiveTimeout('http://p.example','account',20000,800),800);
 for(let i=0;i<5;i++)timing.rememberHostTiming('http://p.example','catalog',10,'success');assert.equal(timing.adaptiveTimeout('http://p.example','catalog',120000),120000);
 const fast=timing.adaptiveTimeout('http://p.example','account',20000);timing.rememberHostTiming('http://p.example','account',1,'other');assert.equal(timing.adaptiveTimeout('http://p.example','account',20000),fast);
 timing.rememberHostTiming('http://p.example','account',fast,'timeout');assert.ok(timing.adaptiveTimeout('http://p.example','account',20000)>fast);
 timing.setTimingNetwork('new-network');assert.equal(timing.adaptiveTimeout('http://p.example','account',20000),20000);
 console.log('PASS: cold conservative timeout, real RTT, deadline ceiling, no 429 sample and network reset');groups++;

 let network='wifi',now=100000,doh=0,nativeCalls=[];class Clock extends Date{static now(){return now;}}
 const bridge={available:true,getDnsNetworkContext:()=>network,publishDnsRoute:()=>true,dnsRoutedRequest:async(url,method,headers,body,ips)=>{nativeCalls.push({url,ips});return{ok:true,status:200,body:'{}',url};}};
 const dnsLoad=loader({'@/src/utils/diagnostics':{recordDiagnostic:async()=>{}},'@/modules/panel-scan':{PanelScan:bridge}},{Date:Clock,fetch:async(url)=>{
   if(/dns.google|cloudflare-dns/.test(url)){doh++;return{status:200,text:async()=>JSON.stringify({Answer:/type=AAAA/.test(url)?[]:[{type:1,data:'192.0.2.1',TTL:1},{type:1,data:'192.0.2.2',TTL:1}]})};}
   return{status:200,body:{cancel:async()=>{}},text:async()=>''};
 }});
 const dns=dnsLoad('@/src/utils/magHostFailover');dns._setHostFailoverEnabled(true);
 await dns.ensureLiveHostIp('http://a.example:8080/c');await dns.ensureLiveHostIp('http://b.example:8080/c');
 const a=dns.connectInfo('http://a.example:8080/c/api.php');assert.equal(dns.logicalUrl(a.url,'http://a.example:8080/c/api.php',a.url),'http://a.example:8080/c/api.php');
 assert.equal(dns.logicalUrl(a.url),a.url);assert.equal(dns.logicalUrl('http://192.0.2.9:8080/x','http://a.example:8080/c',a.url),'http://192.0.2.9:8080/x');
 const before=doh;await dns.ensureLiveHostIp('http://a.example:8080/c');assert.equal(doh,before);now+=2000;await dns.ensureLiveHostIp('http://a.example:8080/c');assert.ok(doh>before);
 await dns.ensureLiveHostIp('https://tls.example/c');await dns.fetchWithDns('https://tls.example/c/api.php',{},1024,2000,()=>{throw Error('wrong fallback');});assert.equal(nativeCalls.at(-1).url,'https://tls.example/c/api.php');
 network='mobile';assert.equal(dns.connectInfo('http://a.example:8080/c').url,'http://a.example:8080/c');
 console.log('PASS: shared-IP origins never confused; foreign redirects retained; TTL/network invalidation and original HTTPS URL');groups++;

 let dnsResolve;const pending=new Promise(r=>dnsResolve=r);let cancelled=false;
 const sharedLoad=loader({'@/src/utils/diagnostics':{recordDiagnostic:async()=>{}},'@/modules/panel-scan':{PanelScan:{available:false,getDnsNetworkContext:()=> 'test'}}},{fetch:async(url,init)=>{
  if(/dns.google/.test(url)){init.signal.addEventListener('abort',()=>{cancelled=true;});await pending;return{status:200,text:async()=>JSON.stringify({Answer:[{type:1,data:'192.0.2.1'},{type:1,data:'192.0.2.2'}]})};}return{status:200};}});
 const shared=sharedLoad('@/src/utils/magHostFailover');shared._setHostFailoverEnabled(true);const first=new AbortController(),secondCaller=new AbortController();
 const p1=shared.ensureLiveHostIp('http://shared.example',first.signal),p2=shared.ensureLiveHostIp('http://shared.example',secondCaller.signal);await delay(1);first.abort();await p1;assert.equal(cancelled,false);dnsResolve();await p2;assert.notEqual(shared.connectInfo('http://shared.example').url,'http://shared.example');
 console.log('PASS: cancelled DNS caller does not abort another caller sharing the same resolution');groups++;
 const budgetLoad=loader({'@/src/utils/diagnostics':{recordDiagnostic:async()=>{}},'@/modules/panel-scan':{PanelScan:{available:false,getDnsNetworkContext:()=> 'test'}}},{fetch:async(url,init)=>{
  if(/dns.google/.test(url)){await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,25);init.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('cancelled'));});});return{status:200,text:async()=>JSON.stringify({Answer:[{type:1,data:'192.0.2.1'},{type:1,data:'192.0.2.2'}]})};}return{status:200};}});
 const owned=budgetLoad('@/src/utils/magHostFailover');owned._setHostFailoverEnabled(true);const Budget=budgetLoad('@/src/utils/magDiscoveryBudget').MagDiscoveryBudget;
 const parent=new Budget({deadlineMs:1000,operationId:'same-trace'}),child=new Budget({deadlineMs:1000,sharedBudget:parent});
 try{const childRequest=owned.ensureLiveHostIp('http://owned.example',undefined,child),parentRequest=owned.ensureLiveHostIp('http://owned.example',undefined,parent);await delay(2);child.stop('cancelled');await Promise.allSettled([childRequest,parentRequest]);assert.equal(parent.signal.aborted,false);assert.notEqual(owned.connectInfo('http://owned.example').url,'http://owned.example');}finally{child.dispose();parent.dispose();}
 console.log('PASS: passive and parent DNS budgets share trace correlation without sharing cancellation ownership');groups++;


 const proof=load('@/src/utils/verificationState');assert.equal(proof.endpointVerificationState({url:'http://p.example',catalogVerifiedAt:'2026-10-14T00:00:00Z'}),'catalog');
 assert.equal(proof.endpointVerificationState({url:'http://p.example',firstFrameAt:'2026-10-14T00:00:00Z',playbackTestAt:'2026-10-14T01:00:00Z',playbackTestState:'cancelled'}),'cancelled');assert.ok(proof.needsVerificationRetest({url:'http://p.example',lastError:'429'}));
 assert.equal(proof.endpointVerificationState({url:'http://p.example',firstFrameAt:'2026-10-14T00:00:00Z',lastTestAt:'2026-10-14T02:00:00Z',lastError:'timeout',lastErrorKind:'TIMEOUT'}),'temporary');
 const report=load('@/src/utils/diagnosticReport'),canonical={appVersion:'18.7.35',writerHealth:{dropped:1},events:[{at:1,domain:'system',event:'=SUM(1)',operationId:'same-operation',stage:'save',data:{password:'***'}}]};
 const csv=report.renderDiagnosticReport(canonical,'csv');assert.ok(csv.includes('"\'=SUM(1)"'));assert.ok(csv.includes('same-operation'));assert.ok(report.renderDiagnosticReport(canonical,'md').includes('"dropped": 1'));assert.deepEqual(JSON.parse(report.renderDiagnosticReport(canonical,'json')),canonical);
 console.log('PASS: distinct verification/protection/cancel states and canonical JSON/MD/CSV with formula protection');groups++;

 const disk=new Map();let failWrite=false;const store={getItemStrict:async(k,f)=>disk.get(k)||f,setItem:async(k,v)=>{if(failWrite)return false;disk.set(k,v);return true;}};
 const journalLoad=loader({'@/src/utils/storage':{storage:store},'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_,s)=>crypto.createHash('sha256').update(s).digest('hex')}});
 const journals=journalLoad('@/src/utils/catalogRefreshJournal'),pl={id:'old-id',source:'xtream',xtreamServer:'http://p.example',xtreamUsername:'User',xtreamPassword:'Pass',catalogSync:{liveFingerprint:'fp'}};
 const journal=await journals.openCatalogRefreshJournal('ownerA',pl,['live','vod'],false);journal.completed.live={count:2,fingerprint:'fp'};await journals.saveCatalogRefreshJournal(journal);
 const resumed=await journals.openCatalogRefreshJournal('ownerA',pl,['live','vod'],false);assert.equal(resumed.generation,journal.generation);assert.deepEqual(plain(journals.verifiedRefreshKinds(resumed,{roomIndexed:true,channels:2},pl)),['live']);assert.equal(journals.verifiedRefreshKinds(resumed,{roomIndexed:true,channels:1},pl).length,0);
 assert.equal(journals.verifiedRefreshKinds(resumed,{roomIndexed:true,channels:2},{...pl,catalogSync:{liveFingerprint:'different'}}).length,0);
 assert.notEqual((await journals.openCatalogRefreshJournal('ownerB',pl,['live','vod'],false)).generation,journal.generation);
 assert.notEqual((await journals.openCatalogRefreshJournal('ownerA',{...pl,xtreamPassword:'changed'},['live','vod'],false)).generation,journal.generation);
 assert.ok(![...disk.values()].join('').includes('Pass'));failWrite=true;await assert.rejects(journals.saveCatalogRefreshJournal(journal),/yazılamadı/);
 console.log('PASS: durable kind resume after reload, Room count/fingerprint verification, profile/password isolation and disk failure');groups++;

 const eta=load('@/src/utils/catalogProgress').createCatalogProgressEstimator();
 assert.equal(eta({phase:'content',message:'',activeKind:'live',liveCount:10},1000).estimatedRemainingMs,undefined);
 assert.equal(eta({phase:'content',message:'',activeKind:'live',liveCount:10,liveTotal:100},1000).estimatedRemainingMs,undefined);
 assert.equal(eta({phase:'content',message:'',activeKind:'live',liveCount:20,liveTotal:100},2000).estimatedRemainingMs,8000);
 assert.equal(eta({phase:'content',message:'',activeKind:'live',liveCount:20,liveTotal:100},3000).estimatedRemainingMs,undefined);
 console.log('PASS: ETA uses measured progress and known total, never invents a rate while stalled');groups++;
 const commits=[],updates=[];let phase=0,run='',starts=0,cancels=0;
 const nativeCore={available:true,getBulkImportSnapshot:()=>({runId:run,running:!!run,jobs:run?[{jobKey:nativeId,state:phase?'completed':'running',liveReady:true,message:'fixture'}]:[]}),
  startBulkImport:async jobs=>{starts++;run='owned-run';nativeId=jobs[0].playlistId;return run;},cancelBulkImport:async()=>{cancels++;},getPlaylistSummaryVerified:async()=>{phase=1;return{roomIndexed:true,channels:2,vod:3,series:4};}};
 let nativeId='';const trace={operationId:'op-fixture',measure:async(_,fn)=>fn(),finish:async()=>{},stage:async()=>{}};
 const imports=loader({'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_,v)=>crypto.createHash('sha256').update(v).digest('hex')},
  '@/modules/kizilkan-native-core':{KizilkanNativeCore:nativeCore},'./iptv':{xtreamLogin:async()=>({user_info:{auth:1},server_info:{}})},'./diagnostics':{beginDiagnosticTrace:()=>trace}})('@/src/utils/importHitRecord');
 const record={id:'r',kind:'xtream',name:'fixture',server:'http://p.example',username:'User',password:'Pass',sources:[{file:'fixture.txt',line:1}],warnings:[]};
 const importCtx={signal:new AbortController().signal,ownerId:'A',owns:()=>true,playlists:[],commit:async(p,prepared)=>{assert.equal(prepared,true);commits.push(p);return true;},update:async(id,patch)=>updates.push(patch),progress:()=>{}};
 await imports.importHitRecord(record,importCtx);assert.equal(commits.length,1);assert.equal(updates.length,1);
 assert.ok(!Object.hasOwn(updates[0],'channels')&&!Object.hasOwn(updates[0],'vod')&&!Object.hasOwn(updates[0],'series'),'native adoption must never rewrite Room with empty shell arrays');assert.equal(updates[0].vodCount,3);
 await assert.rejects(imports.importHitRecord(record,{...importCtx,playlists:[commits[0]]}),/zaten ekli/);assert.equal(starts,1);
 phase=0;run='';const abort=new AbortController();nativeCore.getPlaylistSummaryVerified=async()=>{abort.abort();return{roomIndexed:true,channels:2};};
 await assert.rejects(imports.importHitRecord({...record,password:'different'},{...importCtx,signal:abort.signal}),e=>e.kind==='CANCELLED');assert.equal(cancels,1);assert.equal(commits.length,1);
 console.log('PASS: real file-import native live-first adoption preserves Room arrays, exact existing IDs and owned cancellation');groups++;
 console.log(`PASS: v18.7.35 HOST integration — ${groups} behavior groups`);
}
main().catch(error=>{console.error(error);process.exit(1);});
