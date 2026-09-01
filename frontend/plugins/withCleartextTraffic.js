/**
 * KIZILKAN PLAYER — Cleartext (HTTP) Trafik Config Plugin
 * Dosya   : frontend/plugins/withCleartextTraffic.js
 * Sürüm   : v1.0.0
 * Faz     : FAZ A.1 (acil düzeltme — http yayınların oynamaması)
 *
 * ===========================================================================
 * SORUNUN KESİN SEBEBİ (paket kaynakları okunarak doğrulandı)
 * ===========================================================================
 * app.json'da şu satır vardı:
 *
 *     "android": { "usesCleartextTraffic": true }
 *
 * Bu satır HİÇBİR İŞE YARAMIYOR. Doğrulama:
 *
 *   @expo/config-plugins@54 içindeki Android plugin listesi:
 *     AllowBackup, BuildProperties, Colors, EasBuild, GoogleMapsApiKey,
 *     GoogleServices, IntentFilters, Locales, Manifest, Name, Orientation,
 *     Package, Paths, Permissions, PredictiveBackGesture, PrimaryColor,
 *     Properties, Resources, Scheme, StatusBar, Strings, Styles, Updates,
 *     Version, WindowSoftInputMode
 *
 *   -> Bu listede cleartext'i işleyen HİÇBİR plugin yok. `usesCleartextTraffic`
 *      sadece bir TypeScript tip tanımı olarak geçiyor (Manifest.d.ts:75),
 *      yani "manifest'te böyle bir öznitelik olabilir" demek — onu YAZAN kod
 *      yok. app.json'daki değer sessizce yok sayılıyor.
 *
 *   -> Bu özniteliği yazan TEK yer `expo-build-properties` paketidir
 *      (build/android.js:199 withAndroidCleartextTraffic). Ama o da değeri
 *      KENDİ props'undan okuyor:
 *          props.android?.usesCleartextTraffic
 *      Projede expo-build-properties'e sadece { minSdkVersion: 26 } veriliyordu.
 *
 * SONUÇ: Üretilen APK'nın AndroidManifest'inde cleartext izni HİÇ YOKTU.
 * Android 9 (API 28) ve üstünde varsayılan `cleartextTrafficPermitted=false`
 * olduğu için TÜM http:// yayınları sistem tarafından engellendi.
 * https:// çalışıyordu çünkü şifreli trafik bu kısıtlamaya tabi değil.
 * Gördüğün belirti tam olarak buydu.
 *
 * ===========================================================================
 * BU PLUGIN NE YAPIYOR?
 * ===========================================================================
 * İki katmanlı, birbirinden bağımsız garanti kuruyor:
 *
 *   1. <application android:usesCleartextTraffic="true">
 *      Doğrudan manifest özniteliği. expo-build-properties'e bağımlı değil.
 *
 *   2. res/xml/network_security_config.xml + android:networkSecurityConfig
 *      Android 7+ Network Security Config. Bir networkSecurityConfig
 *      tanımlıysa usesCleartextTraffic özniteliğinin ÖNÜNE geçer — bu yüzden
 *      ikisini de tutarlı biçimde "izin ver" olarak ayarlıyoruz. Bazı TV Box
 *      ROM'ları (özellikle Çin menşeli AOSP türevleri) sadece birine bakar.
 *
 * app.json'daki expo-build-properties ayarı da ayrıca düzeltildi. Yani üç
 * bağımsız yol da aynı sonucu veriyor; biri çalışmazsa diğeri yakalar.
 *
 * ===========================================================================
 * GÜVENLİK NOTU
 * ===========================================================================
 * Cleartext açmak bir güvenlik gevşetmesidir: http trafiği şifrelenmez ve
 * aradaki biri (ISP, ortak Wi-Fi) içeriği görebilir/değiştirebilir. IPTV
 * sağlayıcılarının ezici çoğunluğu http kullandığı için bu uygulama tipinde
 * ZORUNLUDUR — TiviMate, Vu IPTV Player ve OTT Navigator dahil hepsi aynısını
 * yapar. `allowedDomains` seçeneğiyle sadece belirli alan adlarına izin verip
 * kalanını kapatabilirsin (aşağıya bak).
 */

