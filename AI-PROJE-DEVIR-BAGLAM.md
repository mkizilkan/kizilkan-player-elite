# GÜNCEL DURUM — KIZILKAN PLAYER ELITE v15.2.3-RC1

**Native Core Phase 2 başlıyor.** v15.2.3-RC1, v15.2.2 Room + native bulk import temelini korurken gerçek cihazda kanıtlanan lifecycle reset, çok-playlist RAM baskısı, karma discovery ve duplicate import sorunlarını hedefler: GitHub build'i durduran Groovy/KSP kaçış hatası düzeltilmiştir ve seçili çoklu Xtream hesaplarının katalog indirme/normalize/kaydetme işi gerçek Android foreground native service'e taşınmıştır. Başarılı hesaplar bağımsız kalıcılaştırılır; tek sorunlu hesap diğerlerini bloke etmez; Pause/Resume/Stop ve background devamlılığı native job durumuyla yönetilir.

Room sürümü bilinçli olarak **androidx.room 2.8.3** seçildi. Android-only Expo SDK 54 modülü için olgun 2.x hattı tercih edildi; 2.8.3 Cursor/JNI performans düzeltmesini içerir. Room 3.x KMP odaklı breaking yüzeyi bu faza gereksiz risk olarak eklenmedi.

Kritik amaç: playlist seçimi sonrası ScrollView çalışırken Pressable/navigation'ın 5–10 dakika cevap vermemesi semptomunu, dev koleksiyonların JS thread'e taşınmasını azaltarak mimari olarak bitirmek. Bu RC GitHub `tsc --noEmit` + KSP/Room Kotlin compile + Gradle APK ve gerçek cihaz testi geçmeden stabil sayılmaz.

---

# KIZILKAN PLAYER ELITE — AI PROJE DEVİR / TAM BAĞLAM BELGESİ

> **Güncel çalışma paketi:** **v15.2.3-RC1 — Room/SQLite Native Data Core + Native Foreground Bulk Playlist Import / Player Core 1.0 RC / libmpv 1.0.0 / Native Scan**
> **Son doğrulanmış kurulabilir APK:** **v15.2.2-RC1** — GitHub build tamamlandı ve gerçek telefona kuruldu; ancak cihaz testinde lifecycle reset, çok-playlist RAM/UI kilidi, discovery ve duplicate import P0 sorunları devam etti.
> **Durum:** v15.2.2-RC1 GitHub build tamamlandı ve APK gerçek telefona kuruldu. Room/KSP + native bulk import derlenebilirliği kanıtlandı. Gerçek cihaz testinde ise kısa background geçişinde uygulamanın cold-start/profil seçimine düşmesi, çok playlist ile ciddi yavaşlama/dokunma kilidi, aynı Xtream playlistin 3 kez eklenmesi, karma çoklu discovery davranışının eksikliği, EPG gecikmesi ve görüntü varken stale fallback banner görülmesi kanıtlandı. v15.2.3-RC1 bu P0 kümesini hedefler ve henüz GitHub full build/cihaz kabul testi geçmedi.
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
- Güncel uygulama sürümü: **15.2.3**
- Android versionCode: **150203**
- iOS buildNumber metadata: **15.2.3**
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

Bu tarihsel fazın paketi: v15.2.2-RC1
Bu tarihsel fazın sürümü: 15.2.2 / versionCode 150202


## 18. v15.2.3-RC1 — LIFECYCLE / UNIFIED DISCOVERY / RAM / ATOMIC IMPORT

### Yeni gerçek cihaz kanıtları
- Uygulama kısa süre arka planda kalınca siyah/splash ile yeniden başlıyor ve profil seçimine düşüyor; aynı davranış Canlı/Ayarlar/scan ekranlarında görüldü.
- Tüm playlistler silinince açılış ve kanal geçişi belirgin rahatlıyor; çok playlist varken UI/dokunma ağırlaşıyor.
- Tek Xtream playlist ekleme UI donduğu sırada aynı hesap üç kez oluştu.
- Çoklu hesap discovery ekranda 0/sonuç durumuna düşüyor ve başka uygulamaya geçişte UI state kayboluyor.
- EPG geç yükleniyor ve genel hız hissini düşürüyor.
- Media3 görüntü üretmişken `Alternatif yayın yolu deneniyor (2/2)` banner'ı kalabildi; bayat error/fallback yarışı kanıtlandı.

