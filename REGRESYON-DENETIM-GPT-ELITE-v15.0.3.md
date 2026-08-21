# KIZILKAN PLAYER ELITE v15.0.3 — REGRESYON DENETİMİ

## Korunan mimari
- Media3 → MPV/FFmpeg → VLC playback/fallback zinciri korunmuştur.
- MPV bağımlılığı `dev.jdtech.mpv:libmpv:0.5.1` olarak korunmuştur.
- MPV SurfaceView, opaque compositor politikası ve Android 14 attachment lifecycle korunmuştur.
- Donanım decode tercihi ve mpv/FFmpeg software fallback davranışı korunmuştur.
- Progress, buffering, video-ready, track ve error event sözleşmeleri korunmuştur.

## v15.0.2 CI kök hata doğrulaması
CI hata kümesi yalnızca `MpvEvent`, `MpvFormat` ve `MpvLogLevel` sembollerinin 0.5.1 artifact yüzeyinde bulunmamasına işaret etmiştir. Upstream v0.5.1 `MPVLib.java` bu değerleri doğrudan `MPVLib.MPV_*` static alanları olarak tanımlar. v15.0.3 adapter'ı bu gerçek sözleşmeye hizalanmıştır.

## Statik kapı
`tools/checkplayercore.js`, `MPVLib.MpvFormat`, `MPVLib.MpvEvent`, `MPVLib.MpvLogLevel` veya bunların importlarının tekrar eklenmesini regresyon olarak reddeder ve gerekli 0.5.1 sabitlerinin adapter'da bulunmasını denetler.

## CI'da doğrulanacak
1. `node tools/denetle.js`
2. `npx tsc --noEmit`
3. Expo Android prebuild
4. Release signing
5. `:mpv-player:compileReleaseKotlin`
6. Tam Gradle release APK build
7. APK artifact / version / signing doğrulaması

## Sonuç statüsü
Kaynak düzeltmesi hazırlanmıştır. GitHub CI ve gerçek APK üretimi tamamlanmadan build başarılı ilan edilmez.
