/**
 * KIZILKAN PLAYER — withDevVariant (v18.2.0)
 * ===========================================================================
 * NE YAPIYOR?
 *   Debug derlemesini AYRI bir uygulama olarak üretir:
 *     paket   : com.gpt.kizilkan.player.dev   (applicationIdSuffix ".dev")
 *     ad      : "KIZILKAN DEV"                 (debug kaynak kümesi app_name)
 *     sürüm   : <sürüm>-dev
 *
 * NEDEN?
 *   Telefondaki asıl uygulama GitHub Secrets'taki release anahtarıyla imzalı.
 *   Debug APK farklı anahtarla imzalandığı için aynı paketin üstüne kurulamıyor;
 *   kaldırmak tüm listeleri ve Room verisini siler (CLAUDE.md §7). Ayrı paket adı
 *   sayesinde DEV uygulaması asıl uygulamanın YANINA kurulur; ikisinin verisi ayrıdır.
 *   Metro (npx expo start) açıkken TypeScript değişiklikleri saniyeler içinde görünür.
 *
 * RELEASE DERLEMESİ ETKİLENMEZ (paket adı, ad ve imza aynen kalır).
 * ===========================================================================
 */
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');

const MARKER = '// KIZILKAN v18.2.0: DEV variant (applicationIdSuffix .dev)';
const DEV_APP_NAME = 'KIZILKAN DEV';

const withDevGradle = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    cfg.modResults.contents += `
${MARKER}
android {
    buildTypes {
        debug {
            applicationIdSuffix ".dev"
            versionNameSuffix "-dev"
        }
    }
}
`;
    return cfg;
  });

const withDevAppName = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'debug', 'res', 'values');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'strings.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<!-- ${MARKER} -->\n<resources>\n  <string name="app_name">${DEV_APP_NAME}</string>\n</resources>\n`,
      );
      return cfg;
    },
  ]);

module.exports = (config) => withDevAppName(withDevGradle(config));
