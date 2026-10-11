# GPT tespit ve önerileri — v18.7.27 cihaz incelemesi

Tarih: 08.10.2026. İncelenen kaynak: `43cc02c6c38b3e3e3b151eddc73994e4ef3e1cef`, dal `v18.7.27-rc1-ci-disk-budget`.

Bu belge **inceleme, ölçüm ve uygulanacak düzeltme planıdır**. Aşağıdaki düzeltmeler henüz kaynak koda uygulanmadı. Bu inceleme kapsamında yeni APK derlenmedi, sürüm yükseltilmedi, commit/push veya Actions tetiklemesi yapılmadı. İncelenen telefonda DEV `18.7.27 / 180727`, normal uygulama `18.7.24 / 180724` kurulu. Sonraki uygulama yayını kullanıcının talebine göre **normal, mevcut release anahtarıyla imzalı APK** olmalıdır.

## 1. İncelemenin sonucu

- panel-a için Claude'un önerdiği MAG → doğrulanmış Xtream katalog yolu **bu hesapta uygulanabilir**: cihazın aynı profil/MAC/portal için sakladığı bağlantı bilgileriyle gerçek API testi başarılı oldu. Ancak telefon hızının bilgisayar testiyle aynı olacağı henüz ölçülmedi.
- Hızlı yol kaynakta **zaten kısmen var**, fakat normal güncelleme bunu kullanmıyor. Yalnız eklemeden sonraki `stalkerEnrichment` çağrısında kullanılıyor.
- Son panel-a güncellemesi **1.186.447 ms, yaklaşık 19 dakika 47 saniye** sürdü. Canlı katalog yalnız **2.848 ms** sürdü. Film/dizi sayfalama eksik bitti. Eski dolu Room katalogları korundu.
- Uzun sürenin tamamı sunucunun yanıt süresi değil: iki uzun sayfa ilerleme boşluğu, uygulamanın arka plana alınması ve yeniden öne getirilmesiyle örtüşüyor. Bu nedenle API seçimi ve işlemin JS ekran yaşamından bağımsız yürütülmesi birlikte ele alınmalı.
- 678 bulunan hesabın tamamı hem yerel tarama veritabanında hem emniyet TXT'sinde var. Ekrandaki 239, bütün kayıtların geri yüklendiğini göstermiyor. **439 hesabın diskten kaybolduğu kanıtlanmadı.**
- Kurtarma servisindeki gerçek çökme ve geri dönüş yolundaki eksiklik kod/log ile doğrulandı. Katalog testi başarısızlığının hesap başına kesin HTTP/hata nedeni mevcut logda yok; onu tahmin ederek düzeltmek doğru olmaz.

## 2. Kanıtların kapsamı ve veri koruma

Telefondan silme/uygulama kaldırma yapılmadan log, tarama journal'ı, uygulama metadata'sı, Room veritabanı/WAL/SHM ve mevcut emniyet TXT'sinin yerel kopyaları alındı. Yerel kanıt klasörü `.codex-device-backups/2026-10-08-v18727/`; Git'in yerel hariç tutma listesinde. Hesap dosyaları **GitHub'a gönderilmedi** ve bu raporda kullanıcı adı, şifre, MAC, portal adresi veya M3U bağlantısı yer almıyor.

Room veritabanı/WAL/SHM canlı cihazdan sıralı salt okuma ile kopyalandı. Bu, aynı anda yazım varsa atomik veritabanı yedeği garantisi vermez. Yerel kopya SQLite ile okunabildi ve aşağıdaki olay/sayım kontrolleri yapıldı; eksiksiz tam cihaz geri yükleme yedeği diye sunulmamalı.

Emniyet TXT'si doğrudan kopyalandı ve ayrıştırıldı: **678 JSON kayıt**, 678 benzersiz kullanıcı adı/şifre çifti, 678 benzersiz hesap+DNS, tümünde `auth=1`, `status=Active`, sunucu/kullanıcı adı/şifre dolu. Bu bilgiler hesap doğrulamasıdır; yayın ilk karesi veya gelecekte çalışma garantisi değildir.

Bu 678 kayıt ayrıca uygulamanın mevcut insan tarafından okunabilir hesap arşivi biçimine dönüştürüldü. Uygulamanın **kendi** `buildKizilkanAccountArchive` ve `parseKizilkanAccountArchive` fonksiyonlarıyla gidiş-dönüş kontrolü yapıldı:

- Ayrıştırılan kayıt: **678**; maskeli kayıt: **0**.
- Her kaydın sunucu/kullanıcı adı/şifre bilgisi kaynakla birebir aynı.
- Dosya: `KIZILKAN-KURTARILAN-678-HESAP-2026-10-08.txt`, 626.290 bayt.
- SHA-256: `1928e951bc03b5ffa82920500250c45af2da1c129c0a007009efa4dd04560254`.
- Dosya özel yerel kanıt klasöründe. Telefonun ortak İndirilenler klasörüne kopyalama, otomatik onay denetimi tarafından açık metin hesap bilgileri nedeniyle reddedildi; kullanıcıya bu somut kopyalama için onay soruldu. **Onay gelmeden bu işlem yapılmamalı.**

## 3. Bulgular, sebepler ve sonuçlar

| Öncelik | Mevcut durum / kanıt | Sebep | Yapılması gereken | Yapılınca ne olacak / doğrulama |
|---|---|---|---|---|
| P0 | Kurtarma sırasında tekrar eden `ForegroundServiceDidNotStartInTimeException`; kritik kayıtta Keystore → `pruneUnverifiedResults` → `initializeResultCount` → `onStartCommand` yığını | Servis foreground bildirimi gösterilmeden önce ana iş parçacığında şifreli kayıtları okuyor ve tarıyor | Foreground bildirimi hemen; şifre çözme, eski sürüm sonuç doğrulaması ve kurtarma hazırlığı kontrollü arka plan çalışanında. Başlangıç/iptal/hata sahipliği korunmalı | 678+ kayıtla kurtarma servis başlangıcını kilitlemeyecek; gerçek cihazda kapanma/yeniden açılma testi |
| P0 | Açılış kurtarma ekranını `router.replace('/add-playlist')` ile kök yapıyor; ekran geri oku yalnız `router.back()` çağırıyor | Önceki ekran kalmadığında geri dönüş hedefi yok; ekran kendi güvenli kök dönüşünü tanımlamıyor | Geçmiş varsa geri; yoksa yetkili profilin ana ekranına açık dönüş. Donanım geri ve modal kapanışı birlikte ele alınmalı | Kurtarma ekranından çıkılabilir; çıkış bulunan kayıtları silmez, aktif taramayı kendiliğinden iptal etmez, PIN kapısı atlanmaz |
| P0 | Journal ve TXT **678**, fotoğraftaki seçim listesi **239**; bütün 678 kayıt farklı hesaplar | Disk kaybı kanıtı yok. Kurtarma tüketicisi tüm terminal sayfaları toplayıp sonra UI'ya teslim ediyor; effect katalog/playlist değişiminde yeniden oluşabiliyor; buna servis çökmesi eşlik ediyor | Her sınırlı sayfayı UI kabul ettikçe yayınlamak; okuyucunun yaşamını sıradan playlist metadata değişimlerinden ayırmak; görünen/toplam/okunan sayısını ayrı göstermek; eksik aktarımı hata olarak görünür kılmak | UI'nın gerçekten 678 seçilebilir hesabı gösterdiği test edilir. Kesin 239 nedenini hedefli telemetriyle doğrulamak gerekir; bu satır kesin tek kök sebep iddiası değildir |
| P1 | `getSnapshot` boş yedek durumu için `{}` ekliyor; JS bunu var kabul edip `.ok` yokken yazma hatası gösteriyor | Hazırlanıyor/yazıldı/başarısız durumları iki değerliymiş gibi değerlendiriliyor | `.ok === true`, `.ok === false`, henüz sonuç yok ayrımı; gerçek hata varsa hata sınıfı; en son başarılı dosya zamanı/sayısı | Kullanıcı henüz oluşmamış yedek için yanlış “depolamayı kontrol edin” uyarısı görmez |
| P1 | Bu tarama için native emniyet durumu `ok=true,count=678`; 595.752 baytlık TXT gerçekten var. Cihazda yaklaşık 20 GB boş alan | Kullanıcının algıladığı boşluk, dosya bulunabilirliği ve ekran geri yüklemesiyle de ilgili; bu olayda alan doluluğu kanıtlanmadı | Otomatik arşivi uygulamada görünür yapmak; dosyanın yeri, son başarılı sayı, kopyalama/açma ve yeniden okuma yolu | Kayıt olup olmadığını kullanıcı görebilir; gerçek dosya hatası ile UI boşluğu karışmaz |
| P1 | Native otomatik TXT başlığı `KIZILKAN TARAMA EMNIYET YEDEGI`; her satır JSON. Arşiv okuyucusu insan tarafından okunabilir `HESAP #` biçimini tanıyor | Uygulamanın otomatik yazdığı biçim kendi standart geri yükleme yoluyla uyumsuz | Eski klasik biçimi koruyarak native JSON-lines biçimini de tanıyan doğrulanmış okuyucu; bozuk satırı sayı ve uyarıyla bildirmek | Kullanıcı otomatik yedeğini geri yükleyebilir; tümü veya seçtiklerini ekleyebilir; bozuk satırlar sessizce atılmaz |
| P1 | `latestResultArchive(profileId)` yalnız `MAG_RESULTS` arıyor | Xtream çoklu tarama journal'ı snapshot onaylandıktan sonra arşiv listesinde görünmüyor | Yeni Xtream taramalarını profil sahipliğiyle arşivlemek; eski sahipliği bilinmeyen kaydı açık kullanıcı dosya seçimiyle almak | Önceki sonuçlar tekrar bulunur; profillerin hesapları birbirine karışmaz |
| P1 | `ScanSafetyBackup.flush` yaklaşık her 3 saniyede bütün büyüyen journal'ı tekrar çözüp TXT'yi baştan yazıyor ve geri okuyor | Sonuç ekleme yolunda artan tam arşiv maliyeti; her satır için tekrar Keystore anahtar erişimi | Journal'a anlık kalıcı ekleme korunmalı; TXT izdüşümü ayrı çalışan, tek aktif yazıcı ve biriken değişiklikleri birleştiren kuyrukla hazırlanmalı. SecretKey erişimi süreç içinde güvenli önbelleğe alınabilir; Cipher paylaşılmamalı | Tarama, bütün dosyayı tekrar yazmayı beklemez. Zaman kazancı ölçülmeli; kalıcılık DB'ye dayanmaya devam eder |
| P1 | TXT mevcut URI'ye `wt` ile yeniden yazılıyor; sonrasında hash kontrolü var | Normal tamamlanma doğrulanıyor fakat güç kesintisi mevcut dosyanın üstüne yazılırken önceki iyi TXT'yi de yarım bırakabilir | Yeni nesli ayrı geçici/pending hedefe yaz, geri okuyup doğrula, sonra en son başarılı referansı değiştir; eski başarılı nesli doğrulamadan bırakma | Güç kesilmesinde önceki sağlam TXT kullanılabilir. Tek bir yarım dosya yüzünden disk yedeği görünmez olmaz |
| P1 | “Canlı Katalog Test Et” 20 paralel hesap, 10 saniye dış bütçe; iç API de 10 saniye; tüm `catch` sonuçları yalnız `err` | Aynı sunucuya eşzamanlı yük, büyük JSON işleme ve kısa bütçe olası etkenler; hesap başına hata atılıyor | Host başına kontrollü iş kuyruğu; HTTP/timeout/JSON/iptal/boş katalog ayrımı; güvenli süre/boyut telemetrisi; seçili hesap kapsamı ve tekrar deneme. Büyük yanıtı native tarafta doğrulayıp küçük özet döndürmek | Kullanıcı “neden başarısız”ı görür. Ağ/site arızası “hesap geçersiz” diye etiketlenmez. Mevcut olayın kesin hata sınıfı yeni ölçümle belirlenir |
| P1 | panel-a normal yenileme Stalker sayfalaması; Xtream hızlı yol yalnız `stalkerEnrichment` içinde | İki farklı kod yolu aynı katalog edinme kararını paylaşmıyor | Normal refresh, ilk ekleme ve arka plan tamamlama aynı doğrulanmış katalog sağlayıcısı seçim mantığını kullanmalı | API uyumlu MAG hesapları film/diziyi toplu alır; saf Stalker hesaplarında sayfalama korunur |
| P1 | panel-a'da 100 saniye bütçeli sayfalama 533/650 saniyede duruyor; arka plan boşlukları var | Bütçe `Promise.all` batch'inden önce/sonra kontrol ediliyor; işin ilerlemesi JS yaşamına bağlı; devam eden batch kesin deadline ile bitirilmiyor | Native iş sahipliği, monoton süre, ağ çağrısını/kuyruğu kesen deadline, kalıcı checkpoint; UI yalnız gözlemci | Ekran kapanması/başka uygulamaya geçiş iş ilerlemesini durdurmaz; süre sınırı kullanıcıya doğru bildirilir |
| P1 | Son film/dizi sayfalaması `TIME_BUDGET`, ama üst sonuç “OK” olabiliyor; eski katalog korunsa da `lastRefreshOk=true` yazılabiliyor | Tamlık bilgisi `stalkerOrderedList` dönüşünden üst sonuca taşınmıyor; “array var” tam katalog gibi kabul ediliyor | Tür başına `complete/partial/failed`, alınan/bildirilen toplam ve durma nedeni; eksik tür için son tam yenileme zamanını ilerletmemek | Eksik yenileme “tam güncellendi” olmaz; eski içerikler ve doğru durum bilgisi korunur |
| P1 | Xtream testinde 10.350 dizi satırı, **9.504 benzersiz `series_id`**, 846 tekrarlanan kimlik | Raw satır sayısı benzersiz içerik sayısı değil; mevcut `xtreamSeries` her satırı modele çeviriyor | Tekrarlanan kimlikleri kategori/metadata farklılıklarını ölçerek işle; ham sayı/benzersiz sayı/kaydedilen sayı ayrı; kategori üyeliklerini kaybetme | Aynı dizi tekrarlanmaz, kartlar doğru sayı gösterir; kategori varyantları kör biçimde silinmez |
| P1 | MAG film kimlikleri `st-vod-*`, diziler `st-series-*`; Xtream üreticileri `xt-vod-*`, `xt-series-*`; kütüphane ID'ye bağlı | Hızlı yola yalnız mevcut enrichment kodunu kopyalamak, izleme/favori anahtarlarını değiştirebilir | İçerik kimliği eşleşmesini örneklerle doğrula; aynı içerikte eski kanonik kimliği koru veya atomik alias/migration uygula; sağlayıcı değişikliğini genel sil-ekle sayma | Favori/izlendi/devam et/dizi son bölüm bilgileri hızlandırma yüzünden kaybolmaz |
| P2 | Room toplam dosyası yaklaşık 945 MB; panel-a olayının son commit'i 2.819 ms | Büyük toplam DB tek başına bu 19 dakikalık olayın sebebi değil | Fetch/parse/normalize/Room commit/UI publish ayrı ölçülmeli; gerçek ihtiyaç varsa indeks/yazım/batch iyileştirilmeli | Ağ ve arka plan durması çözülecekken yanlışlıkla Room'u sıfırlayan bir müdahale yapılmaz |
| P1 | DEV ve normal ayrı paket/veri alanı; normal kurulu sürüm 18.7.24 | Normal APK DEV journal'ı ve DEV Keystore anahtarlarını kendiliğinden okuyamaz | DEV kaldırılmadan taşınabilir arşivle açık geri yükleme; normal pakete aynı release imzasıyla güncelleme | Normal sürüme geçişte eski normal playlistler korunur; DEV sonuçları bilinçli biçimde aktarılabilir |