const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  /** Tüm alan adlarına http izni ver. false yaparsan sadece allowedDomains geçerli olur. */
  allowAll: true,
  /**
   * allowAll:false iken http'ye izin verilecek alan adları.
   * Örn: ["provider1.com", "cdn.provider1.com"]
   */
  allowedDomains: [],
  /**
   * Kullanıcının kurduğu sertifikalara güven (mitmproxy/Charles ile hata
   * ayıklamak için). Üretimde false bırak — true yapmak MITM riskini artırır.
   */
  trustUserCerts: false,
};

const RES_FILE_NAME = 'network_security_config.xml';
const RES_REFERENCE = '@xml/network_security_config';

/** network_security_config.xml içeriğini üretir. */
function buildNetworkSecurityConfigXml(options) {
  const trustAnchors = options.trustUserCerts
    ? [
        '        <trust-anchors>',
        '            <certificates src="system" />',
        '            <certificates src="user" />',
        '        </trust-anchors>',
      ].join('\n')
    : [
        '        <trust-anchors>',
        '            <certificates src="system" />',
        '        </trust-anchors>',
      ].join('\n');

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!--',
    '  KIZILKAN PLAYER — otomatik üretildi (plugins/withCleartextTraffic.js)',
    '  Bu dosyayı elle düzenleme; prebuild sırasında üzerine yazılır.',
    '-->',
    '<network-security-config>',
  ];

  if (options.allowAll) {
    lines.push('    <base-config cleartextTrafficPermitted="true">');
    lines.push(trustAnchors);
    lines.push('    </base-config>');
  } else {
    // Varsayılan kapalı, sadece listelenen alan adlarına açık.
    lines.push('    <base-config cleartextTrafficPermitted="false">');
    lines.push(trustAnchors);
    lines.push('    </base-config>');

    if (options.allowedDomains.length > 0) {
      lines.push('    <domain-config cleartextTrafficPermitted="true">');
      for (const domain of options.allowedDomains) {
        lines.push(`        <domain includeSubdomains="true">${domain}</domain>`);
      }
      lines.push(trustAnchors);
      lines.push('    </domain-config>');
    }
  }

  lines.push('</network-security-config>');
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {import('@expo/config-types').ExpoConfig} config
 * @param {Partial<typeof DEFAULTS>} userOptions
 */
const withCleartextTraffic = (config, userOptions = {}) => {
  const options = { ...DEFAULTS, ...userOptions };

  // --- 1) Manifest: iki özniteliği de yaz ----------------------------------
  config = withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);

    application.$['android:usesCleartextTraffic'] = 'true';
    application.$['android:networkSecurityConfig'] = RES_REFERENCE;

    return cfg;
  });

  // --- 2) res/xml/network_security_config.xml dosyasını yaz ----------------
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );

      try {
        fs.mkdirSync(xmlDir, { recursive: true });
        fs.writeFileSync(
          path.join(xmlDir, RES_FILE_NAME),
          buildNetworkSecurityConfigXml(options),
          'utf8'
        );
        console.log(
          `[withCleartextTraffic] res/xml/${RES_FILE_NAME} yazıldı ` +
          `(http izni: ${options.allowAll ? 'TÜM alan adları' : options.allowedDomains.join(', ') || 'YOK'})`
        );
      } catch (e) {
        // Bu dosya yazılamazsa manifest @xml/... referansı kırılır ve build
        // patlar. Sessizce geçmek yerine net biçimde haber ver.
        throw new Error(
          `[withCleartextTraffic] ${RES_FILE_NAME} yazılamadı: ${e.message}`
        );
      }

      return cfg;
    },
  ]);

  return config;
};

module.exports = withCleartextTraffic;
