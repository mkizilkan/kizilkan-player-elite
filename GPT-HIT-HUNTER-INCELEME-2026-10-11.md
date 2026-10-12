# GPT tespit ve önerileri — Hit Hunter / IShiro Scanner karşılaştırması

**Tarihî inceleme:** Satır numaraları/durumlar 11 Ekim uygulama öncesine aittir. Sonraki v18.7.32 değişiklikleri ve gerçek doğrulamaları [AI-DEVIR-v18.7.32.md](AI-DEVIR-v18.7.32.md) içindedir.

**Tarih:** 11.10.2026
**İncelenen proje:** KIZILKAN PLAYER ELITE v18.7.31 RC1
**Proje dalı:** `codex/v18.7.31-dns-tests-fast-catalog`
**İnceleme başlangıcındaki HEAD:** `940dffdc`
**İşin kapsamı:** Kullanıcının gönderdiği uygulamadan yararlanılabilecek özellikleri kod kanıtıyla değerlendirmek. Uygulama kodunda değişiklik yapılmadı.

## 1. Gönderilen dosya gerçekte ne içeriyor?

Kaynak: `C:\Users\KIZILKAN YOGA\Downloads\Telegram Desktop\hit hunter base.apk_Decompiler.com(1).zip`

ZIP SHA-256: `EA2C975818044D163F474A457DF80E35A6CA8182B82BD71C444B61EB34AF0C22`

| Bilgi | Doğrulanan değer | Kanıt |
|---|---|---|
| Uygulama adı | IShiro Scanner | Manifest satır 49 |
| Paket | `com.iptv.scanner.ishiro` | Manifest satır 7 |
| Sürüm | 7.9.1; versionCode 7 | Manifest satır 3–4 |
| Teknoloji | Flutter; Android tarafında Java/Kotlin köprüleri | Manifest satır 79–81; MainActivity satır 810–817 |
| Android hedefi | targetSdk 36, minSdk 24 | Manifest satır 10–12 |
| Arşiv | 8.720 giriş; uygulamanın paketinde 30 Java dosyası | ZIP giriş sayımı |
| Dart kaynakları | Arşivde `.dart` kaynak dosyası yok | ZIP giriş sayımı |
| Derlenmiş uygulama bölümü | ARM64 `libapp.so` | ZIP kaynak envanteri |

İnceleme örnekleri [yerel inceleme klasöründedir](C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/AndroidManifest.xml:1). Bu klasör Git tarafından dışlanıyor; APK, derlenmiş kütüphane ve decompile edilmiş kaynaklar depoya eklenmedi.

**Kanıt sınırı:** Manifest, uygulamaya ait Android köprüleri, istatistik/proxy/kuyruk sınıfları ve mevcut projemizdeki karşılıkları incelendi. 8.720 dosyanın tamamının uygulamanın kendi kodu olduğu veya tamamının satır satır denetlendiği iddia edilmiyor. Bunların büyük bölümü bağımlılıklardır.

