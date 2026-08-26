# SÜRÜM NOTU — KIZILKAN PLAYER ELITE v15.2.20 RC1

**Sürüm:** 15.2.20
**Android versionCode:** 150220
**Ana başlık:** TypeScript Build Corrective + KIZILKAN Flight Recorder V3

## Build düzeltmesi
v15.2.19 GitHub Actions TS2322 hatası `PlaylistContext` active playlist persist queue'da düzeltildi. `storage.setItem()` boolean döndürdüğü için Promise<void> kuyruğuna doğrudan döndürülmesi yasaklandı; callback await edip void tamamlanıyor.

## Flight Recorder V3
- Native Room/WAL append-only event store
- Native senkron crash/ANR critical journal
- Uncaught exception stack/memory kaydı + handler delegation
- Main-thread stall watchdog
- Android 11+ processStateSummary checkpoint
- ApplicationExitInfo korelasyonu
- Memory/thread/FD snapshot
- Media3/VLC/MPV error/diagnostic correlation
- Route/AppState correlation
- Privacy sanitizer ve hashed host
- Automatic anomaly export
- Stats ekranında Flight Recorder health

## Yapılmayan / yanlış temsil edilmeyecek şeyler
- Bu ortamda tam bağımlılıklı `npx tsc --noEmit` çalıştırılamadı; `node_modules` yok ve registry erişimi kapalı.
- Expo prebuild, Kotlin compile, Gradle release ve APK cihaz testi bu ortamda yapılmadı.
- Expo-video içindeki ExoPlayer'a doğrudan Media3 AnalyticsListener bağlanmadı; erişilebilir JS/native player eventleri kullanıldı.
