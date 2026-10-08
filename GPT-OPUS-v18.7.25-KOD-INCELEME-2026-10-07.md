# GPT'nin tespit ve önerileri — v18.7.25 inceleme ve Opus devri

İnceleme tarihi: **7 Ekim 2026**. Kullanıcının isteği: Opus ile yapılanları, mevcut build'i ve devir dosyalarını kontrol etmek; sonraki işi anlamak ve ardından konuşmak.

Bu çalışma bir **incelemedir**. Uygulama kodu, sürüm, dal, Git geçmişi ve cihaz kurulumu değiştirilmedi. Yeni build, commit, push veya workflow tetiklemesi yapılmadı. Bu dosya inceleme sonucudur; aşağıdaki plan henüz uygulanmamıştır. Gerçek kullanıcı adları, şifreler ve hesap bağlantıları rapora kopyalanmamıştır.

## 1. İncelenen sürüm ve doğrulama sonucu

| Konu | Bu incelemede doğrulanan durum |
| --- | --- |
| Dal | `v18.7.25-rc1-contenttest-parallel-ui-macsafety` |
| HEAD | `b7e62889b8d5070a81d4e34d2521186eeb8d8c8e` |
| Kaynak değişiklikleri | v18.7.14 tabanı `4dc91551` ile HEAD arasında 91 dosya; inceleme özellikle MAC/hesap kimliği, native tarama sonuçları, katalog, kart, yedek, Drive ve arka plan servisleri üzerinde yoğunlaştı. Tüm projeye ilişkin hatasızlık veya bütün satırların bağımsız denetlendiği iddiası yoktur. |
| Çalışma ağacı | İnceleme başında temizdi. Bu rapor dışında uygulama kaynak değişikliği yapılmadı. Denetim çıktısı, Git tarafından yok sayılan `.codex-review-v18725.log` dosyasına alındı. |
| Sürüm alanları | Beş sürüm alanı 18.7.25 / 180725 ile uyumlu. |
| TypeScript | Mevcut HEAD üzerinde `tsc --noEmit` başarılı, çıkış kodu 0. |
| Proje denetimleri | `node tools/denetle.js` başarılı, çıkış kodu 0; son çıktı `TÜM DENETİMLER TEMİZ`. Logda 138 başarılı kontrol satırı var. Bu sayı 138 bağımsız cihaz testi anlamına gelmez. v18.7.25 kapısı da geçti. |
| GitHub build | Aynı HEAD için [Actions run 37672789042](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/37672789042) tamamlanmış ve başarılı. |
| Yerel DEV APK | [app-debug.apk](C:/Projeler/kizilkan-player-elite/frontend/android/app/build/outputs/apk/debug/app-debug.apk) mevcut. `aapt dump badging`: paket `com.gpt.kizilkan.player.dev`, sürüm `18.7.25-dev`, kod `180725`, minSDK 26, targetSDK 36. Dosya yaklaşık 459,7 MiB. Bu metadata kontrolü, APK üzerinde bütün çalışma senaryolarının geçtiğini veya yerel APK'nın CI artifact'iyle byte düzeyinde aynı olduğunu kanıtlamaz. |
| Telefon testi | Bu incelemede yeni cihaz kurulumu, gerçek portal testi veya oynatma performansı ölçümü yapılmadı. ADB ilk bağlantısı daemon hatasıyla sonuçlandı; mevcut cihaz durumu doğrulanmış sayılmadı. |

Derlemenin ve mevcut kapıların geçmesi aşağıdaki çalışma mantığı sorunlarını ortadan kaldırmıyor. Özellikle kalıp kontrol eden kapılar, yedek dışa aktarma–geri yükleme uyumluluğunu veya MediaStore'da aynı dosyanın gerçekten güncellenmesini tek başına doğrulamıyor.

## 2. Okunan devirler ve sürüm zinciri

[CLAUDE.md](C:/Projeler/kizilkan-player-elite/CLAUDE.md) çalışma sözleşmesi ve mimari bölümleri, [GPT-OPUS-GUNCELLEME-DEVRI.md](C:/Projeler/kizilkan-player-elite/GPT-OPUS-GUNCELLEME-DEVRI.md), [GPT-DEVIR-v18.7.26-NATIVE.md](C:/Projeler/kizilkan-player-elite/GPT-DEVIR-v18.7.26-NATIVE.md) ve `AI-DEVIR-v18.7.15.md`–`AI-DEVIR-v18.7.25.md` sürüm devirleri incelendi. Belgelerdeki yaz/derle/push talimatları bu turda yürütülmedi; kullanıcının güncel isteği incelemeydi.