## 4. panel-a ölçümü: gerçek olay ve Claude önerisi

### 4.1 Telefonda gerçekleşen normal yenileme

Telefon olay kayıtlarında 08.10.2026, yaklaşık **14:05:16–14:25:03 (Türkiye saati)**:

| Aşama | Süre | Sonuç |
|---|---:|---|
| Canlı | 2.848 ms | 2.795 kanal |
| Film | 533.077 ms | Film modele dönüşen 3.378; sayfalayıcı 3.388 ham kayıt, bildirilen toplam 22.907; `TIME_BUDGET` |
| Dizi | 650.520 ms | Son birleştirmede 2.838; ayrı dizi sayfalaması 2.828, bildirilen toplam 9.504; `TIME_BUDGET` |
| Katalog toplam | 1.186.447 ms | Yaklaşık 19 dakika 47 saniye |
| Son commit | 2.819 ms | Eski film/dizi korundu; bu olayın büyük süresi burada geçmedi |

Film aşamasında 242, dizi aşamasında 202 işlenmiş sayfa: **444 sayfa**. Aynı olay aralığında **450 HTTP yanıtı** var; hepsi HTTP 200. Bu yanıtlarda medyan ölçülen süre 690 ms, en büyük 39.530 ms. **HTTP 200 tam katalog veya görüntü kanıtı değildir.**

