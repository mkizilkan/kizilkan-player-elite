/**
 * KIZILKAN PLAYER v18.4.0 — Medya Merkezi: SAF model (arama, sıralama, gruplama, filtre).
 * React Native'e bağlı DEĞİLDİR; Node ile test edilir (tools/test-device-media.js).
 */

export type MediaTab = "audio" | "video" | "image";

export type MediaItem = {
  id: number;
  uri: string;
  name: string;
  size: number;
  /** saniye (MediaStore) */
  dateAdded: number;
  dateModified: number;
  mime: string;
  folder: string;
  /** ms */
  duration?: number;
  width?: number;
  height?: number;
  artist?: string;
  album?: string;
};

export type MediaSortKey = "date" | "name" | "size" | "duration" | "type";
export type MediaGroupMode = "none" | "folder" | "album" | "artist" | "month";

/** Türkçe duyarsız normalleştirme: "İSTANBUL Şarkı" → "istanbul sarki". */
export function normalizeTr(s: string): string {
  return String(s || "")
    .replace(/İ/g, "i").replace(/I/g, "ı")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : "";
}

/** Ad + sanatçı + albüm + klasör içinde, tüm kelimeler geçmeli (sıra fark etmez). */
export function matchesQuery(item: MediaItem, query: string): boolean {
  const q = normalizeTr(query);
  if (!q) return true;
  const hay = normalizeTr(`${item.name} ${item.artist || ""} ${item.album || ""} ${item.folder || ""}`);
  return q.split(" ").every(w => hay.includes(w));
}

export function sortItems(items: MediaItem[], key: MediaSortKey, desc: boolean): MediaItem[] {
  const dir = desc ? -1 : 1;
  const collator = (a: string, b: string) => normalizeTr(a).localeCompare(normalizeTr(b), "tr", { numeric: true });
  const out = items.slice();
  out.sort((a, b) => {
    let c = 0;
    switch (key) {
      case "name": c = collator(a.name, b.name); break;
      case "size": c = (a.size || 0) - (b.size || 0); break;
      case "duration": c = (a.duration || 0) - (b.duration || 0); break;
      case "type": c = collator(extOf(a.name), extOf(b.name)) || collator(a.name, b.name); break;
      default: c = (a.dateAdded || 0) - (b.dateAdded || 0);
    }
    if (c === 0) c = collator(a.name, b.name);
    return c * dir;
  });
  return out;
}

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Saniye → "Eylül 2026" (fotoğraf zaman çizelgesi başlığı). */
export function monthLabel(epochSec: number): string {
  if (!epochSec) return "Tarihsiz";
  const d = new Date(epochSec * 1000);
  return `${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export type MediaSection = { title: string; key: string; items: MediaItem[] };

/** Gruplar; sıra korunur (sıralanmış listeyi gruplar). */
export function groupItems(items: MediaItem[], mode: MediaGroupMode): MediaSection[] {
  if (mode === "none") return [{ title: "", key: "all", items }];
  const map = new Map<string, MediaSection>();
  for (const it of items) {
    let title: string;
    switch (mode) {
      case "folder": title = it.folder || "Diğer"; break;
      case "album": title = it.album && it.album !== "<unknown>" ? it.album : "Bilinmeyen albüm"; break;
      case "artist": title = it.artist && it.artist !== "<unknown>" ? it.artist : "Bilinmeyen sanatçı"; break;
      default: title = monthLabel(it.dateModified || it.dateAdded);
    }
    const key = normalizeTr(title) || "_";
    let sec = map.get(key);
    if (!sec) { sec = { title, key, items: [] }; map.set(key, sec); }
    sec.items.push(it);
  }
  return Array.from(map.values());
}

/** HD/FHD/4K rozeti (kısa kenar üzerinden; dikey video da doğru). */
export function qualityBadge(width?: number, height?: number): string | null {
  const w = width || 0, h = height || 0;
  if (!w || !h) return null;
  const short = Math.min(w, h);
  if (short >= 2000) return "4K";
  if (short >= 1000) return "FHD";
  if (short >= 700) return "HD";
  return null;
}

export function isScreenRecording(item: MediaItem): boolean {
  return /screen|ekran|record|kayd/i.test(`${item.folder} ${item.name}`);
}

export type SmartFilter = "all" | "short" | "long" | "screen" | "hideShortAudio";

/** Akıllı filtreler: video kısa(<1 dk)/uzun(>20 dk)/ekran kaydı; müzik kısa sesleri gizle (<30 sn). */
export function applySmartFilter(items: MediaItem[], f: SmartFilter): MediaItem[] {
  switch (f) {
    case "short": return items.filter(i => (i.duration || 0) > 0 && (i.duration || 0) < 60_000);
    case "long": return items.filter(i => (i.duration || 0) > 20 * 60_000);
    case "screen": return items.filter(isScreenRecording);
    case "hideShortAudio": return items.filter(i => !((i.duration || 0) > 0 && (i.duration || 0) < 30_000));
    default: return items;
  }
}

/** ms → "3:05" / "1:02:03". */
export function fmtMs(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
