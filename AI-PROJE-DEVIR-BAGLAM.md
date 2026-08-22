# KIZILKAN PLAYER ELITE — AI PROJE DEVİR / TAM BAĞLAM BELGESİ

> **Güncel çalışma paketi:** **v15.1.1-RC1 — MPV Event Bridge Kotlin type fix / Player Core 1.0 RC / libmpv 1.0.0 / Scan Engine v2**
> **Son doğrulanmış kurulabilir APK:** **v15.0.4**
> **Durum:** v15.1.0-RC1 GitHub Actions gerçek native buildinde `:mpv-player:compileReleaseKotlin` aşamasına ulaştı ve yalnız iki EventDispatcher payload nullability/type uyuşmazlığında durdu. v15.1.1-RC1 bu kanıtlanmış iki Kotlin hatasını düzeltir; henüz yeniden GitHub full build ve gerçek cihaz kabul testi geçmedi.
> **Bu belge zorunludur.** Sohbet mesaj sınırı nedeniyle yeni sohbete geçildiğinde yeni yapay zekâ önce bu dosyayı, sonra en güncel sürüm notu ve regresyon belgesini okumalıdır.

## 1. SOHBET DEVİR SÖZLEŞMESİ

Kullanıcı talimatı: Sohbet mesaj sınırı nedeniyle yeni sohbete geçildiğinde bağlam kaybı yaşanmaması için **HER ZIP** bu belgeyi içerecek ve her sürümde güncellenecek. Belge en az şunları açıklayacak:

- Projenin amacı, mimarisi ve kritik tasarım kararları.
- Son sürümde ne yapıldı, neden yapıldı, hangi gerçek cihaz semptomunu hedefledi.
- Yapılan teşhis, kullanılan dış kaynaklar ve çözümün neden seçildiği.
- Hangi testlerin gerçekten çalıştırıldığı; hangilerinin çalıştırılamadığı.
- GitHub Actions / native / TypeScript / Gradle / signing durumu.
- Bilinen sorunlar, çözülen sorunlar, kalan işler ve sonraki plan.
- Korunması gereken özellikler ve regresyon yasakları.
- Dosya/sürüm/branch/repo/telefon klasörü bilgileri.
- Yeni yapay zekânın ilk yapacağı kontroller.
- Gizli değerler (keystore şifresi, private key, Base64 secret) **asla** belgeye yazılmayacak.

Bu dosya eski snapshot gibi bırakılmayacak. `tools/checkplayercore.js`, sürüm ve kritik devir anahtarlarının güncel olmasını HARD gate ile denetler.

## 2. PROJE KİMLİĞİ

- Proje: **KIZILKAN PLAYER ELITE**
- Hedef platform: Android telefon + Android TV / TV Box
- Teknoloji: Expo / React Native / react-native-tvos tabanlı Android uygulaması
- Kaynak kökü: `frontend/`
- Package ID: `com.gpt.kizilkan.player`
- Temiz GPT GitHub repo: `mkizilkan/kizilkan-player-elite`
- Telefon çalışma klasörü: `/sdcard/Download/gpt-kizilkan-player-elite`
- ZIP iç kökü: `gpt-kizilkan-player-elite/`
- Güncel uygulama sürümü: **15.1.1**
- Android versionCode: **150101**
- iOS buildNumber metadata: **15.1.1**
- Player Engine hedef etiketi: **1.0.0-RC** — gerçek cihaz kabul matrisi bitmeden Stable denmez.
- Native MPV dependency: **`dev.jdtech.mpv:libmpv:1.0.0`**

Eski GPT/Claude sürümlerinin aynı çalışma ağacına üst üste açılması daha önce build'e artık dosyalar karıştırdı (`device-mode.tsx`, eski `kizilkan-media3` vb.). Bu yüzden temiz GPT repo oluşturuldu. Bundan sonra ZIP senkronlarında `.git` ve yerel signing materyali korunmalı; başka modelin ZIP'i bu klasörün üstüne açılmamalı.


## 2A. v15.1.1-RC1 — KANITLANMIŞ KOTLIN BUILD FIX

GitHub Actions v15.1.0-RC1 buildi TypeScript/prebuild katmanlarını geçerek gerçek `:mpv-player:compileReleaseKotlin` aşamasına ulaştı. Compiler iki somut hata verdi:

- `KizilkanMpvView.kt:385`: nullable `videoCodec/videoFormat/hwdecCurrent` nedeniyle `Map<String, Any>` bekleyen Expo EventDispatcher'a nullable-inferred map gönderiliyordu.
- `KizilkanMpvView.kt:403`: diagnostic payload açıkça `LinkedHashMap<String, Any?>` idi; EventDispatcher `Map<String, Any>` bekliyordu.

Çözüm kör cast değildir. `onVideoReady` payload'ı açıkça `mapOf<String, Any>` olarak kurulur ve nullable telemetry stringleri bridge sınırında `""` ile normalize edilir. Diagnostic payload `linkedMapOf<String, Any>` olur; `extra` içindeki null değerler JS event payload'ına eklenmez. Böylece libmpv 1.0.0 instance mimarisi, Scan Engine v2, resume, 4K recovery ve UI değişiklikleri korunur. `tools/checkplayercore.js` nullable diagnostic EventDispatcher payload'ının geri gelmesini HARD gate ile yasaklar.

Bu düzeltmenin gerçek başarısı ancak yeni GitHub Kotlin/Gradle buildi ile doğrulanacaktır.

## 3. KULLANICI ÇALIŞMA SÖZLEŞMESİ — BAĞLAYICI

1. Kodda gerileme/çıkarma/azaltma yok; her sürüm öncekinin işlevlerini korur ve geliştirir.
2. Simülasyon/hayali başarı yok; yapılmayan test yapılmış gibi söylenmez.
3. Kod çalışır hedeflenir; seçenekler gerçek implementasyonla desteklenir.
4. Temel amaç ve sonradan eklenen özellikler izinsiz kaldırılmaz.
5. Her kod/paket öncesi çoklu kontrol; dosya adı ve sürüm yükseltilir.
6. Özenseme/baştan savma yok.
7. Acele edilmez; kod sıkıştırılıp eksiltilmez.
8. Büyük geliştirme/entegrasyon öncesi plan sunulur, kullanıcı onayından sonra kodlanır. **v15.1.0-RC1 için ayrıntılı plan kullanıcı tarafından onaylandı.**
9. Bahane üretilmez.
10. Özellikler mümkün olan en yüksek kaliteyle planlanır/kodlanır.
11. “İncele” talebinde gerçek kaynak satır satır incelenir ve bulgular açıkça anlatılır.
12. Yapılmayan iş yapıldı diye söylenmez.
13. Düzeltmeler yorum/sürüm notu ile ZIP'e konur; GitHub/Termux akışı sağlanır.
14. **Yeni sohbet bağlam sözleşmesi:** Bu belge her ZIP'te güncel tutulur ve yeni yapay zekânın projeyi devralmasına yetecek ayrıntıyı taşır.
15. **Körü körüne çalışma yasaktır:** Semptoma bakıp rastgele patch/fallback uygulanmaz. Önce gerçek kod yolu, log/çıktı ve mümkünse tekrar üretim ile kök neden kanıtlanır.
16. **Dış araştırma zorunluluğu:** Teşhis için yerel kaynak yeterli değilse internet kapsamlı araştırılır; öncelik resmi dokümantasyon, upstream kaynak kodu, GitHub issue/commit/release notları ve güvenilir benzer implementasyonlardır.
17. **Çapraz doğrulama:** Dış kaynakta bulunan çözüm projeye körlemesine taşınmaz; kullanılan sürüm/API ile mevcut kaynak kod birebir eşleştirilmeden uygulanmaz.
18. **Cerrahi değişiklik ilkesi:** Kanıtlanan kök nedene mümkün olan en dar müdahale yapılır; çalışan davranışlar ve önceki regresyon korumaları gereksiz yere değiştirilmez.
19. **Düzeltme sonrası kanıt:** Her değişiklikten sonra uygun statik gate/test, mümkünse TypeScript/native build ve ilgili gerçek cihaz regresyon senaryosu yeniden kontrol edilir.

## 4. PLAYBACK CORE — KORUNAN MOTOR ZİNCİRİ

Tek orkestratör `frontend/src/player/PlayerHost.tsx` korunur. Ana fallback sırası:

**Media3 → MPV/FFmpeg → VLC**

Ana prensipler:

- Media3 normal/hızlı ana motor.
- Media3 unsupported codec/extractor/decoder fatal → MPV/FFmpeg.
- HTTP/auth/transport davranışında kontrollü VLC yolu korunur.
- MPV gerçek fatal → VLC.
- Stall tek başına motor değiştirme nedeni değildir; önce aynı motorda kontrollü recovery.
- Eski session callback'lerinin yeni session'ı bozması yasaktır.
- VOD/Series progress motorlardan bağımsız ortak playback state'te tutulur.

## 5. v15.0.4 — SON DOĞRULANMIŞ APK

**APK v15.0.4 DERLENDI**, GitHub Actions release zinciri tamamlandı ve APK gerçek Android telefona kuruldu. Artifact ZIP'i açılarak elde edilen gerçek APK yaklaşık 376 MB idi. CI'da:

- `denetle.js` ✅
- `tsc --noEmit` ✅
- Expo prebuild ✅
- Kalıcı signing ✅
- Gradle/native compile ✅
- APK üretimi ✅
- Package ID/versionCode ✅
- `apksigner verify` ✅
- `ANDROID_CERT_SHA256` fingerprint gate ✅
- artifact/release ✅

GitHub Secrets gerekli alanlar:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_CERT_SHA256`

Gizli değerler repo veya bu belgeye yazılmaz.

## 6. v15.0.5-RC1 — ÖNCEKİ SOHBETTE YAPILANLAR

v15.0.4 üzerinde gerçek cihaz bulgularına karşı ilk regresyon paketi oluşturuldu. Korunacak RC1 geliştirmeleri:

- Çoklu Hesap: otomatik ekleme yerine adayları biriktirme, seçim ve “Seçileni Doğrula ve Ekle” akışı.
- Panel/DNS bilmiyorum: sonuç modalında tarama ilerlemesinin kaybolmaması ve native stop kontrolü.
- Hızlı Yapıştırma: `kullanici:sifre` ve şifrede `:` desteği; URL'lerin yanlış kullanıcı/şifre sanılmaması.
- Resume: kayıtlı anlamlı pozisyonda “Baştan izle / Kaldığın yerden devam et” sorusu.
- Seek: kullanıcı seek sonrası watchdog grace.
- MPV seek: `time-pos` property yazımı yerine `seek absolute+keyframes`.
- MPV hwdecode: daha erken software fallback.
- MAG/Stalker: endpoint havuzu, X-User-Agent, Referer, klasik MAC cookie, JSON öncesi debug/prefix temizleme.

Bu değişiklikler v15.1.0-RC1'de korunmuştur; geri alınmamalıdır.

## 7. v15.0.5 RC1 GERÇEK CİHAZ TEST BULGULARI — YENİ ÇALIŞMANIN SEBEBİ

### P0 Player

1. **4K/UHD MPV:** ses var, görüntü yok. Bazen görüntü kısa süre geliyor sonra kayboluyor.
2. **ZAP/session sızıntısı:** kanallar arasında geçişte yeni görüntü gelmezken önceki kanalın sesi kalabiliyor.
3. **UI/player donması:** birkaç ZAP/playlist geçişi sonrası bazı ekranlar dokunmaya/haptic'e yanıt vermiyor; liste kısmen kayabiliyor, sonra uygulama ağırlaşıyor/donuyor.
4. **VOD resume:** Media3 ve MPV “Kaldığın yerden devam et” seçilse de kayıtlı pozisyondan başlamıyor.
5. **VLC VOD:** film/dizi bazı örneklerde hiç açılmıyor.
6. **Seek:** bazı MPV/Media3 VOD içeriklerinde ileri sarma güvenilir değil.
7. Önceki örneklerde VLC'nin açtığı canlı kanalın MPV/FFmpeg'de açılmaması ve ses-var-görüntü-yok davranışı gözlendi.

### P1 Scan / Account Discovery

1. Çoklu hesap taraması kullanıcı açısından çok yavaş.
2. RC1 içinde request concurrency vardır fakat üst seviye hesap traversal'ı yeterince paralel değildir.
3. “Bulunan 9” gibi sayaç artarken bulunan playlist/hesaplar kullanıcıya anında görünmüyordu.
4. Çoklu hesap ekranında Pause/Resume/Stop isteniyor.
5. Arka plan davranışı güvenilir/kanıtlı değil; Android background'da JS loop'a güvenilmeyecek.
6. Tüm sunucu keşif ekranlarında ortak **5 hız profili** isteniyor: Çok Güvenli, Güvenli, Dengeli, Hızlı, Turbo.

### P1 Telefon UI

Settings ekranında “Canlı Yayın Tamponu”, Hızlı/Dengeli/Stabil, “Tümünü Güncelle” ve playlist kartları birbirinin üzerine taşıyordu. Ekran görüntüsü gerçek cihazda dokunma alanlarını da bozabilecek kadar ciddi overlap gösterdi.

## 8. v15.1.0-RC1 — ONAYLI PLAN VE UYGULANAN KOD

Bu çalışma kullanıcı tarafından açıkça onaylandı. Hedef yalnız sürüm yükseltmek değil; Player Core session isolation, libmpv 1.0.0, scan engine ve UI regresyonlarını birlikte ama kontrollü fazlarla düzeltmektir.

### 8.1 libmpv 1.0.0 migration

Dosyalar:
- `frontend/modules/mpv-player/android/build.gradle`
- `frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvView.kt`
- `KizilkanMpvModule.kt`
- `frontend/modules/mpv-player/index.tsx`

Yapılan:

- Dependency `dev.jdtech.mpv:libmpv:1.0.0` oldu.
- Upstream 1.0.0 breaking API'ye göre global/singleton çağrılar bırakıldı.
- Her `KizilkanMpvView` kendi `MPVLib` instance'ını `MPVLib.create(context)` ile oluşturur.
- `init`, `setOption`, `observeProperty`, `attachSurface`, `command`, `removeObserver`, `destroy` aynı instance üzerinden yürür.
- View cleanup'ta stop → surface detach → observers remove → native destroy → instance null sırası uygulanır.
- 1.0.0 nested `MpvFormat`, `MpvEvent`, `MpvLogLevel` API'si kullanılır.
- `video-codec`, `video-params/format`, `hwdec-current` gözlenir.
- Native diagnostic eventleri: surface create/attach/destroy/detach, file loaded, video reconfig, playback restart, end file ve video-ready codec/format/hwdec bilgisi.

Amaç: ZAP sırasında eski global MPV state'in yeni oynatıcı session'ına sızmasını önlemek ve 4K/Surface/decoder problemini ölçülebilir hale getirmek.

### 8.2 PlayerHost session/resume güçlendirmesi

Dosya: `frontend/src/player/PlayerHost.tsx`

- MPV React key artık session + recovery generation içerir; yeni session gerçek native view/MPV instance oluşturur.
- Resume tek 120 ms timer ile “başarılı” sayılmaz.
- Resume denemeleri kontrollü zamanlarda yapılır ve gerçek playback position ile doğrulanır.
- Media3 Expo Video public API'de doğrudan Media3 `availableCommands` exposed olmadığı için sahte capability kontrolü eklenmedi; Media3 resume uygulaması gerçek pozisyon geri bildirimiyle doğrulanır.
- MPV/VLC/Media3 için motor-specific seek uygulanır; gerçekleşmeyen resume teknik hata olarak kaydedilir.
- MPV diagnostic eventleri teknik stats state'e bağlanır.

### 8.3 Scan Engine v2 temeli

Dosyalar:
- `frontend/app/add-playlist.tsx`
- `frontend/src/utils/serverCode.ts`
- `frontend/modules/panel-scan/android/.../PanelScanService.kt`
- `PanelScanModule.kt`
- `frontend/modules/panel-scan/index.ts`

Yeni 5 profil:

- Çok Güvenli: concurrency 2, timeout 16000 ms, accountConcurrency 1
- Güvenli: concurrency 3, timeout 12000 ms, accountConcurrency 2
- Dengeli: concurrency 6, timeout 8000 ms, accountConcurrency 3
- Hızlı: concurrency 10, timeout 5000 ms, accountConcurrency 4
- Turbo: concurrency 16, timeout 3500 ms, accountConcurrency 6

Bu değerler RC başlangıç profilleridir; gerçek cihaz/ağ başarı oranı ve süre ile optimize edilebilir.

Eklenenler:

- Çoklu hesaplar artık bounded account worker pool ile üst seviyede paralel işlenebilir.
- `ScanExecutionControl`: cooperative pause/cancel.
- Çoklu hesap Pause/Resume/Stop.
- Bulunan adaylar tarama devam ederken canlı candidate state'e aktarılır ve korunur.
- Native panel scan'de `ACTION_PAUSE` / `ACTION_RESUME`, paused snapshot ve worker pause loop.
- Native worker ceiling 20; sınırsız Promise/thread üretimi yok.
- Cancel durumunda “sonuç yok” hatası yanlışlıkla üretilmez.

### 8.4 Telefon settings UI overlap düzeltmesi

Dosya: `frontend/app/(tabs)/settings.tsx`

Gerçek kök nedenlerden biri: sabit `height:52` olan `linkBtn` stilinin çok satırlı buffer/settings panel kartı için de kullanılmasıydı. İç içerik sabit yüksekliğe sığmayıp aşağıdaki section/card'ların üstüne taşıyordu.

Düzeltme:

- Buffer paneli `settingsPanelCard` dinamik içerik kartına taşındı.
- `linkBtn` fixed height yerine `minHeight` + vertical padding kullanır.
- Playlist kartları minimum yükseklik ve içerik tabanlı büyüme kullanır.
- Amaç: telefon ekranında overlap ve touch-target çakışması olmaması.

## 9. 4K / ZAP / SURFACE TEŞHİS PRENSİBİ

“libmpv 1.0.0'a geçtik, sorun çözülmüştür” denmeyecek. 4K ses-var-görüntü-yok için aşağıdakiler ayrılmalıdır:

- codec (özellikle HEVC/Main10 olasılığı),
- pixel format,
- MediaCodec hwdec,
- software decoder fallback,
- Surface create/attach/detach,
- video reconfigure,
- first frame,
- eski session ownership/callback sızıntısı.

Diagnostic eventler bu ayrımı yapmak için eklenmiştir. Gerçek 4K cihaz testi şarttır.

## 10. VLC VOD DURUMU

VLC VOD açılmama sorunu bu paketle “kesin çözüldü” diye iddia edilmez. Mevcut `expo-libvlc-player` bağımlılığı korunmuştur. Sonraki teşhiste aynı VOD için Media3/MPV/VLC URL/header/redirect/container davranışı karşılaştırılmalıdır. Dependency downgrade/upgrade kanıt olmadan yapılmamalıdır.

## 11. MAG / STALKER

v15.0.5 RC1'deki geliştirmeler korunur. Eğer eski çalışan hesap yeni sürümde hâlâ açılmazsa v14.x çalışan request ile v15.x request handshake/token/profile/create_link seviyesinde karşılaştırılmalıdır. Sunucu otomatik suçlanmamalıdır.

## 12. GITHUB ACTIONS / SIGNING

CI sırası korunur:

1. bağımlılık kurulumu
2. `node ../tools/denetle.js` HARD gate
3. `npx tsc --noEmit` HARD gate
4. Expo clean prebuild
5. kalıcı release signing
6. Gradle/manifest/TV/HTTP kontrolleri
7. assembleRelease
8. package/version/apksigner/fingerprint gate
9. APK adlandırma
10. artifact upload
11. GitHub Release

Signing secret isimleri: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_CERT_SHA256`.