### Kök neden odaklı değişiklikler
1. `PlaylistContext.addPlaylist` artık Android'de heavy dizileri React state'te tutmaz. bigStore yazımı sonrası Room reindex edilir, state metadata-only olur. Playlist değişince aktif olmayan legacy heavy koleksiyonlar RAM'den atılır. Bu, çok playlist → JS heap/native pressure → Android process kill/reset zincirini doğrudan hedefler.
2. Root session persistence `AppState + usePathname/useSegments` ile son güvenli ekranı ve background zamanını kaydeder. 15 dakika içindeki recreation son ekrana döner; uzun cold-startta profil/PIN güvenliği korunur. Root yönlendirme gecikmesi 1200ms değil 80ms'dir.
3. Çoklu discovery'nin direct server / serverCode / panelName / auto biçimleri tek `startUnifiedScan` foreground native motorunda per-account candidate set ile çalışır. Uzun tarama JS worker'a bağlı değildir.
4. Pending bulk scan/import credential eşlemesi yalnız cihaz SecureStore'da tutulur. Foreground service snapshot'ı parola/token içermez. Add Playlist ekranı yeniden mount olduğunda native snapshot'a tekrar bağlanır; import tamamlanan playlist metadata'sı yeniden benimsenebilir.
5. Xtream playlist id server+username'dan deterministik üretilir ve JS in-flight lock aynı hesabın UI gecikmesi sırasında tekrar kuyruğa girmesini engeller.
6. EPG yalnız ilk görünür 16 kayıt için UI interactions bittikten sonra başlar; kanal listesinin hazır olması EPG'ye bağlı değildir.
7. Player first-frame başarı timestamp'i tutulur; başarıdan hemen sonra gelen bayat source/VLC error 1.8 sn penceresinde çalışan session'ı alternatif URL'ye taşıyamaz.

### v15.2.3 zorunlu GitHub/cihaz doğrulaması
- `tsc --noEmit`, Expo prebuild, panel-scan unified Kotlin, Room/KSP Kotlin, MPV Kotlin, release APK/signing.
- Canlı/Ayarlar/Add Playlist ekranında 1-5 dk background ve geri dönüş.
- 5+ büyük playlist ile açılış, UI touch ve RAM.
- Aynı Xtream hesabını art arda tetikleyip tek kayıt kalması.
- Karışık çoklu hesap discovery + pause/resume/stop + background restore.
- EPG ilk görünme süresi ve UI interaktifliği.
- Görüntü geldikten sonra stale fallback banner/URL switch olmaması.

**KALAN / SONRAKI ISLER:** Search/Favorites/VOD/Series ve custom-group ağır hydrate yollarını Room paging/index query'ye taşımak; RAM `dumpsys meminfo` matrisi; APK ABI/.so boyut analizi; 4K MPV ve 20 ZAP kabul testleri.

---
# v15.2.4-RC1 — NATIVE CORE PHASE 2 DEVİR EKİ (2026-08-23)

## NEDEN BAŞLANDI?
v15.2.3-RC1 gerçek cihaz testinde background→foreground profil reset sorunu kullanıcı tarafından düzelmiş olarak doğrulandı. Buna rağmen:
- çok playlist olduğunda UI/RAM baskısı,
- iki liste ile 212 MB uygulama verisi,
- EPG gecikmesi,
- çoklu discovery'nin kullanıcı tarafından denetlenemeyen hızlı/erken sonucu,
- stale scan modal resurrection,
- duplicate playlist ekleme,
- görüntü gelmesine rağmen stale fallback overlay,
devam etti.

