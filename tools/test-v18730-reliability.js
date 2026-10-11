#!/usr/bin/env node
/** Real production modules, synthetic accounts only; no external requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('./_ts');
const root=path.resolve(__dirname,'..'), utils=path.join(root,'frontend/src/utils');
function harness(overrides={}) {
  const cache=new Map();
  const load=id=>{if(Object.hasOwn(overrides,id))return overrides[id];const name=id.replace(/^(?:@\/src\/utils\/|\.\/)/,'');if(cache.has(name))return cache.get(name);
    const file=path.join(utils,name+'.ts');if(!fs.existsSync(file))throw new Error('Unmocked dependency '+id);
    const out={};cache.set(name,out);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(js,{exports:out,require:load,URL,URLSearchParams,AbortController,TextDecoder,TextEncoder,Uint8Array,console,setTimeout,clearTimeout,...overrides.$globals},{filename:file});return out;};return load;
}
const plain=v=>JSON.parse(JSON.stringify(v));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const load=harness(), sample=load('./boundedPortalSample'),policy=load('./hostRequestPolicy'),classification=load('./scanOutcome');
  for(const v of [1,'1',true,'true'])assert.equal(classification.explicitScanAuth(v),true);
  for(const v of [0,'0',false,'false'])assert.equal(classification.explicitScanAuth(v),false);
  for(const v of [null,undefined,'',2,'yes'])assert.equal(classification.explicitScanAuth(v),null);
  assert.equal(classification.scanResponseFailure(200,{'CF-Mitigated':'CHALLENGE'},''),'protected');
  assert.equal(classification.scanResponseFailure(403,{},''),'protected');
  assert.equal(classification.scanResponseFailure(429,{},''),'temporary');
  assert.equal(classification.scanResponseFailure(503,{},''),'temporary');
  assert.equal(classification.scanResponseFailure(200,{},'<html>cf_chl_opt</html>'),'protected');
  console.log('PASS: explicit auth and challenge/denial vs transient classification');

  const rows=Array.from({length:160},(_,id)=>({id,name:'çığ 👁 '+id,nested:{quote:'a, ] \\"',values:[1,2]}}));
  const text=JSON.stringify({js:{total_items:160,data:rows}});let cancelled=0,released=0,reads=0;
  const bytes=new TextEncoder().encode(text);
  const result=await sample.boundedPortalText({body:{getReader:()=>({read:async()=>{reads++;return {value:bytes,done:false};},cancel:async()=>{cancelled++;},releaseLock:()=>released++})}},100000,true);
  assert.equal(JSON.parse(result).js.length,128);assert.equal(reads,1);assert.equal(cancelled,1);assert.equal(released,1);
  assert.equal(sample.portalArrayPrefix('{"error":"denied","js":{"data":[{"id":1}]}}'),null);
  assert.equal(sample.portalArrayPrefix('{"js":{"data":[{"id":1}]},"error":"denied"}'),null);
  assert.equal(sample.portalArrayPrefix('<html>"js":[1,2]</html>'),null);
  await assert.rejects(sample.boundedPortalText({text:async()=>'👁'.repeat(11)},40),e=>e.kind==='RESPONSE_TOO_LARGE');
  // No maxBytes means full catalog semantics stay unchanged.
  assert.equal(await sample.boundedPortalText({text:async()=>text}),text);
  const fallback=harness({$globals:{TextDecoder:undefined}})('./boundedPortalSample');
  let offset=0;const split=await fallback.boundedPortalText({body:{getReader:()=>({read:async()=>offset<bytes.length?{value:bytes.slice(offset,++offset),done:false}:{done:true},cancel:async()=>{},releaseLock:()=>{}})}},bytes.length+1);
  assert.equal(split,text);
  console.log('PASS: bounded 128-item sample, reader cancellation, UTF-8 byte cap and full-catalog separation');

  const held=await policy.acquireHostRequest('capacity.invalid',undefined,1);let granted=false;
  const waiting=policy.acquireHostRequest('capacity.invalid',undefined,1).then(r=>{granted=true;return r;});
  await sleep(15);assert.equal(granted,false);held();const release=await waiting;assert.equal(granted,true);release();release();
  const block=await policy.acquireHostRequest('cancel.invalid',undefined,1),ctrl=new AbortController();
  const cancelledWait=policy.acquireHostRequest('cancel.invalid',ctrl.signal,1);ctrl.abort();await assert.rejects(cancelledWait,e=>e.kind==='CANCELLED');block();
  const start=Date.now();policy.deferHost('deadline.invalid',35);const extended=policy.acquireHostRequest('deadline.invalid');
  await sleep(15);policy.deferHost('deadline.invalid',70);const releaseExtended=await extended;assert.ok(Date.now()-start>=75);releaseExtended();
  assert.equal(policy.retryAfterMilliseconds('120'),120000);assert.equal(policy.retryAfterMilliseconds('Thu, 01 Jan 1970 00:02:00 GMT',0),120000);
  const longAbort=new AbortController(),longWait=policy.abortableDelay(3_000_000_000,longAbort.signal);longAbort.abort();await assert.rejects(longWait,e=>e.kind==='CANCELLED');
  console.log('PASS: queue capacity, abort, idempotent release and concurrent Retry-After extension');

  const directory=load('./panelDirectoryModel'), dns=load('./panelDnsFailover'),evidence=load('./playlistEndpoints');
  const hosts=['http://a.invalid:8080','http://b.invalid:8080','http://c.invalid:8080'];
  const panel={panelName:'Fixture',code:'123',directoryKey:'fixture',hosts,sources:[{source:'splayer',baseUrl:'https://directory.invalid',panelName:'Fixture',hosts}]};
  const filtered=directory.filterDirectory([panel],'all',{keys:['fixture'],dnsSelections:{fixture:[hosts[2],hosts[0]]}});
  assert.deepEqual(plain(filtered[0].hosts),[hosts[2],hosts[0]]);assert.equal(filtered[0].sources[0].hosts.length,3);
  assert.equal(directory.filterDirectory([panel],'all',{keys:['fixture'],dnsSelections:{fixture:[]}}).length,0);
  assert.equal(dns.magDnsCandidate('http://backup.invalid','http://primary.invalid:8080/stalker_portal/server/load.php'),'http://backup.invalid:8080/stalker_portal/server/load.php');
  assert.equal(dns.magDnsCandidate('http://backup.invalid:80','http://primary.invalid:8080/portal.php'),'http://backup.invalid/portal.php');
  assert.equal(dns.magDnsCandidate('https://backup.invalid:443','http://primary.invalid:8080/portal.php'),'https://backup.invalid/portal.php');
  assert.deepEqual(plain(await dns.boundPanelDnsCandidates({autoResolve:true,allowDirectoryAlternatives:false,selectedHosts:[hosts[0]],validatedHosts:[hosts[1]]})),[hosts[0]]);
  for(const kind of ['CANCELLED','PROTECTION','MAG_PROTECTION','RATE_LIMIT','ACCOUNT_REJECTED'])assert.equal(dns.canTryDnsAlternative({kind}),false);
  const merged=evidence.mergeEndpointEvidence([{url:hosts[0],kind:'xtream',source:'playback',primary:true,firstFrameAt:'2026-10-11T00:00:00Z'}],{url:hosts[1],kind:'xtream',source:'scan',primary:true,accountVerifiedAt:'2026-10-11T01:00:00Z'});
  assert.equal(merged.filter(x=>x.primary).length,1);assert.ok(merged[0].firstFrameAt);assert.equal(merged[1].firstFrameAt,undefined);
  console.log('PASS: user DNS scope/order, provenance, explicit default port, path lock and separate endpoint proof');

  let fetched=0;let response;const mocks={'@/src/utils/storage':{storage:{getItem:async(_k,fallback)=>fallback,setItem:async()=>{}}},'@/src/utils/iptv':{xtreamLogin:async()=>{throw new Error('Not expected');}},'../../modules/panel-scan':{PanelScan:{getScanProxyStatus:()=>({enabled:false})}},$globals:{fetch:async()=>{fetched++;return response;}}};
  const server=harness(mocks)('./serverCode');
  const http=(status,body,headers={})=>({status,headers:{get:k=>Object.entries(headers).find(([key])=>key.toLowerCase()===k.toLowerCase())?.[1]||null},text:async()=>body});
  for(const [status,body,expected]of [[200,'{"user_info":{"auth":1}}','valid'],[200,'{"user_info":{"auth":0}}','rejected'],[200,'{"user_info":{}}','temporary'],[200,'<html>landing page</html>','temporary'],[401,'{}','protected'],[503,'{}','temporary']]){
    response=http(status,body,{'Retry-After':'0'});const out=await server.probeXtreamHostOutcome('http://fixture-'+status+'-'+expected+'.invalid','synthetic','synthetic');assert.equal(out.state,expected);
  }
  response=http(200,'{}',{'CF-Mitigated':'challenge'});assert.equal((await server.probeXtreamHostOutcome('http://cf.invalid','synthetic','synthetic')).state,'protected');
  const beforeProtection=fetched;
  await assert.rejects(server.discoverServerCodeHosts('https://directory.invalid','123','synthetic','synthetic',undefined,1,100,undefined,panel),e=>e.kind==='PROTECTION');
  assert.equal(fetched-beforeProtection,1,'JS fallback stops the remaining aliases after challenge');
  const abort=new AbortController();abort.abort();const before=fetched;assert.equal((await server.probeXtreamHostOutcome('http://cancel.invalid','synthetic','synthetic',100,abort.signal)).state,'cancelled');assert.equal(fetched,before);
  console.log('PASS: actual Xtream probe never promotes HTTP 200/HTML/missing auth and honors pre-abort');

  let saved='{}',readsStorage=0;const methods=harness({'@/src/utils/storage':{storage:{getItem:async()=>{readsStorage++;await sleep(10);return saved;},setItem:async(_k,v)=>saved=v}}})('./magCatalogMethod');
  await Promise.all([methods.preferredMagCatalogMethod(hosts[0]),methods.preferredMagCatalogMethod(hosts[0])]);assert.equal(readsStorage,1);
  await methods.rememberMagCatalogMethod(hosts[0],'all');assert.equal(await methods.preferredMagCatalogMethod(hosts[0]),'all');assert.equal(JSON.parse(saved)[hosts[0]].method,'all');
  console.log('PASS: single-flight learning hydration and durable catalogue-method preference');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
