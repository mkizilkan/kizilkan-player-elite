# KIZILKAN PLAYER v16.13.0 RC1

**Sürüm:** 16.13.0  
**Android versionCode:** 161300  
**Odak:** Database Health Center / Safe Room Maintenance / Flight Recorder V6

## Öne çıkanlar
- Room schema v4 ve explicit `MIGRATION_3_4`.
- DB/WAL/SHM boyutları, freelist/reclaimable analizi, orphan ve retention adayları.
- `quick_check` + `foreign_key_check` destekli tanılama.
- Diagnose / Quick / Normal / Deep bakım katmanları.
- Deep bakımda kullanıcı onaylı VACUUM.
- 7 gün normal, 30 gün kritik telemetry retention; 14 gün eski EPG retention.
- Playlist bazlı gerçek satır sayıları ve logical media payload byte ölçümü.
- Ölçüme dayalı `healthReasons` + `recommendedMaintenance`.
- Flight Recorder V6 structured trace/operation/stage telemetry.
- Performance p50/p95/max ve trace summary export.
- İki aşamalı sensitive-value redaction.
- v16.12.2 MAG/player güvenlik ve regresyon sözleşmelerinin korunması.

## Dürüst doğrulama sınırı
Kaynak paketinde Android Gradle/prebuild projesi ve gerekli Android/Expo bağımlılıkları bulunmadığından native Kotlin/Room kodu bu ortamda gerçek APK Gradle build ile derlenemedi. `kotlinc` ile yapılan sözdizimi taramasında yeni kod için syntax-benzeri hata görülmedi; Android/Room referanslarının classpath'te olmaması nedeniyle unresolved-reference hataları beklenir. Gerçek native compile/package/runtime doğrulaması CI/GitHub build + cihaz kabul testinde yapılmalıdır.

Tam project TypeScript gate'leri de kaynakta `node_modules` ve `expo/tsconfig.base` olmadığı için PASS kabul edilmemiştir.
