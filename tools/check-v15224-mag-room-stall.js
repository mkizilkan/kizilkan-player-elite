#!/usr/bin/env node
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('./_ts');
const root=path.resolve(__dirname,'..'),front=path.join(root,'frontend'); let bad=0;
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const need=(r,t,l)=>{if(!read(r).includes(t)){console.log(`HATA — ${l}: ${t}`);bad++;}};
const order=(r,a,b,l)=>{const s=read(r),ia=s.indexOf(a),ib=s.indexOf(b,Math.max(0,ia)); if(ia<0||ib<0||ia>=ib){console.log(`HATA — ${l}: sıra doğrulanamadı`);bad++;}};
const pkg=JSON.parse(fs.readFileSync(path.join(front,'package.json'),'utf8'));
const app=JSON.parse(fs.readFileSync(path.join(front,'app.json'),'utf8'));
const _sv=v=>{const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/);return m?Number(m[1])*1000000+Number(m[2])*1000+Number(m[3]):-1;};
const _code=v=>{const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/);return m?Number(m[1])*10000+Number(m[2])*100+Number(m[3]):-1;};
// v16.1.0: 15.2 serisine KİLİTLİYDİ. Amaç korunuyor: en az 15.2.24 + üçlü tutarlılık.
const verOk = /^\d+\.\d+\.\d+$/.test(pkg.version) && pkg.version===app.expo.version && Number(app.expo.android.versionCode)===_code(pkg.version);
if(!verOk || _sv(pkg.version) < _sv('15.2.24')){console.log('HATA — sürüm üçlüsü tutarsız veya asgari sürümün altında');bad++;}

// MAG duplicate-download / telemetry / progress
need('frontend/src/utils/stalker.ts','stalkerCatalogInFlight','MAG single-flight map');
need('frontend/src/utils/stalker.ts','STALKER_CATALOG_SINGLEFLIGHT_JOIN','MAG single-flight telemetri');
need('frontend/src/utils/stalker.ts','STALKER_CATALOG_CACHE_HIT','MAG katalog cache telemetri');
need('frontend/src/utils/stalker.ts','CATALOG_CACHE_TTL_MS','MAG kısa ömürlü cache');
need('frontend/src/utils/stalker.ts','STALKER_CATALOG_STAGE_DONE','MAG aşama süre telemetrisi');
need('frontend/src/utils/stalker.ts','Film kataloğu yükleniyor · sayfa','MAG VOD gerçek sayfa ilerlemesi');
need('frontend/src/utils/stalker.ts','Dizi kataloğu yükleniyor · sayfa','MAG Series gerçek sayfa ilerlemesi');
need('frontend/src/utils/refreshPlaylist.ts','forceFresh: true','manuel MAG yenileme gerçek fresh istek');
need('frontend/app/add-playlist.tsx','onProgress: (progress) => setProgress(progress.message)','MAG ekleme gerçek aşama UI');
need('frontend/app/edit-playlist.tsx','onProgress: (progress) => setProgress(progress.message)','MAG düzenleme gerçek aşama UI');

// Room activation must be verified before activeId persistence/publication
need('frontend/src/store/PlaylistContext.tsx','PLAYLIST_SWITCH_VERIFY_START','Room switch verify start');
need('frontend/src/store/PlaylistContext.tsx','PLAYLIST_SWITCH_VERIFY_READY','Room switch verify ready');
need('frontend/src/store/PlaylistContext.tsx','PLAYLIST_SWITCH_VERIFY_FAILED','Room switch terminal failure');
order('frontend/src/store/PlaylistContext.tsx','PLAYLIST_SWITCH_VERIFY_READY','setActiveId(id);','Room doğrulama active publish öncesi');

// Media3 main-thread wake-up pressure mitigation
need('frontend/src/player/v2/health.ts','PLAYER_BACKGROUND_TIME_UPDATE_MS = 5000','arka plan Media3 update 5s');
need('frontend/src/player/PlayerHost.tsx','MEDIA3_TIMEUPDATE_INTERVAL','adaptive Media3 interval telemetrisi');
need('frontend/src/player/PlayerHost.tsx','PLAYER_BACKGROUND_TIME_UPDATE_MS','adaptive Media3 interval kullanımı');

