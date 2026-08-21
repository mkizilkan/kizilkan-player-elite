# KIZILKAN PLAYER ELITE — AI PROJE DEVİR / TAM BAĞLAM BELGESİ

> **Güncel paket:** v15.0.4 — CERTIFICATE GATE FIX
> **Bu belge zorunludur.** Sohbet mesaj sınırı nedeniyle yeni sohbete geçildiğinde yeni yapay zekâ önce bu dosyayı, sonra güncel `SURUM-NOTU-*` ve `REGRESYON-DENETIM-*` dosyalarını okumalıdır.
> Amaç, önceki sohbet erişilemese dahi projeye eksiksiz hâkim olunması ve özellik/karar kaybı yaşanmamasıdır.

## 1. SOHBET DEVİR SÖZLEŞMESİ

Kullanıcı talimatı: Sohbet mesaj sınırı nedeniyle yeni sohbete geçildiğinde bağlam kaybı yaşanmaması için **HER ZIP** bu belgeyi içerecek ve her sürümde güncellenecek. Belge en az şunları açıklayacak:

- Projenin amacı, mimarisi ve kritik tasarım kararları.
- Son sürümde ne yapıldı, neden yapıldı, hangi kök neden çözüldü.
- Hangi testlerin gerçekten çalıştırıldığı; hangilerinin çalıştırılmadığı.
- GitHub Actions / native / TypeScript / Gradle / signing durumları.
- Bilinen sorunlar, çözülen sorunlar, kalan işler ve sonraki plan.
- Korunması gereken özellikler ve regresyon yasakları.
- Dosya/sürüm/branch/repo/telefon klasörü bilgileri.
- Yeni yapay zekânın ilk yapacağı kontroller.
- Gizli değerler (keystore şifresi, private key, Base64 secret) **asla** belgeye yazılmayacak.

Bu dosya eski bir snapshot gibi bırakılmayacak; yeni ZIP üretilmeden önce güncellenecek. `tools/checkplayercore.js` bu zorunluluğu HARD gate olarak kontrol eder.

## 2. PROJE KİMLİĞİ

- Proje: **KIZILKAN PLAYER ELITE**
- Platform: Android telefon + Android TV / TV Box
- Teknoloji: Expo / React Native / react-native-tvos tabanlı Android uygulaması
- Kaynak kökü: `frontend/`
- Package ID: `com.gpt.kizilkan.player`
- GitHub temiz GPT repo: `mkizilkan/kizilkan-player-elite`
- Telefon çalışma klasörü: `/sdcard/Download/gpt-kizilkan-player-elite`
- ZIP iç kökü: `gpt-kizilkan-player-elite/`
- Güncel sürüm: **15.0.4**
- Android versionCode: **150004**
- iOS buildNumber (metadata): **15.0.4**

Eski GPT/Claude sürümlerinin aynı çalışma ağacına üst üste açılması daha önce build'e artık dosyalar karıştırdı (`device-mode.tsx`, eski `kizilkan-media3` vb.). Bu yüzden temiz GPT repo oluşturuldu. Bundan sonra ZIP senkronlarında `.git` ve yerel signing materyali korunmalı; başka modelin ZIP'i bu klasörün üstüne açılmamalı.

## 3. KULLANICI ÇALIŞMA SÖZLEŞMESİ — KORUNACAK

