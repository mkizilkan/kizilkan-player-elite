# KIZILKAN PLAYER v16.13.1 RC1 — Doğrulama

- GitHub hata kanıtı: `:kizilkan-native-core:compileReleaseKotlin`, `NativeBlackBox.kt:330:116`.
- Eski positional ANR `insertEvent()` çağrısı kaldırıldı.
- Named arguments ile Flight Recorder V6 parametreleri açık biçimde bağlandı.
- v16.13.1 statik Kotlin signature regression gate: PASS.
- v16.13.0 DB Health/telemetry gate: çalıştırılarak korunma kontrolü yapılır.
- v16.12.2 MAG ve v16.12.1 player/MAG koruma gate'leri çalıştırılır.
- Gerçek Android/Gradle release build sonucu GitHub Actions üzerinde ayrıca doğrulanmalıdır; bu belge onu yapılmış saymaz.
