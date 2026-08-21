// Native Google Cast binding — Metro tarafından iOS/Android'de çözülür.
// v4.9.0: Paketin NATIVE CastButton bileşeni de dışa aktarılıyor.
// Google'ın resmi butonu cihaz seçiciyi native olarak açar; kendi
// TouchableOpacity'mizle showCastDialog() çağırmak bazı cihazlarda sessizce
// başarısız oluyordu (cihaz listesi hiç görünmüyordu).
export const GoogleCast: any = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-google-cast");
    return mod.default || mod;
  } catch {
    return null;
  }
})();

/** Paketin native Cast butonu (MediaRouteButton). Yoksa null. */
export const NativeCastButton: any = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-google-cast");
    return mod.CastButton || null;
  } catch {
    return null;
  }
})();
