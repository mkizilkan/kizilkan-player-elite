#!/usr/bin/env node
/**
 * KIZILKAN PLAYER ELITE v15.2.14 — fonksiyonel regresyon kapısı.
 * Ağ kullanmaz; gerçek TS kaynaklarını transpile edip Stalker katalog ve
 * BackupV3 restore state-machine'ini deterministik fixture'larla çalıştırır.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..', 'frontend');

function compile(rel) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
function http(obj, status=200) { return { ok: status >= 200 && status < 300, status, async text(){ return typeof obj === 'string' ? obj : JSON.stringify(obj); } }; }
function q(url) { const u = new URL(url); return { type:u.searchParams.get('type'), action:u.searchParams.get('action'), p:u.searchParams.get('p'), movie_id:u.searchParams.get('movie_id'), series_id:u.searchParams.get('series_id'), season_id:u.searchParams.get('season_id'), episode_id:u.searchParams.get('episode_id') }; }

async function testStalker() {
  const js = compile('src/utils/stalker.ts');
  const load = (fetchImpl) => {
    const req = id => id==='@/src/utils/diagnostics' ? { recordDiagnostic: async()=>{} } : require(id);
    const box={module:{exports:{}},exports:{},require:req,console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:fetchImpl};
    box.exports=box.module.exports; vm.runInNewContext(js,box,{filename:'stalker.ts'}); return box.module.exports;
  };
  const goodFetch = async url => {
    const x=q(url);
    if (x.type==='itv' && x.action==='get_genres') return http({js:[]});
    if (x.type==='itv' && x.action==='get_all_channels') return http({js:{data:[{id:1,name:'Live',cmd:'ffmpeg http://live'}]}});
    if (x.type==='vod' && x.action==='get_categories') return http({js:[{id:'10',title:'Movies'},{id:'20',title:'Series'}]});
    if (x.type==='series' && x.action==='get_categories') return http({js:[]});
    if (x.type==='vod' && x.action==='get_ordered_list') {
      if (x.p==='0') return http({js:{total_items:2,data:[]}});
      if (x.p==='1') return http({js:{total_items:2,data:[{id:11,name:'Movie',category_id:'10',cmd:'/m1.mp4'},{id:22,name:'Show',category_id:'20',is_series:'1'}]}});
      return http({js:{total_items:2,data:[]}});
    }
    if (x.type==='series' && x.action==='get_ordered_list') return http({js:{total_items:0,data:[]}});
    throw new Error('Fixture endpoint yok: '+url);
  };
  const m=load(goodFetch);
  const r=await m.stalkerCatalog({portal:'http://p',mac:'00:11:22:33:44:55'},{token:'t',endpoint:'http://p/portal.php'});
  if (r.channels.length!==1 || r.vod.length!==1 || r.series.length!==1 || r.diagnostics.seriesFromVod!==1) throw new Error('Stalker VOD is_series fallback sonucu yanlış');

  let vodCalls=0;
  const failFetch=async url=>{ const x=q(url);
    if (x.type==='itv'&&x.action==='get_genres') return http({js:[]});
    if (x.type==='itv'&&x.action==='get_all_channels') return http({js:{data:[{id:1,name:'Live'}]}});
    if (x.type==='vod') { vodCalls++; return http({error:'boom'},500); }
    if (x.type==='series'&&x.action==='get_categories') return http({js:[]});
    if (x.type==='series'&&x.action==='get_ordered_list') return http({js:{total_items:0,data:[]}});
    return http({js:[]});
  };
  const m2=load(failFetch); let surfaced=false;
  try { await m2.stalkerCatalog({portal:'http://p',mac:'00:11:22:33:44:55'},{token:'t',endpoint:'http://p/portal.php'}); }
  catch(e){ surfaced=/MAG VOD kataloğu alınamadı/.test(String(e?.message)); }
  if (!surfaced || vodCalls<2) throw new Error('Stalker transient VOD hatası sessizce yutuldu');

  // Ayrı /series endpointi desteklenmeyen portallarda VOD is_series fallback'i çalışmalı.
  const unsupportedSeriesFetch=async url=>{ const x=q(url);
    if (x.type==='itv'&&x.action==='get_genres') return http({js:[]});
    if (x.type==='itv'&&x.action==='get_all_channels') return http({js:{data:[{id:1,name:'Live'}]}});
    if (x.type==='vod'&&x.action==='get_categories') return http({js:[{id:'20',title:'Series'}]});
    if (x.type==='vod'&&x.action==='get_ordered_list') return x.p==='0' ? http({js:{total_items:1,data:[{id:33,name:'Fallback Show',category_id:'20',is_series:1}]}}) : http({js:{total_items:1,data:[]}});
    if (x.type==='series') return http({error:'not found'},404);
    return http({js:[]});
  };
  const m3=load(unsupportedSeriesFetch);
  const r3=await m3.stalkerCatalog({portal:'http://p',mac:'00:11:22:33:44:55'},{token:'t',endpoint:'http://p/portal.php'});
  if (r3.series.length!==1 || r3.diagnostics.seriesNative!=='UNSUPPORTED' || r3.diagnostics.seriesFromVod!==1) throw new Error('Stalker /series unsupported VOD fallback başarısız');

  // Ministra VOD-series sezon akışı: movie_id -> season descriptor -> season_id -> episode.
  const seasonFetch=async url=>{ const x=q(url);
    if (x.type==='series') return http({error:'not found'},404);
    if (x.type==='vod'&&x.action==='get_ordered_list'&&x.movie_id==='77'&&x.season_id==='0') return http({js:{total_items:1,data:[{id:'101',season:'1',is_season:'1'}]}});
    if (x.type==='vod'&&x.action==='get_ordered_list'&&x.movie_id==='77'&&x.season_id==='101') return http({js:{total_items:1,data:[{id:'501',name:'Episode 1',episode:'1',season:'1',cmd:'ffmpeg http://episode-1'}]}});
    if (x.type==='vod'&&x.action==='get_ordered_list'&&x.movie_id==='77') return http({js:{total_items:0,data:[]}});
    return http({js:{total_items:0,data:[]}});
  };
  const m4=load(seasonFetch);
  const info=await m4.stalkerSeriesInfo({portal:'http://p',mac:'00:11:22:33:44:55'},{token:'t',endpoint:'http://p/portal.php'},'77');
  if (info.seasons.length!==1 || info.seasons[0].episodes.length!==1 || !String(info.seasons[0].episodes[0].url||'').includes('episode-1')) throw new Error('Stalker VOD-series season/episode fixture başarısız');
}

class MemFile {
  constructor(a){ this.content=Buffer.from(a.content||''); this.uri='mem://x'; this.name=a.name||'x.kzb'; this.size=this.content.length; this.exists=true; }
  open(){ let off=0,self=this; return { get offset(){return off}, get size(){return self.content.length}, readBytes(n){const b=self.content.subarray(off,off+n);off+=b.length;return new Uint8Array(b)}, close(){} }; }
}
async function testBackup() {
  const js=compile('src/utils/backupV3.ts');
  const currentMeta={appName:'KIZILKAN PLAYER ELITE',version:'2.1',createdAt:'x',data:{},playlists:{profiles:{p:{metadata:'',playlistIds:['old']}}}};
  const incomingMeta={appName:'KIZILKAN PLAYER ELITE',version:'3.0-meta',createdAt:'x',data:{},playlists:{profiles:{p:{metadata:'',playlistIds:['new']}}}};
  const data=[{magic:'KIZILKAN_BACKUP_V3',version:3,metadata:incomingMeta},{type:'playlist-start',playlistId:'new'},{type:'chunk',playlistId:'new',kind:'live',items:[{id:'1'}]},{type:'playlist-end',playlistId:'new'},{type:'end',playlists:1,items:1}].map(JSON.stringify).join('\n')+'\n';
  const make=(failMeta=false)=>{
    const staged=new Map(), live=new Map([['old',[{id:'old'}]]]); let swapped=false,rolled=false,finalized=false;
    const core={available:true,
      async beginChunkedPlaylistImport(id){staged.set(id,[]);return true},
      async appendPlaylistChunk(id,k,j){const a=JSON.parse(j);staged.get(id).push(...a);return a.length},
      async finishChunkedPlaylistImport(id){return{roomIndexed:true,channels:staged.get(id).length,vod:0,series:0}},
      async applyAtomicPlaylistRestore(session,maps){core.back=new Map(live);for(const x of maps){if(x.stageId)live.set(x.targetId,[...staged.get(x.stageId)]);else live.delete(x.targetId)}swapped=true;return true},
      async finalizeAtomicPlaylistRestore(){finalized=true;core.back=null;return true},
      async rollbackAtomicPlaylistRestore(){live.clear();for(const [k,v] of core.back||[])live.set(k,v);rolled=true;return true},
      async cancelChunkedPlaylistImport(){return true}, async removePlaylistIndex(){return true}, async queryItems(){return{items:[],hasMore:false,total:0}}
    };
    const backup={backupPlaylistIds:p=>Object.values(p.playlists?.profiles||{}).flatMap(x=>x.playlistIds||[]),createBackupMetadata:async()=>currentMeta,restoreBackupMetadataExact:async meta=>{if(meta?.version==='3.0-meta'&&failMeta)throw new Error('meta fail');return{profiles:1,playlists:1,heavyPlaylists:0,settings:1,warnings:[]}}};
    const req=id=>id==='expo-file-system'?{File:MemFile,Paths:{cache:{}}}:id==='@/modules/kizilkan-native-core'?{KizilkanNativeCore:core}:id==='@/src/utils/storage/bigStore'?{bigStore:{remove:async id=>(live.delete(id),true)}}:id==='@/src/utils/backup'?backup:require(id);
    const box={module:{exports:{}},exports:{},require:req,console,TextDecoder,TextEncoder,Uint8Array,Math,Date};box.exports=box.module.exports;vm.runInNewContext(js,box,{filename:'backupV3.ts'});
    return {m:box.module.exports,live,state:()=>({swapped,rolled,finalized})};
  };
  let x=make(false); await x.m.restoreFullBackupV3({content:data,name:'ok.kzb'});
  if(x.live.has('old')||x.live.get('new')?.length!==1||!x.state().finalized) throw new Error('Backup atomik başarılı restore fixture başarısız');
  x=make(true); let failed=false; try{await x.m.restoreFullBackupV3({content:data,name:'meta-fail.kzb'})}catch(e){failed=/meta fail/.test(String(e?.message))}
  if(!failed||!x.live.has('old')||x.live.has('new')||!x.state().rolled) throw new Error('Backup metadata hatasında Room rollback başarısız');
  const broken=data.split('\n').slice(0,-2).join('\n')+'\n'; x=make(false); try{await x.m.restoreFullBackupV3({content:broken,name:'broken.kzb'});throw new Error('Eksik backup kabul edildi')}catch(e){if(!/son doğrulama|tamamlanmamış/i.test(String(e?.message)))throw e}
  if(!x.live.has('old')||x.state().swapped) throw new Error('Eksik backup canlı Room verisine dokundu');
}

(async()=>{ await testStalker(); await testBackup(); console.log('TEMIZ — v15.2.14 Stalker/Backup fonksiyonel fixture kapisi'); })().catch(e=>{console.error('HATA — v15.2.14 hardening fixture:',e);process.exit(1)});