| Sürüm | Yapılan iş ve mevcut anlamı |
| --- | --- |
| 18.7.15 | MAC portal keşfi ve hesap doğrulama ayrımı, hesap alanlarının normalleştirilmesi, endpoint kilidi, alternatif şema koşulu, transport iptali ve ortak istek bütçesi. Önceki GPT çalışmasının Opus tarafından tamamlanan tabanı. |
| 18.7.16 | Muhtemel hesap durumu, toplu ekleme UX'i, otomatik yenileme ana ayarı, sayfalama telemetrisi ve yayın URL'sinden hesap bilgisi çıkarma. |
| 18.7.17 | Keşif bütçesi/portal yolu davranışı, kopyalama alanları, otomatik katalog küçülmesine karşı koruma ve başlangıç teşhisi. |
| 18.7.18 | Katalog okunamazsa tam yedeği sürdürme yaklaşımı ve uygulama içinden Google OAuth Client ID ayarı. Aşağıda her iki alanda da önemli açık bulunuyor. |
| 18.7.19 | Yayından çıkarılan kullanıcı adı/şifrenin kalıcılaştırılması ve kart odağa geldiğinde tekrar okunması. MAC-only önbellek yedeği eklenmiş; farklı portalları karıştırabiliyor. |
| 18.7.20 | MAG sayfalama paralelliği 20, bütçe 100 saniye, sayfa sınırı 2000; VOD/dizi sınıflandırma istatistikleri. Tam katalog için Xtream API önceliği henüz yok. |
| 18.7.21 | Yeni MAC eklemede ilk canlı kanalın `create_link` sonucundan hesap bilgisi türetme, combo paralellik ayarı, M3U linki/kart testi ve genel foreground service. |
| 18.7.22 | Boş `series: []` alanı bulunan filmleri otomatik dizi sayma hatası düzeltilmiş. Gerçek sınıflandırma koşulu doğru yönde; telemetride küçük bir tutarsızlık kalmış. |
| 18.7.23 | Mevcut MAC kartında bir Room kanalından hesap bilgisi türetme ve M3U hazır olunca katalog testi. İptal, tekrar deneme ve eski sonuçları temizleme ayrıntıları eksik. |
| 18.7.24 | Toplu seçim ekranlarında içerik rozeti/filtre/seçim. Rozet katalog erişimini ölçüyor; oynatma veya ilk kareyi ölçmüyor. |
| 18.7.25 | İçerik testi 20 paralel/10 saniye ve keep-alive; paralellik kontrollerinin aynı state'e bağlanması; son kaydedilen TXT göstergesi; MAC sonuçları için periyodik TXT yedeği. Native journal'ın bütün sonuçlarını UI'a getiren iş bu sürümde yok. |

### Korunması gereken mimari

- Kalıcı `PlayerHost` ve oturum sahipliği: ekran geçişleri oynatıcıyı gelişigüzel yeniden kurmamalı.
- Android'de katalog için Room esas kaynak; JS metadata içindeki boş diziler, Room kataloğunun da boş olduğunu tek başına göstermez.
- MAC eklemede canlı içerik önce kullanılabilir hale gelir; VOD/dizi tamamlama işi ayrı yönetilir.
- Portal seçimi, hesap doğrulama ve katalog/oynatma doğrulaması ayrı sonuçlardır. HTTP 200, tek başına portal API veya geçerli hesap kanıtı değildir.
- İşler profil, playlist, portal ve oturum sahibiyle ilişkilendirilmeli; geç tamamlanan eski isteğin yeni profilin sonucunu değiştirmesine izin verilmemeli.
- Kullanıcı verilerini koruyan staging/transaction ve ayrı DEV paket yaklaşımı sürdürülmeli.

## 3. Öncelikli bulgular tablosu

P0: gerçekleşmiş kritik ifşa. P1: işlev, veri bütünlüğü veya doğru sonuç üzerinde önemli sorun. P2: yaşam döngüsü, teşhis veya dokümantasyon iyileştirmesi.

