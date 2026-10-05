# GPT — Python referansları ve güncel MAC akışı incelemesi

Tarih: 05.10.2026. İncelenen uygulama: v18.7.13 RC1. Dal: `v18.7.13-rc1-exact-scope-username-mac`. Karşılaştırma sonunda HEAD: `31bd8e5c`.

Bu belge Opus'a devredilmek üzere hazırlanmıştır. Uygulama kaynak kodu değiştirilmedi; gönderilen Python programları çalıştırılmadı, import edilmedi, bağımlılıkları kurulmadı ve içlerindeki sunuculara istek gönderilmedi. Python dosyaları metin ve AST olarak incelendi. Uygulamanın gerçek TypeScript modülleri yalnız sahte ağ yanıtlarıyla çalıştırıldı. Telefon üzerinde bu inceleme kapsamında yeni ölçüm yapılmadı.

İnceleme, altı dosyanın yapısı ve MAC/portal/hesap/yayın işlemleriyle ilgili bölümlerine odaklanır. Genel araç paketlerinin bütün APK dönüştürücüleri, ses efektleri ve arayüz özellikleri için eksiksiz denetim yapıldığı iddia edilmez. Sözdizimi kontrolünün geçmesi programın doğru veya güvenli çalıştığını kanıtlamaz.

Önceki rapor: [03.10.2026 ayrıntılı inceleme](C:/Projeler/kizilkan-player-elite/GPT-OPUS-DETAYLI-INCELEME-2026-10-03.md). Önceki rapordaki bulguların bir kısmı Opus tarafından düzeltilmiştir; bu belgede mevcut koddan yeniden doğrulananlar ayrıca belirtilir.

## 1. En önemli sonuçlar

1. **Çoklu aramada çalışan hesabın reddedilmesine yol açabilecek API uyumluluk farkı halen var.** Tekli oynatma `get_all_channels` kullanabiliyor; çoklu doğrulama yalnız `get_ordered_list` üzerinden örnek arıyor. Aynı sahte hesap tekli katalogda bir kanal döndürürken çokluda `unverified` oldu. Bu, kullanıcının bütün portal sorunlarının tek kökü olduğunun kanıtı değildir; kodda ve ağsız deneyde doğrulanan somut bir yanlış negatif yoludur.
2. **Gerçek kullanıcı adı halen yanlış bilgiyle değiştirilebiliyor.** Profilde doğru `login` varken main-info içindeki `fname/name`, normalize edildikten sonra `username` olarak onun üzerine yazılıyor. Profil zenginleştirmesi tek başına bunu çözmüyor.
3. **Base64 MAC düzeltmesi hesap eşleştirmesine geldi, ancak kullanıcı adı seçiminde eksik.** MAC karşılaştırması decode işleminden önce yapılıyor; base64 MAC, kullanıcı adı olarak seçilip sonraki gerçek `username` alanını engelleyebiliyor.
4. **v18.7.13'teki iki ek profil isteği bütçesi gerçek istek bütçesi değil.** Boş/hatalı yanıtlar sayılmıyor; bir varyant grubunda sınır dolunca sonraki gruba yine giriliyor. Deneyde ilk yanıttan sonra üç ve sekiz ek istek gerçekleşti.
5. **“Yalnız girilen” kapsamı her durumda kati değil.** Portsuz girişte otomatik `fallback` yapılması sürüyor. Portlu `/c/` girişinde HTML bağlantıları ve soft-404 karşılaştırması ek yolları yokluyor. Arayüz açıklaması ile v18.7.13 devir belgesindeki kati kapsam tanımı da farklı.
6. **Gönderilen programların hiçbiri bütünüyle kopyalanabilecek doğruluk örneği değil.** Yararlı protokol sıraları var; ayrıca yanlış endpoint kullanımı, HTTP 200'e fazla güvenme, metinle JSON parçalama, hatalı VPN etiketleri ve uydurma M3U adresleri de var.

## 2. İncelenen referans dosyalar

Üç dosya ilk okumadan sonra belirtilen Masaüstü konumunda bulunamadı; aynı ad ve aynı boyutla Downloads/Telegram Desktop altında bulundu. Aşağıdaki bağlantılar fiilen okunan dosyalara gider. Benzer adlı `ALPHA_WOLVES_M3U-MAC_V4.2.py` farklı dosyası bu karşılaştırmada kullanılmadı.

| Referans | Okunan dosya | Boyut / fiziksel satır | Asıl işlev ve değerlendirme |
|---|---|---|---|
| PY01 | [ALPHA_WOLVES_M3U-MAC_V.4.2_.py](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA_WOLVES_M3U-MAC_V.4.2_.py>) | 153.659 bayt / 2.916 | M3U/Xtream ve MAC tarayıcı. `check_mac` handshake + profile yapıyor; hesap/içerik kanıtı yetersiz. |
| PY02 | [ALPHA-PRO-SCAN-VPN- V.3.3.5.py](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py>) | 377.666 bayt / 7.455 | MAC handshake/profile/main-info, içerik/kategori, M3U dönüştürme. Karşılaştırma için geniş örnek; doğrulama ve endpoint akışında ciddi kusurlar var. |
| PY03 | [ALPHA-WOLFS-TOOLS--.py](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS--.py>) | 409.998 bayt / 8.357 | Genel masaüstü araç paketi. Son bölümde Stalker Tester var; tam MAC client/oynatıcı örneği değil. |
| PY04 | [ALPHA-WOLFS-TOOLS-V.8.1 -.py](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS-V.8.1 -.py>) | 241.843 bayt / 5.183 | Genel araç paketi; görülen IPTV player bölümü M3U/Xtream. Stalker `handshake/get_profile/get_main_info/create_link` akışı için referans bulunmadı. |
| PY05 | [MΔC√RΔIDΞR_Duo_v4_Ⲃⲟⲟⲙ.py](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/MΔC√RΔIDΞR_Duo_v4_Ⲃⲟⲟⲙ.py>) | 292.193 bayt / 6.497 | Endpoint ön inceleme ve kullanıcı seçimi, MAC hesap/medya bilgileri. Keşif ve hesap fazlarını ayırma fikri yararlı; portal ve VPN etiketleri kanıttan daha güçlü. |
| PY06 | [Universal_Mac_Scanner.py](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/Universal_Mac_Scanner.py>) | 48.161 bayt / 1.383 | Eski tarz global durumlu scanner. Profil varyantları, main-info ve create_link görülebiliyor; JSON ayrıştırma, döngüler ve hata yönetimi örnek alınmamalı. |

