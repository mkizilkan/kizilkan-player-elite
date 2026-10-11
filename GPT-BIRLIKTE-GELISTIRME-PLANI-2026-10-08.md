# GPT — birlikte kodlama, düzeltme ve geliştirme planı

Tarih: 08.10.2026. İncelenen taban commit'i: `43cc02c6c38b3e3e3b151eddc73994e4ef3e1cef`. Çalışma dalı: `codex/v18.7.28-rc1-proxy-sources`.

Kullanıcı önce planı ekranda okumak, kapsamı beraber kararlaştırmak ve sonra kodlamak istedi. Playlist ekleme ekranına “Zorla çık” butonu eklenmesini ayrıca istedi. Bu belge **kararlaştırılacak plandır**; aşağıdaki maddelerin uygulandığı anlamına gelmez. Bu plan hazırlanırken uygulama kaynaklarına yeni düzeltme yapılmadı. Önceki proxy güncellemesi çalışma ağacında hazırdır; yeni commit, push, APK veya kurulum henüz yoktur.

Amaç mevcut özellikleri koruyarak önce ekrandan çıkış ve kalıcı kayıt sorunlarını çözmek, sonra katalog ve canlı açılış süresini iyileştirmek, ardından rapor ve seçim akışlarını tamamlamaktır. Kodda bulunan özellikler yeniden yazılmayacak; eksik veya hatalı senaryolar düzeltilecek.

## 1. Ekranda kararlaştırılacak ana plan

