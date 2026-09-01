/**
 * KIZILKAN PLAYER — Android TV / TV Box Config Plugin
 * Dosya   : frontend/plugins/withAndroidTV.js
 * Sürüm   : v1.0.0
 * Faz     : FAZ A / Madde 3 (app.json'a bağlanır)
 *
 * ---------------------------------------------------------------------------
 * NE İŞE YARIYOR?
 * ---------------------------------------------------------------------------
 * app.json tek başına AndroidManifest'e <uses-feature> yazamaz ve MainActivity'ye
 * LEANBACK_LAUNCHER kategorisi ekleyemez. Bu plugin prebuild sırasında
 * AndroidManifest.xml'i açıp aşağıdakileri ekler:
 *
 *   1. <uses-feature android:name="android.software.leanback" required="false" />
 *      -> Uygulamanın TV özellikli olduğunu bildirir. required=false olduğu için
 *         telefon/tablet kurulumunu ENGELLEMEZ. (Tek APK, üç cihaz.)
 *
 *   2. <uses-feature android:name="android.hardware.touchscreen" required="false" />
 *      -> Android TV kuralı: dokunmatik ekran ZORUNLU olmamalı. Bu satır olmadan
 *         APK, TV Box'a "uyumsuz cihaz" diye kurulamaz veya Play'de görünmez.
 *
 *   3. <uses-feature android:name="android.hardware.microphone" required="false" />
 *      -> KRİTİK: app.json'da RECORD_AUDIO izni var. Android bu izni gördüğünde
 *         mikrofon donanımını ÖRTÜK OLARAK ZORUNLU sayar. Çoğu TV Box'ta mikrofon
 *         yoktur -> kurulum reddedilir. Bu satır o örtük zorunluluğu iptal eder.
 *
 *   4. <uses-feature android:name="android.hardware.faketouch" required="false" />
 *      -> D-pad ile "sanal dokunuş" üreten cihazlar için uyumluluk.
 *
 *   5. <application android:banner="..." />
 *      -> Android TV ana ekranında görünen 320x180 afiş. Banner olmadan uygulama
 *         TV launcher'da görünmez.
 *
 *   6. MainActivity'nin MAIN intent-filter'ına LEANBACK_LAUNCHER kategorisi
 *      -> TV launcher'ın uygulamayı listelemesi için ZORUNLU. Mevcut LAUNCHER
 *         kategorisi korunur, sadece yanına eklenir (telefon davranışı bozulmaz).
 *
 * ---------------------------------------------------------------------------
 * BANNER GÖRSELİ
 * ---------------------------------------------------------------------------
 * Plugin, `assets/images/tv-banner.png` dosyasını arar:
 *   - VARSA  -> res/drawable/tv_banner.png olarak kopyalar, @drawable/tv_banner kullanır
 *   - YOKSA  -> güvenli yedek olarak @mipmap/ic_launcher kullanır (build ASLA kırılmaz)
 *
 * Şu an projede tv-banner.png yok, o yüzden ic_launcher kullanılacak. Uygulama
 * TV'de görünür ve çalışır, sadece afiş kare olur. 320x180 px bir PNG'yi
 * assets/images/tv-banner.png olarak koyduğun an otomatik devreye girer —
 * kod değişikliği gerekmez.
 * ---------------------------------------------------------------------------
 */

const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/** Varsayılan ayarlar — app.json'dan override edilebilir. */
const DEFAULTS = {
  /** Banner kaynak dosyası (proje köküne göre göreli yol). */
  banner: 'assets/images/tv-banner.png',
  /** Banner bulunamazsa kullanılacak yedek drawable referansı. */
  fallbackBanner: '@mipmap/ic_launcher',
  /** false yaparsan uygulama SADECE TV'ye kurulur (önerilmez). */
  leanbackRequired: false,
};

/** res/drawable içine kopyalanacak dosya adı (uzantısız). */
const BANNER_RES_NAME = 'tv_banner';

/**
 * Bir <uses-feature> girdisini ekler ya da varsa günceller (idempotent).
 * Aynı plugin iki kez çalışsa bile manifest'te tekrar oluşmaz.
 */
function upsertUsesFeature(androidManifest, name, required) {
  const manifest = androidManifest.manifest;

  if (!Array.isArray(manifest['uses-feature'])) {
    manifest['uses-feature'] = [];
  }

  const existing = manifest['uses-feature'].find(
    (item) => item?.$?.['android:name'] === name
  );

  if (existing) {
    existing.$['android:required'] = String(required);
    return;
  }

  manifest['uses-feature'].push({
    $: {
      'android:name': name,
      'android:required': String(required),
    },
  });
}

/**
 * MainActivity'nin MAIN action'lı intent-filter'ına LEANBACK_LAUNCHER ekler.
 * Mevcut kategoriler (LAUNCHER dahil) korunur.
 */