Altı dosyanın tamamı `ast.parse` sözdizimi kontrolünden geçti. Toplam 31.791 fiziksel satır. Dosya kimlikleri:

```text
PY01 a7c0c47b9cddc8964a64b57648c8659477dece5a197f666a845c4ce263db9b5f
PY02 65c5f098e0c527d004fb7e927f732ad065a2f19c55d38a000899dc8eccadec78
PY03 558e32954d6f494b595ac3efd3b5e6566af8171d34fa2df1ad83644ff1325a6c
PY04 392e62b19cb6f2c61ed2b969f0e23ab567c560a91c4e7932fd38ecf3581f7d4f
PY05 6d622f2e7adaff0ee79cf861767cbc0d7a16c696b810d981508b9544ed3dc7eb
PY06 bb5ceb35034c8f0747ece66e4dfa97161d185b2b7e3877cd16ff4d7f640f1d41
```

## 3. Güncel uygulamada doğrulanan hata ve eksiklikler

P1: Kullanıcının temel işlemini yanlış sonuçlandırabilir veya ciddi bekleme yaratabilir. P2: Bilgi doğruluğu, kapsam anlaşılması veya dayanıklılık sorunu. “Uyumluluk riski” diye belirtilen satırlar gerçek portalda tekrar gerektirir; o portalın kesin kökü olarak sunulmamalıdır.

