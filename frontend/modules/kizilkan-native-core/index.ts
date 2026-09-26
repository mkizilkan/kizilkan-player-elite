import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

export type NativePlaylistSummary = {
  id?: string;
  bytes?: number;
  parseMs?: number;
  importMs?: number;
  channels?: number;
  vod?: number;
  series?: number;
  roomIndexed?: boolean;
  cacheHit?: boolean;
};



export type NativeIncrementalSyncResult = {
  summary: NativePlaylistSummary | null;
  changedKinds: Array<"live" | "vod" | "series">;
  skippedKinds: Array<"live" | "vod" | "series">;
  repairedKinds?: Array<"live" | "vod" | "series">;
  fingerprints: { live?: string; vod?: string; series?: string };
  roomVerified: boolean;
  snapshotRecovered?: boolean;
  snapshotRecoveryState?: string;
  elapsedMs?: number;
};

export type DatabaseHealth = {
  schemaVersion?: number;
  status?: "healthy" | "attention" | "critical" | string;
  healthReasons?: string[]; recommendedMaintenance?: "none" | "diagnose" | "quick" | "normal" | "deep" | string; integrityChecked?: boolean;
  databaseBytes?: number; walBytes?: number; shmBytes?: number; totalBytes?: number;
  pageCount?: number; pageSize?: number; freelistCount?: number; reclaimableBytes?: number; reclaimablePercent?: number;
  journalMode?: string; snapshotCount?: number; mediaCount?: number; epgCount?: number; diagnosticEventCount?: number; criticalDiagnosticEventCount?: number;
  mediaOrphans?: number; epgOrphans?: number; expiredEpgCandidates?: number; expiredNormalTelemetryCandidates?: number; expiredCriticalTelemetryCandidates?: number;
  quickCheck?: string; foreignKeyViolations?: number; measuredAtEpochMs?: number; playlists?: Array<Record<string, any>>;
};


export type PlaylistContentCleanupPreview = {
  playlistId: string; live: number; vod: number; series: number; epg: number; catalogTotal: number; totalSelectedCapable: number; playlistPreserved: boolean; userDataPreserved: boolean;
};

export type PlaylistContentCleanupResult = {
  cleanedKinds?:Array<"live"|"vod"|"series"|"epg">;
  playlistId: string; deletedLive: number; deletedVod: number; deletedSeries: number; deletedEpg: number; deletedTotal: number; snapshotInvalidated: number; playlistPreserved: boolean; userDataPreserved: boolean; before?: PlaylistContentCleanupPreview; after?: PlaylistContentCleanupPreview;
};

export type DatabaseMaintenanceResult = {
  mode: "diagnose" | "quick" | "normal" | "deep" | string;
  operationId?: string; changed?: boolean; durationMs?: number; reclaimedTotalBytes?: number; totalBytesDelta?: number; vacuumRan?: boolean; optimizeRan?: boolean;
  removedMediaOrphans?: number; removedEpgOrphans?: number; removedExpiredEpg?: number; removedNormalTelemetry?: number; removedCriticalTelemetry?: number;
  checkpoint?: Record<string, any>; before?: DatabaseHealth; after?: DatabaseHealth;
};

/** v18.1.0 — yerel medya (SAF) liste öğesi. */
export type LocalMediaEntry = {
  uri: string;
  name: string;
  kind: "dir" | "video" | "audio";
  mime: string;
  ext: string;
  size: number;
  modified: number;
};
export type LocalMediaListing = { ok: boolean; entries: LocalMediaEntry[]; total?: number; skipped?: number; elapsedMs: number; error?: string };
export type LocalMediaInfo = {
  ok: boolean; durationMs?: number; hasVideo?: boolean; hasAudio?: boolean; title?: string; artist?: string; album?: string;
  width?: number; height?: number; bitrate?: number; artPath?: string; elapsedMs?: number; error?: string;
};

export type NativeQueryPage<T = any> = {
  items: T[];
  offset: number;
  returned: number;
  total: number;
  hasMore: boolean;
};

let native: any = null;
try {
  if (Platform.OS === "android") native = requireOptionalNativeModule("KizilkanNativeCore");
} catch {}