| No / öncelik | Mevcut durum | Yapılacak | Kullanıcıya sonucu |
|---|---|---|---|
| 1 — Acil | Kurtarma ekle ekranını kök ekran yapabiliyor. Geri oku yalnız `router.back()` kullanıyor; bazı işlem pencereleri kapanışı engelliyor. | Ekleme ekranına ve onu örten işlem/sonuç pencerelerine erişilebilir “Zorla çık” ekle. Donanım geri tuşunu da ortak çıkış akışına bağla. İş durumu ve kayıtlar korunarak yetkili profilin ana ekranına dön. | Uygulamayı kapatmadan ekleme ekranından çıkılabilir. |
| 2 — Acil | Kurtarma servisinde kayıtları okuma/şifre çözme, foreground bildiriminden önce çalışıyor. Önceki cihaz logunda servis başlangıcı çökmesi var. | Bildirimi önce göster; pahalı kurtarma hazırlığını arka plan çalışanına taşı. Başlatma, iptal, tekrar başlatma ve hata durumlarına tek oturum sahipliği uygula. | Çok sayıda sonuçla yeniden açılış kurtarma servisini kilitlemez. |
| 3 — Acil | Önceki cihaz incelemesinde journal/TXT 678 kayıt, ekranda 239 kayıt vardı. Diskten kayıp kanıtlanmadı; aktarımın eksik görünmesi ve servis çökmesi doğrulandı. | Sonuçları sınırlı sayfalarla ekrana aktar. Okuyucuyu sıradan playlist metadata değişimlerinden ayır. Kalıcı kayıt, okunan kayıt, abonelik, DNS sonucu ve filtrelenen görünür sayıyı ayrı göster. Otomatik kurtarma yerine kullanıcıya “Sonuçları aç / Kaldığı yerden devam / Daha sonra” seçimi sun. | Yeniden açıldığında tüm kayıtlar bulunabilir; bulunan sayı ile görünen sayının farkı anlaşılır. |
| 4 — Acil | Kullanıcı tarama sırasında emniyet TXT'sinin boş kaldığını bildiriyor; bu olayın kesin nedeni ayrıca doğrulanmalı. Otomatik TXT biçimi normal arşiv okuyucusuyla uyumsuz. TXT büyüdükçe yeniden yazım maliyeti artıyor; mevcut dosyanın üstüne yazım güç kesintisinde riskli. | İlk kalıcı sonuçtan itibaren TXT yazımını ve doğru dosya hedefini doğrula; dosyayı geri okuyup gerçek kayıt sayısını kontrol et. Hem eski arşivi hem otomatik JSON-lines TXT'yi oku. DB'yi ana kayıt olarak koru; TXT işini ayrı ve tek yazıcı kuyruğuyla üret. Yeni dosyayı doğrulamadan önceki sağlam dosyayı bırakma. Hazırlanıyor/yazıldı/hata durumlarını ayır. | Sonuç bulunan taramada boş dosya başarılı yedek sayılmaz. Otomatik yedek kendi uygulamamıza geri yüklenir; eski sağlam kopya korunur; kullanıcı son başarılı kayıt sayısını görür. |
| 5 — Yüksek | Çoklu girişte kullanıcı adı, şifre ve sunucudan oluşan tekrar anahtarının tamamı küçük harfe çevriliyor. | Kullanıcı adı/şifre ve harf duyarlı URL alanlarını aynen koru; yalnız host gibi gerçekten harf duyarsız alanları normalleştir. Mevcut tekrar ayıklama ve uyarıyı koru. | Büyük/küçük harfle farklı hesaplar yanlışlıkla birleştirilmez. |
| 6 — Yüksek | “Canlı Katalog Test Et” katalog sayısını ölçüyor; başarısızlığın nedeni `catch` içinde kayboluyor. | MAG ve Xtream için hesap, katalog ve gerçek ilk kare durumlarını ayır. Seçili/tümü kapsamı, host başına sıra ve kontrollü tekrar ekle. İlk kare testi kullanıcı istediğinde seçili hesaplarda, sırayla ve mevcut oynatıcı sahipliğine uyarak çalışsın. | Katalog alınması görüntü başarısı sayılmaz; 401, 429, zaman aşımı, HTML/challenge, boş yanıt ve iptal ayrı anlaşılır. |
| 7 — Yüksek | Doğrulanmış MAG→Xtream hızlı yolu ekleme sonrası zenginleştirmede var; normal güncelleme Stalker sayfalamaya gidiyor. | İlk ekleme, normal yenileme ve arka plan tamamlama ortak sağlayıcı seçimi kullansın. Hesap/profil/portal için gerçekten doğrulanmış Xtream API varsa film/dizi toplu çekilsin. Saf Stalker sayfalaması yedek kalsın. | Uyumlu MAG panellerinde çok sayıda sayfa isteği azalır. Her portalın saniyelerde biteceği varsayılmaz. |
| 8 — Yüksek | Kısmi katalog tam başarı sayılabiliyor. Ham satır sayısı benzersiz içerik sayısı değil; sağlayıcı değişimi içerik kimliğini etkileyebilir. | Tür başına tam/kısmi/hata ve durma nedeni taşı. Sunucunun bildirdiği, alınan benzersiz ve Room'da saklanan sayıları ayır. Eski dolu kataloğu, favorileri, izlendi ve devam et kimliklerini koru. Native iş sahipliği ve kalıcı devam noktasıyla arka plan davranışını düzenle. | Eksik yenileme “tamamlandı” yazmaz; hızlandırma eski kütüphane bilgilerini kaybettirmez. |
| 9 — Yüksek | İlk kare ve timeshift altyapısı var; bildirilen yavaşlığın tek kesin nedeni henüz ölçülmedi. | MAG ve Xtream canlılarında DNS, yayın çözme, motor açma ve ilk kare sürelerini ayrı ölç. “Duraklatınca” modunda kayıt hazırlığının ilk görüntüyü geciktirip geciktirmediğini kanıtla. Media3/VLC/MPV geçişi, tampon, duraklatma ve ileri/geri sarma davranışını birlikte test et. | Gereksiz bekleme azalır; aynı hesap için ikinci yayın bağlantısı açılmadan duraklatma/sarma korunur. |
| 10 — Yüksek | Yedek DNS, doğrulama ve son çalışan adres altyapısı var. Kart/TXT bütünlüğü ve ölçümlü seçim tamamlanmalı. | MAG ve Xtream için çalışan alternatifleri aynı hesap altında Room/playlist kartı ve TXT'ye kaydet. Hesap doğrulaması ile gerçek ilk kare kanıtını ayır. Son başarı, kontrol zamanı ve ilk kare süresini kullan; kullanıcı seçimi korunsun. | Birden çok çalışan adres kaybolmaz; canlı kanal yakın zamanda başarılı olan adresten açılabilir. |
| 11 — Doğrulama ve tamamlama | Önce portal keşfi, sonra MAC doğrulama; yalnız girilen/fallback/tümü ve manuel/otomatik portal seçimi mevcut. | Kullanıcının port/path girdiği ve girmediği tekli/çoklu senaryoları yeniden üret. Aynı hostta keşfin MAC başına tekrarlanmamasını ve seçilen API yolunun korunmasını test et. 200 HTML'yi API sayma. Koruma gözlendi/görülmedi/bilinmiyor ayrımı korunsun. | Mevcut seçenekler gerçekten uygulanır; başarısızlık hesap mı, portal mı, ağ mı anlaşılır. |
| 12 — Tamamlama | Seçerek hesap ekleme, MAG bitiş ve kategorili TXT mevcut; Xtream ortak raporu ve kullanıcı adı kanıtı tamamlanmalı. | MAG/Xtream için seçili/tümü TXT ve playlist akışını birlikte doğrula. Kategoriler, bitiş, hesap kullanıcı adı, doğrulanmış DNS ve kontrol zamanı ortak raporda yer alsın. Kullanıcı adı yalnız gerçek API/çözümlenmiş yayın kanıtından alınsın; bulunamazsa sebebi yazılsın. | Kullanıcı istediği hesapları ekler/kaydeder; eksik bilgi ile boş içerik karışmaz. |
| 13 — Doğrulama ve tamamlama | Playlist yedeğinde seçili geri yükleme, Room sayımı ve boş kabuk onarımı zaten var. MAC giriş kutusu da sınırlı yükseklikte. | Tam/yalnız metadata yedeklerini, boş listeyi, yarım geri yüklemeyi ve seçilen listeleri telefonda test et. Yerel sıfır içerik ile sunucunun geçmiş toplamını ayır. Gerçekten boş liste gereksiz onarım döngüsüne girmesin. Uzun MAC girdisi içeriden kaymaya devam etsin. | İstenmeyen listeler yüklenmez; boş karta eski içerik sayısı yazılmaz; ekran uzun girişte uzamaz. |
| 14 — Geliştirme | MAG/native tarafında host bekletme var; ortak Xtream isteğinde ilk hatadan sonra sabit 350 ms tekrar var. | Xtream'e durum koduna göre sınırlı tekrar, `Retry-After`, host kuyruğu ve iptal edilebilir bekleme ekle. Manuel paralellik girişini koru; ayarlanan ve gerçekten çalışan işi ayrı göster. Hesap içeren URL/logları maskeli tut. | Geçici yoğunlukta yanlış retler azalır; hata nedeni görünür olur. Koruma aşma veya ban bağışıklığı vaadi yapılmaz. |

