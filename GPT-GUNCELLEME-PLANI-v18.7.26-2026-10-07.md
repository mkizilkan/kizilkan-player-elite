# Kalan işler — anlaşılır düzeltme ve geliştirme planı

Tarih: 7 Ekim 2026. Mevcut uygulama: 18.7.25. Kullanıcı isteği: kalan işleri birlikte yürütmek için anlaşılır plan sunmak. **Bu belge bir plandır; uygulama düzeltmeleri henüz kodlanmadı.**

## Tamamlanan acil güvenlik işi

579 hesaplık TXT, dosyayı içeren son commit yeniden oluşturularak .25 dalının ve `build-146` etiketinin Git geçmişinden çıkarıldı. Tekrar normal Git eklemesiyle yayınlanmasını engelleyen ignore kuralı push edildi. Kullanıcının açık onayıyla depo geçici PRIVATE yapıldı. Oturum/cookie/token olmadan repo sayfası, eski commit contents API ve eski raw dosya için yapılan kontroller 404 döndürdü. Yerel kişisel arşiv korunmuş, Git takibi dışında tutulmuştur. Uygulama kodu, sürümü ve APK değiştirilmedi.

GitHub'daki eski obje/cache'in kalıcı temizliği ve açığa çıkan hesap parolalarının ilgili sağlayıcılarda değiştirilmesi ayrı takip işleridir. GitHub Support taslağı hazırdır; gönderilmemiştir. Depoyu tekrar public yapmadan önce bu başlık değerlendirilmelidir.

## Sıra ve beklenen sonuç

