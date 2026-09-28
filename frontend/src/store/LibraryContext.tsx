/**
 * LibraryContext — extra per-profile library state that PlaylistContext
 * does not own:
 *   • watchProgress : { [itemId]: { current, duration, updatedAt, kind } }
 *   • watchlist     : string[]  (item IDs the user wants to watch later)
 *   • searchHistory : string[]  (recent search terms)
 *   • hiddenItems   : string[]  (item IDs completely hidden until PIN)
 *   • hiddenGroups  : string[]  (group names completely hidden until PIN)
 *
 * The Parental context already stores lockedCategories (require PIN but shown).
 * Hidden items are STRICTER: they don't appear in lists at all until unlocked.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { storage } from "@/src/utils/storage";
import { useProfiles } from "./ProfileContext";
import { isLocalMediaId, saveLocalProgress } from "@/src/utils/localMedia";
import { recordDiagnostic } from "@/src/utils/diagnostics";

const PROG_KEY = "kizilkan.progress.";
const WL_KEY = "kizilkan.watchlist.";
const SH_KEY = "kizilkan.searchHistory.";
const HID_ITEM_KEY = "kizilkan.hiddenItems.";
const HID_GROUP_KEY = "kizilkan.hiddenGroups.";
const MAX_SEARCH = 20;
/**
 * v18.6.0 — İZLENENLER. Eskiden %95'i geçen içeriğin ilerleme kaydı SİLİNİYORDU ve
 * "izlendi" bilgisi hiç tutulmuyordu; kullanıcı hangi bölümü/filmi bitirdiğini göremiyordu.
 * Artık %90'ı geçen film/bölüm kalıcı olarak "izlendi" işaretlenir (profil başına);
 * elle işaretleme/kaldırma da yapılabilir. İlerleme silme davranışı AYNEN korunur.
 */
const WATCHED_KEY = "kizilkan.watched.";
const WATCHED_RATIO = 0.9;
const WATCHED_MAX = 20000;
/** v18.6.0: dizi başına son açılan bölüm (afişte "S2·B5" — hangi bölümde kaldın). */
const SERIES_LAST_KEY = "kizilkan.seriesLast.";
export type SeriesLast = { season: string | number; episode: string | number; title?: string; episodeId: string; at: number };

export interface WatchProgress {
  current: number;
  duration: number;
  updatedAt: number;
  kind: "vod" | "series" | "live";
  name?: string;
  poster?: string | null;
}

