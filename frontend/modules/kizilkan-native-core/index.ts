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
  warmPlaylist: async (id: string): Promise<NativePlaylistSummary | null> => native ? native.warmPlaylist(id) : null,
  readPlaylistHeavy: async <T = any>(id: string): Promise<T | null> => native ? native.readPlaylistHeavy(id) : null,
  getPlaylistSummary: async (id: string): Promise<NativePlaylistSummary | null> => native ? native.getPlaylistSummary(id) : null,
  getCategories: async (id: string, kind: "live" | "vod" | "series") => native ? native.getCategories(id, kind) : [],
  queryItems: async <T = any>(id: string, kind: "live" | "vod" | "series", opts?: { group?: string; search?: string; offset?: number; limit?: number }): Promise<NativeQueryPage<T>> => {
    if (!native) return { items: [], offset: 0, returned: 0, total: 0, hasMore: false };
    return native.queryItems(id, kind, opts?.group || "__all__", opts?.search || "", opts?.offset || 0, opts?.limit || 80);
  },
  getItem: async <T = any>(id: string, kind: "live" | "vod" | "series", itemId: string): Promise<T | null> => native ? native.getItem(id, kind, itemId) : null,
  reindexPlaylist: async (id: string): Promise<NativePlaylistSummary | null> => native ? native.reindexPlaylist(id) : null,
  invalidatePlaylist: (id: string) => native ? native.invalidatePlaylist(id) : false,
  removePlaylistIndex: async (id: string) => native ? native.removePlaylistIndex(id) : false,
  clearCache: async () => native ? native.clearCache() : false,
  getTelemetry: (id: string) => native ? native.getTelemetry(id) : {},
};
