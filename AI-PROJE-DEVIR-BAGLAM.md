# GÜNCEL DURUM — KIZILKAN PLAYER ELITE v15.2.2-RC1

**Native Data Core / Room + SQLite Phase 1 sürüyor.** v15.2.2-RC1, v15.2.1 Room store/paging temelini korurken iki P0 düzeltme ekler: GitHub build'i durduran Groovy/KSP kaçış hatası düzeltilmiştir ve seçili çoklu Xtream hesaplarının katalog indirme/normalize/kaydetme işi gerçek Android foreground native service'e taşınmıştır. Başarılı hesaplar bağımsız kalıcılaştırılır; tek sorunlu hesap diğerlerini bloke etmez; Pause/Resume/Stop ve background devamlılığı native job durumuyla yönetilir.

Room sürümü bilinçli olarak **androidx.room 2.8.3** seçildi. Android-only Expo SDK 54 modülü için olgun 2.x hattı tercih edildi; 2.8.3 Cursor/JNI performans düzeltmesini içerir. Room 3.x KMP odaklı breaking yüzeyi bu faza gereksiz risk olarak eklenmedi.

Kritik amaç: playlist seçimi sonrası ScrollView çalışırken Pressable/navigation'ın 5–10 dakika cevap vermemesi semptomunu, dev koleksiyonların JS thread'e taşınmasını azaltarak mimari olarak bitirmek. Bu RC GitHub `tsc --noEmit` + KSP/Room Kotlin compile + Gradle APK ve gerçek cihaz testi geçmeden stabil sayılmaz.

---

# KIZILKAN PLAYER ELITE — AI PROJE DEVİR / TAM BAĞLAM BELGESİ

> **Güncel çalışma paketi:** **v15.2.2-RC1 — Room/SQLite Native Data Core + Native Foreground Bulk Playlist Import / Player Core 1.0 RC / libmpv 1.0.0 / Native Scan**
> **Son doğrulanmış kurulabilir APK:** **v15.1.1-RC1**
> **Durum:** v15.2.1-RC1 GitHub build, `kizilkan-native-core/android/build.gradle` satır 4 içindeki literal `\\"` Groovy escape hatası nedeniyle Room/KSP derlemesine ulaşmadan kırıldı. v15.2.2-RC1 bu syntax hatasını düzeltir. Ayrıca gerçek cihazda 8 seçili hesabın 7-8 saat `Cihaza kaydediliyor...` aşamasında kalması P0 kabul edildi ve ekleme işi JS seri pipeline yerine native foreground service + Room pipeline'ına taşındı. Bu RC henüz GitHub full build ve cihaz kabul testi geçmedi.
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
- Güncel uygulama sürümü: **15.2.2**
- Android versionCode: **150202**
- iOS buildNumber metadata: **15.2.2**
- Player Engine hedef etiketi: **1.0.0-RC** — gerçek cihaz kabul matrisi bitmeden Stable denmez.
- Native MPV dependency: **`dev.jdtech.mpv:libmpv:1.0.0`**

Eski GPT/Claude sürümlerinin aynı çalışma ağacına üst üste açılması daha önce build'e artık dosyalar karıştırdı (`device-mode.tsx`, eski `kizilkan-media3` vb.). Bu yüzden temiz GPT repo oluşturuldu. Bundan sonra ZIP senkronlarında `.git` ve yerel signing materyali korunmalı; başka modelin ZIP'i bu klasörün üstüne açılmamalı.


## 2A. v15.1.1-RC1 — KANITLANMIŞ KOTLIN BUILD FIX

GitHub Actions v15.1.0-RC1 buildi TypeScript/prebuild katmanlarını geçerek gerçek `:mpv-player:compileReleaseKotlin` aşamasına ulaştı. Compiler iki somut hata verdi:

- `KizilkanMpvView.kt:385`: nullable `videoCodec/videoFormat/hwdecCurrent` nedeniyle `Map<String, Any>` bekleyen Expo EventDispatcher'a nullable-inferred map gönderiliyordu.
- `KizilkanMpvView.kt:403`: diagnostic payload açıkça `LinkedHashMap<String, Any?>` idi; EventDispatcher `Map<String, Any>` bekliyordu.

Çözüm kör cast değildir. `onVideoReady` payload'ı açıkça `mapOf<String, Any>` olarak kurulur ve nullable telemetry stringleri bridge sınırında `""` ile normalize edilir. Diagnostic payload `linkedMapOf<String, Any>` olur; `extra` içindeki null değerler JS event payload'ına eklenmez. Böylece libmpv 1.0.0 instance mimarisi, Scan Engine v2, resume, 4K recovery ve UI değişiklikleri korunur. `tools/checkplayercore.js` nullable diagnostic EventDispatcher payload'ının geri gelmesini HARD gate ile yasaklar.

Bu düzeltmenin gerçek başarısı ancak yeni GitHub Kotlin/Gradle buildi ile doğrulanacaktır.

## 2B. v15.2.1-RC1 — ROOM / SQLITE NATIVE DATA CORE

