import {withCatalogLock,freshnessDue} from "@/src/utils/catalogOperations";
import {refreshPlaylistContent,type CatalogKind,type RefreshProgress,type IncrementalCatalogDelivery} from "@/src/utils/refreshPlaylist";
/**
 * KIZILKAN PLAYER — Oynatma Listesi Deposu (Context)
 * Dosya   : frontend/src/store/PlaylistContext.tsx
 * Sürüm   : v2.0.0  (önceki: v1.x)
 * Faz     : FAZ A.4 / Bölüm 0 — Liste Kalıcılığı
 *
 * ===========================================================================
 * BU SÜRÜMDE NE DEĞİŞTİ (neden liste artık kaybolmayacak)
 * ===========================================================================
 * ESKİ DAVRANIŞ (kırık):
 *   - Tüm listeler (channels + vod + series dahil) TEK bir AsyncStorage
 *     anahtarına yazılıyordu: storage.setItem(KEY, JSON.stringify(all)).
 *   - storage.setItem İÇERİDE bir kez daha JSON.stringify yapıyordu -> ÇİFT
 *     KODLAMA -> ~2x boyut.
 *   - Android AsyncStorage'ın satır başına ~2MB limiti aşılınca yazma SESSİZCE
 *     başarısız oluyordu (false dönüyordu ama kontrol edilmiyordu).
 *   - Sonuç: uygulama kapanıp açılınca liste boş -> her açılışta onboarding.
 *
 * YENİ DAVRANIŞ (bu dosya):
 *   - HAFİF metadata (ad, kaynak, kimlik bilgileri, accountInfo, sayaçlar)
 *     AsyncStorage'da 'kizilkan.playlists.meta' altında tutulur. Küçük ve güvenli.
 *   - AĞIR diziler (channels/vod/series) her liste için AYRI DOSYAYA yazılır:
 *     bigStore.write(id, { channels, vod, series }). Dosya sisteminin boyut
 *     limiti yoktur -> 150.000+ kanal bile kaydedilir.
 *   - Yazma başarısı KONTROL EDİLİR; başarısızsa hata fırlatılır, sessiz kayıp biter.
 *   - Migration: eski 'kizilkan.playlists' anahtarı varsa, ilk açılışta otomatik
 *     olarak yeni yapıya taşınır ve eski anahtar temizlenir. Mevcut kullanıcı
 *     verisini KAYBETMEZ.
 *
 * ===========================================================================
 * DIŞ ARAYÜZ KORUNDU
 * ===========================================================================
 * usePlaylists() döndürdüğü her şey ve fonksiyon imzaları BİREBİR aynı.
 * activePlaylist.channels / .vod / .series hâlâ BELLEKTE mevcut (aktif liste
 * için). Böylece player.tsx, stats.tsx, hidden-manager.tsx, epg-timeline.tsx,
 * detail.tsx gibi 10+ ekranın HİÇBİRİ değişmeden çalışmaya devam eder.
 *
 * MİMARİ: playlists[] içindeki nesneler metadata + (yalnızca yüklenmiş olanlar
 * için) ağır diziler taşır. Uygulama açılışında SADECE metadata okunur (hızlı);
 * ağır diziler AKTİF liste için tembel (lazy) yüklenir.
 * ===========================================================================
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { storage } from '@/src/utils/storage';
import { bigStore } from '@/src/utils/storage/bigStore';
import { Playlist } from '@/src/types';
import { useProfiles } from './ProfileContext';
import { scheduleAdultFlags } from '@/src/utils/adult';
import { KizilkanNativeCore, type NativePlaylistSummary } from '@/modules/kizilkan-native-core';
import { beginFlightRecorderTrace, markTask, recordDiagnostic, recordFlightRecorderStage } from '@/src/utils/diagnostics';

/**
 * v5.7.0 — LİSTELER ARTIK PROFİLE ÖZEL
 * ESKİ: tüm profiller aynı listeyi paylaşıyordu; yeni profil açınca öncekinin
 *       kanalları görünüyordu. Kullanıcının isteği: her profilin linkleri ve
 *       içerikleri KENDİNE ÖZEL olsun.
 * YENİ: depolama anahtarları profil kimliğini içeriyor.
 * Mevcut veriler kaybolmasın diye ilk açılışta eski (ortak) veri, o anki
 * profile TAŞINIYOR.
 */
const metaKey = (pid: string) => `kizilkan.playlists.meta.${pid}`;
const activeKey = (pid: string) => `kizilkan.activePlaylistId.${pid}`;

const GLOBAL_META_KEY = 'kizilkan.playlists.meta';   // v5.6 ve öncesi (ortak)
const LEGACY_KEY = 'kizilkan.playlists';             // en eski (tek blob)
const GLOBAL_ACTIVE_KEY = 'kizilkan.activePlaylistId';
/** Ortak listelerin hangi profile taşındığını işaretler (bir kez). */
const MIGRATED_KEY = 'kizilkan.playlists.migratedTo';
const FAV_KEY_PREFIX = 'kizilkan.favorites.';
const REC_KEY_PREFIX = 'kizilkan.recent.';

/** Ağır dizileri ayıklayıp yalnızca metadata bırakır (AsyncStorage'a yazmak için). */
type PlaylistMeta = Omit<Playlist, 'channels' | 'vod' | 'series'> & {
  channelsCount?: number;
  vodCount?: number;
  seriesCount?: number;
};

function toMeta(p: Playlist): PlaylistMeta {
  const { channels, vod, series, ...rest } = p;
  return {
    ...rest,
    channelsCount: p.channelsCount ?? channels?.length ?? 0,
    vodCount: p.vodCount ?? vod?.length ?? 0,
    seriesCount: p.seriesCount ?? series?.length ?? 0,
  };
}

/** Metadata + (varsa) ağır diziyi birleştirip tam Playlist'e döndürür. */
function fromMeta(meta: PlaylistMeta, heavy?: { channels?: any[]; vod?: any[]; series?: any[] }): Playlist {
  const { channelsCount, vodCount, seriesCount, ...rest } = meta as any;
  return {
    ...(rest as Omit<Playlist, 'channels' | 'vod' | 'series'>),
    channels: heavy?.channels || [],
    vod: heavy?.vod || [],
    series: heavy?.series || [],
    channelsCount: channelsCount ?? heavy?.channels?.length ?? 0,
    vodCount: vodCount ?? heavy?.vod?.length ?? 0,
    seriesCount: seriesCount ?? heavy?.series?.length ?? 0,
  };
}

export type PlaylistRepairProgress = {
  playlistId: string;
  playlistName: string;
  source: string;
  mode: "primary" | "fallback";
  phase: "verify" | "dns" | "login" | "content" | "save" | "roomVerify" | "paused" | "ready" | "error";
  message: string;
  progress: RefreshProgress | null;
  startedAt: number;
  lastProgressAt: number;
  /** v17.10.0: background süresi aktif bekleme süresine katılmaz. */
  pausedAt?: number | null;
  pausedTotalMs?: number;
  partial?: boolean;
};

