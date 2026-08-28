#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('./_ts');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const stalker=read('frontend/src/utils/stalker.ts');
const player=read('frontend/src/player/PlayerHost.tsx');
const request=read('frontend/src/player/v2/request.ts');
const add=read('frontend/app/add-playlist.tsx');
function need(src,re,msg){if(!re.test(src))throw new Error(msg)}
function forbid(src,re,msg){if(re.test(src))throw new Error(msg)}
function staticChecks(){
  need(stalker,/interface StalkerPlaybackContext[\s\S]*headers:\s*Record<string, string>/,'MAG playback context header sözleşmesi yok');
  need(stalker,/function playbackHeadersFor\(/,'MAG playback header üreticisi yok');
  need(stalker,/isTrustedPlaybackTarget/,'playback credential origin/family güvenlik filtresi yok');
  need(stalker,/STALKER_PLAYBACK_CONTEXT/,'playback context redacted telemetry yok');
  need(stalker,/P0_EQUALS_P1/,'0/1 alias pagination tespiti yok');
  need(stalker,/nextPage:\s*2/,'1-based portal için gerçek p=2 probe yok');
  need(stalker,/max_page_items/,'portal max_page_items sayfalama metadatası kullanılmıyor');
  need(stalker,/opts:\s*\{ forceFresh\?: boolean \}/,'playback fresh-session resolve seçeneği yok');
  need(stalker,/long_lived:\s*"1"/,'456 recovery create_link long_lived varyantı yok');
  need(request,/runtimeHeaders\?: Record<string, string>/,'runtime playback header bridge yok');
  need(request,/\.\.\.cleanHeaders\(runtimeHeaders\)/,'runtime headers PlaybackRequest içine aktarılmıyor');
  need(player,/resolvedHeaders/,'PlayerHost resolved MAG headers state yok');
  need(player,/STALKER_PLAYBACK_HTTP_REFRESH/,'HTTP 401\/403\/456 fresh resolve retry yok');
  need(player,/\(401\|403\|456\)/,'456 response refresh sınıflandırması yok');
  need(player,/player-emergency-touch-catcher/,'buffering emergency touch catcher yok');
  need(player,/PLAYER_EMERGENCY_CONTROLS_OPEN/,'emergency controls telemetry yok');
  need(player,/player-select-engine-on-error-btn/,'final error ekranında manuel motor seçimi yok');
  need(add,/MAG Portal hazırlanıyor · bağlantı ve cihaz profili doğrulanacak/,'Kaydet sonrası ilk görünür MAG durum mesajı yok');
  need(add,/visible=\{loading && method === "stalker" && !!progress\}/,'MAG görünür progress modalı yok');
  need(add,/"MAG Portal Eklendi"/,'Live commit sonrası kullanıcı başarı bilgisi yok');
  need(add,/Film ve diziler arka planda yüklenmeye devam edecek/,'background enrichment kullanıcı bilgisi yok');
  forbid(stalker,/console\.log\([^\n]*(token|Cookie|Authorization)/i,'secret loglama şüphesi');
}
function transpile(src,file,jsx=false){
  const compilerOptions={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}; if(jsx) compilerOptions.jsx=ts.JsxEmit.ReactJSX; const out=ts.transpileModule(src,{fileName:file,compilerOptions,reportDiagnostics:true});
  const fatal=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(fatal.length)throw new Error(file+' syntax/transpile: '+fatal.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' | '));
  return out.outputText;
}
function http(body,status=200){return {ok:status>=200&&status<300,status,headers:{get:()=> 'application/json'},url:'http://portal.example/portal.php',redirected:false,async text(){return JSON.stringify(body)}}}
function loadStalker(fetchImpl){
  const js=transpile(stalker,'stalker.ts'); const memory=new Map();
  const req=id=>{
    if(id==='@/src/utils/diagnostics')return {recordDiagnostic:async()=>{},markTask:()=>()=>{}};
    if(id==='@/src/utils/storage')return {storage:{getItem:async(k,f)=>memory.has(k)?memory.get(k):f,setItem:async(k,v)=>{memory.set(k,v);return true;},removeItem:async k=>memory.delete(k)}};
    if(id==='expo-crypto')return {CryptoDigestAlgorithm:{MD5:'MD5',SHA1:'SHA1',SHA256:'SHA256'},digestStringAsync:async(_a,v)=>('x'+v).padEnd(64,'0').slice(0,64)};
    return require(id);
  };
  const box={module:{exports:{}},exports:{},require:req,console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:fetchImpl}; box.exports=box.module.exports;
  vm.runInNewContext(js,box,{filename:'stalker-v15227.js'}); return box.module.exports;
}
function fixturePlaybackRequestBridge(){
  const js=transpile(request,'request.ts');
  const box={module:{exports:{}},exports:{},require:id=>{if(id==='@/src/utils/streamTest')return {DEFAULT_USER_AGENT:'DEFAULT-UA'};return require(id)},console}; box.exports=box.module.exports;
  vm.runInNewContext(js,box,{filename:'request-v15227.js'});
  const r=box.module.exports.buildPlaybackRequest({url:'http://portal.example/live.ts',channel:{id:'c1',name:'C',headers:{'User-Agent':'OLD-UA'}},playlist:{source:'stalker'},isLive:true,runtimeHeaders:{'User-Agent':'MAG254-UA',Authorization:'Bearer tok',Cookie:'mac=x'}});
  if(r.headers['User-Agent']!=='MAG254-UA'||r.headers.Authorization!=='Bearer tok'||r.headers.Cookie!=='mac=x')throw new Error('runtime MAG headers PlaybackRequest üzerinde authoritative değil');
}
async function fixtureOneBasedAlias(){
  const requested=[];
  const m=loadStalker(async url=>{const u=new URL(url),type=u.searchParams.get('type'),action=u.searchParams.get('action'),p=Number(u.searchParams.get('p')||0);
    if(type==='itv'&&action==='get_genres')return http({js:[]});
    if(type==='itv'&&action==='get_all_channels')return http({js:{data:[{id:1,name:'Live',cmd:'ffrt http://localhost/ch/1'}]}});
    if(type==='vod'&&action==='get_categories')return http({js:[]});
    if(type==='series'&&action==='get_categories')return http({js:[]});
    if(type==='series'&&action==='get_ordered_list')return http({js:{total_items:0,max_page_items:2,data:[]}});
    if(type==='vod'&&action==='get_ordered_list'){
      requested.push(p);
      // Portal p=0'ı p=1 alias'ı gibi döndürüyor; gerçek ikinci sayfa p=2.
      if(p===0||p===1)return http({js:{total_items:4,max_page_items:2,data:[{id:11,name:'A',cmd:'a'},{id:12,name:'B',cmd:'b'}]}});
      if(p===2)return http({js:{total_items:4,max_page_items:2,data:[{id:13,name:'C',cmd:'c'},{id:14,name:'D',cmd:'d'}]}});
      return http({js:{total_items:4,max_page_items:2,data:[]}});
    }
    throw new Error('unexpected '+url);
  });
  const r=await m.stalkerCatalog({portal:'http://portal.example/c/',mac:'00:11:22:33:44:55'},{token:'t',endpoint:'http://portal.example/portal.php',compatProfile:'mag254-encoded'},{forceFresh:true});
  if(r.vod.length!==4)throw new Error('1-based alias pagination tüm öğeleri alamadı: '+r.vod.length);
  if(!requested.includes(2))throw new Error('p=0/p=1 aynıyken p=2 probe edilmedi: '+requested.join(','));
}
async function fixtureZeroBasedPagination(){
  const requested=[];
  const m=loadStalker(async url=>{const u=new URL(url),type=u.searchParams.get('type'),action=u.searchParams.get('action'),p=Number(u.searchParams.get('p')||0);
    if(type==='itv'&&action==='get_genres')return http({js:[]});
    if(type==='itv'&&action==='get_all_channels')return http({js:{data:[{id:1,name:'Live',cmd:'l'}]}});
    if(type==='vod'&&action==='get_categories')return http({js:[]});
    if(type==='series'&&action==='get_categories')return http({js:[]});
    if(type==='series'&&action==='get_ordered_list')return http({js:{total_items:0,max_page_items:2,data:[]}});
    if(type==='vod'&&action==='get_ordered_list'){requested.push(p); if(p===0)return http({js:{total_items:4,max_page_items:2,data:[{id:21},{id:22}]}}); if(p===1)return http({js:{total_items:4,max_page_items:2,data:[{id:23},{id:24}]}}); return http({js:{total_items:4,max_page_items:2,data:[]}});}
    throw new Error('unexpected '+url);
  });
  const r=await m.stalkerCatalog({portal:'http://portal.example/c/',mac:'00:11:22:33:44:55'},{token:'t',endpoint:'http://portal.example/portal.php',compatProfile:'mag254-encoded'},{forceFresh:true});
  if(r.vod.length!==4)throw new Error('0-based portalda page0 kayboldu: '+r.vod.length);
  if(requested[0]!==0||requested[1]!==1)throw new Error('0-based probe sırası bozuk: '+requested.join(','));
}
async function fixtureIgnoredPageGovernor(){
  let pages=0;
  const m=loadStalker(async url=>{const u=new URL(url),type=u.searchParams.get('type'),action=u.searchParams.get('action');
    if(type==='itv'&&action==='get_genres')return http({js:[]});
    if(type==='itv'&&action==='get_all_channels')return http({js:{data:[{id:1,name:'Live',cmd:'l'}]}});
    if(type==='vod'&&action==='get_categories')return http({js:[]});
    if(type==='series'&&action==='get_categories')return http({js:[]});
    if(type==='series'&&action==='get_ordered_list')return http({js:{total_items:0,max_page_items:2,data:[]}});
    if(type==='vod'&&action==='get_ordered_list'){pages++; return http({js:{total_items:999,max_page_items:2,data:[{id:31},{id:32}]}});}
    throw new Error('unexpected '+url);
  });
  const r=await m.stalkerCatalog({portal:'http://portal.example/c/',mac:'00:11:22:33:44:55'},{token:'t',endpoint:'http://portal.example/portal.php',compatProfile:'mag254-encoded'},{forceFresh:true});
  if(r.vod.length!==2)throw new Error('ignored-page portal duplicate governor veri bozdu');
  if(pages>3)throw new Error('ignored-page portal request fırtınası: '+pages);
}
async function fixtureRecoveryCreateLink(){
  let seen='';
  const m=loadStalker(async url=>{seen=url;return http({js:{cmd:'ffmpeg http://portal.example/live/2.ts'}})});
  const ses={token:'tok-456',endpoint:'http://portal.example/portal.php',compatProfile:'mag254-encoded'};
  await m.stalkerCreateLink({portal:'http://portal.example/c/',mac:'00:11:22:33:44:55',serial:'SER123'},ses,'ffrt http://localhost/ch/2','itv','',{recovery:true});
  const u=new URL(seen);
  if(u.searchParams.get('long_lived')!=='1'||u.searchParams.get('token')!=='tok-456'||u.searchParams.get('sn')!=='SER123')throw new Error('recovery create_link kimlik parametreleri eksik');
}
async function fixturePlaybackHeaders(){
  let createCount=0;
  const m=loadStalker(async url=>{const u=new URL(url); if(u.searchParams.get('action')==='create_link'){createCount++;return http({js:{cmd:'ffmpeg http://stream.portal.example/live/1.ts'}});} throw new Error('unexpected '+url);});
  const ses={token:'secret-token',endpoint:'http://portal.example/portal.php',compatProfile:'mag254-encoded'};
  const r=await m.stalkerResolveStream({portal:'http://portal.example/c/',mac:'00:11:22:33:44:55'},ses,'ffrt http://localhost/ch/1');
  if(createCount!==1)throw new Error('create_link count '+createCount);
  if(!/MAG254/.test(String(r.headers['User-Agent']||'')))throw new Error('MAG254 UA playback contextte yok');
  if(!r.headers.Authorization||!r.headers.Cookie)throw new Error('aynı provider ailesinde auth/cookie playback contextte yok');
  if(String(r.headers.Authorization).includes('<redacted>'))throw new Error('runtime header gerçek token taşımıyor');
}
async function fixtureExternalHostRedaction(){
  const m=loadStalker(async url=>{const u=new URL(url); if(u.searchParams.get('action')==='create_link')return http({js:{cmd:'ffmpeg https://cdn.other-network.test/live/1.m3u8'}}); throw new Error('unexpected '+url);});
  const ses={token:'secret-token',endpoint:'http://portal.example/portal.php',compatProfile:'mag254-encoded'};
  const r=await m.stalkerResolveStream({portal:'http://portal.example/c/',mac:'00:11:22:33:44:55'},ses,'ffrt http://localhost/ch/1');
  if(r.headers.Authorization||r.headers.Cookie)throw new Error('üçüncü taraf hosta credential sızıntısı var');
  if(!r.headers['User-Agent']||!r.headers.Referer)throw new Error('zararsız MAG compatibility headers kayboldu');
}
(async()=>{try{staticChecks();transpile(player,'PlayerHost.tsx',true);transpile(add,'add-playlist.tsx',true);transpile(request,'request.ts');fixturePlaybackRequestBridge();await fixtureOneBasedAlias();await fixtureZeroBasedPagination();await fixtureIgnoredPageGovernor();await fixtureRecoveryCreateLink();await fixturePlaybackHeaders();await fixtureExternalHostRedaction();console.log('TEMIZ — v15.2.27 MAG playback context + 456 refresh + adaptive pagination + add progress + emergency controls fixtures');}catch(e){console.error('HATA — v15.2.27 P0 gate:',e&&e.stack||e);process.exit(1)}})();