## 2. “Zorla çık” butonunun önerilen davranışı

Bu bölüm uygulama tasarımıdır; kullanıcıyla kararlaştırıldıktan sonra kodlanacak.

1. Üst çubukta “Zorla çık” yer alacak. Sonuç seçimi, tarama, katalog hazırlama ve yükleme pencereleri açıkken de aynı çıkış yolu erişilebilir olacak. TV kumandasıyla odaklanabilecek.
2. İş bitmişse açık işlem katmanları kapanacak ve mevcut yetkili profilin ana ekranına dönülecek. Tarama günlüğü, TXT ve playlistler silinmeyecek.
3. İş sürüyorsa önerilen varsayılan **“Duraklat ve çık — bulunanları koru”**. Native tarama/ekleme için mevcut pause API'leri kullanılabilir. Duraklatılamayan kısa testlerde iptal ve kalıcı iş durumu ele alınacak; tamamlanan kayıtlar geri alınmayacak.
4. Kullanıcı isterse, servis sorunları giderilip native sahiplik doğrulandıktan sonra **“Arka planda sürdür ve çık”** seçeneği de sunulabilir. Ekrana bağlı JS işini native işmiş gibi arka planda devam ediyor göstermeyeceğiz.
5. Ağ isteğinin sonsuza kadar tamamlanmasını beklemek çıkışı engellemeyecek. Ekrandan ayrılma ile işin durumu ayrı takip edilecek. İşten gelen geç olaylar kapanmış ekrana veya başka profile sonuç yazmayacak.
6. Çıkılmış bir oturumun sonuç penceresi aynı oturumda kendiliğinden tekrar açılmayacak. Sonuçlar kullanıcı “Tarama arşivi / Yarım kalan işler” üzerinden istediğinde açılabilecek.
7. Normal geri tuşu geçmiş varsa geri dönecek, geçmiş yoksa güvenli ana ekran hedefini kullanacak. Profil/PIN kapısı atlanmayacak.
8. Bir buton ana iş parçacığı tamamen donduğunda çalışamaz. Bu nedenle butonla birlikte kurtarma/şifre çözme ve ağır veri işlemeyi ana iş parçacığından ayırmak gerekir; buton tek başına bütün donmaları çözmüş sayılmayacak.