| Sıra | Yapılacak iş | Kullanıcı açısından sonuç / bitirme ölçütü |
| --- | --- | --- |
| 1 | **Bulunan hesapları ve çalışan bütün DNS'lerini korumak — MAC ve Xtream.** Son 200 kayıt penceresine bağlı kalmadan bütün kalıcı sonuçları ekrana aktarmak. Aynı hesaba ait birden fazla gerçekten görüntü veren DNS/portal varsa hepsini hesapla ilişkili biçimde Room'a, playlist kartına ve TXT'ye kaydetmek. Normal tarama, büyük dosya, arka plandan dönüş, iptal ve yeniden açılmayı kapsamak. | Hesap ve alternatif adresleri kaybolmaz. Kartta birincil ve diğer çalışan adresler görülebilir/seçilebilir. Aynı hesabın adresleri doğru grupta tutulur; farklı hesaplar sırf aynı MAC veya kullanıcı adı taşıyor diye birleştirilmez. Hesap sayısı ve adres sayısı ayrı, açık ve TXT ile tutarlı gösterilir. |
| 2 | **Emniyet yedeğini gerçekten çalıştırmak.** Bir tarama için tek dosya tutmak, yeni sonuçları sırayla yazmak, yazım başarısını kontrol etmek ve son yazımı bitirmeden tamamlandı dememek. MAC ve diğer toplu taramaları kapsamak. | Çok sayıda aynı adlı dosya oluşmaz. Yeniden açılışta kalıcı kayıtlardan sonuçlar ve eksik yedek tamamlanabilir. Disk/izin hatasında kullanıcı kayıt başarısızlığını görür. |
| 3 | **Yedeğin geri yüklenmesini düzeltmek.** Uygulamanın kendi ürettiği eksik katalog kaydını tanımak; sağlam listeleri geri yüklemek ve eksik olan parçaları açıklamak. Mevcut verileri başarısız yüklemede korumak. | “Yedek aldım ama uygulama açamıyor” sorunu giderilir. Hepsi / seçtiklerim tercihi korunur. Yalnız hesap bilgisi yüklenen listede yerel içerik 0 gösterilir; eski uzak sayılar ayrı açıklanır. Boş liste seçimi donma veya var olmayan içeriği gösterme üretmez. |
| 4 | **MAC aramasının sırasını ve kullanıcı tercihlerini doğrulamak.** Önce port/yol üzerinden gerçek portal API'sini bulmak, sonra kullanıcı seçimi veya otomatik seçimle belirlenen portalda MAC hesaplarını doğrulamak. “Yalnız girilen”, “çalışmazsa diğerleri” ve “tümü” seçeneklerini korumak. | Kullanıcının port/yol tercihi uygulanır. Her MAC için bütün port/yollar tekrar taranmaz. HTTP 200 dönen HTML sayfası gerçek portal sayılmaz. Tek MAC ekranında arama/doğrulama/sonuç aşamaları görünür. |
| 5 | **Hesap kartını doğru hesaba bağlamak.** Aynı MAC'nin farklı portal veya profillerdeki bilgilerini karıştıran önbelleği düzeltmek. Portalın sağladığı ya da yayın bağlantısından doğrulanarak türetilen kullanıcı adı ve şifreyi birlikte göstermek. | Başka portalın kullanıcı adı, şifresi veya M3U'su kartta görünmez. Bulunamayan bilgi “belirlenemedi” kalır. Bitiş tarihi ve aktif/süresi dolmuş/belirsiz durumu doğru kaynağa dayanır. |
| 6 | **“İçerik var” ve “görüntü var” anlamlarını ayırmak.** Kanal listesi dönmesiyle gerçek yayın/ilk kareyi farklı sonuçlar olarak göstermek. Var/yok kontrolünde gereksiz tam katalog/kategori yükünü azaltmak; gerekiyorsa kullanıcı tercihiyle sınırlı gerçek oynatma testi yapmak. | Katalog döndü diye “yayın çalışıyor” denmez. Test timeout'u kesin “içerik yok” sayılmaz. Hesap, katalog ve görüntü sonucu ayrı anlaşılır; test daha az gereksiz veri işler. |
| 7 | **Seçim, kayıt ve MAC ekranının kullanımını tamamlamak.** Tümü / seçtiklerim / geçerli hesaplar / koruma görülmeyenler seçimlerini korumak. Seçilen hesapları playlist veya TXT'ye eklemek. TXT'ye hesap bilgileri, bitiş tarihi ve kategori bilgilerini birlikte koymak; kaydedilen dosya/adet/yolu göstermek. Çok MAC yapıştırılan alanı sınırlı yükseklikte, kendi içinde kaydırılabilir tutmak. | Kullanıcı neyi kaydettiğini ve nerede bulacağını bilir; seçilmeyen hesaplar eklenmez. MAC giriş alanı sayfayı aşırı uzatmaz. Korumada “gözlendi / görülmedi / belirlenemedi” ayrımı görünür; bilinmeyen durum korumasız sayılmaz. |
| 8 | **Arka plan ve durdurma davranışını düzeltmek.** Tarama, içerik testi ve güncellemenin birbirinin arka plan servisini kapatmasını engellemek. Ekrandan çıkış, hesap/profil değişimi, iptal, Android süre sınırı ve süreç ölümü için sahiplik ve kayıt kuralları koymak. | Bir iş bitince diğer iş durmaz. Eski hesabın geç gelen sonucu yeni karta yazılmaz. Kullanıcının iptali gerçekten işi kapatır; kalıcı sonuçlar yeniden açılınca alınabilir. Ekran kapalı çalışma gerçek cihazda doğrulanır. |
| 9 | **Google Drive girişini düzeltmek.** Android'e uygun, Google'ın desteklediği giriş/yetkilendirme akışını kurmak; DEV ve release yapılandırmasını doğrulamak. | Client ID girilmesine rağmen yapısal yönlendirme hatasıyla kalmaz. Giriş, yedek yükleme, listeleme ve geri alma gerçek cihazda denenir; hata kullanıcıya açık gösterilir. |
| 10 | **MAC ve Xtream'de canlı, film ve dizi yükleme hızını geliştirmek.** Canlı kanal listesini kullanıma açma süresini ve kanala tıklandıktan sonra ilk görüntü süresini ayrı ölçmek. Canlıyı gereksiz film/dizi beklemesinden kurtarmak; mevcut parça parça teslim akışını korumak. MAC hesabı gerçekten Xtream API'sini destekliyorsa uygun katalog yolunu kullanmak, desteklemiyorsa Stalker sayfalamasını sürdürmek. Xtream'in mevcut istek/parse/Room yazım akışını da ayrı optimize etmek. | Hem MAC hem Xtream canlı kanallar daha hızlı hazır olur; kanala tıklandığında gereksiz bekleme azalır. Film/dizi içeriği eksilmez, oynatma adresleri karışmaz. Önce/sonra katalog süreleri, ilk kare süresi ve içerik sayıları karşılaştırılır. Yayın URL biçimi tek başına API desteği sayılmaz. |
| 11 | **Player ilk görüntü ve motor davranışını inceleyip düzeltmek.** Kanal seçimi, portal linki çözme, bağlantı, ilk veri, motor hazırlığı ve ilk kare sürelerini ayrı ölçmek. Normal canlı, “duraklatınca timeshift”, ilk görüntü öncesi pause ve motor geçişlerini ayrı denemek. | Gecikmenin kaynağı ölçülerek düzeltilir. “Duraklatınca” seçimi daha ilk açılışta gereksiz tampon bekletmez; pause ve ileri/geri sarma doğrulanır. Çalışan motorlar ve mevcut özellikler korunur. |
| 12 | **Teşhis ve devir kayıtlarını güncellemek.** Film/dizi sınıflandırma logunun gerçek koşulla aynı olmasını sağlamak. Aktif sürüm/dal ve yapılmış/bekleyen listelerini güncellemek. | Eski devir yanlış işi tekrar başlatmaz. Her değişikliğin nerede, neden yapıldığı ve nasıl test edildiği Opus'a aktarılabilir. |

