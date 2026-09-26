/**
 * KIZILKAN PLAYER — "YENİ" rozeti (v18.2.0)
 *
 * Film/dizi kartında, sağlayıcının bildirdiği eklenme zamanı son N gün içindeyse
 * rozet gösterilir. Xtream `added` Unix saniyesi (metin) gönderir; MAG/Stalker
 * "YYYY-MM-DD HH:mm:ss" biçiminde tarih gönderebilir; ikisi de desteklenir.
 * Tarih yoksa (M3U) rozet gösterilmez — tahmin yapılmaz.
 */
export const NEW_BADGE_DAYS = 7;

export function addedAtMs(item: any): number {
  const raw = item?.added ?? item?.last_modified;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n; // saniye → ms
  const t = Date.parse(String(raw).replace(" ", "T"));
  return Number.isFinite(t) ? t : 0;
}

export function isNewItem(item: any, days = NEW_BADGE_DAYS, now = Date.now()): boolean {
  const at = addedAtMs(item);
  // Gelecekteki tarihler (sunucu saati bozuk) rozet almaz.
  return at > 0 && at <= now + 3600_000 && now - at <= days * 86400_000;
}
