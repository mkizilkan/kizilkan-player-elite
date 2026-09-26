/**
 * KIZILKAN PLAYER — Liste Yenileme
 * Dosya  : frontend/src/utils/refreshPlaylist.ts
 * Sürüm  : v1.0.0 (v4.9.0)
 *
 * Bir listenin içeriğini kaynağından yeniden çeker (kanallar, filmler, diziler).
 * TAMAMEN CİHAZ-İÇİ — backend kullanmaz. Xtream'de üç istek paralel gider.
 *
 * v9.6.0: Stalker/MAC de artık cihaz-içi yenileniyor (src/utils/stalker.ts).
 */

import {
  fetchAndParseM3UConditional,
  xtreamLogin,
  xtreamLiveStreams,
  xtreamVod,
  xtreamSeries,
} from "./iptv";
import type { Playlist } from "@/src/types";
import { resolveBoundPanel } from "@/src/utils/serverCode";
import { markTask, recordDiagnostic } from "@/src/utils/diagnostics";
import { normalizeHost } from "@/src/player/hostFailover";
import { applyContentSelection } from "@/src/utils/contentSelection";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";

export type CatalogKind="live"|"vod"|"series";
export type CatalogProgressState="waiting"|"saving"|"done"|"error"|"skipped";
export type IncrementalCatalogDelivery={kind:CatalogKind;items:any[];fetchElapsedMs:number;rawCount:number;filteredCount:number};
export type RefreshOptions={
  ignoreContentSelection?:boolean;
  kinds?:CatalogKind[];
  forceUnconditional?:boolean;
  /** v17.10.0: lifecycle/cancel sinyali. Background recovery bu sinyalle gerçek HTTP'yi keser. */
  signal?: AbortSignal;
  /**
   * v17.9.10 — yalnız otomatik boş-kabuk onarımında kullanılır.
   * Kataloglar live→vod→series sırasıyla alınır ve her biri hazır olduğunda
   * çağırana teslim edilir. Böylece üç dev dizi aynı anda bellekte tutulmaz.
   * Normal/elle yenilemenin paralel davranışı DEĞİŞMEZ.
   */
  incrementalDelivery?: (delivery:IncrementalCatalogDelivery)=>Promise<void>|void;
  /** Canlı hazırken VOD/Series geçici hata verirse mevcut kısmi katalog korunur. */
  allowPartialRecovery?:boolean;
};
export type RefreshPhase = "dns" | "login" | "content" | "save" | "done" | "error";
export type RefreshProgress = {
  phase: RefreshPhase;
  message: string;
  live?: CatalogProgressState;
  vod?: CatalogProgressState;
  series?: CatalogProgressState;
  liveCount?: number; vodCount?: number; seriesCount?: number;
  liveElapsedMs?: number; vodElapsedMs?: number; seriesElapsedMs?: number;
};

export interface RefreshResult {
  ok: boolean;
  /** updatePlaylist'e verilecek alanlar. */
  patch?: Partial<Playlist>;
  /** Otomatik recovery'de en az bir katalog kurtarıldı ama bazıları hata verdi. */
  partial?: boolean;
  failedKinds?: CatalogKind[];
  /** Kullanıcıya gösterilecek özet. */
  message: string;
}

/** Manuel yenileme ve otomatik boş-kabuk onarımı AYNI gösterimi kullanır. */
export function formatRefreshProgress(p:RefreshProgress):string {
  const hasCatalogState=!!(p.live||p.vod||p.series);
  if(!hasCatalogState)return p.message;
  const mark=(s?:CatalogProgressState,count?:number)=>{
    if(s==='done')return `✅${typeof count==='number'?count.toLocaleString('tr-TR'):''}`;
    if(s==='saving')return '💾';
    if(s==='error')return '❌';
    if(s==='skipped')return '⏭️';
    return '⏳';
  };
  return `Canlı ${mark(p.live,p.liveCount)} · Film ${mark(p.vod,p.vodCount)} · Dizi ${mark(p.series,p.seriesCount)}`;
}

