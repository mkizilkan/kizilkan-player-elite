# GPT'nin tespit ve önerileri — Opus'a ayrıntılı inceleme devri

**Tarih:** 3 Ekim 2026, Türkiye saati (UTC+3).  
**Proje:** KIZILKAN PLAYER ELITE.  
**İnceleme türü:** Salt okunur kaynak incelemesi, bağlı DEV telefonunun günlük/veri incelemesi, üretim fonksiyonlarıyla ağsız bellek içi doğrulamalar ve birincil kaynak araştırması.  
**Bu rapor hazırlanırken yapılan değişiklik:** Yalnız bu Markdown dosyası oluşturuldu. Uygulama kodu, sürüm alanları ve telefon verileri değiştirilmedi; build, kurulum, commit, push veya workflow tetiklemesi yapılmadı.

## 1. Opus'un önce bilmesi gereken durum

| Alan | Doğrulanan durum |
|---|---|
| Çalışma klasörü | `C:\Projeler\kizilkan-player-elite` |
| Dal | `v18.7.10-rc1-bulk-handshake-fallback` |
| HEAD | `70f7933f` — v18.7.9 devir/CLAUDE güncellemesi |
| Çalışma ağacı | Commit edilmemiş 18.7.10 RC1 değişiklikleri var. Aşağıdaki bulgular bu değişiklikleri de kapsar. |
| Telefon paketi | `com.gpt.kizilkan.player.dev` |
| Telefonun paket sürümü | **18.7.9-dev / 180709** |
| Son paket güncellemesi | **03.10.2026 17:20:12** |
| Cihaz | OnePlus 7 Pro / GM1910; inceleme sırasında ADB yetkili ve uygulama çalışıyordu. |
| Telefon incelemesi | Dosyalar ve veritabanları yalnız okundu. Native SQLite veritabanı/WAL bilgisayarda bellek içinde birleştirilip sorgulandı; cihaz veritabanına yazılmadı. |

**Sürüm ayrımı zorunludur:** Telefonun paket sürümü 18.7.9-dev'dir. Yeni 18.7.10 fallback/version.js kodundaki açıklar, mevcut kaynakta doğrulandı; bunların telefonda gerçekleştiği iddia edilmiyor. DEV'de çalışma anındaki JS revizyonunu ayrıca kanıtlamak gerekirse sürüm/fingerprint telemetrisi kullanılmalı; yalnız APK etiketi üzerinden daha güçlü sonuç çıkarılmamalı.

Mevcut kirli dosyalar inceleme başlamadan önce zaten vardı:

- `frontend/app.json`
- `frontend/app/add-playlist.tsx`
- `frontend/package.json`
- `frontend/src/utils/magBulk.ts`
- `frontend/src/utils/magBulkScan.ts`
- `frontend/src/utils/magPortalDiscovery.ts`
- `frontend/src/utils/stalker.ts`
- `tools/check-v18708-release.js`
- `tools/check-v18709-release.js`
- `tools/denetle.js`
- `tools/test-mag-portal-discovery.js`
- Yeni, henüz izlenmeyen `tools/check-v18710-release.js`

Opus bu çalışmaları korumalı; incelemeyi temiz başlangıç sanıp mevcut değişiklikleri geri almamalıdır. Satır numaraları rapor hazırlanırken geçerlidir; sonraki düzenlemelerde fonksiyon/ifade üzerinden tekrar bulunmalıdır.

### Kullanıcının son şikâyetleri

1. Çoklu MAC arama, MAC + port + path girildiğinde de girilmediğinde de hesap bulamıyor.
2. Tekli MAC eklemede bir katman/ekran gelip gidiyor; uzun beklemeden sonra portal bulundu mesajı geliyor.
3. Bazı portallarda IPTV Extreme Pro kullanıcı adı ve şifre gösterebilirken uygulama yalnız şifre gösteriyor.
4. İlk görüntü süresi uzamış olabilir; motor değişimleri ve canlı duraklatma/zaman kaydırma incelenmeli.
5. Portal keşfi önce yapılmalı, kullanıcı seçimi veya mantıklı otomatik seçim sonrasında MAC'ler seçilen endpoint'te doğrulanmalı.
6. CAPTCHA, anti-bot, Cloudflare/WAF ve istek sınırlama gözlemleri doğru gösterilmeli.

Önceki seçim, TXT/kategori, MAC giriş alanı, seçmeli yedek geri yükleme, sıfır içerik sayısı ve boş kabuk talepleri de kabul planında korunmuştur; bu rapor bunları kaldıran bir kapsam daraltması değildir.

## 2. Kanıt sınıfları ve sınırlar

- **Cihaz:** Gerçek DEV kaydı veya kayıtlı metadata. Davranışın görüldüğünü kanıtlar; tek başına her zaman kök nedeni kanıtlamaz.
- **Kaynak:** Mevcut kod yolu doğrudan incelendi.
- **Bellek içi doğrulama:** Üretim fonksiyonu/modülü veya gerçek AST callback'i sahte taşıma/saat/depolama ile çalıştırıldı. Uygulama ya da test dosyası yazılmadı; dış portala istek gönderilmedi.
- **Protokol:** Birincil doküman veya gerçek sunucu/istemci kaynak koduyla uyumluluk açığı doğrulandı. Her Stalker klonunun aynı davranacağı varsayılmıyor.
- **Açık soru:** Mevcut telefon kanıtı kesin kökü ayırmaya yetmiyor. Bunlar kesin teşhis gibi kodlanmamalıdır.

HTTP **200** tek başına portal API'si, geçerli hesap veya oynatılabilir yayın anlamına gelmez. HTML giriş sayfası, soft-404, genel web sayfası ve JSON `js:null` farklı kanıtlardır. Benzer şekilde token, profil, hesap bilgisi, içerik erişimi ve ilk video karesi ayrı aşamalardır.

## 3. Telefonda görülen somut olaylar

### 3.1 Çoklu MAC arama

Tüm saatler 03.10.2026, UTC+3:

| Başlangıç → bitiş | Kapsam / yük | Gerçek sonuç | Yorum |
|---|---|---|---|
| 18:22:12.092 → 18:30:38.381 | `all`, 49 iş, 1 host, proxy kapalı | Yaklaşık **8 dk 26 sn**, `valid=0`; keşif `not-found`, adaylar boş | Uzun keşif var; sonuç hesapların API ile tek tek reddedildiğini kanıtlamıyor. |
| 18:50:53.881 → 18:51:04.214 | `exact`, 49 iş, 1 host, proxy kapalı | Yaklaşık **10,3 sn**, `valid=0` | Bu koşuda geçerli hesap bulunmamış. Başarılı hesap doğrulama olayı görülmedi. |
| 19:25:49.934 | `all`, 4 iş, 1 host, proxy kapalı | Başlangıç kaydı var | Tamamlanma kanıtı görülmedi; tamamlandı veya başarısız oldu diye sınıflandırılmadı. |
| 19:30:04.718 → 19:30:12.916 | `exact`, 3 iş, 1 host, proxy kapalı | Yaklaşık **8,2 sn**, `valid=0` | Kullanıcının küçük girişle de sonuç alamadığı şikâyetini destekliyor. |

Pasif keşfin boş kaldığı host için 18.7.9 akışı MAC doğrulaması başlatmadan sonuç üretebilir. Bu davranış, “49 hesap yok/geçersiz” ile “hesaplar denenecek API yolu bulunamadı”nın aynı görünmesine yol açıyor.

### 3.2 Profil ve hesap bilgileri

- Bir portalda çalışan `2095 /portal.php` oturumları kaydedilmiş; başarılı profilde `login`, `password`, `pass`, `fname`, `name` gibi düz alan adları var.
- `get_main_info` yanıtında görülen alan adları yalnız **`mac`, `phone`**.
- Başka bir portalda `/portal.php` token alınmış, ardından **`MAG320-pcap-minimal: profil boş`** hatası kaydedilmiş. Boş profil olayları 19:06:39, 19:26:07 ve 19:27:19 civarında görülüyor.
- Bir kayıtlı MAC playlistinin `accountInfo` alanında **password mevcut, username yok**. Kartın kullanıcı adı satırını gizlemesi söz konusu değil.
- Günlükte alan adının bulunması, alan değerinin dolu veya doğru olduğunu kanıtlamaz. İlgili login'in gerçek değeri logda yoktur.
- `hasUsername` ve `hasPassword` varlık bayrakları günlükte `[REDACTED]` olmuş; hassas değer açılmadan da teşhis yapılabilecekken bayraklar kullanılamıyor.

**IPTV Extreme'in kullanıcı adını hangi API yanıtından veya URL biçiminden çıkardığı kesinleşmedi.** İç içe hesap alanı desteği bir kod açığıdır; telefondaki düz profilli hesabın kesin nedeni olarak sunulmamalıdır.

### 3.3 Tekli MAC ekranının gelip gitmesi

Telefonun `kizilkan_native_bulk_import` SharedPreferences snapshot'ında:

- `state=COMPLETED`
- `running=false`
- `jobs.length=1`
- Son güncelleme: **01.10.2026 10:05:44**