| ID / önem | Mevcut durum ve kod kanıtı | Sebep → sonuç | Yapılması gereken | Yapılınca ne olacak |
|---|---|---|---|---|
| G01 / P1 / deneyle doğrulandı | [stalkerVerifyAccount](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2280) canlı/VOD/dizi için yalnız `get_ordered_list`, p=0/1 kullanıyor. [stalkerChannels](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1814) önce `get_all_channels` kullanıyor. | `get_all_channels` çalışıyor, ordered-list desteklenmiyorsa aynı hesap normal player'da katalog açıyor ama çokluda reddediliyor. Fixture sonucu: tekli 1 kanal, çoklu `unverified/no-accessible-catalogue-sample`. | Tekli ve çoklu için ortak API yetenek/yanıt şekli sözleşmesi oluşturulsun. Hesap doğrulamasına toplam zaman ve yanıt boyutu sınırını koruyan get_all_channels uyumluluk yolu eklensin; tam büyük kataloğu sınırsız indirmesin. Desteklenmeyen işlem ile yetkisiz erişim ayrıştırılsın. | Gerçekten erişilebilir hesap sırf farklı katalog API'si kullanıyor diye kaybolmaz. Büyük yanıt sınırında kesin “geçersiz” yerine doğrulamanın tamamlanamadığı açıklanır. |
| G02 / P1 / deneyle doğrulandı | [Snapshot birleştirmesi](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2094), [çoklu birleştirmesi](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2220), [alan seçimi](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2007). | Profilde gerçek `login`; main-info'da yalnız `fname` olsa bile normalize edilen main-info `username` değeri gerçek login'i ezer. `hasRealLogin` ile doğru profil bulunması birleştirmede kaybedilebilir. | Alan değeriyle birlikte kaynak ve anlam saklansın. Gerçek giriş alanı, genel görünen addan üstün olsun. Main-info yalnız aynı anlamdaki otoriter alanı güncellesin. `displayName` ile `username` ayrı olsun. | Kullanıcı adı kartta/TXT'de hesap numarası veya görünen adla değişmez. Doğru profil zenginleştirmesi korunur. |
| G03 / P2 / deneyle doğrulandı | [pickUsernameField](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2012): MAC elemesi ham değerde, decode dönüşte. [accountMatchesMac](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2148) ise artık decode ediyor. | `mac=gerçek MAC`, `login=aynı MAC'in base64 hali`, `username=gerçek giriş adı` durumunda login önce seçiliyor ve MAC'e çözülüyor. Sonraki gerçek giriş alanı okunmuyor. | Her aday önce normalize/decode edilsin, sonra MAC eşitliği kontrol edilsin; MAC çıkan aday atlanarak sonraki giriş alanına geçilsin. MAC alanı bulunmasa da geçerli MAC biçimi giriş adı kabul edilmesin. | MAC, kullanıcı adı gibi gösterilmez; gerçek sonraki alan bulunur. A01 düzeltmesi ile kullanıcı adı normalizer'ı tutarlı olur. |
| G04 / P1 / deneyle doğrulandı | [stalkerProfile bütçesi](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1749): `LOGIN_SEEK_BUDGET=2`, sayaç yalnız dolu ikinci profillerde artıyor; `tryVariants` null dönünce derived grubu yine çağrılıyor. | İlk dolu login'siz profil sonrası boş veya hatalı yanıtlar bütçe tüketmiyor. Bir grupta dolan sınır sonraki grubu engellemiyor. Fixture: dolu yanıtlarda 4 toplam/3 ek; sonraki boş yanıtlarda 9 toplam/8 ek istek. Her isteğin 20 sn timeout'u var; toplam süre bu aşamada garanti edilmiyor. | İlk kullanılabilir profil sonrası her gerçek deneme sayılmalı: başarı, boş yanıt, ağ hatası. Gruplar arasında tek ortak bütçe ve bitiş zamanı olmalı; süre dolunca best dönülmeli. Cancellation/koruma hataları terminal kalmalı. | Kullanıcı adı zenginleştirmesi tekli ekleme, çoklu kontrol ve taze oynatma oturumunu gereksiz uzatmaz. “İki ek deneme” sözü gerçek olur. |
| G05 / P1 / deneyle doğrulandı | [Scope yükseltmesi](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:191): `!hasPort && exact` → `fallback`. [HTML bağlantıları](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:321) exact kontrolü olmadan baseline ve linked API yollarını kuyruğa alıyor. [UI metni](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:61) `/c/` API çözümüne izin veriyor; [exact dalı](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:441) kati kapsam diyor. | Portsuz tam PHP adresinde exact + iki aday sınırı bile 55 sahte istek üretti; diğer portlara gidildi. Portlu `/c/` + linkli HTML için `/c/`, soft-404 yolu ve `/server/load.php` çağrıldı. v18.7.13'ün “yalnız girilen yol” iddiası tüm kod yollarında geçerli değil. | Ürün sözleşmesi tekleştirilsin. Exact seçimini portsuz giriş nedeniyle sessiz genişletme kaldırılmalı veya UI açıkça farklı modu göstermeli. `/c/`→API çözümü isteniyorsa ayrı, açık tanımlı kapsam olmalı; baselining ve link kuyruğu da aynı kapsam denetimine girmeli. | Kullanıcı kaç port ve hangi yolların deneneceğini önceden anlayabilir. “Yalnız girilen” ile geniş tarama beklenmedik şekilde karışmaz. |
| G06 / P1 / deneyle doğrulandı | [stalkerAccountSnapshot](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2094), herhangi bir obje için mainInfoOk=true ve alan birleştirmesi. | Başka MAC'e ait main-info kayıt alanları profil hesabının üstüne yazılıyor. `{js:{}}` bile `main-info` başarılı/otoriter kaynak sayılıyor. Bulk verifier'da MAC kontrolü var; snapshot yolunda aynı kontrol yok. Fixture iki durumu da doğruladı. | Snapshot'a da MAC eşleştirme ve anlamlı hesap kaydı kontrolü eklensin. Eşleşmeyen veya boş main-info kabul edilmesin; profile fallback ve açık neden kaydı olsun. | Hesap kartına yanlış MAC/kullanıcı/bitiş yazılması önlenir. Başarılı main-info telemetrisi gerçekten anlamlı yanıtı ifade eder. |
| G07 / P1 / mevcut uyumluluk riski | [discoverMagPortal](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1413) yalnız `preferredCompatProfiles(cred)[0]` ile discovery handshake yapıyor. [Normal handshake](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1475) daha geniş profil planı kullanıyor. | Pasif keşifte iz vermeyen ve ilk cihaz profilini kabul etmeyen endpoint, normal login'in uyumluluk yoluna ulaşmadan elenebilir. Gönderilen profil varyantları bu farkı incelemek için örnek; her varyantın gerekli olduğu kanıtlanmadı. | Bilinen ve kullanıcıca sağlanmış endpoint için keşif/normal login farkı fixture ile ölçülsün. Başarılı öğrenilmiş profil veya sınırlı ortak uyumluluk sözleşmesi kullanılmalı; port×path×profil çarpımını büyütme çözüm sayılmamalı. | Keşif ön kapısı, sonrasında çalışabilecek meşru endpoint'i yanlışlıkla reddetmez. |
| G08 / P1 / süre ve kapsam eksikliği | [Pasif keşif](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:177) toplam deadline taşımıyor. [Port sınıflaması](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:381), [bilinmeyen portlar](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:433), [handshake fallback](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:195) farklı sınırlar kullanıyor. | Pasif faz, port fazı ve en çok üç MAC'le handshake fallback bütçeleri birbirine eklenebilir. v18.7.11'de eklenen `wallBudgetMs` yalnız aktif discoverMagPortal içindir. 96/48 aday kesmeleri bazı adaylara hiç ulaşılmamasına da yol açabilir. | İşlem/host başına ortak deadline ve toplam gerçek istek sayacı olmalı. Durdurma sonucunda hangi fazın ve kaç adayın tamamlandığı tutulmalı; eksik keşif kesin “portal yok” diye sunulmamalı. | Bekleme süresi ölçülebilir hale gelir. Kullanıcı yanlış port/path mi, süre sınırı mı, gerçek ret mi olduğunu ayırabilir. |
| G09 / P2 / deney gerektiren performans bağlantısı | [Taze resolve](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:3044) session yoksa `stalkerLogin` bekliyor; login profil işini de yapıyor. [Motor geçişi](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:1641) force-fresh resolve istiyor. | G04'teki kullanıcı adı arama gecikmesi yeni/taze oynatma oturumunun kaynak verilmeden önceki süresine eklenebilir. Python'daki stream HTTP kontrolü bunu veya decoder'ın ilk karesini ölçmüyor. | Oynatma için gerekli session/profile alanlarıyla hesap kartı zenginleştirmesi ayrılmalı. G04 düzeltilmeli; kaynak öncesi, create_link, kaynak sonrası ve ilk kare süreleri aynı seçim kimliğiyle ölçülmeli. | Kullanıcı adı aramak, gerekli değilse ilk görüntüyü bloke etmez. “Tamponlama” ile kaynak hazırlama gecikmesi ayrı teşhis edilir. |
| G10 / P2 / sonuç anlamı | [Bulk doğrulama](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2287) pozitif id + ad + kullanılabilir cmd taşıyan katalog örneğinde verified dönüyor; create_link/decoder ilk karesi denenmiyor. | Katalog erişimi doğrulanması yayının oynadığını ispatlamaz. Token, URL veya kategori varlığından “kesin çalışan hesap” sonucu çıkarmak referanslardaki hatayı tekrarlar. Bu, mevcut sınırlı doğrulama tasarımının hatalı olduğu anlamına gelmez; başarı etiketinin anlamı açık olmalıdır. | Kart ve telemetride “hesap/katalog erişimi doğrulandı” ile “oynatma denendi/ilk görüntü geldi” ayrı durumlar olsun. İsteğe bağlı oynatma testi kullanıcı seçimiyle ve mevcut bağlantı sınırına uygun yapılsın. | “Bulundu ama fos” geri bildirimi hangi aşamanın geçtiğiyle açıklanabilir. Tarama her hesaba otomatik ikinci yayın bağlantısı açmaz. |