export const KizilkanNativeCore = {
  available: !!native,
  magExactRequest: async (url: string, headers: Record<string,string>, timeoutMs = 20000): Promise<Record<string, any> | null> => native ? native.magExactRequest(url, JSON.stringify(headers), timeoutMs) : null,
  /**
   * v17.6.0 — Aktif iş etiketini native ANR gözcüsüne bildirir.
   * Kilitlenme yakalandığında kayda bu etiket yazılır; böylece "o an ne
   * yapılıyordu" sorusu yanıtlanabilir. Yalnız ETİKET gönderilir.
   * Senkron ve hataya dayanıklı: başarısız olursa akış etkilenmez.
   */
  setDiagnosticTask: (label: string): void => {
    try { native?.setDiagnosticTask?.(String(label || "idle")); } catch { /* yok say */ }
  },

  warmPlaylist: async (id: string): Promise<NativePlaylistSummary | null> => native ? native.warmPlaylist(id) : null,
  importPlaylistHeavyJson: async (id: string, json: string): Promise<NativePlaylistSummary | null> => native ? native.importPlaylistHeavyJson(id, json) : null,
  replacePlaylistKindJson: async (id: string, kind: "live" | "vod" | "series", jsonArray: string): Promise<NativePlaylistSummary | null> => native ? native.replacePlaylistKindJson(id, kind, jsonArray) : null,
  /**
   * v17.9.9 — PARÇALI SENKRON (OOM önlemi)
   * -------------------------------------------------------------------------
   * Eskiden ÜÇ kind (live+vod+series) tek JSON.stringify ile birleştirilip
   * native'e veriliyordu; büyük katalogda (13K+ kanal) bu 75 MB'lık TEK blok
   * oluşturup OutOfMemoryError'a yol açıyordu (23.09 cihaz kaydı).
   *
   * Artık her kind AYRI JSON.stringify + AYRI native çağrısıyla gönderilir.
   * Böylece bellekte aynı anda en fazla bir kind'lık string bulunur (~1/3
   * boyut). Native taraf tek-kind (partial) payload'ı v17.9.9'dan beri güvenle
   * bootstrap eder. Sıra: live → vod → series (canlı önce, kullanıcı en çok
   * onu bekler). Son çağrının sonucu (birleşik snapshot + fingerprints) döner.
   *
   * NOT: Bir kind boşsa (dizi yok gibi) o çağrı atlanır. Hiç kind yoksa
   * eski tek-çağrı yolu (boş payload) korunur — native onu zaten reddeder.
   */
  syncPlaylistKindsJson: async (id: string, payload: Partial<Record<"live" | "vod" | "series", any[]>>, previousFingerprints: { live?: string; vod?: string; series?: string }): Promise<NativeIncrementalSyncResult | null> => {
    if (!native) return null;
    const prevJson = JSON.stringify(previousFingerprints || {});
    const kinds: Array<"live" | "vod" | "series"> = ["live", "vod", "series"];
    const present = kinds.filter(k => Array.isArray((payload as any)[k]));
    if (present.length <= 1) {
      // Tek kind veya boş: bölmenin faydası yok, tek çağrı (mevcut davranış).
      return native.syncPlaylistKindsJson(id, JSON.stringify(payload), prevJson);
    }
    /**
     * v17.10.3 — PARÇALI SONUÇLARIN BİRLEŞTİRİLMESİ (v17.9.9 hatasının düzeltmesi)
     * -----------------------------------------------------------------------
     * Native taraf changed/skipped/diff/fingerprint alanlarını YALNIZ o çağrıya
     * gelen kind'lar için doldurur (arrays.forEach). v17.9.9'da yalnız SON
     * çağrının sonucu döndürülüyordu; bu yüzden (25.09 cihaz kaydı):
     *  - fark raporunda canlı/film "0 → 0" görünüyordu (yalnız dizi vardı),
     *  - canlı/film parmak izi eski değerle (previous) saklanıyor, her
     *    yenilemede bu türler gereksiz yere baştan yazılıyordu.
     * Artık her çağrının KENDİ kind'ına ait alanları toplanır; summary son
     * çağrıdan alınır (native snapshot her çağrıda tüm sayıları taşır).
     */
    const merged: any = {
      summary: null, changedKinds: [], skippedKinds: [], repairedKinds: [],
      fingerprints: {}, roomVerified: true, snapshotRecovered: false,
      snapshotRecoveryState: "", elapsedMs: 0, diff: {},
    };
    for (const k of present) {
      // Her kind KENDİ payload nesnesiyle; tek seferde tek kind belleğe alınır.
      const single: any = {}; single[k] = (payload as any)[k];
      const singleJson = JSON.stringify(single);
      single[k] = null; // referansı bırak, GC serbest bıraksın
      const r: any = await native.syncPlaylistKindsJson(id, singleJson, prevJson);
      if (!r) return null;
      merged.summary = r.summary ?? merged.summary;
      for (const f of ["changedKinds", "skippedKinds", "repairedKinds"]) {
        for (const kind of (r[f] || [])) if (kind === k && !merged[f].includes(kind)) merged[f].push(kind);
      }
      // Parmak izi: yalnız bu çağrının kind'ı güvenilirdir (diğerleri "previous").
      if (r.fingerprints && r.fingerprints[k]) merged.fingerprints[k] = r.fingerprints[k];
      if (r.diff && r.diff[k]) merged.diff[k] = r.diff[k];
      merged.roomVerified = merged.roomVerified && r.roomVerified !== false;
      merged.snapshotRecovered = merged.snapshotRecovered || !!r.snapshotRecovered;
      if (r.snapshotRecoveryState) merged.snapshotRecoveryState = r.snapshotRecoveryState;
      merged.elapsedMs += Number(r.elapsedMs || 0);
    }
    // Payload'da olmayan kind'ların parmak izi önceki değeriyle korunur.
    for (const k of kinds) {
      if (!merged.fingerprints[k] && (previousFingerprints as any)?.[k]) merged.fingerprints[k] = (previousFingerprints as any)[k];
    }
    return merged as NativeIncrementalSyncResult;
  },
  beginChunkedPlaylistImport: async (id: string): Promise<boolean> => native ? !!(await native.beginChunkedPlaylistImport(id)) : false,
  appendPlaylistChunk: async (id: string, kind: "live" | "vod" | "series", jsonArray: string): Promise<number> => native ? Number(await native.appendPlaylistChunk(id, kind, jsonArray)) : 0,
  finishChunkedPlaylistImport: async (id: string): Promise<NativePlaylistSummary | null> => native ? native.finishChunkedPlaylistImport(id) : null,
  cancelChunkedPlaylistImport: async (id: string): Promise<boolean> => native ? !!(await native.cancelChunkedPlaylistImport(id)) : false,
  beginChunkedPlaylistKindReplace: async (id:string,kind:"live"|"vod"|"series"):Promise<boolean> => native ? !!(await native.beginChunkedPlaylistKindReplace(id,kind)) : false,
  appendPlaylistKindChunk: async (id:string,kind:"live"|"vod"|"series",jsonArray:string):Promise<number> => native ? Number(await native.appendPlaylistKindChunk(id,kind,jsonArray)) : 0,
  finishChunkedPlaylistKindReplace: async (id:string,kind:"live"|"vod"|"series"):Promise<NativePlaylistSummary|null> => native ? native.finishChunkedPlaylistKindReplace(id,kind) : null,
  cancelChunkedPlaylistKindReplace: async (id:string,kind:"live"|"vod"|"series"):Promise<boolean> => native ? !!(await native.cancelChunkedPlaylistKindReplace(id,kind)) : false,
  applyAtomicPlaylistRestore: async (sessionId: string, mappings: Array<{targetId:string; stageId:string|null}>): Promise<boolean> => native ? !!(await native.applyAtomicPlaylistRestore(sessionId, JSON.stringify(mappings))) : false,
  finalizeAtomicPlaylistRestore: async (sessionId: string, targetIds: string[]): Promise<boolean> => native ? !!(await native.finalizeAtomicPlaylistRestore(sessionId, JSON.stringify(targetIds))) : false,
  rollbackAtomicPlaylistRestore: async (sessionId: string, targetIds: string[]): Promise<boolean> => native ? !!(await native.rollbackAtomicPlaylistRestore(sessionId, JSON.stringify(targetIds))) : false,
  importM3uText: async (id: string, text: string): Promise<NativePlaylistSummary | null> => native ? native.importM3uText(id, text) : null,
  fetchAndImportM3u: async (id: string, url: string, userAgent = "VLC/3.0.20 LibVLC/3.0.20"): Promise<NativePlaylistSummary | null> => native ? native.fetchAndImportM3u(id, url, userAgent) : null,
  hasPlaylistIndex: async (id: string): Promise<boolean> => native ? !!(await native.hasPlaylistIndex(id)) : false,
  deleteLegacyPlaylistFile: async (id: string): Promise<boolean> => native ? !!(await native.deleteLegacyPlaylistFile(id)) : false,
  getStorageFootprint: async (): Promise<Record<string, any>> => native ? (await native.getStorageFootprint()) : {},
  getDatabaseHealth: async (includeIntegrity = false): Promise<DatabaseHealth> => native ? ((await native.getDatabaseHealth(!!includeIntegrity)) || {}) : {},
  getDatabaseHealthFast: async (): Promise<DatabaseHealth> => native ? ((await native.getDatabaseHealthFast?.()) || {}) : {},
  previewPlaylistContentCleanup: async (playlistId: string): Promise<PlaylistContentCleanupPreview | null> => native ? ((await native.previewPlaylistContentCleanup?.(playlistId)) || null) : null,
  executePlaylistContentCleanup: async (playlistId: string, opts: { live?:boolean; vod?:boolean; series?:boolean; epg?:boolean }): Promise<PlaylistContentCleanupResult | null> =>
    native ? ((await native.executePlaylistContentCleanup?.(playlistId, !!opts.live, !!opts.vod, !!opts.series, !!opts.epg)) || null) : null,
  previewPlaylistContentCleanupBatch:async(ids:string[]):Promise<Array<{ok:boolean;playlistId:string;preview?:PlaylistContentCleanupPreview;error?:string}>>=>native?native.previewPlaylistContentCleanupBatch(ids):[],
  executePlaylistContentCleanupBatch:async(ids:string[],opts:{live?:boolean;vod?:boolean;series?:boolean;epg?:boolean}):Promise<Array<{ok:boolean;playlistId:string;result?:PlaylistContentCleanupResult;error?:string}>>=>native?native.executePlaylistContentCleanupBatch(ids,!!opts.live,!!opts.vod,!!opts.series,!!opts.epg):[],
  runDatabaseMaintenance: async (mode: "diagnose" | "quick" | "normal" | "deep"): Promise<DatabaseMaintenanceResult> => native ? ((await native.runDatabaseMaintenance(mode)) || { mode }) : { mode, changed: false },
  getRuntimeMemory: (): Record<string, any> => native ? (native.getRuntimeMemory() || {}) : {},
  getLastExitInfo: (): Record<string, any> => native ? (native.getLastExitInfo?.() || {}) : {},
  getExitHistory: (maxNum = 5): Record<string, any>[] => native ? (native.getExitHistory?.(maxNum) || []) : [],
  initializeBlackBox: (): Record<string, any> => native ? (native.initializeBlackBox?.() || {}) : {},
  appendBlackBoxEvent: async (eventJson: string): Promise<boolean> => native ? !!(await native.appendBlackBoxEvent?.(eventJson)) : false,
  appendCriticalBlackBoxEvent: (eventJson: string): boolean => native ? !!native.appendCriticalBlackBoxEvent?.(eventJson) : false,
  getBlackBoxSnapshot: async (limit = 1500): Promise<Record<string, any>> => native ? ((await native.getBlackBoxSnapshot?.(limit)) || {}) : {},
  getBlackBoxHealth: async (): Promise<Record<string, any>> => native ? ((await native.getBlackBoxHealth?.()) || {}) : {},
  setBlackBoxCheckpoint: (summary: string): boolean => native ? !!native.setBlackBoxCheckpoint?.(summary) : false,
  clearBlackBox: async (): Promise<boolean> => native ? !!(await native.clearBlackBox?.()) : false,
  beginPlayerSession: (): number | null => native ? Number(native.beginPlayerSession()) : null,
  getPlayerSession: (): number | null => native ? Number(native.getPlayerSession()) : null,
  isPlayerSessionActive: (id: number): boolean => native ? !!native.isPlayerSessionActive(id) : false,
  invalidatePlayerSession: (id = 0): number | null => native ? Number(native.invalidatePlayerSession(id)) : null,
  startLiveTimeshift: async (sourceUrl: string, headers: Record<string,string> = {}, windowSeconds = 1800, maxBytes = 768 * 1024 * 1024): Promise<Record<string, any> | null> =>
    native ? native.startLiveTimeshift(sourceUrl, JSON.stringify(headers || {}), Math.floor(windowSeconds), Number(maxBytes)) : null,
  getLiveTimeshiftStatus: async (sessionId: string): Promise<Record<string, any> | null> => native ? native.getLiveTimeshiftStatus(sessionId) : null,
  stopLiveTimeshift: async (sessionId: string): Promise<boolean> => native ? !!(await native.stopLiveTimeshift(sessionId)) : false,
  stopAllLiveTimeshift: async (): Promise<number> => native ? Number(await native.stopAllLiveTimeshift()) : 0,
  /** v18.1.0: SAF klasörünün çocukları (yalnız klasör + ses/video) tek native sorguda. */
  listLocalMediaChildren: async (uri: string): Promise<LocalMediaListing | null> => {
    if (!native?.listLocalMediaChildrenJson) return null;
    const raw = await native.listLocalMediaChildrenJson(uri);
    try { return JSON.parse(String(raw || "{}")) as LocalMediaListing; } catch { return { ok: false, error: "JSON_PARSE", entries: [], elapsedMs: 0 }; }
  },
  /** v18.1.0: süre/etiket/kapak (kapak önbellekte JPEG yolu olarak döner). */
  getLocalMediaInfo: async (uri: string): Promise<LocalMediaInfo | null> =>
    native?.getLocalMediaInfo ? ((await native.getLocalMediaInfo(uri)) as LocalMediaInfo) : null,
  clearLocalMediaArtCache: async (): Promise<number> => native?.clearLocalMediaArtCache ? Number(await native.clearLocalMediaArtCache()) : 0,
  fetchAndCacheEpg: async (url: string, playlistId: string, userAgent: string): Promise<{count:number; native?:boolean} | null> => native ? native.fetchAndCacheEpg(url, playlistId, userAgent) : null,
  getEpgNowNext: async (playlistId: string, channelIds: string[], nowSec: number): Promise<Record<string, any>> => native ? native.getEpgNowNext(playlistId, channelIds, Math.floor(nowSec)) : {},
  getEpgChannelPrograms: async (playlistId: string, channelId: string): Promise<any[]> => native ? native.getEpgChannelPrograms(playlistId, channelId) : [],
  removeEpg: async (playlistId: string): Promise<boolean> => native ? !!(await native.removeEpg(playlistId)) : false,
  readPlaylistHeavy: async <T = any>(id: string): Promise<T | null> => native ? native.readPlaylistHeavy(id) : null,
  getPlaylistSummary: async (id: string): Promise<NativePlaylistSummary | null> => native ? native.getPlaylistSummary(id) : null,
  getCategories: async (id: string, kind: "live" | "vod" | "series") => native ? native.getCategories(id, kind) : [],
  queryItems: async <T = any>(id: string, kind: "live" | "vod" | "series", opts?: { group?: string; search?: string; offset?: number; limit?: number }): Promise<NativeQueryPage<T>> => {
    if (!native) return { items: [], offset: 0, returned: 0, total: 0, hasMore: false };
    return native.queryItems(id, kind, opts?.group || "__all__", opts?.search || "", opts?.offset || 0, opts?.limit || 80);
  },
  getItem: async <T = any>(id: string, kind: "live" | "vod" | "series", itemId: string): Promise<T | null> => native ? native.getItem(id, kind, itemId) : null,
  getItemsByIds: async <T = any>(id: string, kind: "live" | "vod" | "series", itemIds: string[]): Promise<T[]> => native ? (await native.getItemsByIds(id, kind, itemIds)) : [],
  getPlaybackNeighbors: async <T = any>(id: string, kind: "live" | "vod" | "series", itemId: string, opts?: { group?: string; search?: string; wrap?: boolean }): Promise<{ currentId:string; previous:T|null; next:T|null; position:number; total:number; found:boolean; elapsedMs?:number }> => native
    ? (await native.getPlaybackNeighbors(id, kind, itemId, opts?.group || "__all__", opts?.search || "", opts?.wrap !== false))
    : { currentId:itemId, previous:null, next:null, position:0, total:0, found:false },
  reindexPlaylist: async (id: string): Promise<NativePlaylistSummary | null> => native ? native.reindexPlaylist(id) : null,
  invalidatePlaylist: (id: string) => native ? native.invalidatePlaylist(id) : false,
  removePlaylistIndex: async (id: string) => native ? native.removePlaylistIndex(id) : false,
  clearCache: async () => native ? native.clearCache() : false,
  startBulkImport: async (jobs: Array<{ jobKey: string; playlistId: string; displayName: string; server: string; username: string; password: string }>, concurrency = 2): Promise<string | null> => native ? String(await native.startBulkImport(JSON.stringify(jobs), concurrency)) : null,
  pauseBulkImport: async () => native ? native.pauseBulkImport() : false,
  resumeBulkImport: async () => native ? native.resumeBulkImport() : false,
  cancelBulkImport: async () => native ? native.cancelBulkImport() : false,
  /**
   * v17.9.5 — TEŞHİS: Room'daki tüm snapshot envanteri (yetim liste tespiti).
   * Salt okuma. native yoksa boş dizi.
   */
  getSnapshotInventory: async (): Promise<Array<{playlistId:string;channels:number;vod:number;series:number;total:number;importedAt:number;sourceSize:number}>> =>
    native ? (await native.getSnapshotInventory()) || [] : [],

  getBulkImportSnapshot: (): any => {
    if (!native) return {};
    try { return JSON.parse(native.getBulkImportSnapshot() || "{}"); } catch { return {}; }
  },
  getTelemetry: (id: string) => native ? native.getTelemetry(id) : {},
};