İlk arka plan dönemi, katalog başlangıcından yaklaşık 83,8 saniye sonra başlayıp 534,7 saniyede öne dönüşle bitiyor. İkincisi 608,5–1.185,1 saniye. Yaklaşık **1.027,5 saniye** arka plan aralığı var. Sayfa ilerlemesindeki en büyük boşluklar **442.669 ms** ve **597.425 ms**; öne dönüş zamanlarıyla örtüşüyor. Bu **güçlü bir yaşam döngüsü/arka plan ilerleme bulgusudur**; OS'nin belirli bir tek mekanizması kanıtlanmış diye adlandırılmamalı.

Eski panel-a Room katalogları:

- Canlı: **2.795**.
- Film: **10.643**.
- Dizi: **9.529**.

Güncellemede `MAG_REFRESH_SHRINK_GUARD` yeni 3.378 filmi ve 2.838 diziyi eski sayının yarısından küçük bulup patch'ten çıkardı. Room sayımı ve kart metadata'sı yukarıdaki eski sayıları koruyor. Bu koruma kaldırılmamalı. Ancak mevcut koruma yalnız belirli büyük küçülmeleri yakalıyor; **tamlık denetiminin yerini tutmuyor**, elle `forceUnconditional` yolunda da atlanabiliyor.

### 4.2 Gerçek Xtream API doğrulaması

