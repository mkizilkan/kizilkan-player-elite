/** Per-profile storage retains every playlist; the public API exposes current-list raw IDs. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { storage } from "@/src/utils/storage";
import { useProfiles } from "./ProfileContext";
import { usePlaylists } from "./PlaylistContext";
import { isLocalMediaId, saveLocalProgressChecked } from "@/src/utils/localMedia";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import { subscribeProfileDataReload, registerProfileDataDrain } from "@/src/utils/profileDataReload";
import { isCatalogRestoreActive } from "@/src/utils/catalogOperations";
import { claimLibraryLegacyOwner } from "@/src/utils/libraryLegacyOwner";
import { clearScopedLibraryMap, libraryItemKey, libraryScopedIds, libraryScopedMap, removeScopedLibraryId, removeScopedLibraryItem, trimScopedLibraryIds, trimScopedLibraryMap } from "@/src/utils/libraryScope";

const PROG_KEY = "kizilkan.progress.";
const WL_KEY = "kizilkan.watchlist.";
const SH_KEY = "kizilkan.searchHistory.";
const HID_ITEM_KEY = "kizilkan.hiddenItems.";
const HID_GROUP_KEY = "kizilkan.hiddenGroups.";
const WATCHED_KEY = "kizilkan.watched.";
const SERIES_LAST_KEY = "kizilkan.seriesLast.";
const LEGACY_OWNER_KEY = "kizilkan.libraryLegacyOwner.";
const MAX_SEARCH = 20;
const WATCHED_RATIO = 0.9;
const WATCHED_MAX = 20000;
export type SeriesLast = { season: string | number; episode: string | number; title?: string; episodeId: string; at: number };
export interface WatchProgress {
  current: number;
  duration: number;
  updatedAt: number;
  kind: "vod" | "series" | "live";
  name?: string;
  poster?: string | null;
  group?: string;
}
interface LibraryContextValue {
  watchProgress: Record<string, WatchProgress>;
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
type LibraryData = {
  progress: Record<string, WatchProgress>;
  watched: Record<string, number>;
  seriesLast: Record<string, SeriesLast>;
  watchlist: string[];
  searches: string[];
  hiddenItems: string[];
  hiddenGroups: string[];
  legacyOwner: string | null;
};
type Scope = { profileId: string; playlistId: string; stamp: string; token: number };
type Loaded = { token: number; data: LibraryData };
const FIELD_KEYS = { progress: PROG_KEY, watched: WATCHED_KEY, seriesLast: SERIES_LAST_KEY, watchlist: WL_KEY, searches: SH_KEY, hiddenItems: HID_ITEM_KEY, hiddenGroups: HID_GROUP_KEY } as const;
type PersistedField = keyof typeof FIELD_KEYS;
const emptyData = (): LibraryData => ({ progress: {}, watched: {}, seriesLast: {}, watchlist: [], searches: [], hiddenItems: [], hiddenGroups: [], legacyOwner: null });
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const optionalText = (value: unknown) => value === undefined || typeof value === "string";
const seriesNumber = (value: unknown) => typeof value === "string" || finiteNumber(value);
function validProgress(value: unknown): value is WatchProgress {
  return isRecord(value) && finiteNumber(value.current) && finiteNumber(value.duration) && finiteNumber(value.updatedAt)
    && typeof value.kind === "string" && ["vod", "series", "live"].includes(value.kind) && optionalText(value.name) && optionalText(value.group)
    && (value.poster === null || optionalText(value.poster));
}
function validSeriesLast(value: unknown): value is SeriesLast {
  return isRecord(value) && typeof value.episodeId === "string" && seriesNumber(value.season) && seriesNumber(value.episode)
    && finiteNumber(value.at) && optionalText(value.title);
}
function parseMap<T>(raw: string | null, validEntry: (value: unknown) => value is T): Record<string, T> {
  let data:unknown;try{data=raw?JSON.parse(raw):{};}catch{throw new Error('Kütüphane kaydı bozuk; mevcut kayıt korunuyor.');}
  if(!isRecord(data)||Object.values(data).some(value=>!validEntry(value)))throw new Error('Kütüphane kaydının biçimi geçersiz; mevcut kayıt korunuyor.');
  return data as Record<string,T>;
}
function parseIds(raw: string | null): string[] {
  let data:unknown;try{data=raw?JSON.parse(raw):[];}catch{throw new Error('Kütüphane listesi bozuk; mevcut kayıt korunuyor.');}
  if(!Array.isArray(data)||data.some(id=>typeof id!=='string'))throw new Error('Kütüphane listesinin biçimi geçersiz; mevcut kayıt korunuyor.');
  return data;
}
const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile } = useProfiles();
  const { activePlaylist } = usePlaylists();
  const profileId = activeProfile?.id || "default";
  const playlistId = activePlaylist?.id || "";
  const [reloadRevision, setReloadRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<Loaded | null>(null);
  const [unlockedToken, setUnlockedToken] = useState<number | null>(null);
  const scopeRef = useRef<Scope>({ profileId, playlistId, stamp: "", token: 0 });
  const loadedRef = useRef<Loaded | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const mountedRef = useRef(true);
  const stamp = JSON.stringify([profileId, playlistId, reloadRevision]);
  if (scopeRef.current.stamp !== stamp) scopeRef.current = { profileId, playlistId, stamp, token: scopeRef.current.token + 1 };
  // Capture the scope in each callback. A retained player callback cannot target a later list.
  const scope = scopeRef.current;
  const ownsScope = useCallback((captured: Scope) => mountedRef.current && scopeRef.current.token === captured.token, []);
  const serialize = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const task = queueRef.current.catch(() => undefined).then(work);
    queueRef.current = task.then(() => undefined, () => undefined);
    return task;
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = subscribeProfileDataReload(() => {
      // Invalidate in the bus callback, before React schedules the next render.
      scopeRef.current = { ...scopeRef.current, token: scopeRef.current.token + 1 };
      setUnlockedToken(null);
      setReloadRevision(value => value + 1);
    });
    const unregister = registerProfileDataDrain(() => queueRef.current);
    return () => { mountedRef.current = false; unsubscribe(); unregister(); };
  }, []);

  useEffect(() => {
    setUnlockedToken(null);
    void serialize(async () => {
      if (!ownsScope(scope) || isCatalogRestoreActive()) return;
      const [p, wl, sh, hi, hg, wd, sl, owner] = await Promise.all([
        storage.getItemStrict<string>(PROG_KEY + profileId, ""), storage.getItemStrict<string>(WL_KEY + profileId, ""),
        storage.getItemStrict<string>(SH_KEY + profileId, ""), storage.getItemStrict<string>(HID_ITEM_KEY + profileId, ""),
        storage.getItemStrict<string>(HID_GROUP_KEY + profileId, ""), storage.getItemStrict<string>(WATCHED_KEY + profileId, ""),
        storage.getItemStrict<string>(SERIES_LAST_KEY + profileId, ""), storage.getItemStrict<string>(LEGACY_OWNER_KEY + profileId, ""),
      ]);
      if (!ownsScope(scope) || isCatalogRestoreActive()) return;
      const data: LibraryData = { progress: parseMap(p, validProgress), watched: parseMap(wd, finiteNumber), seriesLast: parseMap(sl, validSeriesLast), watchlist: parseIds(wl), searches: parseIds(sh), hiddenItems: parseIds(hi), hiddenGroups: parseIds(hg), legacyOwner: typeof owner === "string" && owner ? owner : null };
      if (!data.legacyOwner && playlistId) {
        data.legacyOwner = await claimLibraryLegacyOwner(profileId, playlistId);
      }
      if (!ownsScope(scope) || isCatalogRestoreActive()) return;
      // Source records are removed only after the destination write succeeds.
      let migrated = 0;
      for (const id of Object.keys(data.progress).filter(isLocalMediaId)) {
        if (!ownsScope(scope) || isCatalogRestoreActive()) return;
        const entry = data.progress[id];
        if (!entry || !(Number(entry.duration) > 0)) continue;
        try {
          await saveLocalProgressChecked(id, Number(entry.current || 0), Number(entry.duration));
          if (!ownsScope(scope) || isCatalogRestoreActive()) return;
          delete data.progress[id]; migrated++;
        } catch (error) {
          void recordDiagnostic("import", "LOCAL_PROGRESS_MIGRATION_FAILED", { id, error: String(error) }, { stage: "local-media", outcome: "failed" });
        }
      }
      if (migrated) {
        if (!(await storage.setItem(PROG_KEY + profileId, JSON.stringify(data.progress)))) throw new Error("Taşınan ilerleme kayıtları kaydedilemedi.");
        void recordDiagnostic("import", "LOCAL_PROGRESS_MIGRATED", { count: migrated }, { stage: "local-media", outcome: "success" });
      }
      if (!ownsScope(scope) || isCatalogRestoreActive()) return;
      const loaded = { token: scope.token, data }; loadedRef.current = loaded; setSnapshot(loaded);
    }).catch(error => {
      if (!ownsScope(scope)) return;
      void recordDiagnostic("import", "LIBRARY_LOAD_FAILED", { profileId, error: String(error) }, { stage: "library", outcome: "failed" });
    });
  }, [stamp, ownsScope, serialize]);

  const mutate = useCallback((work: (data: LibraryData, commit: <K extends PersistedField>(field: K, value: LibraryData[K]) => Promise<void>) => Promise<void>, needsList = true): Promise<void> => {
    if (!ownsScope(scope)) return Promise.resolve();
    if (isCatalogRestoreActive()) return Promise.reject(new Error("Yedek geri yüklenirken kütüphane değiştirilemez."));
    return serialize(async () => {
      if (!ownsScope(scope)) return;
      if (isCatalogRestoreActive()) throw new Error("Yedek geri yüklenirken kütüphane değiştirilemez.");
      const loaded = loadedRef.current;
      if (!loaded || loaded.token !== scope.token) throw new Error("Kütüphane henüz yüklenmedi.");
      if (needsList && !scope.playlistId) throw new Error("Önce bir playlist seçin.");
      let data = loaded.data;
      const commit = async <K extends PersistedField>(field: K, value: LibraryData[K]) => {
        if (!ownsScope(scope)) return;
        if (!(await storage.setItem(FIELD_KEYS[field] + scope.profileId, JSON.stringify(value)))) throw new Error("Kütüphane kaydı yazılamadı: " + field);
        data = { ...data, [field]: value };
        if (ownsScope(scope)) { const next = { token: scope.token, data }; loadedRef.current = next; setSnapshot(next); }
      };
      await work(data, commit);
    });
  }, [stamp, ownsScope, serialize]);

  const setWatched = useCallback((id: string, on: boolean) => mutate(async (data, commit) => {
    if (!id) return;
    const visible = libraryScopedMap(data.watched, playlistId, data.legacyOwner);
    if (on ? !visible[id] : !!visible[id]) {
      const next = on ? { ...data.watched, [libraryItemKey(playlistId, id)]: Date.now() } : removeScopedLibraryItem(data.watched, playlistId, id, data.legacyOwner);
      await commit("watched", trimScopedLibraryMap(next, playlistId, WATCHED_MAX, value => Number(value || 0)));
    }
    if (on && libraryScopedMap(data.progress, playlistId, data.legacyOwner)[id]) await commit("progress", removeScopedLibraryItem(data.progress, playlistId, id, data.legacyOwner));
  }), [mutate, playlistId]);
  const setSeriesLast = useCallback((seriesId: string, value: Omit<SeriesLast, "at">) => {
    if (!seriesId) return;
    void mutate(async (data, commit) => {
      await commit("seriesLast", trimScopedLibraryMap({ ...data.seriesLast, [libraryItemKey(playlistId, seriesId)]: { ...value, at: Date.now() } }, playlistId, 3000, entry => Number(entry.at || 0)));
    }).catch(error => { void recordDiagnostic("import", "LIBRARY_WRITE_FAILED", { field: "seriesLast", error: String(error) }, { stage: "library", outcome: "failed" }); });
  }, [mutate, playlistId]);
  const setProgress = useCallback((id: string, value: Omit<WatchProgress, "updatedAt">) => mutate(async (data, commit) => {
    if (!id) return;
    if (isLocalMediaId(id)) { await saveLocalProgressChecked(id, value.current, value.duration); return; }
    const markWatched = async (itemId: string, on: boolean) => {
      if (on && !libraryScopedMap(data.watched, playlistId, data.legacyOwner)[itemId]) await commit("watched", trimScopedLibraryMap({ ...data.watched, [libraryItemKey(playlistId, itemId)]: Date.now() }, playlistId, WATCHED_MAX, entry => Number(entry || 0)));
    };
    if (value.kind !== "live" && value.duration > 0 && value.current / value.duration >= WATCHED_RATIO) await markWatched(id, true);
    const next = value.duration > 0 && value.current > 0 && value.current / value.duration > 0.95
      ? removeScopedLibraryItem(data.progress, playlistId, id, data.legacyOwner)
      : { ...data.progress, [libraryItemKey(playlistId, id)]: { ...value, updatedAt: Date.now() } };
    await commit("progress", next);
  }), [mutate, playlistId]);
  const clearProgress = useCallback((id: string) => mutate(async (data, commit) => { await commit("progress", removeScopedLibraryItem(data.progress, playlistId, id, data.legacyOwner)); }), [mutate, playlistId]);
  const clearAllProgress = useCallback(() => mutate(async (data, commit) => { await commit("progress", clearScopedLibraryMap(data.progress, playlistId, data.legacyOwner)); }), [mutate, playlistId]);
  const toggleWatchlist = useCallback((id: string) => mutate(async (data, commit) => {
    if (!id) return;
    const next = libraryScopedIds(data.watchlist, playlistId, data.legacyOwner).includes(id)
      ? removeScopedLibraryId(data.watchlist, playlistId, id, data.legacyOwner)
      : [libraryItemKey(playlistId, id), ...data.watchlist];
    await commit("watchlist", trimScopedLibraryIds(next, playlistId, 500));
  }), [mutate, playlistId]);
  const pushSearch = useCallback((query: string) => mutate(async (data, commit) => {
    const text = query.trim(); if (!text) return;
    await commit("searches", [text, ...data.searches.filter(value => value.toLowerCase() !== text.toLowerCase())].slice(0, MAX_SEARCH));
  }, false), [mutate]);
  const clearSearchHistory = useCallback(() => mutate(async (_data, commit) => { await commit("searches", []); }, false), [mutate]);
  const toggleHiddenItem = useCallback((id: string) => mutate(async (data, commit) => {
    if (!id) return;
    const next = libraryScopedIds(data.hiddenItems, playlistId, data.legacyOwner).includes(id) ? removeScopedLibraryId(data.hiddenItems, playlistId, id, data.legacyOwner) : [...data.hiddenItems, libraryItemKey(playlistId, id)];
    await commit("hiddenItems", next);
  }), [mutate, playlistId]);
  const toggleHiddenGroup = useCallback((group: string) => mutate(async (data, commit) => {
    if (!group) return;
    const next = libraryScopedIds(data.hiddenGroups, playlistId, data.legacyOwner).includes(group) ? removeScopedLibraryId(data.hiddenGroups, playlistId, group, data.legacyOwner) : [...data.hiddenGroups, libraryItemKey(playlistId, group)];
    await commit("hiddenGroups", next);
  }), [mutate, playlistId]);

  const data = snapshot?.token === scope.token ? snapshot.data : emptyData();
  const watchProgress = useMemo(() => Object.fromEntries(Object.entries(libraryScopedMap(data.progress, playlistId, data.legacyOwner)).filter(([id]) => !isLocalMediaId(id))), [data.progress, playlistId, data.legacyOwner]);
  const watched = useMemo(() => libraryScopedMap(data.watched, playlistId, data.legacyOwner), [data.watched, playlistId, data.legacyOwner]);
  const seriesLast = useMemo(() => libraryScopedMap(data.seriesLast, playlistId, data.legacyOwner), [data.seriesLast, playlistId, data.legacyOwner]);
  const watchlist = useMemo(() => libraryScopedIds(data.watchlist, playlistId, data.legacyOwner), [data.watchlist, playlistId, data.legacyOwner]);
  const hiddenItems = useMemo(() => libraryScopedIds(data.hiddenItems, playlistId, data.legacyOwner), [data.hiddenItems, playlistId, data.legacyOwner]);
  const hiddenGroups = useMemo(() => libraryScopedIds(data.hiddenGroups, playlistId, data.legacyOwner), [data.hiddenGroups, playlistId, data.legacyOwner]);
  const hiddenItemSet = useMemo(() => new Set(hiddenItems), [hiddenItems]);
  const hiddenGroupSet = useMemo(() => new Set(hiddenGroups), [hiddenGroups]);
  const isWatched = useCallback((id: string) => !!watched[id], [watched]);
  const inWatchlist = useCallback((id: string) => watchlist.includes(id), [watchlist]);
  const isItemHidden = useCallback((id: string) => hiddenItemSet.has(id), [hiddenItemSet]);
  const isGroupHidden = useCallback((group: string) => hiddenGroupSet.has(group), [hiddenGroupSet]);
  const unlockHiddenSession = useCallback(() => { if (ownsScope(scope)) setUnlockedToken(scope.token); }, [stamp, ownsScope]);
  const lockHiddenSession = useCallback(() => setUnlockedToken(null), []);
  const hiddenModeUnlocked = unlockedToken === scope.token;
  return <LibraryContext.Provider value={{
    watchProgress, watched, isWatched, setWatched, seriesLast, setSeriesLast, watchlist, searchHistory: data.searches, hiddenItems, hiddenGroups, hiddenModeUnlocked,
    setProgress, clearProgress, clearAllProgress, toggleWatchlist, inWatchlist, pushSearch, clearSearchHistory, toggleHiddenItem, isItemHidden, toggleHiddenGroup, isGroupHidden,
    unlockHiddenSession, lockHiddenSession,
  }}>{children}</LibraryContext.Provider>;
}
export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