interface PlaylistContextValue {
  playlists: Playlist[];
  activePlaylist: Playlist | null;
  favorites: string[];
  recent: string[];
  isLoading: boolean;
  /** Hangi profilin playlist metadata'sı gerçekten yüklenmiş durumda. */
  loadedProfileId: string | null;
  nativeSummary: NativePlaylistSummary | null;
  ensureHeavyLoaded: (id?: string) => Promise<Playlist | null>;
  addPlaylist: (p: Playlist) => Promise<void>;
  addPreparedPlaylist: (p: Playlist) => Promise<void>;
  enrichPlaylistMedia: (id: string, patch: { vod?: Playlist["vod"]; series?: Playlist["series"] }) => Promise<void>;
  removePlaylist: (id: string) => Promise<void>;
  cleanupPlaylistContent:(id:string,kinds:Array<CatalogKind|'epg'>)=>Promise<number>;
  refreshPlaylistKinds:(id:string,kinds:Array<CatalogKind|'epg'>,progress?:(p:RefreshProgress)=>void,valid?:()=>boolean)=>Promise<void>;
  freshnessStatus:{playlistId:string;message:string}|null;
  updatePlaylist: (id: string, patch: Partial<Playlist>) => Promise<void>;
  setActivePlaylist: (id: string) => Promise<void>;
  toggleFavorite: (channelId: string) => Promise<void>;
  isFavorite: (channelId: string) => boolean;
  addToRecent: (channelId: string) => Promise<void>;
  clearRecent: () => Promise<void>;
  /* ---- v16.4.0 ---- */
  /** Ağır veri/onarım sürüyor mu? */
  heavyLoading: boolean;
  /** v17.9.10: boş-kabuk onarımının kullanıcıya gösterilecek gerçek aşaması. */
  repairProgress: PlaylistRepairProgress | null;
  /** v17.4.1: son yenilemede ne eklendi/silindi (null = gösterilecek özet yok). */
  lastRefreshSummary: {playlistId:string;playlistName:string;text:string;suspicious:boolean;at:number}|null;
  clearRefreshSummary: () => void;
  /** İçeriği olmayan ve onarılamayan liste kimliği (null = sorun yok). */
  repairFailedId: string | null;
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile } = useProfiles();

  /**
   * BAYAT KAPANIŞ KORUMASI (v6.2.0) — KRİTİK
   * persistMeta/addPlaylist gibi useCallback'ler activeProfile'ı kullanıyor
   * ama bağımlılık dizisi boştu. Sonuç: HER ZAMAN ilk render'daki değeri
   * (yani 'default') görüyorlardı -> liste yanlış anahtara yazılıyor,
   * uygulama yeniden açılınca "liste yok" görünüyordu.
   * Ref her render'da güncellenir; kapanışlar bunu okur.
   */
  const activeProfileIdRef = useRef<string>('default');
  activeProfileIdRef.current = activeProfile?.id || 'default';

  /** Kayıt/okuma için HER ZAMAN güncel profil kimliği. */
  const currentPid = () => activeProfileIdRef.current;
  const profileId = activeProfile?.id || 'default';

  // playlists: metadata + (aktif liste için) ağır diziler bellekte
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  // GPT v11.5.1: ardışık/toplu eklemelerde React closure eski listeyi görmesin.
  const playlistsRef = useRef<Playlist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef=useRef(activeId);activeIdRef.current=activeId;
  const [freshnessStatus,setFreshnessStatus]=useState<{playlistId:string;message:string}|null>(null);
  const freshnessAttempts=useRef(new Map<string,number>());
  useEffect(() => { playlistsRef.current = playlists; }, [playlists]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nativeSummary, setNativeSummary] = useState<NativePlaylistSummary | null>(null);
  /**
   * v16.4.0 — LİSTE ONARIM DURUMU
   * heavyLoading   : içerik indirilirken arayüz "yükleniyor" gösterir.
   * repairFailedId : içeriği olmayan ve ONARILAMAYAN listenin kimliği. Arayüz
   *                  bunu kullanıp kullanıcıya net mesaj/rozet gösterir —
   *                  eskiden seçim sessizce başarısız oluyordu.
   */
  const [heavyLoading, setHeavyLoading] = useState(false);
  const [repairProgress, setRepairProgress] = useState<PlaylistRepairProgress | null>(null);
  const [repairFailedId, setRepairFailedId] = useState<string | null>(null);
  type RepairLifecycleRuntime = {
    playlistId: string; controller: AbortController | null; pausedAt: number | null; pausedTotalMs: number;
    wake: (() => void) | null; onPause: (() => void) | null; traceId: string;
  };
  const appStateRef = useRef(String(AppState.currentState || 'active'));
  const repairLifecycleRef = useRef<RepairLifecycleRuntime | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      const prev = appStateRef.current;
      appStateRef.current = String(nextState || 'active');
      const rt = repairLifecycleRef.current;
      if (!rt) return;
      const nextActive = nextState === 'active';
      const wasActive = prev === 'active';
      if (wasActive && !nextActive) {
        if (!rt.pausedAt) rt.pausedAt = Date.now();
        try { rt.controller?.abort(); } catch {}
        try { rt.onPause?.(); } catch {}
        void recordDiagnostic('catalog','PLAYLIST_REPAIR_BACKGROUND_PAUSE',{playlistId:rt.playlistId,backgroundAt:rt.pausedAt},{traceId:rt.traceId,stage:'catalogRecovery',outcome:'paused'});
      } else if (!wasActive && nextActive && rt.pausedAt) {
        const foregroundAt = Date.now();
        const pausedMs = Math.max(0, foregroundAt - rt.pausedAt);
        rt.pausedTotalMs += pausedMs;
        rt.pausedAt = null;
        const wake = rt.wake; rt.wake = null;
        try { wake?.(); } catch {}
        void recordDiagnostic('catalog','PLAYLIST_REPAIR_FOREGROUND_RESUME',{playlistId:rt.playlistId,foregroundAt,pausedMs,pausedTotalMs:rt.pausedTotalMs},{traceId:rt.traceId,stage:'catalogRecovery',outcome:'resumed'});
      }
    });
    return () => { try { sub.remove(); } catch {} };
  }, []);
  /**
   * v17.9.10: eski 30 sn ceza kaldırıldı. Same-target singleflight aktif işi
   * zaten birleştiriyor; bu kısa pencere yalnız başarısız iş biter bitmez oluşan
   * dokunma/yeniden-render fırtınasını söndürür.
   */
  /**
   * v17.4.1 — SON YENİLEME ÖZETİ.
   * Ekranlar bunu okuyup kullanıcıya "neler eklendi/silindi" gösterir.
   * Telefon ve TV aynı metni kullanır.
   */
  const [lastRefreshSummary, setLastRefreshSummary] = useState<{playlistId:string;playlistName:string;text:string;suspicious:boolean;at:number}|null>(null);
  // v11.5.0: Bellekteki playlist state'inin hangi profile ait olduğunu işaretler.
  // activeProfile değiştiği anda effect henüz başlamamış olsa bile tüketiciler
  // eski profil listesini "hazır" sanmasın.
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  // GPT ELITE v12.0.0: profil değişimleri üst üste gelirse eski async yükleme
  // yeni profil state'ini ezmesin. Her yükleme kendi generation kimliğini taşır.
  const profileLoadGeneration = useRef(0);
  const auxLoadGeneration = useRef(0);
  // v15.2.19: aktif playlist geçişleri üst üste gelirse eski summary/disk yazımı
  // yeni seçimi ezmesin.
  const activeSwitchGeneration = useRef(0);
  const activeSwitchWriteQueue = useRef<Promise<void>>(Promise.resolve());
  // v17.9.10: yalnız başarısız/ardışık repair fırtınasını 2.5 sn bastırır; aktif aynı hedef zaten singleflight ile join olur.
  const repairAttemptAt = useRef<Map<string, number>>(new Map());
  // v16.14.2 P0: GERÇEK same-target single-flight. İkinci çağrı erken resolve olmaz;
  // ilk geçişin AYNI Promise'ine join olur. Böylece `await setActivePlaylist(id)`
  // gerçekten Room verify + activeKey publish tamamlanana kadar bekler.
  const activeSwitchInFlight = useRef<Map<string, Promise<void>>>(new Map());

  // Hangi liste id'lerinin ağır verisi belleğe yüklendi (tekrar okumayı önler)
  const loadedHeavy = useRef<Set<string>>(new Set());
  // v16.14.2: startup active key doğrudan publish edilmez. Native/Room doğrulama
  // ve gerekiyorsa kontrollü repair setActivePlaylist'in tek kapısından geçer.
  const activatePlaylistRef = useRef<(id: string) => Promise<void>>(async () => {});

  // --- Açılış: metadata oku (+ gerekirse eski veriyi migrate et) -----------
  useEffect(() => {
    const generation = ++profileLoadGeneration.current;
    activeSwitchGeneration.current += 1;
    const requestedPid = activeProfile?.id || 'default';
    (async () => {
      try {
        // PROFİL DEĞİŞİMİ: önceki profilin listesi ekranda kalmasın.
        setIsLoading(true);
        setLoadedProfileId(null);
        setPlaylists([]);
        setActiveId(null);
        setHeavyLoading(false);
        setRepairProgress(null);
        setRepairFailedId(null);
        /**
         * KRİTİK (v6.3.0): "yüklendi" işaretlerini de temizle.
         * ESKİ HATA: loadedHeavy seti profil değişiminde temizlenmiyordu.
         * A -> B -> A geçişinde, A'nın listesi "zaten yüklü" sanılıp kanalları
         * BİR DAHA OKUNMUYORDU. Sonuç: liste görünür ama İÇİ BOŞ.
         */
        loadedHeavy.current.clear();

        // 1) Eski tek-anahtar formatı var mı? Varsa migrate et.
        const legacyRaw = await storage.getItem<string>(LEGACY_KEY, '');
        if (legacyRaw) {
          try {
            const legacyList: Playlist[] = JSON.parse(legacyRaw);
            if (Array.isArray(legacyList) && legacyList.length > 0) {
              // Her listenin ağır verisini dosyaya yaz, metadata'yı topla.
              const metas: PlaylistMeta[] = [];
              for (const p of legacyList) {
                await bigStore.write(p.id, {
                  channels: p.channels || [],
                  vod: p.vod || [],
                  series: p.series || [],
                });
                metas.push(toMeta(p));
              }
              // En eski (tek blob) veriyi ORTAK anahtara yaz; aşağıdaki taşıma
              // adımı bunu aktif profile aktaracak.
              await storage.setItem(GLOBAL_META_KEY, JSON.stringify(metas));
            }
          } catch (e) {
            console.warn('[Playlist] legacy migrate parse hatası', e);
          }
          // Eski anahtarı temizle (bir daha migrate etmesin).
          await storage.removeItem(LEGACY_KEY);
        }

        // 2) PROFİLE ÖZEL metadata'yı oku.
        // v6.0.0: Henüz gerçek profil yoksa (ilk kurulum, welcome sürüyor)
        // taşıma yapma; yanlışlıkla 'default' altına yazmasın.
        const pid = requestedPid;
        const realProfile = !!activeProfile?.id && activeProfile.id !== 'default';
        let metaRaw = await storage.getItem<string>(metaKey(pid), '');
        let aid = await storage.getItem<string>(activeKey(pid), '');

        // TAŞIMA: bu profilde veri yoksa ve ORTAK (eski) veri varsa, mevcut
        // listeler bu profile aktarılır. Böylece güncelleme sonrası kimse
        // listesini kaybetmez. Taşıma yalnızca BİR KEZ olur.
        // TAŞIMA YALNIZCA BİR KEZ, TEK PROFİLE (v5.9.0 düzeltmesi)
        // ESKİ HATA: ortak anahtar silinmediği için HER YENİ PROFİL aynı
        // listeyi devralıyordu -> "listeler profillerle karışıyor".
        // YENİ: taşıma bir bayrakla işaretleniyor; sadece ilk profil devralır,
        // sonraki profiller BOŞ başlar (kullanıcının istediği davranış).
        if (!metaRaw && realProfile) {
          const migratedTo = await storage.getItem<string>(MIGRATED_KEY, '');
          if (!migratedTo) {
            const globalMeta = await storage.getItem<string>(GLOBAL_META_KEY, '');
            if (globalMeta) {
              await storage.setItem(metaKey(pid), globalMeta);
              const globalActive = await storage.getItem<string>(GLOBAL_ACTIVE_KEY, '');
              if (globalActive) await storage.setItem(activeKey(pid), globalActive);
              metaRaw = globalMeta;
              aid = globalActive || '';
              // Bayrağı koy: başka hiçbir profil bu listeyi devralmasın.
              await storage.setItem(MIGRATED_KEY, pid);
              // Ortak anahtarları temizle (bir daha kullanılmayacak).
              await storage.removeItem(GLOBAL_META_KEY);
              await storage.removeItem(GLOBAL_ACTIVE_KEY);
            }
          }
        }

        let metas: PlaylistMeta[] = [];
        try { if (metaRaw) metas = JSON.parse(metaRaw); } catch {}

        const initial: Playlist[] = (metas || []).map(m => fromMeta(m));
        if (profileLoadGeneration.current !== generation || currentPid() !== requestedPid) return;
        playlistsRef.current = initial;
        setPlaylists(initial);

        /**
         * v17.9.5 — YETİM LİSTE TEŞHİSİ (salt okuma, hiçbir şey silmez/değiştirmez)
         * -------------------------------------------------------------------
         * SORUN (kullanıcı 22.09): Room'da 58 snapshot + ~1.9M medya satırı
         * varken arayüz 0-1 liste görüyordu. Meta ile Room arasındaki bağ
         * kopmuş. Kurtarma yazmadan ÖNCE kök nedeni ölçüyoruz: kaç snapshot
         * meta'da var, kaçı yetim, taşıma bayrağı ne durumda.
         * Bu sonuçla v17.9.6'da GÜVENLİ, kullanıcı onaylı kurtarma yazılacak.
         */
        void (async () => {
          try {
            if (!KizilkanNativeCore.available) return;
            const inv = await KizilkanNativeCore.getSnapshotInventory();
            const metaIds = new Set((metas || []).map((m: any) => String(m.id)));
            const orphans = inv.filter(sn => !metaIds.has(String(sn.playlistId)));
            const migratedFlag = await storage.getItem<string>(MIGRATED_KEY, '');
            const globalMetaLeft = await storage.getItem<string>(GLOBAL_META_KEY, '');
            void recordDiagnostic('database', 'ORPHAN_SNAPSHOT_AUDIT', {
              profileId: requestedPid,
              metaPlaylists: metaIds.size,
              roomSnapshots: inv.length,
              orphanSnapshots: orphans.length,
              orphanSample: orphans.slice(0, 12).map(o => ({
                id: String(o.playlistId).slice(0, 40),
                total: o.total, live: o.channels, vod: o.vod, series: o.series,
                importedAt: o.importedAt,
              })),
              migratedFlag: migratedFlag ? migratedFlag.slice(0, 40) : '(yok)',
              globalMetaLeft: !!globalMetaLeft,
            });
          } catch (e: any) {
            void recordDiagnostic('database', 'ORPHAN_SNAPSHOT_AUDIT_ERROR', { error: String(e?.message || e) });
          }
        })();
        if (KizilkanNativeCore.available && aid) {
          // Room canonical activation: persisted key yalnız adaydır; aktif state ancak
          // setActivePlaylist verify/repair tamamlanınca yayınlanır. Timer React render
          // tamamlandıktan sonra ref'teki güncel fonksiyona girer.
          setActiveId(null);
          void recordDiagnostic('catalog', 'STARTUP_ROOM_ACTIVATION_DEFERRED', { playlistId: aid, profileId: requestedPid });
          setTimeout(() => {
            if (profileLoadGeneration.current === generation && currentPid() === requestedPid) {
              activatePlaylistRef.current(aid).catch((e:any) => {
                void recordDiagnostic('catalog', 'STARTUP_ROOM_ACTIVATION_FAILED', { playlistId: aid, error: String(e?.message || e) });
              });
            }
          }, 0);
        } else {
          setActiveId(aid || null);
        }
      } catch (e) {
        console.warn('[Playlist] açılış yükleme hatası', e);
      } finally {
        // currentPid() ref'i her render güncel profile bakar. Eğer effect çalışırken
        // profil tekrar değiştiyse eski yüklemeyi hazır ilan etme.
        const nowPid = currentPid();
        if (profileLoadGeneration.current === generation && nowPid === requestedPid) {
          setLoadedProfileId(requestedPid);
          setIsLoading(false);
        }
      }
    })();
    // PROFİL DEĞİŞİNCE YENİDEN YÜKLE (v5.7.0)
    // Listeler artık profile özel olduğu için, profil değiştiğinde o profilin
    // kendi listeleri okunmalı. Bağımlılık boş olduğu için eskiden önceki
    // profilin listesi ekranda kalıyordu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile?.id]);

  // --- Aktif liste: v15.2 Native Core warm-up -------------------------------
  const ensureHeavyLoadedRef = useRef<(id?: string) => Promise<Playlist | null>>(async () => null);

  useEffect(() => {
    if (!activeId) { setNativeSummary(null); return; }
    let cancelled = false;
    (async () => {
      if (KizilkanNativeCore.available) {
        try {
          const summary = await KizilkanNativeCore.warmPlaylist(activeId);
          if (!cancelled) setNativeSummary(summary);
          return;
        } catch (e) {
          /**
           * v16.5.0: Bu düşüş SESSİZDİ (yalnız console.warn). Kullanıcı
           * "liste seçtim ama kanallar gelmiyor / çok yavaş geliyor" dediğinde
           * kayıtta hiçbir iz olmuyordu. Artık kaydediliyor ve süresi ölçülüyor.
           */
          void recordDiagnostic('catalog', 'PLAYLIST_WARM_FALLBACK', {
            playlistId: activeId, error: String((e as any)?.message || e),
          });
          console.warn('[Playlist] Native Core warm-up başarısız; native modda legacy JS hydrate otomatik çalıştırılmayacak', e);
          setRepairFailedId(activeId);
          void recordDiagnostic('catalog', 'PLAYLIST_STARTUP_REPAIR_REQUIRED', { playlistId: activeId, policy: 'room-canonical-no-auto-heavy-hydrate' });
          return;
        }
      }
      // Web/legacy platform: Room yoktur, eski hydrate davranışı korunur.
      await ensureHeavyLoadedRef.current(activeId);
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  const ensureHeavyLoaded = useCallback(async (requestedId?: string): Promise<Playlist | null> => {
    const id = requestedId || activeId;
    if (!id) return null;
    const already = playlistsRef.current.find(p => p.id === id);
    if (already && loadedHeavy.current.has(id)) return already;
    const started = Date.now();
    const heavy = await bigStore.read(id, { channels: [], vod: [], series: [] });
    loadedHeavy.current.add(id);
    let hydrated: Playlist | null = null;
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id !== id) return p;
        hydrated = {
          ...p,
          channels: heavy.channels || [], vod: heavy.vod || [], series: heavy.series || [],
          channelsCount: heavy.channels?.length || p.channelsCount || 0,
          vodCount: heavy.vod?.length || p.vodCount || 0,
          seriesCount: heavy.series?.length || p.seriesCount || 0,
        };
        return hydrated;
      });
      playlistsRef.current = next;
      return next;
    });
    scheduleAdultFlags(heavy.channels, heavy.vod, heavy.series);
    const nativeT = KizilkanNativeCore.available ? KizilkanNativeCore.getTelemetry(id) : {};
    const jsElapsedMs = Date.now() - started;
    console.info('[KIZILKAN PERF] playlist hydrate', { id, jsElapsedMs, native: nativeT });
    void recordDiagnostic('catalog', jsElapsedMs >= 1000 ? 'LEGACY_JS_HYDRATE_STALL_RISK' : 'LEGACY_JS_HYDRATE_DONE', {
      playlistId: id, jsElapsedMs, nativeCore: KizilkanNativeCore.available, channels: heavy.channels?.length || 0, vod: heavy.vod?.length || 0, series: heavy.series?.length || 0,
    }, { stage: 'legacyHydrate', durationMs: jsElapsedMs, outcome: 'success' });
    return hydrated || playlistsRef.current.find(p => p.id === id) || null;
  }, [activeId]);
  ensureHeavyLoadedRef.current = ensureHeavyLoaded;

  // --- Favoriler + son izlenenler (profile göre) ----------------------------
  useEffect(() => {
    const generation = ++auxLoadGeneration.current;
    const requestedPid = profileId;
    setFavorites([]);
    setRecent([]);
    (async () => {
      const favKey = FAV_KEY_PREFIX + requestedPid;
      const recKey = REC_KEY_PREFIX + requestedPid;
      const [fav, rec] = await Promise.all([
        storage.getItem<string>(favKey, ''),
        storage.getItem<string>(recKey, ''),
      ]);
      if (auxLoadGeneration.current !== generation || currentPid() !== requestedPid) return;
      let favList: string[] = [];
      let recList: string[] = [];
      try { if (fav) favList = JSON.parse(fav); } catch {}
      try { if (rec) recList = JSON.parse(rec); } catch {}
      setFavorites(favList);
      setRecent(recList);
    })();
  }, [profileId]);

  /** Metadata'yı AsyncStorage'a yazar (hafif, limitsiz güvenli). */
  /**
   * v17.3.2 — LİSTE SİLİNME KORUMASI + COMMIT YARIŞ KİLİDİ
   * ==========================================================================
   * SORUN (kullanıcı bildirimi, devir belgesi P0): "bir liste eklenirken diğer
   * listeler siliniyor."
   *
   * KÖK NEDEN: persistMeta çağıranlar (addPlaylist/updatePlaylist/remove...)
   * önce `playlistsRef.current`'ı okuyup TÜM listeyi yeniden yazıyor. Bu ref
   * bayatsa veya henüz dolmamışsa (profil geçişi, ilk yükleme bitmeden ekleme,
   * iki eklemenin çakışması) yazılan dizi eksik oluyor ve diskteki diğer
   * listeler SESSİZCE kayboluyor. Meta tek dosya olduğu için kayıp kalıcı.
   *
   * İKİ KATMANLI ÇÖZÜM:
   *  1) SİLME KORUMASI: yazmadan hemen önce diskteki meta okunur. Diskte olup
   *     yazılacak dizide OLMAYAN bir liste varsa, bu ancak kullanıcı gerçekten
   *     silmişse meşrudur. Meşru silmeler `allowRemoval` ile açıkça bildirilir;
   *     bildirilmeyen kayıplar geri eklenir ve olay kaydedilir. Yani "kaza
   *     eseri silme" fiilen imkânsız hale gelir.
   *  2) YARIŞ KİLİDİ: tüm meta yazmaları tek sıraya alınır (commitQueue).
   *     Eşzamanlı ekleme/güncelleme artık birbirinin üzerine yazamaz.
   *
   * NOT: Bu koruma veri KAYBINI engeller; kullanıcının bilerek yaptığı silme
   * işlemleri allowRemoval ile normal şekilde çalışmaya devam eder.
   */
  const commitQueue = useRef<Promise<unknown>>(Promise.resolve());
  /** v17.9.1: son native senkronun öğe düzeyindeki farkı (liste kimliğine göre). */
  const lastNativeDiffRef = useRef<Map<string, any>>(new Map());

  /** Tüm meta yazmalarını sıraya alır; eşzamanlı çağrılar birbirini ezmez. */
  const runExclusive = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = commitQueue.current.then(task, task);
    // Zincirin hata yüzünden kopmasını engelle (sonraki işler yine çalışsın).
    commitQueue.current = next.then(() => undefined, () => undefined);
    return next;
  }, []);

  const persistMeta = useCallback(async (list: Playlist[], opts?: { allowRemoval?: string[] }) => {
    const pid = currentPid();
    const key = metaKey(pid);
    let metas = list.map(toMeta);

    // --- SİLME KORUMASI ---
    try {
      const rawExisting = await storage.getItem<string>(key, '');
      if (rawExisting) {
        const existing: PlaylistMeta[] = JSON.parse(rawExisting) || [];
        if (Array.isArray(existing) && existing.length > 0) {
          const nextIds = new Set(metas.map(m => m.id));
          const allowed = new Set(opts?.allowRemoval || []);
          const vanished = existing.filter(m => m && m.id && !nextIds.has(m.id) && !allowed.has(m.id));
          if (vanished.length > 0) {
            // Bu listeler silinmek İSTENMEDİ; yazma onları kaybediyordu.
            void recordDiagnostic('database', 'PLAYLIST_DELETION_BLOCKED', {
              // NOT: anahtar adı bilerek "profileId" DEĞİL — checkdeps.js bu
              // tanımlayıcıyı kapanış değişkeni sanıp yanlış uyarı veriyor.
              pid,
              blocked: vanished.length,
              blockedIds: vanished.map(m => m.id).slice(0, 10),
              incoming: metas.length,
              existing: existing.length,
            });
            metas = [...metas, ...vanished];
          }
        }
      }
    } catch (e: any) {
      // Koruma okuması başarısızsa yazmayı engelleme; yalnız kaydet.
      void recordDiagnostic('database', 'PLAYLIST_DELETION_GUARD_ERROR', { error: String(e?.message || e) });
    }

    const ok = await storage.setItem(key, JSON.stringify(metas));
    if (!ok) {
      throw new Error('Liste bilgisi kaydedilemedi (meta yazma hatası).');
    }
    /**
     * v17.9.6 — İlk liste eklendi işareti. playlist-select ekranı bunu okuyup
     * "0 liste → add-playlist yönlendirmesi"ni yalnız İLK kurulumda yapar;
     * kullanıcı bir kez liste eklediyse geçici boş durumda tuzağa düşmez.
     * En az bir liste kaydedildiğinde işaretlenir.
     */
    if (metas.length > 0) {
      try { await storage.setItem(`kizilkan.firstListAdded.${pid}`, true); } catch { /* önemsiz */ }
    }
  }, []);

  const addPlaylist = useCallback(async (p: Playlist) => runExclusive(async () => {
    // v17.3.2: Ekleme artık SIRAYA alınır. Eskiden iki ekleme çakışınca her biri
    // kendi (bayat) listesini yazıyor ve biri diğerini siliyordu.
    // GPT ELITE v12.6.0: +18 analizi kayıt kritik yolunda senkron yapılmaz.

    // 1) Ağır veriyi DOSYAYA yaz — başarıyı kontrol et.
    const heavyOk = await bigStore.write(p.id, {
      channels: p.channels || [],
      vod: p.vod || [],
      series: p.series || [],
    });
    if (!heavyOk) {
      throw new Error('Liste içeriği cihaza kaydedilemedi. Depolama alanını kontrol edin.');
    }

    // v15.2.3 P0 RAM FIX: bir playlist eklenince on binlerce item'i React
    // state'te kalıcı tutma. Android Native Core varsa Room indeksini hazırla ve
    // yalnız metadata'yı belleğe al. Çok playlist -> JS heap -> Android LMK/reset
    // zincirinin ana kaynaklarından biri buydu.
    let normalizedP: Playlist;
    if (KizilkanNativeCore.available) {
      // v15.2.4 canonical Room: bigStore.write Android'de transaction + indexi
      // zaten tamamlar ve legacy dosyayı temizler. Burada reindex/invalidate
      // çağırmak canonical snapshot'ı bozup artık var olmayan legacy dosyaya
      // geri düşürebilirdi. Hazır snapshot yalnız doğrulanır.
      const summary = await KizilkanNativeCore.getPlaylistSummary(p.id);
      if (!summary?.roomIndexed) throw new Error('Playlist Room/SQLite indeksine alınamadı.');
      normalizedP = {
        ...p, channels: [], vod: [], series: [],
        channelsCount: p.channels?.length || Number(summary.channels || 0),
        vodCount: p.vod?.length || Number(summary.vod || 0),
        seriesCount: p.series?.length || Number(summary.series || 0),
      };
      loadedHeavy.current.delete(p.id);
    } else {
      normalizedP = {
        ...p, channelsCount: p.channels?.length || 0, vodCount: p.vod?.length || 0, seriesCount: p.series?.length || 0,
      };
      loadedHeavy.current.add(p.id);
    }
    const current = playlistsRef.current;
    if (normalizedP.manualOrder == null) {
      const maxOrder = current.reduce((m, pl) => Math.max(m, Number(pl.manualOrder ?? -1)), -1);
      normalizedP = { ...normalizedP, manualOrder: maxOrder + 1 };
    }
    const next = [...current.filter(pl => pl.id !== p.id), normalizedP];
    playlistsRef.current = next;
    setPlaylists(next);

    // 3) Metadata'yı yaz. Ref önce güncellendiği için arka arkaya eklemelerde
    // bir önceki playlist kaybolmaz.
    await persistMeta(next);

    // 4) Aktif yap.
    await storage.setItem(activeKey(currentPid()), p.id);
    setActiveId(p.id);

    // Native Core modunda 50-100 bin öğeyi fire-and-forget JS closure'unda
    // tutup +18 pre-scan yapma; bu hem heap'i hem event-loop'u yeniden şişirir.
    // isAdultContent gerektiğinde lazy hesaplar. Web/legacy yolunda eski preload korunur.
    if (!KizilkanNativeCore.available) scheduleAdultFlags(p.channels, p.vod, p.series);
  }), [persistMeta, runExclusive]);

  /**
   * v15.2.2-RC1: Native foreground importer ağır dosyayı + Room indeksini zaten
   * yazdıysa aynı 50-100 bin kaydı JS'e geri taşıyıp tekrar serialize ETME.
   * Yalnız metadata/state kaydedilir; legacy ekran tam veriyi isterse
   * ensureHeavyLoaded -> Native Core/Room üzerinden hydrate eder.
   */
  const addPreparedPlaylist = useCallback(async (p: Playlist) => runExclusive(async () => {
    // v17.3.2: Native içe aktarma yolu da sıraya alınır (addPlaylist ile aynı risk).
    const summary = KizilkanNativeCore.available ? await KizilkanNativeCore.getPlaylistSummary(p.id) : null;
    if (!summary?.roomIndexed) throw new Error('Native playlist indeksi doğrulanamadı.');
    const normalizedP: Playlist = {
      ...p,
      channels: [], vod: [], series: [],
      channelsCount: Number(summary.channels || p.channelsCount || 0),
      vodCount: Number(summary.vod || p.vodCount || 0),
      seriesCount: Number(summary.series || p.seriesCount || 0),
    };
    const current = playlistsRef.current;
    const withOrder: Playlist = normalizedP.manualOrder == null
      ? { ...normalizedP, manualOrder: current.reduce((m, pl) => Math.max(m, Number(pl.manualOrder ?? -1)), -1) + 1 }
      : normalizedP;
    const next = [...current.filter(pl => pl.id !== p.id), withOrder];
    playlistsRef.current = next;
    setPlaylists(next);
    loadedHeavy.current.delete(p.id);
    await persistMeta(next);
    await storage.setItem(activeKey(currentPid()), p.id);
    setActiveId(p.id);
  }), [persistMeta, runExclusive]);

  const removePlaylist = useCallback(async (id: string) => runExclusive(async () => {
    // v17.3.2: Bu MEŞRU bir silme; allowRemoval ile bildirilir. Bildirilmezse
    // silme koruması listeyi geri ekler ve kullanıcı "silinmiyor" derdi.
    const current = playlistsRef.current;
    const next = current.filter(pl => pl.id !== id);
    playlistsRef.current = next;
    setPlaylists(next);
    await persistMeta(next, { allowRemoval: [id] });
    await bigStore.remove(id);
    loadedHeavy.current.delete(id);
    if (activeId === id) {
      const newActive = next[0]?.id || null;
      setActiveId(newActive);
      const pid2 = currentPid();
      if (newActive) await storage.setItem(activeKey(pid2), newActive);
      else await storage.removeItem(activeKey(pid2));
    }
  }), [persistMeta, activeId, runExclusive]);

  const commitPlaylistUpdate = useCallback(async (id: string, patch: Partial<Playlist>) => {
    const requestedProfile=currentPid();
    const initial = playlistsRef.current;
    const target = initial.find(pl => pl.id === id);
    if (!target) throw new Error('Güncellenecek playlist bulunamadı.');
    const heavyTouched = 'channels' in patch || 'vod' in patch || 'series' in patch;
    const finishTask = markTask(heavyTouched ? 'room:commit' : 'playlist:metadata-update', { playlistId: id });
    try {

    // v15.2.23-RC2 — ATOMIC CATALOG PUBLISH:
    // Eski akış React state'i ÖNCE güncelliyor, Room/bigStore commit'i SONRA
    // yapıyordu. Büyük Xtream refresh sırasında UI yeni sayaçları görürken canonical
    // Room snapshot henüz hazır olmayabiliyordu. Artık ağır katalog state'e ancak
    // kalıcı yazım + Room summary doğrulamasından SONRA publish edilir.
    let committedSummary: NativePlaylistSummary | null = null;
    let published: Playlist;

    if (heavyTouched) {
      const suppliedKinds=[...('channels' in patch?['live']:[]),...('vod' in patch?['vod']:[]),...('series' in patch?['series']:[])];
      const merged={...target,...patch,catalogRevision:Date.now(),cleanedKinds:(target.cleanedKinds||[]).filter(k=>!suppliedKinds.includes(k))} as Playlist;
      merged.channelsCount = merged.channels?.length || 0;
      merged.vodCount = merged.vod?.length || 0;
      merged.seriesCount = merged.series?.length || 0;
      const startedAt = Date.now();
      void recordDiagnostic('database', 'PLAYLIST_COMMIT_START', {
        playlistId: id,
        channels: merged.channelsCount,
        vod: merged.vodCount,
        series: merged.seriesCount,
      });

      if (KizilkanNativeCore.available) {
        const snapshots: Partial<Record<'live' | 'vod' | 'series', any[]>> = {};
        if ('channels' in patch) snapshots.live = patch.channels || [];
        if ('vod' in patch) snapshots.vod = patch.vod || [];
        if ('series' in patch) snapshots.series = patch.series || [];
        const sync = await KizilkanNativeCore.syncPlaylistKindsJson(id, snapshots, {
          live: target.catalogSync?.liveFingerprint,
          vod: target.catalogSync?.vodFingerprint,
          series: target.catalogSync?.seriesFingerprint,
        });
        committedSummary = sync?.summary || null;
        // v17.9.1: native fark raporunu, raporu üreten yenileme yoluna aktar.
        if ((sync as any)?.diff) lastNativeDiffRef.current.set(id, (sync as any).diff);
        if (!sync?.roomVerified || !committedSummary?.roomIndexed) {
          void recordDiagnostic('database', 'PLAYLIST_COMMIT_FAILED', { playlistId: id, stage: 'incremental-room-verify' });
          throw new Error('Playlist incremental Room/SQLite commit doğrulanamadı.');
        }
        const catalogSync = {
          ...(target.catalogSync || {}),
          ...(sync.fingerprints.live ? { liveFingerprint: sync.fingerprints.live } : {}),
          ...(sync.fingerprints.vod ? { vodFingerprint: sync.fingerprints.vod } : {}),
          ...(sync.fingerprints.series ? { seriesFingerprint: sync.fingerprints.series } : {}),
          lastChangedKinds: sync.changedKinds,
          lastSkippedKinds: sync.skippedKinds,
          lastRepairedKinds: sync.repairedKinds || [],
          roomVerified: true,
          updatedAt: new Date().toISOString(),
        };
        published = fromMeta(toMeta({
          ...merged,
          catalogSync,
          channelsCount: Number(committedSummary.channels ?? merged.channelsCount ?? 0),
          vodCount: Number(committedSummary.vod ?? merged.vodCount ?? 0),
          seriesCount: Number(committedSummary.series ?? merged.seriesCount ?? 0),
        }));
        loadedHeavy.current.delete(id);
        void recordDiagnostic('database', 'CATALOG_INCREMENTAL_SYNC_V2', {
          playlistId: id, changedKinds: sync.changedKinds, skippedKinds: sync.skippedKinds, repairedKinds: sync.repairedKinds || [], snapshotRecovered: !!sync.snapshotRecovered, snapshotRecoveryState: sync.snapshotRecoveryState || "SNAPSHOT_READY", elapsedMs: sync.elapsedMs || 0,
          clientSnapshotDiff: true, serverDelta: false, skipVerifiedAgainstRoom: true,
        });
      } else {
        const stored=await bigStore.read<{channels:any[];vod:any[];series:any[]}>(id,{channels:[],vod:[],series:[]});
        if(!('channels' in patch))merged.channels=stored.channels||[];
        if(!('vod' in patch))merged.vod=stored.vod||[];
        if(!('series' in patch))merged.series=stored.series||[];
        merged.channelsCount=merged.channels.length;merged.vodCount=merged.vod?.length||0;merged.seriesCount=merged.series?.length||0;
        const ok = await bigStore.write(id, {
          channels: merged.channels || [], vod: merged.vod || [], series: merged.series || [],
        });
        if (!ok) {
          void recordDiagnostic('database', 'PLAYLIST_COMMIT_FAILED', { playlistId: id, stage: 'bigStore.write' });
          throw new Error('Liste içeriği güncellenemedi.');
        }
        published = merged;
        loadedHeavy.current.add(id);
      }

      // Commit sürerken başka playlist güncellenmiş olabilir. En güncel ref'i
      // taban al ve yalnız hedef playlist'i atomik biçimde değiştir.
      if(currentPid()!==requestedProfile)return;
      const latestBase = playlistsRef.current;
      const next = latestBase.map(pl => pl.id === id ? { ...pl, ...published } : pl);
      playlistsRef.current = next;
      setPlaylists(next);
      if(activeIdRef.current===id&&committedSummary)setNativeSummary(committedSummary);
      await persistMeta(next);

      void recordDiagnostic('database', 'PLAYLIST_COMMIT_READY', {
        playlistId: id,
        elapsedMs: Date.now() - startedAt,
        roomIndexed: !!committedSummary?.roomIndexed,
        channels: published.channelsCount || published.channels?.length || 0,
        vod: published.vodCount || published.vod?.length || 0,
        series: published.seriesCount || published.series?.length || 0,
      });

      if (!KizilkanNativeCore.available) scheduleAdultFlags(merged.channels, merged.vod, merged.series);
      return;
    }

    // Metadata-only güncelleme ağır store transaction gerektirmez.
    const next = playlistsRef.current.map(pl => pl.id === id ? ({ ...pl, ...patch } as Playlist) : pl);
    playlistsRef.current = next;
    setPlaylists(next);
    await persistMeta(next);
    } finally {
      finishTask();
    }
  }, [persistMeta, activeId]);

  const updatePlaylist=useCallback((id:string,patch:Partial<Playlist>)=>withCatalogLock(id,()=>commitPlaylistUpdate(id,patch)),[commitPlaylistUpdate]);

  const cleanupPlaylistContent=useCallback(async(id:string,kinds:Array<CatalogKind|'epg'>):Promise<number>=>{
    const pid=currentPid();
    return withCatalogLock(id,async()=>{
      if(currentPid()!==pid||!playlistsRef.current.some(p=>p.id===id))throw new Error('Temizlik hedefi değişti.');
      const result=await KizilkanNativeCore.executePlaylistContentCleanup(id,{live:kinds.includes('live'),vod:kinds.includes('vod'),series:kinds.includes('series'),epg:kinds.includes('epg')});
      if(!result?.after)throw new Error('Temizlik sonucu doğrulanamadı.');
      if(currentPid()!==pid)return result.deletedTotal;
      const after=result.after;loadedHeavy.current.delete(id);
      const next=playlistsRef.current.map(p=>p.id===id?fromMeta(toMeta({...p,
        channels:[],vod:[],series:[],channelsCount:after.live,vodCount:after.vod,seriesCount:after.series,
        catalogRevision:Date.now(),cleanedKinds:Array.from(new Set([...(p.cleanedKinds||[]),...kinds])),
        catalogSync:{...p.catalogSync,...(kinds.includes('live')?{liveFingerprint:undefined}:{}),...(kinds.includes('vod')?{vodFingerprint:undefined}:{}),...(kinds.includes('series')?{seriesFingerprint:undefined}:{})},
      })):p);
      playlistsRef.current=next;setPlaylists(next);
      if(activeIdRef.current===id)setNativeSummary({id,channels:after.live,vod:after.vod,series:after.series,roomIndexed:true});
      await persistMeta(next);
      if(kinds.includes('epg'))await storage.setItem('kizilkan.epg.meta.'+id,JSON.stringify({url:next.find(p=>p.id===id)?.epgUrl||'',fetchedAt:Date.now(),cleaned:true}));
      return result.deletedTotal;
    });
  },[persistMeta]);

  const refreshPlaylistKinds=useCallback(async(id:string,kinds:Array<CatalogKind|'epg'>,progress?:(p:RefreshProgress)=>void,valid:()=>boolean=()=>true,forceUnconditional=false)=>{
    const pid=currentPid();
    return withCatalogLock(id,async()=>{
      const owns=()=>currentPid()===pid&&valid()&&playlistsRef.current.some(p=>p.id===id);
      if(!owns())return;
      const pl=playlistsRef.current.find(p=>p.id===id)!;
      const catalogKinds=kinds.filter((k):k is CatalogKind=>k!=='epg');
      if(catalogKinds.length){
        /**
         * v17.4.1 — FARK RAPORU MERKEZİ YOLA TAŞINDI.
         * v17.4.0'da rapor yalnız playlist-select ekranındaki ELLE yenileme
         * yoluna eklenmişti; kullanıcının gördüğü ise liste seçilince çalışan
         * OTOMATİK yenilemedir (bu fonksiyon). Bu yüzden ekranda hiçbir özet
         * çıkmıyordu. Artık her iki yol da buradan geçtiği için rapor tek
         * yerde üretilir.
         */
        const beforeSnapshot={channels:pl.channels,vod:pl.vod,series:pl.series};
        const result=await refreshPlaylistContent(pl,progress,{kinds:catalogKinds,forceUnconditional});
        if(!owns())return;
        if(!result.ok||!result.patch)throw new Error(result.message);
        await commitPlaylistUpdate(id,{...result.patch,lastRefreshedAt:new Date().toISOString(),lastRefreshOk:true,lastFreshnessCheckAt:Date.now()});
        try{
          const {buildRefreshDiff,formatRefreshDiff,diffTelemetry,diffFromNative}=await import('@/src/utils/refreshDiff');
          /**
           * v17.9.1 — FARK KAYNAĞI DÜZELTİLDİ.
           * Native Core modunda pl.channels/vod/series bellekte BOŞ dizilerdir
           * (içerik Room'da). Bu yüzden JS karşılaştırması "önce" değerini her
           * zaman 0 veriyordu. Öncelik artık native'de hesaplanan farktadır;
           * yalnız native yoksa (web) JS karşılaştırması kullanılır.
           */
          const nativeDiff=lastNativeDiffRef.current.get(id);
          lastNativeDiffRef.current.delete(id);
          const after={
            channels:(result.patch as any).channels??pl.channels,
            vod:(result.patch as any).vod??pl.vod,
            series:(result.patch as any).series??pl.series,
          };
          const diff=diffFromNative(nativeDiff)||buildRefreshDiff(beforeSnapshot,after);
          void recordDiagnostic('catalog','PLAYLIST_REFRESH_DIFF',{playlistId:id,diffSource:nativeDiff?'native':'js',...diffTelemetry(diff,forceUnconditional?'manual':'auto')});
          setLastRefreshSummary({playlistId:id,playlistName:pl.name,text:formatRefreshDiff(diff),suspicious:diff.suspiciousDrop,at:Date.now()});
        }catch(e:any){
          void recordDiagnostic('catalog','PLAYLIST_REFRESH_DIFF_ERROR',{playlistId:id,error:String(e?.message||e)});
        }
      }
      if(kinds.includes('epg')&&owns()){
        if(!pl.epgUrl)throw new Error('Bu liste için EPG adresi tanımlı değil.');
        progress?.({phase:'content',message:'EPG indiriliyor ve doğrulanıyor…'});
        const {fetchAndCacheEpg}=await import('@/src/utils/epg');await fetchAndCacheEpg(pl.epgUrl,id);
        if(!owns())return;
        const current=playlistsRef.current.find(p=>p.id===id)!;
        await commitPlaylistUpdate(id,{cleanedKinds:(current.cleanedKinds||[]).filter(k=>k!=='epg'),catalogRevision:Date.now()});
      }
      progress?.({phase:'done',message:'Seçilen içerikler güncellendi.'});
    });
  },[commitPlaylistUpdate]);

  useEffect(()=>{
    if(!activeId||loadedProfileId!==profileId)return;
    const id=activeId,pid=profileId,generation=activeSwitchGeneration.current;let cancelled=false;
    const valid=()=>!cancelled&&currentPid()===pid&&activeSwitchGeneration.current===generation;
    const check=()=>{void(async()=>{
      const pl=playlistsRef.current.find(p=>p.id===id);
      if(!pl||pl.source==='m3u_file'||pl.autoRefreshEnabled===false||!valid())return;
      const attemptKey=pid+':'+id;
      if(!freshnessDue(freshnessAttempts.current.get(attemptKey)||pl.lastFreshnessCheckAt||0,pl.freshnessMinutes))return;
      freshnessAttempts.current.set(attemptKey,Date.now());
      let kinds=(['live','vod','series'] as CatalogKind[]).filter(k=>pl.cleanedKinds?.includes(k)||(pl.contentSelection?.[k]??true));
      if(!kinds.length)return;
      setFreshnessStatus({playlistId:id,message:'Güncellik kontrol ediliyor…'});
      try{
        let missingKinds:CatalogKind[]=[];
        if(KizilkanNativeCore.available){
          const rows=await KizilkanNativeCore.previewPlaylistContentCleanup(id);
          const expected={live:pl.channelsCount||0,vod:pl.vodCount||0,series:pl.seriesCount||0};
          missingKinds=rows?kinds.filter(k=>rows[k]!==expected[k]):[];
          if(missingKinds.length)kinds=missingKinds;
        }
        await refreshPlaylistKinds(id,kinds,undefined,valid,missingKinds.length>0);
        if(valid())setFreshnessStatus({playlistId:id,message:'Yerel katalog güncel.'});
      }catch{if(valid())setFreshnessStatus({playlistId:id,message:'Sunucuya ulaşılamadı; yerel katalog kullanılabilir.'});}
    })();};
    check();
    const timer=setInterval(check,60_000);
    const appStateSub=AppState.addEventListener('change',state=>{ if(state==='active')check(); });
    return()=>{cancelled=true;clearInterval(timer);try{appStateSub.remove();}catch{}};
  },[activeId,loadedProfileId,profileId]);

  /**
   * v15.2.25 RC1 — MAG live-first enrichment.
   * Native Core varsa mevcut LIVE katalogu JS'e hydrate etmeden yalnız VOD/Series
   * Room kind'larını atomik değiştirir. Her kind sonrası snapshot doğrulanır;
   * metadata yalnız doğrulanmış canonical sayılardan publish edilir.
   */
  const enrichPlaylistMedia = useCallback(async (id: string, patch: { vod?: Playlist["vod"]; series?: Playlist["series"] }) => {
    const finishTask = markTask('room:mag-enrichment', { playlistId: id });
    const startedAt = Date.now();
    try {
      const target = playlistsRef.current.find(pl => pl.id === id);
      if (!target) throw new Error('MAG enrichment hedef playlist bulunamadı.');
      void recordDiagnostic('database', 'MAG_ENRICH_ROOM_START', {
        playlistId: id,
        vod: patch.vod?.length ?? -1,
        series: patch.series?.length ?? -1,
      });

      if (KizilkanNativeCore.available) {
        const before = await KizilkanNativeCore.getPlaylistSummary(id);
        if (!before?.roomIndexed) throw new Error('MAG enrichment öncesi Room snapshot doğrulanamadı.');
        const snapshots: Partial<Record<'live' | 'vod' | 'series', any[]>> = {};
        if (patch.vod) snapshots.vod = patch.vod;
        if (patch.series) snapshots.series = patch.series;
        const sync = await KizilkanNativeCore.syncPlaylistKindsJson(id, snapshots, {
          live: target.catalogSync?.liveFingerprint, vod: target.catalogSync?.vodFingerprint, series: target.catalogSync?.seriesFingerprint,
        });
        const summary = sync?.summary || null;
        if (!sync?.roomVerified || !summary?.roomIndexed) throw new Error('MAG VOD/Series tek transaction Room commit doğrulanamadı.');
        const latest = playlistsRef.current;
        const next = latest.map(pl => pl.id === id ? ({
          ...pl,
          channels: [], vod: [], series: [],
          channelsCount: Number(summary.channels || pl.channelsCount || 0),
          vodCount: Number(summary.vod || 0),
          seriesCount: Number(summary.series || 0),
          catalogSync: {
            ...(pl.catalogSync || {}),
            ...(sync.fingerprints.live ? { liveFingerprint: sync.fingerprints.live } : {}),
            ...(sync.fingerprints.vod ? { vodFingerprint: sync.fingerprints.vod } : {}),
            ...(sync.fingerprints.series ? { seriesFingerprint: sync.fingerprints.series } : {}),
            lastChangedKinds: sync.changedKinds, lastSkippedKinds: sync.skippedKinds, lastRepairedKinds: sync.repairedKinds || [], snapshotRecovered: !!sync.snapshotRecovered, snapshotRecoveryState: sync.snapshotRecoveryState || "SNAPSHOT_READY", roomVerified: true, updatedAt: new Date().toISOString(),
          },
        } as Playlist) : pl);
        playlistsRef.current = next;
        setPlaylists(next);
        loadedHeavy.current.delete(id);
        if (activeId === id && summary) setNativeSummary(summary);
        await persistMeta(next);
        void recordDiagnostic('database', 'MAG_ENRICH_ROOM_OK', {
          playlistId: id,
          elapsedMs: Date.now() - startedAt,
          channels: summary?.channels || 0,
          vod: summary?.vod || 0,
          series: summary?.series || 0,
        });
        return;
      }

      // Web/legacy: ağır katalog zaten JS belleğinde tutulduğu için eski atomik
      // update yolunu kullanmak güvenlidir.
      const hydrated = await ensureHeavyLoaded(id);
      if (!hydrated) throw new Error('MAG enrichment için legacy playlist yüklenemedi.');
      await updatePlaylist(id, {
        ...(patch.vod ? { vod: patch.vod } : {}),
        ...(patch.series ? { series: patch.series } : {}),
      });
      void recordDiagnostic('database', 'MAG_ENRICH_ROOM_OK', { playlistId: id, elapsedMs: Date.now() - startedAt, native: false });
    } catch (e:any) {
      void recordDiagnostic('database', 'MAG_ENRICH_ROOM_FAIL', { playlistId: id, elapsedMs: Date.now() - startedAt, message: String(e?.message || e) });
      throw e;
    } finally {
      finishTask();
    }
  }, [activeId, ensureHeavyLoaded, persistMeta, updatePlaylist]);

  /**
   * v17.9.10 — TEK MERKEZİ BOŞ-KABUK ONARIM MOTORU
   * -----------------------------------------------------------------------
   * Önceki sürümlerde primary/fallback iki ayrı self-repair bloğuydu ve ikisi
   * de refreshPlaylistContent() ilerlemesini UI'ya taşımıyordu. Ayrıca Xtream
   * üç dev kataloğu aynı anda JS belleğinde tutuyordu. Artık iki yol burada
   * birleşir; manuel yenilemeyle aynı RefreshProgress kullanılır.
   *
   * Xtream recovery özelinde kataloglar live→vod→series sırasıyla alınır ve
   * HER KIND hazır olur olmaz Room'a commit edilir. Bu, aynı anda üç büyük
   * array + üç JSON kopyasının bellekte kalmasını engeller. Aktivasyon yine
   * SON Room doğrulamasından sonra yapılır; verified activation korunur.
   */
  const repairMissingPlaylist = useCallback(async (
    broken: Playlist,
    id: string,
    generation: number,
    traceId: string,
    mode: "primary" | "fallback",
  ): Promise<NativePlaylistSummary> => {
    const lastRepair=repairAttemptAt.current.get(id)||0;
    if(Date.now()-lastRepair<2500){
      setRepairFailedId(id);
      void recordDiagnostic('catalog','PLAYLIST_SELF_REPAIR_THROTTLED',{playlistId:id,generation,cooldownMs:2500});
      throw new Error('Playlist onarımı az önce denendi; 2,5 saniyelik güvenlik aralığından sonra tekrar deneyin.');
    }
    repairAttemptAt.current.set(id,Date.now());
    const startedAt=Date.now();
    const runtime:RepairLifecycleRuntime={playlistId:id,controller:null,pausedAt:null,pausedTotalMs:0,wake:null,onPause:null,traceId};
    repairLifecycleRef.current=runtime;
    let lastProgress:RefreshProgress|null=null;
    let lastTelemetryKey='';
    const playlistName=broken.name||id;
    const activeElapsed=()=>Math.max(0,Date.now()-startedAt-runtime.pausedTotalMs-(runtime.pausedAt?Date.now()-runtime.pausedAt:0));
    const publishState=(phase:PlaylistRepairProgress['phase'],message:string,progress:RefreshProgress|null=lastProgress,partial?:boolean)=>{
      const now=Date.now();
      setRepairProgress({playlistId:id,playlistName,source:broken.source||'',mode,phase,message,progress,startedAt,lastProgressAt:now,pausedAt:runtime.pausedAt,pausedTotalMs:runtime.pausedTotalMs,partial});
    };
    const waitUntilForeground=()=>{
      if(appStateRef.current==='active'&&!runtime.pausedAt)return Promise.resolve();
      return new Promise<void>(resolve=>{runtime.wake=resolve;});
    };
    runtime.onPause=()=>publishState('paused','Uygulama arka plandayken hazırlama işlemi bekletildi.',lastProgress);
    const onProgress=(p:RefreshProgress)=>{
      lastProgress=p;
      if(appStateRef.current!=='active'||runtime.pausedAt){ publishState('paused','Uygulama arka plandayken hazırlama işlemi bekletildi.',p); return; }
      const now=Date.now();
      const phase=(p.phase==='dns'||p.phase==='login'||p.phase==='content'||p.phase==='save'||p.phase==='error')?p.phase:'content';
      setRepairProgress({playlistId:id,playlistName,source:broken.source||'',mode,phase,message:p.message,progress:p,startedAt,lastProgressAt:now,pausedAt:runtime.pausedAt,pausedTotalMs:runtime.pausedTotalMs});
      const key=[p.phase,p.live,p.vod,p.series,p.liveCount,p.vodCount,p.seriesCount,p.message].join('|');
      if(key!==lastTelemetryKey){
        lastTelemetryKey=key;
        void recordDiagnostic('catalog','PLAYLIST_REPAIR_PROGRESS',{
          playlistId:id,playlistName,source:broken.source,mode,phase:p.phase,message:p.message,
          live:p.live||'',vod:p.vod||'',series:p.series||'',
          liveCount:p.liveCount??-1,vodCount:p.vodCount??-1,seriesCount:p.seriesCount??-1,
          liveElapsedMs:p.liveElapsedMs??-1,vodElapsedMs:p.vodElapsedMs??-1,seriesElapsedMs:p.seriesElapsedMs??-1,
          elapsedMs:activeElapsed(),
        },{traceId,stage:'catalogRecovery',outcome:p.phase==='error'?'failed':'progress'});
      }
    };

    setHeavyLoading(true);
    setRepairFailedId(null);
    publishState('verify','Yerel katalog bulunamadı; kaynağından otomatik onarım başlatılıyor.',null);
    void recordDiagnostic('catalog','PLAYLIST_SELF_REPAIR_START',{playlistId:id,source:broken.source,mode},{traceId,stage:'catalogRecovery',outcome:'started'});
    void recordFlightRecorderStage(traceId,'catalogRecovery',{playlistId:id,mode,source:broken.source},'started');

    try{
      const expectedKinds:CatalogKind[]=['live','vod','series'];
      const completedKinds=new Set<CatalogKind>();
      await updatePlaylist(id,{
        catalogRecovery:{state:'running',startedAt,expectedKinds,completedKinds:[]},
        lastRefreshOk:false,
      });

      const incrementalDelivery = (broken.source==='xtream'||broken.source==='stalker') ? async (delivery:IncrementalCatalogDelivery) => {
        if(activeSwitchGeneration.current!==generation)throw new Error('Playlist seçimi değişti; eski onarım sonucu uygulanmadı.');
        const commitStarted=Date.now();
        const existingSummary=await KizilkanNativeCore.getPlaylistSummary(id).catch(()=>null);
        // Missing snapshot ilk EMPTY partial ile bootstrap edilemez. Empty kind
        // gerçek ve tamamlanmış sayılır; ilk non-empty kind snapshot'ı kurduğunda
        // diğer kind sayıları zaten 0 olarak güvenli şekilde temsil edilir.
        if(delivery.items.length===0 && !existingSummary?.roomIndexed){
          completedKinds.add(delivery.kind);
          await updatePlaylist(id,{catalogRecovery:{state:'running',startedAt,expectedKinds,completedKinds:Array.from(completedKinds)},lastRefreshOk:false});
          void recordDiagnostic('catalog','PLAYLIST_REPAIR_EMPTY_KIND_DEFERRED',{
            playlistId:id,kind:delivery.kind,rawCount:delivery.rawCount,fetchElapsedMs:delivery.fetchElapsedMs,
          },{traceId,stage:'catalogRecovery',outcome:'success'});
          return;
        }
        if(broken.source==='stalker'&&delivery.kind==='series'&&KizilkanNativeCore.available&&existingSummary?.roomIndexed){
          await KizilkanNativeCore.beginChunkedPlaylistKindReplace(id,'series'); try{ for(let o=0;o<delivery.items.length;o+=400){ await KizilkanNativeCore.appendPlaylistKindChunk(id,'series',JSON.stringify(delivery.items.slice(o,o+400))); await new Promise<void>(r=>setTimeout(r,0)); } const staged=await KizilkanNativeCore.finishChunkedPlaylistKindReplace(id,'series'); if(!staged?.roomIndexed||Number(staged.series||0)!==delivery.items.length)throw new Error('MAG Series chunk staging Room doğrulaması başarısız.'); await updatePlaylist(id,{seriesCount:delivery.items.length,catalogRecovery:{state:'running',startedAt,expectedKinds,completedKinds:Array.from(completedKinds)},lastRefreshOk:false}); }catch(e){try{await KizilkanNativeCore.cancelChunkedPlaylistKindReplace(id,'series')}catch{} throw e}
        }else{ const patch:Partial<Playlist>=delivery.kind==='live'?{channels:delivery.items as Playlist['channels']}:delivery.kind==='vod'?{vod:delivery.items as Playlist['vod']}:{series:delivery.items as Playlist['series']}; await updatePlaylist(id,{...patch,catalogRecovery:{state:'running',startedAt,expectedKinds,completedKinds:Array.from(completedKinds)},lastRefreshOk:false}); }
        const summary=await KizilkanNativeCore.getPlaylistSummary(id).catch(()=>null);
        if(!summary?.roomIndexed)throw new Error(`${delivery.kind} kataloğu Room'a yazıldı ancak snapshot doğrulanamadı.`);
        completedKinds.add(delivery.kind);
        await updatePlaylist(id,{catalogRecovery:{state:'running',startedAt,expectedKinds,completedKinds:Array.from(completedKinds)},lastRefreshOk:false});
        void recordDiagnostic('catalog','PLAYLIST_REPAIR_KIND_COMMITTED',{
          playlistId:id,source:broken.source,kind:delivery.kind,rawCount:delivery.rawCount,filteredCount:delivery.filteredCount,
          fetchElapsedMs:delivery.fetchElapsedMs,commitElapsedMs:Date.now()-commitStarted,
          roomChannels:summary.channels||0,roomVod:summary.vod||0,roomSeries:summary.series||0,
        },{traceId,stage:'catalogRecovery',outcome:'success'});
        // Ağır dizinin referansını bu callback dışına taşımıyoruz; sonraki kind
        // başlamadan önce GC için uygun hale gelir.
      } : undefined;

      let res;
      let resumeCount=0;
      while(true){
        if(activeSwitchGeneration.current!==generation)throw new Error('Playlist seçimi değişti; eski onarım sonucu uygulanmadı.');
        if(appStateRef.current!=='active'||runtime.pausedAt){
          publishState('paused','Uygulama arka plandayken hazırlama işlemi bekletildi.',lastProgress);
          await waitUntilForeground();
          publishState((lastProgress as any)?.phase==='login'?'login':'content','Uygulamaya dönüldü; yarım kalan aşamadan devam ediliyor…',lastProgress);
        }
        const controller=new AbortController();
        runtime.controller=controller;
        const remainingKinds=expectedKinds.filter(k=>!completedKinds.has(k));
        res=await refreshPlaylistContent(broken,onProgress,incrementalDelivery?{
          incrementalDelivery,allowPartialRecovery:true,forceUnconditional:true,
          kinds:remainingKinds.length?remainingKinds:expectedKinds,signal:controller.signal,
        }:{forceUnconditional:true,signal:controller.signal});
        runtime.controller=null;
        if(controller.signal.aborted&&(runtime.pausedAt||appStateRef.current!=='active')){
          resumeCount+=1;
          void recordDiagnostic('catalog','PLAYLIST_REPAIR_STAGE_ABORTED_FOR_BACKGROUND',{playlistId:id,resumeCount,completedKinds:Array.from(completedKinds),activeElapsedMs:activeElapsed()},{traceId,stage:'catalogRecovery',outcome:'paused'});
          await waitUntilForeground();
          publishState('content','Uygulamaya dönüldü; tamamlanan kataloglar korunarak devam ediliyor…',lastProgress);
          continue;
        }
        break;
      }
      if(activeSwitchGeneration.current!==generation)throw new Error('Playlist seçimi değişti; eski onarım sonucu uygulanmadı.');
      if(!res.ok)throw new Error(String(res.message||'Playlist otomatik onarımı başarısız.'));

      if(res.patch){
        publishState('save',res.partial?'Kullanılabilir kataloglar kaydedildi; eksik türler işaretleniyor.':'İçerik cihaza kaydediliyor…',lastProgress,!!res.partial);
        await updatePlaylist(id,{
          ...res.patch,
          lastRefreshedAt:new Date().toISOString(),
          lastRefreshOk:false,
          lastFreshnessCheckAt:Date.now(),
          catalogRecovery:{state:'running',startedAt,expectedKinds,completedKinds:Array.from(completedKinds),failedKinds:res.failedKinds||[]},
        } as Partial<Playlist>);
      }
      if(activeSwitchGeneration.current!==generation)throw new Error('Playlist seçimi değişti; eski onarım sonucu uygulanmadı.');

      publishState('roomVerify','Kaydedilen içerik Room veritabanında doğrulanıyor…',lastProgress,!!res.partial);
      let summary:NativePlaylistSummary|null=null;
      try{summary=await KizilkanNativeCore.warmPlaylist(id);}catch{summary=null;}
      const total=(summary?.channels||0)+(summary?.vod||0)+(summary?.series||0);
      if(!summary?.roomIndexed||total<=0){
        void recordDiagnostic('catalog','PLAYLIST_SELF_REPAIR_INDEX_MISSING',{playlistId:id,mode,total});
        throw new Error('Playlist Room indeksi onarım sonrasında da kullanılabilir içerik içermiyor.');
      }

      await updatePlaylist(id,{
        catalogRecovery:{
          state:res.partial?'partial':'ready',startedAt,completedAt:Date.now(),expectedKinds,
          completedKinds:Array.from(completedKinds),failedKinds:res.failedKinds||[],
        },
        lastRefreshOk:!res.partial,
      });
      setRepairFailedId(null);
      publishState('ready',res.partial?'Liste kullanılabilir durumda; bazı kataloglar eksik kaldı.':'Liste hazır; açılıyor…',lastProgress,!!res.partial);
      void recordDiagnostic('catalog',res.partial?'PLAYLIST_SELF_REPAIR_PARTIAL':'PLAYLIST_SELF_REPAIR_OK',{
        playlistId:id,mode,elapsedMs:activeElapsed(),channels:summary.channels||0,vod:summary.vod||0,series:summary.series||0,
        failedKinds:(res.failedKinds||[]).join(','),message:res.message,
      },{traceId,stage:'catalogRecovery',outcome:'success'});
      void recordFlightRecorderStage(traceId,'catalogRecovery',{playlistId:id,mode,partial:!!res.partial,channels:summary.channels||0,vod:summary.vod||0,series:summary.series||0},'success');
      return summary;
    }catch(err:any){
      const message=String(err?.message||err||'Playlist otomatik onarım hatası.');
      try{await updatePlaylist(id,{catalogRecovery:{state:'failed',startedAt,completedAt:Date.now(),expectedKinds:['live','vod','series'],error:message},lastRefreshOk:false});}catch{}
      setRepairFailedId(id);
      publishState('error',message,lastProgress);
      void recordDiagnostic('catalog','PLAYLIST_SELF_REPAIR_ERROR',{playlistId:id,mode,error:message,elapsedMs:activeElapsed(),pausedTotalMs:runtime.pausedTotalMs},{traceId,stage:'catalogRecovery',outcome:'failed'});
      void recordFlightRecorderStage(traceId,'catalogRecovery',{playlistId:id,mode,error:message},'failed');
      throw err instanceof Error?err:new Error(message);
    }finally{
      runtime.controller=null; runtime.onPause=null; runtime.wake=null;
      if(repairLifecycleRef.current===runtime)repairLifecycleRef.current=null;
      setHeavyLoading(false);
    }
  },[updatePlaylist]);

  const setActivePlaylist = useCallback(async (id: string) => {
    const existing = activeSwitchInFlight.current.get(id);
    if (existing) {
      void recordDiagnostic('catalog', 'PLAYLIST_SWITCH_SINGLEFLIGHT_JOIN', { playlistId: id, reason: 'same-target-in-flight' });
      return existing;
    }
    const traceId = beginFlightRecorderTrace('playlist', id);
    void recordFlightRecorderStage(traceId, 'playlistSelect', { playlistId: id, fromPlaylistId: activeId || '' }, 'started');
    const operation = (async () => {
      const finishTask = markTask('room:switch-verify', { playlistId: id, traceId });
      try {
    const generation = ++activeSwitchGeneration.current;
    const previousId = activeId;
    let verifiedSummary: NativePlaylistSummary | null = null;

    // v15.2.24 — VERIFIED ACTIVATION:
    // Native Core kullanılan cihazlarda hedef playlist önce Room tarafında gerçekten
    // okunabilir/indeksli hale gelmeden activeId ve kalıcı activeKey değiştirilmez.
    // Böylece "sayı var ama içerik yok" snapshot'ı kullanıcıya aktif liste olarak
    // yayınlanamaz. Recovery de aynı generation içinde tamamlanmak zorundadır.
    if (KizilkanNativeCore.available) {
      const verifyStartedAt = Date.now();
      void recordDiagnostic('catalog', 'PLAYLIST_SWITCH_VERIFY_START', { fromPlaylistId: previousId || '', toPlaylistId: id, generation }, { traceId, stage: 'roomVerify', outcome: 'started' });
      void recordFlightRecorderStage(traceId, 'roomVerify', { playlistId: id, generation }, 'started');
      try {
        try {
          verifiedSummary = await KizilkanNativeCore.getPlaylistSummary(id);
        } catch (firstError: any) {
          void recordDiagnostic('catalog', 'PLAYLIST_SWITCH_INDEX_RECOVERY', {
            playlistId: id, generation, error: String(firstError?.message || firstError),
          });
          verifiedSummary = await KizilkanNativeCore.warmPlaylist(id);
        }
        if (activeSwitchGeneration.current !== generation) {
          void recordDiagnostic('catalog', 'PLAYLIST_SWITCH_STALE_DISCARDED', { playlistId: id, stage: 'verify' });
          return;
        }
        if (!verifiedSummary?.roomIndexed) throw new Error('Playlist Room indeksi hazır değil.');
        /**
         * v17.5.0 — "0 KANAL" BOŞ KABUK LİSTELER ARTIK DOLDURULUYOR
         * ---------------------------------------------------------------------
         * SORUN (kullanıcı bildirimi + ekran görüntüsü): liste "PRIME X APP ·
         * 0 kanal" görünüyor, seçilse de içerik gelmiyor.
         *
         * KÖK NEDEN: Doğrulama yalnız `roomIndexed`'e bakıyordu. "İndeks var
         * ama içinde HİÇ SATIR YOK" durumu BAŞARI sayılıyor, bu yüzden
         * v17.3.2'de eklediğim otomatik onarım (catch bloğunda) hiç
         * tetiklenmiyordu: hata atılmıyordu ki yakalansın.
         *
         * ÇÖZÜM: indeks hazır olsa bile üç türün TOPLAMI sıfırsa bu liste
         * kullanılamaz kabul edilir ve hata atılır. Aşağıdaki catch bloğu
         * devreye girip içeriği kaynağından yeniden indirir (kendini onarma).
         * Meta sayaçları içerik olduğunu söylüyorsa uyuşmazlık da kaydedilir.
         */
        const shellState=playlistsRef.current.find(pl=>pl.id===id);
        if(shellState?.catalogRecovery && (shellState.catalogRecovery.state==='running'||shellState.catalogRecovery.state==='failed')){
          void recordDiagnostic('catalog','PLAYLIST_RECOVERY_BARRIER_HIT',{playlistId:id,generation,recoveryState:shellState.catalogRecovery.state,completedKinds:shellState.catalogRecovery.completedKinds||[]});
          throw new Error('Playlist katalog onarımı tamamlanmamış; güvenli yeniden onarım gerekiyor.');
        }
        const verifiedTotal = (verifiedSummary.channels || 0) + (verifiedSummary.vod || 0) + (verifiedSummary.series || 0);
        if (verifiedTotal === 0) {
          // v17.5.0: `target` bu kapsamda tanımlı DEĞİL (CI yakaladı: TS2304).
          // Aşağıdaki onarım kodunun kullandığı kaynağın aynısını kullanıyoruz.
          const shell = playlistsRef.current.find(pl => pl.id === id);
          const metaTotal = (shell?.channelsCount || 0) + (shell?.vodCount || 0) + (shell?.seriesCount || 0);
          void recordDiagnostic('catalog', 'PLAYLIST_EMPTY_SHELL_DETECTED', {
            playlistId: id,
            source: shell?.source || '',
            metaTotal,
            hasSource: !!(shell?.m3uUrl || shell?.xtreamServer || shell?.stalkerPortal),
          });
          throw new Error('Liste içeriği boş (Room indeksinde hiç kayıt yok).');
        }
        void recordDiagnostic('catalog', 'PLAYLIST_SWITCH_VERIFY_READY', {
          playlistId: id,
          generation,
          elapsedMs: Date.now() - verifyStartedAt,
          channels: verifiedSummary.channels || 0,
          vod: verifiedSummary.vod || 0,
          series: verifiedSummary.series || 0,
        });
      } catch (e:any) {
        if (activeSwitchGeneration.current !== generation) return;
        void recordDiagnostic('catalog', 'PLAYLIST_SWITCH_VERIFY_FAILED', {
          playlistId: id,
          generation,
          elapsedMs: Date.now() - verifyStartedAt,
          error: String(e?.message || e),
        });

        /**
         * v17.9.10 — PRIMARY/FALLBACK SELF-REPAIR TEK YOL
         * Kaynak alanı tam ise primary, eski/eksik meta ise fallback etiketiyle
         * AYNI repairMissingPlaylist motoru çalışır. Böylece iki farklı blok
         * arasında ilerleme, hata ve OOM davranışı ayrışmaz.
         */
        const broken = playlistsRef.current.find(pl => pl.id === id);
        if(!broken){
          setRepairFailedId(id);
          throw new Error('Playlist metadata kaydı bulunamadığı için otomatik onarım yapılamadı.');
        }
        const hasSource=!!(broken.m3uUrl||broken.xtreamServer||broken.stalkerPortal||(broken as any).panelCode||(broken as any).serverCodeBinding);
        if(!hasSource){
          void recordDiagnostic('catalog','PLAYLIST_SELF_REPAIR_SOURCE_FALLBACK',{
            playlistId:id,source:broken.source||'',hasM3u:!!broken.m3uUrl,hasXtreamServer:!!broken.xtreamServer,
            hasXtreamUser:!!broken.xtreamUsername,hasStalkerPortal:!!broken.stalkerPortal,
            hasPanelCode:!!(broken as any).panelCode,hasPreferredServer:!!(broken as any).preferredServer,
            keys:Object.keys(broken).slice(0,30).join(','),
          });
        }
        if(!hasSource&&!broken.source){
          setRepairFailedId(id);
          throw new Error('Playlist kaynağı bulunamadığı için otomatik onarım yapılamadı.');
        }
        verifiedSummary=await repairMissingPlaylist(broken,id,generation,traceId,hasSource?'primary':'fallback');
      }
    }

    if (activeSwitchGeneration.current !== generation) return;

    // v15.2.3: önceki listelerde legacy ekranların hydrate ettiği dev diziler
    // RAM'de birikmesin. Hedef liste hariç hepsini metadata-only forma sıkıştır.
    if (KizilkanNativeCore.available) {
      const compacted = playlistsRef.current.map(pl => pl.id === id ? pl : fromMeta(toMeta(pl)));
      playlistsRef.current = compacted;
      setPlaylists(compacted);
      for (const loadedId of Array.from(loadedHeavy.current)) if (loadedId !== id) loadedHeavy.current.delete(loadedId);
    }

    setActiveId(id);
    setNativeSummary(verifiedSummary);
    const key = activeKey(currentPid());
    const persist = activeSwitchWriteQueue.current = activeSwitchWriteQueue.current
      .catch(() => {})
      .then(async () => {
        await storage.setItem(key, id);
      });
    await persist;
    if (activeSwitchGeneration.current === generation) {
      const usedAt = new Date().toISOString();
      const latest = playlistsRef.current;
      const nextUsed = latest.map(pl => pl.id === id ? { ...pl, lastUsedAt: usedAt } : pl);
      playlistsRef.current = nextUsed;
      setPlaylists(nextUsed);
      await persistMeta(nextUsed);
    }
    if (activeSwitchGeneration.current !== generation) {
      void recordDiagnostic('navigation', 'PLAYLIST_SWITCH_STALE_DISCARDED', { fromPlaylistId: previousId || '', toPlaylistId: id, stage: 'persisted' });
      return;
    }

    void recordDiagnostic('navigation', 'PLAYLIST_SWITCH', { fromPlaylistId: previousId || '', toPlaylistId: id, nativeCore: KizilkanNativeCore.available, generation }, { traceId, stage: 'roomVerify', outcome: 'success' });
    void recordFlightRecorderStage(traceId, 'roomVerify', { playlistId: id, generation, activePublished: true }, 'success');
    if (verifiedSummary) {
      void recordDiagnostic('catalog', 'PLAYLIST_SWITCH_READY', {
        playlistId: id,
        channels: verifiedSummary.channels || 0,
        vod: verifiedSummary.vod || 0,
        series: verifiedSummary.series || 0,
        generation,
      });
    }
      } finally {
        finishTask();
      }
    })();
    activeSwitchInFlight.current.set(id, operation);
    try {
      await operation;
    } finally {
      if (activeSwitchInFlight.current.get(id) === operation) activeSwitchInFlight.current.delete(id);
    }
  }, [activeId, persistMeta, repairMissingPlaylist]);
  activatePlaylistRef.current = setActivePlaylist;

  const toggleFavorite = useCallback(async (channelId: string) => {
    const next = favorites.includes(channelId)
      ? favorites.filter(x => x !== channelId)
      : [...favorites, channelId];
    setFavorites(next);
    await storage.setItem(FAV_KEY_PREFIX + profileId, JSON.stringify(next));
  }, [favorites, profileId]);

  const isFavorite = useCallback((channelId: string) => favorites.includes(channelId), [favorites]);

  const addToRecent = useCallback(async (channelId: string) => {
    const next = [channelId, ...recent.filter(x => x !== channelId)].slice(0, 30);
    setRecent(next);
    await storage.setItem(REC_KEY_PREFIX + profileId, JSON.stringify(next));
  }, [recent, profileId]);

  const clearRecent = useCallback(async () => {
    setRecent([]);
    await storage.setItem(REC_KEY_PREFIX + profileId, JSON.stringify([]));
  }, [profileId]);

  const activePlaylist = playlists.find(p => p.id === activeId) || null;

  return (
    <PlaylistContext.Provider
      value={{
        playlists, activePlaylist, favorites, recent,
        isLoading: isLoading || loadedProfileId !== profileId,
        loadedProfileId,nativeSummary,ensureHeavyLoaded,cleanupPlaylistContent,refreshPlaylistKinds,freshnessStatus,
        addPlaylist, addPreparedPlaylist, enrichPlaylistMedia, removePlaylist, updatePlaylist, setActivePlaylist,
        toggleFavorite, isFavorite, addToRecent, clearRecent,
        heavyLoading, repairProgress, repairFailedId,
        lastRefreshSummary, clearRefreshSummary: () => setLastRefreshSummary(null),
      }}
    >
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylists(): PlaylistContextValue {
  const ctx = useContext(PlaylistContext);
  if (!ctx) throw new Error('usePlaylists must be used within PlaylistProvider');
  return ctx;
}
