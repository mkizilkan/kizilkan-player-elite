/**
 * KIZILKAN PLAYER — Canlı zaman kaydırma (timeshift) modu (v17.10.3)
 * ===========================================================================
 * Kullanıcı onayı (25.09): C + B, varsayılan "onPause".
 *
 *   always  : Kanal açılır açılmaz tampon kurulur. Kanalın açıldığı andan
 *             itibaren geri sarılabilir; açılışta kısa bir bekleme olur
 *             (v17.10.3'te ilk segment 0,5 sn'ye indirildi).
 *   onPause : Kanal DOĞRUDAN ve beklemeden açılır. Kullanıcı duraklatınca
 *             doğrudan akış bırakılır, kaydedici başlar; devam edince
 *             tampondan (duraklatma anından) oynatılır. Aynı anda tek bağlantı
 *             kullanılır — "1 kullanıcı" hesaplar için şart. Duraklatmadan önceki
 *             ana geri sarılamaz.
 *   off     : Zaman kaydırma hiç kullanılmaz.
 *
 * Bu modül bilerek küçük tutuldu: Ayarlar ekranı da kullanır; PlayerHost gibi
 * büyük bir modülü import etmek döngüsel import ve gereksiz yük riski taşır.
 */
import { storage } from "@/src/utils/storage";

export type LiveTimeshiftMode = "always" | "onPause" | "off";
export const LIVE_TIMESHIFT_MODE_KEY = "kizilkan.timeshift.mode.v1";
export const LIVE_TIMESHIFT_MODE_DEFAULT: LiveTimeshiftMode = "onPause";

export const LIVE_TIMESHIFT_MODE_OPTIONS: Array<{ value: LiveTimeshiftMode; label: string; hint: string }> = [
  { value: "onPause", label: "Duraklatınca", hint: "Kanal beklemeden açılır; duraklatınca kayıt başlar." },
  { value: "always", label: "Her zaman", hint: "Kanalın başından geri sarılabilir; açılış biraz gecikir." },
  { value: "off", label: "Kapalı", hint: "Zaman kaydırma kullanılmaz." },
];

export function normalizeLiveTimeshiftMode(v: unknown): LiveTimeshiftMode {
  return v === "always" || v === "onPause" || v === "off" ? v : LIVE_TIMESHIFT_MODE_DEFAULT;
}

export async function loadLiveTimeshiftMode(): Promise<LiveTimeshiftMode> {
  try { return normalizeLiveTimeshiftMode(await storage.getItem<string>(LIVE_TIMESHIFT_MODE_KEY, LIVE_TIMESHIFT_MODE_DEFAULT)); }
  catch { return LIVE_TIMESHIFT_MODE_DEFAULT; }
}

export async function saveLiveTimeshiftMode(mode: LiveTimeshiftMode): Promise<void> {
  try { await storage.setItem(LIVE_TIMESHIFT_MODE_KEY, normalizeLiveTimeshiftMode(mode)); } catch { /* ayar yazılamazsa varsayılan geçerli */ }
}
