# KIZILKAN PLAYER ELITE v15.0.4 — CERTIFICATE GATE FIX + AI DEVİR SÖZLEŞMESİ

## Amaç
v15.0.3 GitHub CI'da APK'nın gerçekten üretilmesi ve `apksigner verify` aşamasının geçmesinden sonra, doğru yeni kalıcı keystore sertifikasının eski hard-coded SHA-256 nedeniyle reddedilmesini kökünden düzeltir. Aynı sürümde sohbet bağlam kaybını önleyen zorunlu AI devir belgesi altyapısı eklenir.

## Gerçek v15.0.3 sonucu
- `denetle.js`: geçti.
- `npx tsc --noEmit`: geçti.
- Expo prebuild: geçti.
- Kalıcı signing: geçti.
- MPV 0.5.1 Kotlin compile: geçti.
- Full Gradle release: geçti ve `app-release.apk` oluştu.
- Package ID / versionCode: doğrulandı.
- `apksigner verify`: geçti.
- Son gate: eski sabit sertifika fingerprint'i yeni resmi keystore ile uyuşmadığı için kırıldı.
- Yerel `keytool` fingerprint'i ile CI'nin APK'dan okuduğu fingerprint birebir eşleşti; signing doğruydu.

## v15.0.4 düzeltmesi
- Workflow'daki hard-coded expected certificate SHA-256 kaldırıldı.
- `ANDROID_CERT_SHA256` Repository Secret zorunlu release signing sözleşmesine eklendi.
- APK ve expected fingerprint büyük harf/kolon/boşluk farklarından arındırılarak normalize edilir.
- Expected secret tam 64 hexadecimal karakter değilse HARD FAIL.
- APK fingerprint eşleşmiyorsa HARD FAIL.
- Beklenen secret fingerprint log'a yazılmaz.
- Güvenlik gate'i kaldırılmadı; repo kaynak kodundan secret tabanlı kalıcı kimliğe taşındı.

## Yeni sohbet / AI devir sözleşmesi
- ZIP köküne `AI-PROJE-DEVIR-BAGLAM.md` eklendi.
- `DEVIR-NOTU.md` v15.0.4'e güncellendi ve ayrıntılı belgeye yönlendirildi.
- `tools/checkplayercore.js` bu belgeyi ve kritik güncellik tokenlarını HARD gate ile kontrol eder.
- Bundan sonraki her ZIP'te yapılanlar, gerçek test durumu, sorunlar, kök nedenler, çözümler, kalan işler ve sonraki plan bu belgede güncellenecektir.

## Korunan yapı
Media3 → MPV/FFmpeg → VLC, libmpv 0.5.1, SurfaceView/TV reliability, session/generation gate'leri, stall recovery, buffer profilleri, VLC health ve v14/v15 özellikleri değiştirilmemiştir.

## Sürüm
- version: 15.0.4
- buildNumber: 15.0.4
- Android versionCode: 150004
- package: com.gpt.kizilkan.player

## Kullanıcı tarafından yapılacak GitHub Secret
`ANDROID_CERT_SHA256` eklenmelidir. Değer, kalıcı release keystore'un `keytool -list -v` çıktısındaki SHA256 fingerprint'idir. Private key veya password değildir; yine de expected identity CI'da Secret üzerinden yönetilir.

## Başarı koşulu
v15.0.4 ancak GitHub CI'da full build + fingerprint gate + artifact upload + GitHub Release tamamen yeşil olduğunda başarılı kabul edilir.
