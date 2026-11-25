/**
 * KIZILKAN PLAYER — Kütüphane kapsamı birleştirme (v18.7.41, #1)
 * ==========================================================================
 * Çift hesaplar tek hesapta birleştirilince KOPYA listeler silinir. Silinen
 * listelerin favori/izlendi/kaldığın yer/izleme-listesi/gizli verisi KAYBOLMASIN
 * diye, önce korunan hesaba TAŞINIR. Veriler profil başına şu anahtarlarda,
 * `@list:encode(playlistId):itemId` biçiminde saklanır (bkz. libraryScope.ts +
 * LibraryContext). Taşıma = kaynak listenin önekini hedef listenin önekine çevir.
 * Aynı hesap/panel olduğu için itemId'ler birebir eşleşir → güvenli.
 */
import { storage } from "@/src/utils/storage";

const PREFIX = "@list:";
const scopePrefix = (playlistId: string) => `${PREFIX}${encodeURIComponent(playlistId)}:`;

// LibraryContext ile aynı anahtarlar (prefix + profileId).
const MAP_FIELD_KEYS = ["kizilkan.progress.", "kizilkan.watched.", "kizilkan.seriesLast."];
const LIST_FIELD_KEYS = ["kizilkan.watchlist.", "kizilkan.searchHistory.", "kizilkan.hiddenItems.", "kizilkan.hiddenGroups."];

async function readJson(key: string): Promise<any> {
  try { const raw = await storage.getItem<string>(key, ""); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

/**
 * fromIds listelerinin kütüphane verisini toId'ye taşır. Hedefte ZATEN varsa
 * üzerine yazmaz (hedefin kendi kaydı korunur). Kaynak kayıtları silinir.
 * Tek profil için çalışır (birleştirme aktif profilin listeleri arasında yapılır).
 */
export async function mergeLibraryScopes(profileId: string, fromIds: string[], toId: string): Promise<{ moved: number }> {
  const froms = Array.from(new Set(fromIds.filter(id => id && id !== toId)));
  if (!profileId || !toId || !froms.length) return { moved: 0 };
  const toPrefix = scopePrefix(toId);
  let moved = 0;

  for (const base of MAP_FIELD_KEYS) {
    const key = base + profileId;
    const map = await readJson(key);
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    let changed = false;
    for (const fromId of froms) {
      const fromPrefix = scopePrefix(fromId);
      for (const k of Object.keys(map)) {
        if (!k.startsWith(fromPrefix)) continue;
        const rest = k.slice(fromPrefix.length);
        const newKey = toPrefix + rest;
        if (!(newKey in map)) { map[newKey] = map[k]; moved++; }
        delete map[k];
        changed = true;
      }
    }
    if (changed) { try { await storage.setItem(key, JSON.stringify(map)); } catch {} }
  }

  for (const base of LIST_FIELD_KEYS) {
    const key = base + profileId;
    const arr = await readJson(key);
    if (!Array.isArray(arr)) continue;
    let changed = false;
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of arr) {
      let mapped = id;
      for (const fromId of froms) {
        const fromPrefix = scopePrefix(fromId);
        if (typeof id === "string" && id.startsWith(fromPrefix)) { mapped = toPrefix + id.slice(fromPrefix.length); changed = true; break; }
      }
      if (typeof mapped === "string" && !seen.has(mapped)) { seen.add(mapped); out.push(mapped); }
    }
    if (changed) { try { await storage.setItem(key, JSON.stringify(out)); } catch {} }
  }

  return { moved };
}
