# GPT — Proxy testi, proxy kullanımı ve arka plan çalışma incelemesi

**Tarihî inceleme:** Satır numaraları/durumlar 11 Ekim uygulama öncesine aittir. Sonraki v18.7.32 değişiklikleri ve gerçek doğrulamaları [AI-DEVIR-v18.7.32.md](AI-DEVIR-v18.7.32.md) içindedir.

Tarih: 11.10.2026. Proje: KIZILKAN PLAYER ELITE v18.7.31. İncelenen dal: codex/v18.7.31-dns-tests-fast-catalog; HEAD: 940dffdc. Bu rapor uygulama kodunu değiştirmez; bulguları ve geliştirme planını kaydeder.

## 1. Kullanıcının son sorusunun doğrudan cevabı

**“Arka planda tarama, test ve çalışma özelliklerinin tamamı uygulamaya eklendi mi?” — Hayır, tümü tamamlanmış değil.** Tarama için önemli altyapı mevcut; proxy testi, gerçek görüntü testi, süreç ölümü sonrası test kurtarma ve kalıcı bitiş bildirimi aynı kapsamda tamamlanmış değil. Kodun derlenmiş olması, bütün arka plan senaryolarının cihazda doğrulandığı anlamına gelmez.

| İşlem | Mevcut durum ve kanıt | Eksik / yapılacak | Yapılınca ne olacak |
|---|---|---|---|
| Xtream / panel / dosyadan çoklu tarama | İş native PanelScanService içinde; foreground bildirim, şifreli journal, checkpoint, sonuç koruma ve yeniden devam mekanizması var. [PanelScanService.kt:298](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:298>); [PanelScanService.kt:602](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:602>). | Bütün bitiş aşamalarını UI ile aynı runId üzerinden yönetmek; ekran kapalı ve süreç ölümü kabul testleri. | Ekran açık olmasa da taramanın gerçek durumu görünür; yarım iş anlaşılır biçimde kurtarılır. |
| MAG çoklu tarama | JS taraması için ForegroundKeepAliveService başlatılıyor; ilerleme güncellemesi ve durdurma var. Belirsiz denemeleri kalıcı arşivden yeniden hazırlama da mevcut. [mag-bulk.tsx:120](<C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:120>); [mag-bulk.tsx:312](<C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:312>); [mag-bulk.tsx:354](<C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:354>). | Native taramayla eşdeğer, bütün aktif ilk tur işlerini kapsayan süreç ölümü / otomatik devam garantisi doğrulanmış değil. Servis iş mantığını saklamıyor; START_NOT_STICKY. | Sonuç kurtarma, belirsizleri tekrar deneme ve tamamlanmamış ilk tur işlerini devam ettirme ayrı ve açık olur. |
| Canlı katalog testi | JS testi için keep-alive servisi var; 20 işçi, iptal kontrolü, finally içinde servis bırakma var. [add-playlist.tsx:336](<C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:336>). | Kuyruk/sonuçlar React state içinde; süreç ölünce otomatik kaldığı yerden devam yok. Servisin başlaması başarısız olsa da dönüş değeri kontrol edilmiyor. Uzun testte keep-alive ilerleme güncellemesi yok. | Servis başlayamadığında kullanıcı bilgilendirilir; test ilerlemesi ve bitişi kurtarılır. |
| Proxy havuzu testi | Native daemon thread ve executor kullanıyor; duraklat/durdur var. [ScanProxyPool.kt:305](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:305>). | Kendi foreground işi, kalıcı çalışan test kuyruğu/checkpoint ve bitiş bildirimi yok. Başka aktif servis varsa dolaylı koruma olabilir; bu testin kendi garantisi değildir. | Uygulama arka plandayken testin sahibi ve yaşam döngüsü belli olur; kesilirse yeniden devam edebilir. |
| Gerçek görüntü / ilk kare testi | VideoView ve onFirstFrameRender ile gerçek ilk kare ölçülüyor; hesaplar sırayla test ediliyor; ana player bağlantısı bırakılıyor. [EndpointPlaybackTest.tsx:15](<C:/Projeler/kizilkan-player-elite/frontend/src/components/EndpointPlaybackTest.tsx:15>); [AccountPlaybackTestQueue.tsx:8](<C:/Projeler/kizilkan-player-elite/frontend/src/components/AccountPlaybackTestQueue.tsx:8>). | UI renderer'a bağlı. AppState için arka plana geçince duraklat/belirsiz say/devam politikası ve bu işe ait foreground servis yok. | Ekran görünmezken ilk kare gelmedi diye yanıltıcı görüntü sonucu oluşmaz; seçilen politika açık olur. |
| “Tamamlandı” bildirimi | Tarama sırasında ongoing bildirim var. Tarama bitince stopForeground(REMOVE) ile kaldırılıyor. [PanelScanService.kt:1982](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:1982>). Keep-alive bitince de bildirim kaldırılıyor. [ForegroundKeepAliveService.kt:117](<C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/ForegroundKeepAliveService.kt:117>). | İncelenen akışlarda sonuç özeti içeren ayrı kalıcı bitiş bildirimi yok. | Kullanıcı uygulamaya dönmeden işin tamamlandığını, durdurulduğunu veya hata aldığını öğrenir. |