export async function refreshPlaylistContent(pl: Playlist, onProgress?: (p: RefreshProgress) => void, options?: RefreshOptions): Promise<RefreshResult> {
  const requested=new Set<CatalogKind>(options?.kinds??['live','vod','series']);
  if(!requested.size)return{ok:false,message:'Güncellenecek katalog türü seçilmedi.'};
  const scoped=(patch:Partial<Playlist>):Partial<Playlist>=>{
    const next={...patch};
    if(!requested.has('live'))delete next.channels;
    if(!requested.has('vod'))delete next.vod;
    if(!requested.has('series'))delete next.series;
    return next;
  };
  const finishTask = markTask(`refresh:${pl.source}:${pl.name || pl.id}`, { playlistId: pl.id, source: pl.source });
  try {
    if (pl.source === "xtream") {
      if (!pl.xtreamServer || !pl.xtreamUsername || !pl.xtreamPassword) {
        return { ok: false, message: "Xtream bilgileri eksik." };
      }
      let resolvedServer = pl.xtreamServer;
      let bindingPatch = pl.serverCodeBinding;
      onProgress?.({ phase: "dns", message: "DNS kontrol ediliyor..." });

      /**
       * GPT v10.5.1 — SELF-HEALING DNS
       * Sunucu Kodu/Panel Rehberi üzerinden eklenen playlist, kullanıcı seçtiği
       * panel kimliğine kalıcı bağlıysa her yenilemede Firebase'deki o panelin
       * güncel hostlarını çözer. Aynı kullanıcı/şifre başka panelde çalışsa bile
       * oraya geçmez.
       */
      if (pl.serverCodeBinding?.autoResolve) {
        try {
          const bound = await resolveBoundPanel(
            pl.serverCodeBinding.codeSource,
            {
              sources:pl.serverCodeBinding.sources,
              code: pl.serverCodeBinding.code,
              panelName: pl.serverCodeBinding.panelName,
              preferredServer: pl.serverCodeBinding.preferredServer || pl.xtreamServer,
              validatedHosts: pl.serverCodeBinding.validatedHosts,
            },
            pl.xtreamUsername,
            pl.xtreamPassword,
          );
          resolvedServer = bound.server;
          bindingPatch = {
            ...pl.serverCodeBinding,
            preferredServer: bound.server,
            validatedHosts: Array.from(new Set([bound.server, ...bound.hosts])),
            lastResolvedServer: bound.server,
            lastResolvedAt: new Date().toISOString(),
          };
        } catch {
          // Rehber geçici erişilemezse mevcut çalışan DNS ile devam et.
        }
      }

      const cred = { server: resolvedServer, username: pl.xtreamUsername, password: pl.xtreamPassword };
      onProgress?.({ phase: "login", message: "Hesap doğrulanıyor..." });
      /**
       * v18.2.0 — YEDEK DNS İLE YENİLEME: birincil adres yanıt vermezse (veya
       * reddederse) panel DNS'leri + kullanıcının yedek DNS'leri sırayla denenir.
       * Çalışan adres bulunursa liste o adrese geçer (metadataPatch xtreamServer).
       */
      let login: Awaited<ReturnType<typeof xtreamLogin>>;
      try {
        login = await xtreamLogin(cred, options?.signal);
      } catch (primaryError) {
        const primaryNorm = normalizeHost(resolvedServer);
        const backups = Array.from(new Set([...(pl.backupHosts || []), ...(bindingPatch?.validatedHosts || [])].map(normalizeHost)))
          .filter(h => !!h && h !== primaryNorm);
        let recovered: typeof login | null = null;
        for (const host of backups) {
          if (options?.signal?.aborted) break;
          onProgress?.({ phase: "login", message: `Birincil adres yanıt vermedi; yedek DNS deneniyor: ${host}` });
          try {
            recovered = await xtreamLogin({ ...cred, server: host }, options?.signal);
            resolvedServer = host;
            cred.server = host;
            void recordDiagnostic("network", "REFRESH_BACKUP_DNS_OK", { playlistId: pl.id, tried: backups.indexOf(host) + 1, total: backups.length }, { stage: "refresh", outcome: "recovered" });
            break;
          } catch { /* sıradaki yedek */ }
        }
        if (!recovered) {
          if (backups.length) void recordDiagnostic("network", "REFRESH_BACKUP_DNS_FAILED", { playlistId: pl.id, total: backups.length }, { stage: "refresh", outcome: "failed" });
          throw primaryError;
        }
        login = recovered;
      }

      const baseCapability=():NonNullable<Playlist['catalogCapabilities']>=>({
        live:pl.catalogCapabilities?.live||'empty',
        vod:pl.catalogCapabilities?.vod||'empty',
        series:pl.catalogCapabilities?.series||'empty',
        updatedAt:new Date().toISOString(),
      });
      const metadataPatch=()=>({
        accountInfo: login.user_info as any,
        serverInfo: (login.server_info || null) as any,
        ...(resolvedServer !== pl.xtreamServer ? { xtreamServer: resolvedServer } : {}),
        ...(bindingPatch ? { serverCodeBinding: bindingPatch } : {}),
      });

      /**
       * v17.9.10 — EMPTY-SHELL MEMORY-SAFE RECOVERY
       * Otomatik recovery incrementalDelivery verirse kataloglar SIRALI alınır.
       * Her katalog parse edilir edilmez filtrelenir, Room'a teslim edilir ve JS
       * referansı bırakılır. Böylece live+vod+series dev dizileri aynı anda
       * Promise.allSettled içinde tutulmaz. Elle yenileme aşağıdaki eski/parallel
       * yolda kalır; davranış gerilemez.
       */
      if (options?.incrementalDelivery) {
        const state:RefreshProgress={
          phase:'content', message:'Kataloglar güvenli sırayla hazırlanıyor...',
          live:requested.has('live')?'waiting':'skipped',
          vod:requested.has('vod')?'waiting':'skipped',
          series:requested.has('series')?'waiting':'skipped',
        };
        const emit=()=>onProgress?.({...state});
        const failedKinds:CatalogKind[]=[];
        const unsupported=new Set<CatalogKind>();
        let deliveredTotal=0;
        emit();

        const fetchers:Record<CatalogKind,()=>Promise<any[]>>={
          live:()=>xtreamLiveStreams(cred, options?.signal),
          vod:()=>xtreamVod(cred, options?.signal),
          series:()=>xtreamSeries(cred, options?.signal),
        };
        const label:Record<CatalogKind,string>={live:'Canlı',vod:'Film',series:'Dizi'};
        const filterKind=(kind:CatalogKind,items:any[])=>{
          const selected=applyContentSelection({
            channels:kind==='live'?items:[],
            vod:kind==='vod'?items:[],
            series:kind==='series'?items:[],
          },options?.ignoreContentSelection?null:pl.contentSelection);
          return kind==='live'?selected.channels:kind==='vod'?selected.vod:selected.series;
        };
        for(const kind of ['live','vod','series'] as CatalogKind[]){
          if(!requested.has(kind))continue;
          const started=Date.now();
          try{
            (state as any)[kind]='waiting';
            state.message=`${label[kind]} kataloğu sunucudan alınıyor…`;
            emit();
            const raw=await fetchers[kind]();
            const filtered=filterKind(kind,raw);
            const elapsed=Date.now()-started;
            (state as any)[`${kind}Count`]=filtered.length;
            (state as any)[`${kind}ElapsedMs`]=elapsed;
            (state as any)[kind]='saving';
            state.message=`${label[kind]} kataloğu alındı; cihaza kaydediliyor...`;
            emit();
            await options.incrementalDelivery({kind,items:filtered,fetchElapsedMs:elapsed,rawCount:raw.length,filteredCount:filtered.length});
            deliveredTotal+=filtered.length;
            (state as any)[kind]='done';
            state.message=`${label[kind]} kataloğu hazır.`;
            emit();
          }catch(e:any){
            const text=String(e?.message||e||'');
            const is404=/HTTP\s+404\b/i.test(text);
            if(kind!=='live'&&is404){
              unsupported.add(kind);
              (state as any)[kind]='skipped';
              state.message=`${label[kind]} kataloğu sunucu tarafından desteklenmiyor (404).`;
              emit();
              continue;
            }
            failedKinds.push(kind);
            (state as any)[kind]='error';
            (state as any)[`${kind}ElapsedMs`]=Date.now()-started;
            state.message=`${label[kind]} kataloğu alınamadı: ${text}`;
            emit();
            // Canlı katalog yoksa playlist'i kullanıma açmak güvenli değil.
            if(kind==='live')return{ok:false,failedKinds,message:`Xtream canlı katalog alınamadı; mevcut playlist korunuyor. Canlı: ${text}`};
            if(!options.allowPartialRecovery)return{ok:false,failedKinds,message:`Xtream yenileme eksik kaldı; mevcut playlist korunuyor. ${label[kind]}: ${text}`};
          }
        }

        const capabilities:any=baseCapability();
        if(requested.has('live'))capabilities.live=failedKinds.includes('live')?'error':'supported';
        if(requested.has('vod'))capabilities.vod=unsupported.has('vod')?'unsupported_404':failedKinds.includes('vod')?'error':'supported';
        if(requested.has('series'))capabilities.series=unsupported.has('series')?'unsupported_404':failedKinds.includes('series')?'error':'supported';
        const partial=failedKinds.length>0;
        if(deliveredTotal<=0 && !unsupported.size){
          return{ok:false,partial,failedKinds,message:'Xtream katalogları alındı ancak kullanılabilir içerik bulunamadı.'};
        }
        onProgress?.({...state,phase:'save',message:partial?'Kullanılabilir kataloglar kaydedildi; eksik türler raporlandı.':'Tüm kataloglar kaydedildi; son doğrulama yapılıyor...'});
        return{
          ok:true, partial, failedKinds,
          patch:{...metadataPatch(),catalogCapabilities:capabilities},
          message:`${state.liveCount||0} kanal • ${state.vodCount||0} film • ${state.seriesCount||0} dizi hazır${partial?' • bazı kataloglar alınamadı':''}${resolvedServer !== pl.xtreamServer ? ' • DNS otomatik güncellendi' : ''}`,
        };
      }

      // Normal/elle yenileme: mevcut paralel davranış korunur.
      const state: RefreshProgress = {
        phase: "content", message: "İçerikler paralel yükleniyor...",
        live:requested.has("live")?"waiting":"skipped",vod:requested.has("vod")?"waiting":"skipped",series:requested.has("series")?"waiting":"skipped",
      };
      const emit = () => onProgress?.({ ...state });
      emit();
      const timed=async(kind:CatalogKind,fn:()=>Promise<any[]>)=>{
        const started=Date.now();
        try{
          const value=await fn();
          (state as any)[kind]="done"; (state as any)[`${kind}Count`]=value.length; (state as any)[`${kind}ElapsedMs`]=Date.now()-started; emit();
          return value;
        }catch(e){
          (state as any)[kind]="error"; (state as any)[`${kind}ElapsedMs`]=Date.now()-started; emit(); throw e;
        }
      };
      const livePromise=requested.has('live')?timed('live',()=>xtreamLiveStreams(cred, options?.signal)):Promise.resolve([]);
      const vodPromise=requested.has('vod')?timed('vod',()=>xtreamVod(cred, options?.signal)):Promise.resolve([]);
      const seriesPromise=requested.has('series')?timed('series',()=>xtreamSeries(cred, options?.signal)):Promise.resolve([]);
      const [chRes, vodRes, serRes] = await Promise.allSettled([livePromise, vodPromise, seriesPromise]);
      // v16.13.10 — CAPABILITY-AWARE PARTIAL COMMIT: login başarılıyken VOD/Series 404
      // çalışan Live kataloğunu ve Room generation'ı iptal etmez. Bu sözleşme
      // v17.9.10 otomatik recovery yolunda da korunur.
      const errText = (r: PromiseSettledResult<any>) => r.status === "rejected" ? String((r.reason as any)?.message || r.reason || "") : "";
      const isUnsupported404 = (r: PromiseSettledResult<any>) => r.status === "rejected" && /HTTP\s+404\b/i.test(errText(r));
      if (chRes.status === "rejected") return { ok: false, message: `Xtream canlı katalog alınamadı; mevcut playlist korunuyor. Canlı: ${errText(chRes)}` };
      if ((vodRes.status === "rejected" && !isUnsupported404(vodRes)) || (serRes.status === "rejected" && !isUnsupported404(serRes))) {
        const failed=[vodRes.status==="rejected"?`Film: ${errText(vodRes)}`:"",serRes.status==="rejected"?`Dizi: ${errText(serRes)}`:""].filter(Boolean).join(" · ");
        return { ok:false, message:`Xtream yenileme eksik kaldı; mevcut playlist korunuyor. ${failed}` };
      }
      const vodValue=vodRes.status==="fulfilled"?vodRes.value:[]; const seriesValue=serRes.status==="fulfilled"?serRes.value:[];
      const filtered = applyContentSelection({ channels: chRes.value, vod: vodValue, series: seriesValue }, options?.ignoreContentSelection ? null : pl.contentSelection);
      const channels = filtered.channels; const vod = filtered.vod; const series = filtered.series;
      onProgress?.({ phase: "save", message: `${isUnsupported404(vodRes)||isUnsupported404(serRes) ? "Desteklenen kataloglar doğrulandı" : "Üç katalog da doğrulandı"}; kayda hazırlanıyor...`, live: "done", vod: isUnsupported404(vodRes)?'skipped':"done", series: isUnsupported404(serRes)?'skipped':"done", liveCount: channels.length, vodCount: vod.length, seriesCount: series.length,liveElapsedMs:state.liveElapsedMs,vodElapsedMs:state.vodElapsedMs,seriesElapsedMs:state.seriesElapsedMs });
      return {
        ok: true,
        patch: {
          ...scoped({channels,vod,series}),
          ...metadataPatch(),
          catalogCapabilities:{...baseCapability(),
            ...(requested.has('live')?{live:'supported' as const}:{}),
            ...(requested.has('vod')?{vod:isUnsupported404(vodRes)?'unsupported_404' as const:'supported' as const}:{}),
            ...(requested.has('series')?{series:isUnsupported404(serRes)?'unsupported_404' as const:'supported' as const}:{})},
        },
        message: `${channels.length} kanal • ${vod.length} film • ${series.length} dizi güncellendi${isUnsupported404(vodRes) ? " • VOD desteklenmiyor (404)" : ""}${isUnsupported404(serRes) ? " • Dizi desteklenmiyor (404)" : ""}${resolvedServer !== pl.xtreamServer ? " • DNS otomatik güncellendi" : ""}`,
      };
    }

    if (pl.source === "m3u_url") {
      if (!pl.m3uUrl) return { ok: false, message: "M3U adresi yok." };
      onProgress?.({ phase: "content", message: "M3U içeriği indiriliyor...",
        live:requested.has('live')?'waiting':'skipped',vod:requested.has('vod')?'waiting':'skipped',series:requested.has('series')?'waiting':'skipped' });
      const validators=!options?.forceUnconditional&&pl.m3uValidators?.url===pl.m3uUrl&&!pl.cleanedKinds?.length?pl.m3uValidators:undefined;
      const response=await fetchAndParseM3UConditional(pl.m3uUrl,validators,options?.signal);
      if(response.notModified)return{ok:true,patch:{m3uValidators:{url:pl.m3uUrl,etag:response.etag,lastModified:response.lastModified}},message:'M3U değişmedi; mevcut katalog korundu.'};
      const res=response.parsed!;
      const total = res.channels.length + (res.vod?.length || 0) + (res.series?.length || 0);
      if (total === 0) return { ok: false, message: "Listede içerik bulunamadı." };
      const selected=applyContentSelection({channels:res.channels,vod:res.vod||[],series:res.series||[]},options?.ignoreContentSelection?null:pl.contentSelection);
      onProgress?.({phase:'save',message:'M3U katalogları doğrulandı; kayda hazırlanıyor...',
        live:requested.has('live')?'done':'skipped',vod:requested.has('vod')?'done':'skipped',series:requested.has('series')?'done':'skipped',
        liveCount:selected.channels.length,vodCount:selected.vod.length,seriesCount:selected.series.length});
      return {
        ok: true,
        patch:{...scoped(selected),m3uValidators:{url:pl.m3uUrl,etag:response.etag,lastModified:response.lastModified}},
        message: `${res.channels.length} kanal • ${res.vod?.length || 0} film • ${res.series?.length || 0} dizi güncellendi`,
      };
    }

    if (pl.source === "m3u_file") {
      return { ok: false, message: "Dosyadan eklenen listeler yenilenemez. Dosyayı tekrar ekleyin." };
    }

    if (pl.source === "stalker") {
      /**
       * STALKER / MAG YENİLEME — ARTIK CİHAZ İÇİ (v9.6.0)
       * Eskiden "yakında" deyip hiç yenilemiyordu. Protokol zaten
       * src/utils/stalker.ts içinde cihazda çalışıyor.
       */
      if (!pl.stalkerPortal || !pl.stalkerMac) {
        return { ok: false, message: "Portal/MAC bilgisi eksik." };
      }
      const { stalkerLogin, stalkerCatalog, stalkerCredsFromPlaylist } = await import("@/src/utils/stalker");
      const cred = stalkerCredsFromPlaylist(pl);
      onProgress?.({ phase: "login", message: "Portal doğrulanıyor..." });
      if(options?.signal?.aborted){const e:any=new Error('İşlem uygulama arka plana geçtiği için bekletildi.');e.kind='BACKGROUND_PAUSE';throw e;}
      const { session } = await stalkerLogin(cred, { signal: options?.signal });
      const magProgress:RefreshProgress={
        phase:'content',message:'MAG katalog hazırlığı başlatılıyor...',
        live:requested.has('live')?'waiting':'skipped',
        vod:requested.has('vod')?'waiting':'skipped',
        series:requested.has('series')?'waiting':'skipped',
      };
      onProgress?.({...magProgress});
      let catalog;
      const deliveredCounts:Partial<Record<CatalogKind,number>>={};
      const kindLabel:Record<CatalogKind,string>={live:'Canlı',vod:'Film',series:'Dizi'};
      const filterMagKind=(kind:CatalogKind,items:any[])=>{
        const selected=applyContentSelection({
          channels:kind==='live'?items:[],vod:kind==='vod'?items:[],series:kind==='series'?items:[],
        },options?.ignoreContentSelection?null:pl.contentSelection);
        return kind==='live'?selected.channels:kind==='vod'?selected.vod:selected.series;
      };
      try {
        catalog = await stalkerCatalog(cred, session, {
          forceFresh: true,
          kinds:[...requested],
          signal: options?.signal,
          // v17.10.0: boş-kabuk recovery'de MAG kind hazır olur olmaz Room'a
          // teslim edilir. Sonraki stage boyunca üç dev katalog birlikte tutulmaz.
          onKindReady: options?.incrementalDelivery ? async (kind,items,meta)=>{
            const filtered=filterMagKind(kind,items);
            deliveredCounts[kind]=filtered.length;
            (magProgress as any)[kind]='saving';
            (magProgress as any)[`${kind}Count`]=filtered.length;
            magProgress.message=`${kindLabel[kind]} kataloğu alındı; cihaza kaydediliyor...`;
            onProgress?.({...magProgress});
            await options.incrementalDelivery!({kind,items:filtered,fetchElapsedMs:meta.elapsedMs,rawCount:meta.rawCount,filteredCount:filtered.length});
            (magProgress as any)[kind]='done';
            magProgress.message=`${kindLabel[kind]} kataloğu hazır.`;
            onProgress?.({...magProgress});
          } : undefined,
          releaseDeliveredKinds: !!options?.incrementalDelivery,
          onProgress: (progress) => {
            magProgress.phase=progress.stage==='final'?'save':'content';
            magProgress.message=progress.message;
            if(progress.stage==='live'&&requested.has('live')){
              if((magProgress.live||'waiting')!=='saving' && magProgress.live!=='done') magProgress.live='waiting';
              if(!options?.incrementalDelivery && typeof progress.loaded==='number'&&typeof progress.total==='number'&&progress.loaded>=progress.total){
                magProgress.live='done'; magProgress.liveCount=progress.loaded;
              }
            }
            if(progress.stage==='vod'&&requested.has('vod')){
              if((magProgress.vod||'waiting')!=='saving' && magProgress.vod!=='done') magProgress.vod='waiting';
              if(!options?.incrementalDelivery && typeof progress.loaded==='number'&&typeof progress.total==='number'&&progress.loaded>=progress.total){
                magProgress.vod='done'; magProgress.vodCount=progress.loaded;
              }
            }
            if(progress.stage==='series'&&requested.has('series')){
              if((magProgress.series||'waiting')!=='saving' && magProgress.series!=='done') magProgress.series='waiting';
              if(!options?.incrementalDelivery && typeof progress.loaded==='number'&&typeof progress.total==='number'&&progress.loaded>=progress.total){
                magProgress.series='done'; magProgress.seriesCount=progress.loaded;
              }
            }
            onProgress?.({...magProgress});
          },
        });
      }
      catch (e: any) { return { ok: false, message: `MAG katalog yenileme başarısız: ${String(e?.message || e)}${session.profileError ? ` · Profil: ${session.profileError}` : ""}` }; }
      const d=catalog.diagnostics;
      if((requested.has('live')&&d.live==='ERROR')||(requested.has('vod')&&d.vod==='ERROR')||(requested.has('series')&&(d.seriesNative==='ERROR'||d.vod==='ERROR')))
        return{ok:false,message:'Seçili MAG kataloglarından biri alınamadı; mevcut katalog korunuyor.'};
      const liveCount=deliveredCounts.live ?? catalog.channels.length;
      const vodCount=deliveredCounts.vod ?? catalog.vod.length;
      const seriesCount=deliveredCounts.series ?? catalog.series.length;
      const liveCap: 'supported' | 'empty' | 'error' = d.live === 'ERROR' ? 'error' : (liveCount ? 'supported' : 'empty');
      const vodCap = d.vod === 'UNSUPPORTED' ? 'unsupported_404' : (d.vod === 'ERROR' ? 'error' : (vodCount ? 'supported' : 'empty'));
      const seriesCap = d.seriesNative === 'UNSUPPORTED' && d.seriesFromVod > 0 ? 'vod_fallback' : d.seriesNative === 'UNSUPPORTED' ? 'unsupported_404' : d.seriesNative === 'ERROR' ? 'error' : (seriesCount ? 'supported' : 'empty');
      const endpointShape = (() => { try { return new URL(session.endpoint).pathname || '/'; } catch { return ''; } })();
      const capabilityPatch: Partial<Playlist> = {
        ...(session.portalTimezone ? { stalkerPortalTimezone: session.portalTimezone } : {}),
        catalogCapabilities: { live:requested.has("live")?liveCap:(pl.catalogCapabilities?.live||"empty"),vod:requested.has("vod")?vodCap:(pl.catalogCapabilities?.vod||"empty"),series:requested.has("series")?seriesCap:(pl.catalogCapabilities?.series||"empty"), updatedAt: new Date().toISOString() },
        magCapabilities: {
          live: !requested.has('live') ? (pl.magCapabilities?.live || 'empty') : liveCap === 'supported' ? 'supported' : liveCap === 'empty' ? 'empty' : 'error',
          vod: !requested.has('vod') ? (pl.magCapabilities?.vod || 'empty') : d.vod === 'UNSUPPORTED' ? 'unsupported' : d.vod === 'ERROR' ? 'error' : vodCount ? 'supported' : 'empty',
          series: !requested.has('series') ? (pl.magCapabilities?.series || 'empty') : d.seriesNative === 'UNSUPPORTED' && d.seriesFromVod > 0 ? 'vod_fallback' : d.seriesNative === 'UNSUPPORTED' ? 'unsupported' : d.seriesNative === 'ERROR' ? 'error' : seriesCount ? 'supported' : 'empty',
          profile: session.profileError ? 'error' : session.profile ? 'supported' : 'empty',
          model: String((session.profile as any)?.stb_type || session.compatProfile || ''),
          transport: KizilkanNativeCore.available ? 'native_okhttp' : 'fetch',
          handshakeVariant: String(session.handshakeVariant || ''),
          endpointShape,
          discoveredAt: new Date().toISOString(),
        },
      };
      // v16.14.3 — portal/session gerçekten çalıştıysa capability sonucu katalog boş
      // olsa da kaybolmaz. İçerik dizilerini boş patch'lemiyoruz; mevcut çalışan katalog
      // korunur, yalnız discovery metadata'sı başarısız refresh sonucuyla birlikte persist edilir.
      if (liveCount + vodCount + seriesCount === 0) {
        return { ok: false, patch: capabilityPatch, message: `Portal bağlandı ama kataloglar boş.${session.profileError ? ` Profil: ${session.profileError}` : ""}` };
      }
      const selected = options?.incrementalDelivery
        ? {channels:[] as any[],vod:[] as any[],series:[] as any[]}
        : applyContentSelection({ channels: catalog.channels, vod: catalog.vod, series: catalog.series }, options?.ignoreContentSelection ? null : pl.contentSelection);
      onProgress?.({phase:'save',message:'MAG katalogları doğrulandı; kayda hazırlanıyor...',
        live:requested.has('live')?(d.live==='ERROR'?'error':'done'):'skipped',
        vod:requested.has('vod')?(d.vod==='UNSUPPORTED'?'skipped':d.vod==='ERROR'?'error':'done'):'skipped',
        series:requested.has('series')?(d.seriesNative==='UNSUPPORTED'&&d.seriesFromVod===0?'skipped':d.seriesNative==='ERROR'?'error':'done'):'skipped',
        liveCount,vodCount,seriesCount});
      return {
        ok: true,
        patch: options?.incrementalDelivery ? capabilityPatch : { ...scoped(selected as any), ...capabilityPatch },
        message: `${liveCount} kanal • ${vodCount} film • ${seriesCount} dizi güncellendi`,
      };
    }

    return { ok: false, message: "Bu liste türü yenilenemiyor." };
  } catch (e: any) {
    const message = e?.message || "Yenileme başarısız.";
    onProgress?.({ phase: "error", message });
    return { ok: false, message };
  } finally {
    finishTask();
  }
}