Bu test **bilgisayardan** yapıldı. Telefondaki kayıtlı tek panel-a profil/MAC/portal kapsamına ait stream-derived kimlik kullanıldı. Başka hesap/host taraması, MAC üretimi veya yayın bağlantısı açılması yapılmadı. İstekler sırayla; farklı origin'e yönlendirme reddedildi. Ham yanıtlar rapora/loga veya GitHub'a yazılmadı.

| API işlemi | HTTP | Boyut | Süre | Sonuç |
|---|---:|---:|---:|---|
| Hesap doğrulama | 200 | 540 bayt | 281 ms | `auth=1`, Active |
| Canlı liste | 200 | 842.491 bayt | 1.313 ms | 2.795 geçerli/benzersiz ID |
| Film listesi | 200 | 8.012.132 bayt | 2.984 ms | 22.907 geçerli/benzersiz ID |
| Dizi listesi | 200 | 9.150.473 bayt | 3.484 ms | 10.350 satır, 9.504 benzersiz ID |
| Film kategorileri | 200 | 7.405 bayt | 187 ms | 60 kategori |
| Dizi kategorileri | 200 | 6.736 bayt | 157 ms | 53 kategori |

Altı API çağrısının ölçülen süre toplamı yaklaşık **8,4 saniye**. Yalnız iki büyük katalog yanıtı yaklaşık **6,5 saniye**. Bunlar telefon normal-release performans testi veya ilk görüntü testi değildir; Room yazımı, ekran yayınlama ve sonrasında oynatma ayrıca ölçülmeli.

Claude'un “film/dizi iki çağrıya iner” ifadesi **iki katalog veri endpoint'i bakımından doğru**. Eksiksiz uygulama işleminde hesap doğrulama ve kategori listeleri de gerekir; mevcut yardımcı akış canlı katalog doğrulaması da yapıyor. Bu nedenle bütün işleme “yalnız iki HTTP isteği” denmemeli. API/kimlik/kategori kanıtı önbellekte güvenle kullanılabilirse tekrar eden maliyet azalır.

Bu olayın bildirilen 22.907/9.504 sayıları ve 14 satırlık sayfalar üzerinden tam sayfalama için yaklaşık **2.316 veri sayfası** gerekir; önceki farklı katalog boyutlarında söylenmiş 1.840 sabit bir sayı değildir. Testteki iki toplu endpoint bu binlerce sayfanın yerini alabilir. Kullanıcının alıntısındaki 16.243/12.603 de bu ölçümün güncel toplamları olarak kabul edilmemeli.

### 4.3 Kodda hızlı yol neden kullanılmıyor?

Mevcut normal yenileme zinciri:

```text
PlaylistContext.refreshPlaylistKinds
  → refreshPlaylistContent (source=stalker)
  → stalkerCatalog
  → runStalkerCatalog
  → stalkerVodPartition / nativeStalkerSeries
  → stalkerOrderedList (get_ordered_list sayfaları)
  → katalog tamlığını taşımayan dizi sonucu
  → küçülme koruması
  → Room commit / metadata
```

Mevcut hızlı yol:

```text
ilk MAG ekleme, canlı liste hazır
  → stalkerPrimeStreamCredentials / oynatma bağlantısından hesap kapsamlı kimlik
  → stalkerEnrichment
  → getStreamDerivedCredentials
  → Xtream hesap + canlı API doğrulaması
  → xtreamVod / xtreamSeries (+ kategoriler)
```

`runStalkerCatalog` ikinci yolu çağırmıyor. Bu yüzden “hızlı yol eklendi” doğru olsa bile “normal içerik güncelleme hızlandı” sonucu çıkmıyor. Bu ayrı kod yollarının birlikte çalıştığı regression testleri gerekiyor.

Hızlı yolun mevcut uygulamasında ayrıca:

- Film/dizi `Promise.all` ile birlikte alınıyor. Biri başarısızsa diğerinin başarılı sonucu da ortak fallback'e düşebiliyor.
- Yalnız seçilmiş bir kind yerine iki kind birden çekilebiliyor; ortaklaştırırken `kinds` kapsamı korunmalı.
- `onKindReady` ve `releaseDeliveredKinds` sözleşmesi bu kısa hızlı dalda kullanılmıyor; büyük diziler birlikte bellekte kalabilir.
- Dizi ham tekrarları ayrı işlenmiyor.
- MAG → Xtream içerik ID değişiminin kullanıcı kütüphanesiyle uyumu test edilmemiş.
- `xtreamLiveSample` bir canlı yanıt istiyor. Geçerli VOD-only aboneliği bu zorunluluk yüzünden gereksiz Stalker fallback'e düşebilir; doğrulama istenen içerik yetkileriyle tutarlı olmalı.