Bu eski kayıt, tekli MAC işlemi sürerken 850 ms'lik ekran snapshot okuyucusunun `loading=false` yazabildiği koşulu karşılıyor. Gerçek callback ile aynı state değişimi bellek içi denemede doğrulandı. Tam kullanıcı eylemi → modal kapanma zaman çizgisi ayrı kaydedilmedi; fakat ilgili eski kayıt ve onu kullanabilen kod yolu birlikte mevcut.

### 3.4 Player zaman çizgisi

Aynı kanal için:

| Saat | Olay | Ölçüm / sonuç |
|---|---|---|
| 19:26:59.745 | `CHANNEL_SELECTED` | Canlı Stalker kanalı seçildi. |
| 19:26:59.965 | `STALKER_RESOLVE_DONE` | İlk çözümleme **218 ms**. |
| 19:27:00.007 | `PLAYER_SESSION_START` | Media3, seçimden **262 ms** sonra. |
| 19:27:03.989 | `MEDIA3_ERROR` | **HTTP 444**, seçimden **4.240 ms** sonra. |
| 19:27:04.100 | `STALKER_PLAYBACK_SOURCE_RENEW` | 444 nedeniyle kaynak yenileme. |
| 19:27:13.460 | `STALKER_HANDSHAKE_OK` | Yeni handshake **9.343 ms**. |
| 19:27:19.801 | `STALKER_PROFILE_ERROR` | Minimal profil boş. |
| 19:27:20.435 | `STALKER_RESOLVE_DONE` | Yeniden çözümleme **16.317 ms**. |
| 19:27:21.741 | `PLAYER_SESSION_START` | İkinci Media3 denemesi, seçimden **21.996 ms** sonra. |
| 19:27:28.100 | `MEDIA3_ERROR` | Yeniden **HTTP 444**, seçimden **28.350 ms** sonra. |
| 19:27:28.224 | `MEDIA3_FATAL_FALLBACK` | MPV'ye geçiş kararı. |
| 19:27:28.343 | `ENGINE_ERROR` | Hata kaydı oluşturulma zamanı. |
| 19:29:12.289 | `STALKER_ENGINE_SWITCH_REFRESH` | Aynı kanal, Media3 → MPV; önceki olaydan yaklaşık **104 sn** sonra. |

Bu denemede `FIRST_FRAME` görülmedi. Başarılı ilk görüntü süresi hesaplanamaz. HTTP444'ün hesap, geçici URL, sağlayıcı politikası veya başka upstream nedenle geldiğini mevcut kayıt kesin ayırmıyor. MPV/VLC'nin bu denemede başarılı görüntü ürettiği de kanıtlanmış değil.

**104 saniyenin tamamı tanı kuyruğuna bağlanmamalı.** Motor geçişinin tanı kuyruğunu bekleyebildiği kaynak ve fixture ile kesin; cihazdaki tüm gecikmenin kuyruk/native yazım/JS zamanlaması veya sonraki senkron kaynak bırakma çağrıları arasında dağılımı ayrıca ölçülmeli.

### 3.5 Zaman kaydırma, tampon ve DEV gecikme kayıtları

- Kayıtlı `kizilkan.timeshift.mode.v1`: **`off`**.
- Kayıtlı `kizilkan.player.buffer`: **300 ms**.
- Kayıtlı `kizilkan.player.engine`: **`exo`**, yani Media3 tercihi.
- İncelenen oturumda `LIVE_TIMESHIFT_PREPARE/READY/ARM_ON_PAUSE` yok. `off` veya henüz duraklatılmamış `onPause` için bu normaldir.
- Media3 ayarı yaklaşık 300 ms hedef tampon ve **200 ms başlatma eşiği** oluşturuyor. Ayar okunmadan önce 1500/750 ms varsayılanı kısa süre kullanılabilir; 16–28 saniyelik hata akışını bu değerler tek başına açıklamaz.
- Native tanı veritabanında **18.508 olay**, kritik dosyada **64 `MAIN_THREAD_STALL` uyarısı** görüldü. Bazı yığınlar React Native `CxxInspectorPackagerConnection` içinde. Bu, DEV performansını ayrıca inceleme gerekçesidir; tek başına üretim sürümünde aynı kökü veya Android'in uygulamayı ANR nedeniyle kapattığını kanıtlamaz.
- Native veritabanı yaklaşık 458 MB idi; bu dosya katalogları da içerir. Büyüklük tek başına “tanı kayıtları 458 MB” veya bellek hatası demek değildir.

## 4. Tespit, çözüm ve beklenen sonuç tablosu

P1: Önce ele alınmalı; yanlış sonuç, veri bütünlüğü veya belirgin kullanılabilirlik etkisi var. P2: Uyumluluk/doğruluk/teşhis açığı. P3: Görünüm veya gözlem kalitesi.