### G01'in ilgili kullanıcı şikâyetiyle ilişkisi

Kullanıcı “port ve path girsem de girmesem de bulunamıyor” diyor. G01, endpoint doğru seçilmiş olsa bile hesap fazında çalışan hesabın reddedilebildiğini gösterir. Dolayısıyla yalnız keşif yollarını genişletmek bu sorunu çözmez. Önce logda seçilen endpoint ve reddin `no-accessible-catalogue-sample`, `profile-mac-mismatch`, auth, koruma, DNS veya deadline olup olmadığı ayrılmalıdır. G01 tüm başarısız portalların kesin sebebi olarak yazılmamalıdır.

### Kullanıcı adı neden başka programda görünüyor olabilir?

Üç ayrı ihtimal var: daha dolu `get_profile` yanıtının gerçek `login` vermesi; portalda login'in farklı anlamlı alanda bulunması; verilen playback URL'sinin açıkça Xtream tarzında kullanıcı/şifre taşıması. Bu kaynaklar birbirinin yerine kullanılamaz. Görünen ad, hesap numarası, MAC, PIN/parent_password ve oynatma tokenı giriş bilgisi değildir. IPTV Extreme Pro'nun hangi kaynağı kullandığı bu dosyalarla kanıtlanmadı.

[Infomir'in erişim dokümanı](https://wiki.infomir.eu/eng/ministra-tv-platform/ministra-installation-guide/faq/how-to-organize-the-access-to-the-portal-by-login-and-password), yönetici tarafından verilen login/password ile MAC bağlamasını tarif ediyor. Bu, her MAC portalın `get.php/player_api.php` hizmeti sunduğu veya playback tokenından Xtream hesabı çıkarılabileceği anlamına gelmez.

## 4. Referans programlardaki somut hatalar ve alınabilecek fikirler

| ID | Mevcut referans kodu / kanıt | Sebep ve sonuç | Player için öneri / beklenen sonuç |
|---|---|---|---|
| P01 | PY01 [check_mac](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA_WOLVES_M3U-MAC_V.4.2_.py:1838>) | `/server/load.php` handshake başarısızsa `/portal.php` deneniyor. Token alternatiften alınsa da `base_url` güncellenmiyor; [profil isteği](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA_WOLVES_M3U-MAC_V.4.2_.py:1863>) eski endpoint'e gidiyor. | Başarılı endpoint session'ın parçası olarak taşınmalı. Bizim StalkerSession.endpoint tasarımı korunmalı; bu kod doğrudan taşınmamalı. |
| P02 | PY01 [profil geçerliliği](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA_WOLVES_M3U-MAC_V.4.2_.py:1883>) | id/name/mac alanlarından herhangi biri doluysa valid. MAC eşitliği, açık blok/süre ve içerik erişimi burada kontrol edilmiyor. Profil varlığı geçerli abonelikle karışıyor. | Bizim daha katı eşleştirme/denial/sample yaklaşımı korunmalı; G01 uyumluluk eksikliği giderilmeli. |
| P03 | PY01 [cihaz kimliği](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA_WOLVES_M3U-MAC_V.4.2_.py:1861>) | Her check'te rastgele seri numarası; UA MAG200, X-User-Agent/profile MAG254. Kimliğe bağlı sunucuda tutarsızlık olabilir. Gerçek sunucuda etkisi test edilmedi. | Session ve kullanıcı cihaz kimliği tutarlı tutulmalı. Rastgele kimlik değiştirme veya başlık taklidi hata çözümü diye taşınmamalı. |
| P04 | PY01 [hit çıktısı](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA_WOLVES_M3U-MAC_V.4.2_.py:2043>) | Kullanılan gerçek API endpoint yerine `/c/` yazılıyor; token TXT içine açıkça ekleniyor; yalnız end_date ile sınırlı tarih çıktısı var. | Seçilen doğrulanmış endpoint ve kaynağı yazılmalı. Tanı raporunda token bulunmamalı; hesap dışa aktarımı ile tanı bilgisi ayrılmalı. |
| P05 | PY02 [handshake/profile parse](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:1703>) | Token sabit JSON önekiyle replace/split, profile yalnız `"id":` metniyle kabul. Boşluk/alan sırası değişmesi çalışan yanıtı bozabilir; farklı içerikte anahtar görünmesi yanlış kabul yaratabilir. | JSON parser ve şema/alan tip kontrolleri kullanılmalı. Ham metin örnekleri, anonim fixture varyantları üretmekte kullanılabilir. |
| P06 | PY02 [check_mac](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:1797>) | Main-info'da phone/end_date/mac kelimesi bulunması yeterli; ardından valid. Gerçek MAC ve erişim kanıtı yok. [Expiry](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:1731>) bulunamazsa LIFETIME yazıyor. | Bilinmeyen bitiş sınırsız kabul edilmemeli. Gerçek tarih, bilinmeyen, sınırsız ve süresi geçmiş ayrı kalmalı. |
| P07 | PY02 [otomatik path akışı](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:1820>), [işçi](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:2369>) | Auto seçilince her MAC için seçili path listesi tekrar deneniyor. Kullanıcının özellikle istemediği MAC×path çarpımını bu referans da kullanıyor. | Bizim host keşfi → tek endpoint seçimi → kullanıcı tarafından sağlanan hesapların doğrulanması ayrımı korunmalı. Bu döngü taşınmamalı. |
| P08 | PY02 [metadata](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:1854>) | Canlı/VOD/dizi kategori ve farklı liste biçimleri toplanıyor: yararlı örnek. Ancak getirilen ilk listenin len'i toplam içerik gibi sunulabiliyor; limit ve eksik sayfalama ayrıştırılmıyor. | Kategori normalizasyon fikri değerlendirilebilir. `sampled`, `loaded`, `total`, `complete` ayrı tutulmalı; TXT'de kategori alınamadı ile boş kategori aynı yazılmamalı. |
| P09 | PY02 [MAC→M3U](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:2178>) | Kullanıcı path'i kesiliyor; handshake `/portal.php`, genres `/server/load.php`. [Yayın URL'si](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:2265>) `/play/live.php?mac=...&stream=...` olarak tahmin ediliyor; gerçek create_link sonucu kullanılmıyor. Dosya yazılması oynatma başarısı sayılıyor. | Portal uyumluluğu olmayan tahmini URL üretimi taşınmamalı. MAG playlist kendi session/cmd modelini korumalı; taşınabilir M3U yalnız gerçekten desteklenen URL sözleşmesiyle sunulmalı. |
| P10 | PY03 [Stalker Tester](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS--.py:7776>) | Handshake → main-info → kanal listesi yapıyor, get_profile yok. Token varlığından sonra bilgi hataları olsa bile sonunda başarı sesi çalabiliyor. | Aşama görünürlüğü yararlı; başarısız aşamalarla genel “başarılı” durumu ayrılmalı. Tam client doğrulaması için bu tester yeterli değil. |
| P11 | PY03 [phone ve expiry](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS--.py:7797>) | phone'u hesap bilgisi olarak ayrı, end_date/expire_billing_date/exp_date'i bitiş için okuyor. PY06 ise phone'u tarih gibi kullanıyor. Klonlar arasındaki veri anlamı farkını gösteriyor. | Alan adı tek başına tarih kanıtı sayılmamalı. Bizde phone-tarih fallback'i yalnız ayrıştırılabilir değerde ve kaynak açık tutulduğunda değerlendirilmeli. |
| P12 | PY03 [kanal sayfalaması](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS--.py:7814>) | `len(data)<14` sabit eşikle bitiriyor; 100 sayfa tavanı var. Portal sayfa boyutu başka ise yanlış toplam/erken duruş mümkün. get_all_channels bazı implementasyonlarda tam liste verir; yorumun “her zaman sayfalı” iddiası evrensel değil. | Sunucunun pagination metadata'sı, benzersiz ID ilerlemesi ve completion bilgisi kullanılmalı. Sabit 14 veya ilk sayfa uzunluğu toplam kabul edilmemeli. |
| P13 | PY04 [IPTV player](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS-V.8.1 -.py:4411>) | M3U dosyası veya host/user/password alıp Xtream get_live_streams okuyor; stream_id'den `/live/user/pass/id.ts` üretiyor. MAC portal kimliği için çözüm sunmuyor. | Kategori ve arayüz örneği olabilir. MAG için kullanıcı adı bulma kanıtı veya Media3/MPV ilk kare çözümü olarak kullanılmamalı. |
| P14 | PY05 [ön keşif](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/MΔC√RΔIDΞR_Duo_v4_Ⲃⲟⲟⲙ.py:4928>) | Endpointleri MAC işçisinden önce değerlendirip kullanıcıya gösterme fikri kullanıcı isteğiyle örtüşüyor. Ancak [tespit](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/MΔC√RΔIDΞR_Duo_v4_Ⲃⲟⲟⲙ.py:5005>) 200/401/403/256 veya genel `tv/api/login` kelimelerinden aday üretip 200'ü en yüksek öncelik yapıyor. Normal web sayfası seçilebilir. | İki fazlı UX fikri kullanılabilir; HTTP 200 yerine STB API envelope/başarılı oturum ve takip eden hesap örneği kanıtı tercih edilmeli. Bizde chooseMagPortals'ın API kanıtını öncelemesi korunmalı. |
| P15 | PY05 [URL/protokol](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/MΔC√RΔIDΞR_Duo_v4_Ⲃⲟⲟⲙ.py:4987>) | HTTPS cevap verdiğinde HTTP alternatifine bakmadan döngüden çıkıyor; bulunan aday kaydı path/status tutuyor, bu aşamada başarılı scheme'i saklamıyor. Sonraki akışla aynı endpoint'in kullanılacağı garanti değil. | URL; scheme, hostname, port ve path ile tek nesne halinde taşınmalı. Status/path listesi session yerine kullanılmamalı. |
| P16 | PY05 [stream probe](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/MΔC√RΔIDΞR_Duo_v4_Ⲃⲟⲟⲙ.py:2738>) | En çok dört redirect izleyip son 200/206'ya bakıyor; response.close kullanımı olumlu. Fakat body/video kanıtı yok. Timeout/404/5xx dahil her erişememe “VPN NEEDED” sayılıyor. | Redirect, erişim, içerik türü, ağ hatası, auth/geo/WAF ve decoder ilk karesi ayrı gösterilmeli. Erişilemedi sonucundan VPN gerektiği çıkarılmamalı. |
| P17 | PY05 [username fallback](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/MΔC√RΔIDΞR_Duo_v4_Ⲃⲟⲟⲙ.py:5824>) | Önce name, boşsa login kullanıyor; sonra player_api yanıtı deniyor. Görünen ad login'i engelleyebilir. Bir klonda desteklenen Xtream API bütün MAG portallarda var sayılıyor. | Genel name'den login üretimi taşınmamalı. G02/G03 çözülmeli. URL içi kimlik varsa kaynağı açıkça ayrı belirtilmeli; MAC hesabı Xtream'e otomatik dönüştürülmemeli. |
| P18 | PY06 [profil/main-info](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/Universal_Mac_Scanner.py:519>) | JSON split ile okunuyor; login/password yalnız tam `stalker_portal/server/load.php` path eşitliğinde toplanıyor. Aynı API farklı kurulum dizinindeyse bilgiler kaçıyor. | Özellik path adıyla değil yanıt şeması ve API yeteneğiyle anlaşılmalı. JSON alanları yapısal okunmalı. |
| P19 | PY06 [hata döngüleri](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/Universal_Mac_Scanner.py:477>), [kanal döngüsü](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/Universal_Mac_Scanner.py:608>) | Sınırsız while/except-pass var. Kanal ID'si sabit beşinci split parçasından alınıyor; az kanal veya farklı JSON biçiminde döngü bitmeyebilir. `ses.close`/`res.close` bazı yerlerde parantezsiz ve return/continue sonrasında. | Deadline, gerçek cancellation, hata sınıfı ve finally ile kaynak kapatma kullanılmalı. Bu eski döngüler client'a aktarılmamalı. |
| P20 | PY06 [url7](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/Universal_Mac_Scanner.py:381>) | Alternatif URL'ler `url7` yerel değişkenine yazılıyor ama `url` dönüyor. Portal tipine özel alternatif hiç dönmüyor. | Fixture'ların sadece URL oluşturulduğunu değil dönen değerin doğru olduğunu test etmesi gerektiğine örnek. |
| P21 | PY06 [yayın/VPN etiketi](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/Universal_Mac_Scanner.py:368>) | Yalnız ilk HTTP 302 başarı sayılıyor. Direkt çalışan 200 bile varsayılan VPN-needed kalabilir; redirect sonrası hata görülmez. | PY05'in bounded redirect fikri daha iyi olsa da G10'daki durum ayrımı esas alınmalı. Bu etiketleme taşınmamalı. |
| P22 | PY01/PY02/PY05/PY06 HTTPS isteklerinde çok sayıda `verify=False`; örnek [PY02 transport](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:1692>) | Sertifika hatası olan sunucunun bu programda çalışması, aynı portalın player transport'u ile aynı şartlarda çalıştığı anlamına gelmez. Bu fark yanlış “API bizde bozuk” teşhisi yaratabilir. | TLS başarısızlığı ayrı teşhis edilmeli; bu programlardaki global doğrulamayı kapatma player'a kopyalanmamalı. [Requests dokümanı](https://requests.readthedocs.io/en/latest/user/advanced/#ssl-cert-verification) verify=False'nin hostname/geçerlilik kontrollerini kaldırdığını açıklıyor. |

Bu programlarda proxy rotasyonu, rastgele/komşu MAC üretimi ve WAF başlığı taklidi bölümleri de var. Bunlar player'ın kullanıcı tarafından sağlanan hesapları doğru işlemesi için gerekli referanslar değildir; bu rapor bunları aktarılacak geliştirme olarak önermiyor. Cloudflare üzerinden hizmet sunulması ile aktif CAPTCHA/challenge, rate-limit veya yetkilendirme reddi ayrı gözlemler olarak kalmalıdır.

## 5. Korunması gereken mevcut düzeltmeler

| Güncel davranış | Kod kanıtı | İnceleme sonucu |
|---|---|---|
| Host başına keşif, sonra endpoint seçimi, sonra hesap işleri | [runMagBulkScan](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:132), [hesap fazı](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:279) | Her kullanıcı MAC'ini her path ile deneme mimarisi artık ana hesap fazının modeli değil. Ancak sınırlı handshake fallback ayrı fazda MAC kullanıyor; bu ayrım logda açık olmalı. |
| API kanıtını HTTP 200'den önce değerlendirme | [chooseMagPortals](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:114) | PY05'teki yalnız HTTP kodu sıralamasına geri dönülmemeli. |
| version.js tek başına API başarı sayılmıyor | [version.js yolu](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:291) | Önceki M05 düzeltmesi mevcut; gerçek API ayrıca yoklanıyor. |
| Koruma/rate-limit görüldüğünde fallback duruyor | [fallback guard](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:174) | Önceki M02 düzeltmesi mevcut; protokol uyumluluğu için terminal koruma engeli delinmemeli. |
| Base64 MAC hesap eşleştirmesi | [accountMatchesMac](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2154) | A01 düzeltmesi mevcut ve testi geçti. G03 farklı kullanıcı adı seçim kusurudur. |
| Manuel portal izi seçimi, ardından hesap kontrolü | [seçim](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:239) | Seçim doğrulama değildir. Uygun aday seçildikten sonra exact hesap kontrolü devam ediyor. |
| Katalog örneği için boyut ve süre sınırı | [verification probe](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2229) | G01 çözülürken 20 sn toplam süre ve yanıt boyutu sınırları kaybedilmemeli. |
| Motor değişince taze MAG çözümleme | [PlayerHost](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:1641) | Python'daki test URL'sini motorlar arasında dolaştırmak çözüm değil. Geçici create_link URL'si session/bağlantı durumuyla yönetilmeli. |

## 6. Player ilk görüntü değerlendirmesi

Bu Python programları native Media3, MPV, VLC decoder ve canlı timeshift motorumuzun eşdeğeri değildir. Bir yayına HTTP 200/206 gelmesi, decoder'ın ilk görüntüyü gösterdiğini veya duraklat/geri sar işlevinin sağlıklı olduğunu kanıtlamaz. Bu nedenle “bu Python hızlı buluyor; aynı motoru taşıyalım” önerisi çıkarılmamalıdır.

Mevcut [FIRST_FRAME telemetrisi](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:4088) seçimden itibaren toplam süreyi, timeshift modunu ve Media3 kaynak verildikten sonraki süreyi kaydediyor. G09 için ilk değerlendirme bu süreleri aynı kanal/seçim kimliğinde karşılaştırmak olmalıdır. Kaynak öncesi gecikme; DNS, handshake, profil zenginleştirme ve create_link aşamalarına ayrılmalıdır. Kaynak sonrası gecikme ayrı olarak ağ/tampon/decoder tarafında değerlendirilmelidir.

[8 saniyelik create_link cache](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:246) ve [cache kullanımı](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:3053) halen mevcut. Bunun her portalın token yaşam süresiyle uyumlu olduğu bu incelemede kanıtlanmadı; önceki P03 saha kabul maddesi açık tutulmalıdır. PY06'daki URL'den kimlik çıkarma veya hazır URL kaydetme yaklaşımı geçici token sorununu çözmez.

Bu rapor mevcut telefon sürümünün gecikmesini yeniden ölçmüş değildir. Native motor/timeshift için önceki rapordaki P01–P05 kabul senaryoları ve güncel cihaz logu gerekir. G04 kaynak hazırlığına ilişkin yeni, doğrudan kod kanıtıdır; bütün ilk görüntü gecikmesini tek başına açıkladığı iddia edilmez.

## 7. Yapılan doğrulama ve sonuçları

Mevcut ağsız testler çalıştırıldı:

```text
node tools/test-mag-account-validation.js
PASS: 14 actual-module behavior groups

node tools/test-mag-portal-discovery.js
PASS: 18 offline behavior groups
```

Bunlara ek olarak mevcut harness'ların modül yükleme ve sahte response mekanizması geçici Node stdin senaryolarında kullanıldı. Test kaynakları değiştirilmedi. Gerçek uygulama modülleri yüklendi; fetch/native/proxy yolları sahte yanıtlarla sınırlandı. Gönderilen Python programlarından hiçbir fonksiyon yürütülmedi.

| Deney | Kurulan sahte yanıt | Ölçülen sonuç |
|---|---|---|
| F01 / G01 | main-info kimlik geçerli; ordered-list desteklenmiyor; get_all_channels bir gerçek biçimli örnek döndürüyor | Bulk `unverified`; normal `stalkerChannels` 1 kanal. |
| F02 / G02 | Profil gerçek login; main-info yalnız fname + aynı MAC | Gerçek login görünen adla değiştirildi; mainInfoOk=true. |
| F03 / G03 | login base64-MAC; username gerçek giriş; mac aynı MAC | Dönen username MAC oldu, gerçek sonraki username kaybedildi. |
| F04a / G04 | Bütün profil yanıtları dolu ama login yok | 4 toplam istek; ilk dolu profil sonrası 3 ek istek. |
| F04b / G04 | İlk profil dolu; sonraki profiller js:null | 9 toplam istek; ilk dolu profil sonrası 8 ek istek. |
| F05a / G05 | Portsuz tam PHP girişi; scope exact; maxCandidatesPerHost=2; yanıtlar 404 | 55 transport çağrısı; farklı port çağrıları var. Root reachability çağrıları aday sayacından ayrı. |
| F05b / G05 | Portlu /c/; exact; aynı aile API linki taşıyan gerçek biçimli Stalker HTML | /c/, /c/__kz_portal_not_found__.html, /server/load.php çağrıldı. |
| F06a / G06 | Profil hesabından farklı MAC/login dönen main-info | mainInfoOk=true; yanlış MAC ve kullanıcı adı kabul edildi. |
| F06b / G06 | `{js:{}}` main-info | mainInfoOk=true; source=main-info, anlamlı hesap alanı yok. |

Mevcut testlerin geçmesi ile yeni karşı örneklerin sorun göstermesi çelişki değildir: mevcut fixture kapsamı bu kombinasyonları sınamıyor. “Release testleri geçti, sorun kalmadı” sonucuna gidilmemelidir.

## 8. Opus için uygulama sırası ve kabul planı

Bu plan öneridir; bu incelemede kodlanmadı. Amaç sınırsız endpoint/MAC denemesi değil, kullanıcının sağladığı hesapları seçtiği kapsamda doğru işlemektir.

1. **Önce veri doğruluğu:** G02, G03, G06 birlikte ele alınsın. Username/displayName kaynağı ve MAC kontrolü ortaklaştırılsın; aynı kurallar normal ekleme, toplu sonuç, TXT, playlist kartı ve snapshot yolunda çalışsın.
2. **Sonra hesap API uyumluluğu:** G01 için desteklenmeyen ordered-list ile auth/koruma ayrıştırılsın; bounded get_all_channels erişim yolu ortak client sözleşmesine eklensin. Katalog örneği başarısı ile stream/ilk kare başarısı ayrıştırılsın.
3. **Kapsam ve süre:** G04/G05/G08 tek plan içinde düzenlensin. Exact/family/fallback tanımları UI, core, discovery, HTML bağlantısı, root sınıflaması ve fallback'te aynı olsun. Her istek ortak toplam deadline ve sayaca bağlı olsun.
4. **Keşif uyumluluğu:** G07 için başarılı normal login ile keşif arasındaki cihaz profili farkı test edilsin. Bu çözüm diğer aşamaların istek sayısını çarpmamalı.
5. **Oynatma gecikmesi:** G09 ve eski player kabul senaryoları çalışılsın. Gerekli olmayan hesap zenginleştirmesi oynatma kritik yolundan ayrılırken kimlik/cihaz doğrulamasının zorunlu alanları korunmalı.
6. **Cihaz kabulü:** Tekli ve çoklu aynı kullanıcı hesabı, aynı endpoint, aynı bağlantı türüyle ölçülsün. Her ikisi için gerçek API aşaması ve final sınıf görünür olmalı. DEV/release sürüm numarası ve commit kaydedilmeli. Bir portalın bütün hesapları reddetmesi yalnız geniş port listesiyle kapatılmamalı.

### Eklenmesi gereken anlamlı fixture'lar

| Kabul | Beklenti |
|---|---|
| K01 | Sadece get_all_channels destekleyen yetkili örnek hesap, çokluda desteklenmeyen ordered-list nedeniyle geçersiz sayılmaz. |
| K02 | Profilde gerçek login ve main-info'da görünen ad varsa gerçek login korunur. Main-info gerçek login taşıyorsa anlamlı öncelik uygulanır. |
| K03 | Raw/base64 MAC hiçbir username alanında giriş adı sayılmaz; sonraki gerçek username bulunur. |
| K04 | İlk kullanılabilir login'siz profil sonrası toplam en fazla tanımlı ek istek; boş, hata ve farklı varyant grupları da sayılır. |
| K05 | Exact portlu/portsuz, PHP/dizin/HTML-link/default 80/443 girişleri için izin verilen origin/port/path seti açıkça assert edilir. |
| K06 | Boş veya farklı MAC main-info otoriter snapshot değildir; profil bilgisi bozulmaz. |
| K07 | Yalnız desteklenen cihaz profiliyle çalışan bilinen endpoint keşif ön kapısında kaybolmaz; koruma terminal kalır. |
| K08 | Süre/istek bütçesi bitince incomplete sonucu; normal yokluk, ağ hatası, rate-limit ve auth reddi farklı kanıtlarla gösterilir. |
| K09 | Timeout, HTTP 404/5xx ve decoder hatasından otomatik “VPN gerekiyor” etiketi üretilmez. |
| K10 | Katalog erişimi ve ilk görüntü ayrı ölçülür; aynı seçim/session kimliği kullanılır. Kanal değişimi ve motor fallback'inde eski ölçüm yenisine yazılmaz. |

### Her güncellemeden sonra Opus devir notunda bulunması gerekenler

- Sürüm, branch, commit, değişen dosyalar ve fonksiyonlar.
- Bu rapordaki hangi G/K maddesinin ele alındığı; önceki davranış ve yeni davranış.
- İstek/kapsam/identity/timeout sözleşmesindeki değişikliğin açık tanımı.
- Çalıştırılan fixture ve cihaz senaryoları, sonuçları; geçmeyen veya ölçülmeyenler.
- DEV/release cihaz sürümü ve ilk görüntü süreleri; test ortamı normal/proxy, scope ve seçilen API yolu.
- Kullanıcı bilgisi değerlerini açmadan username kaynağı, main-info kabul/ret nedeni, verification evidence ve completion bilgisi.

## 9. Dış kaynaklarla yapılan kontrol

- [Infomir: portal login/password ile erişim ve MAC bağlama](https://wiki.infomir.eu/eng/ministra-tv-platform/ministra-installation-guide/faq/how-to-organize-the-access-to-the-portal-by-login-and-password): gerçek giriş bilgisi ve MAC bağlaması aynı veri değildir. Yukarıdaki kimlik ayrımı için kullanıldı.
- [Kodi pvr.stalker stb.c kaynak dosyası](https://github.com/kodi-pvr/pvr.stalker/blob/Piers/lib/libstalkerclient/stb.c): bağımsız client kaynak karşılaştırması için okundu; tek başına bütün portal klonlarının API standardı kabul edilmedi.
- [Requests gelişmiş kullanım / TLS doğrulaması](https://requests.readthedocs.io/en/latest/user/advanced/#ssl-cert-verification): referanslarda verify=False etkisi kontrol edildi.
- [Requests body/connection yönetimi](https://requests.readthedocs.io/en/latest/user/advanced/#body-content-workflow): stream=True ile body tüketilmez veya close çağrılmazsa bağlantının havuza dönemeyeceği kontrol edildi. Python programlarının bir kısmındaki eksik kapanışlara ilişkin değerlendirmeyi destekler.

Bu incelemede değişen tek yeni proje dosyası bu rapordur. Uygulama kaynakları, gönderilen Python dosyaları, test kaynakları, build, cihaz kurulumu ve GitHub workflow ayarları bu inceleme kapsamında değiştirilmedi.