interface LibraryContextValue {
  watchProgress: Record<string, WatchProgress>;
  /** v18.6.0: id → izlenme zamanı (ms). */
  watched: Record<string, number>;
  isWatched: (id: string) => boolean;
  setWatched: (id: string, on: boolean) => Promise<void>;
  seriesLast: Record<string, SeriesLast>;
  setSeriesLast: (seriesId: string, v: Omit<SeriesLast, "at">) => void;
  watchlist: string[];
  searchHistory: string[];
  hiddenItems: string[];
  hiddenGroups: string[];
  hiddenModeUnlocked: boolean;
  setProgress: (id: string, data: Omit<WatchProgress, "updatedAt">) => Promise<void>;
  clearProgress: (id: string) => Promise<void>;
  clearAllProgress: () => Promise<void>;
  toggleWatchlist: (id: string) => Promise<void>;
  inWatchlist: (id: string) => boolean;
  pushSearch: (q: string) => Promise<void>;
  clearSearchHistory: () => Promise<void>;
  toggleHiddenItem: (id: string) => Promise<void>;
  isItemHidden: (id: string) => boolean;
  toggleHiddenGroup: (group: string) => Promise<void>;
  isGroupHidden: (group: string) => boolean;
  unlockHiddenSession: () => void;
  lockHiddenSession: () => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile } = useProfiles();
  const profileId = activeProfile?.id || "default";

  const [watchProgress, setWatchProgress] = useState<Record<string, WatchProgress>>({});
  const [watched, setWatchedMap] = useState<Record<string, number>>({});
  const [seriesLast, setSeriesLastMap] = useState<Record<string, SeriesLast>>({});
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([]);
  const [hiddenModeUnlocked, setHiddenModeUnlocked] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, wl, sh, hi, hg, wd, sl] = await Promise.all([
        storage.getItem<string>(PROG_KEY + profileId, ""),
        storage.getItem<string>(WL_KEY + profileId, ""),
        storage.getItem<string>(SH_KEY + profileId, ""),
        storage.getItem<string>(HID_ITEM_KEY + profileId, ""),
        storage.getItem<string>(HID_GROUP_KEY + profileId, ""),
        storage.getItem<string>(WATCHED_KEY + profileId, ""),
        storage.getItem<string>(SERIES_LAST_KEY + profileId, ""),
      ]);
      let progressMap: Record<string, WatchProgress> = {};
      try { progressMap = p ? JSON.parse(p) : {}; } catch { progressMap = {}; }
      /**
       * v18.2.0 — TEK SEFERLİK TAŞIMA: v18.1.0 öncesinde yerel dosyaların ilerlemesi
       * buraya film gibi yazılıyordu; "Devam Et" listesinde görünüp açılınca detay
       * ekranı dosyayı bulamıyordu. Bu kayıtlar yerel medyanın kendi deposuna
       * TAŞINIR (kaldığın yer kaybolmaz) ve buradan çıkarılır.
       */
      const localIds = Object.keys(progressMap).filter(isLocalMediaId);
      if (localIds.length) {
        for (const id of localIds) {
          const e = progressMap[id];
          if (e && e.duration > 0) await saveLocalProgress(id, Number(e.current || 0), Number(e.duration));
          delete progressMap[id];
        }
        await storage.setItem(PROG_KEY + profileId, JSON.stringify(progressMap));
        void recordDiagnostic("import", "LOCAL_PROGRESS_MIGRATED", { count: localIds.length }, { stage: "local-media", outcome: "success" });
      }
      setWatchProgress(progressMap);
      try { setWatchlist(wl ? JSON.parse(wl) : []); } catch { setWatchlist([]); }
      try { setSearchHistory(sh ? JSON.parse(sh) : []); } catch { setSearchHistory([]); }
      try { setHiddenItems(hi ? JSON.parse(hi) : []); } catch { setHiddenItems([]); }
      try { setHiddenGroups(hg ? JSON.parse(hg) : []); } catch { setHiddenGroups([]); }
      try { const w = wd ? JSON.parse(wd) : {}; setWatchedMap(w && typeof w === "object" ? w : {}); } catch { setWatchedMap({}); }
      try { const x = sl ? JSON.parse(sl) : {}; setSeriesLastMap(x && typeof x === "object" ? x : {}); } catch { setSeriesLastMap({}); }
      setHiddenModeUnlocked(false);
    })();
  }, [profileId]);

  const markWatched = useCallback((id: string, on: boolean) => {
    setWatchedMap(prev => {
      if (on ? !!prev[id] : !prev[id]) return prev;
      const next = { ...prev };
      if (on) next[id] = Date.now(); else delete next[id];
      const keys = Object.keys(next);
      if (keys.length > WATCHED_MAX) {
        keys.sort((a, b) => next[a] - next[b]).slice(0, keys.length - WATCHED_MAX).forEach(k => { delete next[k]; });
      }
      storage.setItem(WATCHED_KEY + profileId, JSON.stringify(next));
      return next;
    });
  }, [profileId]);

  const setWatched = useCallback(async (id: string, on: boolean) => {
    markWatched(id, on);
    if (on) {
      // Elle "izlendi" → yarım ilerleme de temizlenir (Devam Et listesinden düşer).
      setWatchProgress(prev => {
        if (!prev[id]) return prev;
        const next = { ...prev }; delete next[id];
        storage.setItem(PROG_KEY + profileId, JSON.stringify(next));
        return next;
      });
    }
  }, [markWatched, profileId]);

  const isWatched = useCallback((id: string) => !!watched[id], [watched]);

  const setSeriesLast = useCallback((seriesId: string, v: Omit<SeriesLast, "at">) => {
    if (!seriesId) return;
    setSeriesLastMap(prev => {
      const next = { ...prev, [seriesId]: { ...v, at: Date.now() } };
      const keys = Object.keys(next);
      if (keys.length > 3000) keys.sort((a, b) => next[a].at - next[b].at).slice(0, keys.length - 3000).forEach(k => { delete next[k]; });
      storage.setItem(SERIES_LAST_KEY + profileId, JSON.stringify(next));
      return next;
    });
  }, [profileId]);

  const setProgress = useCallback(async (id: string, data: Omit<WatchProgress, "updatedAt">) => {
    // v18.6.0: %90 → izlendi (kalıcı). Canlı yayın hariç.
    if (data.kind !== "live" && data.duration > 0 && data.current / data.duration >= WATCHED_RATIO) markWatched(id, true);
    // Skip storing meaningless progress
    if (data.duration > 0 && data.current > 0 && data.current / data.duration > 0.95) {
      // finished — remove
      setWatchProgress(prev => {
        const next = { ...prev };
        delete next[id];
        storage.setItem(PROG_KEY + profileId, JSON.stringify(next));
        return next;
      });
      return;
    }
    setWatchProgress(prev => {
      const next = { ...prev, [id]: { ...data, updatedAt: Date.now() } };
      storage.setItem(PROG_KEY + profileId, JSON.stringify(next));
      return next;
    });
  }, [profileId]);

  const clearProgress = useCallback(async (id: string) => {
    setWatchProgress(prev => {
      const next = { ...prev };
      delete next[id];
      storage.setItem(PROG_KEY + profileId, JSON.stringify(next));
      return next;
    });
  }, [profileId]);

  const clearAllProgress = useCallback(async () => {
    setWatchProgress({});
    await storage.setItem(PROG_KEY + profileId, JSON.stringify({}));
  }, [profileId]);

  const toggleWatchlist = useCallback(async (id: string) => {
    setWatchlist(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [id, ...prev].slice(0, 500);
      storage.setItem(WL_KEY + profileId, JSON.stringify(next));
      return next;
    });
  }, [profileId]);

  const inWatchlist = useCallback((id: string) => watchlist.includes(id), [watchlist]);

  const pushSearch = useCallback(async (q: string) => {
    const t = q.trim();
    if (!t) return;
    setSearchHistory(prev => {
      const next = [t, ...prev.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_SEARCH);
      storage.setItem(SH_KEY + profileId, JSON.stringify(next));
      return next;
    });
  }, [profileId]);

  const clearSearchHistory = useCallback(async () => {
    setSearchHistory([]);
    await storage.setItem(SH_KEY + profileId, JSON.stringify([]));
  }, [profileId]);

  const toggleHiddenItem = useCallback(async (id: string) => {
    setHiddenItems(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      storage.setItem(HID_ITEM_KEY + profileId, JSON.stringify(next));
      return next;
    });
  }, [profileId]);

  /**
   * PERFORMANS (v9.2.0 — kullanıcı bildirimi: arama/sekme geç tepki veriyor)
   * .includes() bir DİZİ TARAMASIDIR. 40.000+ öğelik listeleri süzerken her
   * öğe için baştan sona tarama yapılıyordu (O(n×m)) — arama ve sekme geçişi
   * bu yüzden donuyordu.
   * Set kullanımıyla arama sabit zamanlı hale geldi.
   */
  const hiddenItemSet = useMemo(() => new Set(hiddenItems), [hiddenItems]);
  const isItemHidden = useCallback((id: string) => hiddenItemSet.has(id), [hiddenItemSet]);

  const toggleHiddenGroup = useCallback(async (group: string) => {
    setHiddenGroups(prev => {
      const next = prev.includes(group) ? prev.filter(x => x !== group) : [...prev, group];
      storage.setItem(HID_GROUP_KEY + profileId, JSON.stringify(next));
      return next;
    });
  }, [profileId]);

  const hiddenGroupSet = useMemo(() => new Set(hiddenGroups), [hiddenGroups]);
  const isGroupHidden = useCallback((group: string) => hiddenGroupSet.has(group), [hiddenGroupSet]);

  const unlockHiddenSession = useCallback(() => setHiddenModeUnlocked(true), []);
  const lockHiddenSession = useCallback(() => setHiddenModeUnlocked(false), []);

  return (
    <LibraryContext.Provider value={{
      watchProgress, watched, isWatched, setWatched, seriesLast, setSeriesLast, watchlist, searchHistory, hiddenItems, hiddenGroups, hiddenModeUnlocked,
      setProgress, clearProgress, clearAllProgress,
      toggleWatchlist, inWatchlist,
      pushSearch, clearSearchHistory,
      toggleHiddenItem, isItemHidden,
      toggleHiddenGroup, isGroupHidden,
      unlockHiddenSession, lockHiddenSession,
    }}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