| ID | Öncelik / kapsam | Mevcut durum | Yapılması gereken | Yapılınca ne olacak |
|---|---|---|---|---|
| M01 | P1, 18.7.9 | Pasif keşif boşsa MAC hesap isteği atılmadan no-portal/error üretiliyor. | Seçili/verilmiş API için kontrollü hesap doğrulaması ve keşif/hesap hatası ayrımı. | Gerçek hesap denemesi yapılmadan hesap geçersiz denmez. |
| M02 | P1, 18.7.10 değişikliği | Koruma/error raporundan sonra fallback MAC isteği gönderebiliyor ve raporu ready yapabiliyor. | Terminal koruma/429/iptal durumlarını ortak sözleşmeyle koru. | Koruma durdurması fallback tarafından delinmez. |
| M03 | P1, 18.7.10 değişikliği | Handshake fallback kapsamı ve aday sınırını dikkate almıyor. | Exact/fallback/all ve kurulum dizini aynı plan üzerinden uygulanmalı. | Girilen path dışına sürpriz istek çıkmaz. |
| M04 | P1, 18.7.10 değişikliği | Host keşfi yalnız ilk MAC'e bağlanıyor. | Host durumu ile hesap reddini ayır; başarısız ilk MAC host'u elemesin. | Sonraki çalışan MAC'in yolu ilk MAC yüzünden kapanmaz. |
| M05 | P1, 18.7.10 değişikliği | version.js izi denenmemiş PHP yollarını HTTP200/seçilebilir gösteriyor. | Statik izi aday kanıtı olarak tut; API'yi ayrıca dene. | Var olmayan API yolları çalışıyor gösterilmez. |
| M06 | P2, .9/.10 | all açıkta aday bulunca unknown portları atlıyor; .10 ek 96/48 sınırları bazı yolları kesiyor. | Kapsam ve süre bütçesini açık uygula; bitmeyen taramayı tam sonuç sayma. | Atlanan port/yol “yok” diye sunulmaz. |
| M07 | P1, mevcut | Keşif yedeği yalnız ilk PCAP profil/varyantını kullanıyor. | Seçilmiş API'de tekli ve çoklu için ortak sınırlı uyumluluk akışı. | Tekli çalışıp çoklunun bulamaması azalır. |
| M08 | P1, mevcut | Token alan MAG320 oturumu profil boş olsa da diğer uygun profil biçimlerine geçmiyor. | Token/profil/erişim kanıtını ayrı değerlendir; sınırlı profil alternatifleri. | Eksik profil nedeniyle yanlış negatif ve yanıltıcı başarı azalır. |
| M09 | P2, mevcut | 90 sn handshake bütçesi varyant denemelerinin içinde uygulanmıyor. | Paylaşılan deadline ve kalan süreye göre timeout/iptal. | Süre sınırı gerçek olur. |
| M10 | P1, cihaz + kaynak | Eski native import snapshot'ı tekli MAC loading'ini kapatabiliyor. | İşlem kimliği/sahipliği olmadan başka akışın state'ine yazma. | Yükleme katmanı gelip gitmez; tekrar başlatma açılmaz. |
| M11 | P2, mevcut | Açık :80/:443, URL.port boş olduğu için portsuz sayılıyor. | Ham girdinin explicit port bilgisini koru. | Kullanıcının verdiği port keşifte kaybolmaz. |
| M12 | P3, .9/.10 | Login/profile denemeleri sırasında ilerleme metni sabit; .10 onProbe yalnız keşfi kapsıyor. | Aşamaları ve sınırlı deneme ilerlemesini UI'ye ilet. | Uzun işlem sırasında ne beklendiği anlaşılır. |
| A01 | P1, mevcut | Base64 MAC doğrulayıcıda çözümlenmeden karşılaştırılıyor. | Ortak MAC normalizasyonunu eşleşmede de kullan. | Doğru hesap MAC uyuşmazlığı diye elenmez. |
| A02 | P1, mevcut | Snapshot herhangi nesneyi başarı sayıp yanlış MAC'in bilgisini birleştirebiliyor; terminal hata caller'da yutulabiliyor. | Hesap/oturum/MAC ve anlamlı yanıt doğrulaması; typed terminal sonuç. | Yanlış hesap bilgisi yazılmaz, koruma normal akışa dönmez. |
| A03 | P2, mevcut | İç içe account_info.login okunmuyor; kart username yoksa MAC gösteriyor. | Desteklenen flat/nested yanıtları kaynak bilgisiyle ayrıştır. | Gerçek dönen kullanıcı adı kaybolmaz. |
| A04 | P2, .10 değişikliği | fname/name kullanıcı adı oluyor, account_number düşmüş, base64 MAC aday filtresini geçebiliyor. | Giriş adı/abone adı/hesap numarasını ayır; çözümleme önce. | Boşluk yanlış etiketli bilgiyle doldurulmaz. |
| A05 | P2, mevcut | Sayısal telefon genel epoch parser ile bitiş tarihi sanılabiliyor. | phone fallback yalnız açık tarih biçimlerine uygulanmalı. | Telefon kaybolmaz, sahte geçmiş bitiş oluşmaz. |
| A06 | P2, mevcut | Eski exp_date yeni tariff tarihini gölgeleyebiliyor. | Aynı güncel expiry kaynağını alias'lara ve gösterime yansıt. | Yenilemeden sonra kart eski tarihi göstermez. |
| A07 | P2, mevcut | Stalker varyantındaki kapalı status:1, kartta aktif sayılabiliyor. | Kaynak türüne özgü status sözleşmesi; belirsiz durum ayrı. | Xtream ve Stalker sayısal durumları karışmaz. |
| A08 | P2, protokol | status:2 ikinci giriş adımı/do_auth yok. | login-required sonucu ve kullanıcı tarafından verilen bilgiyle ikinci adım. | Giriş bekleyen portal tamamlanmış sayılmaz. |
| C01 | P1, mevcut | Pagination hatası/429 kısmi kataloğu normal sonuç ve OK yapabiliyor. | Tam/eksik/korumalı/iptal sonuç sözleşmesini bütün caller'lara taşı. | Tam katalog eksik sonuçla ezilmez. |
| C02 | P2, mevcut | Sayfa fingerprint'i yalnız ilk 8/son 3 kaydı kullanıyor. | Tam kimlik kümesini/order bilgisini güvenilir özetle karşılaştır. | Ortası farklı sayfalar duplicate diye atlanmaz. |
| C03 | P1, mevcut | Bulk iptalinde pending/enriching terminal duruma dönmeyebiliyor. | Başarı-return/abort/catch yollarında sahipliği koruyan terminal uzlaştırma. | Liste kalıcı “senkron sürüyor” durumunda kalmaz. |
| C04 | P1, mevcut | Tekli enrichment diagnostics.ERROR kontrolü olmadan ready/başarılı yazabiliyor. | Tür bazında hata/eksikliği koru; yalnız doğrulanan türü commit et. | Boş/eksik sonuç tam başarı diye saklanmaz. |
| D01 | P1, mevcut | addPlaylist profil sahibini katalog kilidi beklendikten sonra alıyor. | Girişte profil + oturum nesli yakala; tüm yazımlarda doğrula. | A işi B deposuna veya yeni A oturumuna yazılmaz. |
| P01 | P1, cihaz + kaynak | Motor geçişi global tanı/depolama kuyruğunu bekliyor. | Telemetrinin kalıcılığını motor kurtarmasının beklediği yoldan çıkar. | Yoğun katalog kaydı motor geçişini kilitlemez. |
| P02 | P1, mevcut | Yenileme nesli URL sahiplik anahtarında yok; yeni motor eski URL ile render olabilir. | Resolve neslini native kaynak sahipliğine dahil et. | Eski play token yeni motora geçmez. |
| P03 | P2, protokol | 8 sn link cache bazı 3/5 sn geçici URL'lerden uzun. | In-flight birleştirme veya kanıtlı TTL; eski geçici linki tekrar verme. | Süresi geçmiş URL yeniden kullanılmaz. |
| P04 | P2, ölçüm | sourceSet zamanı replaceAsync sonrasında tutuluyor ve oturum başında sıfırlanmıyor. | Aşamaya/oturuma bağlı zaman damgaları ve ölçüm tanımı. | İlk kare ölçümü önceki kaynakla karışmaz. |
| P05 | P3, UI | Timeshift ayarı okunmadan onPause gösteriliyor; açık kaynakta anlık ayar bildirimi yok. | Ayar yükleme durumu ve uygulama zamanı açık olmalı. | Görünen tercih ile uygulanmış tercih daha net olur. |
| N01 | P2, proxy | Accept-Encoding:gzip elle veriliyor, proxy decoded stream üretmiyor. | Şeffaf açılma veya decoded sınır içeren decompressor. | Gzip JSON yanlış reddedilmez. |
| N02 | P2, native | Gövde sınırı tüm body/gzip açıldıktan sonra uygulanıyor. | Stream okurken sıkıştırılmış ve açılmış byte sınırı. | Büyük yanıt bridge/belleği gereksiz büyütmez. |
| N03 | P2, teşhis | PCAP başlıkları final ağ isteği yerine response.request'ten ölçülüyor. | Network interceptor seviyesinde güvenli şekil ölçümü. | Gerçekte gönderilen Connection eksik sanılmaz. |
| T01 | P1, test | Bulk test sahtesinde yeni discoverMagPortal yok; version.js testi yanlış başarı bekliyor. | Gerçek fallback entegrasyonu ve negatif API oracle testleri. | PASS, hatalı yeni davranışı onaylamaz. |
| T02 | P2, teşhis | hasUsername/hasPassword bayrakları da redacted oluyor. | Yalnız varlık/şekil metadata'sını güvenli şekilde koru. | Gizli değer açılmadan ayrıştırma nedeni izlenebilir. |

## 5. MAC keşfi ve tekli ekran ayrıntıları

### M01 — Pasif keşif ile gerçek hesap bağlantısının ayrılması

**Kod:** [runMagBulkScan / no portal](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:226). Commit edilmiş 18.7.9 akışında yeni handshake fallback yok; `choices` boşsa `stalkerLogin` ve `stalkerVerifyAccount` çağrılmadan sonuç dönüyor.

**Kök:** MAC'siz web yanıtı, bazı portalların MAC istemci API'sini tanıtmaz. Kullanıcı `/c` vermiş olabilir; orası web arayüzüdür. PHP ailesi anonim istekte HTML/boş/belirsiz sonuç verebilir. Keşif “kanıt yok” sonucunu, hesabın çalışmadığı sonucundan ayırmalı.

**Öneri:** Endpoint adayının kanıt düzeyi ayrı tutulmalı. Kullanıcının literal API'sinde veya seçtiği kurulum ailesinde kontrollü gerçek hesap doğrulaması yapılabilmeli. Her MAC'in bütün port/path kombinasyonlarını denediği eski sisteme dönülmemeli.

**Kabul:** Anonim cevap tanıtıcı değilken yetkili supplied MAC ile çalışan endpoint, exact tekli ve çoklu akışta aynı hesap sonucunu verir. Denenmeyen MAC için “hesap reddedildi” yazılmaz.

### M02 — Yeni fallback koruma durdurmasını aşabiliyor

**Kod:** [fallback koşulu](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:170), [raporu ready yapma](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:196).

Seçilebilir aday olmaması fallback'e girmek için yeterli; pasif raporun `protected/error` olması doğru şekilde ayrılmıyor. Fixture'da korumalı/error rapor sonrasında login çağrısı oluştu, token bulununca rapor ready oldu.

**Öneri:** Protection/rate-limit/cancel ve sıradan belirsiz keşif farklı sonuç türleri olmalı. Terminal koruma/429 gözlemi aynı host üzerinde sonraki aşamaları durdurmalı. Koruma gözlemi sonradan silinmemeli.

**Kabul:** CAPTCHA/WAF/429 raporunda fallback handshake ve hesap login sayısı sıfır; sonuç korumalı/bekletildi olarak kalır. Genel 403 otomatik CAPTCHA veya geçersiz MAC sayılmaz.

### M03 — Exact kapsam ve aday sınırı fallback'te kayboluyor

**Kod:** [aday üretimi](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:175), [ayrı limit](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:187).

Fallback yalnız `hasPort` üzerinden genişleme seçiyor; kullanıcının scope'u, literal PHP yolu, kurulum ailesi ve `maxCandidatesPerHost` aynı planla korunmuyor. Fixture'da exact tenant PHP + limit 1 için 15 aday üretildi, 14'ü girilen yolun dışındaydı; root `/portal.php` seçilebildi.

**Öneri:** Tek aday planı ve ortak bütçe kullanılmalı. Literal PHP exact'te yalnız o endpoint; `/c` gibi girişte izin verilen aynı kurulum API ailesi; fallback/all açık kullanıcı kapsamıyla.

**Kabul:** Exact `/tenant/api.php`, explicit port ve limit 1 ile başka path/port/origin isteği oluşmaz. Export/playlist ekleme yeniden login'i de kapsamı genişletmez.

### M04 — İlk MAC host keşfinin kaderini belirliyor

**Kod:** [firstJob](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:173), [probeCred](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:182).

Fixture'da ilk MAC başarısızsa host için portal bulunmadı ve sonraki MAC hesap login'i başlamadı; aynı listede ilk MAC çalışanla değiştirildiğinde diğer yol açıldı. Böylece MAC sırası sonucu etkiliyor.

**Öneri:** Portal aday durumu hesap kimliğinden bağımsız olmalı. Bir MAC'in auth reddi yalnız o hesabı etkilemeli. MAC'le uyumluluk kanıtı gerektiğinde başarısız hesabı host yok saymak için kullanma; sınırlı ve kullanıcının seçtiği endpoint'te doğrulama yap.