**Kabul testi:** kurtarmadan açılmış ekle ekranı; boş geçmiş; aktif tarama; duraklamış tarama; sonuç modalı; liste ekleme modalı; internet cevabı geciken iş; telefon geri tuşu ve TV geri tuşu. Çıkıştan sonra DB sayısı ve son checkpoint korunmalı, ekle ekranı kendiliğinden geri gelmemeli.

## 2.1. Tarama sırasında boş kalan emniyet TXT'si

Kullanıcının 08.10.2026 ek bildirimi: “Tarama esnasındaki emniyet sibobu olarak TXT dosyası boş oluyor, hiçbir şey yazılmıyor.” Bu sorun **ilk paketteki 4. maddenin açık kabul koşuludur**; sonraki isteğe bağlı geliştirmelere bırakılmayacak. Henüz kaynak düzeltmesi yapılmadı.

- Bulunan ilk sonuç kalıcı günlüğe kaydedildiğinde TXT yazım işi başlatılmalı; yalnız tarama sonunda yazılan dosya emniyet amacı için yeterli değil.
- Doğru tarama oturumu, profil, paket (normal/DEV), dosya URI'si ve kullanıcının açtığı dosyanın aynı olup olmadığı kontrol edilmeli. Yazım hatası, erişim izni, kuyruk/flush gecikmesi ve yanlış dosya hedefi kanıtla ayrılmalı; neden şimdiden varsayılmamalı.
- “Dosya oluşturuldu” yazım başarısı değildir. Yazım sonrasında dosya yeniden açılıp ayrıştırılmalı; byte boyutu, gerçek kayıt sayısı ve beklenen kalıcı sonuç sayısıyla uyumu kontrol edilmeli. Hesap değerleri tanı loguna yazılmamalı.
- Ekran ayrı ayrı “Veritabanında N sonuç”, “TXT'de doğrulanmış M sonuç”, “Yazım bekleyen K sonuç” ve son başarılı yazım zamanını göstermeli. DB doluyken TXT boşsa görünür hata/uyarı verilmeli; başarılı yedek etiketi kullanılmamalı.
- Duraklatma, normal bitiş ve kontrollü çıkışta bekleyen yazım ele alınmalı. Ani güç kesilmesinde son doğrulanmış TXT nesli korunmalı; daha yeni kalıcı DB sonuçları açılışta dosyaya tamamlanabilmeli.
- Kabul testi MAG ve Xtream taramalarını kapsamalı: ilk bulunan sonuç, devam eden tarama, çok sayıda sonuç, yazım erişim hatası, duraklatma, “Zorla çık” ve süreç kapanıp yeniden açılması. Oluşan dosya uygulamaya geri alınarak hesap bilgileri ve kayıt sayısı karşılaştırılmalı.

Önceki cihaz incelemesindeki bir oturumda 678 kayıtlı TXT bulunmuş olması, kullanıcının bildirdiği boş dosya olayının çözülmüş olduğu anlamına gelmez. İlgili dosya/oturumun kökü kod ve yeni kanıtla ayrıca doğrulanacak.