## KÖK MİMARİ BULGU
Room eklenmiş olmasına rağmen `PlaylistContext.ensureHeavyLoaded()` ve `bigStore` legacy heavy JSON yolu hâlâ canlıydı. Yeni yazımda hem Room hem heavy JSON bulunabilmesi storage çiftlemesine ve yeniden hydrate maliyetine yol açabiliyordu. v15.2.4'te Android için Room/SQLite canonical store yapılmıştır. Legacy JSON yalnız migration/fallback'tir.

## KRİTİK KENDİ-REGRESYON DÜZELTMESİ
v15.2.4 geliştirmesi sırasında önemli bir hata paketlenmeden yakalandı:
`bigStore.write()` canonical Room importunu tamamlayıp legacy dosyayı temizledikten sonra `PlaylistContext.addPlaylist()` eski mantıkla `reindexPlaylist()` çağırırsa snapshot invalidate olur ve sistem artık silinmiş legacy dosyaya geri düşebilir. Bu çağrı `getPlaylistSummary()` doğrulamasına çevrildi. Bu bulgu mutlaka korunmalıdır.

## ROOM CANONICAL MODEL
4 playlist varsa 4 playlistin tamamı Room'da indeksli kalır. React Native/Hermes tarafında yalnız aktif/görünen sayfalar bulunur. Aktif olmayan playlistler metadata-only tutulur.

## NATIVE EPG CORE
`epg_programs` Room tablosu eklendi; DB version 2 ve explicit MIGRATION_1_2 vardır. Android'de XMLTV native indirme/parse ve visible channel now/next sorgusu kullanılır. JS regex parser web/legacy fallback'tir.

## PLAYLIST PIPELINE
- Xtream direct/native importer → Room.
- Sunucu kodu/panel discovery sonucu → native importer → Room.
- Çoklu seçilen hesaplar → native importer → Room.
- M3U URL → native download + Kotlin parse → Room.
- M3U Dosya → Kotlin parse → Room.
- MAG/Stalker: cihaz içi async protocol korunur; deterministic portal+MAC kimliği ve final Room canonical persist vardır. Bu sürümde MAG protokolü foreground service'e tamamen taşınmış DEĞİLDİR.

## DISCOVERY
Unified native engine tam account×candidate matrisi üzerinde çalışır; kullanıcıya accountStatuses, tested/total/remaining/found, current panel/server gösterilir. Pause/Resume/Stop native service davranışı korunur. Completed eski snapshot yeni Activity'de modalı zorla diriltmez; canlı işlem sonuçları anlık görünür.

## 5 TARAMA HIZI
Çok Güvenli / Güvenli / Dengeli / Hızlı / Turbo; Sunucu Kodu/Panel/Çoklu UI yüzeylerinde ortak `scanConfigForSpeed()` sözleşmesine bağlanmıştır.

## SUNUCU KODU / DNS
DNS self-heal mevcut `refreshPlaylist.ts` davranışı korunur. Sunucu kodu canlı üst hesap bilgisinde görünür ve Edit Playlist'te manuel değiştirilebilir. Yeni kod directory + gerçek Xtream auth ile doğrulanmadan binding değiştirilmez. DNS otomatik güncelle açık/kapalı görünür.

## SEARCH/FAVORITES/VOD/SERIES
Search Room `queryItems`; Favorites/Recent `getItemsByIds`; Detail `getItem`; VOD/Series paged query kullanır. Custom user groups gibi eski işlevler silinmemiştir; gerektiğinde legacy lazy hydrate fallback kullanılır.

## PLAYER
Media3 → MPV/FFmpeg → VLC motor zinciri korunur. v15.2.4'te tam native player ownership tamamlanmamıştır; Phase 1 olarak Kotlin Native Core `AtomicLong` session generation authority eklenmiştir ve `PlaybackSessionGate` Android'de native begin/isActive/invalidate kullanır. Amaç stale callback/fallback isolation'ı sertleştirmektir.

