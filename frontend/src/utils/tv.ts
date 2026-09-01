/**
 * KIZILKAN PLAYER — TV Box / Kumanda Desteği
 * Dosya  : frontend/src/utils/tv.ts
 * Sürüm  : v1.0.0 (v5.2.0)
 *
 * ===========================================================================
 * TASARIM KARARI — TV DESTEĞİ VE react-native-tvos FORK'U (v9.12.0 güncellemesi)
 * ===========================================================================
 * DÜZELTME: Bu dosyanın eski başlığı "fork'u KULLANMIYORUZ" diyordu; bu artık
 * YANLIŞ. Proje GERÇEKTE fork'u kullanıyor:
 *   package.json → "react-native": "npm:react-native-tvos@0.81.5-2"
 *   app.json     → "@react-native-tvos/config-tv" ({ isTV: true })
 * Fork'a onFocus/onBlur ve TV odak API'leri için geçildi (v6.x fork migrasyonu).
 *
 * Yine de aşağıdaki temel yaklaşım geçerli: kullanıcının cihazlarında
 * (Chromecast HD, Homatics R 4K+, Fire TV 4K Max, Wanbo Mozart) ORTAK PAYDA
 * D-pad (4 yön) + OK + Geri + Ana Sayfa'dır ve bunlar standart Android odak
 * sistemiyle çalışır:
 *   - D-pad yön tuşları  -> odak (focus) gezinmesi
 *   - OK / ENTER         -> onPress
 *   - Geri               -> BackHandler
 *
 * Bu yüzden: sıfır riskle, odak tabanlı mükemmel bir TV deneyimi kuruyoruz.
 * CH+/- gibi ekstra tuşlar ileride küçük bir native eklenti ile eklenebilir.
 * ===========================================================================
 */

import { Platform, Dimensions } from "react-native";
import { storage } from "./storage";

const TV_MODE_KEY = "kizilkan.tvMode"; // "auto" | "on" | "off"

export type TvMode = "auto" | "on" | "off";

/**
 * Cihaz bir TV/kutu mu?
 * Platform.isTV Android TV (leanback) cihazlarda true döner.
 * Bazı ucuz kutular leanback bildirmez; bu yüzden kullanıcı ayarlardan
 * elle de açabilir (TvMode = "on").
 */
export function isTvDevice(): boolean {
  try {
    // @ts-ignore - Platform.isTV her sürümde tip tanımında olmayabilir
    if (Platform.isTV === true) return true;
  } catch { /* yoksay */ }
  return false;
}

/** Kullanıcı tercihi + otomatik algılamayı birleştirir. */
export async function resolveTvMode(): Promise<boolean> {
  const pref = await storage.getItem<string>(TV_MODE_KEY, "auto");
  if (pref === "on") return true;
  if (pref === "off") return false;
  return isTvDevice();
}

export async function saveTvMode(mode: TvMode): Promise<void> {
  await storage.setItem(TV_MODE_KEY, mode);
}

export async function loadTvModePref(): Promise<TvMode> {
  const v = await storage.getItem<string>(TV_MODE_KEY, "auto");
  return v === "on" || v === "off" || v === "auto" ? v : "auto";
}

/**
 * OVERSCAN GÜVENLİ KENAR
 * Eski/ucuz TV'lerde ve projeksiyonlarda görüntünün kenarları kırpılır.
 * TV modunda içeriği kenardan bu kadar içeride tutuyoruz.
 * (Wanbo gibi projeksiyon cihazlarında bu özellikle önemli.)
 */
export const TV_OVERSCAN = 24;

/**
 * TV'de odaklanan öğenin görsel vurgusu.
 * TV uygulamalarındaki 1 numaralı şikâyet "neredeyim göremiyorum" olduğu için
 * vurgu BELİRGİN olmalı: kalın çerçeve + hafif büyüme + gölge.
 */
export const TV_FOCUS = {
  borderWidth: 3,
  scale: 1.06,
  /** Odaklı öğe için gölge/parlama (Android elevation). */
  elevation: 12,
};

/**
 * Odaklanabilir bir öğe için stil üretir.
 * @param focused Öğe şu an odakta mı
 * @param accent  Marka rengi (odak çerçevesi)
 */
export function focusStyle(focused: boolean, accent: string) {
  if (!focused) return null;
  return {
    borderColor: accent,
    borderWidth: TV_FOCUS.borderWidth,
    elevation: TV_FOCUS.elevation,
    transform: [{ scale: TV_FOCUS.scale }],
  };
}

/** TV'de listelerde bir ekranda kaç sütun gösterilsin. */
export function tvColumns(): number {
  const { width } = Dimensions.get("window");
  if (width >= 1600) return 6;
  if (width >= 1200) return 5;
  return 4;
}

/**
 * TV'de yazı boyutlarını büyütmek için çarpan.
 * Kullanıcı ekrana 2-3 metre uzaktan bakıyor.
 */
export const TV_TEXT_SCALE = 1.15;