## Çalışmayı nasıl yürüteceğiz?

1. İlk uygulama grubunda **1–3**: sonuç kaybı, emniyet yedeği, geri yükleme. Veriyi koruma önce gelir.
2. İkinci grupta **4–8**: MAC doğrulaması, hesap bilgileri, dürüst içerik testleri, seçim/kayıt ve iş yaşam döngüsü.
3. Üçüncü grupta **9–12**: Drive, katalog hızı, player ölçümü/düzeltmesi ve devir düzeni. Telefon testleri gereken noktada yapılır; son ana bırakılmaz.

Gruplar işi takip etmek içindir; her grup için ayrı kullanıcı sürümü çıkarmayı gerektirmez. Hedef bu kapsamı **tek güncelleme paketinde** toplamak, tamamlanan kaynaklardan yerel DEV APK ve GitHub build'i üretmektir. Hatalar veya gerçek cihaz sonuçları düzeltme gerektirirse derleme/test tekrarı gerekir; önceden tek derleme denemesinde hatasızlık sözü verilemez.

Güncel temiz .25 dalı taban alınır; çalışma ayrı sürüm dalında yürütülür. .26 için ayrılmış native journal planı, yukarıdaki veri güvenliği ve diğer düzeltmelerle birlikte güncellenir. Beş sürüm alanı birlikte değişir. GitHub workflow kullanıcı talebine uygun **manuel** tetiklenir. Gerçek hesap arşivleri, şifreler ve cihazdan alınan özel dosyalar tekrar Git'e eklenmez.

## Ne zaman “bitti” diyeceğiz?

- Kaynak kontrolleri ve gerekli native derleme başarılı olduğunda.
- 200'ü aşan sonuç, sabit pencereye yeni kayıt, seçmeli/tam TXT, eksik yedek, profil değişimi, iptal/yeniden açılma gibi senaryolar geçtiğinde.
- Kullanıcının bildiği çalışan portal/hesaplarla tek ve çoklu MAC doğrulaması gerçek cihazda sonuç verdiğinde. Katalog, yayın erişimi ve ilk kare kanıtları ayrı tutulur.
- Film/dizi sayısı ve oynatma eşlemesi korunarak hız ölçümleri tamamlandığında.
- Player pause/timeshift/ileri-geri sarma ve motor geçişi cihazda denendiğinde.
- Kaydedilen dosya tekrar okunup sayısı/içeriği kontrol edildiğinde; geri yükleme sırasında mevcut veriler korunmuş olduğunda.
- MAC ve Xtream için aynı hesaba ait iki veya daha çok çalışan DNS, Room'da ve kartta tutulup TXT'ye yazıldığında; yeniden açılma ve yedek geri yükleme sonrası aynı adresler/kanıt durumları korunmuş olduğunda. Yalnız API girişi kabul edilen adres “görüntü verdi” diye işaretlenmemeli.
- Canlı kanal listesinin kullanıma açılma süresi ve kanala tıklama → ilk görüntü süresi MAC/Xtream için ayrı ölçülüp doğrulandığında; film/dizi yükleme bu aşamaları gereksiz yere engellemediğinde.
- Yerel DEV APK, GitHub commit/run ve devir belgesi birbirleriyle uyumlu olduğunda.

