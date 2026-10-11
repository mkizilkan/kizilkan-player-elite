# GPT — Tarama sağlamlaştırma ve panel DNS planı değerlendirmesi

Tarih: 10.10.2026. İncelenen HEAD: `69ed0c1c19394fb05f9f9fc31c46efd9570cf712`, uygulama v18.7.29 RC1.

Bu belge değerlendirme ve öneridir. Uygulama kodu, sürüm, commit, push ve build değiştirilmedi. Bu incelemede gerçek hesaplarla yeni tarama veya cihaz testi yapılmadı. Aşağıdaki mevcut davranışlar kaynak kodundan doğrulandı; beklenen kazanımlar henüz cihazda ölçülmüş sonuç değildir.

## 1. Genel karar

Claude'ın önceliklendirmesi büyük ölçüde uygun: önce hata ayrımı, kalıcı yeniden deneme ve oynatım/test çakışmasının giderilmesi; sonra DNS seçimi, ölçüm ve hız iyileştirmeleri.

Ancak bazı özellikler olduğundan eksik gösterilmiş. Özellikle Xtream güncellemesinde güncel panel rehberinden otomatik adres çözümleme zaten var. MAC doğrulaması da küçük sayfaları önce deniyor. Bunlar yeniden yazılacak özellikler değil; mevcut davranış korunarak rafine edilmeli. Önceki GPT önerilerindeki bu geniş ifadeler de burada düzeltilmiştir.

## 2. On maddenin düzeltilmiş değerlendirmesi

| # | Koddan doğrulanan durum | Plan için sonuç |
|---|---|---|
| 1 | `serverCode.ts:274` içindeki JS `probeXtreamHost`, hataları ve reddi `null` olarak birleştiriyor. Native `PanelScanService.kt:648` de geçici hataları sonuçtan ayıramıyor. JS yalnız `auth=0/"0"` durumunu eliyor; eksik veya diğer olumsuz auth değerleri açık olumlu kanıt olmadan geçebiliyor. | Ortak sonuç sözleşmesi bütün JS/native tarama yollarına uygulanmalı. Geçerli sonuç açık olumlu auth kanıtı gerektirmeli. İptal, geçici hata ve koruma hesap reddinden ayrılmalı. |
| 2 | Native önbellek geçici hatayı artık kalıcı olumsuz sonuç olarak yazmıyor. Fakat `serverCode.ts:379,463` JS yollarında Promise önbelleği `null` ile sonuçlanan denemeyi aynı çalışma içinde yeniden kullanabiliyor. | "Geçici hata hiç önbelleğe alınmıyor" bütün yollar için doğru değil. Eşzamanlı isteği birleştirme ile tamamlanmış sonucu önbelleğe alma ayrılmalı. Sınırlı ikinci tur, geçici sonuçları yeniden fiziksel olarak denemeli. |
| 3 | Öğrenilmiş MAG uyumluluk profili mevcut. Katalog örneğini hangi API yöntemiyle doğruladığı ayrıca öğrenilmiyor. | Çalışan katalog yöntemini endpoint/panel kapsamında öğrenmek yararlı. Başka hesaba token/profil içeriği taşınmamalı; sadece yöntem tercihi öğrenilmeli. |
| 4 | Keşif bütçesi durma tanıları ve "bu kapsamda doğrulanamadı" açıklaması mevcut. | Tamamen yeni ayrım icat etmek yerine sonuç modeli/arayüz tutarlılığı ve belirsizlere kapsamı koruyan ikinci tur eklenmeli. |
| 5 | `stalker.ts:2437` önce canlı/film/dizi için `get_ordered_list` sayfa 0 ve 1'i dener. `get_all_channels` son yedektir. Yanıt sınırı 1 MiB; `.slice(0,128)` alım/parse sonrasındadır. | "Küçük sayfa önce yok" yanlış. Sorun büyük yanıt yedeğinin kontrollü okunması ve boyut aşımının açık hesap reddi sayılmamasıdır. Sınırı herkeste büyütmek OOM riski yaratır. |
| 6 | MAC host istek başlangıçlarında 650 ms aralık; native Xtream host başına dört izin mevcut. | Adaptif politika, sunucu sınırı/koruma geri bildirimine ve kullanıcı üst sınırına bağlı olmalı. Sadece düşük gecikmeye bakarak hız yükseltilmemeli. |
| 7 | Hesap doğrulaması ile gerçek ilk kare kanıtı ayrımı mevcut. | Çok kanallı kontrollü test ve kanıtın kalıcı saklanması geliştirme alanıdır. Bir kanalın başarısızlığı bütün hesabın başarısızlığı değildir. |
| 8 | Tek upstream oynatım ilkesi var; tarama ve testin aynı hesaba etkisi ayrıca düzenlenmeli. | Medya bağlantısı kilidi ile API istek denetimi ayrı ele alınmalı. Her API sorgusu aktif medya oturumu açmaz; yine de sağlayıcının oturum/istek sınırları gözetilmeli. |
| 9 | DNS adresleri için kalıcı playlist metadata alanları ve TXT çıktısı mevcut. TXT `accountArchive.ts:43` ve devamında `validatedHosts` yazar. | "Adres kalıcılığı hiç yok" doğru değil. Asıl eksikler kullanıcı seçiminin açık saklanması, bütün adresler için doğru doğrulama statüsü ve güncel görüntü kanıtının kalıcı birleşimidir. |
| 10 | MAG live-first ve native tarama journal/checkpoint altyapısı mevcut. | First-pass, ikinci tur ve tarama/katalog/test işlerinin ayrılması mevcut altyapı üzerine kurulmalı; baştan yeni kayıt sistemi yazılmamalı. |

