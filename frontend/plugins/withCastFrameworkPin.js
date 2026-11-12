/**
 * KIZILKAN PLAYER — withCastFrameworkPin (v18.7.36)
 * ===========================================================================
 * BU PLUGIN NE YAPIYOR?
 * ---------------------------------------------------------------------------
 * Kök `android/build.gradle` dosyasına, Chromecast bağımlılık yığınını
 * KANITLANMIŞ-ÇALIŞAN sürümlere KİLİTLEYEN bir `resolutionStrategy.force`
 * bloğu yazar (ayrıca `ext.castFrameworkVersion` sabitlemesini de korur).
 *
 * NEDEN GEREKLİ? (gerçek derleme hatası, 12.11.2026)
 * ---------------------------------------------------------------------------
 * `react-native-google-cast` Chromecast bağımlılığını İKİ yerde DİNAMİK `'+'`
 * sürümüyle çekiyor:
 *   - node_modules/react-native-google-cast/android/build.gradle
 *   - expo autolink'in app/build.gradle'a enjekte ettiği @generated blok
 * ikisi de: play-services-cast-framework:${safeExtGet('castFrameworkVersion','+')}
 *
 * `'+'` = "en yeni ne varsa". Google yeni sürüm (23.0.0) yayınladı; o da
 * geçişli olarak `androidx.mediarouter:1.9.0-beta01` getiriyor ve bu Android
 * Gradle Plugin 9.1.0 İSTİYOR. Proje AGP 8.11.0 kullandığı için derleme şu
 * hatayla PATLADI:
 *   Dependency 'androidx.mediarouter:mediarouter:1.9.0-beta01' requires
 *   Android Gradle plugin 9.1.0 or higher.
 *
 * `dependencyInsight` kanıtı: iki ayrı istek vardı —
 *   react-native-google-cast -> 22.3.1 (ext sabitlemesi burada tuttu)
 *   debugRuntimeClasspath    -> '+'    -> 23.0.0 (app autolink'in '+'ı)
 * Gradle en yükseği (23.0.0) seçince mediarouter 1.9.0-beta01 geliyordu.
 * Bu yüzden `ext` sabitlemesi TEK BAŞINA yetmez; mutlak çözüm `force`'tur.
 *
 * Bu projenin KENDİ kodu değil — dış bağımlılık kayması. v18.7.35 derlemesi
 * (14.10.2026) BAŞARILIYDI çünkü o an `'+'` 22.3.1'e, mediarouter da
 * 1.8.0-beta01'e çözülüyordu (ikisi de Gradle önbelleğinde hâlâ duruyor).
 * 1.8.0-beta01 AGP 8.11 ile DERLENDİ; yalnız 1.9.0-beta01 AGP 9.1 istiyor.
 *
 * ÇÖZÜM: 14.10'da başarıyla derlenen KANITLANMIŞ kombinasyonu force ile
 * kilitleriz: cast-framework 22.3.1 + cast 22.3.1 + mediarouter 1.8.0-beta01.
 * Böylece iki `'+'` de, geçişli mediarouter de bu sürümlere sabitlenir.
 * Google Cast ileride bilerek yükseltilmek istenirse (AGP de yükseltilerek)
 * bu sürümler elle değiştirilebilir.
 */
const { withProjectBuildGradle } = require('@expo/config-plugins');

const CAST_FRAMEWORK_VERSION = '22.3.1';
const CAST_VERSION = '22.3.1';
const MEDIAROUTER_VERSION = '1.8.0-beta01';

const BEGIN = '// @kizilkan cast-framework-pin begin';
const END = '// @kizilkan cast-framework-pin end';

const withCastFrameworkPin = (config) => {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withCastFrameworkPin yalnız Groovy build.gradle destekler.');
    }
    const block = [
      BEGIN,
      `ext.castFrameworkVersion = "${CAST_FRAMEWORK_VERSION}"`,
      'allprojects {',
      '  configurations.all {',
      '    resolutionStrategy {',
      `      force "com.google.android.gms:play-services-cast-framework:${CAST_FRAMEWORK_VERSION}"`,
      `      force "com.google.android.gms:play-services-cast:${CAST_VERSION}"`,
      `      force "androidx.mediarouter:mediarouter:${MEDIAROUTER_VERSION}"`,
      '    }',
      '  }',
      '}',
      END,
    ].join('\n');

    let contents = cfg.modResults.contents;
    const existing = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
    if (existing.test(contents)) {
      contents = contents.replace(existing, block); // idempotent
    } else {
      contents = `${contents.trimEnd()}\n\n${block}\n`;
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
};

module.exports = withCastFrameworkPin;