Her anlamlı adımda kullanıcıya **ne yapıldı, ne test edildi, ne kaldı** bilgisi verilecek. Opus devrinde değişen dosyalar ve kaynak satırları, önceki/sonraki davranış, test sonuçları, build/dal/commit ve kalan sınırlamalar yazılacak. Telefon bağlı değilse cihaz testinin yapılmadığı açıkça belirtilecek; yapılmış gibi gösterilmeyecek.

## Teknik inceleme ile eşleştirme

Mevcut kaynak kanıtları: [GPT-OPUS-v18.7.25-KOD-INCELEME-2026-10-07.md](C:/Projeler/kizilkan-player-elite/GPT-OPUS-v18.7.25-KOD-INCELEME-2026-10-07.md).

- 1: R02; 2: R03 ve .26 E-Xtream; 3: R07.
- 4: önceki MAC istekleri, .15–.17 davranışlarının uçtan uca doğrulaması ve .26 aktarım sözleşmesi.
- 5: R05; 6: R04; 7: önceki seçim/TXT/kategori/bitiş/giriş alanı isteklerinin korunması ve cihaz doğrulaması.
- 8: R06/R08; 9: R11; 10: katalog hız hipotezi ve ID/Room/oynatma eşlemesi.
- 11: önceki player talepleri, G09/G10; 12: R09/R10.

Tablodaki bazı davranışlar mevcut kodda zaten var. Bunlar kaldırılıp yeniden yazılacak işler olarak değil, doğru çalıştığı doğrulanacak ve ilgili hatalar giderilirken korunacak kabul koşulları olarak plana dahil edildi.

## Zorunlu çalışma kuralı — kullanıcı ek talebi, 7 Ekim 2026

**Her maddede düzeltmeden önce mevcut kod ayrıntılı doğrulanacak.** Devir açıklaması, yorum satırı, değişken adı veya geçmişte “yapıldı” denmesi tek başına tamamlanma kanıtı değildir.

Her başlık için ayrı durum tablosu tutulacak: **yapılmış ve doğrulanmış / kısmen yapılmış / eksik veya hatalı / cihaz testi gerekiyor**. Girdi → işlem → kalıcı kayıt → yeniden okuma → kart/oynatma → TXT/yedek geri yükleme zinciri izlenecek. Çalışan kısmı gereksiz yeniden yazmak yerine korunacak; yalnız kanıtlanan eksik halka düzeltilecek. İnceleme sırasında bu plan belgesi dışında uygulama kodu değiştirilmeyecek.

İnternet araştırması yalnız tereddüt edilen konularla sınırlı tutulmayacak: uygulamaya alınacak teknik kararlar, iyi bilindiği düşünülen konularda da güncel birincil kaynaklarla karşılaştırılacak. Android/Room/Media3/Expo/Google resmi belgeleri ve kullanılan sürümün kaynak kodu esas alınacak. Yeni API'nin mevcut kurulu sürümde bulunduğu kontrol edilecek; arama sonucu veya başka bir uygulamanın tahmin edilen davranışı tek başına uygulama kararı olmayacak. Bulunamayan bilgi açık soru olarak bırakılacak ve ölçümle sınanacak.

Her anlamlı düzeltmede kanıtlanan eski davranış, değiştirilen dosya/satır, test sonucu ve kalan belirsizlik Opus devir belgesine yazılacak.

## 1 ve 10. maddeler için ilk kod doğrulaması