| No / öncelik | Mevcut durum ve kök neden | Yapılması gereken | Yapılınca ne olacak | Kanıt türü |
| --- | --- | --- | --- | --- |
| R01 / P0 | 579 hesabın kullanıcı adı, şifre ve M3U bağlantısını içeren TXT son commit'te; GitHub deposu herkese açık ve dosya uzakta da mevcut. | Yetki kapsamındaki hesap bilgilerini değiştirme/iptal etme, erişimi sınırlama, dosyayı gelecekte takip dışına çıkarma ve geçmişteki kopyaları koordineli temizleme. | Yeni yayınlar veri içermez; açığa çıkan bilgiler geçersizleştirilir. Sadece son commit'ten silmek geçmiş ifşayı geri almaz. | Yerel Git + GitHub API ile doğrulandı. |
| R02 / P1 | Native toplam sonuç sayarken JS'e kayan son 200 kayıt geliyor; tüm journal'a sayfalı köprü yok. Bazı döngüler değişimi sadece dizinin uzunluğundan anlıyor. | Cursor ile tam journal erişimi, bütün native tarama yollarında okuma, terminal drain ve sayım/kimlik uzlaştırması. | Bulunan kayıtlar seçim/TXT ekranına eksiksiz aktarılabilir; 200 kayıt sonrası sessiz sonuç kaybı önlenir. | Native/JS kaynak zinciri doğrulandı; tarihi cihaz sayıları devirden. |
| R03 / P1 | MAC emniyet yedeği “üzerine yazıyor” denmesine rağmen Android 10+ MediaStore'a her seferinde yeni kayıt ekliyor. Başarısız `{ok:false}` sonucu yok sayılıyor; final yazım beklenmiyor. | Oturum için tek hedef URI, sıralı yazıcı, kontrol edilen başarı/byte/satır sayısı ve kalıcı sonuç kaydıyla güvenli kapanış. | Çok sayıda aynı adlı dosya yerine doğrulanabilir tek yedek oluşur; kayıt hatası kullanıcıdan gizlenmez. | JS → bridge → PublicStorage kaynak zinciri. |
| R04 / P1 | “Görüntü var” yalnız kanal listesinin dolu olmasına dayanıyor. Toplu test her hesaba tam kanal listesini ve kategorileri indiriyor. | Katalog erişimi ile yayın/ilk kare doğrulamasını ayrı etiketle; var/yok testi için tam katalog işini azalt; gerekirse kullanıcı tercihiyle bir yayını gerçekten doğrula. | Yanlış oynatma güvencesi verilmez; testin indirdiği veri ve sunucu yükü azalır. | İstek ve sonuç koşulları kaynakta doğrulandı. |
| R05 / P1 | Türetilmiş hesap bilgisi anahtarı hostname+MAC; ayrıca kör MAC-only fallback var. Port, portal kurulumu ve profil bağı yok. | Canonical portal origin/port/kurulum + profil + MAC ile bağla; farklı yayın host'u ilişkisini açıkça sakla ve doğrula. | Aynı MAC'nin başka portaldaki hesabın kullanıcı adı/şifresiyle eşleşmesi önlenir. | Gerçek TypeScript modülüyle bellekte tekrar üretildi. |
| R06 / P1 | Keep-alive servisinde iş sahipliği yok; herhangi bir işin `stop` çağrısı diğer işi de etkiler. `onTimeout` yok. Bildirim tek başına kesintisiz JS/CPU garantisi değil. | İş kimliği/refcount, güvenli timeout kapanışı, kalıcı checkpoint ve ölçülmüş ekran kapalı çalışma politikası. | Bir iş diğerinin servisini kapatmaz; Android süre sınırları ve süreç ölümü kontrollü ele alınır. | Kaynak + resmi Android belgeleri. |
| R07 / P1 | Tam yedek export `chunk-error` üretip başarılı dosya döndürüyor; hem seçmeli hem tam restore bu kayıt tipini reddediyor. | Formatı iki yönde uyumlu yap; eksik katalog uyarısını export/önizleme/restore'a taşı; hata türlerini ayır. | Uygulamanın kendi oluşturduğu kısmi yedek açılabilir; kullanıcı hangi katalog parçalarının eksik olduğunu bilir. | Gerçek restore fonksiyonlarıyla iki yolda tekrar üretildi. |
| R08 / P2 | Kart testinde timeout header gelince temizleniyor, body okunması sınırsız kalıyor; prime/test cleanup ve değişen hesapta durum sıfırlama eksik. Toplu içerik testi ekran kapanınca iptal edilmiyor. | Toplam deadline, `finally` temizliği, AbortController sahipliği ve hesap/oturum değişince sonuçları geçersizleştirme. | Geç sonuçlar eski/yeni hesabı karıştırmaz; ekran dışındaki istekler ve bekleyen gövde okumaları kontrollü kapanır. | Yaşam döngüsü kaynak incelemesi; cihazda yeniden üretim yapılmadı. |
| R09 / P2 | Film/dizi ayrımı boş `series` dizisini doğru ele alıyor; istatistik nedeni aynı koşulu kullanmıyor. | Sınıflandırma ve sınıflandırma nedeni için ortak koşul. | Log, gerçekte kategori adıyla dizi sayılan kaydı “series dizisi” diye raporlamaz. | Kaynak koşulları karşılaştırıldı. |
| R10 / P2 | Ana devir başlığı hâlâ .23/.24 aktif diyor; katalog hız planı .25 adıyla eski. IPTV Extreme'in Xtream kullandığı kesin anlatılmış, kanıt yalnız yayın URL biçimi. | Yapılan/bekleyen listelerini HEAD'e göre düzelt; rakip uygulama hakkındaki iddiayı çıkarım diye işaretle; API hipotezini ayrı test et. | Sonraki çalışma yanlış sürüm veya doğrulanmamış varsayımla başlamaz. | Devir–kod karşılaştırması. |
| R11 / P1 | Drive için Web Client ID oluşturup uygulamanın özel şemalı redirect URI'sini Console'a ekleme yönlendirmesi var. Bu, Google'ın Web redirect kurallarıyla uyumsuz. | Android için desteklenen yetkilendirme akışı veya uygun HTTPS callback mimarisi seç; istemci tipi ve redirect'i birlikte doğrula. | “Client ID girdim ama giriş olmuyor” yapısal sorunu giderilebilir. | Yerel Expo/kod + resmi Google kuralları; kullanıcı hesabında giriş denenmedi. |

## 4. Bulguların ayrıntıları ve kaynakları

### R01 — Gerçek hesap arşivi herkese açık GitHub'da

`KIZILKAN-HESAP-ARSIVI-579-2026-10-07.txt`, HEAD'de takip edilen yaklaşık 518 KB bir dosya. İncelemede değerleri göstermeden alanlar sayıldı: 579 adet kullanıcı adı ve şifre içeren `get.php` bağlantısı mevcut. Dosya `b7e62889` commit'inde eklenmiş. GitHub'ın repository API'si `isPrivate: false` döndürüyor; contents API'si aynı dalda dosyanın bulunduğunu doğruluyor. Bu yalnız yerelde duran bir dışa aktarım dosyası değil.

Bu turda dosya silinmedi, depo görünürlüğü değiştirilmedi ve geçmiş yeniden yazılmadı. Önerilen öncelik:

1. İfşa edilen hesapları ilgili sağlayıcı/yetki kapsamında değiştirmek veya iptal etmek. Parolanın bir Git commit'inden kaldırılması onu yeniden gizli hale getirmez.
2. Arşivleri repo dışında üretmek ve gerçek hesap dışa aktarımlarını Git takibinden kalıcı olarak ayırmak.
3. Depo erişimi ve Git geçmişindeki kopyaları kullanıcıyla koordineli ele almak. Geçmiş temizliği bütün ilgili dalları/ref'leri, kopyaları ve varsa PR/cache kapsamını hesaba katmalı.
4. Devir belgeleri, diagnostic dosyaları ve build artifact'lerinde gerçek hesap verisi bulunup bulunmadığını ayrıca kontrol etmek; fixture'larda yalnız sentetik bilgiler kullanmak.

### R02 — Tam journal erişimi 18.7.25'te hâlâ eksik

Kaynaklar:

