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

const PROG_KEY = "kizilkan.progress.";
const WL_KEY = "kizilkan.watchlist.";
const SH_KEY = "kizilkan.searchHistory.";
const HID_ITEM_KEY = "kizilkan.hiddenItems.";
const HID_GROUP_KEY = "kizilkan.hiddenGroups.";
const MAX_SEARCH = 20;

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
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([]);
  const [hiddenModeUnlocked, setHiddenModeUnlocked] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, wl, sh, hi, hg] = await Promise.all([
        storage.getItem<string>(PROG_KEY + profileId, ""),
        storage.getItem<string>(WL_KEY + profileId, ""),
        storage.getItem<string>(SH_KEY + profileId, ""),
        storage.getItem<string>(HID_ITEM_KEY + profileId, ""),
        storage.getItem<string>(HID_GROUP_KEY + profileId, ""),
      ]);
      try { setWatchProgress(p ? JSON.parse(p) : {}); } catch { setWatchProgress({}); }
      try { setWatchlist(wl ? JSON.parse(wl) : []); } catch { setWatchlist([]); }
      try { setSearchHistory(sh ? JSON.parse(sh) : []); } catch { setSearchHistory([]); }
      try { setHiddenItems(hi ? JSON.parse(hi) : []); } catch { setHiddenItems([]); }
      try { setHiddenGroups(hg ? JSON.parse(hg) : []); } catch { setHiddenGroups([]); }
      setHiddenModeUnlocked(false);
    })();
  }, [profileId]);

  const setProgress = useCallback(async (id: string, data: Omit<WatchProgress, "updatedAt">) => {
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
      watchProgress, watchlist, searchHistory, hiddenItems, hiddenGroups, hiddenModeUnlocked,
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
