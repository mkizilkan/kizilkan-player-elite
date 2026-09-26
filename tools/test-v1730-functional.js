#!/usr/bin/env node
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const ts=require(require.resolve('typescript',{paths:[path.join(root,'frontend'),process.env.KIZILKAN_TEST_RUNTIME||'']}));
function load(file,mocks={},globals={}){
 const js=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(js,{exports,require:id=>{if(id in mocks)return mocks[id];throw Error('Unmocked '+id);},URL,AbortController,setTimeout,clearTimeout,console,Date,Map,Set,Promise,...globals},{filename:file});return exports;
}
const model=load('frontend/src/utils/panelDirectoryModel.ts'),plain=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 for(const [raw,want] of [['EXAMPLE.com:80/','http://example.com'],['https://Example.com:443/','https://example.com'],['http//example.com:8080','http://example.com:8080'],['sss',null],['cf.prokly7.xyzREMOVED',null],['a sentence',null],['ftp://example.com',null],['http://user:pass@example.com',null],['http://example.com?x=1',null],['http://example.com:99999',null],['http://[::1]:80/','http://[::1]']])assert.equal(model.canonicalPanelHost(raw),want,raw);
 const origin=(source,hosts,code)=>({source,baseUrl:source,panelName:'Panel A',realCode:code,hosts});
 const merged=model.mergeDirectory([{panelName:'Panel A',code:'123',hosts:['http://a.example'],sources:[origin('splayer',['http://a.example'],'123')]},{panelName:'Panel A',code:'',hosts:['http://b.example'],sources:[origin('masteriptv',['http://b.example'],null)]}]);
 assert.equal(merged.length,1);assert.equal(merged[0].hosts.length,2);
 const mi=model.filterDirectory(merged,'masteriptv');assert.equal(mi[0].code,'');assert.equal(mi[0].realCode,null);assert.deepEqual(plain(mi[0].hosts),['http://b.example']);
 assert.equal(model.filterDirectory(merged,'masteriptv',{codes:['123']}).length,0);assert.equal(model.filterDirectory(merged,'all',{names:['panel a']}).length,1);assert.equal(model.filterDirectory(merged,'all',{keys:['missing']}).length,0);
 const direct=model.filterDirectory(merged,'all',{names:['panel a'],hosts:['https://own.example/','bad host']});assert.equal(direct.length,2);assert.equal(direct[1].panelName,'Doğrudan DNS');assert.deepEqual(plain(direct[1].hosts),['https://own.example']);
 const cache=new Map();let brokenSource='',physicalProbes=0;
 const directoryApi=load('frontend/src/utils/serverCode.ts',{'./panelDirectoryModel':model,'@/src/utils/iptv':{xtreamLogin:async()=>({})},'@/src/utils/storage':{storage:{getItem:async(k,d)=>cache.get(k)||d,setItem:async(k,v)=>cache.set(k,v)}}},{fetch:async url=>{
  if(url.includes('player_api.php')){physicalProbes++;return{ok:true,json:async()=>({user_info:{auth:1},server_info:{}})};}
  if(brokenSource&&url.includes(brokenSource))throw Error('source offline');
  return{ok:true,json:async()=>url.includes('zeroWebServers')?{'123':'Panel A'}:{'Panel A':{Hosts:{one:'http://a.example',two:url.includes('masteriptv')?'http://b.example':'http://a.example'}}}};
 }});
 let directory=await directoryApi.fetchPanelDirectory(directoryApi.DEFAULT_CODE_SOURCE,{forceRefresh:true});assert.equal(directory[0].hosts.length,2);
 cache.clear();brokenSource='splayer';directory=await directoryApi.fetchPanelDirectory(directoryApi.DEFAULT_CODE_SOURCE,{forceRefresh:true});assert.equal(directory[0].realCode,null);assert.equal(directory[0].sources[0].source,'masteriptv');
 cache.clear();brokenSource='masteriptv';directory=await directoryApi.fetchPanelDirectory(directoryApi.DEFAULT_CODE_SOURCE,{forceRefresh:true});assert.equal(directory[0].code,'123');
 const shared=[{code:'1',panelName:'One',hosts:['HTTP://a.example:80/']},{code:'2',panelName:'Two',hosts:['http://a.example']}];
 const hits=await directoryApi.discoverPanelsByCredentials(directoryApi.DEFAULT_CODE_SOURCE,'u','p',undefined,5,1000,shared);assert.equal(physicalProbes,1);assert.equal(hits.length,2);assert.equal(hits[0].server,'http://a.example');
 const controller=new AbortController();controller.abort();await assert.rejects(()=>directoryApi.fetchPanelDirectory(directoryApi.DEFAULT_CODE_SOURCE,{signal:controller.signal}));
 const calls=[];let unchanged=false;const iptv={xtreamLogin:async()=>({user_info:{status:'Active'}}),xtreamLiveStreams:async()=>{calls.push('live');return[{id:'l'}];},xtreamVod:async()=>{calls.push('vod');return[{id:'v'}];},xtreamSeries:async()=>{calls.push('series');return[{id:'s'}];},fetchAndParseM3UConditional:async(_,validators)=>{calls.push(validators?.etag?'conditional':'full');return unchanged?{notModified:true,etag:'"abc"'}:{notModified:false,parsed:{channels:[{id:'l'}],vod:[{id:'v'}],series:[{id:'s'}]},etag:'"abc"'};}};
 const refresh=load('frontend/src/utils/refreshPlaylist.ts',{'./iptv':iptv,'@/src/utils/serverCode':{},'@/src/utils/diagnostics':{markTask:()=>()=>{},recordDiagnostic:()=>{}},'@/src/player/hostFailover':load('frontend/src/player/hostFailover.ts',{'@/src/utils/storage':{storage:{getItem:async(k,d)=>d,setItem:async()=>{}}}}),'@/src/utils/contentSelection':{applyContentSelection:x=>x},'@/modules/kizilkan-native-core':{KizilkanNativeCore:{available:true}}}).refreshPlaylistContent;
 const pl={id:'a',source:'xtream',xtreamServer:'http://example.com',xtreamUsername:'u',xtreamPassword:'p',channels:[],vod:[],series:[]};
 let r=await refresh(pl,undefined,{kinds:['vod']});assert.equal(r.ok,true);assert.deepEqual(calls,['vod']);assert.equal('channels' in r.patch,false);assert.equal('series' in r.patch,false);assert.equal(r.patch.vod.length,1);
 calls.length=0;r=await refresh(pl);assert.equal(r.ok,true);assert.deepEqual(calls,['live','vod','series']);
 r=await refresh({...pl,source:'m3u_url',m3uUrl:'http://example.com/list'},undefined,{kinds:['series']});assert.equal('channels' in r.patch,false);assert.equal(r.patch.series.length,1);assert.equal(r.patch.m3uValidators.etag,'"abc"');
 unchanged=true;r=await refresh({...pl,source:'m3u_url',m3uUrl:'http://example.com/list',m3uValidators:{url:'http://example.com/list',etag:'"abc"'}},undefined,{kinds:['series']});assert.equal(r.ok,true);assert.equal('series' in r.patch,false);assert.equal(calls.at(-1),'conditional');
 unchanged=false;r=await refresh({...pl,source:'m3u_url',m3uUrl:'http://example.com/list',m3uValidators:{url:'http://example.com/list',etag:'"abc"'}},undefined,{kinds:['series'],forceUnconditional:true});assert.equal(calls.at(-1),'full');assert.equal(r.patch.series.length,1);
 iptv.xtreamVod=async()=>{throw Error('HTTP 503');};r=await refresh(pl,undefined,{kinds:['vod']});assert.equal(r.ok,false);assert.equal(r.patch,undefined);
 // v18.2.0: birincil DNS düşerse yenileme yedek DNS'e geçer ve liste o adrese taşınır.
 { const origLogin=iptv.xtreamLogin,origVod=iptv.xtreamVod;const tried=[];
   iptv.xtreamLogin=async cred=>{tried.push(cred.server);if(cred.server.includes('dead.example'))throw Error('network');return{user_info:{status:'Active'}};};
   iptv.xtreamVod=async()=>[{id:'v'}];
   const rb=await refresh({...pl,xtreamServer:'http://dead.example',backupHosts:['http://backup.example:8080']},undefined,{kinds:['vod']});
   assert.equal(rb.ok,true);assert.deepEqual(tried,['http://dead.example','http://backup.example:8080']);assert.equal(rb.patch.xtreamServer,'http://backup.example:8080');
   iptv.xtreamLogin=async()=>{throw Error('network');};
   const rf=await refresh({...pl,xtreamServer:'http://dead.example',backupHosts:['http://also-dead.example']},undefined,{kinds:['vod']});assert.equal(rf.ok,false);
   iptv.xtreamLogin=origLogin;iptv.xtreamVod=origVod; }
 const ops=load('frontend/src/utils/catalogOperations.ts');assert.equal(ops.freshnessDue(1000,15,1001),false);assert.equal(ops.freshnessDue(1000,15,901001),true);
 const data=new Map([['kizilkan.profiles',JSON.stringify([{id:'family'}])],['kizilkan.player.autoNext.family','true'],['kizilkan.playlists.meta.family',JSON.stringify([{id:'pl',m3uValidators:{url:'https://example.com/list',etag:'"abc"'},serverCodeBinding:{sources:[{source:'splayer'}]}}])]]);
 const backup=load('frontend/src/utils/backup.ts',{'@/src/utils/storage':{storage:{getItem:async(k,d)=>data.get(k)??d,setItem:async(k,v)=>{data.set(k,v);return true;},removeItem:async k=>{data.delete(k);return true;}}},'@/src/utils/storage/bigStore':{bigStore:{}}});
 const snapshot=await backup.createBackupMetadata('full');assert.equal(snapshot.data['kizilkan.player.autoNext.family'],'true');assert.equal(JSON.parse(snapshot.playlists.profiles.family.metadata)[0].m3uValidators.etag,'"abc"');
 data.delete('kizilkan.player.autoNext.family');await backup.restoreBackupMetadataExact(snapshot);assert.equal(data.get('kizilkan.player.autoNext.family'),'true');assert.equal(JSON.parse(data.get('kizilkan.playlists.meta.family'))[0].serverCodeBinding.sources[0].source,'splayer');
 let release;const blocked=new Promise(r=>release=r),order=[];
 const first=ops.withCatalogLock('a',async()=>{order.push('first');await blocked;order.push('end');});const second=ops.withCatalogLock('a',async()=>order.push('second'));
 await ops.withCatalogLock('b',async()=>order.push('other'));assert.equal(order.includes('second'),false);release();await Promise.all([first,second]);assert.ok(order.indexOf('end')<order.indexOf('second'));
 console.log('PASS v17.3.0: DNS, provenance/source isolation, physical probe deduplication, scoped refresh/failure preservation, cooldown and catalog serialization');
})().catch(e=>{console.error(e);process.exit(1)});