## TELEMETRİ
`getRuntimeMemory()` Android Debug.MemoryInfo PSS/native/ART değerlerini; `getStorageFootprint()` Room DB/WAL/SHM ve legacy playlist byte/file count değerlerini verir. Stats ekranında gösterilir. `tools/analyze-apk.js` GitHub APK'sını ABI/native `.so` bazında analiz eder; workflow raporu artifact'e ekler.

## GÜVENLİK / SIGNING
ANDROID_CERT_SHA256 ve diğer signing secrets GitHub Secrets içinde kalır. `.jks`, `.base64`, release-GITHUB.txt ZIP/Git'e alınmamalıdır.

## KALAN / SONRAKI ISLER
1. GitHub Actions ile v15.2.4-RC1 gerçek TypeScript/KSP/Kotlin/Gradle build doğrulaması.
2. Gerçek cihazda 1/3/5 playlist RAM/UI karşılaştırması.
3. Unified discovery 4 farklı credential ile account/panel/address progress doğrulaması.
4. EPG büyük XMLTV performans testi.
5. Native Player Session Arbiter sonrası 4K/ZAP/stale fallback gerçek cihaz testi.
6. GitHub APK footprint raporundan ABI split/AAB/arm64-only kararının verilmesi.
7. MAG/Stalker foreground-service migration yalnız gerçek cihaz ölçümü gerek gösterirse ayrı kontrollü faz olarak planlanacak.

## SOHBET DEVİR SÖZLEŞMESİ
Yeni sohbet bu dosyayı baştan sona okumadan projede kod değişikliği yapmamalıdır. Yapılmış bir özelliği azaltmak/silmek yasaktır. Önce gerçek kaynak ve gerçek cihaz bulgusu incelenmeli; kör patch yapılmamalıdır. Her yeni ZIP bu belgeyi güncel ve ayrıntılı taşır.

# v15.2.5-RC1 — CAST + CHUNKED NATIVE IMPORT HARDENING DEVİR EKİ (2026-08-23)

## NEDEN YENİ REVİZYON
v15.2.4-RC1 Native Core Phase 2 cihaz/reposuna senkronlanmadan önce yapılan son audit sırasında iki gerçek mimari risk bulundu. Birincisi, `addPlaylist/updatePlaylist` compatibility yolları Android Native Core mevcutken bile tek parça `JSON.stringify({channels,vod,series})` yapabiliyordu; çok büyük MAG/legacy kataloglarında bu JS thread'i tekrar uzun süre bloke edebilirdi. İkincisi Chromecast'te existing-session rebind, kanal/source change ve remote->local position handoff tam değildi. Onaylı kapsam genişlediği için sürüm bilgisi yükseltildi; v15.2.4 özellikleri çıkarılmadı.

## CHUNKED NATIVE PLAYLIST STAGING
`bigStore.write()` Android Native Core mevcutken artık dev katalogu tek JSON blob'a çevirmez. channels/vod/series 500 kayıtlık bounded chunk'lara ayrılır. Her chunk ayrı JSON stringify edilir, `KizilkanNativeCore.appendPlaylistChunk()` ile native staging dosyasına aktarılır ve her chunk arasında event-loop'a kontrol verilir. `finishChunkedPlaylistImport()` staging dosyasını native worker'da okur ve tek Room transaction içinde canonical `media_items + playlist_snapshot` setini değiştirir. Final transaction başarıya ulaşmadan eski Room snapshot canonical kalır. Başarısız/yamalı staging `cancelChunkedPlaylistImport()` ile temizlenir. Başarılı finalization sonrasında eski duplicate legacy heavy JSON silinir.

Bu mekanizma özellikle MAG/Stalker gibi protokolü halen JS tarafında çalışan compatibility yollarında dev tek-parça serialization riskini azaltır. MAG/Stalker network/protocol katmanının tamamı native'e taşınmış SAYILMAZ; yalnız persistence/serialization zinciri hardened edilmiştir.

