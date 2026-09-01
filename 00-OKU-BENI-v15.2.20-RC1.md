# KIZILKAN PLAYER ELITE v15.2.20 RC1 — ÖNCE BUNU OKU

Bu paket v15.2.19 RC1 üzerine hazırlanmıştır.

## Ana amaç
1. GitHub Actions'ta v15.2.19'u durduran `PlaylistContext.tsx` TS2322 (`Promise<boolean | void>` → `Promise<void>`) hatasını gerçek dönüş sözleşmesini koruyarak düzeltmek.
2. Mevcut Black Box V2'yi uygulama seviyesinde "uçuş kayıt cihazı" mimarisine yükseltmek: native Room/WAL event journal + senkron kritik crash/ANR journal + Android process death checkpoint + lifecycle/navigation/player correlation + privacy redaction + anomaly özeti.

## Sürüm
- package/app version: `15.2.20`
- Android versionCode: `150220`
- Native data core: `1.3.0`
- Room schema: `3`

## Doğrulama durumu
- `node tools/denetle.js`: PASS
- v15.2.14 → v15.2.20 bütün hard-gate zinciri: PASS
- v15.2.20 Playlist Promise<void> semantic contract: PASS
- 109 TS/TSX dosyası TypeScript transpile syntax taraması: 0 diagnostic
- Room 2→3 migration SQL: SQLite üzerinde ayrı doğrulandı
- Tam `npx tsc --noEmit`: bu çalışma ortamında proje `node_modules` olmadığı ve internet erişimi bulunmadığı için burada gerçek bağımlılıklarla koşturulamadı. GitHub Actions bu kapıyı gerçek bağımlılık kurulumundan sonra çalıştıracaktır.
- Expo prebuild / Kotlin / Gradle / APK: henüz bu ortamda çalıştırılmadı; CI sonucu gerçek build kanıtıdır.

## Önemli sınır
Flight Recorder v3 güçlü biçimde native hale getirilmiştir; ancak `expo-video` içindeki Media3 ExoPlayer örneğine doğrudan `AnalyticsListener` bağlayan bir fork yapılmamıştır. Media3 tarafında uygulamanın erişebildiği status/error/first-frame olayları, MPV native diagnostic callback'leri ve VLC olayları kaydedilmektedir. Yapılmayan bir entegrasyon yapılmış gibi gösterilmemiştir.
