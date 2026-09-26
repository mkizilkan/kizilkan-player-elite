/**
 * KIZILKAN PLAYER — Yerel Medya ortak durumu (v18.1.0)
 *
 * Yerel medya ekranı (app/local-media.tsx) ile kalıcı oynatıcı (PlayerHost)
 * arasında paylaşılan küçük sözleşme:
 *  • Oynatma yükü  : "kizilkan.episode.url.<id>" (PlayerHost'un harici kaynak okuma yolu; biçim değişmedi)
 *  • Kuyruk        : açılan klasörün sıralı ses/video listesi → oynatıcıda önceki/sonraki + otomatik geçiş
 *  • Son açılanlar : en fazla 30 dosya
 *  • Kaldığın yer  : yerel dosyalar için AYRI ilerleme deposu. Eskiden kütüphanenin
 *                    "Devam Et" listesine film gibi yazılıyordu; oradan açılınca detay
 *                    ekranı dosyayı bulamıyordu.
 *  • Bilgi önbelleği: süre/etiket/kapak (native MediaMetadataRetriever sonucu)
 *
 * Depolama yalnız ilkel değer kabul ettiği için (StorageItemValue) JSON metin saklanır.
 */
import { storage } from "@/src/utils/storage";
import type { LocalMediaInfo } from "@/modules/kizilkan-native-core";

export const LOCAL_EPISODE_URL_KEY = "kizilkan.episode.url.";
const QUEUE_KEY = "kizilkan.localmedia.queue.v1";
const RECENT_KEY = "kizilkan.localmedia.recent.v1";
const PROGRESS_KEY = "kizilkan.localmedia.progress.v1";
const INFO_KEY = "kizilkan.localmedia.info.v1";
export const LOCAL_LAST_DIR_KEY = "kizilkan.localmedia.lastDir.v1";
export const LOCAL_PREFS_KEY = "kizilkan.localmedia.prefs.v1";

const RECENT_MAX = 30;
const PROGRESS_MAX = 400;
const INFO_MAX = 1500;

export const LOCAL_VIDEO_EXT = ["mp4", "mkv", "avi", "mov", "m4v", "webm", "ts", "m2ts", "mts", "mpg", "mpeg", "3gp", "flv", "wmv", "vob"];
export const LOCAL_AUDIO_EXT = ["mp3", "flac", "aac", "m4a", "ogg", "oga", "opus", "wav", "wma", "amr", "mka", "alac", "aiff", "aif"];

export type LocalKind = "video" | "audio";
export type LocalQueueItem = { id: string; uri: string; name: string; ext: string; kind: LocalKind };
export type LocalQueue = { items: LocalQueueItem[]; dirUri?: string; label?: string; createdAt: number };
export type LocalRecent = LocalQueueItem & { openedAt: number; dirUri?: string };
export type LocalProgress = { current: number; duration: number; updatedAt: number };
export type LocalInfoLite = Pick<LocalMediaInfo, "durationMs" | "title" | "artist" | "album" | "width" | "height" | "artPath" | "hasVideo"> & { at: number };

export function isLocalMediaId(id: unknown): boolean {
  return String(id || "").startsWith("local-");
}

function hashText(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Kimlik v17 ile aynı formül: eski kayıtlar (son açılanlar/ilerleme) geçerli kalır. */
export function localIdForUri(uri: string): string {
  return `local-${hashText(uri)}`;
}

export function extOfName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

export function kindOfName(name: string, mime = ""): LocalKind | null {
  const ext = extOfName(name);
  if (LOCAL_VIDEO_EXT.includes(ext) || mime.startsWith("video/")) return "video";
  if (LOCAL_AUDIO_EXT.includes(ext) || mime.startsWith("audio/")) return "audio";
  return null;
}

export function uriDisplayName(uri: string): string {
  try {
    const clean = decodeURIComponent(String(uri).split("?")[0]);
    const raw = clean.split("/").filter(Boolean).pop() || "Dosya";
    const colon = raw.lastIndexOf(":");
    return (colon >= 0 ? raw.slice(colon + 1) : raw) || "Dosya";
  } catch { return "Dosya"; }
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await storage.getItem<string>(key, "");
    if (!raw) return fallback;
    return JSON.parse(String(raw)) as T;
  } catch { return fallback; }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try { await storage.setItem(key, JSON.stringify(value)); } catch { /* depolama dolu/erişilemez: oynatma engellenmez */ }
}

/** PlayerHost'un okuduğu oynatma yükü (v17 biçimi korunur; kapak eklenebilir). */
export async function writeLocalPayload(item: LocalQueueItem, artUri?: string | null): Promise<void> {
  await storage.setItem(LOCAL_EPISODE_URL_KEY + item.id, JSON.stringify({
    id: item.id,
    url: item.uri,
    name: item.name,
    group: item.kind === "audio" ? "Yerel Müzik" : "Yerel Medya",
    container_ext: item.ext || (item.kind === "audio" ? "mp3" : "mp4"),
    poster: artUri || null,
  }));
}

export async function saveLocalQueue(queue: Omit<LocalQueue, "createdAt">): Promise<void> {
  await writeJson(QUEUE_KEY, { ...queue, createdAt: Date.now() });
}

export async function loadLocalQueue(): Promise<LocalQueue | null> {
  const q = await readJson<LocalQueue | null>(QUEUE_KEY, null);
  return q && Array.isArray(q.items) ? q : null;
}

export async function addLocalRecent(item: LocalQueueItem, dirUri?: string): Promise<void> {
  const list = await readJson<LocalRecent[]>(RECENT_KEY, []);
  const next = [{ ...item, dirUri, openedAt: Date.now() }, ...list.filter(x => x.id !== item.id)].slice(0, RECENT_MAX);
  await writeJson(RECENT_KEY, next);
}

export async function loadLocalRecent(): Promise<LocalRecent[]> {
  const list = await readJson<LocalRecent[]>(RECENT_KEY, []);
  return Array.isArray(list) ? list : [];
}

export async function clearLocalRecent(): Promise<void> {
  await writeJson(RECENT_KEY, []);
}

export async function loadLocalProgressMap(): Promise<Record<string, LocalProgress>> {
  const map = await readJson<Record<string, LocalProgress>>(PROGRESS_KEY, {});
  return map && typeof map === "object" ? map : {};
}

/**
 * Kaldığın yer. %95 sonrası "bitti" sayılır ve silinir (bir sonraki açılış baştan).
 * Yazma sıklığı PlayerHost'un mevcut 5 sn'lik ilerleme döngüsüdür.
 */
export async function saveLocalProgress(id: string, current: number, duration: number): Promise<void> {
  if (!isLocalMediaId(id) || !(duration > 0)) return;
  const map = await loadLocalProgressMap();
  if (current / duration >= 0.95) delete map[id];
  else map[id] = { current, duration, updatedAt: Date.now() };
  const entries = Object.entries(map).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, PROGRESS_MAX);
  await writeJson(PROGRESS_KEY, Object.fromEntries(entries));
}

export async function loadLocalInfoCache(): Promise<Record<string, LocalInfoLite>> {
  const map = await readJson<Record<string, LocalInfoLite>>(INFO_KEY, {});
  return map && typeof map === "object" ? map : {};
}

export async function saveLocalInfoCache(map: Record<string, LocalInfoLite>): Promise<void> {
  const entries = Object.entries(map).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, INFO_MAX);
  await writeJson(INFO_KEY, Object.fromEntries(entries));
}

export function fmtDuration(ms?: number): string {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (!total) return "";
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtSize(bytes?: number): string {
  const b = Number(bytes || 0);
  if (!(b > 0)) return "";
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}
