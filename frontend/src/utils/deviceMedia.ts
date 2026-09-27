/**
 * KIZILKAN PLAYER v18.4.0 — Medya Merkezi: izin + MediaStore yükleme + oynatma köprüsü.
 * Yeni npm paketi YOK: izin RN PermissionsAndroid, tarama native MediaStore sorgusu.
 */
import { Alert, PermissionsAndroid, Platform } from "react-native";
import { KizilkanNativeCore, type DeviceMediaItem, type DeviceMediaKind } from "@/modules/kizilkan-native-core";
import { recordDiagnostic } from "./diagnostics";
import { localIdForUri, type LocalQueueItem } from "./localMedia";
import { extOf, type MediaItem } from "./deviceMediaModel";

export type PermissionState = "granted" | "partial" | "denied" | "unavailable";

function permsFor(kind: DeviceMediaKind): string[] {
  const P: any = PermissionsAndroid.PERMISSIONS;
  const api = Number(Platform.Version) || 0;
  if (api >= 33) {
    if (kind === "audio") return [P.READ_MEDIA_AUDIO].filter(Boolean);
    if (kind === "image") return [P.READ_MEDIA_IMAGES].filter(Boolean);
    return [P.READ_MEDIA_VIDEO].filter(Boolean);
  }
  return [P.READ_EXTERNAL_STORAGE].filter(Boolean);
}

export async function checkMediaPermission(kind: DeviceMediaKind): Promise<PermissionState> {
  if (Platform.OS !== "android") return "unavailable";
  const perms = permsFor(kind);
  if (!perms.length) return "unavailable";
  try {
    const results = await Promise.all(perms.map(p => PermissionsAndroid.check(p as any)));
    if (results.every(Boolean)) return "granted";
    // Android 14+: kullanıcı "Seçili fotoğraflara izin ver" dediyse kısmi erişim.
    const partial = (PermissionsAndroid.PERMISSIONS as any).READ_MEDIA_VISUAL_USER_SELECTED;
    if (partial && kind !== "audio" && await PermissionsAndroid.check(partial)) return "partial";
    return "denied";
  } catch { return "denied"; }
}

export async function requestMediaPermission(kind: DeviceMediaKind): Promise<PermissionState> {
  if (Platform.OS !== "android") return "unavailable";
  const perms = permsFor(kind);
  if (!perms.length) return "unavailable";
  try {
    const res = await PermissionsAndroid.requestMultiple(perms as any);
    const ok = perms.every(p => (res as any)[p] === PermissionsAndroid.RESULTS.GRANTED);
    const state: PermissionState = ok ? "granted" : await checkMediaPermission(kind);
    void recordDiagnostic("player", "MEDIA_CENTER_PERMISSION", { kind, state }, { stage: "media-center", outcome: ok ? "success" : "skipped" });
    return state;
  } catch { return "denied"; }
}

/** Bellek önbelleği (oturum boyu). MediaStore hızlıdır; büyük listeyi diske yazmıyoruz. */
const cache = new Map<DeviceMediaKind, { at: number; items: MediaItem[] }>();

export async function loadDeviceMedia(kind: DeviceMediaKind, force = false): Promise<{ items: MediaItem[]; error?: string; elapsedMs: number }> {
  const t0 = Date.now();
  const hit = cache.get(kind);
  if (!force && hit && Date.now() - hit.at < 5 * 60_000) return { items: hit.items, elapsedMs: 0 };
  const all: MediaItem[] = [];
  let offset = 0;
  const PAGE = 2000;
  for (let guard = 0; guard < 100; guard++) {
    const page = await KizilkanNativeCore.queryDeviceMedia(kind, offset, PAGE);
    if (!page.ok) {
      void recordDiagnostic("player", "MEDIA_CENTER_SCAN", { kind, ok: false, error: String(page.error || "").slice(0, 120) }, { stage: "media-center", outcome: "failed" });
      return { items: all, error: page.error, elapsedMs: Date.now() - t0 };
    }
    all.push(...(page.items as DeviceMediaItem[]));
    offset += page.items.length;
    if (page.items.length < PAGE || offset >= page.total) break;
  }
  cache.set(kind, { at: Date.now(), items: all });
  void recordDiagnostic("player", "MEDIA_CENTER_SCAN", { kind, ok: true, count: all.length, elapsedMs: Date.now() - t0 }, { stage: "media-center", outcome: "success" });
  return { items: all, elapsedMs: Date.now() - t0 };
}

export function invalidateDeviceMedia(kind?: DeviceMediaKind) {
  if (kind) cache.delete(kind); else cache.clear();
}

/** MediaStore öğesi → oynatıcı kuyruğu öğesi (yerel medya ile AYNI kimlik ve akış). */
export function toQueueItem(item: MediaItem, kind: "video" | "audio"): LocalQueueItem {
  return { id: localIdForUri(item.uri), uri: item.uri, name: item.name, ext: extOf(item.name) || (kind === "audio" ? "mp3" : "mp4"), kind };
}

/**
 * Paylaş: expo-sharing yerel dosya ister. content:// adresi önce doğrudan denenir;
 * olmazsa önbelleğe kopyalanıp paylaşılır (kopya paylaşımdan sonra silinir).
 */
export async function shareMediaItem(item: MediaItem): Promise<void> {
  const Sharing: any = await import("expo-sharing");
  const FS: any = await import("expo-file-system/legacy");
  if (!(await Sharing.isAvailableAsync())) { Alert.alert("Paylaşım yok", "Bu cihazda paylaşım desteklenmiyor."); return; }
  try {
    await Sharing.shareAsync(item.uri, { mimeType: item.mime || undefined, dialogTitle: item.name });
    return;
  } catch { /* content:// desteklenmedi → kopyala */ }
  const safeName = item.name.replace(/[\\/:*?"<>|]/g, "_") || `medya.${extOf(item.name) || "bin"}`;
  const target = `${FS.cacheDirectory}share-${Date.now()}-${safeName}`;
  try {
    await FS.copyAsync({ from: item.uri, to: target });
    await Sharing.shareAsync(target, { mimeType: item.mime || undefined, dialogTitle: item.name });
  } catch (e: any) {
    Alert.alert("Paylaşılamadı", String(e?.message || e));
  } finally {
    setTimeout(() => { void FS.deleteAsync(target, { idempotent: true }).catch(() => {}); }, 60_000);
  }
}

// ── Fotoğraf görüntüleyici için paylaşılan liste (route parametresine binlerce öğe koymamak için) ──
let photoList: MediaItem[] = [];
let photoIndex = 0;
export function setPhotoViewerList(items: MediaItem[], index: number) { photoList = items; photoIndex = Math.max(0, Math.min(index, items.length - 1)); }
export function getPhotoViewerList(): { items: MediaItem[]; index: number } { return { items: photoList, index: photoIndex }; }
