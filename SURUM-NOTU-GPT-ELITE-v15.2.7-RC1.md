# KIZILKAN PLAYER ELITE v15.2.7-RC1
## Kotlin Chunked Staging Writer Build Fix

GitHub Actions v15.2.6-RC1'de TypeScript HARD gate ve Room KSP aşamalarını geçti; build `:kizilkan-native-core:compileReleaseKotlin` aşamasında tek kanıtlanmış API-signature hatasında durdu.

### Kök neden
`KizilkanNativeCoreModule.kt` chunked staging append yolunda `FileOutputStream(...).bufferedWriter(Charsets.UTF_8, 64 * 1024)` kullanıyordu. Kotlin `OutputStream.bufferedWriter()` extension'ı yalnız charset parametresi kabul ettiği için derleyici `Too many arguments` verdi.

### Düzeltme
Writer artık buffer boyutunu kaybetmeden açık JVM/Kotlin sınıflarıyla kuruluyor: `BufferedWriter(OutputStreamWriter(FileOutputStream(file, true), Charsets.UTF_8), 64 * 1024)`. Aynı modüldeki reader/writer kullanımları tarandı; aynı hatalı writer overload'u başka yerde bulunmadı.

### Korunanlar
v15.2.6 TypeScript normalizasyonu, Room canonical store, chunked staging import, Native EPG, Search/Favorites/VOD/Series paging, Unified Discovery, sunucu kodu/DNS self-heal, Native Player Session Arbiter, Chromecast hardening, RAM/storage/APK telemetry ve MPV 1.0.0 zinciri çıkarılmadan korunur.

### Doğrulama sınırı
Gerçek Kotlin/Gradle APK build sonucu GitHub Actions tarafından yeniden kanıtlanacaktır.