## CHROMECAST AUDIT VE DÜZELTMELER
- Yeni Cast session başladığında mevcut source receiver'a yüklenir.
- Mevcut Cast session background/activity recreation sonrası bulunduğunda medya zorla yeniden `loadMedia()` edilmez; session yalnız rebind edilir.
- Cast bağlıyken gerçek channel/source değişimi algılanır ve yeni source receiver'a tek generation ile yüklenir.
- `loadGenerationRef` eski load completion callback'lerinin yeni kaynağın state'ini bozmasını engeller.
- PlayerHost `getMediaStatus()` + `onMediaStatusUpdated` ile remote `playerState`, `streamPosition`, volume ve `liveSeekableRange` state'ini izler.
- Play/Pause UI artık optimistic local toggle'a güvenmez; receiver `MEDIA_STATUS_UPDATED` state'i authoritative kabul edilir.
- VOD Cast session kapanınca son remote position local MPV/VLC/Media3'e seek edilip playback o noktadan devralınır.
- Player görünür değilken Cast session kapanması gizli local sesi yeniden başlatmaz.
- Live Cast seek yalnız receiver `liveSeekableRange` bildiriyorsa açılır ve range'e clamp edilir.
- Player'dan geri/çıkış local stop semantiğine paralel olarak remote media `stop()` çağırır; Cast session zorla sonlandırılmaz.
- Telefon -> receiver volume komutu korunur; receiver media status volume değeri telefon UI'ına geri yansıtılır.

## TV BOX KARARI
v15.2.5'te TV Box arayüzü baştan yazılmamıştır. Native paging/player/cast değişikliklerinin D-pad/focus/TV yüzeylerini bozmadığı statik regresyon audit'i kapsamındadır. Tam 10-foot UI/focus graph/focus restore revizyonu sonraki ayrı sürüme bırakılmıştır.

## KALAN / SONRAKI ISLER
1. GitHub Actions gerçek `tsc --noEmit`, Expo prebuild, Room/KSP Kotlin ve Gradle release build kanıtı.
2. Chromecast gerçek cihaz: connect/rebind, channel zap, play-pause, VOD seek, remote->local handoff, live DVR capability ve player-exit remote stop testleri.
3. MAG/Stalker protokolünü de tamamen native foreground core'a taşıma fizibilitesi; mevcut sürüm bunu yapılmış göstermez.
4. TV Box 10-foot UI overhaul sonraki sürüm.
5. Gerçek RAM/storage/APK footprint ölçüm raporlarının cihaz verisiyle karşılaştırılması.


# v15.2.6-RC1 — TYPESCRIPT HARD-GATE REGRESSION FIX DEVİR EKİ (2026-08-23)

## BUILD KIRILMASI VE KANITLANAN KÖK NEDEN
GitHub Actions v15.2.5-RC1'i `npx tsc --noEmit` HARD gate aşamasında durdurdu. Gradle/KSP/Kotlin aşamasına geçilmedi. İki gerçek kaynak regresyonu kanıtlandı:

1. `frontend/app/(tabs)/search.tsx`: Native Room `queryItems()` doğrudan `Channel/VodItem/SeriesItem` döndürürken legacy `fuzzySearch()` `FuzzyResult<T> = {item, score}` döndürüyordu. Aynı `liveResults/vodResults/seriesResults` değişkenleri iki farklı shape taşıdığı halde render yalnız `r.item` varsayıyordu. TS2339 hataları bu model çakışmasını doğru yakaladı. Ayrıca native Series sonuçları hesaplanmasına rağmen `seriesResults` eski fuzzy yolu kullanmaya devam ediyordu.
2. `frontend/app/add-playlist.tsx`: Xtream yöntemi `submit()` içinde 1151 civarında `submitXtreamDirect()` ile işlenip `return` ediyordu. Daha aşağıdaki ikinci `else if (method === "xtream")` eski JS-heavy Xtream akışından kalmış, erişilemez duplicate koddu. TypeScript control-flow narrowing bunu TS2367 ile yakaladı. Aynı şekilde aşağıdaki `method === "code"` branch'i de üst discovery branch'leri tüm code durumlarını return ettiği için erişilemezdi.