**Kabul:** Aynı supplied MAC kümesinin sırası değişince son hesap sonuçları değişmez; ilk reddedilen hesap, sonraki çalışan hesabı engellemez.

### M05 — version.js izi API başarısı değil

**Kod:** [version.js aday oluşturma](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:278).

`version/appVersion` benzeri statik iz, dört tahmini API'yi `httpStatus:200, selectable:true` yapabiliyor; bu API'lere gerçek istek atılmış olması gerekmiyor. Fixture'da PHP yolları 404 iken denenmeyen API seçilebilir/200 göründü.

**Öneri:** Statik dosya yalnız kurulum ipucu olsun. Adayın `observedHttpStatus`, `fingerprintSource`, `apiProbeState` gibi anlamları birbirinden ayrılmalı. Gerçekte gözlenmemiş HTTP kodu üretilmemeli.

**Kabul:** Generic appVersion JS + bütün API'ler 404 → API ready/200 değil. Gerçek Stalker statik izi → aday; çalışabilir API durumu ancak ilgili endpoint'in yanıtı ve gerektiğinde kontrollü doğrulamayla belirlenir.

### M06 — all kapsamı ve kısaltılmış plan yanlış negatif oluşturabiliyor

**Kod:** [twoPhaseExpand](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:391), [96 aday kesimi](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:404), [48 handshake sınırı](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:187).

18.7.9, açık portta seçilebilir aday bulursa unknown portlara gitmiyor; bunun all seçeneğindeki “tümü” beklentisi açık tanımlanmalı. 18.7.10 plan kesimleri, geç sıralanan gerçek `/server/load.php` gibi yolları hiç denemeyebilir. Fixture'da çalışan 8080 API isteği yapılmadan not-found oluştu.

**Öneri:** Kullanıcı kapsamı ile performans bütçesi farklı kavramlar olmalı. Aday sınırı kullanılıyorsa kapsanan/atlanmış adaylar ve eksik keşif açık raporlanmalı. Bütçe bitişi “portal yok” değil “kapsam tamamlanamadı” olmalı. Hız modu kapsamı sessiz değiştirmemeli.

**Kabul:** Geç sıradaki çalışan API bulunur veya taramanın tamamlanmadığı doğru gösterilir; kullanıcı all seçtiğinde sessiz path/port kesimi olmaz.

### M07 — Keşif yedeği normal login uyumluluğunu kullanmıyor

**Kod:** [preferred ilk profil](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1387), [PCAP tek varyant](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1273), [normal handshake profil döngüsü](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1464).

Actual-source fixture: aynı PHP endpoint HTTP200 `js:null` döndürüyor; MAC + `JsHttpRequest` birlikte geldiğinde token veriyor. `discoverMagPortal` null döndü; normal handshake `mag254-raw / token-empty-prehash0` ile token aldı.

Ayrıca scoped bulk fallback native exact taşımasını dışlıyor, RN global fetch'e düşüyor; tekli normal PCAP native taşıma kullanabiliyor. Başlangıç UA'sı ikisinde de MAG320 PCAP; “UA varsayılanı farklı” teşhisi yapılmamalı. Direct gzip kesin neden ilan edilmedi; kurulu RN gzip başlıklı yanıtı açıyor.

**Öneri/kabul:** Seçilmiş API için aynı kontrollü bağlantı sözleşmesi. Test, MAC + JS isteyen portalı tekli/bulk aynı şekilde doğrulamalı; native/direct/proxy taşıma farkları ayrıca ölçülmeli.

### M08 — Handshake başarılı, profil uyumluluğu eksik

**Kod:** [PCAP-first](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:407), [token sonrası return](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1486), [MAG320 minimal profil](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1629), [derived boş](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1651).

Fixture'da kullanıcı model MAG254 olsa da ilk MAG320 handshake token aldı; daha kapsamlı profil isteyen sunucu için yalnız minimal `get_profile` çalıştı, profil null/profileError oldu. Cihazda benzer boş profil kayıtları var; fakat alternatif profilin bu gerçek portalı düzelteceği canlı doğrulanmadı.

**Öneri:** Token başarısını uyumluluk sonu sayma. Verilmiş serial/device/model bilgileriyle sınırlı profil alternatifleri dene. Profil sunmayan fakat aynı oturumda gerçek içerik erişimi veren klonlar için kanıtlı fallback korunmalı; her boş profil hesabı kesin geçersiz sayılmamalı.

**Kabul:** Minimal profili reddedip desteklenen fuller profili kabul eden fixture tamamlanır; koruma/429 ve açık auth reddinde denemeler devam etmez.

### M09 — 90 saniye bütçe fiilen aşılabiliyor

**Kod:** [overBudget](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1427), [profil döngüsü kontrolü](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1477), `handshakeAttempt` iç varyantları.

Sahte saatle her istek 20 sn sürerken 8 istek/160 sn gerçekleşti; kontrol varyantların arasında ortak deadline kullanmıyor. “90 sn'de biter” doğru bir garanti değil.

**Öneri/kabul:** Deadline her bekleme/istek/variant öncesinde denetlenmeli, timeout kalan süreden uzun olmamalı; bütçe bittiğinde açık süre-limit sonucu ve gerçek abort. Test ileri saat ve uzun native/RN istekleriyle yapılmalı.

### M10–M12 — Tekli MAC ekranı, port ve ilerleme

**M10 kaynak:** [snapshot yükleme state yazımı](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1563), [850 ms poll](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1586), [MAC modal](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:3594). Ref varsayılanı `bulkImportOwnedByScreenRef=false`. Eski completed import, normal MAG loading'ini false yapabiliyor. PanelScan terminal snapshot için de benzer mekanizma fixture'da görüldü; telefonda PanelScan snapshot bulunmadı, completed BulkImport bulundu.

**M10 çözüm/kabul:** MAG, panel scan ve native import ayrı işlem kimliğiyle state yayınlamalı. Eski completed import/scan + yeni tekli MAG kombinasyonunda modal açık kalmalı, yeni işlemin ilerlemesi ezilmemeli, ikinci submit engellenmeli. Eski sonuçların kullanıcıya gösterilmesi özelliği korunmalı.

**M11 kaynak:** [port kontrolü](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2635). `new URL('http://example.test:80/c').port` ve HTTPS:443 boş; :2095 korunur. Bulk parser ham explicit port bilgisini zaten taşıyor; tekli giriş de aynı sözleşmeyi kullanmalı.

**M11 kabul:** :80/:443 kullanıcı girdisi portsuz kabul edilmez; given path/port seçilen kapsama göre korunur.

**M12 kaynak:** [stLogin beklemesi](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2660). .10 `onProbe` yalnız discovery fallback'inde; login/profile adımlarına ilerleme callback'i yok. “Portal bulundu” metni kısa süre sonra sabit bağlanılıyor metniyle değişiyor.

**M12 kabul:** Keşif, handshake, profil, hesap bilgisi, canlı bootstrap ve enrichment ayrı aşamalar gösterilir. Portal bulundu ile hesap doğrulandı mesajları birbirine karışmaz.

## 6. Hesap alanları ve doğrulama ayrıntıları

### A01 — Base64 MAC yanlış eşleşme

**Kod:** [accountMatchesMac](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2054). Gösterim normalizer'ı base64 MAC çözerken doğrulayıcı ham değeri karşılaştırıyor.

Fixture: anlamlı profile/id/login + base64 MAC → `unverified/profile-mac-mismatch`; sonraki API doğrulaması yapılmadı. Çözüm ortak MAC normalizasyonu. Kabul: ham/büyük-küçük harf/ayraç/base64 aynı MAC eşleşir; gerçekten farklı MAC reddedilir.

### A02 — Snapshot başarı ve hesap sahipliği zayıf; terminal hata yutuluyor

**Kod:** [snapshot mainInfo](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2013), [refresh catch](C:/Projeler/kizilkan-player-elite/frontend/src/utils/refreshPlaylist.ts:372), [tekli catch](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2671).

Her nesne mainInfoOk sayılabiliyor. `{}` ve farklı MAC/login içeren yanıt fixture'da başarı/merge yoluna girdi. Bazı caller yorumları “terminal olmayan hata” dese de catch bütün hataları yutuyor; protection/rate-limit/iptal ayrımı korunmuyor.

**Öneri:** Yanıt şeması, anlamlı alan ve mevcut hesabın kimliği/oturumu doğrulanmalı. Eksik MAC'li ama protokolde geçerli yanıtta doğrulama kanıtı açık tanımlanmalı; keyfi zorunlu alanla çalışan klonlar bozulmamalı. Terminal hata typed olarak caller'a taşınmalı.

**Kabul:** Yanlış MAC'in bilgisi yazılmaz; `{}` otoriter başarı sayılmaz; terminal CAPTCHA/429 sonrasında katalog isteği başlamaz; sıradan desteklenmeyen info API'si güvenilir profil bilgisini silmez.

### A03–A04 — Kullanıcı adı, abone adı ve hesap numarası

**Kod:** [normalizer](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1934), [yeni aday zinciri](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1954), [kart](<C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1899>), [create_link](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2887).

Doğrulanan durumlar:

1. Flat password + nested `account_info.login` → username yok, password var. Snapshot mainInfoOk=true olsa da nested login kayboluyor.
2. .10 fname-only yanıt → kişinin adı username oluyor. Sunucu kaynağında fname/full name, ls/account number ve login ayrıdır.
3. Base64 MAC login, çözülmeden aday filtresinden geçiyor; çözülünce MAC username hâline geliyor.
4. .9 aday zincirindeki `account_number`, .10 zincirinde kaldırılmış. Bu alanı kullanan önceki davranış kaybolabilir; ancak hesap numarası da doğrudan gerçek giriş adı kabul edilmemeli, anlamı ayrı tutulmalı.
5. Kart `acc.username || acc.mac || '—'` gösteriyor; mevcut kayıt otomatik olarak yeni normalizer'la yeniden işlenmiyor. Normalizer değişikliği eski metadata'yı tek başına düzeltmez.
6. `create_link` yalnız oynatma URL'si çıkarıyor; hesap alanlarını güncellemiyor. IPTV Extreme'in URL'den kullanıcı adı alması mümkün ama kanıtlanmadı. Her URL parçası credential değildir; token/signature karıştırılmamalı.

**Öneri:** `loginUsername`, `subscriberName`, `accountNumber` gibi anlamlar ve kaynak/provenance ayrılmalı; mevcut AccountInfo tüketicileriyle uyum korunmalı. Desteklenen nested zarflar işlenmeli; çözümleme filtrelemeden önce yapılmalı. Gerekirse mevcut kayıt için güvenilir API yenileme yolu sağlanmalı.

**Kabul:** Flat/nested gerçek login korunur; kişi adı ayrı etiketlenir; MAC kullanıcı adı olmaz; eski kayıt yeni veriye kontrollü uzlaşır; logda kullanıcı adı/parola değerleri açılmaz.

### A05 — Telefonun bitiş tarihine dönüşmesi

**Kod:** [phoneIsExpiry](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1944).

Genel epoch parser telefon üzerinde uygulanıyor. Fixture `905551234567` telefonunu 1998 civarı bitiş olarak yorumladı, telefon alanını kaldırdı. Bazı gerçek portallar phone'da tarih döndürüyor; bu mevcut uyumluluk korunurken sayısal telefon epoch kabul edilmemeli.

**Kabul:** Açık tarih metni phone fallback'iyle desteklenir; sayısal/ülke kodlu telefon telefon olarak kalır; kart/TXT/sıralama aynı bitiş sonucunu kullanır.

### A06 — Güncel bitiş eski alias tarafından gölgeleniyor

**Kod:** [refresh merge](C:/Projeler/kizilkan-player-elite/frontend/src/utils/refreshPlaylist.ts:367), [accountExpiryMs önceliği](C:/Projeler/kizilkan-player-elite/frontend/src/utils/accountExpiry.ts:76).

Eski exp_date, yeni tariff_expired_date gelirken korunuyor; gösterim exp_date'i önce okuyor. Fixture: eski 2020/new 2030 → gösterim 2020.

**Öneri/kabul:** Yeni güvenilir bitiş bütün gösterim yollarında otoriter olmalı; eski alias aynı tarihe uzlaştırılmalı veya kaynak bilgisiyle düşürülmeli. Refresh sonrası kart/TXT/sıralama 2030 göstermeli; yeni yanıt bitiş bildirmiyorsa eski güvenilir bilgi korunmalı.

### A07–A08 — Protokole özgü durum ve ikinci auth adımı

**Kod:** `accountDenial`, `normalizeStalkerAccountInfo`, [kart durumu](<C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1869>), [StalkerCreds](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:57).

- Bir Stalker sunucu varyantında status=1 kapalıdır; bizim kart 1'i aktif kabul edebiliyor. Xtream için sayısal 1 başka anlam taşıyabilir; global “1 daima kapalı” düzeltmesi yapılmamalı.
- Fixture `{id:17,status:2,msg:'login required'}` → profile mevcut/profileError=false; do_auth çağrısı yok. Infomir login/password erişimini destekliyor; gerçek istemci status2 → do_auth → ikinci profil akışı uygular.

**Kabul:** String/numeric 0/1/2 ve açık active/enabled/blocked alanları kaynak türüne uygun yorumlanır; bilinmeyen aktif diye boyanmaz. Login-required profil başarısız/eksik auth sonucu olarak gösterilir; yalnız kullanıcının sağladığı bilgilerle ikinci giriş yapılır. Telefonda status2 kanıtı görülmedi.

## 7. Katalog, iptal ve profil bütünlüğü

### C01 — Eksik pagination normal başarıya dönüşüyor

**Kod:** [parallel pagination](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2391), [PAGE_ERROR](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2405), normal partial return, [enrichment diagnostics](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2768), [refresh hata kontrolü](C:/Projeler/kizilkan-player-elite/frontend/src/utils/refreshPlaylist.ts:435).

Fixture sonuçları:

- 40 öğelik katalogda sayfa 4 HTTP500 → **16/40** öğe normal döndü.
- Sayfa 3 HTTP429 → **6/40** öğe normal döndü; paralel parti nedeniyle 0..8 sayfa istekleri zaten başlatılmıştı.
- Dolu partial sonuç VOD için OK/warnings boş olabiliyor. Refresh yalnız diagnostics.ERROR aradığından tam katalog eksikle değişebilir. Kind delivery yolunda da aynı sonuç sözleşmesi önemlidir.

**Öneri:** Tam, kısmi, desteklenmeyen, korumalı, iptal ve gerçek boş sonuçlar ortak typed sözleşme olmalı. Bu bilgi pagination → catalog/enrichment → tekli/bulk/refresh → Room commit boyunca korunmalı. Partial tür tam replacement sayılmamalı; mevcut sağlam katalog silinmemeli. 429/protection sonraki parti/tür isteklerini durdurmalı.

**Kabul:** HTTP500/429/CAPTCHA örneklerinde incomplete nedeni görünür; tam katalog korunur; hata başarılı boş sayılmaz. Gerçek boş katalog ise doğru sıfırla commit edilebilir.

### C02 — Kısmi sayfa fingerprint'i gerçek farklılığı kaçırıyor

**Kod:** [pageFingerprint](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2265).

Yalnız ilk 8 ve son 3 ID kullanılıyor. Fixture'da ortadaki 3 öğe farklı olduğu hâlde sayfa duplicate kabul edildi; 14 öğe sonrası DUPLICATE_PAGE/OK ile durdu.

**Öneri/kabul:** Bütün sayfanın güvenilir kimlik/order özeti kullanılmalı. İlk/son aynı, orta farklı iki sayfa ayrı kabul edilmeli; gerçekten aynı sayfa ve pagination döngüsü tespiti korunmalı.

### C03 — Bulk iptali kalıcı pending/enriching bırakabiliyor

**Kod:** [bootstrap sonrası](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:340), [enrichment sonrası](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:352), [catch terminal patch](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:368), [freshness skip](C:/Projeler/kizilkan-player-elite/frontend/src/store/PlaylistContext.tsx:1033).

Başarıyla çözülen await sonrasında abort görülüp break olunca catch'e girilmiyor; kayıt pending/enriching kalabiliyor. Fixture bunu doğruladı. Freshness bu durumları devam eden iş sanıp atlıyor.

**Öneri/kabul:** Oluşturulan liste için bütün bitiş yolları terminal durumu uzlaştırmalı; gerçekten çalışan yeni işin state'i eski finally tarafından ezilmemeli. Bootstrap/enrichment öncesi-sonrası iptal ve ekran kapanması test edilmeli. Başarılı canlı veri korunmalı, eksik türler yeniden denenebilmeli.

### C04 — Tekli enrichment hatası tam başarı yazıyor

**Kod:** [stalkerEnrichment caller](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2717).

Caller enrichment diagnostics.ERROR'i değerlendirmeden boş/eksik dizileri yazıp ready/başarılı refresh alanlarını güncelleyebiliyor. Gerçek submit callback fixture'ında doğrulandı.

**Öneri/kabul:** C01 sözleşmesini burada da kullan. Live-ready hesap korunur; başarısız VOD/Series partial_error olur; veri yok ile başarılı boş ayrılır. Yalnız başarılı tür güncellenir.

### D01 — Kuyrukta bekleyen addPlaylist yanlış profil deposuna yazabiliyor

**Kod:** [addPlaylist](C:/Projeler/kizilkan-player-elite/frontend/src/store/PlaylistContext.tsx:698), [runExclusive](C:/Projeler/kizilkan-player-elite/frontend/src/store/PlaylistContext.tsx:600).

Profil sahibi katalog kilidinden sonra alınabiliyor. Fixture: A'da başlayan iş kilitte beklerken B'ye geçildi → ağır veri/metadata B'ye yazılabildi. A→B→A için yalnız profil string ID kontrolü eski A işini yeni A oturumundan ayıramıyor.

**Öneri:** İşin girişinde profil ID + oturum/generation kimliği yakalanmalı; kilit bekleme, ağır Room yazımı, meta commit ve UI yayını öncesi-sonrası doğrulanmalı. Girişte ID yakalamak tek başına A→B→A durumunu çözmez.

**Kabul:** Kilit tutuluyken A→B ve A→B→A senaryolarında eski iş hiçbir yeni oturum deposuna/state'ine yazmaz; restore drainer ve Room kanonik mimari korunur.

