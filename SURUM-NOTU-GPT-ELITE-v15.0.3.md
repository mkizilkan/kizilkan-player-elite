# KIZILKAN PLAYER ELITE v15.0.3 — MPV 0.5.1 KOTLIN API BUILD FIX

## Amaç
v15.0.2 temiz CI çalışmasında TypeScript, Expo prebuild, release signing ve Android hazırlık kapıları geçildikten sonra ortaya çıkan `:mpv-player:compileReleaseKotlin` hatasını, mevcut playback mimarisini ve `dev.jdtech.mpv:libmpv:0.5.1` bağımlılığını koruyarak düzeltir.

## Kök neden
`libmpv:0.5.1` AAR'ı `MPVLib.java` tabanlıdır. Format, event ve log-level değerleri `MPVLib` üzerinde `public static final int` alanlarıdır. v15.0.2 adapter'ı ise daha yeni Kotlin wrapper yüzeyindeki `MPVLib.MpvFormat`, `MPVLib.MpvEvent` ve `MPVLib.MpvLogLevel` nested-object adlarını kullanıyordu. Bu nedenle Kotlin derleyicisi bu üç sembolü çözemiyordu.

## Düzeltmeler
- `MpvFormat.*` kullanımları gerçek 0.5.1 API'sindeki `MPVLib.MPV_FORMAT_*` sabitlerine geçirildi.
- `MpvEvent.*` kullanımları `MPVLib.MPV_EVENT_*` sabitlerine geçirildi.
- `MPVLib.MpvLogLevel.MPV_LOG_LEVEL_ERROR` kullanımı `MPVLib.MPV_LOG_LEVEL_ERROR` olarak düzeltildi.
- `EventObserver` ve `LogObserver` sözleşmeleri, property observation, FILE_LOADED / VIDEO_RECONFIG / PLAYBACK_RESTART / END_FILE akışları korunmuştur.
- SurfaceView attach/detach, Android 14 surface lifecycle, HW decode + software fallback, buffer ve PlayerHost fallback mimarisi değiştirilmemiştir.
- Hard gate'e 0.5.1 API regresyon kontrolü eklendi; nested yeni-API sembollerinin tekrar girmesi hata sayılır.
- Uygulama sürümü 15.0.3 / Android versionCode 150003 / iOS build 15.0.3 olarak yükseltildi.

## Bilinçli olarak yapılmayan değişiklik
`dev.jdtech.mpv:libmpv` 1.0.0'a bu build-fix içinde yükseltilmemiştir. 1.0.0 instance tabanlı breaking API'ye geçiş, APK üretimi doğrulandıktan sonra ayrı bir migration sürümünde yapılacaktır.

## Başarı koşulu
Paket ancak temiz GitHub CI'da `denetle.js`, `npx tsc --noEmit`, Expo prebuild, signing, `:mpv-player:compileReleaseKotlin`, tam Gradle release build ve APK artifact üretimi başarıyla tamamlandığında başarılı kabul edilir.