Not: Metindeki "3'ü tamamen yeni (#1,#2,#3,#8)" ifadesinde dört numara var. Daha önemlisi, bu dört başlık da mevcut parçaların üzerine yapılan geliştirmelerdir; hepsini sıfırdan özellik olarak saymak doğru kapsam çıkarmaz.

## 3. Panel DNS isteğinde mevcut olanlar

### Xtream güncellemesinde güncel rehber failover zaten var

`refreshPlaylist.ts:112` altında `serverCodeBinding.autoResolve` açıksa `resolveBoundPanel` çağrılıyor. `serverCode.ts:542` işlevi kayıtlı kaynak/panel için `resolveHosts` ile uzak güncel adresleri okuyor, güncel adresleri önceliklendiriyor, ilk kimlik doğrulayanı seçiyor. Bu yol yalnız rehbere bağlı ve autoResolve açık playlistler için geçerli.

Dolayısıyla Claude'ın "yalnız saklı DNS listesinden çalışıyor, taze rehberden değil" açıklaması bu yol için yanlış. İkinci yedek yolu ayrıca saklı adresleri kullanıyor. Yeni plan, var olan rehber çözümlemesinin üzerine kullanıcı kapsamı, sağlık ölçümleri ve MAG bağını eklemeli.

### Doğrulanmış adres listesine denenmemiş adres karışabiliyor

`pickWorkingHost` ilk başarılı login'de döner (`serverCode.ts:115`). `resolveBoundPanel` ise dönüşte `hosts: ordered` verir (`serverCode.ts:590`): bu, sadece gerçekten doğrulanan adresler değil bütün sıralı adaylardır. `refreshPlaylist.ts:131` bunları `validatedHosts` alanına yazar.

Bu alanın anlamı "bu hesapla doğrulanmış adres" olduğundan sözleşme bozuluyor. Düzeltme, bütün adayları kaybetmeden aday listesi ile doğrulanmış listeyi ayırmalıdır.

### MAG'deki mevcut failover başka bir katmandır

`magHostFailover.ts` aynı hostname'in birden fazla IPv4 A kaydını çözerek yanıt veren IP'yi seçer. HTTP bağlantı sınırında pin yapar; HTTPS/SNI için aynı mekanizmayı uygulamaz. Bu, rehberdeki farklı portal hostname'leri arasında panel failover değildir.

`mag-bulk.tsx:238` rehberi okuyup panel hostlarını işe dönüştürür. Playlist eklerken doğrulanmış endpointlerden `stalkerBackupPortals` üretir (`:422`). İncelenen bu ekleme yolunda Xtream'deki gibi güncel rehbere bağlı panel çözümlemesini kuran bir kayıt yoktur. MAG yenileme kolunda da `resolveBoundPanel` eşdeğeri çağrı görülmüyor.

MAG entegrasyonu uygundur; fakat rehberden seçim ekranını bağlamak tek başına yeterli değildir. Panel kimliği/kaynak bağı, seçili adresler, izinli otomatik kapsam, portal port/path bilgisi ve doğrulama kanıtları kalıcı tutulmalıdır.

## 4. Kullanıcıya gösterilecek ölçümler

"DNS" burada panelin alternatif sunucu/portal adreslerini ifade eder. Aynı hostname'in çoklu IP kayıtları ayrı teknik katmandır.

| Ölçüm | Neyi kanıtlar? | Neyi kanıtlamaz? |
|---|---|---|
| TCP bağlantı süresi | İlgili host/porta bağlantı kurulabildiğini | Doğru portal, geçerli hesap veya çalışan yayın olduğunu |
| HTTP/API yanıt süresi | İlgili isteğin yanıtını ve gecikmesini | Tek başına hesap doğruluğunu veya ilk görüntü hızını |
| Hesap doğrulama | Girilen hesabın o endpointte API tarafından kabulünü | Bütün kanalların oynadığını |
| Katalog örneği | İzinli içerik örneğine erişilebildiğini | Gerçek görüntü geldiğini |
| İlk kare süresi | Test edilen yayının görüntü verdiğini ve başlangıç süresini | Bütün yayınların aynı performansta olduğunu |