## 3. Koddan dayanaklar

| Konu | Güncel kaynak / kanıt |
|---|---|
| Kurtarma giriş yönlendirmesi | [index.tsx:75](C:/Projeler/kizilkan-player-elite/frontend/app/index.tsx:75), `91`: kurtarılabilir taramada `/add-playlist` ile replace. |
| Ekle ekranında geçmişe bağlı geri oku | [add-playlist.tsx:2896](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2896). |
| Sonuç/yükleme modalı kapanış koşulları | [add-playlist.tsx:3699](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:3699), `3936`, `4140`. |
| Mevcut pause API'leri | [panel-scan/index.ts:136](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/index.ts:136), [native-core/index.ts:411](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/index.ts:411). |
| Kurtarma başlangıç sırası | [PanelScanService.kt:309](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:309), `313`: sonuç hazırlığı foreground çağrısından önce. |
| Görünen sonuç ve yedek durumu | [add-playlist.tsx:1445](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1445): sayfaları toplama, üç durum yerine truthy/falsey yedek değerlendirmesi, otomatik recovery. |
| TXT yeniden yazımı | [ScanSafetyBackup.kt:16](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanSafetyBackup.kt:16), `53`: flush ve mevcut URI'ye `wt`. |
| Kimlik bilgisi harf duyarlılığı | [add-playlist.tsx:452](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:452). |
| Katalog testi ve hata kaybı | [add-playlist.tsx:321](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:321), `332`, `344`: tüm adaylar, 20 işçi, hata → `err`. |
| Normal MAG yenileme ve hızlı yol farkı | [refreshPlaylist.ts:390](C:/Projeler/kizilkan-player-elite/frontend/src/utils/refreshPlaylist.ts:390), [stalker.ts:3042](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:3042). |
| Canlı motor/timeshift ölçümü | [PlayerHost.tsx:1059](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:1059), `1108`, `4101`: onPause arming, timeshift hazırlığı ve FIRST_FRAME olayları mevcut. |
| Port/path seçimi ve mevcut koruma filtresi | [mag-bulk.tsx:281](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:281), `290`, `744`, `753`. |
| Bitiş, TXT ve sınırlı MAC giriş alanı | [mag-bulk.tsx:496](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:496), `784`, `824`. |
| Mevcut seçili playlist geri yükleme | [backup.tsx:218](C:/Projeler/kizilkan-player-elite/frontend/app/backup.tsx:218), [backupV3.ts:143](C:/Projeler/kizilkan-player-elite/frontend/src/utils/backupV3.ts:143), `288`: doğrulanmış yerel sayılar. |
| Boş liste seçimi/onarımı | [PlaylistContext.tsx:1445](C:/Projeler/kizilkan-player-elite/frontend/src/store/PlaylistContext.tsx:1445): recovery barrier ve doğrulanmış sıfır sayımı mevcut. |
| Ortak Xtream tekrar politikası | [iptv.ts:352](C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:352), `370`. |

678/239, servis çökmesi, panel-a süreleri, API uyumu ve katalog kimliği riskinin ayrıntıları [önceki cihaz raporunda](C:/Projeler/kizilkan-player-elite/GPT-v18.7.27-CIHAZ-KURTARMA-KATALOG-MIMARI-2026-10-08.md) bulunuyor. Bu plan hazırlanırken yeni cihaz/API ölçümü yapılmadı. Player yavaşlığının ve 239'da kalan UI aktarımının kesin olay zinciri hedefli ölçüm gerektiriyor.

## 4. Hazır proxy güncellemesi ve isteğe bağlı ekler

Proxy katalog değişikliği ayrı olarak hazır: **8 yeni kaynak, 17 yeni URL; toplam 19 kaynak/47 URL**. Eski listeler etiketli. TypeScript ve genel denetim geçti. APK/cihaz kabul testi henüz yapılmadı. Sonraki kabul testinde kaynak seçimi, indirme, gerçek native proxy testi ve kullanıcı tercihlerinin yeniden açılışta korunması doğrulanacak. Kaynak indirme başarısı canlı proxy başarısı değildir.

