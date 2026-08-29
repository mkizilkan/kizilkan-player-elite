#!/usr/bin/env node
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('./_ts');
const ROOT=path.resolve(__dirname,'..'), FRONT=path.join(ROOT,'frontend');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const stalker=read('frontend/src/utils/stalker.ts');
const add=read('frontend/app/add-playlist.tsx');
const ctx=read('frontend/src/store/PlaylistContext.tsx');
const nativeIndex=read('frontend/modules/kizilkan-native-core/index.ts');
const nativeKt=read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const dao=read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeDataDao.kt');
function need(src,re,msg){ if(!re.test(src)){ throw new Error(msg); } }
function forbid(src,re,msg){ if(re.test(src)){ throw new Error(msg); } }
function staticChecks(){
  // v16.1.0 SÖZLEŞME GÜNCELLEMESİ: "golden" profili listenin BAŞINA eklendi.
  // Gerekçe: v9.6.0'da MAG portalı çalışıyordu (SURUM-NOTU-v9.7.0.md kullanıcı
  // testi). O sürümün SADE isteği (MAG250 UA + kodlanmış mac + ham timezone +
  // X-User-Agent/Accept-Language/Accept-Encoding YOK) "golden" olarak geri
  // getirildi ve ilk sırada denenir. Dört eski profil YEDEK olarak korunur.
  // v16.7.0 SÖZLEŞME GÜNCELLEMESİ: "fulldevice" profili listenin BAŞINA eklendi.
  // Gerekçe (cihaz kanıtı 29.08): portal handshake'e HTTP 200 + "Authorization
  // failed." (21 bayt) döndürüyordu ve bu TÜM profillerde oluyordu. Sebep:
  // çerezde yalnız mac gönderiliyordu; gerçek MAG kutuları adid/device_id/
  // device_id2/hw_version/sn de gönderir ve anti-korsan katmanı bunu doğrular.
  // v16.8.0: "fulldevice-macid" eklendi — kullanıcının girdiği seri numarası
  // device_id'yi (sha256(serial)) belirlediği için yanlış seri parmak izini
  // bozup portalın reddine yol açabiliyor; bu varyant seriyi yok sayar.
  need(stalker,/MAG_COMPAT_PROFILES[^\n]+\["fulldevice", "fulldevice-macid", "golden", "mag254-encoded", "mag254-raw", "mag250-encoded", "mag250-raw"\]/,'fulldevice(+macid) + golden + MAG254 profil sırası yok');
  need(stalker,/fulldevice-macid/,'seriden bağımsız kimlik varyantı yok');
  need(stalker,/HANDSHAKE_PARAM_VARIANTS/,'handshake parametre varyantları yok');
  need(stalker,/profile === "fulldevice"/,'tam cihaz çerezi dalı yok');
  need(stalker,/primeMagIdentity/,'cihaz kimliği ön-hesaplaması yok');
  need(stalker,/profile === "golden"/,'golden profil başlık dalı yok');
  need(stalker,/model:"MAG250"\|"MAG254"="MAG254"/,'get_profile varsayılanı MAG254 değil');
  need(stalker,/MAG_LEARNED_KEY/,'endpoint/profile learning yok');
  need(stalker,/STALKER_HANDSHAKE_PLAN/,'handshake plan telemetrisi yok');
  need(stalker,/handshakeRejectedStatus/,'HTTP reject governor yok');
  need(stalker,/sanitizeBodySnippet/,'non-2xx body sınıflandırma/redaksiyon yok');
  need(stalker,/ORDERED_LIST_ABSOLUTE_MAX_PAGES/,'adaptive pagination hard cap yok');
  need(stalker,/DUPLICATE_PAGE/,'duplicate page governor yok');
  need(stalker,/NO_NEW_IDS/,'no-new-id governor yok');
  need(stalker,/signal\?: AbortSignal/,'catalog cancellation signal yok');
  need(stalker,/export async function stalkerEnrichment/,'VOD/Series-only enrichment yok');
  need(add,/liveOnly:\s*true/,'MAG add live-first değil');
  need(add,/await addPlaylist\(playlist\)[\s\S]*if \(magEnrichment\) void magEnrichment\.run\(\)/,'enrichment addPlaylist sonrasında başlamıyor');
  need(add,/STALKER_ADD_COMMIT_START/,'commit start telemetry yok');
  need(add,/STALKER_ADD_COMMIT_OK/,'commit ok telemetry yok');
  need(add,/deviceModel:\s*"MAG254"/,'MAG form default MAG254 değil');
  need(ctx,/enrichPlaylistMedia/,'Room-safe enrichment context API yok');
  need(nativeIndex,/replacePlaylistKindJson/,'native partial kind replace bridge yok');
  need(nativeKt,/AsyncFunction\("replacePlaylistKindJson"\)/,'native partial kind replace implementasyonu yok');
  need(dao,/deleteKind\(playlistId: String, kind: String\)/,'Room kind delete DAO yok');
  forbid(add,/magEnrichment\s*=\s*\{[\s\S]{0,250}run:\s*async[\s\S]{0,250}await updatePlaylist\(/,'Grok update-before-add race geri geldi');
  forbid(stalker,/for \(let page=0; page<10000/,'10.000 sayfalık live fallback geri geldi');
  forbid(stalker,/while \(page <= 10000/,'10.000 sayfalık ordered-list loop geri geldi');
}
function compileStalker(){
  return ts.transpileModule(stalker,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true}).outputText;
}
function http(body,status=200){return {ok:status>=200&&status<300,status,headers:{get:()=>status===512?'application/json':'application/json'},url:'http://p/portal.php',redirected:false,async text(){return typeof body==='string'?body:JSON.stringify(body)}};}
function load(fetchImpl){
  const memory=new Map(); const js=compileStalker();
  const req=id=>{
    if(id==='@/src/utils/diagnostics') return {recordDiagnostic:async()=>{},markTask:()=>()=>{}};
    if(id==='@/src/utils/storage') return {storage:{getItem:async(k,f)=>memory.has(k)?memory.get(k):f,setItem:async(k,v)=>{memory.set(k,v);return true;},removeItem:async(k)=>{memory.delete(k);return true;}}};
    if(id==='expo-crypto') return {CryptoDigestAlgorithm:{MD5:'MD5',SHA1:'SHA1',SHA256:'SHA256'},digestStringAsync:async(_a,v)=>('abc123'+v).padEnd(64,'0').slice(0,64)};
    return require(id);
  };
  const box={module:{exports:{}},exports:{},require:req,console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:fetchImpl}; box.exports=box.module.exports;
  vm.runInNewContext(js,box,{filename:'stalker-v15225.ts'}); return box.module.exports;
}
async function fixtureHandshakeMag254(){
  let calls=0,firstUA='';
  const m=load(async(_url,opts)=>{calls++; if(!firstUA) firstUA=String(opts?.headers?.['User-Agent']||''); return http({js:{token:'tok',random:'r'}});});
  const s=await m.stalkerHandshake({portal:'http://p/c/portal.php',mac:'00:11:22:33:44:55',deviceModel:'MAG254'});
  if(calls!==1) throw new Error('MAG254 başarılı handshake tek istekte durmadı: '+calls);
  // v16.1.0: İLK deneme artık "golden" (v9.6.0'ın kanıtlanmış SADE isteği,
  // MAG250 kimliğiyle). MAG254 profilleri hemen ardından yedek olarak gelir.
  // Bu test, ilk isteğin golden ile yapıldığını doğrular.
  // v16.7.0: İLK deneme artık "fulldevice" (tam MAG çerezi + MAG254 kimliği).
  // golden ve diğer profiller yedek olarak hemen ardından gelir.
  if(!/MAG254 stbapp/.test(firstUA) || s.compatProfile!=='fulldevice') throw new Error('fulldevice ilk profil/header doğrulanamadı: '+firstUA+' / '+s.compatProfile);
}
async function fixtureRejectBounded(){
  let calls=0;
  const m=load(async()=>{calls++; return http({js:{error:'blocked'}},512);});
  let failed=false; try{await m.stalkerHandshake({portal:'http://p/c/portal.php',mac:'00:11:22:33:44:55',deviceModel:'MAG254'});}catch{failed=true;}
  if(!failed) throw new Error('HTTP 512 error JSON yanlışlıkla handshake success oldu');
  if(calls>2) throw new Error('HTTP 512 endpoint/profile fırtınası kesilmedi: '+calls);
}
async function fixtureDuplicatePagination(){
  let vodPages=0;
  const m=load(async url=>{const u=new URL(url),type=u.searchParams.get('type'),action=u.searchParams.get('action');
    if(type==='itv'&&action==='get_genres') return http({js:[]});
    if(type==='itv'&&action==='get_all_channels') return http({js:{data:[{id:1,name:'L',cmd:'http://l'}]}});
    if(type==='vod'&&action==='get_categories') return http({js:[]});
    if(type==='series'&&action==='get_categories') return http({js:[]});
    if(type==='vod'&&action==='get_ordered_list'){vodPages++; return http({js:{total_items:999,data:[{id:10,name:'V',cmd:'v'}]}});}
    if(type==='series'&&action==='get_ordered_list') return http({js:{total_items:0,data:[]}});
    throw new Error('fixture endpoint '+url);
  });
  const r=await m.stalkerCatalog({portal:'http://p',mac:'00:11:22:33:44:55'},{token:'t',endpoint:'http://p/portal.php',compatProfile:'mag254-encoded'});
  if(r.vod.length!==1 || vodPages>3) throw new Error(`duplicate pagination governor başarısız vod=${r.vod.length} pages=${vodPages}`); // v15.2.27: p=0/p=1 alias ise p=2 güvenli probe edilir
}
(async()=>{try{staticChecks(); await fixtureHandshakeMag254(); await fixtureRejectBounded(); await fixtureDuplicatePagination(); console.log('TEMIZ — v15.2.25 MAG254 learned handshake + bounded reject + live-first durable commit + Room-safe enrichment + adaptive pagination fixtures');}catch(e){console.error('HATA — v15.2.25 MAG architecture:',e.message);process.exit(1);}})();
