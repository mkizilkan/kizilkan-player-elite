import * as Crypto from 'expo-crypto';
import type { Playlist } from '@/src/types';
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';
import { fetchAndParseM3U,parseM3U,xtreamLogin,xtreamLiveStreams,xtreamVod,xtreamSeries } from './iptv';
import { magCandidateIdentity,reusableXtreamPlaylistId } from './accountIdentity';
import { hitRecordIdentity,type HitFileRecord } from './hitFileImporter';
import { beginDiagnosticTrace } from './diagnostics';

export type HitImportContext={signal:AbortSignal;ownerId:string;owns:()=>boolean;playlists:Playlist[];commit:(pl:Playlist,prepared:boolean)=>Promise<boolean>;update:(id:string,patch:Partial<Playlist>)=>Promise<void>;progress:(text:string)=>void};
/** Selected records are revalidated; a file's HIT/Active claim is never accepted as evidence. */
export async function importHitRecord(record:HitFileRecord,ctx:HitImportContext):Promise<void>{
  const check=()=>{if(ctx.signal.aborted||!ctx.owns())throw Object.assign(new Error('İçe aktarma iptal edildi veya profil değişti.'),{kind:'CANCELLED'});};check();
  if(record.kind==='xtream'&&reusableXtreamPlaylistId(ctx.playlists,record.server,record.username||'',record.password||''))throw new Error('Bu hesap zaten ekli; mevcut katalog korundu.');
  if(record.kind==='stalker'&&ctx.playlists.some(p=>p.source==='stalker'&&magCandidateIdentity(p.stalkerPortal||'',p.stalkerMac||'')===magCandidateIdentity(record.server,record.mac||'')))throw new Error('Bu MAG hesabı zaten ekli; mevcut katalog korundu.');
  if(record.kind==='m3u_url'&&ctx.playlists.some(p=>p.m3uUrl===record.server))throw new Error('Bu M3U adresi zaten ekli.');
  const digest=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,hitRecordIdentity(record));check();
  const id=`pl-hit-${digest.slice(0,32)}`;
  if(ctx.playlists.some(p=>p.id===id))throw new Error('Bu dosya kaydı zaten ekli.');
  const trace=beginDiagnosticTrace('import','HIT_FILE_IMPORT',{kind:record.kind,sourceCount:record.sources.length,playlistId:id});
  const commit=async(pl:Playlist,prepared=false)=>{check();if(!await ctx.commit(pl,prepared))throw new Error('Hesap kaydı kullanıcı tarafından iptal edildi.');check();};
  const base={id,name:record.name,channels:[],vod:[],series:[],createdAt:new Date().toISOString()};
  try{
    if(record.kind==='xtream'){
      const cred={operationId:trace.operationId,server:record.server,username:record.username!,password:record.password!};
      const login=await trace.measure('account',()=>xtreamLogin(cred,ctx.signal));check();
      const playlist:Playlist={...base,source:'xtream',xtreamServer:cred.server,xtreamUsername:cred.username,xtreamPassword:cred.password,accountInfo:login.user_info as any,serverInfo:login.server_info,endpoints:[{url:cred.server,kind:'xtream',source:'manual',accountVerifiedAt:new Date().toISOString(),primary:true}]};
      if(KizilkanNativeCore.available){
        if(KizilkanNativeCore.getBulkImportSnapshot().running)throw new Error('Başka bir hesap ekleme işlemi sürüyor; bitince tekrar deneyin.');
        let runId:string|null=null,adopted=false,cancelRequested=false;
        const cancel=()=>{if(!cancelRequested&&runId&&KizilkanNativeCore.getBulkImportSnapshot().runId===runId){cancelRequested=true;void KizilkanNativeCore.cancelBulkImport().catch(()=>trace.stage('cancel-failed'));}};
        ctx.signal.addEventListener('abort',cancel,{once:true});
        try{
          runId=await KizilkanNativeCore.startBulkImport([{jobKey:id,playlistId:id,displayName:record.name,...cred}],1);if(!runId)throw new Error('Native hesap ekleme başlatılamadı.');if(ctx.signal.aborted)cancel();
          while(true){check();const snapshot=KizilkanNativeCore.getBulkImportSnapshot();if(snapshot.runId!==runId)throw new Error('İçe aktarma iş sahipliği değişti.');
            const row=snapshot.jobs?.find((j:any)=>j.jobKey===id);ctx.progress(row?.message||'Native katalog hazırlanıyor…');
            if(row?.liveReady&&!adopted){const summary=await KizilkanNativeCore.getPlaylistSummaryVerified(id);check();if(summary?.roomIndexed&&(summary.channels||0)>0){await commit({...playlist,channelsCount:summary.channels,vodCount:summary.vod,seriesCount:summary.series,catalogSync:{initialSyncState:'live_ready',roomVerified:true,updatedAt:new Date().toISOString()}},true);adopted=true;}}
            if(row?.state==='failed')throw new Error(row.message||'Katalog alınamadı; doğrulanmış önceki kayıt korundu.');
            if(row?.state==='completed'){
              const summary=await KizilkanNativeCore.getPlaylistSummaryVerified(id);check();if(!summary?.roomIndexed||Number(summary.channels||0)+Number(summary.vod||0)+Number(summary.series||0)===0)throw new Error('Room katalog kaydı doğrulanamadı.');
              const ready={...playlist,endpoints:playlist.endpoints?.map(e=>({...e,catalogVerifiedAt:new Date().toISOString()})),channelsCount:summary.channels,vodCount:summary.vod,seriesCount:summary.series,catalogSync:{initialSyncState:'ready' as const,roomVerified:true,updatedAt:new Date().toISOString()},lastRefreshOk:true};
              if(adopted){const {channels:_,vod:__,series:___,...metadata}=ready;await ctx.update(id,metadata);}else await commit(ready,true);break;
            }
            if(!snapshot.running)throw new Error(snapshot.error||'İçe aktarma tamamlanmadan durdu.');
            await new Promise<void>(resolve=>setTimeout(resolve,500));
          }
        }catch(error){cancel();throw error;}finally{ctx.signal.removeEventListener('abort',cancel);}
      }else{
        const [channels,vod,series]=await Promise.all([xtreamLiveStreams(cred,ctx.signal),xtreamVod(cred,ctx.signal),xtreamSeries(cred,ctx.signal)]);check();if(!channels.length&&!vod.length&&!series.length)throw new Error('Hesap bağlandı ancak içerik bulunamadı.');await commit({...playlist,channels,vod,series});
      }
    }else if(record.kind==='stalker'){
      const st=await import('./stalker');const {resolveMagInput}=await import('./magResolveInput');
      const cred:import('./stalker').StalkerCreds={portal:record.server,mac:record.mac!,profileId:ctx.ownerId,deviceModel:'MAG320',requestScope:{transport:'direct',signal:ctx.signal,operationId:trace.operationId}};
      const resolved=await trace.measure('discovery',()=>resolveMagInput(cred,{signal:ctx.signal,onStage:ctx.progress}));check();cred.portal=resolved.endpoint;cred.resolvedPortal=resolved;cred.endpointPolicy='exact';
      if(ctx.playlists.some(p=>p.source==='stalker'&&magCandidateIdentity(p.stalkerPortal||'',p.stalkerMac||'')===magCandidateIdentity(cred.portal,cred.mac)))throw new Error('Çözülen MAG hesabı zaten ekli.');
      const {session,profile}=await trace.measure('account',()=>st.stalkerLogin(cred,{signal:ctx.signal}));check();
      const account=await st.stalkerAccountSnapshot(cred,session,profile,{signal:ctx.signal});check();
      const live=await trace.measure('live',()=>st.stalkerCatalog(cred,session,{liveOnly:true,signal:ctx.signal,onProgress:p=>ctx.progress(p.message)}));check();
      const pl:Playlist={...base,source:'stalker',stalkerPortal:session.endpoint,stalkerResolvedPortal:session.resolvedPortal||resolved,stalkerMac:cred.mac,accountInfo:account.info,endpoints:[{url:session.endpoint,kind:'stalker',source:'manual',accountVerifiedAt:new Date().toISOString(),...(live.channels.length?{catalogVerifiedAt:new Date().toISOString()}:{})}],channels:live.channels,catalogSync:{initialSyncState:'live_ready',roomVerified:true,updatedAt:new Date().toISOString()}};
      let adopted=false;if(live.channels.length){await commit(pl);adopted=true;}
      try{
        const media=await trace.measure('media',()=>st.stalkerEnrichment(cred,session,{signal:ctx.signal,onProgress:p=>ctx.progress(p.message)}));check();
        if(!live.channels.length&&!media.vod.length&&!media.series.length)throw new Error('Portal bağlandı ancak doğrulanmış katalog alınamadı.');
        if(media.diagnostics?.vod==='ERROR'||media.diagnostics?.seriesNative==='ERROR')throw new Error('Film/dizi kataloğu eksik kaldı; canlı katalog korundu ve devam için işaretlendi.');
        const patch={vod:media.vod,series:media.series,endpoints:pl.endpoints?.map(e=>({...e,catalogVerifiedAt:new Date().toISOString()})),catalogSync:{initialSyncState:'ready' as const,roomVerified:true,updatedAt:new Date().toISOString()}};
        if(adopted)await ctx.update(id,patch);else await commit({...pl,...patch});
      }catch(error:any){if(adopted&&ctx.owns()&&!ctx.signal.aborted)await ctx.update(id,{catalogSync:{initialSyncState:'partial_error',initialSyncError:String(error?.message||error),roomVerified:true,updatedAt:new Date().toISOString()},lastRefreshOk:false});throw error;}
    }else{
      if(KizilkanNativeCore.available){const summary=await trace.measure('catalog',()=>record.kind==='m3u_file'?KizilkanNativeCore.importM3uText(id,record.content||''):KizilkanNativeCore.fetchAndImportM3u(id,record.server));check();
        if(!summary?.roomIndexed||Number(summary.channels||0)+Number(summary.vod||0)+Number(summary.series||0)===0)throw new Error('M3U içeriği doğrulanamadı.');
        await commit({...base,source:record.kind,m3uUrl:record.kind==='m3u_url'?record.server:undefined,channelsCount:summary.channels,vodCount:summary.vod,seriesCount:summary.series},true);
      }else{const parsed=record.kind==='m3u_file'?parseM3U(record.content||''):await fetchAndParseM3U(record.server);check();if(!parsed.channels.length&&!parsed.vod?.length&&!parsed.series?.length)throw new Error('M3U dosyası boş.');await commit({...base,source:record.kind,m3uUrl:record.kind==='m3u_url'?record.server:undefined,channels:parsed.channels,vod:parsed.vod||[],series:parsed.series||[]});}
    }
    await trace.finish('success');
  }catch(error:any){await trace.finish(ctx.signal.aborted?'cancelled':'failed',{errorKind:error?.kind});throw error;}
}