Foreground hizmeti süreç önceliğini artırır; bütün işleri kalıcı bir iş kuyruğuna dönüştürmez. Android güç tasarrufu da ayrı bir koşuldur. Android 15+ için dataSync süre sınırı ve onTimeout yönetimi gerekir; kodda bu callback hem PanelScanService hem keep-alive servisinde var. Telefonda Android API 31 bulunduğundan Android 15 süre sınırı bu cihaz gözleminin nedeni olarak gösterilemez. [Android foreground süre sınırı](https://developer.android.com/develop/background-work/services/fgs/timeout), [Doze / App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby).

## 2. Ekran görüntüsü ve telefondan elde edilen kanıt

Gönderilen görüntüde Panel 796/796, Adres 4771/4771, Kalan 0, Bulunan 2, geçen 39 dk 57 sn görülüyor. Buna rağmen çoklu hesap penceresi “Tarama sürüyor”, “Hazırlanıyor”, “Durduruluyor” ve “Taramanın Bitmesini Bekleyin” gösteriyor. Hesap kartında “Katalog var · 7145 kanal · ilk kare sınanmadı” var: katalog kanıtı mevcut; görüntü kanıtı henüz yok.

### 2.1 Durum ve ekran sahipliği karışması

“Panel … / Adres …” metninin kod kaynağı **tek hesap / bütün panel rehberi** tarama fonksiyonu runNativeBackgroundScan'dir: [add-playlist.tsx:909](<C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:909>). Çoklu hesap taraması başka metin üretir: “Hesap … / Adres …”: [add-playlist.tsx:1989](<C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1989>).

Ekranda ise başlık “Bulunan Çoklu Hesaplar”. Bu pencerenin kontrol ve bitiş düğmeleri bulkScanFinished ve bulkScanRunIdRef kullanıyor: [add-playlist.tsx:3810](<C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:3810>); [add-playlist.tsx:3860](<C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:3860>). Tek hesap akışı nativeScanRunning ve nativeScanRunIdRef kullanır: [add-playlist.tsx:879](<C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:879>). **progress metni bu akışlar arasında ortaktır.** “Hazırlanıyor” etiketi çoklu pencerenin runId'sinin boş olduğunu gösterir; bu etiket tek başına aktif native taramanın hazırlanıyor olduğu anlamına gelmez.

Kod ve ekran birlikte durum sahipliği sorunu için güçlü kanıt verir. Ancak yanlış pencerenin hangi kullanıcı adımlarıyla açık kaldığı, normal APK'nın o andaki journal kaydı olmadan kesinleşmedi. Bunu yalnız “sunucu yavaş” diye açıklamak doğru değildir.

**Öneri:** Tek/çoklu sonuç ekranının sahibi runId + mode ile açıkça bağlansın; başka işin progress metni ve durdurma düğmesi bu ekrana geçmesin. Terminal snapshot bütün ilgili busy/stopping bayraklarını temizlesin. RunId boşken “Durduruluyor” durumunda süresiz kalınmasın; mevcut işin durumu yeniden okunsun.

### 2.2 %100 ilk turun bitmesi olabilir; bütün işin bitmesi değildir

İlk turdan sonra kalıcı ikinci tur kuyruğu çalıştırılıyor: [PanelScanService.kt:576](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:576>); [PanelScanService.kt:603](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:603>). retryPending varsa snapshot terminal durumu RUNNING'e döndürebiliyor: [PanelScanService.kt:529](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:529>). Böylece tested == total olduğu hâlde ikinci tur sürmesi mümkündür.

Tek hesap ve normal çoklu ilerleme metinleri yalnız tested/total üzerinden yüzde ve tahmini kalan süre hesaplıyor; retry aşamasını bu ana döngülerde göstermiyor: [add-playlist.tsx:905](<C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:905>); [add-playlist.tsx:1979](<C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1979>). Kurtarma döngüsünde ikinci tur etiketi mevcut: [add-playlist.tsx:1591](<C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1591>). Aynı iş farklı kod yolunda farklı açıklanıyor.

**Öneri:** Hazırlık → ilk tur → yeniden deneme → arşiv yazımı → tamamlandı/durduruldu/hata aşamaları tek durum sözleşmesinde gösterilsin. İlk tur %100 iken “İkinci tur: N bekleyen” gösterilsin; bütün iş için “0 sn” verilmesin. Bu olasılık, yanlış pencere sorununu ortadan kaldırmaz; iki konu birlikte ele alınmalı.

### 2.3 Telefon kontrolünün sınırı

- Normal APK: 18.7.31 / 180731; DEV: 18.7.31-dev / 180731.
- Gözlem anında normal uygulamanın süreci arka planda açıktı; foreground activity başka uygulamaydı.
- Her iki paket için aktif PanelScanService / keep-alive servis kaydı görülmedi. Bu, gözlem anındaki durumdur; 21:28 ekranının terminal nedenini kanıtlamaz.
- Normal paket debuggable olmadığı için private journal / flight recorder dosyaları run-as ile okunamadı. Bu kısıt hesapları silme, uygulamayı kaldırma veya yeniden kurma yoluyla aşılmadı.
- DEV'den okunabilen olaylarda 507/507, 20 sonuç, CANCELLED olan farklı tarama vardı; gönderilen 4771 adres / 2 sonuç ekranıyla eşleştirilmedi.
- Okunan genel logcat kesitinde KIZILKAN için fatal crash bulunmadı. Oplus ve Netflix olayları KIZILKAN hatası olarak sayılmadı.
- Yeni hesap taraması, dış proxy bağlantısı veya görüntü testi başlatılmadı. Dolayısıyla “bütün arka plan işlemleri hatasız cihazda geçti” denemez.

## 3. Bizim proxy testi tam olarak nasıl çalışıyor?

[ScanProxyPool.kt:305](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:305>) ve [scan-proxy.tsx:260](<C:/Projeler/kizilkan-player-elite/frontend/app/scan-proxy.tsx:260>).

1. Kaynak listesini indirmek yalnız aday toplar. Liste adresinin açılması proxy'nin çalıştığını kanıtlamaz.
2. Sistem modunda telefonun doğrudan dış IPv4 adresi öğrenilmeye çalışılır. Bu doğrudan IP-yankı isteğidir; portal trafiğinin sessiz doğrudana düşmesi değildir.
3. Aday proxy portuna TCP bağlantısı denenir. Varsayılan 6 sn ayarında TCP bağlantı süresi 3 sn; TCP işçileri 128. Port açıksa proxy protokolü, anonimlik veya HTTPS henüz doğrulanmış değildir.
4. TCP'yi geçenlere proxy üzerinden HTTP judge isteği gönderilir. Varsayılan doğrulama işçisi 64; origin ve başlıklar incelenir. Kendi IP'nin görünmesi “transparent”, proxy başlığı görülmesi “anonymous”, bunlar görülmemesi “elite” etiketi üretir.
5. Gecikmeye göre sonuç listesi sıralanıp native şifreli havuza yazılır. Buradaki ms, HTTP isteğinin toplam gözlem süresidir; ICMP ping veya video ilk görüntü süresi değildir.
6. Özel URL modunda 2xx/3xx ve kullanıcı girdiyse beklenen metin aranır. Anonimlik bu modda unknown'dur. Bu test hesap veya video doğrulaması değildir.
7. TCP aşamasında “Yeter, kullan” seçilirse yalnız portu açık adaylar alınır; gecikme -1 ve anonimlik unknown olur. “Test etmeden kullan” da ayrı mevcut seçenek. Bunları tam testle aynı etiketlemek uygun değildir.

### 3.1 Bizde koddan doğrulanan eksikler

| Öncelik | Mevcut durum / sebep | Sonuç | Yapılması gereken |
|---|---|---|---|
| P1 | Kendi IP öğrenilemediğinde ownIp boş. leaks kontrolü çalışmıyor fakat headers temizse elite dönebiliyor. [ScanProxyPool.kt:442](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:442>). | IP gizlenmesi kanıtlanmadan Elite etiketi. | Baseline yoksa anonimlik unknown; Elite yalnız geçerli karşılaştırma kanıtıyla. IP'leri substring yerine normalleştirilmiş adres olarak karşılaştır. |
| P1 | Echo fallback HTTP 200/3xx alınca geçerli IPv4 bulunması zorunlu değil. [ScanProxyPool.kt:532](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:532>). | IP içermeyen HTML sayfası çalışan/unknown sayılabilir. | Geçerli IP ve beklenen schema zorunlu; bozuk yanıt ayrı durum. |
| P1 | Judge bağlantısı exception verince hemen -1; echo fallback sadece judge bir HTTP yanıtı verdiyse çalışıyor. [ScanProxyPool.kt:450](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:450>). | Judge'a özgü geçici hata çalışan proxy'yi elemiş olabilir. | Toplam süre bütçesi içinde ikinci bağımsız doğrulayıcı; endpoint hatası ≠ proxy kesin ölü. |
| P1 | MAG'da useProxy yerel; native select global enabled=false ise null. Yerel switch merkezi ayarı güncellemez. [mag-bulk.tsx:759](<C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:759>); [ScanProxyPool.kt:600](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:600>). | Havuz dolu olsa bile “proxy yok” olabilir. | Başlangıçta etkinlik/havuz/protokol ön kontrolü; aynı ve açık kullanım sözleşmesi. Otomatik doğrudana geçme yok. |
| P1 | Xtream havuz tükenince duraklar; MAG proxiedRequest status 0 hata verir. [PanelScanService.kt:730](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:730>); [ScanProxyPool.kt:762](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:762>). | Aynı altyapı iki ekranda farklı davranır; MAG denemesi bağlantı yokken tamamlanabilir. | MAG'a da sonuç kaybetmeden proxy bekleme/düzelt/devam durumu. |
| P1 | Proxy başına 4 yük kontrolü var; bütün adaylar doluysa fallback kontrolsüz artırıyor. [ScanProxyPool.kt:583](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:583>); [ScanProxyPool.kt:621](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:621>). | 4 değeri kesin tavan değil; proxy aşırı yüklenebilir. | Kapasite kuyruğu; dolu proxy'ye sınırsız ekleme yapılmasın. |
| P2 | Varsayılan judge ve echo adresleri HTTP. [ScanProxyPool.kt:98](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:98>); [ScanProxyPool.kt:110](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:110>). | HTTPS/CONNECT çalıştığı doğrulanmıyor. | Ayrı HTTP ve sertifika doğrulamalı HTTPS yetenek testleri. |
| P2 | HTTP responseCode alınır alınmaz TARGET/iyi proxy sayılıyor; 407 normal yanıt olarak gelirse de aynı yol. Body/JSON hatalarının catch yolu proxy arızasına dönebiliyor. [PanelScanService.kt:753](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:753>); [PanelScanService.kt:784](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:784>); [ScanProxyPool.kt:679](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:679>). | Proxy-auth, hedef yanıtı ve body hatası istatistikleri karışabilir; gereksiz tekrar deneme. | 407 proxy kimlik doğrulaması; target timeout/bozuk JSON ayrı. İyi proxy = hedefe ulaşım kanıtı, hesap geçerli değil. |
| P2 | Judge/echo/custom okumaları sınırsız readText/readBytes. [ScanProxyPool.kt:436](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:436>); [ScanProxyPool.kt:530](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:530>); [ScanProxyPool.kt:558](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:558>). | Çok sayıda testte büyük/bitmeyen gövde bellek ve süreyi zorlayabilir. | Küçük gövde limiti, kesin toplam deneme bütçesi. |
| P2 | runWorkers iş başlamadan runId kontrol eder; network bitince sayaç yazımında aynı kontrol yok. Stop bütün aktif test bağlantılarını tek tek kapatmıyor. [ScanProxyPool.kt:389](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:389>); [ScanProxyPool.kt:473](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:473>). | İptalden sonra yeni test başlatıldığında eski worker'ın yeni sayacı etkilemesi olası. Cihazda henüz üretilmedi. | Sonuç/sayaç yazımı da runId ile korunmalı; aktif test bağlantıları iptalde kapatılmalı. |
| Doğrulama | SOCKS4/SOCKS5 etiketleri native tarafta aynı Proxy.Type.SOCKS nesnesine dönüşüyor. [ScanProxyPool.kt:67](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:67>). | Etiket, seçilen SOCKS sürümünün gerçekten kullanıldığının kanıtı değil. | Kontrollü SOCKS4 ve SOCKS5 test uçlarıyla gerçek protokol doğrulaması; doğrulanmadan “kesin bozuk” denmemeli. |

HTTP proxy üzerinden HTTPS, CONNECT desteğiyle mümkündür. IShiro içindeki “HTTP proxy HTTPS panel için çalışmaz” mesajı genel bir protokol kuralı olarak alınmamalıdır. [RFC 9110 CONNECT](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6). 407 proxy kimlik doğrulamasıdır; panel hesabının reddi değildir. [RFC 9110 407](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.8). Java SOCKS türü V4 veya V5'i temsil eder. [Java Proxy.Type](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/net/Proxy.Type.html).

## 4. Tarama sırasında bizim proxy kullanım davranışı

- Pool şifreli saklanır; proxy adres/şifreleri Keystore AES-GCM ile korunur. [ScanProxyPool.kt:862](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:862>).
- Panelden HTTP yanıtı almış proxy'lere öncelik ve round-robin var. Daima en düşük ms olan proxy seçilmiyor. “İyi” etiketi auth başarılı / görüntü var demek değil.
- Seçim istek düzeyinde; bütün MAG handshake/profile/catalog oturumunu tek proxy'ye bağlayan genel sabitleme yok. Oturum çıkış IP'sine bağlanmışsa değişim sorun çıkarabilir; bu koşullu risk, bu cihazdaki sorunun kanıtlanmış nedeni değildir.
- Native Xtream taşıma hatasında en fazla 3 proxy denemesi yapar. HTTP koruma/429/503 ayrı değerlendirilir; koruma yanıtında proxy değiştirerek sınırsız devam etmez. Havuz tükenirse kullanıcı müdahalesi için duraklar.
- MAG proxy taşıma yolu da 3 deneme sınırı kullanır; havuz yoksa hata döndürür. Seçenek açıkken portal için sessiz direct fallback yok.
- Üç proxy arızası sonrası dead işaretleme var. Proxy sağlığında A.java benzeri zamanlı cooldown/yeniden deneme yok; yeniden test/reset/süreç yeniden başlaması ayrı. Host 429 beklemesi ile proxy cooldown aynı şey değildir.
- Native tarama başlangıcında 15 dk bayat havuza sınırlı TCP tazeleme yapılır; bu tam HTTP/HTTPS/anonimlik testi değildir. MAG JS başlangıcında aynı yordamın çağrıldığı doğrulanmadı. [ScanProxyPool.kt:629](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:629>); [PanelScanService.kt:658](<C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt:658>).
- Bu havuz uygulamanın tüm trafiğini kapsamaz. Canlı katalog testi xtreamLiveCatalogProbe → xtGet yolunda; gerçek ilk kare testi Expo VideoView yolunda. Bunları taramanın proxy yoluyla aynı sanmak doğru değildir. [iptv.ts:468](<C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:468>); [EndpointPlaybackTest.tsx:41](<C:/Projeler/kizilkan-player-elite/frontend/src/components/EndpointPlaybackTest.tsx:41>). Kullanıcıya testin direct/proxy bağlantı bağlamı gösterilmeli.

## 5. IShiro APK ile farklar — kanıt sınırı

ZIP'teki uygulama IShiro Scanner7.9.1'dir. Dart kaynakları yok; libapp.so içinde httpbin/ifconfig/ipinfo IP kontrol adresleri, transparent/anonymous metinleri ve SOCKS liste adları var. **Bunlar anonimlik testinin amaçlandığını gösterir; gerçek algoritmanın bütün adımları, timeout ve HTTP başlığı kontrolü doğrulanmış değildir.** Bu yüzden “IShiro daha iyi test ediyor / daha hızlı / bütün trafik proxy'de” sonucu verilemez.

| Konu | Bizim uygulama | IShiro'da doğrulanan bölüm | Değerlendirme |
|---|---|---|---|
| Test algoritması | TCP → HTTP judge → sınırlı echo fallback; custom URL; anonimlik sınıfları. | Dart binary'sinde test adresleri ve sınıf metinleri var; Dart algoritması elde yok. | Bizim testin güçlü/eksik tarafları koddan açık; karşı uygulamanın tamamıyla eşdeğerliği belirsiz. |
| Seçim | Yanıt almış proxy önceliği + round-robin. | Native A.java getNext round-robin. [A.java:116](<C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/A.java:116>). | Bizde hedef yanıtı tecrübesi var; kesin hız seçimi iki tarafta da bu koddan çıkmıyor. |
| Arıza | 3 arıza sonrası dead; kalıcı good havuzu. | 5 sayılan bağlantı hatası sonrası 30 sn cooldown; daha sonra 5 dk eşiğini aşan ek hata gelirse dead. [A.java:151](<C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/A.java:151>). | Geçici bekleme fikri yararlı; eşikleri aynen taşımak için neden yok. |
| Timeout | Bazı belirsiz hedef/yanıt hataları proxy arızası sayılabiliyor. | Timeout/reset native A.java'da sayılan arıza değil. [A.java:71](<C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/A.java:71>). | IShiro geçici yavaşlıkta hemen elemez; sürekli yavaş proxy de cezasız kalabilir. Dengeli ayrım gerekir. |
| Cooldown uygulaması | Proxy cooldown yok; host backoff var. | Süresi dolmamış cooldown kontrolünden sonra bile getNext proxy'yi döndürüyor. [A.java:125](<C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/A.java:125>). | Native rotatörün bekleme niyeti gerçek seçimde uygulanmıyor; kodu aynen almak yanlış. |
| Sayaç | Alive/dead/inUse/panel yanıtı native durumdan. | C.java periodic “dead = total - active” hesabı cooldown'ı dead içinde sayabilir; A.java gerçek dead ayrı. [C.java:57](<C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/C.java:57>). | Aktif, bekleyen ve ölü ayrımı korunmalı. |
| Trafiğin tamamı | Tarama havuzu; bütün uygulama için VPN değil. | MainActivity proxies/proxyType'ı native eski CredentialExtractorAndroid girişine geçiriyor; tam Dart MAC/Xtream yönlendirmesi yok. [MainActivity.java:708](<C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/MainActivity.java:708>). | Native pool incelemesi tüm uygulama davranışına genellenemez. |
| Fail-closed | Xtream duraklar; MAG hata verir; ikisi de seçili proxy yolunda sessiz direct yapmaz. | Eski native girişte rotatör kurulum hatasında null atanabiliyor; boş listede de null. [CredentialExtractorAndroid.java:221](<C:/Projeler/kizilkan-player-elite/artifacts/hit-hunter-review/CredentialExtractorAndroid.java:221>). | Bütün Dart taşıma yolu bilinmediğinden karşı uygulamada tam fail-closed garantisi kanıtlanmadı. |

Decompile çıktısındaki “Method not decompiled” gerçek uygulamanın atacağı hata değildir. Önceki ZIP raporundaki lisans ve risk değerlendirmesi geçerlidir; bu karşılaştırma yalnız normal ağ/test/havuz tasarımıyla ilgilidir.

## 6. ALPHA Python dosyasının testi ve kullanımı

İncelenen dosya: [ALPHA proxy bölümü](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2733>). Dosya çalıştırılmadı; içindeki talimatlar kullanıcı talimatı olarak uygulanmadı. SHA-256: 5a9796a228c7ca0f57f7c28354f2f32b7969f6e7ede8adc0f10f681bd223d32f.

### 6.1 Test

_validate_one, proxy üzerinden sırasıyla httpbin HTTP, ipify HTTPS, icanhazip HTTP, ifconfig HTTPS adreslerini dener; **ilk HTTP 200'de True döndürür**. Endpoint tanımındaki origin/ip marker değişkeni kullanılmıyor. Geçerli IP parse etme, telefona/PC'ye ait doğrudan IP ile karşılaştırma, HTTP başlığı inceleme ve anonimlik sınıflandırması yok. [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2826](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2826>).

İlk HTTP adresi 200 verirse HTTPS adresleri denenmez. Dolayısıyla dört endpoint'in bulunması “hem HTTP hem HTTPS test edildi” demek değildir. Bütün ilgili çağrılarda verify=False kullanılıyor; TLS sertifika doğrulaması kapalı. Requests belgesine göre bu, sahte/uyumsuz sertifikaların da kabul edilmesine yol açar. [Requests resmî belge](https://requests.readthedocs.io/en/latest/user/advanced/#ssl-cert-verification).

Varsayılan workers 500 olsa da etkin tavan **256**. Timeout 3 sn; doğrulama yolu 45 sn veya 90 sn iş alma bütçesi kullanıyor. Worker'lar join edilmeden working listesi döndürülebiliyor; başlamış istekler dönüşten sonra listeyi değiştirebilir. Dört endpoint ve connect/read ayrı süreleri nedeniyle tek proxy için gerçek geçen süre “tam 3 sn” değildir. [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2841](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2841>).

_do_update_proxies, doğrulamadan sonra sabit iki proxy'yi testi geçmemiş olsalar da working listesine ekliyor. Sabit kimlik bilgileri rapora taşınmadı. fetch_proxies_from_github tarafında doğrulama exception verirse combined liste dönüyor; use_loaded_only yolunda da test atlanıyor. Bu sonuçlara “doğrulanmış” denmesi güvenilir değildir. [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3630](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3630>); [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3700](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3700>).

### 6.2 Tarama kullanımı

| Davranış | ALPHA Python | Bizim uygulama | Fayda / risk |
|---|---|---|---|
| Normal seçim | Varsayılan random; seçilirse round-robin. [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3049](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3049>). | Hedef yanıtı görmüşlere öncelik + round-robin. | Random tek başına kaliteyi veya hızı iyileştirmez. |
| Hesap içi tutarlılık | MAC veya Xtream hesabına başlarken bir proxy alınır; takip eden aynı hesap işlemlerine bu değişken aktarılır. [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2468](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2468>); [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:4393](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:4393>). | Proxy request düzeyinde değişebilir. | Normal oturum kararlılığı için hesap/oturum süresince sabit rota fikri yararlı olabilir; arızada kontrollü oturum yenileme gerekir. |
| Havuz boş / tür yok | _get_next_proxy None; çağıran request proxies=None kullanır. Sistem ortam proxy'si yoksa doğrudan gider; Requests ortam ayarları da etkileyebilir. | Seçili proxy akışında direct fallback yok; native Xtream bekler, MAG hata verir. | Bizim açık rota sözleşmesi daha iyi. ALPHA'nın sessiz dönüşü alınmamalı. |
| Canlı sağlık | Seçim/hata çağrı zincirinde dead/cooldown/başarısız proxy eleme mekanizması bulunmadı. | Arıza sayacı ve dead listesi var; ayrım hataları yukarıda. | ALPHA bir kez geçen ama sonradan bozulan proxy'yi tekrar seçebilir. |
| Kaynak indirme | Bir yol sıralı; diğer yol 16 kaynak işi paralel. [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2808](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2808>); [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3675](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3675>). | Kaynaklar sırayla indiriliyor. [scanProxy.ts:195](<C:/Projeler/kizilkan-player-elite/frontend/src/utils/scanProxy.ts:195>). | Sınırlı kaynak indirme paralelliği bizim liste hazırlığını hızlandırabilir; 16'yı telefona aynen taşımak gerekmiyor. |
| Tür dengesi | Sıralı indirme global 5000 sınırında ilk HTTP listeleriyle dolabilir; tür filtresi sonra uygulanır. | Kullanıcı kaynak/tür seçer; 200.000 sınırı var. | ALPHA'nın “SOCKS seçtim ama aday gelmedi” riski alınmamalı; tür başına dengeli kota düşünülmeli. |
| Otomatik tazeleme | 6 saat; iki dakikada bir kontrol; tarama çalışırken/duraklatılmışken güncellemez. [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3811](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3811>). | Native başlangıçta bayat havuza TCP kontrolü; manuel indirme/test. | Kaynak listesinin bayatlık durumunu gösterme ve eski havuzu başarısız güncellemede koruma yararlı. |
| 5 TXT yuvası | Dosyalar slot'a yüklenip ortak havuza birleştirilir. clear_proxy_slot yalnız slot dizisini boşaltır; ortak havuzdaki üyeleri çıkarmaz. [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:1513](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:1513>). | Dosya/pano/özel URL ve tekilleştirme mevcut. | Kaynak grupları faydalı; kaynak sahipliğiyle gerçek kaldırma uygulanmalı. Aynı üyeyi başka grup kullanıyorsa korunmalı. |
| “Virtual VPN” | Ülke listesi proxy exit IP'den çıkarılır; auto en düşük ip-api HTTP süresini seçip kilitler, manual ülke içinden random seçebilir. [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2913](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2913>); [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2955](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2955>); [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3024](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:3024>). | Taramaya özel proxy. | Bu sistem çapında VPN değil; ülke/çıkış IP bilgisi ayrı test metadata'sı olarak kullanılabilir. En hızlı ip-api yanıtı en hızlı portal/video değildir. |
| Kalıcılık | Doğrulanmış aday TXT'ye geçici dosya + replace ile yazılır; proxy-auth da düz metin olabilir. [ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2799](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py.bak_20261010_152643:2799>). | Native Keystore ile şifreli pool ve good listesi. | Atomik yazma fikri yararlı; bizim şifreli saklama korunmalı. |

Requests'te proxies=None bütün ortam koşullarında “kesin direct” demek değildir; ortam proxy ayarları kullanılabilir. Aynı resmî belgede SOCKS DNS davranışı ve ortam etkisi açıklanır. [Requests proxy belgesi](https://requests.readthedocs.io/en/latest/user/advanced/#proxies).

## 7. Proxy kaynakları: GitHub ve diğerleri

**ALPHA: 15 sağlayıcı, 36 URL = 12 GitHub sağlayıcısının 27 dosyası + 3 API sağlayıcısının 9 adresi. Bizim katalog: 19 sağlayıcı, 47 URL. ALPHA'daki 36 URL'nin 25'i bizde birebir mevcut. Sağlayıcı bazında 13'ü ortak; iki yeni sağlayıcı UserR3X ve proxy-list.download.**

Ortak GitHub sağlayıcıları: TheSpeedX, monosans, ALIILAPRO, jetkai, clarketm, roosterkid, ShiftyTR, sunny9577, opsxcq, proxy4parsing, hookzof. Ortak GitHub dışı servisler: ProxyScrape ve api.openproxylist.xyz.

Bizde ayrıca Proxifly, Proxio, IPLocate, Proxmint, mmpx12 ve Vakhov var. Proxifly listesi jsDelivr üzerinden gelir; depo GitHub'dadır. Bu nedenle “GitHub kaynağı” ve “isteğin yapıldığı CDN” farklı kavramlardır.

Birebir URL olarak bizde olmayan 11 adresin dağılımı:
- UserR3X: 2 dosya; ikisi de 404.
- proxy-list.download: 3 API adresi; bu kontrolde HTTP/SOCKS4 502, SOCKS5 429.
- monosans anonymous: 3 farklı dosya yolu; hepsi 404. monosans sağlayıcısı zaten mevcut.
- ProxyScrape: 3 farklı v2 parametreli URL; boş olmayan listeler geldi. Sağlayıcı bizde zaten var; aynı sağlayıcıyı ikinci isimle eklemek yeni kaynak çeşitliliği sağlamaz.

### 7.1 Canlı kontrolün kapsamı

Kontrol zamanı UTC: 2026-10-11T18:32:48.375Z. Yalnız liste adresleri indirildi; en fazla 4 indirme aynı anda, 14 sn bütçe, 2 MiB yanıt limiti. **Kendi üretim parseProxyText fonksiyonumuz** ile adaylar sayıldı. Gönderilen Python çalıştırılmadı; listedeki proxy IP'lerine bağlanılmadı.

36 ALPHA adresinden **28'i HTTP 200 ve boş olmayan ayrıştırılabilir liste**, 5'i 404, 2'si 502, 1'i 429 verdi. Sayımlar dosya içi tekilleştirilmiş aday sayısıdır; kaynaklar arasındaki tekrarlar toplanırsa gerçek tekil proxy sayısı olmaz. “200 ve N aday” ≠ canlı/anonim/HTTPS çalışan proxy.

| Kaynak adresi | Tür | HTTP durumu | Ayrıştırılan aday | Bizde birebir URL |
|---|---|---|---|---|
| [Liste](https://api.openproxylist.xyz/http.txt) | HTTP | 200 | 5877 | Aynı URL mevcut |
| [Liste](https://api.openproxylist.xyz/socks4.txt) | SOCKS4 | 200 | 4151 | Aynı URL mevcut |
| [Liste](https://api.openproxylist.xyz/socks5.txt) | SOCKS5 | 200 | 5049 | Aynı URL mevcut |
| [Liste](https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all) | HTTP | 200 | 679 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |
| [Liste](https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks4&timeout=10000&country=all) | SOCKS4 | 200 | 267 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |
| [Liste](https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks5&timeout=10000&country=all&simplified=true) | SOCKS5 | 200 | 1229 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |
| [Liste](https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/http.txt) | HTTP | 200 | 1044 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/socks4.txt) | SOCKS4 | 200 | 255 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/socks5.txt) | SOCKS5 | 200 | 1347 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt) | HTTP | 200 | 400 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt) | SOCKS5 | 200 | 51567 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt) | HTTP | 200 | 1801 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt) | SOCKS4 | 200 | 1603 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt) | SOCKS5 | 200 | 405 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/monosans/proxy-list/main/proxies_anonymous/http.txt) | HTTP | 404 | 0 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |
| [Liste](https://raw.githubusercontent.com/monosans/proxy-list/main/proxies_anonymous/socks4.txt) | SOCKS4 | 404 | 0 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |
| [Liste](https://raw.githubusercontent.com/monosans/proxy-list/main/proxies_anonymous/socks5.txt) | SOCKS5 | 404 | 0 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |
| [Liste](https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt) | HTTP | 200 | 276 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt) | SOCKS4 | 200 | 128 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt) | SOCKS5 | 200 | 654 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/opsxcq/proxy-list/master/list.txt) | HTTP | 200 | 343 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/proxy4parsing/proxy-list/main/http.txt) | HTTP | 200 | 19031 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt) | HTTP | 200 | 89 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt) | SOCKS4 | 200 | 150 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt) | HTTP | 200 | 40 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt) | SOCKS4 | 200 | 661 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt) | SOCKS5 | 200 | 279 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt) | HTTP | 200 | 1559 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt) | HTTP | 200 | 2842 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt) | SOCKS4 | 200 | 2543 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt) | SOCKS5 | 200 | 3334 | Aynı URL mevcut |
| [Liste](https://raw.githubusercontent.com/UserR3X/proxy-list/main/online/http.txt) | HTTP | 404 | 0 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |
| [Liste](https://raw.githubusercontent.com/UserR3X/proxy-list/main/online/https.txt) | HTTP | 404 | 0 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |
| [Liste](https://www.proxy-list.download/api/v1/get?type=http) | HTTP | 502 | 0 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |
| [Liste](https://www.proxy-list.download/api/v1/get?type=socks4) | SOCKS4 | 502 | 0 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |
| [Liste](https://www.proxy-list.download/api/v1/get?type=socks5) | SOCKS5 | 429 | 0 | Aynı URL yok; sağlayıcı karşılaştırması aşağıda |

### 7.2 Güncel, yararlı alternatif: aynı sağlayıcının resmî GitHub aynası

ProxyScrape'in resmî deposu v4 API'den oluşturulan protokol bazlı TXT/JSON/CSV listelerini yayımlıyor; ülke, latency, son kontrol ve anonimlik metadata'sı bulunabiliyor. Bu bilgiler sağlayıcının gözlemidir; bizim cihazda yeniden testin yerine geçmez. [ProxyScrape resmî depo](https://github.com/ProxyScrape/free-proxy-list).

| Kontrol edilen TXT | HTTP durumu | Ayrıştırılan aday |
|---|---|---|
| [HTTP](https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/protocols/http/data.txt) | 200 | 1107 |
| [SOCKS4](https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/protocols/socks4/data.txt) | 200 | 265 |
| [SOCKS5](https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/protocols/socks5/data.txt) | 200 | 1847 |

**Bize faydası:** v2 API geçici olarak erişilemezse aynı sağlayıcının resmî GitHub/CDN aynası alternatif indirme yolu olabilir. Yeni bağımsız proxy sağlayıcısı olarak sayılmamalı. V4 metadata kullanılacaksa doğru schema ve lisans/format doğrulamasıyla ayrı adaptör gerekir; sadece HTTP 200'ü yeterli görmek yine yanlış olur.

Önceki IShiro kaynak incelemesinde almroot, saisuiu, VannDev ve vmheaven için beş boş olmayan liste bulunmuştu; bu farklı bir kaynak taramasıdır. Ayrıntılar [önceki APK raporunda](<C:/Projeler/kizilkan-player-elite/GPT-HIT-HUNTER-INCELEME-2026-10-11.md:1>). Oradaki kontrol de listedeki proxy'lerin canlılık testi değildir.

## 8. Benim geliştirme sıram

| Sıra | Yapılacak | Sağlayacağı sonuç |
|---|---|---|
| 1 | Tarama mode/runId/terminal durum sahipliği; tek/çoklu pencere çakışması ve %100 ikinci tur açıklaması. | Kullanıcı bitmiş işi beklemez; durdurma doğru işi kontrol eder. |
| 2 | Proxy testinin IP/schema/anonimlik doğruluğu; unknown etiketi; HTTP/HTTPS yetenek ayrımı. | Yanıltıcı “Elite/çalışıyor” sonuçları azalır. |
| 3 | Proxy-auth/hedef yanıtı/timeout/body ayrımı; kesin yük sınırı; MAG etkinlik/havuz ön kontrolü. | Altyapı hataları hesabın sonucu gibi görünmez; proxy aşırı yüklenmez. |
| 4 | Proxy testi ve katalog testi için iş sahipliği, foreground başlangıç hatası, kalıcı ilerleme ve kurtarma. | Arka plan özelliği bütün testlerde tutarlı olur. |
| 5 | Gerçek ilk kare testi için açık arka plan politikası: güvenilir native arka plan renderer veya görünürlük kaybında beklet/belirsiz/devam. | UI görünmediği için “görüntü yok” sanılmaz. |
| 6 | Ayrı bitiş/hata/durdurma bildirimi; bildirime dokununca doğru sonuç arşivi. | Uygulamaya dönmeden sonuç öğrenilir. |
| 7 | Kaynak indirmelerinde düşük paralellik; kaynak sağlık/son başarı/eklenen tekil aday bilgisi; resmî ayna fallback. | Liste hazırlığı hızlanır, bozuk kaynaklar anlaşılır. |
| 8 | Kaynak grubu sahipliği; oturum için tutarlı rota; yalnız gerçek taşıma arızasına bağlı sınırlı sağlık toparlanması. | Silinen grup gerçekten çıkar; normal oturum akışı daha kararlı olur. |

Koruma yanıtı, CAPTCHA veya Cloudflare challenge görülünce sınırsız proxy değiştirme önerilmez; mevcut koruma/backoff ayrımı korunur. Daha fazla liste veya daha çok işçi, daha çok doğru hesap sonucu veya daha hızlı canlı görüntü garantisi değildir.

## 9. Kabul kontrolü ve Opus'a devir

Kodlama yapılmadan önce kapsam kullanıcıyla kararlaştırılmalı. Sonraki uygulamada aşağıdaki senaryolar ölçülmeli:
- Tek/çoklu tarama ardışık açma, sonuç penceresini kapatıp açma; aktif runId ile UI'nin eşleşmesi.
- İlk tur %100 iken retry kuyruğu dolu; durdurma ve terminal aktarımı.
- Uygulama arka plana alınmış, ekran kilitli, uzun iş, ağ kesilmesi ve süreç ölümü ayrı senaryolar.
- Proxy testinde kendi IP bilinmiyor, HTML 200, gerçek proxy 407, judge geçici hata ve HTTPS sertifika hatası.
- Bütün proxy'ler dolu/boş/ölü; MAG yerel açık-merkezi kapalı; direct fallback olmaması.
- Katalog ve ilk kare testinin bağlantı rotası, iptal ve bitiş bilgisi.
- Test bitince bildirimin sonucu göstermesi; sonuçlara dönüş ve süreç sonrası kurtarma.

**Bu incelemede yapılanlar:** ALPHA'nın kaynak/test/seçim/kalıcılık kodu okundu; bizim TS/TSX/Kotlin akışları ve IShiro native pool karşılaştırıldı; 39 public kaynak adresi listeler düzeyinde kontrol edildi; telefon sürümü/servisler/logcat ve DEV eski tanı olayları salt okunur incelendi; bu rapor proje köküne yazıldı.

**Değiştirilen uygulama dosyası yok.** Sürüm, bağımlılık, APK ve telefon kurulumu değiştirilmedi. Commit/push/build yapılmadı. İnceleme yardımcı dosyaları ve ham telefon kayıtları artifacts/hit-hunter-review altında Git dışında tutuldu; bunlar hesap bilgisi içerebildiğinden yayımlanacak rapora ham içerik alınmadı. Rapor için yerel bağlantı ve sayaç kontrolü yapıldı; uygulama kodu değişmediğinden uygulama testlerinin yeniden geçtiği iddia edilmedi.
