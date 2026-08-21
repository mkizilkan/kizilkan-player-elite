/**
 * KIZILKAN PLAYER — Babel Yapılandırması
 * Dosya   : frontend/babel.config.js
 * Sürüm   : v1.0.0
 * Faz     : FAZ A / Madde 1
 * Konum   : frontend/ (package.json ile aynı seviye — metro.config.js'in __dirname'i)
 *
 * ---------------------------------------------------------------------------
 * NEDEN BU KADAR SADE? (babel-preset-expo@54.0.12 kaynağı okunarak doğrulandı)
 * ---------------------------------------------------------------------------
 * Aşağıdaki plugin'ler preset tarafından OTOMATİK ekleniyor. Elle eklemek
 * "Duplicate plugin/preset detected" hatası verir — o yüzden EKLENMEDİ:
 *
 *   1) react-native-worklets/plugin
 *      -> build/index.js:286 — `hasModule('react-native-worklets')` true ise
 *         otomatik ekleniyor. Projede react-native-worklets@0.5.1 kurulu
 *         (yarn.lock:6279), Reanimated 4.1.1 bunu kullanıyor. Otomatik gelir.
 *
 *   2) expo-router/babel (expoRouterBabelPlugin)
 *      -> build/index.js:163 — `hasModule('expo-router')` true ise otomatik.
 *
 *   3) @babel/preset-typescript, preset-react, flow-strip-types,
 *      transform-runtime, react-native-web dönüşümü
 *      -> preset'in kendi dependency listesinde, hepsi otomatik.
 *
 * EĞER Reanimated animasyonları çalışmazsa ("worklet is not a function" vb.):
 * preset'in otomatik eklemesini kapatıp elle kontrol alabilirsin:
 *
 *   presets: [['babel-preset-expo', { worklets: false }]],
 *   plugins: ['react-native-worklets/plugin'],   // HER ZAMAN EN SONDA
 *
 * ---------------------------------------------------------------------------
 * ORTAM DEĞİŞKENLERİ HAKKINDA
 * ---------------------------------------------------------------------------
 * `EXPO_PUBLIC_*` ile başlayan değişkenler (api.ts ve googleDrive.ts bunları
 * kullanıyor) Expo tarafından .env dosyasından OTOMATİK okunur ve bundle'a
 * gömülür. Bunun için ekstra bir babel plugin'ine GEREK YOKTUR.
 *
 * package.json'daki `react-native-dotenv@3.4.11` şu an hiçbir yerde
 * kullanılmıyor (grep: 0 sonuç). Kaldırmak yerine devre dışı bıraktım —
 * kullanmak istersen alttaki bloğu aç ve `import { X } from '@env'` yaz.
 * Not: EXPO_PUBLIC_* mekanizmasıyla birlikte kullanmak karışıklık yaratır,
 * ikisinden birini seçmeni öneririm.
 * ---------------------------------------------------------------------------
 */

module.exports = function (api) {
  // Babel'in bu yapılandırmayı önbelleğe almasını sağlar.
  // NODE_ENV'e göre farklılaşmadığı için `true` güvenli ve en hızlısıdır.
  api.cache(true);

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // JSX'i otomatik runtime ile derle (React 19 için doğru olan bu).
          jsxRuntime: 'automatic',

          // --- React Compiler notu ---
          // Preset, React Compiler'ı yalnızca Metro caller flag'i ile açar,
          // yani app.json -> experiments.reactCompiler:true olmadan çalışmaz.
          // FAZ D'de (performans fazı) manuel React.memo yerine bunu
          // değerlendireceğiz. Şimdilik kapalı — davranış değişikliği
          // yaratmaması için bilinçli tercih.
        },
      ],
    ],

    plugins: [
      // --- react-native-dotenv (şu an DEVRE DIŞI) ---
      // Açmak istersen bu bloğun yorumunu kaldır:
      //
      // ['module:react-native-dotenv', {
      //   envName: 'APP_ENV',
      //   moduleName: '@env',
      //   path: '.env',
      //   safe: false,
      //   allowUndefined: true,
      //   verbose: false,
      // }],
      //
      // UYARI: react-native-worklets/plugin kullanılıyorsa (Reanimated 4),
      // o plugin listenin EN SONUNDA olmak zorundadır. Preset onu otomatik
      // eklediği için buraya eklenen her plugin ondan ÖNCE çalışır — bu
      // doğru sıralamadır, endişelenme.
    ],
  };
};
