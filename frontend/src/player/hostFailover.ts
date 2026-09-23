/**
 * KIZILKAN PLAYER — YEDEK DNS İLE KAYNAK DEĞİŞTİRME (v17.9.0)
 * ===========================================================================
 * SORUN: Bir kanal 404/403/bağlantı hatası verdiğinde oynatıcı MOTORU
 * değiştiriyordu (Media3 → VLC → MPV). Oysa sunucu "yayın yok" diyorsa motor
 * fark etmez; bu denemeler boşa gidiyordu. 20.09 kaydındaki 13 adet 404'ün
 * hepsi böyle geçti.
 *
 * ELDEKİ VERİ: Tarama sırasında bir aboneliğin BİRDEN FAZLA çalışan DNS'i
 * bulunup `serverCodeBinding.validatedHosts` olarak saklanıyor. Liste
 * yenilemede kullanılıyordu ama OYNATICI bunları hiç kullanmıyordu.
 *
 * ÇÖZÜM: Aynı yayın, aynı yol — yalnız sunucu adresi farklı. Bu adresler
 * oynatıcının mevcut "sıradaki adrese geç" mekanizmasına (playbackCandidates)
 * beslenir. Eşleşme hatası riski YOKTUR: birebir aynı akış, farklı DNS.
 * Çalışan DNS liste başına hatırlanır ve sonraki açılışta önce o denenir.
 */
import { storage } from "@/src/utils/storage";

/** Adresin kaynak kısmı: "http://host:port" (yol ve sorgu hariç). */
export function originOf(url: string): string {
  try { const u = new URL(url); return `${u.protocol}//${u.host}`; } catch { return ""; }
}

/** Bir DNS girdisini "http://host:port" biçimine getirir. */
export function normalizeHost(host: string): string {
  const raw = String(host || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return originOf(withScheme);
}

/**
 * Aynı yayının diğer DNS'lerdeki adreslerini üretir.
 * Yol, sorgu ve kimlik bilgisi AYNEN korunur; yalnız köken değişir.
 * Tercih edilen (daha önce çalışmış) DNS varsa en başa alınır.
 */
export function alternateHostUrls(url: string, hosts: string[] | undefined, preferred?: string | null): string[] {
  const current = originOf(url);
  if (!current || !hosts?.length) return [];
  let rest: string;
  try { const u = new URL(url); rest = `${u.pathname}${u.search}${u.hash}`; } catch { return []; }
  const pref = preferred ? normalizeHost(preferred) : "";
  const ordered = Array.from(new Set(hosts.map(normalizeHost).filter(Boolean)))
    .filter(h => h !== current)
    .sort((a, b) => (a === pref ? -1 : b === pref ? 1 : 0));
  return ordered.map(h => `${h}${rest}`);
}

/**
 * Kaynak değiştirmenin anlamlı olduğu hata türleri.
 * `http_auth` BİLEREK dışarıda: kullanıcı adı/şifre yanlışsa tüm DNS'lerde
 * aynı hata alınır; denemek boşa zaman kaybıdır.
 */
export const SOURCE_RETRY_KINDS = ["extractor", "source", "http_not_found", "http_forbidden", "network", "timeout"];

export function isSourceRetryKind(kind: string): boolean {
  return SOURCE_RETRY_KINDS.includes(String(kind || ""));
}

const PREF_KEY = (playlistId: string) => `kizilkan.player.preferredHost.${playlistId}`;

/** Bu liste için en son çalışan DNS. */
export async function loadPreferredHost(playlistId: string): Promise<string | null> {
  if (!playlistId) return null;
  try { return (await storage.getItem<string>(PREF_KEY(playlistId), "")) || null; } catch { return null; }
}

/** İlk kare geldiğinde çalışan DNS'i hatırla. */
export async function rememberWorkingHost(playlistId: string, url: string): Promise<void> {
  const origin = originOf(url);
  if (!playlistId || !origin) return;
  try { await storage.setItem(PREF_KEY(playlistId), origin); } catch { /* hatırlanamazsa akış etkilenmez */ }
}