1. Kodda gerileme/çıkarma/azaltma yok; her sürüm öncekinin işlevlerini korur ve geliştirir.
2. Simülasyon/hayali başarı yok; yapılmayan test yapılmış gibi söylenmez.
3. Kod çalışır hedeflenir; seçenekler gerçek implementasyonla desteklenir.
4. Temel amaç ve sonradan eklenen özellikler izinsiz kaldırılmaz.
5. Her kod/paket öncesi çoklu kontrol; dosya adı ve sürüm yükseltilir.
6. Özenseme/baştan savma yok.
7. Acele edilmez; kod sıkıştırılıp eksiltilmez.
8. Büyük geliştirme/entegrasyon öncesi plan sunulur, kullanıcı onayından sonra kodlanır.
9. Bahane üretilmez.
10. Özellikler mümkün olan en yüksek kaliteyle planlanır/kodlanır.
11. “İncele” talebinde gerçek kaynak satır satır incelenir ve bulgular açıkça anlatılır.
12. Yapılmayan iş yapıldı diye söylenmez.
13. Düzeltmeler yorum/sürüm notu ile ZIP'e konur; GitHub/Termux akışı sağlanır.
14. **Yeni sohbet bağlam sözleşmesi:** Bu belge her ZIP'te güncel tutulur ve yeni yapay zekânın projeyi devralmasına yetecek ayrıntıyı taşır.

## 4. v15 PLAYBACK CORE — ANA MİMARİ

Tek orkestratör `frontend/src/player/PlayerHost.tsx` korunur. Motorlar birbirinden bağımsız profillerdir:

**Media3 → MPV/FFmpeg → VLC**

AUTO karar mantığının ana sözleşmesi:

- Media3 normal/hızlı ana motor.
- Media3 unsupported codec / extractor / decoder fatal → MPV/FFmpeg.
- Media3 HTTP/auth/network davranışı → VLC transport yolu.
- Media3 ready ama first-frame yok → kontrollü Surface recovery; gerekiyorsa MPV.
- MPV gerçek fatal → VLC HW.
- VLC HW gerçek native fatal → VLC SW.
- VLC SW gerçek fatal → final error.
- Playback clock stall **tek başına motor değiştirmez**; önce aynı motor soft-resync, sonra aynı motor temiz session restart.

Session ID + profile-generation gate + transition lock eski callback'in yeni oturumu bozmasını önler. Aynı kanal kapatılıp açıldığında yeni session üretilir. VOD/Series progress üç motorda ortak playback clock'tan yazılır.

## 5. MPV NATIVE MOTORU

- Local Expo module: `frontend/modules/mpv-player/`
- Güncel dependency: `dev.jdtech.mpv:libmpv:0.5.1`
- v15.0.3'te gerçek 0.5.1 Java API yüzeyine göre Kotlin adapter düzeltildi.
- 0.5.1'de `MPV_FORMAT_*`, `MPV_EVENT_*`, `MPV_LOG_LEVEL_*` sabitleri doğrudan `MPVLib` üzerindedir. Yanlış nested `MpvFormat/MpvEvent/MpvLogLevel` kullanımı HARD gate ile yasaktır.
- SurfaceView, header/User-Agent/Referer, buffer, volume, speed, fit, A/V delay, seek, audio/subtitle track desteği bulunur.
- Geçici view detach libmpv destroy etmez; gerçek cleanup Expo view destruction lifecycle'ında yapılır.

**Planlanan sonraki büyük migration:** APK build zinciri tamamen yeşil ve cihaz testi alınır alınmaz `libmpv 1.0.0` instance API migration'ı ayrı sürümde planlanacak. 1.0.0 breaking API değişimi olduğu için v15.0.x build-fix içine karıştırılmadı.

## 6. TV BOX SURFACE / RENK ŞERİDİ SÖZLEŞMESİ

Kullanıcının kritik gerçek cihaz problemi: TV Box'ta mavi/tema renkli şerit, ekran boyanması/tint, ses var görüntü yok, eski frame/surface kalması. v15 uygulama tarafında şu kökleri kapatır:

- Hidden player `opacity:0 + zIndex:-1` kullanmaz.
- Surface detach/GONE edilmek yerine gerektiğinde ekran dışına taşınır.
- Player root opak siyah + `overflow:hidden`.
- MPV SurfaceView opak, `PixelFormat.OPAQUE`, normal Z-order.
- Android 14+ attachment lifecycle yaklaşımı.
- Media3 TV ana yolu SurfaceView; TextureView yalnız recovery seçeneğidir.

Fiziksel TV Box testi yapılmadan vendor compositor/codec bug'ına yüzde 100 garanti verilmez. Kod tarafında bu sözleşme geriye götürülmeyecek.