## UYGULANAN DÜZELTME
- Search sonuçları UI katmanına artık tek shape ile gelir: `Channel[]`, `VodItem[]`, `SeriesItem[]`. Legacy fuzzy sonuçları render öncesi `.map(result => result.item)` ile gerçek item dizisine normalize edilir; Native Room sonuçları doğrudan aynı diziyi kullanır. `as any` ile hata bastırılmamıştır.
- Native Series araması da `nativeSeriesResults` üzerinden aynı Room akışına bağlanmıştır.
- İkinci/ölü Xtream branch'i kaldırılmıştır. Xtream için tek gerçek giriş `submitXtreamDirect()` olarak korunur: Android'de native foreground importer → Room; native olmayan fallback'te mevcut JS yolu korunur.
- Üstte discovery tarafından tamamen tüketilen ikinci/ölü `method === "code"` branch'i de kaldırılmıştır. MAG/Stalker çalışan else yolu korunmuştur.
- v15.2.5 Native Core Phase 2, Cast hardening, chunked staging, Room canonical, EPG, discovery ve player geliştirmelerinden hiçbir özellik çıkarılmamıştır.

## DOĞRULAMA SINIRI
Bu çalışma ortamında bağımlılık kurulumu ağ/DNS erişimi olmadığı için tamamlanamamıştır; bu nedenle tam proje `npx tsc --noEmit`, Expo prebuild, Room/KSP/Kotlin ve Gradle build burada başarılıymış gibi gösterilmez. Kaynak düzeltmeleri GitHub Actions gerçek HARD gate ile yeniden kanıtlanacaktır.


# v15.2.7-RC1 — KOTLIN CHUNKED WRITER BUILD FIX DEVİR EKİ (2026-08-23)

GitHub Actions v15.2.6-RC1 TypeScript HARD gate'i ve `:kizilkan-native-core:kspReleaseKotlin` aşamasını geçti. Gerçek kırılma `KizilkanNativeCoreModule.kt:96` satırında `Too many arguments for OutputStream.bufferedWriter` olarak kanıtlandı. Chunked staging append kodu `bufferedWriter(Charsets.UTF_8, 64 * 1024)` çağırıyordu; bu extension yalnız charset kabul eder. v15.2.7-RC1'de 64 KiB buffer semantiği korunarak `BufferedWriter(OutputStreamWriter(FileOutputStream(...), UTF_8), 64 KiB)` kullanıldı. Aynı native-core kaynak ağacındaki buffered reader/writer çağrıları tarandı; aynı writer overload hatası başka yerde yok. v15.2.6 ve önceki Native Core/Room/Cast/Discovery/EPG/Player geliştirmeleri geri alınmadı. Gerçek Kotlin/Gradle sonucu CI ile doğrulanacaktır.


## v15.2.8-RC1 — Job Lifecycle / Discovery / Player Health Hardening
- Scan ve bulk import için runId/generation sahipliği eklendi; stale snapshot yeni işi tamamlayamaz.
- Discovery AUTH başarısı ile import başarısı ayrıldı; endpoint hataları artık sessizce [] yapılmıyor.
- Live VLC soft stall pause/play müdahalesi kaldırıldı; canlı VLC health son native event + advance sinyaliyle değerlendirilir.
- M3U/MAG canonical duplicate koruması, doğrulanmış Room sonrası legacy cleanup ve Android process-exit telemetrisi eklendi.

# v15.2.9-RC1 — SERVER DISCOVERY ORCHESTRATOR HARDENING (2026-08-24)

