/**
 * KIZILKAN PLAYER — withLocalReleaseSigning (v18.2.0)
 * ===========================================================================
 * NE YAPIYOR?
 *   PC'de `gradlew assembleRelease` ile üretilen APK'yı, telefondaki uygulamayla
 *   AYNI release anahtarıyla imzalar → telefona GÜNCELLEME olarak kurulur,
 *   listeler ve Room verisi korunur.
 *
 * ANAHTAR BİLGİLERİ DEPOYA ASLA GİRMEZ. Yalnız PC'deki kullanıcı Gradle
 * ayarlarından okunur: %USERPROFILE%\.gradle\gradle.properties
 *
 *   KIZILKAN_RELEASE_STORE_FILE=C:/Anahtarlar/gpt-kizilkan-release.jks
 *   KIZILKAN_RELEASE_STORE_PASSWORD=...
 *   KIZILKAN_RELEASE_KEY_ALIAS=...
 *   KIZILKAN_RELEASE_KEY_PASSWORD=...
 *
 * Bu ayarlar yoksa (ör. GitHub Actions) hiçbir şey yapmaz. CI kendi imzasını
 * derleme sırasında dosyanın SONUNA ekler (build-apk.yml → gpt-signing.gradle);
 * o blok bundan sonra değerlendirildiği için CI'da her zaman CI imzası geçerlidir.
 * ===========================================================================
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// KIZILKAN v18.2.0: local release signing (only if user gradle.properties has keys)';

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    cfg.modResults.contents += `
${MARKER}
if (project.hasProperty("KIZILKAN_RELEASE_STORE_FILE")) {
    android {
        signingConfigs {
            kizilkanLocalRelease {
                storeFile file(project.property("KIZILKAN_RELEASE_STORE_FILE"))
                storePassword project.property("KIZILKAN_RELEASE_STORE_PASSWORD")
                keyAlias project.property("KIZILKAN_RELEASE_KEY_ALIAS")
                keyPassword project.property("KIZILKAN_RELEASE_KEY_PASSWORD")
            }
        }
        buildTypes {
            release {
                signingConfig signingConfigs.kizilkanLocalRelease
            }
        }
    }
    println("KIZILKAN: yerel release imzasi etkin (gradle.properties)")
}
`;
    return cfg;
  });
