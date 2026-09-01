/**
 * KIZILKAN PLAYER ELITE v16.14.8 — MPV runtime packaging hardening.
 *
 * Cihaz tanısı, libmpv.so + libc++_shared.so APK içinde bulunmasına rağmen
 * dev.jdtech.mpv.MPVLib sınıfının runtime'da yüklenemediğini kanıtladı.
 * Expo local-module transitive dependency zincirine güvenmek yerine uygulama
 * katmanında Maven Central AAR'ını da açıkça ekler ve R8/ProGuard keep kuralını
 * üretir. Bu, local module API'sini değiştirmez; yalnız runtime packaging'i
 * fail-closed hale getirir.
 */
const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DEP = "implementation 'dev.jdtech.mpv:libmpv:1.0.0'";
const KEEP = [
  '',
  '# KIZILKAN PLAYER ELITE v16.14.8 — libmpv runtime class keep',
  '-keep class dev.jdtech.mpv.** { *; }',
  '-keepclassmembers class dev.jdtech.mpv.** { *; }',
  '',
].join('\n');

module.exports = function withMpvRuntime(config) {
  config = withAppBuildGradle(config, cfg => {
    let src = cfg.modResults.contents;
    if (!src.includes(DEP)) {
      const marker = /dependencies\s*\{/;
      if (!marker.test(src)) throw new Error('MPV runtime hardening: app build.gradle dependencies bloğu bulunamadı.');
      src = src.replace(marker, match => `${match}\n    // KIZILKAN v16.14.8: local Expo module transitive packaging yetmezse de AAR doğrudan app runtime classpath\'ine girer.\n    ${DEP}`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });

  config = withDangerousMod(config, ['android', async cfg => {
    const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    let src = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!src.includes('-keep class dev.jdtech.mpv.**')) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, src.replace(/\s*$/, '') + KEEP, 'utf8');
    }
    return cfg;
  }]);
  return config;
};