## 13. v15.1.0-RC1 TEST / DOĞRULAMA DURUMU

Bu kaynak çalışma ortamında yapılabilen doğrulamalar ile GitHub native build birbirinden ayrılmalıdır.

**Paketlenmeden önce zorunlu yerel kontroller:**
- `node ../tools/denetle.js`
- JSON/YAML/syntax kontrolleri
- MPV 1.0.0 API referans statik kontrolleri
- ZIP bütünlük testi

**Bu ortamda bağımlılıklar/node_modules yoksa gerçek `npx tsc --noEmit` başarılı sayılmaz.** GitHub Actions çalıştırılmadan Kotlin/libmpv 1.0.0 compile başarılı sayılmaz.

**Gerçek cihaz kabul matrisi:**
- 4K MPV görüntü + ses stabil
- en az 20 hızlı ZAP; eski ses kalmıyor, yeni görüntü geliyor, UI donmuyor
- Media3 resume gerçek pozisyon
- MPV resume gerçek pozisyon
- VLC VOD teşhisi/çalışması
- MPV/Media3 seek
- Çoklu hesap live result + Pause/Resume/Stop
- 5 scan speed profili
- background/native scan davranışı
- Settings UI overlap 0
- TV Box Surface/focus regresyon yok

## 14. KORUNACAK ÖZELLİKLER