`DnsManager.tsx:66` ve devamındaki ms, Xtream login veya MAG login+verify işleminin toplam süresidir; saf ping değildir. Mevcut MAG port sınıflandırması `magPortalDiscovery.ts:486` altında HTTP reachProbe kullanır. Bu kodun mevcut olduğunu "genel TCP ping bileşeni var" şeklinde anlatmak doğru değildir.

Arayüzde erişim süresi, hesap doğrulama süresi ve isteğe bağlı ilk kare süresi ayrı gösterilmeli. Ölçüm tarihi ve bağlantı türü tutulmalı; Wi-Fi/mobil ağ değişince eski hız sıralamasının güncelliği yeniden değerlendirilmeli. Ping yalnız aday önceliklendirmede kullanılmalı; otomatik birincil seçimin tek ölçütü olmamalı.

## 5. Önerilen panel DNS akışı

1. Rehber yüklenir; kullanıcı paneli seçer. Kaynak/panel kimliği ve tüm adresler gösterilir.
2. Hesap bilgisi gerektirmeyen sınırlı erişim ölçümü yapılır. Sonuçlar "erişilebilir / belirsiz / erişim başarısız" olarak gösterilir. Tek timeout kalıcı ölüm değildir.
3. Kullanıcı tümünü veya istediği adresleri seçer. Analiz sadece bu seçim ve seçilen port/path kapsamı üzerinde çalışır.
4. Seçilen adreslerde hesap ve katalog doğrulaması yapılır. İstenirse sınırlı, sıralı görüntü testi çalışır. Kanıtlar ve başarısızlık nedenleri ayrı tutulur.
5. Aday, seçili, doğrulanmış ve görüntü veren adresler ayrı durumlarla kalıcı kaydedilir. TXT ve playlist kartı aynı güncel kanıtı gösterir.
6. Güncellemede önce kullanıcının çalışan birincili korunur. Geçici hata için tekrar/bekleme, gerçek erişim kaybı için izinli alternatif doğrulama uygulanır.
7. Kullanıcının istediği otomatik rehber yenileme kapsamında yalnız bağlı panelin güvenilir kaynaklarındaki yeni adresler aday yapılır. Panel adı benzerliğinden farklı panele geçilmez.
8. Yeni endpoint hesabı doğruladıktan sonra katalog erişimi de kontrol edilir; tam güncelleme başarıyla kaydedilince birincil adres değiştirilir. Hata halinde önceki içerik ve adres korunur. Medya URL'leri/oturumlar yeni endpoint için yeniden çözülür.
9. MAG'de yeni endpoint için yeni handshake/session kurulur. Eski token başka hosta taşınmaz; kullanıcı port/path sınırı ve cihaz kimliği korunur.
10. Değişim nedeni, eski/yeni adres, zaman ve test kanıtı kayıt edilir; kullanıcı sonradan görebilir. Küçük hız farkında sürekli adres değiştirilmez.

