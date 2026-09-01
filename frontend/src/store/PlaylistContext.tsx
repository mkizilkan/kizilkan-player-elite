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
  updatePlaylist: (id: string, patch: Partial<Playlist>) => Promise<void>;
  setActivePlaylist: (id: string) => Promise<void>;
  toggleFavorite: (channelId: string) => Promise<void>;
  isFavorite: (channelId: string) => boolean;
  addToRecent: (channelId: string) => Promise<void>;
  clearRecent: () => Promise<void>;
  /* ---- v16.4.0 ---- */
  /** Ağır veri/onarım sürüyor mu? */
  heavyLoading: boolean;
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
  const [repairFailedId, setRepairFailedId] = useState<string | null>(null);
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
  const persistMeta = useCallback(async (list: Playlist[]) => {
    const metas = list.map(toMeta);
    const pid = currentPid();
    const ok = await storage.setItem(metaKey(pid), JSON.stringify(metas));
    if (!ok) {
      throw new Error('Liste bilgisi kaydedilemedi (meta yazma hatası).');
    }
  }, []);

  const addPlaylist = useCallback(async (p: Playlist) => {
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
  }, [persistMeta]);

  /**
   * v15.2.2-RC1: Native foreground importer ağır dosyayı + Room indeksini zaten
   * yazdıysa aynı 50-100 bin kaydı JS'e geri taşıyıp tekrar serialize ETME.
   * Yalnız metadata/state kaydedilir; legacy ekran tam veriyi isterse
   * ensureHeavyLoaded -> Native Core/Room üzerinden hydrate eder.
   */
  const addPreparedPlaylist = useCallback(async (p: Playlist) => {
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
  }, [persistMeta]);

  const removePlaylist = useCallback(async (id: string) => {
    const current = playlistsRef.current;
    const next = current.filter(pl => pl.id !== id);
    playlistsRef.current = next;
    setPlaylists(next);
    await persistMeta(next);
    await bigStore.remove(id);
    loadedHeavy.current.delete(id);
    if (activeId === id) {
      const newActive = next[0]?.id || null;
      setActiveId(newActive);
      const pid2 = currentPid();
      if (newActive) await storage.setItem(activeKey(pid2), newActive);
      else await storage.removeItem(activeKey(pid2));
    }
  }, [persistMeta, activeId]);

  const updatePlaylist = useCallback(async (id: string, patch: Partial<Playlist>) => {
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
      const merged = { ...target, ...patch } as Playlist;
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
          playlistId: id, changedKinds: sync.changedKinds, skippedKinds: sync.skippedKinds, repairedKinds: sync.repairedKinds || [], elapsedMs: sync.elapsedMs || 0,
          clientSnapshotDiff: true, serverDelta: false, skipVerifiedAgainstRoom: true,
        });
      } else {
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
      const latestBase = playlistsRef.current;
      const next = latestBase.map(pl => pl.id === id ? { ...pl, ...published } : pl);
      playlistsRef.current = next;
      setPlaylists(next);
      if (activeId === id && committedSummary) setNativeSummary(committedSummary);
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
            lastChangedKinds: sync.changedKinds, lastSkippedKinds: sync.skippedKinds, lastRepairedKinds: sync.repairedKinds || [], roomVerified: true, updatedAt: new Date().toISOString(),
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
         * v16.4.0 — "BOŞ KABUK" LİSTE OTOMATİK ONARIMI
         * ---------------------------------------------------------------------
         * CİHAZ KANITI (28.08 kaydı): 21 kez PLAYLIST_SWITCH_VERIFY_FAILED
         *   "Playlist Room indeksi ve legacy veri dosyası bulunamadı"
         * Yani listenin METASI var ama İÇERİĞİ hiç yazılmamış (ekleme sırasında
         * "Liste içeriği cihaza kaydedilemedi" hatası alınmış, meta yine de
         * kalmış). Eski davranış: sessizce vazgeç -> kullanıcı için liste
         * "seçilmiyor" görünüyordu, hiçbir açıklama yoktu.
         *
         * YENİ: içerik yoksa ve listenin KAYNAK bilgisi duruyorsa (sunucu,
         * kullanıcı, şifre, panel kodu, m3u adresi) içerik kaynağından
         * SESSİZCE yeniden indirilir ve seçim tamamlanır. Kullanıcı hiçbir şey
         * yapmaz. Onarım da başarısız olursa artık sessiz kalınmaz; durum
         * kaydedilir ve arayüz bilgilendirilir.
         */
        const broken = playlistsRef.current.find(pl => pl.id === id);
        const lastRepair=repairAttemptAt.current.get(id)||0;
        if(Date.now()-lastRepair<30000){setRepairFailedId(id);void recordDiagnostic('catalog','PLAYLIST_SELF_REPAIR_THROTTLED',{playlistId:id,generation});throw new Error('Playlist içeriği henüz hazır değil; otomatik onarım kısa süre önce denendi.');}
        repairAttemptAt.current.set(id,Date.now());
        const hasSource = !!(broken?.m3uUrl || broken?.xtreamServer || broken?.stalkerPortal || (broken as any)?.panelCode);
        if (broken && hasSource) {
          try {
            setHeavyLoading(true);
            void recordDiagnostic('catalog', 'PLAYLIST_SELF_REPAIR_START', { playlistId: id, source: broken.source });
            const { refreshPlaylistContent } = await import('@/src/utils/refreshPlaylist');
            const res = await refreshPlaylistContent(broken as any);
            if (activeSwitchGeneration.current !== generation) return;
            if (res?.ok && res.patch) {
              await updatePlaylist(id, res.patch as any);
              try { verifiedSummary = await KizilkanNativeCore.warmPlaylist(id); } catch { verifiedSummary = null as any; }
              if (verifiedSummary?.roomIndexed) {
                void recordDiagnostic('catalog', 'PLAYLIST_SELF_REPAIR_OK', {
                  playlistId: id, channels: verifiedSummary.channels || 0,
                });
                setRepairFailedId(null);
              } else {
                void recordDiagnostic('catalog', 'PLAYLIST_SELF_REPAIR_INDEX_MISSING', { playlistId: id });
                setRepairFailedId(id);
                throw new Error('Playlist Room indeksi onarım sonrasında da oluşturulamadı.');
              }
            } else {
              if (res?.patch) await updatePlaylist(id, res.patch as any);
              void recordDiagnostic('catalog', 'PLAYLIST_SELF_REPAIR_FAILED', {
                playlistId: id, message: String(res?.message || 'bilinmiyor'),
              });
              setRepairFailedId(id);
              throw new Error(String(res?.message || 'Playlist otomatik onarımı başarısız.'));
            }
          } catch (repairErr: any) {
            void recordDiagnostic('catalog', 'PLAYLIST_SELF_REPAIR_ERROR', {
              playlistId: id, error: String(repairErr?.message || repairErr),
            });
            setRepairFailedId(id);
            throw repairErr instanceof Error ? repairErr : new Error(String(repairErr || 'Playlist otomatik onarım hatası.'));
          } finally {
            setHeavyLoading(false);
          }
        } else {
          /**
           * v16.5.0 — TEŞHİS BOŞLUĞU KAPATILDI + ONARIM KOŞULU GENİŞLETİLDİ.
           * v16.4.0'da bu dal SESSİZDİ: cihaz kaydında 14 kez
           * PLAYLIST_SWITCH_VERIFY_FAILED görüldü ama hiç SELF_REPAIR olayı
           * yoktu; yani onarım hiç denenmemişti ve NEDEN denenmediği de
           * anlaşılamıyordu. Artık hangi kaynak alanlarının bulunduğu/eksik
           * olduğu kaydedilir.
           *
           * Ayrıca: kaynak alanları eksik görünse bile liste Xtream/M3U/MAG
           * olarak işaretliyse ve kullanıcı bilgileri duruyorsa onarım YİNE
           * denenir — kaynak bilgisi farklı alan adlarında saklanmış olabilir.
           */
          void recordDiagnostic('catalog', 'PLAYLIST_SELF_REPAIR_SKIPPED', {
            playlistId: id,
            found: !!broken,
            source: broken?.source || '',
            hasM3u: !!broken?.m3uUrl,
            hasXtreamServer: !!broken?.xtreamServer,
            hasXtreamUser: !!broken?.xtreamUsername,
            hasStalkerPortal: !!broken?.stalkerPortal,
            hasPanelCode: !!(broken as any)?.panelCode,
            hasPreferredServer: !!(broken as any)?.preferredServer,
            keys: broken ? Object.keys(broken).slice(0, 30).join(',') : '',
          });

          // Son çare: liste var ve bir kaynak TÜRÜ biliniyorsa yenilemeyi dene.
          if (broken && broken.source) {
            try {
              setHeavyLoading(true);
              void recordDiagnostic('catalog', 'PLAYLIST_SELF_REPAIR_START', { playlistId: id, source: broken.source, mode: 'fallback' }, { traceId, stage: 'catalogRecovery', outcome: 'started' });
              void recordFlightRecorderStage(traceId, 'catalogRecovery', { playlistId: id, mode: 'fallback' }, 'started');
              const { refreshPlaylistContent } = await import('@/src/utils/refreshPlaylist');
              const res = await refreshPlaylistContent(broken as any);
              if (activeSwitchGeneration.current !== generation) return;
              if (res?.ok && res.patch) {
                await updatePlaylist(id, res.patch as any);
                try { verifiedSummary = await KizilkanNativeCore.warmPlaylist(id); } catch { verifiedSummary = null as any; }
                if (verifiedSummary?.roomIndexed) {
                  void recordDiagnostic('catalog', 'PLAYLIST_SELF_REPAIR_OK', { playlistId: id, mode: 'fallback' });
                  setRepairFailedId(null);
                } else { setRepairFailedId(id); throw new Error('Playlist Room indeksi onarım sonrasında da oluşturulamadı.'); }
              } else {
                if (res?.patch) await updatePlaylist(id, res.patch as any);
                void recordDiagnostic('catalog', 'PLAYLIST_SELF_REPAIR_FAILED', { playlistId: id, mode: 'fallback', message: String(res?.message || '') });
                setRepairFailedId(id); throw new Error(String(res?.message || 'Playlist otomatik onarımı başarısız.'));
              }
            } catch (err2: any) {
              void recordDiagnostic('catalog', 'PLAYLIST_SELF_REPAIR_ERROR', { playlistId: id, mode: 'fallback', error: String(err2?.message || err2) });
              setRepairFailedId(id); throw err2 instanceof Error ? err2 : new Error(String(err2 || 'Playlist otomatik onarım hatası.'));
            } finally { setHeavyLoading(false); }
          } else {
            setRepairFailedId(id);
            throw new Error('Playlist kaynağı bulunamadığı için otomatik onarım yapılamadı.');
          }
        }
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
  }, [activeId, persistMeta]);
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
        loadedProfileId, nativeSummary, ensureHeavyLoaded,
        addPlaylist, addPreparedPlaylist, enrichPlaylistMedia, removePlaylist, updatePlaylist, setActivePlaylist,
        toggleFavorite, isFavorite, addToRecent, clearRecent,
        heavyLoading, repairFailedId,
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