function addLeanbackLauncherCategory(androidManifest) {
  const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);

  if (!Array.isArray(mainActivity['intent-filter'])) {
    mainActivity['intent-filter'] = [];
  }

  // MAIN action'ı taşıyan filtreyi bul.
  let mainFilter = mainActivity['intent-filter'].find((filter) =>
    (filter?.action ?? []).some(
      (action) => action?.$?.['android:name'] === 'android.intent.action.MAIN'
    )
  );

  // Beklenmedik durum: MAIN filtresi yoksa eksiksiz bir tane oluştur.
  if (!mainFilter) {
    mainFilter = {
      action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
      category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
    };
    mainActivity['intent-filter'].push(mainFilter);
  }

  if (!Array.isArray(mainFilter.category)) {
    mainFilter.category = [];
  }

  const hasLeanback = mainFilter.category.some(
    (c) => c?.$?.['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER'
  );

  if (!hasLeanback) {
    mainFilter.category.push({
      $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' },
    });
  }

  /**
   * TELEFON BAŞLATICISI GARANTİSİ (v7.0.0)
   * react-native-tvos'un config-tv eklentisi, TV hedefi seçildiğinde MAIN
   * filtresinden normal LAUNCHER kategorisini KALDIRABİLİR. O durumda uygulama
   * telefonda uygulama çekmecesinde GÖRÜNMEZ olur.
   * Kullanıcı tek APK'yı hem telefonda hem TV Box'ta kullandığı için ikisi de
   * bulunmalı. Bu plugin config-tv'den SONRA çalışır ve eksikse geri ekler.
   */
  const hasPhoneLauncher = mainFilter.category.some(
    (c) => c?.$?.['android:name'] === 'android.intent.category.LAUNCHER'
  );

  if (!hasPhoneLauncher) {
    mainFilter.category.push({
      $: { 'android:name': 'android.intent.category.LAUNCHER' },
    });
  }
}

/** <application> etiketine android:banner özniteliğini yazar. */
function setApplicationBanner(androidManifest, bannerRef) {
  const application = androidManifest?.manifest?.application?.[0];
  if (!application) return;
  application.$['android:banner'] = bannerRef;
}

/**
 * Ana plugin.
 * @param {import('@expo/config-types').ExpoConfig} config
 * @param {Partial<typeof DEFAULTS>} userOptions
 */
const withAndroidTV = (config, userOptions = {}) => {
  const options = { ...DEFAULTS, ...userOptions };

  // --- 1) Manifest düzenlemeleri -------------------------------------------
  config = withAndroidManifest(config, (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const bannerSource = path.resolve(projectRoot, options.banner);
    const bannerExists = fs.existsSync(bannerSource);
    const bannerRef = bannerExists
      ? `@drawable/${BANNER_RES_NAME}`
      : options.fallbackBanner;

    // TV uyumluluk bayrakları
    upsertUsesFeature(cfg.modResults, 'android.software.leanback', options.leanbackRequired);
    upsertUsesFeature(cfg.modResults, 'android.hardware.touchscreen', false);
    upsertUsesFeature(cfg.modResults, 'android.hardware.faketouch', false);
    // RECORD_AUDIO izninin doğurduğu örtük mikrofon zorunluluğunu iptal eder
    upsertUsesFeature(cfg.modResults, 'android.hardware.microphone', false);

    setApplicationBanner(cfg.modResults, bannerRef);
    addLeanbackLauncherCategory(cfg.modResults);

    if (!bannerExists) {
      console.log(
        `[withAndroidTV] TV afişi bulunamadı (${options.banner}). ` +
        `Yedek olarak ${options.fallbackBanner} kullanılıyor. ` +
        `320x180 px bir PNG eklersen otomatik devreye girer.`
      );
    }

    return cfg;
  });

  // --- 2) Banner dosyasını res/drawable içine kopyala -----------------------
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot; // android/app değil, android/
      const bannerSource = path.resolve(projectRoot, options.banner);

      if (!fs.existsSync(bannerSource)) {
        // Afiş yok — sessizce geç. Manifest zaten ic_launcher'a işaret ediyor.
        return cfg;
      }

      const drawableDir = path.join(
        platformRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable'
      );

      try {
        fs.mkdirSync(drawableDir, { recursive: true });
        fs.copyFileSync(
          bannerSource,
          path.join(drawableDir, `${BANNER_RES_NAME}.png`)
        );
        console.log(`[withAndroidTV] TV afişi kopyalandı -> res/drawable/${BANNER_RES_NAME}.png`);
      } catch (e) {
        // Kopyalama başarısız olursa build'i kırma — sadece uyar.
        console.warn(`[withAndroidTV] TV afişi kopyalanamadı: ${e.message}`);
      }

      return cfg;
    },
  ]);

  return config;
};

module.exports = withAndroidTV;