- Çoklu IPTV hesap ekleme, CSV/TXT/JSON ve `kullanici:sifre`.
- Sunucu ile giriş yöntemleri.
- Native panel/DNS scan ve streaming results.
- DNS self-heal.
- Playlist tür renkleri/server code/özel ad.
- Tümünü Güncelle worker akışı.
- +18 cache/switch/PIN.
- Backup/restore.
- Zap, kayıt, screenshot, cast, sleep, track, subtitle, A/V sync, speed, fit.
- Telefon touch + TV focus/kumanda.
- VLC fallback.
- Runtime stall recovery.
- VOD/Series progress.
- `.ts/.m3u8` alternatif URL.
- Hızlı/Dengeli/Stabil playback buffer seçenekleri.
- MAG/Stalker RC1 compatibility geliştirmeleri.

Hiçbiri yeni player/scan migration bahanesiyle kaldırılmayacak.

## 15. KALAN / SONRAKI ISLER

**KALAN / SONRAKI ISLER:**

1. v15.1.0-RC1 kaynak paketinin tüm yerel HARD gate'lerini çalıştır ve sonucu kaydet.
2. Temiz repo üzerinde GitHub Actions çalıştır; `tsc --noEmit`, Expo prebuild ve özellikle `:mpv-player:compileReleaseKotlin` libmpv 1.0.0 migration'ını doğrulasın.
3. Kotlin/API build hatası varsa upstream 1.0.0 API ile birebir doğrula; 0.5.1 API'ye geri dönme veya `any`/sahte stub ile susturma yok.
4. Build başarılı olursa aynı gerçek cihazda 4K kanal + ZAP + resume + seek + VLC VOD matrisi çalıştır.
5. MPV diagnostics ile ses-var-görüntü-yok vakasında codec/hwdec/surface/first-frame ayrımını kanıtla.
6. Scan Engine v2 gerçek süre/başarı oranlarını 5 profil için ölç; timeout/concurrency değerlerini veriye göre revize et.
7. Background scan'i gerçek Android lifecycle ile test et; JS background davranışını native service varmış gibi göstermeme.
8. Settings UI'yi küçük telefon ekranı, font scaling ve TV ekranında test et.
9. VLC VOD devam ediyorsa request/header/container karşılaştırması yap; dependency değişikliğini kanıt olmadan yapma.
10. MAG hesabı hâlâ regresyon gösteriyorsa eski çalışan sürümle HTTP seviyesinde karşılaştır.
11. Bütün kritik gerçek cihaz senaryoları geçmeden Player Engine “1.0.0 Stable” ilan edilmez.