Flutter ekranlarının ve MAC/Xtream iş akışının bir bölümü derlenmiş Dart kodundadır. İkili dosyada görülen bir metin, ilgili özelliğin doğru çalıştığını kanıtlamaz. Ayrıca bazı Java yöntemleri decompiler tarafından çıkarılamamış. `Method not decompiled` metni, decompiler'ın başarısızlık işaretidir; uygulamanın gerçek çalışırken o istisnayı attığı anlamına gelmez. Flutter'ın mobil profile/release kodu önceden makine koduna derlenir. [Flutter resmî açıklaması](https://docs.flutter.dev/perf/ui-performance).

APK kurulmadı veya çalıştırılmadı. IPTV hesapları, portal adresleri ve arşivdeki diğer uzak hizmetler denenmedi. Ağ kontrolü yalnız herkese açık GitHub proxy kaynaklarının dosyalarını indirme ve mevcut metin ayrıştırıcımızla okuma işlemidir; listedeki proxy'lere bağlantı kurulmadı.

## 2. Ana değerlendirme

Bu uygulamadan en fazla yararlanabileceğimiz alan, **işlem durumunu kullanıcıya açık ve ölçülebilir biçimde göstermek**. Bizde bulunmayan, kanıtlanmış üstün bir MAC portal bulma veya gerçek görüntü doğrulama algoritması tespit edilmiş değil.

Android köprüsünde Heartbleed kontrolü ve uzak bellekten kimlik bilgisi çıkarma bölümleri bulunuyor. Bu, kullanıcının verdiği kendi hesabını normal portal API'siyle doğrulamaktan farklı bir işlevdir. Bu bölümleri KIZILKAN'a taşımayı önermiyorum. Heartbleed'in uzak bellek ifşası olduğu resmî güvenlik duyurusunda da açıklanıyor. [OpenSSL duyurusu](https://openssl-library.org/news/secadv/20140407.txt).

İşlem ekranları, yerel dosya işleme, durum ölçümü ve bağlantı sağlığı gibi bağımsız tasarım fikirlerinden kendi kodumuzla yararlanabiliriz.

## 3. Özellik karşılaştırması: mevcut durum / yapılması gereken / sonucu

Öncelik: **P1** önce ele alınmalı, **P2** sonraki geliştirme, **P3** isteğe bağlı. “Mevcut” yazan maddeler yeni özellik diye tekrar yapılmamalı.

| # | Onlardaki kanıt | Bizde mevcut durum | Ben ne yapardım? | Yapılınca ne olacak? | Karar |
|---|---|---|---|---|---|
| 1 | `C.java:38–57` düzenli istatistik ve hız hesabı; `MainActivity.java:516–527` ayrı hız/istatistik olayları | Xtream ekranında geçen süre ve ETA, dosya akışında kuyruk bilgisi mevcut. Proxy test ekranında adet/sn var. MAG ana ilerlemesi aşama + tamamlanan/toplam gösteriyor; bütün akışların ortak bir hız kartı yok. | Ortak ilerleme kartında son zaman aralığındaki tamamlanan iş/sn, toplam ilerleme, kalan iş, bekleyen ikinci tur ve etkin işçi sayısını gösterirdim. Portal keşfi, hesap doğrulama ve görüntü testinin birimlerini ayrı tutardım. | Kullanıcı işlemin yavaş mı, beklemede mi, bitmiş mi olduğunu anlayabilir. Rastgele bir hız artırımı yapılmadan gerçek darboğaz görülebilir. | **Yeni ortak sunum — P1** |
| 2 | `A.java:86–113`; `MainActivity.java:516–517` toplam/aktif/bekleyen/ölü proxy sayaçları | `ScanProxyPool.status()` canlı, elenen, kullanımda ve başarılı panel yanıtı sayılarını veriyor; `ScanProxyLiveLine` bunları saniyede bir gösteriyor. Proxy bazında geçici bekleme durumu aynı açıklıkta sunulmuyor. | Mevcut havuza, geçici bağlantı hatası nedeniyle bekleyen bağlantıların açık durumunu ve tekrar kontrol zamanını eklemeyi değerlendirirdim. Önce aşağıdaki dört istek sınırı riskini netleştirirdim. Portalın 429/CF/CAPTCHA sinyali ile proxy bağlantı arızasını karıştırmazdım. | Geçici sorun “kalıcı ölü” gibi görünmez. Kullanıcı hangi bağlantının neden beklediğini görebilir; sunucu koruması karşısında geri çekilme davranışı korunur. | **Kısmen mevcut — P1/P2** |
| 3 | `CredentialExtractorAndroid.java:254–267` üretici/tüketici ayrımı ve sınırlı ara kuyruk | Büyük yerel dosyalarda `PanelScanService.kt:1120–1121` zaten sınırlı `ArrayBlockingQueue` kullanıyor. Adaptif işçi, kuyruk basıncı, üreticinin tamamlanması ve güvenli checkpoint mevcut. | Kuyruk motorunu kopyalamazdım. Mevcut ilerleme alanlarını aynı anlamlarla bütün ekranlarda gösterirdim. İş kuyruğu dolduğunda sonuç veya kullanıcı girdisi atılmaması davranışını korurdum. | Büyük dosyalarda bellek kontrolü korunur; “dosya okunuyor” ile “ağ işi sürüyor” ayrımı anlaşılır olur. | **Motor mevcut; görünürlük geliştirilebilir — P2** |
| 4 | `h.java:7–23` aday/sonuç/hata/bitiş olayları ayrı | Bizde MAC sonuç kategorileri ayrı, ikinci tur kalıcı ve görüntü kanıtı hesap doğrulamasından ayrı. DNS yöneticisi gerçek ilk kareyi test ediyor. | Aday, API doğrulandı, katalog alındı, görüntü verdi, belirsiz ve koruma gözlendi sayılarını tek özet üzerinde tutarlı sunardım. Mevcut kanıtları azaltmadan, “hesap bulundu” ifadesinin yanına doğrulama düzeyini koyardım. | Sadece HTTP 200 veya oturum cevabı, çalışan görüntü gibi algılanmaz. Kullanıcı gerçekten neyin doğrulandığını anlar. | **Temel mevcut; ortak özet — P1** |
| 5 | Derlenmiş bölümde combo TXT içe alma ve otomatik dışa aktarma metinleri var; tam Dart uygulaması çıkarılamadı | Yerel TXT/CSV/JSON/M3U girdileri, uyarılar, hesap arşivi geri alma, seçili TXT ve kategori dışa aktarma zaten var. Kalıcı DB + doğrulanmış emniyet TXT mevcut. | Bu özellikleri yeniden yazmazdım. Tarama sonu istatistiklerini, sürümünü ve zamanını mevcut yerel rapora ekleyen bir işlem özeti düşünürdüm. Hesap sırlarını içermeyen rapor ile tam kullanıcı arşivi ayrımını korurdum. | Hangi sürümde hangi işlemin ne sonuç verdiği daha sonra görülebilir; “579 sonuç hangi sürümdeydi?” gibi sorular doğrudan yerel kayıttan yanıtlanabilir. | **Mevcut dışa aktarmaya ek öneri — P2** |
| 6 | `CredentialExtractorAndroidNew.java:323–339` oturum kontrolü; `368–392` durdurma | Native tarama `runId` sahibi, iptal ve kalıcı journal kullanıyor. İptalde aktif HTTP bağlantıları kapatılıyor. DNS testinde eski geri çağrılara karşı koruma var. | Yeni oturum motoru kopyalamazdım. İşlem özetinin de aynı `runId` ile yazılmasını ve iptal edilen eski işin yeni ekranı değiştirememesini kabul testlerinde korurdum. | Tekrar başlatma veya ekrandan çıkma sonrasında eski işin sonucu yeni işin sonucu gibi görünmez. | **Mevcut; koruma testi — P1** |
| 7 | Manifestte foreground service ve bildirim izinleri var; arşivde ses dosyaları var. Bu, tamamlanma sesinin gerçekten hangi koşulda çaldığını kanıtlamaz. | Native tarama foreground bildirimi zaten kullanıyor. Bildirimin ve ekranın terminal durumu ayrı incelenmeli; ses/titreşim için bu incelemede tüm uygulamada “yok” hükmü verilmedi. | Kullanıcının isterse açacağı işlem sonu bildirimi/ses/titreşim seçeneklerini değerlendirebilirdim. Her sonuçta ses yerine işlem tamamlandı/iptal edildi/kesildi durumunu bir kez bildiren tasarım seçerdim. | Telefon elde değilken işlemin bitişi fark edilir; yoğun olaylar bildirim yağmuruna dönüşmez. | **Koşullu UI önerisi — P3** |
| 8 | `libapp.so` içinde 13 GitHub sağlayıcısına ait 22 kaynak URL'si var | Birçok sağlayıcı bizde zaten mevcut. Altı sağlayıcı adı katalogla eşleşmedi. Bunların tüm adresleri kullanılabilir değil. | Aşağıda GET ve gerçek ayrıştırıcıyla kontrol edilen dört sağlayıcının beş adresini, ayrıca güncellik ve gerçek bağlantı testi şartıyla kaynak kataloğuna aday yapardım. | Kullanıcının bağlantı testi için kaynak seçenekleri artar. Aday sayısının artması çalışan bağlantı veya ban bağışıklığı garantisi değildir. | **Dört yeni sağlayıcı adayı — P2** |
| 9 | `i.java` günlük seviyesi; `MainActivity.java:480–527` olay aktarımı | Bizde Flight Recorder, gizli değerleri temizleme, sınırlı kayıtlar ve kalıcı tanı altyapısı mevcut. | Onlardaki ham günlükleri veya kullanıcı adlarını yazan yaklaşımı almazdım. Ortak ilerleme kartının sayısal özetini mevcut tanıya bağlardım; ekran güncellemesini sınırlı sıklıkta birleştirirdim. | UI yükü azalabilir; tanı kaydı açıklayıcı kalır. Kullanıcı adı/şifre rapor içine gereksizce taşınmaz. | **Bizde mevcut altyapı kullanılmalı — P2** |
| 10 | APK içinde MAC/Xtream ekran metinleri var; kritik iş akışının Dart kaynağı yok | v18.7.31 DNS yöneticisinde hesap testi, gerçek ilk kare, ilk görüntü süresi, manuel DNS ve en iyi çalışan DNS seçimi var. MAG için doğrulanmış Xtream API köprüsü de mevcut. | Bu uygulamanın daha iyi portal bulduğu veya görüntü doğruladığı varsayımıyla mevcut motoru değiştirmezdim. Kullanıcının kendi bilinen çalışan hesabı ve deneme sunucusuyla doğrulama ölçümleri yapardım. | Daha fazla “hit” sayısı uğruna yanlış sonuç üretme riski büyümez; motor değişikliği ölçülebilir kanıta dayanır. | **Yeni üstün yöntem kanıtlanmadı** |

### Bizdeki ilgili kod kanıtları

- [MAG ilerleme ekranı](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:802): aşama, tamamlanan/toplam, iptal ve duraklat.
- [Xtream süre ve ETA](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1989); [dosya kuyruğu ilerlemesi](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2094).
- [Proxy canlı durum satırı](C:/Projeler/kizilkan-player-elite/frontend/src/components/ScanProxyControls.tsx:59); [native durum alanları](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:256).
- [Proxy testinde hız/ETA](C:/Projeler/kizilkan-player-elite/frontend/app/scan-proxy.tsx:299).
- [Sınırlı dosya kuyruğu](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:1120); [üretici sonu ve kalan kuyruğun işlenmesi](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:1180).
- [Şifreli journal ve kalıcı ikinci tur](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanJournalStore.kt:61).
- [Sonucu kalıcı yazma ve emniyet yedeği](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:219); [TXT bütünlük kontrolü](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanSafetyBackup.kt:64).
- [Emniyet yedeğinin görünür durumu](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1496); [MAG emniyet durumu](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:350).
- [DNS test ve en iyi gerçek görüntü seçimi](C:/Projeler/kizilkan-player-elite/frontend/src/components/DnsManager.tsx:110).
- [Yerel hesap arşivi ayrıştırma](C:/Projeler/kizilkan-player-elite/frontend/src/utils/bulkAccounts.ts:234); [MAG seçili TXT + kategoriler](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:531).
- [Gizli değerleri temizleyen tanı kayıtları](C:/Projeler/kizilkan-player-elite/frontend/src/utils/diagnostics.ts:243).

## 4. Bu uygulamada görülen hatalar ve alınmaması gereken parçalar

Buradaki tespitler decompile edilmiş kaynakta görünen akışa dayanıyor. APK üzerinde çalıştırılarak doğrulanmış cihaz bulguları değiller.

| Bulgu | Kod kanıtı | Sebep / sonuç | KIZILKAN için karar |
|---|---|---|---|
| Bekleyen proxy yeniden seçilebiliyor | [A.java:116](C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/A.java:116) | `getNext()` bekleme zamanı dolmuşsa kaydı temizliyor; dolmamışsa seçim turunu atlamak yerine aynı `return proxy` yoluna ulaşabiliyor. İstatistik “bekliyor” derken bağlantı yine kullanılabilir. | Bu seçim algoritması kopyalanmamalı. Durum kartı ile gerçek bağlantı seçimi tutarlı olmalı. |
| Bekleyenler “ölü” sayısına da ekleniyor | [C.java:57](C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/C.java:57) ve [A.java:89](C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/A.java:89) | Periyodik izleyici “ölü” için toplam eksi aktif gönderiyor. Aktif sayısı bekleyenleri de dışladığı için ölü sayısı bekleyenleri içeriyor. Diğer geri çağrı gerçek ölü kümesinin boyutunu gönderiyor; iki ekran güncellemesi çelişebilir. | Canlı/bekleyen/elenen sayaçları aynı tanımdan üretilmeli; biri diğerine eklenmemeli. |
| Kuyruk dolunca iş kaybolabilir | [CredentialExtractorAndroid.java:257](C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/CredentialExtractorAndroid.java:257) | `DiscardOldestPolicy` sıradaki eski işi atabilir. Böyle bir kuyruk, sonuç kaybetmeme hedefimizle uyumlu değil. Bu Java politikası eski bekleyen görevi atar. [Java resmî belgesi](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.DiscardOldestPolicy.html). | İş atma politikası alınmamalı; bizim sınırlı kuyruk ve kalıcı işlem takibi korunmalı. |
| “Bitti” olayı bütün alt işler tamamlanmadan üretilebilir | [CredentialExtractorAndroidNew.java:306](C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/CredentialExtractorAndroidNew.java:306), `p()` satır 332–339 | Tüketicinin bitiş geri çağrısı, koordinatörün doğrulama havuzunu beklemesinden önce oluşabiliyor. Görünen akışta “bitti” ile son alt sonucun zamanı birbirinden ayrılabilir. | Genel işlem ekranımızda terminal durumun tanımı, ilgili kalıcı yazmalar ve alt işler hesaba katılarak korunmalı. Bu modül taşınmamalı. |
| HTTPS doğrulaması devre dışı bırakılmış parçalar var | [CredentialExtractorAndroidNew.java:101](C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/CredentialExtractorAndroidNew.java:101), satır 396–397 | Sertifika güven denetimi boş; hostname doğrulaması her zaman true döndüren yöntem var. Sunucu kimliği doğrulanmayabilir. [Android resmî açıklaması](https://developer.android.com/privacy-and-security/risks/unsafe-hostname). | “Uyumluluk/hız” gerekçesiyle bu yaklaşım alınmamalı. Bu rapor bizim bütün ağ yollarının ayrıca TLS güvenlik denetiminden geçtiği iddiasını içermiyor. |
| Heartbleed / uzak bellekten hesap çıkarma | [MainActivity.java:34](C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/MainActivity.java:34), satır 173 ve 814–817; extractor sınıfları | Normal hesap doğrulamasından farklı olarak uzaktaki sistemin bellek ifşasıyla ilişkilidir. | Kapsam dışı; uygulanmamalı. Koruma aşma, kimlik bilgisi toplama veya buna yönelik motor iyileştirmesi önerilmiyor. |
| Dışarıya sonuç gönderme işaretleri | `libapp.so` içinde `_sendHitM3u`, `api.telegram.org`, `sendMessage`, `botToken`, `chatId` metinleri | Semboller sonuç gönderme kodu bulunabileceğini düşündürüyor. Tek başına gönderimin otomatik olduğunu, etkin olduğunu veya hangi veriyi gönderdiğini kanıtlamıyor. Dart akışı bu arşivden tam çıkarılamadı. | Bu davranış alınmamalı. KIZILKAN yerel kaydı ve kullanıcının açık paylaşımını kullanmalı. Hedef/token değerleri rapora alınmadı ve endpoint çağrılmadı. |

Ayrıca yalnız `host:port` biçimi kabul eden proxy ayrıştırması (`A.java:204–206`) bizim HTTP/SOCKS türü ve kullanıcı kimliği destekleyen ayrıştırıcımızdan daha sınırlı. Bu ayrıştırıcıyı da taşımak fayda sağlamaz.

## 5. Yeni proxy kaynakları: gerçekten ne doğrulandı?

Derlenmiş bölümden yalnız `raw.githubusercontent.com` üzerindeki herkese açık dosya adresleri çıkarıldı. Mevcut `scanProxy.ts` kataloğuyla adres ve sağlayıcı adı karşılaştırıldı. Altı yeni sağlayıcı adı bulundu; TheSpeedX'in farklı depo yolu ayrıca görüldü, fakat sağlayıcının kendisi bizde zaten var.

Her aday için HEAD kontrolü yapıldı. HTTP 200 veren dosyalarda GET ile içerik alındı ve **bizim gerçek `parseProxyText` fonksiyonumuz** çalıştırıldı. Her dosya için 256 KiB analiz sınırı ve 10 saniye istek sınırı uygulandı. Aşağıdaki sayılar kontrol anındaki dosya verileridir; canlı proxy sayıları değildir.

| Sağlayıcı | Arşivdeki dosya | HTTP / içerik | Bizim ayrıştırıcının okuduğu aday | Öneri |
|---|---|---|---:|---|
| almroot | `proxylist/master/list.txt` — HTTP | 200; 7.857 bayt | 419 | Kaynak adayı. Erişilebilirliği doğrulandı; güncellik ve bağlantı başarısı ayrı test edilmeli. [Kaynak deposu](https://github.com/almroot/proxylist). |
| saisuiu | `Lionkings-Http-Proxys-Proxies/main/free.txt` — HTTP | 200; 17.934 bayt | 1.000 | Kaynak adayı. [Kaynak deposu](https://github.com/saisuiu/Lionkings-Http-Proxys-Proxies). |
| Vann-Dev | `proxy-list/refs/heads/main/proxies/http.txt` — HTTP | 200; 18.728 bayt | 761 | Kaynak adayı; doğrudan dosya erişimi çalıştı. |
| Vann-Dev | `proxy-list/refs/heads/main/proxies/socks4.txt` — SOCKS4 | 200; 1.806 bayt | 93 | Aynı sağlayıcının ikinci türü; ayrı sağlayıcı sayılmamalı. |
| vmheaven | `VMHeaven-Free-Proxy-Updated/main/socks4.txt` — SOCKS4 | 200; 30.053 bayt | 1.544 | Kaynak adayı. Depo sayfası yeni ada yönlendiriliyor. [Güncel depo](https://github.com/vmheaven/VMHeaven.io-Free-Proxy-List). |
| vmheaven | `.../refs/heads/main/socks5_anonymous.txt` | 404 | — | Arşivdeki bu adres eklenmemeli. |
| officialputuid | `KangProxy/KangProxy/http/http.txt` | 404 | — | Bu adres eklenmemeli. Depo sayfasının varlığı dosya adresinin çalıştığı anlamına gelmiyor. [Depo](https://github.com/officialputuid/KangProxy). |
| openproxyhub | `proxy-exports/refs/heads/main/socks5.txt` | 200; **0 bayt** | **0** | Şu an kaynak olarak fayda sağlamıyor; sırf HTTP 200 diye başarılı sayılmamalı. |

Dört yeni sağlayıcıdaki erişilebilir, boş olmayan adres sayısı **beştir**: almroot 1 + saisuiu 1 + Vann-Dev 2 + vmheaven 1. Bu beş dosyada kaynak içi tekilleştirilmiş toplam **3.817 aday giriş** okunuyor. Farklı kaynaklar arasında tekrarlar olabilir; toplam benzersiz veya çalışan proxy sayısı bu değil.

TheSpeedX'in arşivdeki üç `SOCKS-List` yolu da erişilebilir ve ayrıştırılabilir çıktı verdi (HTTP 2.842; SOCKS4 2.543; SOCKS5 3.334). Bizde TheSpeedX zaten mevcut olduğundan bunlar yeni üç kaynak diye eklenmemeli; mevcut adreslerle içerik tekrarını incelemek gerekir.

Güncel kaynak listesini genişletmek, CAPTCHA/Cloudflare aşma yöntemi olarak ele alınmamalı. Projemizdeki host bekletme ve koruma karşısında durma davranışı korunmalı. Bu araştırmada bağlantı canlılığı, anonimlik veya herhangi bir IPTV portalının kabulü denenmedi.

Ham test özetleri: [HTTP kontrolü](C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/proxy-source-head-results.json) ve [GET + üretim ayrıştırıcısı sonucu](C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/proxy-source-parser-results.json).

## 6. Karşılaştırırken kendi kodumuzda doğrulanan bir tasarım riski

**Proxy başına dört eşzamanlı istek, mevcut kodda mutlak üst sınır değil.**

Kanıt:

- [ScanProxyPool.kt:116](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:116): `PER_PROXY_INFLIGHT = 4`.
- [ScanProxyPool.kt:583](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:583): `tryAcquire()` sayıyı kontrol ediyor ve sınır aşılırsa geri alıyor.
- [ScanProxyPool.kt:621](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:621): bütün uygun proxy'ler doluysa fallback, kontrolü geçmeden kullanım sayısını artırıp proxy döndürüyor.
- Satır 595–598'deki yorum bunu işlemin durmaması için seçilmiş bir fallback olarak açıklıyor.

**Sebep:** İşlemin devam etmesi, dört istek sınırını korumaya tercih edilmiş. Bu nedenle “proxy başına en fazla dört istek” ifadesi bütün seçim yolları için geçerli değil.

**Muhtemel sonuç:** Küçük havuzda tek proxy'ye daha fazla iş düşebilir; gecikme ve geçici bağlantı hatası artabilir. Bunun kullanıcının yaşadığı hesap bulamama sorununa fiilen neden olduğu bu incelemede kanıtlanmadı.

**Öneri:** Sınırın sert mi esnek mi olacağı açık biçimde kararlaştırılsın. Sert sınır seçilirse kapasite dolu durumu, boş/ölü havuz ve hesap reddi durumundan ayrı temsil edilmeli. İşler kaybedilmeden beklemeli; iptal sırasında bekleyen işler de çıkabilmeli. Mevcut mimaride `select()==null` farklı anlamlar taşıyabildiğinden yalnız fallback satırını kaldırmak doğru bir düzeltme olmaz. Yeni durumu bütün çağıranlar anlayacak biçimde ele almak ve kendi deneme sunucusuyla ölçmek gerekir.

Bu raporda hiçbir düzeltme yapılmadı.

## 7. Uygulanabilecek plan

### Önce mevcut v18.7.31'i gerçek cihazda doğrula

Mevcut build'in DNS ilk kare, manuel DNS seçimi, en iyi çalışan seçimi ve MAG hızlı içerik köprüsü kabul testleri önemini koruyor. Yeni uygulamadan kod eklemek, bu testlerin yerine geçmez.

### Paket A — işlem görünürlüğü ve doğru sayaçlar

1. MAC ve Xtream için ortak ilerleme/sonuç özeti tasarla; mevcut alanları kullan.
2. Portal keşfi, kullanıcı hesabı doğrulama, katalog ve görüntü kanıtını ayrı göster.
3. Son aralıktaki hız ile toplam ortalamayı ayır. Duraklama sürelerini hız/ETA hesabında hesaba kat; toplam bilinmiyorsa tahmin üretme.
4. Bekleyen ikinci tur, kalıcı kaydedilmiş sonuç ve doğrulanmış TXT durumunu aynı ekran üzerinde görünür tut.
5. İşlem sonunda sürüm + başlangıç/bitiş + durum + sayısal özet içeren yerel, paylaşılabilir rapor üretmeyi değerlendir. Şifreler bu sayısal raporun parçası olmamalı.

Muhtemel dosyalar: `add-playlist.tsx`, `mag-bulk.tsx`, `ScanProxyControls.tsx`, mevcut native snapshot/tanı alanları. Ortak özet için özgün bir React Native bileşeni kullanılabilir. Flutter ekran kodu taşımak gerekmiyor.

### Paket B — bağlantı sağlığı

1. Proxy kullanım sınırının mevcut fallback davranışını kararlaştır.
2. Kapasite dolu / bağlantı geçici hatalı / bağlantı elendi / hedef sunucu koruması durumlarını ayır.
3. Geçici bağlantı arızasının tekrar kontrolünü, hedef sunucunun korumasını aşma davranışına dönüştürmeden tasarla.
4. Yeni durum sayaçlarının ekrandaki toplamla tutarlılığını kontrol et.

Muhtemel dosyalar: `ScanProxyPool.kt`, tarama modülü tipleri ve `ScanProxyControls.tsx`. Bir Kotlin davranış değişikliği varsa native derleme ve gerçek cihaz doğrulaması gerekir.

### Paket C — kaynak adayları ve isteğe bağlı bildirim

1. Almroot, saisuiu, Vann-Dev ve vmheaven'in doğrulanmış **beş** adresini kaynak adayı olarak değerlendir.
2. Kaynak güncelliği ve türünü doğrula; anonimlik/canlılık testini mevcut test motoruna bırak. Eski/boş kaynaklar görünür etiketlenmeli.
3. TheSpeedX tekrarlarını artırmadan önce karşılaştır.
4. Kullanıcının isteğine bağlı tamamlanma bildirimi/ses/titreşimi tasarla; aynı `runId` için bir kez bildir.

Bu paketler aynı build içinde planlanabilir; henüz kodlama kararı verilmedi. Ben önce Paket A'yı ve Paket B'deki kullanım sınırı kararını ele alırdım. Yeni proxy adresleri bundan sonra gelir.

### Kabul kontrolleri

| Kontrol | Beklenen sonuç |
|---|---|
| Duraklat → devam et | Hız ve ETA bekleme yüzünden yanlış çökmez; aşama korunur. |
| Büyük yerel dosya | Kuyruk dolsa da kullanıcı girdisi atılmaz; arayüz okunabilir kalır. |
| Eski iş iptal → yeni iş başlat | Eski geri çağrı yeni ilerleme ve sonucu değiştirmez. |
| Yalnız HTTP 200 HTML cevabı | API/katalog/görüntü başarısı gibi sunulmaz. |
| API doğrulandı, görüntü alınamadı | İki sonuç ayrı görünür; hesap kendiliğinden “görüntü verdi” olmaz. |
| DB sonucunun TXT'ye yazımı başarısız | DB sonucu korunur; TXT hatası açık görünür. |
| Kapasite dolu | Hesap reddi veya bütün proxy'ler ölü gibi sınıflandırılmaz. |
| 429/CF/CAPTCHA sinyali | Mevcut geri çekilme/koruma davranışı korunur. |
| Kaynak dosyası 200 ama boş | Başarılı, dolu bir kaynak gibi sayılmaz. |
| Süre sınırı / işlem kesilmesi | Son durum ve kalıcı sonuçlar anlaşılır biçimde korunur. |

Android 15 ve üzerini hedefleyen `dataSync` foreground hizmeti arka planda sınırsız çalışamaz; süre sınırı ve `onTimeout` yükümlülüğü vardır. Bizde `PanelScanService.kt:240–246` bu callback'i ele alıyor. Gönderilen uygulamanın manifestinde hizmet bulunması, sınırsız veya kesintisiz çalışma garantisi değildir. [Android resmî belge](https://developer.android.com/develop/background-work/services/fgs/timeout).

## 8. Opus'a devir: bu incelemede ne yapıldı, ne yapılmadı?

**Yapılanlar:**

- ZIP kimliği, hash'i, manifest, uygulama paketine ait kaynak envanteri kontrol edildi.
- Proxy seçimi, durum sayaçları, olay köprüsü, kuyruk ve durdurma bölümleri mevcut projemizle karşılaştırıldı.
- Decompiled Java'nın eksik yöntemleri ve derlenmiş Dart'ın kanıt sınırı açıklandı.
- Heartbleed/kimlik bilgisi çıkarma, doğrulamasız TLS ve belirsiz dış gönderim işaretleri ayrıldı; bunları taşıma önerisi yapılmadı.
- Altı yeni kaynak sağlayıcısı bulundu. Aday dosyalar HEAD/GET ve üretim `parseProxyText` fonksiyonuyla kontrol edildi. Dört sağlayıcının **beş** boş olmayan adresi kullanılabilir kaynak adayı olarak raporlandı.
- Kendi kodumuzda proxy başına dört istek sınırını aşabilen fallback tasarımı koddan gösterildi; kullanıcı sorununun kökü olduğu iddia edilmedi.
- Bu MD, proje köküne kullanıcının inceleyebilmesi için yazıldı.

**Değişmeyenler / yapılmayanlar:**

- Uygulamanın TS/TSX/Kotlin kodu, bağımlılıkları ve sürümü değişmedi.
- APK çalıştırılmadı veya telefona kurulmadı. Herhangi bir IPTV hesabı denenmedi.
- Kaynak listelerindeki proxy'lere bağlanılmadı; anonimlik, canlılık ve portal kabulü doğrulanmadı.
- Yeni özellik commit/push veya build yapılmadı. Bu çalışma analiz ve plan raporudur.
- Decompile edilmiş dosyalar, ikili dosya ve test özetleri `artifacts/hit-hunter-review` altında Git dışındadır.

**Sonraki adım:** Kullanıcıyla bu tablodaki yeni maddeleri seç; mevcut özellikleri tekrar yazma. Kodlamadan önce seçilen kapsamı netleştir. Arşivde uygulama sahibinin kaynak kodu lisansını gösteren bir LICENSE dosyası bulunmadı; bağımlılıkların NOTICES dosyaları uygulamanın kendi koduyla aynı şey değildir. Tasarım fikirlerini özgün kodumuzla uygulamak daha uygun.

## 9. Ayrıntılı proxy ve arka plan devam incelemesi

Kullanıcının sonraki soruları, ALPHA Python yedeği, canlı kaynak adresi kontrolü ve 11.10.2026 ekran görüntüsü ayrıca incelendi. Test yöntemleri, proxy kullanımı, mevcut hatalar, arka plan özelliklerinin tamamlanma durumu ve Opus'a uygulama planı [GPT proxy/test/arka plan raporunda](<C:/Projeler/kizilkan-player-elite/GPT-PROXY-TEST-VE-ARKA-PLAN-INCELEME-2026-10-11.md>) ayrıntılıdır.