Gerçek cihaz semptomu: playlist seçildikten sonra kanal/ayar listesi native olarak kaydırılabiliyor, fakat Favoriler/Arama/Diziler/Filmler ve ayar butonları 5–10 dakika tıklanamıyordu. Bu semptom React Native'de native scroll'un JS thread kilitliyken hareket edebilmesi, Pressable/navigation handler'larının ise JS event loop beklemesi ile uyumludur. Bu nedenle yalnız React memo/timeout ayarı değil veri mimarisi değiştirildi.

Yeni Android veri yolu:

`bigStore JSON dosyası → Kotlin Native Core → Room/SQLite → indeksli DAO sorguları → yalnız görünür sayfa → React Native UI`

Room şeması:
- `playlist_snapshots`: playlist dosyasının stamp/size/count/import süresi. Dosya değişmediyse yeniden parse/index yok.
- `media_items`: live/vod/series öğeleri; kayıpsız `rawJson`, playlist/kind/group/name/search/sort indeksleri.
- Reindex tek Room transaction içinde yapılır. Eski index silinip yeni index tam yazılamazsa transaction rollback eder.
- Batch insert 750 kayıtta sınırlandırıldı; tek dev insert listesi oluşturulmaz.
- `queryItems` LIMIT/OFFSET + toplam sayı döndürür; JS'e varsayılan 80, en fazla 250 kayıt taşınır.
- `getCategories` SQLite `GROUP BY` ile tüm playlist kategorilerini sayar; ilk sayfadan kategori türetme hatası yok.
- `getItem` tek öğeyi stream/item id ile getirir.
- Legacy ekranlar için `readPlaylistHeavy` korunmuştur; özellik kaybı yok. Ancak ana Canlı ekran native paging modunda otomatik heavy hydrate yapmaz.
- Kullanıcının özel override grupları tam koleksiyon eşleştirmesi istediği için bu ilk fazda güvenli legacy hydrate fallback'i korunur; Phase 2'de native custom-group index'e taşınacaktır.
- Playlist dosyası silinince Room index'i de `removePlaylistIndex` ile temizlenir.

Build altyapısı: Expo SDK 54'ün root KSP sürümü kullanılır; `androidx.room:room-runtime:2.8.3`, `room-ktx:2.8.3`, `room-compiler:2.8.3` KSP ile eklenmiştir. Room 3.x bu fazda kullanılmaz.

Kabul testi: playlist seçimi sonrası ana Canlı ekran hemen dokunulabilir kalmalı; ilk sayfa görünmeli, aşağı kaydırınca yeni sayfa gelmeli, kategori sayıları tam playlist'i temsil etmeli. GitHub KSP/Kotlin compile ve gerçek cihaz testi yapılmadan çözülmüş sayılmaz.

## 3. KULLANICI ÇALIŞMA SÖZLEŞMESİ — BAĞLAYICI

1. Kodda gerileme/çıkarma/azaltma yok; her sürüm öncekinin işlevlerini korur ve geliştirir.
2. Simülasyon/hayali başarı yok; yapılmayan test yapılmış gibi söylenmez.
3. Kod çalışır hedeflenir; seçenekler gerçek implementasyonla desteklenir.
4. Temel amaç ve sonradan eklenen özellikler izinsiz kaldırılmaz.
5. Her kod/paket öncesi çoklu kontrol; dosya adı ve sürüm yükseltilir.
6. Özenseme/baştan savma yok.
7. Acele edilmez; kod sıkıştırılıp eksiltilmez.
8. Büyük geliştirme/entegrasyon öncesi plan sunulur, kullanıcı onayından sonra kodlanır. **v15.2 Native Core + Room/SQLite migration planı kullanıcı tarafından onaylandı.**
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

1. v15.2.1-RC1'i temiz repo üzerinde GitHub Actions'a gönder; `tsc --noEmit`, Expo prebuild, `:kizilkan-native-core:kspReleaseKotlin`, `:kizilkan-native-core:compileReleaseKotlin`, MPV 1.0.0 Kotlin ve Gradle release kapılarını doğrula.
2. Room/KSP build hatası çıkarsa gerçek compiler satırını upstream Room 2.8.3 / Expo SDK 54 KSP API ile doğrula; Room'u kaldırıp eski dev JSON cache'e geri dönme.
3. APK başarılı olursa gerçek telefonda playlist seçimi → Canlı ekran testini kronometrele: ilk UI etkileşim süresi, ilk 80 kanal, ilk kategori listesi, 80 sonrası page append ve buton tepki süresi.
4. 5–10 dakikalık touch lock tekrar ederse `KIZILKAN PERF` telemetry + JS event-loop/render/player event yoğunluğu ölçülerek kalan JS darboğazı bulunacak.
5. VOD/Series, Search ve Favorites bu Phase 1'de legacy hydrate fallback kullanır. Phase 2'de Room paging/search/favorite ID query'lerine taşınacak; davranış kaybı olmadan geçilecek.
6. Kullanıcının özel grupları bu Phase 1'de legacy hydrate fallback kullanır. Phase 2'de custom-group üyelik index tablosu eklenecek.
7. Native Scan foreground/background davranışı gerçek Android lifecycle ile yeniden test edilecek; ekran başka uygulamaya geçince tarama sürmeli, progress/results restore olmalı.
8. Player testleri ayrıca devam eder: 4K MPV, 20 ZAP, eski ses sızıntısı, Media3/MPV resume, seek, VLC VOD.
9. RAM ölçümü cold start / playlist indexed / live paging / 1080p / 4K / 20 ZAP için `dumpsys meminfo` ile yapılacak.
10. APK boyutu için ABI ve `.so` dağılımı çıkarılacak; AAB/ABI split/arm64-only dağıtım ayrı optimizasyon olarak ele alınacak.
11. Bütün kritik gerçek cihaz senaryoları geçmeden Player Engine “1.0.0 Stable” veya Native Data Core “Stable” ilan edilmez.