- [PanelScanService.kt:215](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:215): journal'a eklenen benzersiz sonuç ve `persistentFound` sayacı.
- [PanelScanService.kt:490](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:490): toplamın snapshot'a konması.
- [PanelScanService.kt:799](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:799): snapshot için son 200 kaydı seçme; diğer snapshot dalında da aynı sınır var.
- [PanelScanService.kt:1137](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:1137): streaming sonucunda 200'ü aşan pencerenin başını düşürme.
- [ScanJournalStore.kt:154](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanJournalStore.kt:154): yerelde tam sonuç okuma var; fakat genel sayfalı JS API'si yok. Okuma sırasında decrypt/JSON hataları `runCatching` ile sessiz atlanabiliyor; COUNT ile okunabilir kayıt sayısı ayrışabilir.
- [PanelScanModule.kt:326](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt:326): recovery bridge de 200 ile sınırlı.
- [panel-scan/index.ts:135](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/index.ts:135): snapshot bridge mevcut; `getResultsPage/getResultCount` yok.
- [add-playlist.tsx:1483](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1483): periyodik snapshot kayıtları UI'a birleştiriliyor.
- [add-playlist.tsx:1879](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1879) ve [add-playlist.tsx:1977](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1977): yerel döngüler `raw.length !== lastFound` ile değişim arıyor. 200 kayıtlık pencerenin içi değişirken uzunluğu değişmeyebilir. Global polling bazı kayıtları yakalayabilir; eksiksizlik garantisi sağlamaz. Terminal dönen `found: raw.length` de journal toplamıyla aynı anlamda değil.

Devirde geçen **7.340 native sonuç → 582 UI kaydı → 579 içerikli TXT kaydı** tarihî cihaz gözlemidir. Bu turda o cihaz journal'ı/logu tekrar incelenmedi. Buna yol açabilecek 200 pencere sınırlaması kaynak kodundan bağımsız doğrulandı. Devirde eski sonuçların silindiği belirtiliyor; geçmiş veriyi geri getirebildiğim yönünde bir iddia yok.

Çözüm: runId ve artan journal satır ID'siyle sayfalı okuma; cursor/sonuç sahipliği doğrulaması; hata ile boş sonucun ayrılması; normal, unified, streaming ve recovery yollarında eksiksiz aktarım; bitişte son okuma. Sayaçlar aynı kimlik/dedup tanımına göre uzlaştırılmalı. UI mantıksal abonelikleri birleştiriyorsa “journal kaydı” ve “benzersiz hesap” sayıları açıkça ayrı tutulmalı. Kısmi okuma başarısızken yeni tarama eskisini temizlememeli.

### R03 — MAC yedeği tek dosya güncellemesi ve kalıcı kayıt garantisi değil

[mag-bulk.tsx:153](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:153) bütün `allFoundRef` listesini her yazımda metne dönüştürüyor. [mag-bulk.tsx:175](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:175) en fazla üç saniyede bir yazımı `void` ile başlatıyor; [mag-bulk.tsx:296](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:296) finalde de yazımı beklemiyor.

[PublicStorage.kt:89](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/PublicStorage.kt:89) `writeText` içinde her seferinde `create` çağırıyor. [PublicStorage.kt:56](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/PublicStorage.kt:56) Android 10+ yolunda yeni MediaStore kaydı oluşturuyor. Aynı görünen adın verilmesi aynı URI'nin üzerine yazıldığı anlamına gelmiyor. SAF create yolu da aynı hedefi güncelleme sözleşmesi sunmuyor. Android 10 öncesi dosya yolu ayrı davranabilir.

[Native Core bridge:327](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/index.ts:327) hatayı `{ok:false}` olarak döndürebiliyor; MAG yedek kodu bu sonucu kontrol etmiyor. Ekran kapanırken flush timer temizlenip run geçersizleştiriliyor; tamponda kalan kayıtlar final yedeğe ulaşmayabilir. Üç saniyelik JS biriktirmesi süreç ölümünde o aralığın sonuçlarını korumaz. Liste bütün analiz sonuçlarını içeriyor; `valid` hesaplarla sınırlı değil, dosyadaki “Bulunan” sayısı bu anlamda açıklanmalı.

Öneri: oturum başladığında bir URI aç; tek sahipli, sıralı native yazıcıyla yeni kalıcı sonuçları yaz; başarı, URI ve kayıt sayısını kontrol et; bitiş/iptalde await edilen flush/close kullan. UI tamponu kalıcı kaydın tek kaynağı olmamalı. Disk dolması/izin hatası sessiz geçmemeli. TXT'nin açık hesap bilgisi içermesi kullanıcıya anlaşılır biçimde belirtilmeli; loglara içeriği kopyalanmamalı.

### R04 — Katalog erişimi ile görüntü doğrulaması ayrılmalı

[add-playlist.tsx:337](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:337) `xtreamLiveStreams` çağrısından dönen dizinin uzunluğuna bakıyor. [add-playlist.tsx:3876](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:3876) bunu “Görüntü var” diye gösteriyor. [mag-bulk.tsx:758](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:758) aynı ifadeyi `liveCount` için kullanıyor. [settings.tsx:1942](C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1942) de dolu JSON kanal dizisini görüntü diye etiketliyor.

Bu yollarda medya bağlantısı, codec çözümü, decoder veya ilk kare gözlemi yok. Katalog dönebilen bir hesabın yayın URL'si bozuk, erişimi sınırlı veya oynatılamaz olabilir. Önerilen durumlar: **hesap doğrulandı**, **katalog erişimi doğrulandı**, **yayın bağlantısı doğrulandı**, **ilk kare doğrulandı**. Her test yalnız ölçtüğü durumu göstermeli; timeout sonucu kesin “içerik yok” sayılmamalı.

[iptv.ts:410](C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:410) tam `get_live_streams` ile `get_live_categories` çağrılarını birlikte yapıp bütün kanalları dönüştürüyor. 20 worker, aynı anda yaklaşık 40 API isteği başlatabilir. .25'te worker sayısı ve timeout değiştirilmiş; tam katalog indirme/mapping maliyeti kaldırılmamış. Kategori listesinin dolu olması da gerçek kanal/yayın yerine kullanılmamalı. Küçük ve geçerli bir kanal örneğini doğrulayan destekli endpoint varsa onu kullan; yoksa tam liste gereğini ve test süresini dürüstçe yönet. Gerçek oynatma kontrolü hesap bağlantı sınırını gözeten, kullanıcı tercihiyle yapılan sınırlı bir test olmalı.