Bu tablo 7 Ekim 2026'da temiz .25 kaynakları üzerinde yapılan ek incelemedir; henüz düzeltme yapılmadı. Kaynak tabanının güncel commit'i `5cf9f999` (güvenlik devri commit'i); uygulama kodu .25 ile aynı.

| Alan | Koddan doğrulanan mevcut davranış | Durum / korunacak ve tamamlanacak kısım |
| --- | --- | --- |
| Xtream adres modeli | [types/index.ts:133](C:/Projeler/kizilkan-player-elite/frontend/src/types/index.ts:133) `serverCodeBinding.validatedHosts`; [types/index.ts:191](C:/Projeler/kizilkan-player-elite/frontend/src/types/index.ts:191) elle eklenen `backupHosts` var. | Mevcut altyapı korunacak. Bu alanlar yalnız adres/hesap doğrulamasını taşır; adres başına ilk kare kanıtı ve test zamanı modeli yok. |
| Xtream toplu ekleme | [add-playlist.tsx:2330](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2330) aynı aboneliğin adreslerini grupluyor. [add-playlist.tsx:2435](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2435) `c.direct` ise binding yazmıyor; aynı playlist nesnesine alternatifler `backupHosts` olarak da eklenmiyor. | Panel bağıyla ekleme kısmen hazır. Doğrudan ekleme/recovery/tekli ekleme/yenileme yollarında alternatiflerin kaybolmadığı ayrıca doğrulanacak; aynı hesabın farklı bağlantıları her giriş yolunda taşınmalı. |
| Xtream TXT | [accountArchive.ts:39](C:/Projeler/kizilkan-player-elite/frontend/src/utils/accountArchive.ts:39) bütün `validatedHosts` adreslerini yazıyor; parser geri okuyor. | **Mevcut özellik çalışıyor:** gerçek formatter/parser, sentetik tek hesap ve iki DNS ile bellekte çalıştırıldı; iki adres de korunarak geri okundu. Ağ isteği ve depolama yazımı yok. Bu yol yeniden yazılmayacak; eksik upstream adresler ve yeni görüntü/Room kayıtları tamamlanacak. |
| DNS test ekranı | [DnsManager.tsx:56](C:/Projeler/kizilkan-player-elite/frontend/src/components/DnsManager.tsx:56) yalnız Xtream login çağrısı yapıyor; test sonucu component state'inde. [edit-playlist.tsx:473](C:/Projeler/kizilkan-player-elite/frontend/app/edit-playlist.tsx:473) bu yöneticiyi Xtream düzenleme bölümünde kullanıyor. | Login başarısı görüntü/ilk kare kanıtı değil. Adres başına hesap/katalog/yayın/ilk kare ayrımı ve kalıcı zaman bilgisi gerekiyor. MAC kartı için aynı ihtiyacı portal yolu ve oturumu korunarak karşılamak gerekiyor. |
| Oynatıcı yedek adresleri | [PlayerHost.tsx:999](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:999) yalnız `playlistSource === "xtream"` için alternatif hostları alıyor. Son çalışan host mevcut listede varsa öne alınıyor. [hostFailover.ts:39](C:/Projeler/kizilkan-player-elite/frontend/src/player/hostFailover.ts:39) URL'nin yolunu koruyup origin'i değiştiriyor. | Xtream'deki çalışan akış korunacak. “Her DNS aynı kanal ID/yolunu sunar” varsayımı test edilmeden genişletilmeyecek. MAC için çıplak host değiştirme yeterli değildir; o DNS'e ait doğrulanmış portal endpoint'i ve doğru oturum/link çözümü gerekir. |
| MAC ekleme ve TXT | [mag-bulk.tsx:386](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:386) tek `stalkerPortal/resolvedPortal` yazıyor. [magBulk.ts:125](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulk.ts:125) arşiv modelinde tek portal var. | Aynı MAC hesabına ait doğrulanmış alternatif portal/DNS grubunun kart/kayıt/TXT zinciri mevcut değil. Aynı MAC'yi taşıyan ilgisiz portallar otomatik birleştirilmemeli. |
| Room kalıcılığı | [NativeDataEntities.kt:12](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeDataEntities.kt:12) snapshot sayıları var; [KizilkanNativeDatabase.kt:11](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeDatabase.kt:11) tablo listesinde playlist DNS ilişkisi yok. [PlaylistContext.tsx:665](C:/Projeler/kizilkan-player-elite/frontend/src/store/PlaylistContext.tsx:665) playlist metadata'sını JS storage'a yazıyor. | “Adresler zaten Room'da” denemez. Kullanıcı isteği doğrultusunda playlist/profil/hesap kimliğine bağlı native Room adres kaydı, köprü, kart okuması ve geri yükleme birlikte planlanmalı. Mevcut içerik ve metadata mimarisi korunmalı. |
| MAC canlı önceliği | [mag-bulk.tsx:395](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:395) ve [add-playlist.tsx:2735](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2735) canlı katalog için `liveOnly:true` kullanıyor; VOD/dizi ayrı devam ediyor. | Öncelik zaten kısmen var; kaldırılmayacak. Gerçek bekleme portal/link çözümü, katalog, kayıt, UI ve motor fazlarına ayrılarak ölçülecek. |
| Xtream canlı teslimi | [add-playlist.tsx:1077](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1077) tekli içerik yüklemede üç sonucun bitmesini bekliyor. [refreshPlaylist.ts:297](C:/Projeler/kizilkan-player-elite/frontend/src/utils/refreshPlaylist.ts:297) normal yenilemede aynı yaklaşım var. [refreshPlaylist.ts:193](C:/Projeler/kizilkan-player-elite/frontend/src/utils/refreshPlaylist.ts:193) incremental recovery yolunda canlı önce alınıp teslim ediliyor. | Bütün Xtream yolları aynı değil. Parça parça teslim zaten olan yolda korunacak; normal/tekli/native ekleme yolları ayrı incelenecek. “Canlı geldi” göstergesi ile gerçekten Room/UI'da kullanılabilir olması aynı noktada doğrulanmalı. |

### Çoklu DNS için bitirme koşulları

- MAC ve Xtream için aynı hesaba ait iki/üç doğrulanmış adres birincil ve alternatif olarak kartta gösterilmeli; kullanıcı birincili seçebilmeli.
- Adres başına **hesap doğrulandı / katalog alındı / yayın bağlantısı doğrulandı / ilk kare görüldü** bilgileri, son gözlem zamanı ve kaynak korunmalı. Yalnız HTTP 200 veya login başarılı olması “görüntü veren DNS” kabul edilmemeli.
- Room kaydı, kart, TXT, uygulamayı yeniden açma ve yedek geri yükleme aynı adresleri göstermeli. Adres veya port/portal yolu kaybolmamalı.
- Aynı MAC, aynı kullanıcı adı veya aynı görünen panel adı tek başına hesap eşitliği kanıtı sayılmamalı. Farklı profiller/portal kurulumları karıştırılmamalı.
- Bir hesaba ait görüntü testleri sırayla yapılmalı; mevcut oynatma ile birlikte ikinci upstream açılmamalı. Kanal ID'leri farklıysa kör URL host değişimi yerine o kaynağın doğru yayın eşlemesi kullanılmalı.
- Zaman aşımı ve koruma nedeniyle sınanamayan DNS silinmemeli veya “görüntü yok” diye kesin etiketlenmemeli; belirsiz/yeniden test durumu gösterilmeli.
- Room'a yeni şema gerekiyorsa mevcut `version=4`, `exportSchema=false` ve migration zinciri dikkate alınmalı. Veri silerek yeniden kurma yapılmamalı. Eski DNS metadata'sının aktarımı, playlist silme/kopyalama ve atomik yedek geri yükleme yeni ilişkiyi de kapsamalı.

### Güncel birincil kaynak araştırması

7 Ekim 2026'da resmi kaynaklar kontrol edildi. Bunlar planın teknik dayanaklarıdır; henüz implementasyon veya hız kazanımı kanıtı değildir:

- Room'da bir playlist'e birden çok adres ilişkisi ve tutarlı çok sorgulu okuma için [one-to-many ilişkileri ve transaction](https://developer.android.com/training/data-storage/room/relationships/one-to-many) değerlendirilecek. Yeni ilişki yalnız Room içinde transaction ile korunabilir; ayrı JS storage ile tutarlılık ayrıca tasarlanmalıdır.
- Şema değişirken mevcut kullanıcı verisini korumak için [Room migration rehberi](https://developer.android.com/training/data-storage/room/migrating-db-versions) esas alınacak. Projede Room **2.8.3** kullanılıyor; `exportSchema=false` olduğu için otomatik migration mevcut ayarla varsayılamaz.
- İlk kare ve olay zamanlaması için [Media3 analytics](https://developer.android.com/media/media3/exoplayer/analytics); buffer/yükleme politikası için [Media3 customization](https://developer.android.com/media/media3/exoplayer/customization) incelendi. Ağ bağlantısı ve motor buffer'ı farklı fazlar olarak ölçülecek. Kullanılan Expo Video **~3.0.16** ve diğer motorların gerçek native sürümleri/API'leri uygulanmadan önce kontrol edilecek.
- DNS/HTTP bağlantı tekrar kullanımı ve ağ katmanı kararları için [Media3 network stacks](https://developer.android.com/media/media3/exoplayer/network-stacks) değerlendirilecek. Yeni motor/kütüphane veya preload politikası ölçüm olmadan eklenmeyecek.