## 7. v15.0.0 → v15.0.4 GERÇEK BUILD TARİHÇESİ

### v15.0.0
İlk GitHub build `npx tsc --noEmit` HARD gate'te kırıldı; **APK oluşmadı**. Gerçek v15 hataları ile eski ortak repo artıkları birbirine karışmıştı.

### v15.0.1
Gerçek TypeScript semantik hata temizliği yapıldı; temiz repo ihtiyacı kesinleşti. Eski ortak repo yerine yeni `kizilkan-player-elite` repo oluşturuldu.

### v15.0.2
Temiz repo CI, `@/src/native/vlc` ve `@/src/native/cast` TypeScript çözümleme sorunlarını ortaya çıkardı. Suffix'siz type facade'lar ve gerçek VLC callback tipi eklendi. Sonraki CI'da:

- `denetle.js` geçti.
- `tsc --noEmit` geçti.
- Expo prebuild geçti.
- İlk signing denemesi secret eksikleri nedeniyle durdu.
- Kalıcı keystore oluşturuldu ve GitHub Secrets tanımlandı.

### v15.0.3
MPV Kotlin compile'da `MpvEvent`, `MpvFormat`, `MpvLogLevel` unresolved çıktı. 0.5.1 API'sine doğru şekilde geçirildi. Son GitHub build sonucunda:

- `denetle.js` ✅
- `tsc --noEmit` ✅
- Expo prebuild ✅
- Kalıcı release signing kurulumu ✅
- Gradle/native compile ✅
- `:mpv-player:compileReleaseKotlin` ✅
- **APK v15.0.3 DERLENDI** ✅ (`app-release.apk` fiziksel olarak oluştu)
- Package ID `com.gpt.kizilkan.player` ✅
- versionCode `150003` ✅
- `apksigner verify` ✅
- Son gate ❌: workflow eski hard-coded sertifika SHA-256 beklediği için doğru yeni kalıcı keystore sertifikasını reddetti. Artifact/release aşamasına geçemedi.

Yerel keystore `keytool -list -v` ile doğrulandı ve GitHub APK'dan okunan sertifika SHA-256 ile birebir eşleşti. Fingerprint paylaşılabilir metadata olsa da bu belgede gereksiz sabit sertifika değeri tutulmaz; CI kaynağı GitHub Secret olacaktır.

### v15.0.4 — BU PAKET
Kök çözüm: sertifika doğrulaması kaynak koduna gömülü eski SHA yerine `ANDROID_CERT_SHA256` Repository Secret ile yapılır. Secret ve APK fingerprint'i colon/space/case farklarından arındırılarak 64 hex karaktere normalize edilir. Secret biçimi geçersizse veya fingerprint uyuşmazsa build yine HARD FAIL olur. Beklenen fingerprint log'a yazılmaz.

## 8. GITHUB ACTIONS / SIGNING DURUMU

Release build için Repository → Settings → Secrets and variables → Actions altında şunlar gerekir:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- **`ANDROID_CERT_SHA256`** (v15.0.4 ile yeni)

Gizli değerleri bu belgeye veya repo kaynaklarına yazma. `.jks`, `.keystore`, `.base64` signing materyalleri `.gitignore` ile korunmalıdır. Keystore kaybedilirse aynı imza zinciriyle normal Android update üretme yeteneği kaybedilebilir.

CI sırası:

1. yarn install
2. `node ../tools/denetle.js` HARD gate
3. `npx tsc --noEmit` HARD gate
4. Expo clean prebuild
5. Kalıcı release signing
6. Gradle/manifest/TV/HTTP kontrolleri
7. Gradle assembleRelease
8. APK package/version/apksigner/fingerprint HARD gate
9. APK adlandırma
10. Artifact upload
11. GitHub Release

## 9. v15.0.4 BAŞARI KRİTERİ

Bu sürüm ancak temiz GitHub Actions'ta şu zincir tamamen yeşil olursa başarılı kabul edilir:

- TypeScript 0 hata
- MPV Kotlin compile
- Full Gradle release APK
- Package/version doğrulaması
- apksigner verify
- `ANDROID_CERT_SHA256` fingerprint eşleşmesi
- artifact upload
- GitHub Release

Bunlardan biri başarısızsa “build tamamlandı” denmez.

## 10. KORUNACAK v14/v15 ÖZELLİKLERİ

- Çoklu IPTV hesap ekleme (manuel/CSV/TXT/JSON).
- Sunucu ile üç giriş yöntemi.
- Native background panel/DNS scan ve streaming results.
- DNS self-heal.
- Playlist tür renkleri / server code / özel playlist adı.
- Tümünü Güncelle worker akışı.
- +18 cache/switch/PIN.
- Backup/restore.
- Zap, kayıt, screenshot, cast, sleep, track, subtitle, A/V sync, speed, fit.
- Telefon touch + TV focus/kumanda altyapısı.
- VLC non-destructive health.
- Runtime stall recovery.
- VOD/Series progress.
- `.ts/.m3u8` alternatif URL.
- Hızlı/Dengeli/Stabil + gelişmiş buffer seçenekleri.

Hiçbiri build-fix bahanesiyle kaldırılmayacak.

## 11. BİLİNEN / KALAN / SONRAKI ISLER

**KALAN / SONRAKI ISLER:**

1. GitHub'a `ANDROID_CERT_SHA256` secret ekle ve v15.0.4 CI çalıştır.
2. Artifact + GitHub Release gerçekten oluştuğunu doğrula.
3. APK'yı telefon üzerinde kur ve başlangıç/same-channel/VLC/Media3/MPV playback testleri yap.
4. Mümkün olduğunda TV Box'ta surface/şerit/tint/zap/focus matrisi çalıştır.
5. Build + temel cihaz testi sonrası ayrı plan/onayla `libmpv 1.0.0` instance API migration'ına geç.
6. 1.0.0 migration'da multi-instance potansiyeli, lifecycle ve observer/Surface davranışı ayrı regresyon matrisiyle ele alınmalı.

## 12. YENİ SOHBETTE YAPAY ZEKÂNIN İLK YAPACAĞI ŞEYLER

1. Bu dosyayı tamamen oku.
2. En yüksek sürümlü `SURUM-NOTU-GPT-ELITE-*` ve `REGRESYON-DENETIM-GPT-ELITE-*` dosyalarını oku.
3. `frontend/app.json`, `frontend/package.json`, `.github/workflows/build-apk.yml`, `tools/checkplayercore.js` sürüm değerlerini karşılaştır.
4. Kullanıcının gönderdiği en son GitHub Actions logunu “gerçek durum” kabul et; yapılmamış test varsayma.
5. Kod değişikliğinden önce planı sun ve onay gerektiren kapsamda onay al.
6. `node ../tools/denetle.js` ve mümkünse gerçek `npx tsc --noEmit` sonuçlarını raporla.
7. Yeni paket üretirken sürümü yükselt, yeni sürüm notu/regresyon belgesi yaz ve **bu AI devir belgesini de mutlaka güncelle**.

## 13. GÜVENLİK / GİZLİLİK

- Keystore private key veya password paylaşılmaz.
- `ANDROID_KEYSTORE_BASE64` değeri belgeye yazılmaz.
- GitHub Secrets değerleri loglanmaz.
- `ANDROID_CERT_SHA256` fingerprint private key değildir; yine de CI kaynağı olarak Secret kullanılır ve workflow beklenen değeri loglamaz.
- Signing dosyaları Git'e commit edilmez.

## 14. GERÇEKLİK NOTU

Bu belge başarıyı simüle etmez. v15.0.3'te APK üretimi ve imza doğrulaması gerçekten GitHub CI logunda görüldü; artifact/release ise sertifika gate nedeniyle oluşmadı. v15.0.4'ün başarısı henüz GitHub CI çalıştırılmadan iddia edilemez.
