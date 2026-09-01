/**
 * KIZILKAN PLAYER — "Şununla aç" (harici bağlantı) desteği
 * Dosya  : frontend/src/utils/externalOpen.ts
 * Sürüm  : v1.0.0 (v4.9.0)
 *
 * ===========================================================================
 * NE İŞE YARIYOR?
 * ===========================================================================
 * Başka bir uygulama (dosya yöneticisi, tarayıcı, başka bir IPTV uygulaması)
 * bir video açmak istediğinde Android "Şununla aç" listesi gösterir. app.json'a
 * eklenen intentFilters sayesinde KIZILKAN PLAYER artık bu listede çıkıyor.
 *
 * Kullanıcı bizi seçince uygulamaya bir URL gelir. Bu modül o URL'i alır,
 * player'ın anlayacağı geçici bir "harici yayın" kaydına çevirir ve player'ı
 * açacak yönlendirme bilgisini döndürür.
 *
 * NOT: Player harici yayınları `kizilkan.episode.url.<id>` anahtarından okur ve
 * /player?id=<id>&ext=true ile açılır. Aynı mekanizmayı kullanıyoruz — yeni bir
 * yol açmıyoruz (mevcut çalışan altyapıyı koruyoruz).
 * ===========================================================================
 */

import { storage } from "./storage";

const EPISODE_URL_KEY = "kizilkan.episode.url.";

/** Uygulamanın kendi derin bağlantı şemaları — bunlar video değildir. */
const OWN_SCHEMES = ["kizilkan-gpt:", "kizilkan:", "exp:", "exps:"];

/** URL'den okunabilir bir isim üretir. */
function nameFromUrl(url: string): string {
  try {
    const clean = url.split("?")[0].split("#")[0];
    const last = clean.substring(clean.lastIndexOf("/") + 1);
    const decoded = decodeURIComponent(last || "");
    return decoded || "Harici Yayın";
  } catch {
    return "Harici Yayın";
  }
}

/** URL'den uzantı çıkarır (player motor seçiminde kullanılır). */
function extFromUrl(url: string): string {
  try {
    const clean = url.split("?")[0].split("#")[0].toLowerCase();
    const dot = clean.lastIndexOf(".");
    if (dot === -1) return "";
    const ext = clean.substring(dot + 1);
    return ext.length <= 5 ? ext : "";
  } catch {
    return "";
  }
}

/**
 * Gelen URL bir video/yayın bağlantısı mı?
 * Uygulamanın kendi derin bağlantılarını (kizilkan://...) dışlar.
 */
export function isPlayableExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const low = url.toLowerCase();
  if (OWN_SCHEMES.some(s => low.startsWith(s))) return false;
  return (
    low.startsWith("http://") ||
    low.startsWith("https://") ||
    low.startsWith("rtsp://") ||
    low.startsWith("rtmp://") ||
    low.startsWith("file://") ||
    low.startsWith("content://")
  );
}

/**
 * Harici URL'i player'a hazırlar.
 * @returns player yönlendirme parametreleri veya oynatılamazsa null.
 */
export async function prepareExternalStream(
  url: string
): Promise<{ id: string; ext: "true" } | null> {
  if (!isPlayableExternalUrl(url)) return null;

  const id = `ext-${Date.now()}`;
  const payload = {
    url,
    name: nameFromUrl(url),
    group: "Harici",
    container_ext: extFromUrl(url),
    poster: null,
  };

  try {
    await storage.setItem(EPISODE_URL_KEY + id, JSON.stringify(payload));
    return { id, ext: "true" };
  } catch {
    return null;
  }
}