**Önceki devir düzeltmesi:** `GPT-v18.7.4-MAC-PLAYER-RAPORU.md` içinde bu sahiplik düzeltmesinin uygulandığı yazıyor. Güncel kaynak/fixture bunu doğrulamıyor. Opus eski rapor cümlesini tamamlanma kanıtı saymamalı.

## 8. Player ve zaman kaydırma ayrıntıları

### P01 — Motor kurtarması tanı/depolama kuyruğuna bağımlı

**Zincir:** [switchProfile await](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:1619) → [recordEngineFailure](C:/Projeler/kizilkan-player-elite/frontend/src/player/v2/memo.ts:43) → [await recordDiagnostic](C:/Projeler/kizilkan-player-elite/frontend/src/player/v2/memo.ts:53) → [global writeQueue](C:/Projeler/kizilkan-player-elite/frontend/src/utils/diagnostics.ts:455) → [kuyruğun bitmesini bekleme](C:/Projeler/kizilkan-player-elite/frontend/src/utils/diagnostics.ts:477).

Kuyruk native append, sampled journal, JS cache ve kritik olayda AsyncStorage flush içeriyor. Katalog HTTP/wire/page kayıtları aynı kuyruğu kullanıyor. Süre sınırı yok.

Actual production + AST fixture: ENGINE_ERROR kaydı deferred iken fallback Promise tamamlanmadı, transitioningSession kilitli kaldı, profil Media3'te kaldı, kurtarma mesajı/pause/detach çağrısı oluşmadı. Gate serbest bırakılıp sahiplik değiştiğinde stale-owner koruması çalıştı.

**Öneri:** Oynatma kurtarması için gereken anlık karar/state güncellemesi hızlı tutulmalı. Tanı kalıcılığı bağımsız güvenilir kuyrukta sürmeli. Sahiplik kontrolleri ve engine memo davranışı korunmalı; yalnız hata takibini kapatmak çözüm değildir.

**Kabul:** Tanı kuyruğu bilerek bekletilirken motor değişimi ve kullanıcıya kurtarma durumu ilerler; sonradan log kalıcı olur. Eski iş yeni kanala motor değiştiremez. Kuyruk yaşı/uzunluğu ve fallback aşama süreleri gizli bilgi içermeden ölçülür.

### P02 — Taze çözümleme başlamadan eski token yeni motora gidebiliyor

**Kod:** [currentStalkerKey](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:958), [refresh nonce ve switch](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:1643), çözümleme effect'i.

Anahtar yalnız playlist/channel/raw cmd içeriyor. Nonce artıp motor değiştiğinde ilk render'da resolved key hâlâ eşleşebiliyor; eski resolved state ancak effect aşamasında temizleniyor. Actual-source fixture yeni MPV profili + forceFresh + eski URL için nativeRenderReady=true üretti. Native MPV source prop'u URL'yi yükleyebiliyor.

**Öneri/kabul:** Kanal, oturum, motor/resolve nesli ve URL sahipliği tek sözleşmeyle eşleşmeli. Yeni motor ilk render'da eski URL almamalı; yalnız yeni çözümlemenin sahibi native kaynağı açabilmeli. Media3→MPV/VLC, retry ve kanal değişimi test edilmeli.

### P03 — Geçici create_link URL önbelleği

**Kod:** [8 sn TTL](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:228), [reuse](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2950).

Actual-module fake-clock fixture: mint sonrası +6000 ms aynı cmd → createLinkCalls=1, aynı URL, cache hit. Sunucu kaynağında 5 sn varsayılan geçici link ve 3 sn Xtream hash dalı var; her portal için aynı TTL iddia edilmez.

**Öneri/kabul:** Geçici tamamlanmış URL'yi kör tekrar kullanma; aynı anda gelen aynı oturum isteğini birleştir veya sağlayıcının kanıtlanmış süresine uy. Motor değişimi ve forceFresh kesin yeni bağlantı üretmeli. Cache yaşı ile HTTP hatası korelasyonu ölçülmeli; HTTP444'ün kesin kökü olarak sunulmamalı.

### P04 — İlk kare ölçümü oturuma bağlanmalı

**Kod:** [source timestamp](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:2764), [FIRST_FRAME ölçümü](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:4098).

Zaman replaceAsync sonrasında atanıyor; ilk değer/reset ve oturum sahipliği ölçümde açık değil. Expo native replaceAsync, oynanabilir ağ verisini/ilk kareyi beklemenin eşdeğeri değildir. Önceki kaynağın timestamp'i veya hazırlık çağrısından sonraki timestamp yanlış yorumlanabilir.

**Öneri/kabul:** Seçim, resolve başlangıç/bitiş, native source submit, sourceLoad/ready ve gerçek firstFrame ayrı ölçülsün. Kaynak/oturum değişiminde ölçüm resetlensin. Başarısız oturum için başarılı TTFB üretilmesin; Media3/MPV/VLC ölçümleri tanımlı ve karşılaştırılabilir olsun.

### P05 — Timeshift seçiminin yüklenmesi ve uygulanması

**Kod:** [Ayarlar varsayılanı/yükleme](<C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:63>), [PlayerHost yükleme](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:1037), [onPause arm](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:3252), [tampon](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:1582).

UI başlangıçta onPause gösterip async okuma sonunda off'a geçebilir; ilk görünüm kaydedilmiş tercih kanıtı değildir. Normal seçim storage başarı sonrası UI'ye uygulanır; sessiz reset kanıtı bulunmadı. PlayerHost yeni sahiplik/oturumda yeniden okur; aynı açık kaynakta dış ayar değişikliğini anlık ileten abonelik yok.

**Öneri/kabul:** Ayar yükleme/uygulanma durumu net olsun; değişikliğin mevcut veya sonraki oturumda uygulanacağı tutarlı tanımlansın. onPause kanal açılışında recorder başlatmamalı; oynarken duraklatınca doğrudan upstream kapanıp tek recorder başlamalı; devam yerel tamponu oynatmalı. off hiçbir recorder açmamalı. always için tek upstream ve ilk kare süresi ayrıca ölçülmeli.

## 9. Native taşıma, gözlem ve test açıkları

### N01 — Proxy gzip çözümlemesi

**Kod:** [gzip başlığı](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:652), direct exact başlık çıkarma, proxy iletme, [ScanProxyPool body okuma](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:797).

HttpURLConnection'da Accept-Encoding elle verilince otomatik decompression kapanır. Proxy ham gzip'i UTF-8 olarak okuyabilir. Direct native mevcut manuel gzip açma yolu farklıdır. Cihazdaki ilgili bulk koşul proxy=false olduğundan mevcut 49/0 olayının nedeni bu değildir.

**Kabul:** Plain/gzip gerçek byte fixture'ları direct/proxy aynı JSON'u verir; decoded limit, abort, 429 ve koruma davranışı korunur. Plain JSON stub tek başına yeterli test değildir.

### N02 — Body limit native okuma sırasında uygulanmıyor

**Kod:** [body.bytes](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt:238), [GZIP readBytes](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt:242), JS req/native exact yolu.

Hesap snapshot'ı 256 KiB sınır istese de normal native taşıma bütün yanıtı/açılmış gzip'i belleğe ve bridge'e aldıktan sonra JS sınıra bakabiliyor.

**Öneri/kabul:** İlgili native API'ye opt-in byte sınırı/iptal sözleşmesi taşı; büyük kataloglar için gereken ayrı kontrollü davranış korunmalı. Sıkıştırılmış ve decoded byte sınırları stream sırasında uygulanmalı. Büyük body/gzip expansion testinde sınırdan sonra okumaya devam edilmemeli.

### N03 — PCAP başlık telemetrisi gerçek ağ isteği değil

**Kod:** [response.request header ölçümü](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt:255), [parity kontrolü](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:852).

Kullanılan OkHttp 4.12 BridgeInterceptor otomatik Host/Connection gibi başlıkları ekler; response'ta userRequest tutulabilir. `r.request` üzerinden ölçüm gerçek final wire header setini temsil etmiyor. Gerçekte Connection gönderilirken eksik görünmesi mümkün.

**Öneri/kabul:** Network interceptor/EventListener seviyesinde yalnız güvenli başlık adları/şekil/fingerprint ölç. Cookie/token değerleri loglanmasın. Wire parity teşhisinde kaynak ve gözlenen veri ayrı olsun. Bu doğrudan bağlantı hatası değil, yanlış teşhis riskidir.

### T01 — Mevcut PASS yeni fallback davranışını kapsamıyor

**Kod:** `tools/test-mag-bulk-runtime.js`, `tools/test-mag-portal-discovery.js` ve yeni release kontrolü.

Bulk test sahtesinde yeni `discoverMagPortal` yok; undefined çağrı yeni catch tarafından yutulunca testler fallback'i çalıştırmadan PASS olabilir. version.js testi bütün PHP'ler 404 iken seçilebilir API bekliyorsa yanlış davranışı doğru oracle olarak sabitler. Release regex kontrolü runtime protokol doğrulaması değildir.

**Öneri/kabul:** Gerçek orkestrasyon import sözleşmesiyle test et. Yeni fonksiyonun gerçekten çağrıldığını, sonucu ve scope/protection/first-MAC davranışlarını ölç. Olmayan stub fonksiyon sessiz geçmemeli. Yanlış version.js beklentisi düzeltilmeli; assertions kaldırılarak test geçirilmeye çalışılmamalı.