## KANITLANAN KÖK NEDENLER
Gerçek cihaz videosu + v15.2.8 kaynak audit'i ile Sunucu Kodu bölümündeki `Kodum var / Paneli biliyorum / Paneli bilmiyorum` yollarının ortak problemi doğrulandı:
1. `PanelScanService` çalışan job varken yeni ACTION_START/BULK/UNIFIED isteğini `if (!running)` ile sessizce yutabiliyordu. `PanelScanModule` ise bundan önce yeni runId + STARTING snapshot yazdığı için JS gerçekte başlamamış işi bekleyebiliyordu.
2. Pause/Resume/Cancel komutları runId taşımıyordu; yanlış job'ı kontrol etme riski vardı.
3. Firebase katalog `fetch()` çağrılarında client timeout yoktu; kritik UI yolu uzun süre `Panel rehberi yükleniyor / DNS hazırlanıyor` durumunda kalabiliyordu.
4. `Paneli biliyorum` seçiminde zaten mevcut olan `PanelDirectoryItem.hosts[]` kaybediliyor, submit sırasında panel/kod Firebase'den ikinci kez çözülüyordu.
5. Katalog her kullanımda ağdan çekilmeye fazla bağımlıydı; sağlam son rehber cihazda cache-first kullanılmıyordu.

## UYGULANAN MİMARİ
- `PanelScanService.claimRun()` process-içi atomik job sahipliği ekledi. Service başlamadan önce iş gerçekten CLAIM edilir; claim başarısızsa native bridge açık `BUSY + activeRunId` döndürür.
- Sessiz `ACTION_* -> if (!running)` başlangıç modeli kaldırıldı. Service yalnız claim edilmiş runId'yi kabul eder.
- Pause/Resume/Cancel artık runId-scoped; Service yalnız `requestedRunId == currentRunId` ise kontrol uygular.
- TS bridge `NativeScanStartResult {accepted,state,runId,activeRunId}` kullanır. UI BUSY durumunda kullanıcıya `Vazgeç / Durdur ve Yeni Tara` seçimi sunar; eski run gerçekten release edilmeden yeni tarama başlatılmaz.
- `serverCode.ts` katalog fetch'ine AbortController client timeout + Firebase REST `timeout=` parametresi + bounded retry eklendi.
- Son başarılı panel directory cihazda `kizilkan.panelDirectory.cache.v15.2.9` altında tutulur. Taze cache UI'yi anında açar; arka planda remote refresh denenir. Stale cache remote hata halinde fallback olarak korunur.
- Kod cache'de yoksa `resolvePanelDirectoryItem()` remote kataloğu bir kez force-refresh eder; yeni eklenen kodlar taze cache yüzünden yanlış `yok` sayılmaz.
- `Paneli biliyorum`: seçilen `PanelDirectoryItem` state'te korunur; `hosts[]` doğrudan candidate set olur ve submit sırasında ikinci Firebase lookup yapılmaz.
- `Kodum var`: code -> directory item -> hosts candidate set; native scan ortak motoru.
- `Paneli bilmiyorum`: mevcut aynı-source directory/cache -> bütün candidate set -> aynı native scan ortak motoru.
- Çoklu hesap unified discovery de aynı cache-first directory üretimini kullanır.

## KABUL KRİTERLERİ
- Üç giriş yolunda native scan gerçekten ACCEPTED olmadan UI RUNNING sayılmaz.
- Aynı anda eski scan varsa yeni scan sessizce kaybolmaz; kullanıcı açık BUSY kararı görür.
- Pause/Resume/Cancel başka run'a etki etmez.
- Paneli biliyorum seçiminden sonra ikinci Firebase çözüm çağrısı yoktur.
- Firebase yavaş/erişilemez olduğunda bounded timeout ve varsa son sağlam cache kullanılır.
- Gerçek cihazda `Kodum var / Paneli biliyorum / Paneli bilmiyorum` aynı geçerli hesapla tarama -> seçim -> doğrulama -> import -> Room -> playlist commit zincirini tamamlamadan bu RC stabil sayılmaz.

## DOĞRULAMA SINIRI
Bu kaynak ortamında gerçek Expo prebuild/Android Gradle/Kotlin release build yapılmış sayılmaz. Statik gate ve syntax kontrolleri yapılır; gerçek Kotlin/Gradle/APK kanıtı GitHub Actions, davranış kanıtı gerçek cihaz testidir.