## 16. YENİ SOHBETTE YAPAY ZEKÂNIN İLK YAPACAĞI ŞEYLER

1. Bu dosyayı tamamen oku.
2. `SURUM-NOTU-GPT-ELITE-v15.1.0-RC1.md` ve `REGRESYON-DENETIM-GPT-ELITE-v15.1.0-RC1.md` dosyalarını oku.
3. `frontend/app.json`, `frontend/package.json`, MPV `android/build.gradle`, `.github/workflows/build-apk.yml`, `tools/checkplayercore.js` sürüm/dependency değerlerini karşılaştır.
4. Kullanıcının en son GitHub Actions veya cihaz test çıktısını gerçek durum kabul et; yapılmamış testi varsayma.
5. `libmpv:1.0.0` ve MPV instance API'nin gerçekten source'ta kaldığını kontrol et.
6. Scan speed profilleri ve pause/resume/cancel kodunu doğrula.
7. `node ../tools/denetle.js` ve mümkünse gerçek `npx tsc --noEmit` çalıştır.
8. Yeni paket üretirken sürümü yükselt, sürüm/regresyon notlarını ve **bu belgeyi mutlaka güncelle**.

## 17. GÜVENLİK / GERÇEKLİK

- Keystore private key/password paylaşılmaz.
- Signing dosyaları Git'e commit edilmez.
- Credential/token logları maskelenir.
- Bu belge başarıyı simüle etmez.
- **APK v15.0.4 DERLENDI** ve gerçek telefona kuruldu; bu kanıtlı son referanstır.
- v15.1.0-RC1 henüz GitHub full build + gerçek cihaz testinden geçmeden “çalışıyor” veya “sorun çözüldü” denmeyecektir.
