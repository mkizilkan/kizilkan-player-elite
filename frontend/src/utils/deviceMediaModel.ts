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
  /** v18.5.0: yüklemede BİR KEZ hesaplanan arama anahtarı ve normalleştirilmiş ad (performans). */
  _k?: string;
  _n?: string;
};

/** v18.5.0: arama/sıralama anahtarlarını bir kez hesapla (1000+ öğede her tuşta yeniden hesaplanmasın). */
export function withSearchKeys(items: MediaItem[]): MediaItem[] {
  for (const it of items) {
    if (it._k === undefined) it._k = normalizeTr(`${it.name} ${it.artist || ""} ${it.album || ""} ${it.folder || ""}`);
    if (it._n === undefined) it._n = normalizeTr(it.name);
  }
  return items;
}

export type MediaSortKey = "date" | "name" | "size" | "duration" | "type";
export type MediaGroupMode = "none" | "folder" | "album" | "artist" | "month";

const ASCII_ONLY = /^[\x00-\x7f]*$/;

/**
 * Türkçe duyarsız normalleştirme: "İSTANBUL Şarkı" → "istanbul sarki".
 * v18.7.0 — HIZ (kanıt: 19.536 fotoğrafta yükleme 80 sn): eski sürüm her çağrıda 12 regex +
 * `toLocaleLowerCase("tr")` + NFD çalıştırıyordu. Sonuç AYNI kalacak şekilde sadeleştirildi:
 *  - Yalnız ASCII ad (IMG_2024.jpg gibi — büyük çoğunluk) → yalnız küçültme.
 *  - Diğerleri: yerel olmayan küçültme ("I"→"i"; "İ"→"i̇", nokta işareti NFD ile silinir),
 *    NFD + birleşik işaretleri silme (ş→s, ğ→g, ü→u, ö→o, ç→c ayrışır), ayrışmayan "ı"→"i".
 *  Eski sonuçla birebir aynıdır (tools/test-device-media.js).
 */
export function normalizeTr(s: string): string {
  let t = String(s || "");
  if (!t) return "";
  if (ASCII_ONLY.test(t)) t = t.toLowerCase();
  else t = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
  return t.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * v18.7.0 — TEK Türkçe karşılaştırıcı. Kanıt: fotoğraf sekmesi 9.500 öğede hesap 9,9 sn.
 * `a.localeCompare(b, "tr", { numeric: true })` Hermes'te HER ÇAĞRIDA yeni bir ICU
 * karşılaştırıcısı kurar; aynı tarihli fotoğraflarda (seri çekim/toplu aktarım) her
 * karşılaştırma ada düştüğü için ~130 bin kez çağrılıyordu. Tek örnek aynı sıralamayı verir.
 */
let trCompareFn: ((a: string, b: string) => number) | null = null;
export function trCompare(a: string, b: string): number {
  if (!trCompareFn) {
    try { trCompareFn = new Intl.Collator("tr", { numeric: true }).compare; }
    catch { trCompareFn = (x, y) => (x < y ? -1 : x > y ? 1 : 0); }
  }
  return trCompareFn(a, b);
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : "";
}

/** Ad + sanatçı + albüm + klasör içinde, tüm kelimeler geçmeli (sıra fark etmez). */
export function matchesQuery(item: MediaItem, query: string): boolean {
  const q = normalizeTr(query);
  if (!q) return true;
  const hay = item._k ?? normalizeTr(`${item.name} ${item.artist || ""} ${item.album || ""} ${item.folder || ""}`);
  return q.split(" ").every(w => hay.includes(w));
}

export function sortItems(items: MediaItem[], key: MediaSortKey, desc: boolean): MediaItem[] {
  const dir = desc ? -1 : 1;
  // v18.7.0: ad anahtarı öğe başına BİR KEZ (withSearchKeys yoksa burada hesaplanıp saklanır);
  // karşılaştırma tek Collator örneğiyle (trCompare).
  const nameOf = (it: MediaItem) => it._n ?? (it._n = normalizeTr(it.name));
  const byName = (a: MediaItem, b: MediaItem) => trCompare(nameOf(a), nameOf(b));
  const out = items.slice();
  if (key === "type") {
    const ext = new Map<MediaItem, string>();
    for (const it of out) ext.set(it, normalizeTr(extOf(it.name)));
    out.sort((a, b) => (trCompare(ext.get(a) || "", ext.get(b) || "") || byName(a, b)) * dir);
    return out;
  }
  out.sort((a, b) => {
    let c = 0;
    switch (key) {
      case "name": c = byName(a, b); break;
      case "size": c = (a.size || 0) - (b.size || 0); break;
      case "duration": c = (a.duration || 0) - (b.duration || 0); break;
      default: c = (a.dateAdded || 0) - (b.dateAdded || 0);
    }
    if (c === 0) c = byName(a, b);
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
  // v18.7.0: başlık → anahtar ve zaman dilimi → ay başlığı önbelleği (19 bin fotoğrafta her öğe
  // için normalleştirme + Date nesnesi kurulmasın). Dilim 15 dk: tüm saat dilimi farkları 15 dk'nın
  // katı olduğundan bir dilim YEREL ay sınırını asla aşmaz (UTC günü aşabilirdi → yanlış ay).
  const keyOf = new Map<string, string>();
  const monthOfSlot = new Map<number, string>();
  for (const it of items) {
    let title: string;
    switch (mode) {
      case "folder": title = it.folder || "Diğer"; break;
      case "album": title = it.album && it.album !== "<unknown>" ? it.album : "Bilinmeyen albüm"; break;
      case "artist": title = it.artist && it.artist !== "<unknown>" ? it.artist : "Bilinmeyen sanatçı"; break;
      default: {
        const sec = it.dateModified || it.dateAdded;
        const slot = sec ? Math.floor(sec / 900) : -1;
        let label = monthOfSlot.get(slot);
        if (label === undefined) { label = monthLabel(sec); monthOfSlot.set(slot, label); }
        title = label;
      }
    }
    let key = keyOf.get(title);
    if (key === undefined) { key = normalizeTr(title) || "_"; keyOf.set(title, key); }
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