### T02 — Güvenli varlık bayrakları redacted

**Kod:** [sensitive regex](C:/Projeler/kizilkan-player-elite/frontend/src/utils/diagnostics.ts:82), [sanitizeValue](C:/Projeler/kizilkan-player-elite/frontend/src/utils/diagnostics.ts:243), [snapshot telemetrisi](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2024).

hasUsername/hasPassword anahtarları sensitive eşleşiyor fakat safe suffix kuralına uymuyor. Cihazda her ikisi `[REDACTED]` olarak doğrulandı.

**Öneri/kabul:** usernamePresent/passwordPresent gibi yalnız boolean metadata veya dar tip kontrollü istisna kullan. Gerçek username/password/mac/cookie/token hassas kalmalı. Field-path, değer türü, boş/dolu ve normalize sonucu değer açmadan ölçülebilmeli.

## 10. Korunacak mimari ve ürün davranışı

1. Kalıcı PlayerHost, Stack dışındaki mevcut yaşam döngüsüyle korunmalı.
2. Room kanonik katalog deposudur. Native modda JS `channels/vod/series=[]` gerçek boş içerik kanıtı değildir.
3. MAG live-first korunmalı; VOD/Series arka planda ve tür bazında işlenmeli.
4. Timeshift/player aynı yayın için iki upstream açmamalı. Duraklatma/recorder geçişi kaynak sahipliğiyle yapılmalı.
5. Profil/restore/drainer/commit sözleşmeleri korunmalı; katalog kilidi yeni profil yazımı için izin sayılmamalı.
6. Kullanıcının supplied MAC'leri kullanılmalı; kapsam port/path çarpımına geri dönmemeli.
7. Koruma gördüğünde doğru sonuç ve durdurma uygulanmalı. CAPTCHA/WAF atlatma veya ban bağışıklığı vaadi eklenmemeli.
8. “Koruma görülmedi” yalnız o anda endpoint/bağlantı gözlemidir. Belirsiz durum korumasız sayılmamalı; CDN veya genel 403 tek başına koruma kanıtı değildir.
9. TLS doğrulaması kapatılmamalı; verilen referans MD'deki her yaklaşım aynen taşınmamalı.
10. Uygulama kaldırma/pm clear/veri silme kabul yöntemi olmamalı; mevcut DEV verileri korunmalı.

## 11. Kullanıcının önceki talepleri için yeniden kabul listesi

Bu bölüm yeni kanıtlanmış bug listesi değildir. Önceki geliştirmeler ve kullanıcı talepleri sonraki sürümde yeniden doğrulanmalıdır. Tarihî raporlar: [genel tespitler](C:/Projeler/kizilkan-player-elite/GPT-TESPIT-VE-ONERILER.md), [önceki Opus devri](C:/Projeler/kizilkan-player-elite/GPT-OPUS-GUNCELLEME-DEVRI.md).

| Talep | Sonraki sürümde kabul senaryosu |
|---|---|
| Girilen yol / çalışmazsa diğerleri / tümü | Aynı girdiyle üç modun gerçek istek planı doğrulansın; hız modu kapsamı değiştirmesin. |
| Önce portal, sonra hesaplar | Port/path keşfi host başına; kullanıcı/otomatik endpoint seçimi; MAC doğrulaması yalnız seçilen endpoint'te. Koruma ve eksik keşif ayrı. |
| Koruma filtreleri/seçimi | Görülmedi/görüldü/belirsiz ayrımı; “koruma görülmeyen geçerlileri seç” yalnız gerçekten doğrulanmış hesapları seçsin. |
| Tüm/istenen hesapları playlist'e ekleme | Aynı endpoint+MAC için doğru seçim; farklı portal aynı MAC ayrı; geçersiz/unverified playlist shell başarı sayılmasın. |
| TXT kaydı ve kategori bilgileri | Hesap, bitiş, koruma ve canlı/VOD/Series kategori özetleri; desteklenmiyor/alınamadı/başarılı boş ayrımı; gerçek native dosya sonucu ve kısmi hata. |
| Uzun MAC yapıştırma | Giriş alanı bounded yükseklikte; içeride kaydırma; klavye ve telefon/TV odak davranışı; sonuç listesi aşırı büyümesin. |
| Hesap kartı bitişi | Kart/tarama/TXT/sıralama aynı expiry; bilinmiyor/sınırsız/süresi dolmuş ayrımı; telefon sayısı tarih olmasın. |
| Seçmeli playlist restore | Önizleme/hepsi/seçililer; seçilmeyen liste/profil/kişisel kayıt/Room korunmalı; hata/iptal/process restart tutarlı olsun. |
| Gerçek sıfır içerik sayısı | Doğrulanmış Room sayısı 0 ise kart 0; eski pozitif metadata geri gelmesin. JS boş dizisi sağlam Room'u sıfırlamasın. |
| Boş kabuk | Sağlıklı boş, henüz indirilmemiş, eksik Room ve partial_error ayrılmalı; seçince sahte pozitif içerik veya sonsuz repair olmasın. |

Bu son oturumda bütün restore/TXT/TV senaryoları cihazda yeniden çalıştırılmadı; “tamamı düzeldi” etiketi verilmemelidir.

## 12. Önerilen uygulama sırası

### Aşama 1 — Yanlış state/yazım ve motor gecikmesini önle

M10, D01, P01, P02, C01, C03, C04 önce ele alınmalı. Ortak işlem/oturum sahipliği ve tam/kısmi/terminal sonuç sözleşmesi kurulmalı. Aynı hatayı tekli/bulk/refresh/enrichment'te birbirinden kopuk catch yamalarıyla çözmekten kaçınılmalı.

### Aşama 2 — Kapsamı koruyan MAC bağlantı akışı

M01–M09, M11; A01–A02. Tek endpoint planı, explicit port/path, gerçek kapsam, süre bütçesi ve terminal koruma akışı. Pasif aday ipucu ile gerçek API/hesap kanıtı ayrı. Kullanıcı seçiminden sonra tekli/bulk doğrulaması aynı uyumluluk mantığını kullanmalı.

### Aşama 3 — Hesap alanı, tarih, durum ve taşıma

A03–A08, N01–N03, T02. Bilgiler kaynak anlamıyla ayrıştırılmalı; kullanıcı adı olmayan değer kullanıcı adı etiketiyle doldurulmamalı. Gzip/body limit/test byte'ları gerçek olmalı.

### Aşama 4 — Oynatma kaynağı ömrü, ölçüm, UX ve kabul

P03–P05, M12, T01 ve önceki ürün kabul listesi. Başarılı ilk kare ile başarısız hazırlık ayrı ölçülmeli. DEV/telefon ve gerektiğinde TV'de gerçek kullanım kanıtı toplanmalı.

Bu sıra tek sürümde uygulanabilecek iş planıdır; bütün senaryolar test edilmeden “hatasız tek build” garantisi değildir. Kullanıcı yetkisi ve güncel görev kapsamı Opus tarafından kendi oturumunda korunmalıdır.

## 13. Regresyon ve cihaz kabul matrisi

| Test | Girdi / hata enjeksiyonu | Beklenen sonuç |
|---|---|---|
| R01 | Literal tenant PHP, explicit port, exact, limit 1 | Tek endpoint; kapsam dışı istek yok. |
| R02 | http:80 / https:443 açık port | Portsuz sayılmaz; tercih korunur. |
| R03 | Pasif CAPTCHA/WAF/429 | Fallback/account çağrısı yok; typed terminal sonuç. |
| R04 | Anonim js:null; supplied MAC + JsHttpRequest token verir | Tekli/bulk aynı kontrollü sonuç. |
| R05 | İlk MAC başarısız, ikinci çalışır; sıra ters çevrilir | Sonuç kümesi değişmez; host negatif cache oluşmaz. |
| R06 | version.js marker; bütün PHP'ler 404 | API200/ready üretilmez. |
| R07 | Gerçek API aday planında geç sırada / unknown port | Bulunur veya incomplete discovery açık gösterilir. |
| R08 | Token başarılı, minimal profil boş, supported fuller profil çalışır | Kontrollü uyumluluk; boş profil sahte başarı değildir. |
| R09 | Ham/base64 MAC; başka MAC; boş main-info | Doğru eşleşme; başka hesap verisi merge edilmez; boş yanıt otoriter değil. |
| R10 | Flat/nested login; fname-only; base64 MAC login | Gerçek login korunur; isim/numara/MAC ayrı. |
| R11 | Sayısal telefon; phone açık tarih; eski/new expiry alias | Telefon ve tarih doğru; güncel tarih gösterilir. |
| R12 | Kaynak türüne göre status0/1/2, string varyantları | Active/inactive/login-required/bilinmeyen doğru. |
| R13 | Pagination sayfa500/429/CAPTCHA; eski tam Room katalogu | Eksik/terminal korunur; tam veri silinmez; sonraki parti/tür durur. |
| R14 | İlk8/son3 aynı, orta ID'ler farklı iki sayfa | İkinci sayfa duplicate sayılmaz. |
| R15 | Bootstrap/enrichment await öncesi/sonrası abort | Kalıcı in-progress kalmaz; yeni iş state'i ezilmez. |
| R16 | Katalog kilidi tutuluyken profil A→B / A→B→A | Eski iş yeni profil/oturuma yazmaz. |
| R17 | Eski completed native import + yeni tekli MAG | Modal/progress sahipliği korunur; çift submit olmaz. |
| R18 | Tanı kuyruğu uzun süre bekletilir | Motor kurtarması ilerler; log sonra yazılır. |
| R19 | Media3→MPV/VLC, forced resolve geciktirilir | Yeni motor eski token/URL'yi almaz. |
| R20 | Geçici URL 3/5 sn; aynı kanala 6 sn sonra dönüş | Eski link kör kullanılmaz; gerekiyorsa yeni mint. |
| R21 | Gerçek gzip byte'ları, büyük decoded body, abort | Direct/proxy parse eşdeğer; sınır native okurken uygulanır. |
| R22 | off/onPause/always; kanal değişimi; geç prepare sonucu | Tek upstream; onPause'da pause öncesi recorder yok; eski prepare yeni kanalı açmaz. |
| R23 | Kanal1 başarısız → Kanal2 başarılı, motor geçişi | FirstFrame ölçümü doğru oturumun süreleriyle. |
| R24 | TXT/seçim/restore/0 içerik/boş kabuk | Bölüm11 kabul listesi geçer; gerçek dosya ve Room sayımı kullanılır. |