### R05 — Aynı MAC, farklı portalda yanlış kullanıcı adı/şifre döndürebilir

[stalker.ts:3305](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:3305) host anahtarını hostname'e indiriyor, sonra `${mac}|${host}` yoksa sadece MAC anahtarına düşüyor. [stalker.ts:3369](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:3369) hem host hem MAC-only kaydı oluşturuyor. Port ve portal kurulum yolu ayrımı kayboluyor; profil anahtarda yok. [settings.tsx:1905](C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1905) bulunan kullanıcı adı varsa yeni türetmeyi atlıyor ve kart/M3U için bu değeri kullanıyor.

Gerçek `stalker.ts` modülü, sentetik A portalı kaydı ve aynı MAC'yi kullanan B portalı isteğiyle bellekte çalıştırıldı. Sonuç: **credentialsReturned=true, serverMatchesRequestedPortal=false**. Ağ isteği yapılmadı; gerçek kimlik bilgileri kullanılmadı. Bu, yalnız teorik bir yorum değil; lookup mevcut kodda başka portalın bilgisini verebiliyor.

Çözüm: kalıcı kayıt portal+MAC+profil kimliğiyle bağlanmalı. Yayın sunucusu farklıysa ilişki `create_link` oturumundan açıkça kaydedilmeli; bütün portallar için MAC-only varsayımı kullanılmamalı. URL'den çıkarılan kullanıcı adı/şifre, doğrulanmış Xtream API yetkisiyle aynı şey sayılmamalı. Eski önbellek için migration ve yeniden doğrulama gerekir.

### R06 — Arka plan servisinin yaşam döngüsü ve Android sınırları

[ForegroundKeepAliveService.kt:35](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/ForegroundKeepAliveService.kt:35) ve [ForegroundKeepAliveService.kt:47](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/ForegroundKeepAliveService.kt:47) tek global servis için start/stop gönderiyor. [ForegroundKeepAliveService.kt:95](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/ForegroundKeepAliveService.kt:95) koşulsuz `stopForeground/stopSelf` yapıyor. İş kimliği/refcount yok. MAC tarama/ekleme, toplu içerik testi ve [PlaylistContext.tsx:989](C:/Projeler/kizilkan-player-elite/frontend/src/store/PlaylistContext.tsx:989) güncelleme aynı servisi kullanıyor. Bir işin bitiş/cleanup çağrısı ötekinin desteğini sonlandırabilir.

Servis `dataSync` ve `START_NOT_STICKY`; iş mantığı JS'te. Foreground bildirim süreç önceliğine yardımcı olur, fakat tek başına ekran kapalıyken CPU/timer/ağ ve süreç ölümünden sonra devam garantisi değildir. Android, bu ihtiyacı iş türüne göre ayrı değerlendiriyor. [Resmi Android uyanıklık rehberi](https://developer.android.com/develop/background-work/background-tasks/awake).

targetSDK 36 olan bu uygulamada, Android 15+ arka plan `dataSync` süre sınırı da ele alınmalı. Resmi belge 24 saatlik dönemde toplam altı saat ve timeout callback'inden sonra kısa sürede kapanış gereğini açıklıyor. Serviste `onTimeout` uygulaması yok. Bu koşulda kapanmama sistem hatasına yol açabilir; mevcut telefonda bu hatanın gerçekleştiği iddia edilmiyor. [Resmi Android foreground timeout belgesi](https://developer.android.com/develop/background-work/services/fgs/timeout).

Çözüm: iş başına acquire/release; son iş bitince kapanış; timeout'ta checkpoint ve güvenli stop; kalıcı kuyruk/checkpoint ile recovery. Uyku önleme ihtiyacı ölçülüp süreli ve sahipli uygulanmalı. Ayrıca [PlaylistContext.tsx:244](C:/Projeler/kizilkan-player-elite/frontend/src/store/PlaylistContext.tsx:244) katalog repair işini arka planda açıkça abort/pause ediyor; “bütün işler arka planda sürer” ifadesi bu yol için zaten doğru değil.

### R07 — Kısmi tam yedek üretilebilir, fakat geri yüklenemez

[backupV3.ts:67](C:/Projeler/kizilkan-player-elite/frontend/src/utils/backupV3.ts:67) `queryItems` hatasını `chunk-error` kaydı olarak yazıp sonraki türlere devam ediyor. Bu catch yalnız yetim/boş playlist hatasına özgü değil; farklı okuma hatalarını da kapsıyor. [backupV3.ts:86](C:/Projeler/kizilkan-player-elite/frontend/src/utils/backupV3.ts:86) başarılı export sonucu döndürüyor; sonuç tipinde eksik parça uyarıları yok.

[backupV3.ts:189](C:/Projeler/kizilkan-player-elite/frontend/src/utils/backupV3.ts:189) seçmeli restore, [backupV3.ts:245](C:/Projeler/kizilkan-player-elite/frontend/src/utils/backupV3.ts:245) tam cihaz restore'u `chunk-error` için “Tam yedekte bilinmeyen kayıt tipi.” hatası veriyor. [backup.tsx:214](C:/Projeler/kizilkan-player-elite/frontend/app/backup.tsx:214) normal “hepsi” seçimi de seçmeli restore API'sine bütün anahtarları gönderiyor; sorun yalnız bir listeyi seçme durumuyla sınırlı değil. Seçilmemiş listeye ait hata kaydı da parser tarafından okunuyor.

Gerçek restore fonksiyonları mevcut test adaptörleriyle, tamamen bellekte çalıştırıldı:

- Geçerli kontrol yedeği seçmeli olarak başarıyla geri yüklendi.
- Aynı geçerli formata export'un ürettiği biçimde bir `chunk-error` eklendi.
- Seçmeli ve tam cihaz restore'unun ikisi de aynı bilinmeyen kayıt hatasını verdi.
- Ağ isteği ve gerçek kullanıcı depolamasına yazım yapılmadı.

Devirdeki “geri yükleme bilinmeyen kayıtları zaten atlar” açıklaması mevcut kod için doğru değil. Öneri: `chunk-error` resmi şemaya dahil edilmeli, playlist/kind/konum doğrulanmalı ve eksik katalog olarak gösterilmeli. Hata katalog gerçekten boşmuş gibi sunulmamalı. Export iptali ile gerçek boş/verisi eksik liste ve geçici I/O hataları ayrı ele alınmalı. Önizleme/restore uyarıları ve export→restore roundtrip fixture'ları aynı değişiklikte tamamlanmalı. Atomik staging ve rollback koruması korunmalı.

### R08 — Kart ve toplu içerik testlerinin iptal/durum eksikleri

[settings.tsx:1939](C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1939) `fetch` döner dönmez timer'ı temizliyor; ardından `res.text()` sınırı kalkıyor. Fetch reddedilirse timer `finally` içinde temizlenmiyor. `res.ok` kontrolü yok. [settings.tsx:1903](C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1903) prime işi için focus cleanup/AbortSignal/sahiplik kontrolü bulunmuyor; `primeTriedRef` Room okumasından önce işaretleniyor. Geçici veri yokluğu sonrası tekrar deneme tetiklenmeyebilir.

[settings.tsx:1949](C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1949) yeni M3U linki otomatik testi, mevcut test state'inin `idle` olmasına bağlı. Link/hesap değişiminde eski state kendiliğinden sıfırlanmıyor. Yeni değerde eski test sonucu kalabilir.

[add-playlist.tsx:316](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:316) toplu içerik testinin AbortController'ı var, ancak unmount cleanup'ında bu işi iptal eden kayıt yok. [add-playlist.tsx:2022](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2022) yeni taramada adayları temizliyor; önceki içerik testi sonuç haritası aynı noktada sıfırlanmıyor.

Öneri: istek generation/run/profile kimliği; header+body+parse için toplam süre bütçesi; `finally` temizliği; blur/unmount/account değişiminde iptal ve geç sonuç reddi; eski rozetleri yeni veriye taşımama. Otomatik testin ne zaman ağ isteği başlattığı da kullanıcıya açık olmalı.

### R09 — VOD/dizi düzeltmesi doğru, neden sayacı eksik

[stalker.ts:2726](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2726) gerçek sınıflandırmada `Array.isArray(v.series) && v.series.length > 0` kullanıyor. [stalker.ts:2763](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2763) istatistikte yalnız `Array.isArray` kullanıyor. Kategori adı nedeniyle dizi sayılan ama `series: []` taşıyan kayıt `bySeriesArray` sayılabilir. İçerik bölüşüm düzeltmesini geri almadan, aynı karar/neden fonksiyonu kullanılmalı.

### R10 — Devir ve katalog hız hipotezi güncellenmeli

[Ana devir:5](C:/Projeler/kizilkan-player-elite/GPT-OPUS-GUNCELLEME-DEVRI.md:5) en güncel durum için .16–.23 başlığını işaret ediyor; daha aşağıda .24 ve .25 notları bulunuyor. .25 adıyla anlatılan Xtream-first katalog planı, gerçek .25'in içerik testi/TXT/UI işinden farklı. Bekleyen G07/G08 maddeleri, .15'te gelen profil/bütçe değişiklikleriyle yeniden eşleştirilmeli; yapılmış işi tekrar başlatmamak gerekir. G09 ilk kare faz ölçümü ve G10 etiket ayrımı halen ayrı değerlendirmeyi gerektiriyor.

Yayın URL'sinin Xtream biçiminde olması API'nin aynı origin'de çalıştığını, aynı hesabın `player_api.php` yetkisi olduğunu veya IPTV Extreme'in hangi isteği yaptığını kanıtlamaz. Bu bir **çıkarım** olarak tutulmalı. Xtream-first planından önce kullanıcıya ait bilinen hesapta kimlik, API response shape ve katalog/oynatma eşlemesi doğrulanmalı.

`git diff f2b0cc31 HEAD` içinde [PlayerHost.tsx](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx) ve [timeshiftMode.ts](C:/Projeler/kizilkan-player-elite/frontend/src/player/timeshiftMode.ts) değişikliği yok. İlk kare diagnostic'i mevcut; bu sürüm zincirinin player ilk görüntü gecikmesini çözdüğünü söylemek için yeni bir ölçüm yok. Kanal seçimi → portal/create_link → ağ bağlantısı → ilk byte → motor hazırlığı → ilk kare ayrımıyla ölçüm gerekir.

### R11 — Google Drive yapılandırma önerisi native build'de uyumsuz

[googleDrive.ts:13](C:/Projeler/kizilkan-player-elite/frontend/src/utils/googleDrive.ts:13) kullanıcıya Web uygulaması Client ID'si oluşturmasını ve gösterilen redirect'i eklemesini söylüyor. [googleDrive.ts:80](C:/Projeler/kizilkan-player-elite/frontend/src/utils/googleDrive.ts:80) `makeRedirectUri` kullanıyor; `ResponseType.Token` ile doğrudan access token istiyor. [app.json:8](C:/Projeler/kizilkan-player-elite/frontend/app.json:8) özel uygulama şeması tanımlı. Kurulu Expo AuthSession da `Linking.createURL` üzerinden uygulama redirect'ini üretiyor.

