#!/usr/bin/env node
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('./_ts'),root=path.resolve(__dirname,'../frontend');
const plain=v=>JSON.parse(JSON.stringify(v)),sleep=ms=>new Promise(r=>setTimeout(r,ms));
function loader(mocks,globals={}) {
  const cache=new Map();return function load(id){
    if(Object.hasOwn(mocks,id))return mocks[id];
    const rel=id==='./scanProxyParse'?'src/utils/scanProxyParse':id==='./scanProxySpeed'?'src/utils/scanProxySpeed':id.replace(/^@\//,'');
    const file=path.join(root,rel+'.ts');if(cache.has(file))return cache.get(file);
    const exports={};cache.set(file,exports);
    const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(js,{exports,require:load,console,URL,Headers,TextDecoder,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,...globals},{filename:file});return exports;
  };
}
(async()=>{
  let active=0,max=0;const visited=[];let privateConfig={},plainConfig={manualText:'paid:secret@gateway.test:7777',customSources:[{url:'https://provider.test/token',scheme:'http'}]};let configFail=false;
  const prefs={getItem:async()=>JSON.stringify(plainConfig),setItem:async(_,v)=>{plainConfig=JSON.parse(v);}};
  const native={loadScanProxyPrivateConfig:async()=>JSON.stringify(privateConfig),loadScanProxyManualText:async()=>'',saveScanProxyManualText:async()=>{},
    saveScanProxyPrivateConfig:async v=>{if(configFail)throw Error('fixture write failed');privateConfig=JSON.parse(v);},setScanProxyRotation:async()=>{},
    loadScanProxyCandidates:async()=>{throw Error('empty result must not replace candidates');}};
  const sources=loader({'@react-native-async-storage/async-storage':{default:prefs,__esModule:true},'../../modules/panel-scan':{PanelScan:native},'./diagnostics':{recordDiagnostic:async()=>{}},
    'expo/fetch':{fetch:async url=>{visited.push(url);active++;max=Math.max(max,active);await sleep(5);active--;
      if(url.includes('fail'))return new Response('error',{status:502});
      if(url.includes('huge'))return new Response('ignored',{headers:{'content-length':String(9*1024*1024)}});
      if(url.includes('empty'))return new Response('');
      return new Response('http://u:pass@192.0.2.1:8080\n');
    }}
  })('src/utils/scanProxy');
  const cfg=await sources.loadScanProxyConfig();assert.equal(cfg.manualText,'paid:secret@gateway.test:7777');assert.equal(privateConfig.customSources.length,1);
  assert.ok(!Object.hasOwn(plainConfig,'manualText')&&!Object.hasOwn(plainConfig,'customSources'));
  await sources.saveScanProxyConfig({...cfg,manualText:'new-secret',test:{...cfg.test,url:'https://fixture.test/?token=test-secret',expectText:'test-token'}});assert.equal(privateConfig.manualText,'new-secret');assert.ok(!JSON.stringify(plainConfig).includes('new-secret'));
  assert.ok(!JSON.stringify(plainConfig).includes('test-secret'));assert.ok(!JSON.stringify(plainConfig).includes('test-token'));
  const reread=await sources.loadScanProxyConfig();assert.equal(reread.test.url,'https://fixture.test/?token=test-secret');assert.equal(reread.test.expectText,'test-token');
  plainConfig.test={concurrency:32};const legacySpeed=await sources.loadScanProxyConfig();
  assert.equal(legacySpeed.test.concurrency,64);assert.equal(legacySpeed.test.verifyConcurrency,16);assert.equal(legacySpeed.test.verificationSpeed,'slow');
  await sources.saveScanProxyConfig({...legacySpeed,test:{...legacySpeed.test,verificationSpeed:'manual',manualVerifyConcurrency:73,verifyConcurrency:73}});
  const manualSpeed=await sources.loadScanProxyConfig();assert.equal(manualSpeed.test.verifyConcurrency,73);assert.equal(manualSpeed.test.concurrency,64);
  plainConfig={manualText:'keep-on-failure',customSources:[]};configFail=true;
  await assert.rejects(sources.loadScanProxyConfig());assert.equal(plainConfig.manualText,'keep-on-failure');configFail=false;
  const jobs=Array.from({length:9},(_,i)=>({label:'fixture '+i,url:'https://fixture.test/'+i,scheme:'http',sourceId:'s'+i}));
  jobs.push({label:'mirror',url:'https://fixture.test/fail',mirrors:['https://fixture.test/ok'],scheme:'http',sourceId:'mirror'});
  jobs.push({label:'large',url:'https://fixture.test/huge',scheme:'http'});
  const downloaded=await sources.downloadProxySources(jobs);assert.equal(max,4);assert.equal(downloaded.entries.length,1);
  assert.equal(downloaded.entries[0].sourceIds.length,10);assert.ok(downloaded.sources.find(s=>s.label==='mirror').mirrorUsed);
  assert.ok(downloaded.sources.find(s=>s.label==='large').error.includes('Liste boyutu'));
  await assert.rejects(sources.applyScanProxyConfig({...cfg,source:'auto',autoSelections:{},customSources:[]}));
  console.log('PASS: bounded source workers/mirror/shared ownership/oversize/empty preservation and encrypted config migration');

  const disk=new Map(),events=[];let timeoutCallback,serviceOk=true;
  const panel={saveBackgroundWork:async(scope,state)=>{await sleep(1);disk.set(scope,plain(state));events.push(['save',state.phase,Object.keys(state.results).length]);},loadBackgroundWork:async scope=>disk.has(scope)?plain(disk.get(scope)):null,
    notifyBackgroundResult:(...args)=>events.push(['notice',...args])};
  const core={startForegroundKeepAlive:(_title,_text,_scope,callback)=>{timeoutCallback=callback;events.push(['start']);return serviceOk;},updateForegroundKeepAlive:()=>true,stopForegroundKeepAlive:()=>events.push(['stop'])};
  const Q=loader({'@/modules/panel-scan':{PanelScan:panel},'@/modules/kizilkan-native-core':{KizilkanNativeCore:core}})('src/utils/durableTestQueue');
  const c=new AbortController(),called=[];
  const initial=await Q.runTestQueue({owner:'profile-a',kind:'catalog',title:'fixture',jobs:[{key:'a'},{key:'b'},{key:'c'}],signal:c.signal,concurrency:1,checkpointEach:true,
    test:async j=>{assert.equal(events[0][0],'save');called.push(j.key);return j.key;},onResult:j=>{if(j.key==='b')c.abort();}});
  assert.equal(initial.phase,'interrupted');assert.deepEqual(called,['a','b']);assert.equal(Object.keys(initial.results).length,2);
  const result=await Q.runTestQueue({owner:'profile-a',kind:'catalog',title:'fixture',resume:true,jobs:[],signal:new AbortController().signal,concurrency:1,test:async j=>{called.push(j.key);return j.key;}});
  assert.equal(result.phase,'done');assert.deepEqual(called,['a','b','c']);assert.equal(await Q.loadTestQueue('profile-b','catalog'),null);
  serviceOk=false;let requests=0;
  await assert.rejects(Q.runTestQueue({owner:'p',kind:'catalog',title:'fixture',jobs:[{key:'x'}],signal:new AbortController().signal,concurrency:1,test:async()=>requests++}));assert.equal(requests,0);serviceOk=true;
  const timed=await Q.runTestQueue({owner:'t',kind:'catalog',title:'fixture',jobs:[{key:'x'}],signal:new AbortController().signal,concurrency:1,
    test:async(_job,signal)=>{timeoutCallback();assert.ok(signal.aborted);return 'must not be saved';}});
  assert.equal(timed.phase,'interrupted');assert.deepEqual(plain(timed.results),{});
  let secondReleased=false;
  await assert.rejects(Q.runTestQueue({owner:'fatal',kind:'catalog',title:'fixture',jobs:[{key:'x'},{key:'y'}],signal:new AbortController().signal,concurrency:2,
    test:async(j,signal)=>{if(j.key==='x'){await sleep(5);throw Error('fixture failure');}await new Promise(resolve=>signal.addEventListener('abort',()=>{secondReleased=true;resolve();},{once:true}));return 'cancelled';}}));
  assert.ok(secondReleased);assert.equal(disk.get('test:catalog:fatal').phase,'interrupted');
  const frame=await Q.runTestQueue({owner:'frame',kind:'mac-frame',title:'fixture',jobs:[{key:'a'},{key:'b'}],signal:new AbortController().signal,concurrency:1,checkpointEach:true,
    test:async j=>{if(j.key==='b')assert.ok(disk.get('test:mac-frame:frame').results.a);return {frame:true};}});
  assert.equal(frame.phase,'done');assert.equal(events.at(-2)[0],'notice');assert.equal(events.at(-2).at(-1),'mag-bulk');
  console.log('PASS: durable queue pre-network checkpoint, cancellation/restart/profile isolation/FG timeout/fatal worker join and per-frame checkpoint');
})().catch(e=>{console.error(e);process.exitCode=1;});
