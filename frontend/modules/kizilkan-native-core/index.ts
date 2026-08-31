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

export type DatabaseMaintenanceResult = {
  mode: "diagnose" | "quick" | "normal" | "deep" | string;
  operationId?: string; changed?: boolean; durationMs?: number; reclaimedTotalBytes?: number; totalBytesDelta?: number; vacuumRan?: boolean; optimizeRan?: boolean;
  removedMediaOrphans?: number; removedEpgOrphans?: number; removedExpiredEpg?: number; removedNormalTelemetry?: number; removedCriticalTelemetry?: number;
  checkpoint?: Record<string, any>; before?: DatabaseHealth; after?: DatabaseHealth;
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
  warmPlaylist: async (id: string): Promise<NativePlaylistSummary | null> => native ? native.warmPlaylist(id) : null,
  importPlaylistHeavyJson: async (id: string, json: string): Promise<NativePlaylistSummary | null> => native ? native.importPlaylistHeavyJson(id, json) : null,
  replacePlaylistKindJson: async (id: string, kind: "live" | "vod" | "series", jsonArray: string): Promise<NativePlaylistSummary | null> => native ? native.replacePlaylistKindJson(id, kind, jsonArray) : null,
  beginChunkedPlaylistImport: async (id: string): Promise<boolean> => native ? !!(await native.beginChunkedPlaylistImport(id)) : false,
  appendPlaylistChunk: async (id: string, kind: "live" | "vod" | "series", jsonArray: string): Promise<number> => native ? Number(await native.appendPlaylistChunk(id, kind, jsonArray)) : 0,
  finishChunkedPlaylistImport: async (id: string): Promise<NativePlaylistSummary | null> => native ? native.finishChunkedPlaylistImport(id) : null,
  cancelChunkedPlaylistImport: async (id: string): Promise<boolean> => native ? !!(await native.cancelChunkedPlaylistImport(id)) : false,
  applyAtomicPlaylistRestore: async (sessionId: string, mappings: Array<{targetId:string; stageId:string|null}>): Promise<boolean> => native ? !!(await native.applyAtomicPlaylistRestore(sessionId, JSON.stringify(mappings))) : false,
  finalizeAtomicPlaylistRestore: async (sessionId: string, targetIds: string[]): Promise<boolean> => native ? !!(await native.finalizeAtomicPlaylistRestore(sessionId, JSON.stringify(targetIds))) : false,
  rollbackAtomicPlaylistRestore: async (sessionId: string, targetIds: string[]): Promise<boolean> => native ? !!(await native.rollbackAtomicPlaylistRestore(sessionId, JSON.stringify(targetIds))) : false,
  importM3uText: async (id: string, text: string): Promise<NativePlaylistSummary | null> => native ? native.importM3uText(id, text) : null,
  fetchAndImportM3u: async (id: string, url: string, userAgent = "VLC/3.0.20 LibVLC/3.0.20"): Promise<NativePlaylistSummary | null> => native ? native.fetchAndImportM3u(id, url, userAgent) : null,
  hasPlaylistIndex: async (id: string): Promise<boolean> => native ? !!(await native.hasPlaylistIndex(id)) : false,
  deleteLegacyPlaylistFile: async (id: string): Promise<boolean> => native ? !!(await native.deleteLegacyPlaylistFile(id)) : false,
  getStorageFootprint: async (): Promise<Record<string, any>> => native ? (await native.getStorageFootprint()) : {},
  getDatabaseHealth: async (includeIntegrity = false): Promise<DatabaseHealth> => native ? ((await native.getDatabaseHealth(!!includeIntegrity)) || {}) : {},
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
  reindexPlaylist: async (id: string): Promise<NativePlaylistSummary | null> => native ? native.reindexPlaylist(id) : null,
  invalidatePlaylist: (id: string) => native ? native.invalidatePlaylist(id) : false,
  removePlaylistIndex: async (id: string) => native ? native.removePlaylistIndex(id) : false,
  clearCache: async () => native ? native.clearCache() : false,
  startBulkImport: async (jobs: Array<{ jobKey: string; playlistId: string; displayName: string; server: string; username: string; password: string }>, concurrency = 2): Promise<string | null> => native ? String(await native.startBulkImport(JSON.stringify(jobs), concurrency)) : null,
  pauseBulkImport: async () => native ? native.pauseBulkImport() : false,
  resumeBulkImport: async () => native ? native.resumeBulkImport() : false,
  cancelBulkImport: async () => native ? native.cancelBulkImport() : false,
  getBulkImportSnapshot: (): any => {
    if (!native) return {};
    try { return JSON.parse(native.getBulkImportSnapshot() || "{}"); } catch { return {}; }
  },
  getTelemetry: (id: string) => native ? native.getTelemetry(id) : {},
};