## 16. YENİ SOHBETTE YAPAY ZEKÂNIN İLK YAPACAĞI ŞEYLER

1. Bu dosyayı tamamen oku.
2. `SURUM-NOTU-GPT-ELITE-v15.2.1-RC1.md`, `REGRESYON-DENETIM-GPT-ELITE-v15.2.1-RC1.md` ve `PAKET-DOGRULAMA-v15.2.1-RC1.txt` dosyalarını oku.
3. `frontend/app.json` = 15.2.1 / 150201, `frontend/package.json` = 15.2.1, MPV = libmpv 1.0.0, Room = 2.8.3 olduğunu doğrula.
4. `frontend/modules/kizilkan-native-core` içinde Room Database/Entity/DAO/KSP build yapısını kontrol et.
5. Ana Canlı ekranın `nativeLivePaged` + `queryItems` + `getCategories` + `onEndReached` yolunu koruduğunu doğrula.
6. Kullanıcının en son GitHub Actions veya cihaz test çıktısını gerçek durum kabul et; yapılmamış testi varsayma.
7. `node ../tools/denetle.js` ve mümkünse gerçek `npx tsc --noEmit` çalıştır.
8. Yeni paket üretirken sürümü yükselt, sürüm/regresyon/paket doğrulama notlarını ve **bu belgeyi mutlaka güncelle**.

## 17. GÜVENLİK / GERÇEKLİK

- Keystore private key/password paylaşılmaz.
- Signing dosyaları Git'e commit edilmez.
- Credential/token logları maskelenir.
- Bu belge başarıyı simüle etmez.
- **APK v15.0.4 DERLENDI** ve gerçek telefona kuruldu; bu kanıtlı son referanstır.
- v15.2.1-RC1 henüz GitHub Room/KSP full build + gerçek cihaz testinden geçmeden “çalışıyor” veya “touch lock çözüldü” denmeyecektir.

---
## v15.2.2-RC1 — 2026-08-23 — KSP BUILD FIX + NATIVE BULK PLAYLIST IMPORT

### Gerçek GitHub hatası
v15.2.1-RC1 build yaklaşık 1 dakika içinde `kizilkan-native-core/android/build.gradle` satır 4'te `Unexpected character: '\\'` ile kırıldı. Kök neden KSP classpath içindeki `rootProject[\"kspVersion\"]` ifadesinin dosyaya literal ters eğik çizgilerle yazılmış olmasıydı. v15.2.2-RC1 Expo'nun kendi modüllerindeki gerçek Groovy biçimini kullanır: `rootProject["kspVersion"]`.

### Gerçek cihaz P0 — seçili panel hesapları saatlerce kaydedilemiyor
Kullanıcı 8 seçili hesabın 7-8 saat boyunca `Cihaza kaydediliyor...` aşamasında kaldığını bildirdi. Eski `addSelectedBulkCandidates` hesapları seri dolaşıyor; her hesap Live/VOD/Series kataloglarını JS'e alıyor ve `addPlaylist` bunları tekrar büyük JSON olarak dosyaya yazıyordu.

### Yeni çözüm
Android'de seçili hesap ekleme `BulkPlaylistImportService` adlı foreground native job pipeline'ına taşındı. Hesaplar bounded paralel işlenir; katalog indirme/normalize Kotlin'de yapılır; veri doğrudan heavy dosya + Room/SQLite indeksine yazılır. JS yalnız hesap bazlı durum ve metadata alır. `PlaylistContext.addPreparedPlaylist` hazır native dosyayı tekrar serialize etmeden metadata'yı kalıcılaştırır. Pause/Resume/Cancel native job durumları mevcuttur. Başarılı hesaplar diğerlerinin bitmesini beklemez. Snapshot hassas parola/token içermez.

### Sonraki zorunlu doğrulamalar
1. GitHub KSP/Room compile.
2. 8+ seçili hesabın gerçek ekleme süresi.
3. Ekleme sırasında başka uygulamaya geçip 2-5 dakika sonra geri dönüldüğünde native job'ın ilerlediğinin doğrulanması.
4. Başarısız tek hesabın diğer başarılı hesapları engellemediğinin testi.
5. Native Room verisinin Live/VOD/Series ekranlarında tam uyumluluğu.

Güncel paket: v15.2.2-RC1
Güncel sürüm: 15.2.2 / versionCode 150202