for(const rel of ['src/utils/stalker.ts','src/utils/refreshPlaylist.ts','src/store/PlaylistContext.tsx','src/player/PlayerHost.tsx','app/add-playlist.tsx','app/edit-playlist.tsx','src/player/v2/health.ts']){
  try{const r=ts.transpileModule(fs.readFileSync(path.join(front,rel),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true}); const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); if(errs.length){console.log(`HATA — TS transpile ${rel}: ${errs.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join(' | ')}`); bad+=errs.length;}}
  catch(e){console.log(`HATA — TS transpile ${rel}: ${e.message}`);bad++;}
}

async function functionalSingleFlightFixture(){
  const src=fs.readFileSync(path.join(front,'src/utils/stalker.ts'),'utf8');
  const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let liveCalls=0;
  const http=(obj)=>({ok:true,status:200,headers:{get:()=> 'application/json'},url:'http://p/portal.php',redirected:false,async text(){return JSON.stringify(obj);}});
  const fetch=async url=>{
    const u=new URL(url), type=u.searchParams.get('type'), action=u.searchParams.get('action'), page=u.searchParams.get('p');
    if(type==='itv'&&action==='get_genres') return http({js:[]});
    if(type==='itv'&&action==='get_all_channels'){liveCalls++; await new Promise(r=>setTimeout(r,15)); return http({js:{data:[{id:1,name:'Live',cmd:'ffmpeg http://live'}]}});}
    if(type==='vod'&&action==='get_categories') return http({js:[]});
    if(type==='series'&&action==='get_categories') return http({js:[]});
    if((type==='vod'||type==='series')&&action==='get_ordered_list') return http({js:{total_items:0,data:[]}});
    throw new Error('fixture endpoint yok '+url);
  };
  const memoryStore=new Map();
  const req=id=>{
    if(id==='@/src/utils/diagnostics') return {recordDiagnostic:async()=>{},markTask:()=>()=>{}};
    if(id==='@/src/utils/storage') return {storage:{getItem:async(k,f)=>memoryStore.has(k)?memoryStore.get(k):f,setItem:async(k,v)=>{memoryStore.set(k,v);return true;},removeItem:async(k)=>{memoryStore.delete(k);return true;}}};
    if(id==='@/modules/kizilkan-native-core') return { KizilkanNativeCore:{ available:false, magExactRequest:async()=>null } };
      return require(id);
  };
  const box={module:{exports:{}},exports:{},require:req,console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch}; box.exports=box.module.exports;
  vm.runInNewContext(js,box,{filename:'stalker-v15224.ts'}); const m=box.module.exports;
  const cred={portal:'http://p',mac:'00:11:22:33:44:55'}, ses={token:'t',endpoint:'http://p/portal.php'};
  const [a,b]=await Promise.all([m.stalkerCatalog(cred,ses,{forceFresh:true}),m.stalkerCatalog(cred,ses,{forceFresh:true})]);
  if(a.channels.length!==1||b.channels.length!==1||liveCalls!==1) throw new Error(`single-flight fixture başarısız liveCalls=${liveCalls}`);
  await m.stalkerCatalog(cred,ses);
  if(liveCalls!==1) throw new Error(`catalog cache fixture başarısız liveCalls=${liveCalls}`);
  await m.stalkerCatalog(cred,ses,{forceFresh:true});
  if(liveCalls!==2) throw new Error(`forceFresh fixture başarısız liveCalls=${liveCalls}`);
}

(async()=>{
  if(bad){console.log(`\n❌ ${bad} v15.2.24 HARD-GATE HATASI`);process.exit(1);}
  try{await functionalSingleFlightFixture();}
  catch(e){console.log('HATA — v15.2.24 single-flight fixture:',e.message);process.exit(1);}
  console.log('TEMIZ — v15.2.24 MAG single-flight + cache fixture + verified Room activation + adaptive Media3 stall hardening');
})().catch(e=>{console.error(e);process.exit(1);});