Telefonun interneti kesilmişse bütün DNS'ler "ölü" işaretlenmemeli. Android bağlantı olayları ve doğrulanmış internet durumu izlenmeli. Android'in doğrulanmış ağ durumu dahi her özel sunucuya erişim garantisi değildir. Kaynak: [Android bağlantı durumu belgesi](https://developer.android.com/develop/connectivity/network-ops/reading-network-state).

## 6. Ban/Cloudflare davranışı

- 429: ilgili hosttaki işler ortak beklemeye alınır; sunucunun Retry-After süresi korunur. Bekleme uzatılırsa kuyruk yeni son zamanı kontrol eder.
- Cloudflare challenge/CAPTCHA: ilgili host durdurulur, belirsiz sonuçlar korunur, kullanıcı doğrulaması/sağlayıcının desteklediği API erişimi gösterilir. IP ban, CAPTCHA, yetki reddi ve geçici rate-limit ayrı durumlardır.
- Proxy failover: gerçekten çalışmayan proxy bağlantısına karşı sınırlı onarım içindir. Hedefin 429/403/challenge yanıtında proxy değiştirilerek aynı tarama sürdürülmez.
- Aynı panelin farklı hostname'leri sağlayıcı tarafından ortak sınırlandırılabilir. Host başına sınırın yanında panel/hesap düzeyinde de istek bütçesi gerekir. Alternatif adresler aynı engeli aşmak amacıyla otomatik denenmemeli.
- Kullanıcının seçtiği eşzamanlılık üst sınırdır. Sunucunun sınırlama sinyali bunu düşürebilir; hız modu bu durdurmayı geçersiz kılamaz.

Mevcut MAC tespitinin temeli Cloudflare'ın belgelendirdiği `cf-mitigated: challenge` sinyaliyle uyumludur: [Cloudflare yanıt tespiti](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/). [429 açıklaması](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-429/) sunucu bekleme talimatının önemini açıklar.

## 7. Sürüm kapsamı önerisi

Tek sürüm teknik olarak mümkün; "sığmaz" şeklinde kesin hüküm doğru değil. Bununla birlikte bu paket JS, native servis, kalıcı kayıt, oynatım kaynak sahipliği ve MAG oturumlarını birlikte etkiler; "çoğu mevcut, risk düşük" genellemesi de uygun değil.

Öneri:

- Önce mevcut v18.7.29'un film/dizi bütünlüğü, açılış/çıkış, emniyet TXT ve gerçek görüntü testindeki kritik bulgularını doğrula. Önceki inceleme raporundaki PAGE_ERROR, bozuk katalog yanıtı ve içerik ID sürekliliği konuları bu paketten bağımsız olarak kaybolmamalı.
- v18.7.30: ortak sonuç sözleşmesi, olumlu auth kontrolü, JS/native önbellek düzeltmesi, kalıcı ikinci tur, iptal/profil sahipliği, host/panel bekleme ve test/oynatım sahipliği. Aynı aşamada seçili/adayı/doğrulanmışı ayıran DNS kayıt sözleşmesi kurulsun.
- v18.7.31: ortak panel DNS ekranı, çoklu seçim, ayrı gecikme ölçümleri, mevcut Xtream rehber çözümlemesinin rafine edilmesi, MAG panel bağı ve otomatik adres değişimi, Room içeriği ve TXT kanıtlarının tutarlı güncellenmesi.
- Sonraki aşama: katalog yöntemini öğrenme, keşif ikinci turu, kontrollü büyük yanıt, çok kanallı görüntü testi ve ölçüme dayalı adaptif hız.

Bu sıralama kapsamı azaltmaz; kabul kontrollerini ayrıştırır. Kullanıcı tek teslim buildi isterse aşamalar ayrı doğrulanıp aynı nihai buildde birleştirilebilir; yine de hatasızlık ölçüm ve cihaz testleriyle gösterilmelidir.

## 8. Kabul kontrolü

1. Açık auth reddi, timeout, 429, challenge, bozuk JSON, eksik auth ve iptal ayrı sonuç üretmeli; JS/native aynı anlamı kullanmalı.
2. İlk turda geçici hata alan bilinen çalışan hesap, ikinci turda gerçek yeni istekle bulunmalı. Kesinti sonrası kuyruk devam etmeli; kullanıcı iptali otomatik yeniden başlamamalı.
3. Aktif oynatım sırasında görüntü testi ikinci upstream açmamalı; test bitişi kaynak serbest bırakılmadan tamamlanmış sayılmamalı.
4. Seçilmeyen DNS ilk taramaya girmemeli. Rehberden otomatik genişleme yalnız kayıtlı izinli panel kapsamında yapılmalı.
5. Denenmemiş DNS doğrulanmış listesine yazılmamalı. TXT/playlist kartı ve kalıcı kanıt aynı durumu göstermeli.
6. Rehber değişimi, kaynak erişim hatası, ağ kesintisi ve tek endpoint arızası ayrı ele alınmalı. Geçerli mevcut katalog hata yüzünden boşaltılmamalı.
7. MAG port/path/cihaz kimliği korunmalı; endpoint değişiminde yeni oturum kurulmalı.
8. Eski favoriler/izleme geçmişi ve katalog ID'leri korunmalı. Büyük yanıt ve çoklu test sırasında heap/ANR davranışı cihazda izlenmeli.
9. Başarı oranı ve süre aynı bilinen hesap kümesinde karşılaştırılmalı: bulunan/kaçan hesap, ikinci turda kurtarılan hesap, istek sayısı, toplam süre ve ilk kare süresi.

## 9. Opus'a kısa devir

Bugün kaynak kodu değiştirilmedi. On madde ve DNS taslağı mevcut v18.7.29 koduyla yeniden karşılaştırıldı. En önemli kapsam düzeltmeleri: Xtream güncel rehber failover mevcut; MAC küçük sayfa-önce mevcut; alternatif adres TXT/metadata kaydı mevcut; JS geçici-null önbelleği hâlâ riskli; validatedHosts denenmemiş adaylarla kirlenebiliyor; magHostFailover aynı hostun çoklu IP çözümüdür, panel hostname failover değildir. Uygulama planında bu ayrımlar esas alınmalı.