Ana sorunlardan sonra, kullanıcı isterse:

- MAG/Xtream ortak “en az N gün kalan” filtresi; bilinmeyen bitiş ayrı seçenek.
- CSV dışa aktarımı; gerekirse sonraki aşamada XLSX.
- Kategori adlarına dayanan, kullanıcının düzeltebildiği ülke/dil etiketleri.
- Portal sağlık geçmişi ve daha anlaşılır oturum özeti.
- Seçili Room içeriklerinin kategori/EPG/logo/başlıkları korunarak M3U dışa aktarımı.
- Telefon/TV arasında QR aktarımı; bu ayrıca kapsam ve paylaşım tasarımı gerektirir.

Manuel paralellik, mevcut motorlar, kalıcı PlayerHost, Room, canlıyı önce hazırlama ve tek upstream bağlantısı korunacak. Python dosyalarındaki masaüstü oynatıcı komutları veya şüpheli başarı ölçütleri doğrudan kopyalanmayacak.

## 5. Önerilen uygulama ve yayın sırası

1. **İlk paket: 1–5.** Ekrandan çıkış, kurtarma çökmesi, bütün sonuçların görünmesi, TXT ve hesap kimliği. Kalıcı veri güvenliği önce.
2. **İkinci paket: 6–10.** Testin doğruluğu, MAG katalog hızı/tamlığı, canlı ilk kare ve çalışan DNS'ler.
3. **Üçüncü paket: 11–14.** Mevcut keşif/seçim/rapor/yedek senaryoları ve ortak istek politikası.

Bu paketler uygulama sırasıdır; kullanıcı kararlaştırırsa hepsi tek nihai APK'da yayımlanabilir. Her aşama bağımsız doğrulanmalı; bir sonraki aşamaya geçerken önceki özellikler korunmalı.

Her kod güncellemesinde değişen dosya, değişikliğin nedeni, test sonucu ve kalan iş Opus devir dosyasına yazılacak. Sürüm alanları ve dal güncellenecek. TypeScript, proje denetimleri ve Kotlin değiştiyse native derleme yapılacak. Ardından gerçek cihazda açılış, kurtarma, çıkış, liste/hesap ve player senaryoları doğrulanacak.

Yayın kararlaştırılan kapsam bittikten sonra: commit → ayrı dala push → GitHub Actions **manuel** `release` → mevcut normal uygulamanın anahtarıyla imzalı APK. Actions sonucu takip edilecek; hata varsa logdan sebebi düzeltilip tekrar doğrulanacak. Telefon bağlıysa verileri kaldırmadan güncelleme; değilse erişilebilir indirme bağlantısı. Depo özel olduğundan GitHub erişimi gerektiren bağlantı ile herkese açık indirme bağlantısının farkı açıkça bildirilecek; hesap arşivleri build/release dosyalarına eklenmeyecek.

## 6. Kontrol edilen resmi teknik kaynaklar

- Foreground servisin ağır hazırlıktan önce foreground durumuna geçirilmesi, Android'in kısa başlangıç süresi kuralıyla uyumludur. [Android foreground servis sorun giderme](https://developer.android.com/develop/background-work/services/fgs/troubleshooting).
- Router'da `back` önceki sayfaya, `replace` mevcut sayfanın yerine geçer; bu yüzden kurtarmada geçmişsiz ekran için açık dönüş hedefi gerekir. [Expo Router gezinme belgesi](https://docs.expo.dev/router/basics/navigation/).
- Media3 gerçek ilk görüntü karesini `onRenderedFirstFrame` olayıyla bildirir; katalog sayısı bu ölçümün yerine geçmez. [Media3 AnalyticsListener](https://developer.android.com/reference/androidx/media3/exoplayer/analytics/AnalyticsListener).

Bu kaynaklar mimari önerileri destekler; cihazın gerçek açılış süresi veya bütün panellerin API uyumu için garanti oluşturmaz.