Google'ın Web redirect doğrulaması HTTPS istiyor; localhost istisnası uygulamanın özel şemasını Web redirect yapmıyor. Dolayısıyla mevcut “Web Client ID + native özel şemayı Console'a ekle” açıklaması native DEV/release yapılandırması için geçerli bir çözüm değil. Bu kod/config ve resmi kuraldan çıkarılan uyumsuzluktur; bu turda kullanıcının Google hesabında giriş denenmedi. [Google Web OAuth redirect kuralları](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).

Öneri: Android'e uygun destekli Google yetkilendirmesi veya doğru HTTPS callback tasarımı seç; istemci türü, paket/imza ve redirect değerlerini birlikte doğrula. Desteklenen authorization code/PKCE veya ilgili platform yetkilendirme akışı değerlendirilirken uygulamaya Web client secret koyulmamalı. Kullanıcıya girdi alanı eklenmesi tek başına OAuth mimarisini düzeltmiyor.

## 5. 18.7.26 devir planında korunacaklar ve değişmesi gerekenler

Devirdeki ana hedef doğru: **D — tam journal erişimi** ve **E-Xtream — native kalıcı sonuçtan görünür emniyet yedeği**. Henüz kodda uygulanmamış. Bu inceleme o işi başlatmadı.

1. `ScanJournalStore` için runId + artan ID cursor'ı ile sayfalı okuma ve ayrı sayım API'si.
2. Kotlin Expo bridge ve TypeScript bridge; yanlış run, decrypt hatası ve bridge hatası boş liste/0 diye sessiz döndürülmemeli.
3. JS tarafında yalnız terminal effect'e eklemek yerine bütün normal/unified/streaming/recovery yollarının sonuç sahipliğini ve cursor'ını bağlamak.
4. Canlı okuma ve bitişte son okuma; arka planda geçirilen süre boyunca pencere dışına düşen kayıtları journal'dan tamamlamak.
5. Native persist noktasında doğrulanmış yeni benzersiz sonuçların yedek yazımına aktarılması; tek run/tek dosya, sıralı ve sınırlı tampon, açık hata durumu, kontrollü flush/close.
6. DB ve TXT arasındaki commit/crash sınırını açık tanımlamak. TXT yazısı başarısızken DB sonucu kaybolmamalı; yeniden açılışta journal'dan eksik yedeği tamamlamak mümkün olmalı.
7. Eski journal'ı yeni tarama başlarken kör temizlememek; teslim/aktarılmış olma durumunu kalıcı kaydetmek ve tamamlanamayan oturumu korumak.

Devir örneğindeki üç ayrıntı doğrudan kopyalanmamalı:

- `catch → [] / 0`, okuma hatasını “sonuç yok” haline getirir. Çağıran, kısmi başarısızlık ve yeniden deneme durumunu görmeli.
- `surfaced: bulkCandidates.length`, React state güncellemesi henüz uygulanmamışken eski sayıyı loglayabilir. Okunan/merge edilen benzersiz anahtarlar yerel sayaç/set ile ölçülmeli; ardından UI ile karşılaştırılmalı.
- “500 satır = Binder güvenliği” garantisi doğru kurulmuş değil. Kayıt sayısı payload byte miktarını sınırlamaz; kullanılan Expo köprüsünün taşıma biçimi de ayrıca değerlendirilmelidir. Gerçek byte/JSON/heap sınırı, büyük tek kayıt ve birden fazla sayfa test edilmeli.

MAG yedeğine “dokunma” şeklindeki devir sınırı, R03'ü ortadan kaldırmıyor. E-MAG ile E-Xtream aynı doğru storage sözleşmesini kullanacak şekilde planlanmalı. Kullanıcının bu inceleme sonrasında seçeceği kapsamda R03 ayrı düzeltme veya .26'nın açık alt işi olabilir; mevcut durumda tamamlandı kabul edilmemeli.

### Kabul testleri

| Senaryo | Beklenen kanıt |
| --- | --- |
| 0, 1, 199, 200, 201 ve 7.340 sentetik sonuç | Journal, bridge, UI ve export aynı sonuç tanımında uzlaşır; 200 sonrasında kayıp yok. |
| Pencere uzunluğu sabitken yeni kayıtlar | Yeni journal satırları cursor ile görünür; `length` değişmesi gerekmez. |
| UI kapalı/arka planda hızlı sonuç birikmesi | Ekrana dönünce tam liste geri gelir. |
| Sayfa okumasında hata/decrypt bozukluğu | Hata görünür; “tamamlandı” ve otomatik journal silme yok. |
| İptal, süreç ölümü, yeniden başlatma | Son kalıcı cursor ve kayıtlar korunur; yedek eksikse journal'dan uzlaştırılır. |
| Aynı run için çoklu yazım | Tek URI/dosya, doğru satır sayısı; duplicate veya concurrent writer bozulması yok. |
| Disk/izin/yazım hatası | DB sonuçları korunur; yedek başarısızlığı açık gösterilir. |
| Profil/run değişimi ve geç sayfa cevabı | Eski oturum yeni listeye eklenmez. |
| Büyük tek kayıt ve büyük JSON sayfası | Byte/heap sınırlaması ve UI akıcılığı ölçülür. |
| Aynı hesabın farklı host kayıtları | Journal satırı / benzersiz hesap / abonelik sayıları ayrı ve tutarlı tanımlanır. |

Kalıp gate'lerine ek olarak gerçek algoritmayı çalıştıran fixture ve Android cihaz senaryoları gerekir. Yeni native değişiklik uygulanırsa derleme ve cihaz testi ayrıca yapılmalıdır; bugünkü başarılı .25 build'i henüz yazılmamış .26'yı doğrulamaz.

## 6. Diğer sonraki işler ve önerilen sıra