### Mevcut incelemede geçen kontroller

| Kontrol | Sonuç |
|---|---|
| `node tools/test-mag-bulk-runtime.js` | 10 grup PASS |
| `node tools/test-mag-portal-discovery.js` | 16 grup PASS |
| `node tools/test-mag-account-validation.js` | 9 grup PASS |
| `node tools/test-mag-action-ownership.js` | 2 grup PASS |
| `node tools/test-player-regressions.js` | 13 grup PASS |
| `node tools/test-timeshift-onpause-ownership.js` | 16 grup PASS |
| Toplam | **66 grup PASS** |
| `node tools/check-v18710-release.js` | PASS; ağırlıkla statik yapı/sürüm kontrolü |
| `frontend` içinde TypeScript `--noEmit --incremental false` | exit0 |
| `git diff --check` | Temiz |

Bunlar düzeltme sonrası yeni sonuçlar değildir; inceleme anındaki mevcut kodun sonuçlarıdır. Üretim fonksiyonlarıyla yapılan ek karşı örnekler tabloda anlatılan açıkları ortaya çıkardı. Dolayısıyla 66 PASS, bu açıkların çözüldüğü veya gerçek portal/cihaz kabulünün tamamlandığı anlamına gelmez. Genel `tools/denetle.js`, yeni Android build ve yeni telefon kabulü bu salt okunur incelemede yapılmadı. Opus değişikliklerinden sonra gereken kontroller yeniden çalıştırılmalıdır.

## 14. Araştırma kaynakları ve uygulanma sınırları

1. [Infomir — login/password portal erişimi](https://wiki.infomir.eu/eng/ministra-tv-platform/ministra-installation-guide/faq/how-to-organize-the-access-to-the-portal-by-login-and-password): desteklenen ikinci auth biçimi. Her klon için birebir protokol garantisi değildir.
2. [Kodi pvr.stalker — gerçek STB istemci parametreleri](https://github.com/kodi-pvr/pvr.stalker/blob/Piers/lib/libstalkerclient/stb.c): profile ve do_auth alanları.
3. [IPTVnator — Stalker auth akışı](https://github.com/4gray/iptvnator/blob/master/libs/portal/stalker/data-access/src/lib/stalker-auth.api.ts): nested account_info, status2, do_auth ve ikinci profil. IPTV Extreme'in iç implementasyonuna kanıt değildir.
4. [Stalker sunucu varyantı — AccountInfo](https://github.com/iptvhakr/stalker_portal/blob/master/server/lib/accountinfo.class.php): fname/full name, ls/account number, login ayrımı; getMainInfo login/password garanti etmiyor. Bu kaynak tüm sağlayıcılar için tek standart sayılmamalı.
5. [Stalker sunucu varyantı — Itv](https://github.com/iptvhakr/stalker_portal/blob/master/server/lib/itv.class.php): varsayılan 5 sn temporary link ve 3 sn hash dalı; bağlı portalın gerçek TTL'si ayrıca bilinmeli.
6. [Stalker launcher_profile](https://github.com/iptvhakr/stalker_portal/blob/master/server/api/launcher_profile.php): status1 off davranışı; Xtream durum kodlarına genellenmemeli.
7. [Android HttpURLConnection](https://developer.android.com/reference/java/net/HttpURLConnection.html): elle Accept-Encoding verilince otomatik decompression kapanır; streaming ve bağlantı davranışı.
8. [OkHttp 4.12 BridgeInterceptor](https://github.com/square/okhttp/blob/parent-4.12.0/okhttp/src/main/kotlin/okhttp3/internal/http/BridgeInterceptor.kt): otomatik başlıklar ve response/userRequest ilişkisi.
9. [React Native networking](https://reactnative.dev/docs/network): global fetch redirect/cookie sınırlamaları.
10. [Expo SDK54 fetch](https://docs.expo.dev/versions/v54.0.0/sdk/expo/#expofetch-api): kurulu native streaming taşıma.
11. [Expo SDK54 video](https://docs.expo.dev/versions/v54.0.0/sdk/video/): source yükleme, replaceAsync ve first-frame olayları farklı aşamalardır.
12. [Infomir yönetim REST API](https://wiki.infomir.eu/eng/ministra-tv-platform/ministra-setup-guide/rest-api-v1): yönetim REST'i ile MAG client API aynı protokol değildir.

Kullanıcının gönderdiği `C:\Users\KIZILKAN YOGA\Downloads\Telegram Desktop\stalker_v24.md` önceki incelemede 2070 satır olarak okundu; çalıştırılmadı, paket kurulmadı. Pasif keşif/soft404 fikirleri yararlı; hesap doğrulaması yapmayan referans tek başına gerçek MAC başarı kanıtı değildir. TLS kapatma, sınırsız body, marka/catch-all üzerinden kesin başarı ve farklı origin/kurulum yolunu kör kabul etme aktarılmamalı.

## 15. Opus'un her güncellemede dolduracağı devir şablonu

Bu bölüm uygulama tamamlandı diye doldurulmuş bir kayıt değildir; sonraki değişikliklerin raporlama şablonudur.

### Güncelleme kimliği

- Tarih/saat:
- Başlangıç commit'i ve dal:
- Yeni sürüm / versionCode / release label:
- Bu güncellemede ele alınan bulgu ID'leri:
- Önceki kullanıcı özelliklerinin korunma durumu:

### Dosya bazında kayıt

| Dosya / fonksiyon | Önceki sorun | Yapılan değişiklik | Neden bu yaklaşım | Test / gerçek sonuç | Kalan risk veya cihaz kabulü |
|---|---|---|---|---|---|
| Doldurulacak | | | | | |

### Doğrulama ve dağıtım kaydı

- TypeScript sonucu ve komutu:
- Genel denetim sonucu ve başarısız/geçen kapılar:
- Yeni anlamlı runtime testleri ve yakaladığı karşı örnekler:
- Kotlin/native build sonucu; native değişmediyse açık belirt:
- APK dosyası, sürüm, build zamanı ve hash:
- Telefonun gerçek kurulu paket sürümü; kurulum sonrası doğrulama:
- Gerçek portal/cihaz kabulünde hangi Rxx senaryoları geçti:
- Ölçülen seçim→resolve→source→firstFrame süreleri ve motor:
- Commit/push edilen dal ve commit:
- Workflow adı, seçilen dal, manuel dispatch kimliği/URL ve gerçek tamamlanma sonucu:
- Tamamlanmayanlar ve nedenleri:

Kullanıcının önceki dağıtım tercihi ayrı dal ve manuel workflow tetiklemesidir. Bu raporun oluşturulması dağıtım işlemi değildir. Push/build/telefon kabulü sonuçları gerçekleşmeden başarılı diye yazılmamalıdır.

### Sonraki GPT yeniden incelemesine bırakılacak kanıt

1. Bu rapordaki her ID için `düzeltildi / ertelendi / uygulanamaz` ve gerekçe.
2. Değişen fonksiyonlar, yeni sonuç sözleşmeleri ve testlerin bulgu ID eşlemesi.
3. Özellikle exact/protection/ilk MAC, pagination partial, profil sahipliği, snapshot-modal ve tanı kuyruğu karşı örneklerinin sonuçları.
4. Kişisel veri içermeyen cihaz zaman çizgileri; portal/MAC/username/password/cookie/token değerleri paylaşılmamalı.
5. Çalışma ağacı, commit, sürüm ve telefondaki paket sürümü açık olmalı.

**Devretme özeti:** İlk hedef, mevcut davranışı doğru sınıflandırmak ve yanlış state/yazım/kurtarma bağımlılıklarını düzeltmek. Birkaç yeni endpoint eklemek veya alanı başka adla doldurmak bütün sorunların çözümü değildir. Kod ve cihaz kabulü tamamlanınca bu raporun ID'leri üzerinden yeniden inceleme yapılabilir.