## 5. Önerilen ortak mimari

### 5.1 Katalog sağlayıcısının seçimi

MAG oturumu/haklarıyla canlı katalog davranışı korunur. Film ve dizi için:

1. Aktif ve yetkili profil, MAC ve **tam portal endpoint'i** kapsamında önceden türetilmiş kimliği yükle. Kapsamı farklı kimliği kullanma.
2. Kimlik yoksa mevcut izinli `create_link` prime mekanizmasını uygun canlı örnekle deneyebilirsin; kullanıcı adı/şifre üretme veya tahmin etme.
3. Xtream API'yi gerçekten doğrula; URL'nin Xtream'e benzemesi yeterli değil. Yayın/CDN hostunun API hostu olduğunu varsayma.
4. İstenen türün kataloğunu ve kategorilerini al; şekil, geçerli ID, tekrarlar, toplam ve metadata tutarlılığını denetle.
5. Desteklenen/başarılı türü Xtream'den kullan; desteklenmeyen veya başarısız tür için **yalnız o türe ait** Stalker fallback. İptal veya koruma/rate-limit durumunda kör yeni istek zinciri başlatma.
6. Eski kayıtla aynı içerik ID'sini koru veya doğrulanmış alias uygula. İzleme/favori/son bölüm anahtarları geçerli kalmalı.

### 5.2 İşi ekranın yaşamından ayırma

Yeni hesap eklemede native `BulkPlaylistImportService` ve Room'a teslim altyapısı zaten var. Mevcut **normal refresh** hâlâ büyük bölümünü JS'de yürütüyor. Baştan ayrı ve rakip bir depolama sistemi yazılmamalı; var olan native foreground iş sahipliği, iptal ve staging/Room altyapısından yararlanılmalı.

Hedef:

```text
kullanıcı güncelleme isteği / otomatik yenileme
  → profil+playlist+kinds sahibi kalıcı iş
  → mevcut veri silinmeden staging
  → doğrulanmış sağlayıcı seçimi
  → canlı önce; gerekli film/dizi işleri
  → native çalışan: download / parse / normalize / completion check
  → kind bazında doğrulanmış Room commit
  → küçük durum/count/fingerprint/diff bildirimi
  → JS ekranı sonucu gösterir, açılınca aynı işe yeniden bağlanır
```

Kaynak/kimlik değişmesi, profil değişmesi veya iptal sonrası eski çalışan yeni profilin metadata'sına yazamamalı. Aynı playlist/kind için birden çok güncelleme işi açılmamalı. Var olan `withCatalogLock`, metadata `runExclusive`, non-destructive Room migration, PersistentPlayerHost ve tek yayın bağlantısı ilkeleri korunmalı.

### 5.3 Tamlık ve doğruluk

Tür başına `backend`, `state`, `rawCount`, `uniqueCount`, `storedCount`, `declaredTotal`, `stopReason`, `fetchMs`, `parseMs`, `commitMs`, son tam yenileme zamanı. Gizli bilgiler telemetriye yazılmamalı.

- `TIME_BUDGET`, `PAGE_ERROR`, yarım indirme veya eksik sayfa varsa **partial/failed**; eski tam katalog değiştirilmez.
- Kullanıcı isteyerek kısmi sonuç kullanacaksa bu ayrı ve açık tercih olmalı; “tam yenileme” ile karışmamalı.
- Desteklenmeyen film/dizi, boş katalog, API hatası ve yetkisiz cevap ayrı durumlar.
- Geçerli bir katalog küçülmesi gerçek olabilir; yalnız yüzde hesabına güvenilmez. Tam yanıt/izin/filtre kanıtı incelenir.
- Kategori adları/üyelikleri, yaş sınırı, contentSelection, EPG/catch-up ve mevcut özel alanlar korunmalı.

## 6. Canlı Katalog Test Et düğmesi

Bu düğme `get_live_streams` ile **kanal kataloğunun varlığını** sınar. Video oynatmaz ve ilk kare geldiğini doğrulamaz. Gerçek ilk kare testi ayrı endpoint oynatma sınamasıdır; kullanıcı hesabı bir bağlantılıysa test ve mevcut oynatıcı aynı anda iki upstream açmamalı.

Mevcut cihaz Room kaydında 15:27, 15:29 ve 15:30 civarında üç test var: her biri 2 hesabı test etmiş ve 2/2 katalog bulmuş. Kullanıcının daha sonra bildirdiği başarısız toplu test için HTTP/hata sınıfı kaydı mevcut değil. Bu başarılı eski testler son sorunu çürütmez; **hangi başarısız hesabın hangi nedenle düştüğünü kanıtlamaz**.

Öneri:

- Seçili hesaplar / bütün sonuçlar kapsamı kullanıcıya açık olsun.
- Host başına kontrollü eşzamanlılık; bir sunucunun başarısızlığı başka sunucuları bekletmesin.
- Tek hesap denemesinin zaman bütçesi ağ + body + parse olarak açık ölçülsün; yeniden deneme toplam bütçeyi aşmasın.
- Büyük listeyi 20 kere JS'ye taşıyıp `JSON.parse + filter` yapmak yerine native sınırlı doğrulama/count sonucu tercih edilsin.
- HTTP 401/403/429, timeout, geçersiz JSON, HTML/koruma yanıtı, boş liste, iptal ayrı görünür olsun.
- Katalog başarılı ile görüntü başarılı farklı rozetler ve tarihler olarak saklansın.

## 7. Uygulama sırası ve kabul kontrolleri

Bir sonraki kaynak sürümü, mevcut kurala uygun olarak **18.7.28 / 180728 / RC1** ve önceki dalın devamından yeni dal olmalı. Bu belge o sürümün yapıldığı anlamına gelmez.

| Sıra | İş | Bitti sayılması için |
|---|---|---|
| 1 | Kurtarma foreground sırası/arka plan çalışanı + güvenli çıkış | 678+ kayıtla servis timeout'u yok; header/hardware/modal geri çalışıyor; çıkış hiçbir sonucu silmiyor |
| 2 | Arşivin tamamını sayfa sayfa gösterme + yedek tri-state + native TXT okuyucu | UI'da 678 gerçek seçilebilir kayıt; hepsi/istenilenler geri yükleme; başlangıçta sahte depolama uyarısı yok |
| 3 | Tarama TXT izdüşümünü tarama kritik yolundan ayırma | Güç kesintisi testinde journal sağlam; son başarılı TXT nesli okunabilir; hata gerçek ve görünür |
| 4 | Katalog testi hata nedenleri ve host kuyruğu | Tek hesap ve aynı hostta çoklu test gerçek sonuç verir; timeout/429/JSON ayrı; iptal çalışanları durdurur |
| 5 | Ortak doğrulanmış MAG/Xtream film/dizi sağlayıcısı | Normal refresh + ilk ekleme + recovery aynı kararı kullanır; panel-a film/kategori/dizi örnekleri çalışır; saf Stalker fallback korunur |
| 6 | Native arka plan refresh/checkpoint ve tamlık | Ekran açık/kapalı/başka uygulamadayken ilerleme; süreç sonlanınca güvenli devam; yarım katalog eski dolu veriyi silmez |
| 7 | ID/kategori/kütüphane uyumu | Önceden favoriye/izlendiye alınan film-dizi, devam et ve son bölüm bilgileri korunur; tekrarların kategori üyeliği kaybolmaz |
| 8 | Normal sürüm performans ve doğruluk testi | Aynı panel-a hesabında fetch/Room toplam süreleri ve sayıları ölçülür; canlı ilk kare ayrı ölçülür; bütün 678 hesap için zorunlu toplu yayın açılmaz |
| 9 | Doğrulama ve yayın | `yarn tsc --noEmit`, tam `node tools/denetle.js`; Kotlin değişirse clean prebuild + assembleDebug derleme kontrolü; normal release aynı imza, dört ABI/motor kontrolleri; commit/push ardından **manuel release** tetikleme |

Yeni kaynak değişikliği/test/yayın sonucu olduğunda Opus devir kaydına **dosya, işlev, önceki davranış, yeni davranış, gerçek test ve açık kalan sınırlama** eklenmeli. Başarısız test veya henüz ölçülmemiş telefon süresi “çözüldü” diye yazılmamalı.

## 8. Koddan doğrulama noktaları

Satırlar bu belgenin başındaki commit içindir; gelecekte değişebilir.