1. **Hesap arşivi ifşası:** R01'i kullanıcıyla ele almak. Bu başlık derleme işinden bağımsız ve en acil konu.
2. **Veri bütünlüğü:** R07 export/restore formatını uyumlu hale getirmek; R03 emniyet yedeği sözleşmesini düzeltmek; .26 journal aktarımı ve native yedeği tamamlamak.
3. **Doğru hesap/doğru etiket:** R05 portal bağlı hesap bilgisi; R04 katalog ve oynatma etiket ayrımı; R08 iptal/durum sınırları.
4. **Arka plan:** R06 iş sahipliği ve Android timeout/recovery. Servis bildirimi ile çalışma garantisini birbirinden ayırmak.
5. **Drive:** R11 için geçerli Android OAuth tasarımı ve gerçek DEV/release giriş testi.
6. **Katalog hızı:** Xtream-first'i ayrı, ölçülen bir iş olarak yürütmek. API yetkisini doğrulayıp VOD/dizi response shape, kaynak ID, URL ve Room kimlik eşlemesini korumak; desteklenmeyen saf Stalker hesapta mevcut sayfalama fallback'ini sürdürmek. Yalnız URL biçimine dayanarak hesabı Xtream'e çevirmemek.
7. **Player ilk görüntü:** Bilinen çalışan yayınlarda motor/kanal türüne göre faz sürelerini ölçmek. Normal canlı ve timeshift seçimi, ilk kare öncesi kullanıcı pause'u, kanal geçişi, motor fallback'i ve ekran dönüşünü ayrı denemek. Bu incelemede yeni motor/buffer ayarı önerisini doğrulayacak cihaz ölçümü yok.
8. **Dokümantasyon:** Aktif sürüm/dal/build ve gerçekten bekleyen işler tek güncel yerde özetlenmeli. Her uygulama güncellemesinde dosya/satır, önceki-sonraki davranış, gerçek test sonucu ve kalan risk Opus devrine eklenmeli.

## 7. Opus'a iletilecek kısa devir

**18.7.25 HEAD `b7e62889`, TypeScript ve bütün mevcut denetimler başarılı; aynı HEAD'in GitHub build'i başarılı ve yerel APK metadata'sı .25 DEV ile uyumlu. Kod değişikliği yapılmadı.**

Öncelikle gerçek 579 hesaplık TXT'nin herkese açık depoda olduğunu ele almalıyız. Sonra `backupV3` export'un ürettiği `chunk-error` kaydını iki restore parser'ının da reddettiği uyumsuzluk ve MediaStore'a her üç saniyede yeni dosya ekleyen MAC yedeği düzeltilmeli. Tam native journal aktarımı .26'ya bırakılmış ve henüz yok; pencere uzunluğuyla değişim tespiti de eksiksizlik sağlamıyor. MAC-only credentials fallback farklı portalın kullanıcı adı/şifresini döndürebiliyor. “Görüntü var” gerçek oynatma/ilk kare yerine katalog sonucudur. Genel keep-alive servisi iş sahipliğinden ve Android timeout kapanışından yoksun. Drive Web Client ID/özel şema yönlendirmesi resmi Google Web OAuth kurallarıyla uyumsuz.

Bu bulgular için çözüm uygulanmadı. İki mantık sorunu gerçek TypeScript modülleriyle bellekte tekrar üretildi; telefon/gerçek portal testleri yeni yapılmış gibi sunulmadı. .26'yı uygulamadan önce yukarıdaki kalıcı kayıt, hata, sahiplik ve sayım sözleşmelerini plana dahil etmek gerekir.

## 8. İnceleme sonrası acil güvenlik işlemi — 7 Ekim 2026

Kullanıcının açık “bunu depodan sil” talebi üzerine, R01 arşivi son commit yeniden oluşturularak Git ağacından çıkarıldı. Temiz commit `e808273e7bf5f984e15785c787c73c4068dd471b`. Dosyayı içeren tek uzak dal (.25) ve `build-146` etiketi atomik, eski SHA kontrollü push ile bu commit'e taşındı. `.gitignore` arşiv kalıbını engelliyor; yerel dosya korunmuş ancak Git takibi dışında. Uygulama kaynakları ve sürümü değişmedi; yeni APK build'i tetiklenmedi.

GitHub API doğrulaması: dal ve etiket temiz SHA'ya eşit; dosya iki referansta da 404. Temiz Git geçmişinde dosyaya ait commit yok. **Eski `b7e62889` SHA'sı üzerinden GitHub dosyayı hâlâ sunuyor.** Bu nedenle “bütün internet kopyaları kalıcı olarak silindi” denemez. Depoyu geçici özel yapma için kullanıcıya ayrıca tercih soruldu; henüz bu rapor güncellemesinde onay varsayılmadı. Kalıcı GitHub temizliği için [destek taslağı](C:/Projeler/kizilkan-player-elite/GPT-GITHUB-HASSAS-VERI-TEMIZLIGI-DESTEK-2026-10-07.md) hazırlandı; gönderilmedi. Opus için [güvenlik devri](C:/Projeler/kizilkan-player-elite/AI-DEVIR-v18.7.25-GUVENLIK-TEMIZLIGI.md) temiz commit'e eklendi.

**Sonraki doğrulanmış durum:** Kullanıcı “Geçici olarak özel yap” onayı verdi. Depo PRIVATE yapıldı; `isPrivate:true` doğrulandı. Oturum/cookie/token olmadan yapılan repo sayfası, eski SHA contents API ve eski SHA raw dosya HEAD isteklerinin üçü de 404 döndürdü. Anonim erişim kapandı. GitHub kalıcı obje/cache temizliği ve ifşa edilen parolaların değiştirilmesi ayrı takip işleridir; destek mesajı gönderilmedi.