| Kaynak | İncelenen bölüm |
|---|---|
| [PanelScanService.kt](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:292) | ACTION_RECOVER, initializeResultCount/startForeground sırası |
| [ScanJournalStore.kt](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanJournalStore.kt:59) | Keystore key/enc/dec; resultsPage, pruneUnverifiedResults; latestResultArchive yalnız MAG_RESULTS |
| [ScanSafetyBackup.kt](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanSafetyBackup.kt:16) | 3 saniyede tam journal yeniden yazımı, MediaStore wt ve hash geri okuması |
| [PanelScanModule.kt](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt:408) | snapshot'a varsayılan {} yedek durumu, süreç sonrası kurtarma, acknowledge |
| [index.tsx](C:/Projeler/kizilkan-player-elite/frontend/app/index.tsx:73) | Açılışta replace('/add-playlist') |
| [add-playlist.tsx](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:321) | Canlı katalog testi: CONC20, 10s dış bütçe, catch→err; 1440 sonrası recovery; 2896 geri oku |
| [scanResultReader.ts](C:/Projeler/kizilkan-player-elite/frontend/src/utils/scanResultReader.ts:4) | UI kabulü sonrasında cursor ilerlemesi; mevcut doğru sözleşme korunmalı |
| [accountArchive.ts](C:/Projeler/kizilkan-player-elite/frontend/src/utils/accountArchive.ts:33) | Klasik TXT üretimi ve parse; native JSON-lines için uyumsuzluk |
| [PlaylistContext.tsx](C:/Projeler/kizilkan-player-elite/frontend/src/store/PlaylistContext.tsx:989) | Normal refresh, shrink guard, Room commit, lastRefreshOk |
| [refreshPlaylist.ts](C:/Projeler/kizilkan-player-elite/frontend/src/utils/refreshPlaylist.ts:390) | Stalker normal yenileme stalkerCatalog yolu; kinds/contentSelection/onKindReady |
| [stalker.ts](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2604) | 100s sayfalama bütçesi, batch20; 2924 runStalkerCatalog; 3041 stalkerEnrichment hızlı yol |
| [iptv.ts](C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:456) | Katalog probe ve Xtream normalizer; 513 xtreamSeries ham satır işleme |
| [detail.tsx](C:/Projeler/kizilkan-player-elite/frontend/app/detail.tsx:119) | xtream-verified dizi bölümü/indirme yolları mevcut; ortaklaştırmada korunmalı |
| [LibraryContext.tsx](C:/Projeler/kizilkan-player-elite/frontend/src/store/LibraryContext.tsx:198) | İzleme/favori/devam bilgisinin içerik kimliğiyle ilişkisi |
| [BulkPlaylistImportService.kt](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/BulkPlaylistImportService.kt:28) | Yeni ekleme için mevcut native foreground/Room pipeline; normal refresh'in bundan farkı |

## 9. Güncel teknik kaynaklar ve yorum sınırı

Android, `startForegroundService` ile başlatılan servisin kısa süre içinde `startForeground` çağırmasını ister; gecikme bu olayda görülen istisnayı üretir. Bu kural servis başlangıç sırasına ilişkin teşhisi destekler. [Android foreground servis sorun giderme](https://developer.android.com/develop/background-work/services/fgs/troubleshooting).

Foreground servis kullanıcıya görünür arka plan işinin Android yaşam döngüsünü sağlar. Bu projedeki keep-alive bildirimi, mevcut JS refresh fonksiyonunu kendiliğinden native çalışan hâline getirmiyor; **kaynak kodundan çıkan mimari fark budur**. [Android foreground servisler](https://developer.android.com/develop/background-work/services/fgs).

React Native'de API işlerini/UI güncellemelerini etkileyen JS iş parçacığına ağır iş yüklemek tepki süresini bozabilir. Resmî rehber performansı release koşullarında ölçmeyi önerir. Ancak bu olayın tüm nedenini “DEV yavaşlığı” diye açıklamak için veri yok; arka plan olayları ve native kurtarma stack'i ayrıca kanıttır. [React Native performans rehberi](https://reactnative.dev/docs/performance).

Xtream/Ministra uyumluluğu bütün paneller için bir varsayım olarak kullanılmadı: panel-a için gerçek API yanıtı ve mevcut hesap kapsamı doğrulandı. “Her MAG hesabı otomatik olarak Xtream olur”, “200 = görüntü var” veya “telefon mutlaka 8 saniyede günceller” sonucuna varılmadı.

## 10. Bu incelemede yapılanlar / açık kalanlar

**Yapılan:** cihaz logu ve veri kopyası; 678 sonuç/TXT bütünlük ve kimlik sayımı; kurtarma çökmesi/geri tuşu kod-log eşleştirmesi; panel-a aşama ve arka plan zaman analizi; mevcut hızlı yolun çağrı zinciri; aynı panel-a hesabıyla altı gerçek ve sırayla API testi; 678 kayıt için mevcut uygulama parser'ıyla taşınabilir arşiv doğrulaması; bu rapor.

**Açık:** kaynak düzeltmeleri, telefon üzerinde yeni normal sürüm ölçümü, 239 sonuçta kalmanın kesin UI olay zinciri, başarısız toplu katalog testinin hesap başına hata nedeni, MAG↔Xtream ID/kategori eşleşme testi, gerçek ilk kare/motor testleri, yeni APK/commit/push/release yayını. Telefonun İndirilenler klasörüne yeni açık metin TXT kopyası için kullanıcı onayı bekleniyor.

Mevcut normal ve DEV uygulaması kaldırılmadı; telefon verisi temizlenmedi; Room migration/şema veya oynatıcı mimarisi değiştirilmedi.
