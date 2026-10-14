# KIZILKAN HOST V38.20 → güncel PLAYER v18.7.34: inceleme ve güncelleme planı

Tarih: **14 Ekim 2026**. Bu belge analiz/plan teslimidir. Uygulama kodu, sürüm, dal, Room verisi veya GitHub yayını bu inceleme sırasında değiştirilmedi. Python programı çalıştırılmadı/import edilmedi; kaynak okundu, AST ile tanım/çağrı haritası çıkarıldı. Yalnız mevcut PLAYER'ın iki küçük fonksiyon grubu ağ kullanmayan sentetik fixture'larda çalıştırılarak bulgular doğrulandı.

## 1. İncelemenin kesin tabanı

| Kaynak | İnceleme tabanı |
|---|---|
| Güncel PLAYER | `frontend/app.json`: **18.7.34**, dal `v18.7.34-rc1-ui-stale-anr-telemetry`, yerel HEAD `a0bfbecf`. Çalışma ağacı inceleme başlangıcında temizdi. |
| Son uygulama commit'i | `29994eea67f692e88f053c2368fff5c72c7d0053`; sonraki HEAD devir notudur. |
| Son GitHub derlemesi | [38371114946](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/38371114946), `completed/success`, aynı uygulama commit'i. Son üç derlemede v18.7.34/v18.7.33/v18.7.32 success doğrulandı. Yeni derleme tetiklenmedi. |
| Eski HOST planı | `C:\Users\KIZILKAN YOGA\Desktop\KIZILKAN_PLAYER_HOST_V38_SONRASI_GUNCELLEME_PLANI.md`; tamamen okundu. 12.587 bayt; SHA256 `cf37cb5a313da6edd55d1b4359ccfc6a63bf7785b7f8bfbfdb8d4faeb84bf743`. |
| Daha yeni HOST kodu | `C:\Users\KIZILKAN YOGA\Downloads\Telegram Desktop\KIZILKAN_HOST_V38_20.py`; 870.372 bayt, **18.514 satır, 468 fonksiyon/metot, 71 sınıf**. SHA256 `be17f18c980c00e8e5604104dc54638a49057c2d684ee63bff3118786a806d8d`. |
| HOST sürüm etiketi | Dosya adı ve 2012 sonrası canlı ayarlar V38.20; `__version__` satır 7 hâlâ V38.19, üst başlık V38.6, `_KIZILKAN_META` V38.12. Karşılaştırma etiketlere değil gerçek V38.20 koduna dayanır. |

18.514 satırın tamamı için AST yapısı çıkarıldı; PLAYER'a aktarılabilecek DNS, timeout, logging, session, kayıt, export, checkpoint, M3U/Stalker ve stream verification bölümleri ve çağrı yerleri incelendi. Exploit/generasyon/kimlik tahmini bölümleri PLAYER güncellemesine aday değildir; bunlar için çalışma/başarı testi yapılmadı. Kaynaktaki yüzde hız artışları ölçülmüş sonuç kabul edilmedi.

## 2. Önceki MD'de yeni sanılan, PLAYER'da zaten bulunanlar

| Önceki MD önerisi | Güncel koddan doğrulanan durum | Planın doğru şekli |
|---|---|---|
| Hesap/katalog/ilk kare ayrımı | `src/types/index.ts:172` civarında `PlaylistEndpoint` ayrı zamanlar ve `playbackTestState` tutar. `playlistEndpoints.ts:41` hesap/katalog/ilk kare/iptal etiketlerini ayrı verir. `EndpointPlaybackTest.tsx` üç seri kanal, 45 sn toplam ve gerçek ilk kare; `FrameProbe.kt:68` gerçek render callback'i. | Yeniden bir ilk kare motoru yazma; mevcut kanıtı bütün ekran ve dışa aktarım yollarında aynı modelle kullan. |
| Kilitli MAG endpoint | `magEndpointRegistry.ts:47` / `:59`, `stalker.ts:181` / `:3292`, `magBulkScan.ts` seçilmiş endpoint akışı mevcut. HTTP200 tek başına kanıt ağırlığı 0. | Yeni keşif sistemi kurma; handoff/metadata/import/refresh regresyon testlerini genişlet. |
| TTL DNS | `magHostFailover.ts:27`: pin 5 dk; `:28`: negatif 1 dk; Google DoH + Cloudflare yedeği, çoklu A, tek uçuş, AbortSignal ve keşif bütçesi mevcut. | Cache yok demek yanlış. Mevcut HTTP odaklı yapıyı düzelt/genişlet; aşağıdaki paylaşılan-IP hatası öncelikli. |
| Operation ID | `diagnostics.ts:497` `beginDiagnosticTrace`, `:521` `measureDiagnosticStage`; `operationId/traceId/runId/sessionId` ve native DB alanları var. `beginDiagnosticTrace` için uygulama genelindeki aramada yalnız tanım bulundu. | Yeni `operationTrace.ts` ile ikinci altyapı kurmak yerine var olanı gerçek akışlara bağla. Bazı yollar zaten elle traceId taşır. |
| Dönen loglar | `diagnostics.ts:78–81`: mevcut JSONL + 7 arşiv, segment başına 32 MiB; native normal 100k, kritik 10k DB sınırı ve 32 MiB kritik dosya mevcut. | Rotasyon eklemek tekrar iş olur. Bekleyen yazma kuyruğunu ve rapor seçimini iyileştir. |
| Maskeli export | `diagnostics.ts:243` hassas alan maskesi; hesap TXT'sinde güvenli ve tam arşiv ayrımı mevcut. | Maske hiç yok demek yanlış. Yeni HOST dosya formatı ve özel token biçimlerine test ekle. |
| Canonical export | Tanı dışa aktarımı `diagnostics.ts:897` **schemaVersion 7**, native alt snapshot schemaVersion 6. Bunlar farklı sözleşmelerdir. | V1'e düşürme; V7'yi typed yap, gerekiyorsa geriye uyumlu sonraki sürüm ekle. |
| Kalan işi kurtarma | `durableTestQueue.ts`: kalıcı katalog/ilk kare test kuyruğu. Proxy native FGS/journal/BitSet; scan retry ve ilk-tur journal mevcut. | Tarama/test kurtarmayı yeniden yazma. Normal içerik yenilemesi ve katalog türü devamını bunlardan ayır. |
| Katalog onarımında tamamlanan tür | `PlaylistContext.tsx:1274`: `completedKinds`, metadata yazımı ve `:1322` kalan tür; aynı süreçte arka plan/ön plan dönüşü var. Yeni onarımda Set başlangıçta boş kurulur. | Bütün refresh yolları için process-death sonrası doğrulanmış tamamlanan türden devamı ekle. |
| İlerleme | Katalog kartları sayı/toplam/sayfa; modal aktif geçen süre; tarama ve proxy için hız/ETA var. | Eksik olan: ortak katalog ETA, DB kayıt aşaması ve örnek sayısı/kalitesi. |
| Dosya import | `bulkAccounts.ts`: JSON/CSV/TXT, get.php/player_api/xmltv URL, KIZILKAN arşiv; `magArchive.ts`: MAG TXT/JSONL; Android büyük dosya native streaming. | Çoklu dosya + HOST biçimi + ortak önizleme ekle; mevcut parser'ları koru. |
| Adaptif davranış | `magBulkScan.ts:84` civarında host interval/backoff; 429'da ikiye katlama, Retry-After, protection stop var. | Eksik olan RTT dağılımına dayalı **timeout**. Adaptif hız ile adaptif timeout aynı şey değildir. |
| DNS yönetimi | `PlaylistDnsControls.tsx`, `DnsManager.tsx`, `playlistDnsManagement.ts`: ek DNS, hesap/görüntü testi, manuel seçme ve ilk kareye göre en iyi adres. | Sağlık özetini bu kanıtlara bağla; “ping en küçük → en iyi görüntü” kısa yolu ekleme. |
| Proxy hızları | v18.7.33'ten beri 16/32/64/128 + manuel, bağımsız TCP/verify sınırları ve canlı değişim var. | Bu incelemede aynı hız butonlarını tekrar ekleme. |

## 3. Yeni HOST V38.20'de ne değişmiş; ne alınabilir?

| Kaynak kanıtı | Yeni/yararlı fikir | Dikkat veya hata | PLAYER için karşılığı |
|---|---|---|---|
| Satır 2016–2023 | Stream doğrulama aktifliği, 2 kanal/2 sn, inactive atlama, ek port keşfi varsayılan kapalı, retry (3,5). | Sabit kısa timeout yavaş ama çalışan yayını kaçırabilir. Etiket gerçek bütün çağrı sürelerini kapsamıyor. | Hız/derinlik seçenekleri **hangi kanıt seviyesinin ölçüldüğünü** gösterebilir. Mevcut üç kanallı gerçek ilk kare kontrolü korunmalı. |
| Satır 15376–15394 | API hesabı ile yayın kanıtını ayrı tutma. | `False` ayrı unverified dosyaya gider; `None` belirsizliği aynı kuyruğa yazılmıyor. Sonrasında ana combo kaydı yine yapılır; state'ler eşdeğer değildir. | Belirsiz/test edilmedi/reddedildi/koruma/ilk kare ayrı; tüm belirsizler kalıcı yeniden test listesine. API başarısı görüntü başarısı gibi gösterilmez. |
| Satır 2704–2775 | Gerçek katalog stream_id'sinden birkaç yayın deneme; True/False/None fikri. | Satır 2748 HEAD **5 sn sabit**; 2 sn parametresi buna uygulanmaz. İki kanalda ek 10 sn + API süresi mümkündür. `octet-stream`/mpegurl başlığı tek başına medya veya render kanıtı değil. Boş canlı katalog “expired” sayılmaz; VOD-only olabilir. | Kendi bounded ilk kare testimiz daha güçlü. HEAD fikrini sadece düşük seviyeli ulaşılabilirlik etiketi olarak değerlendir. |
| Satır 14905–14935 | Doğrulanamayanları sonradan incelemek için ayrı çıktı. | URL sabit `http://`, port yoksa 80; HTTPS kaybolabilir. Maskesiz kullanıcı/şifre yazılır. | Mevcut şifreli arşiv/test kuyruğu üzerine “Belirsizler” filtresi + seçmeli güvenli/tam export. Yeni düz dosya zorunlu değil. |
| Satır 15281–15317 | user_info eksik/boş ise sınırlı retry. | Kopyalanan user_info'da `auth` taşınmıyor; sonrasında auth==0 kontrolü bu sonucu doğrulayamaz. status'un boş/bilinmeyen olması sonraki kodda aktifliğe çevrilebiliyor. | Mevcut `ScanOutcome`/`explicitScanAuth` korunur; metadata tamamlama retry'sı auth sonucundan ayrı ve sınırlı. |
| Satır 339–364 | Çoklu-IP cache 300 sn; geçici negatif sonucu kalıcı saklamama. | Sadece A, cache boyutu sınırsız; domain normalizasyonu/bounded eviction yok. `setdefaulttimeout` save/restore hâlâ süreç geneli değişikliktir; paralel işler arasında yan etki riski bitmez. | Mevcut TTL cache genişletilir; native ağ callback'i, sınır, request-local eşleme ve SNI korunarak HTTPS planlanır. |
| Satır 366–387 | Tek-IP cache yardımcı fonksiyonu. | TTL yok; None negatif kayıt kalıcı. AST'te doğrudan çağrı yeri **yok**. | Yeni diye aktarılmayacak; canlı multi-IP akışı esas alınmalı. |
| Satır 402–417; çağrı 2205 | Başarılı/yavaş host timeout hafızası. | Medyan/p90 RTT ölçümü yok. Yazım 14302/14308 IP, okuma 2205 hostname olabilir. Read süreleri 3/6/10; V38.20 4 sn cap. | Host+network+transport anahtarlı RTT örnekleri, sıcak/soğuk başlangıç ayrımı, timeout ve 429 ayrı. |
| Satır 429–446; çağrı 2715 | Bağlantı yeniden kullanım fikri. | get_session'ın doğrudan tek çağrısı stream verify. Global session her akışa uygulanmış değil; TLS adapter hostname/sertifika doğrulamasını kapatıyor. | Merkezi policy/context paylaş, kimlik/cookie/TLS/proxy bağlamlarını karıştırma; native mevcut HTTP stack'i yeniden değerlendirilir. |
| Satır 519–680 | SessionHitManager kilit, dedupe, tek oturum kaydı. | Dedup anahtarında parola var, **scheme yok**. Dosya append öncesi “seen” ve hit count artar; disk hatası sonraki aynı kaydı bastırabilir. | Kimlik ve başarılı kalıcı yazma ayrı; commit-before-completed. Native tarama journal'ımızdaki yaklaşım korunur. |
| Satır 967–1056; 2846 sonrası | JSON/CSV/HTML export; max_connections alanının düzeltilmesi. | Bazı metadata etiketleri eski; dinamik değerlerin HTML/CSV güvenliği ve sır maskelemesi ayrıca gerekir. | V7 tanı + mevcut hesap arşivinden aynı typed özet üretilir. Rapor ile yeniden import edilebilir tam arşiv ayrı. |
| Satır 1510–1523 | Geçici dosya + `os.replace` atomik checkpoint. | Bu uygulama dosya yazma seviyesidir; Room snapshot/katalog türü commit'i değildir. | Room transaction + staging/chunk API + mevcut AtomicFile/AES-GCM aynı işlem kimliğine bağlanır. |

HEAD gövde aktarmaz; bu nedenle “200 + video benzeri Content-Type”tan ilk kare sonucu çıkarmamak bir **protokol temelli çıkarımdır**. [RFC 9110 §9.3.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.2). Gerçek render olayı Media3'te ayrı callback'tir. [Android VideoRendererEventListener](https://developer.android.com/reference/androidx/media3/exoplayer/video/VideoRendererEventListener#onRenderedFirstFrame(java.lang.Object,long)).

## 4. Güncel PLAYER'da yeni tespit edilen somut sorunlar

### 4.1. P0 — Paylaşılan IP/port, başka portalın hostname'ine çevriliyor

`magHostFailover.ts:24`: `ipBack` anahtarı yalnız `ip:port`. `:125` yeni host aynı IP/port'a pin olunca önceki hostu ezer. `:152–160` logicalUrl çağrısında artık ikinci hostname döner.

Ağsız fixture sonucu (gerçek üretim TypeScript modülü, fake DNS/fetch):

```text
İstek:      http://a.example:8080/portal.php
A ve B IP:  198.51.100.10:8080
Dönüş:     http://b.example:8080/portal.php
```

`magPortalDiscovery.ts:262–269` gerçek akışta bu dönüşü kullanıyor; sonuç `FOREIGN_REDIRECT` olabilir. `stalker.ts:1004` / `:1126` de logicalUrl üzerinden endpoint doğrulaması yapıyor. **Fixture çakışmayı kanıtladı; belirli kullanıcı portalının cihazda bu yüzden bulunamadığı henüz kanıtlanmış değil.**

Çözüm: logical URL dönüşünü global ters haritadan değil o isteğin orijinal origin + seçilmiş IP bağlamından yap. Gerçek farklı-origin yönlendirmeler hâlâ reddedilmeli. Aynı IP'de birden fazla virtual host senaryosu korunmalı. Süresi geçmiş dönüş eşlemeleri temizlenmeli. Bu ağ doğruluğu düzeltmesi DNS cache genişlemesinden önce yapılır.

### 4.2. P0 — Büyük/küçük harfi farklı hesaplar aynı playlist ID

`add-playlist.tsx:122` `stablePlaylistId` bütün identity string'ini küçük harfe çeviriyor. `:129` Xtream identity'ye username ekleniyor. Sentetik gerçek fonksiyon testinde:

```text
https://fixture.example:8443 + UserA → pl-xt-0834ab88
https://fixture.example:8443 + usera → pl-xt-0834ab88
```

Böylece case-sensitive girişlerde kalıcı ID çakışması gerçek. `:283–288` ve `:1174` direct duplicate anahtarı ise username case'ini koruyor; iki katman tutarsız. Ayrıca direct duplicate anahtarı username+server, parola yok; aynı kullanıcı için yeni parola girilirse “zaten ekli” sonucu çıkar. Bu ikinci davranış mevcut hesabı güncelleme kararı da olabilir; otomatik bugfix ile iki ayrı abonelik icat edilmeyecek.

Çözüm: host/scheme/default-port normalizasyonunu credential normalizasyonundan ayır. Aday import/probe kimliği username+password case'ini korur. Mevcut playlistin kalıcı ID'si, Room, favori, izleme geçmişi ve progress **yeniden adlandırılmaz**. Yeni kayıtta çakışma tespit edilip farklı ID verilir; mevcut hesapla farklı parola durumu kullanıcıya “mevcut hesabı güncelle / ayrı ekle” şeklinde görünür olur. Yanlış DNS gruplama yapılmaz. İlgili şema/kimlik değişikliği ayrı migration/test tasarımı gerektirir.

### 4.3. P1 — Log depolama sınırlı, bekleyen yazma iş yükü ayrı sınırlandırılmamış

`diagnostics.ts:455` her çağrıyı `writeQueue.then(...)` zincirine ekliyor; pending sayı/byte ölçümü ve hard-cap yok. Yazıcıdan hızlı olay üretildiğinde closure'lar bekleyebilir. `NativeBlackBox.kt:52` single-thread executor için de açık queue sınırı yok; bu executor bütün normal eventleri yazıyor diye varsayılmamalı, ayrıca hangi çağrıların onu kullandığı ölçülmeli.

`newSingleThreadExecutor` varsayılan olarak sınırsız kuyruk kullanır. [Oracle API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/Executors.html#newSingleThreadExecutor()).

**Bu koddan doğrulanan bir yük riskidir; v18.7.34'teki gerçek ANR'ın kanıtlanmış kök nedeni değildir.** Önce queueDepth/oldestAge/writeLatency/batchSize ölçülür. Aynı olay tekrarlarını birleştirme, düşük önem örneklemesi, kritik ayrılmış kalıcı yazma yolu ve bounded byte kapasitesi tasarlanır. Eski 100k normal/10k kritik/JSONL kapasitesi keyfî azaltılmaz. MD'deki 2000/25 sayıları ölçmeden aynen alınmaz; dolu kritik kuyruk için taşma/kalıcılık politikası açık olmalı.

## 5. Kullanıcıya sunulacak güncelleme planı

| No / öncelik | Mevcut durum | Yapılacak | Kullanıcıya faydası |
|---|---|---|---|
| 1 — P0 | Paylaşılan IP/port dönüş eşlemesi çakışıyor; ağsız testle doğrulandı. | İstek bağlamına bağlı hostname/origin eşlemesi; TTL temizleme ve shared-IP regresyonları. | Aynı sunucuyu paylaşan doğru MAG portalların başka portal sanılması önlenir. |
| 2 — P0 | Case-distinct username aynı kalıcı ID; direct duplicate ve bulk kimlik politikaları farklı. | Ortak aday kimliği; case/parola/scheme korunması; mevcut ID/Room/favori sabitliği; görünür parola güncelleme çatışması. | Hesapların yanlış birleştirilmesi/üzerine yazılma riski azalır. |
| 3 — P0 | v18.7.34 çıkış telemetrisi var; çıkamama ve gerçek foreground ANR kökü henüz kanıtlı değil. | Yeni cihaz loguyla 6 kabul senaryosunu çalıştır; `ADD_PLAYLIST_EXIT_IGNORED`, teardown ve MainThread/queue ölçümünü birlikte yorumla. | Kullanıcının ekrandan çıkamama sorunu tahminle değil gerçek kökten düzeltilir. |
| 4 — P0/P1 | Trace alanları/API var; bütün işlemlere ortak bağlanmamış. | Ekleme, DNS, keşif, hesap, refresh, kayıt, player hazırlığına aynı operationId ve stage taşı; uçtan uca işlem özeti. | “Nerede bekledi, niye bulunamadı?” rapordan görülebilir. |
| 5 — P1 | Dönen/saklanan loglar bounded; bekleyen yazma zinciri için ölçüm ve sınır yok. | Byte+sayı bounded writer, önem politikası, batched write, queue/DB gecikmesi; ağır export UI thread yükünü ölç/azalt. | Yoğun işlemde loglar belleği ve ekran tepkisini daha az zorlar; gerçek hata korunur. |
| 6 — P1 | MAG HTTP pin/negatif TTL/DoH/çoklu A var; ortak cache/IPv6/HTTPS/network invalidation eksik. | Var olanı genişlet; TTL cevaplarını dikkate al, bounded LRU, ağ kimliği/transport anahtarı, cancellation ownership; native DNS route ile SNI/sertifika korunarak HTTPS tasarla. | Ağ değişince bayat IP takılması azalır; güvenli multi-IP HTTPS için temel olur. |
| 7 — P1 | Rate-limit backoff var; request timeout sabit/budget kalanına göre. | Başarılı RTT'den median/p90, yeterli örnekle bounded stage timeout; soğuk TLS/ilk istek ayrı; 429 ayrı. Mevcut tek seferlik evidence `grant()` davranışı korunur. | Hızlı uçta gereksiz bekleme azalır, yavaş ama çalışan uç aceleyle elenmez. |
| 8 — P1 | Hesap/katalog/ilk kare kanıtı var; bazı testler yalnız canlı katalog yes/no. | Ortak kanıt projeksiyonu ve sağlık kartı; boş/desteklenmiyor/geçici/koruma/iptal ayrı. VOD-only hesap “expired” sayılmaz. “Doğrulanmamış” filtresi ve kalıcı yeniden test. | Kullanıcı hangi hesabın API'si, kataloğu veya görüntüsünün çalıştığını ayırt eder. |
| 9 — P1 | Tek dosya CSV/TXT/JSON/get.php + KIZILKAN/MAG arşiv; seçim/preview kısmen mevcut. | Çoklu dosya, HOST etiketli bloklar ve mixed tür algısı; dosya/satır kaynağı; ortak dedupe; seçilmişleri PLAYER'ın kendi doğrulamasıyla ekleme. | HOST'un yeni/önceki TXT çıktıları ile mevcut arşivler tek yerden kontrollü eklenir. |
| 10 — P1 | Kalıcı test/scan kuyruğu var; normal refresh türleri için process-death devamı ortak değil. | owner/profile/playlist/generation'lı refresh journal; Room'da doğrulanmış tür commit'inden sonra tamamlandı işareti; bütün güncelle girişleri aynı sözleşme. | Kapanma sonrası tamamlanmış film/dizi yeniden indirilmez; yarım veri yanlış tamamlandı olmaz. |
| 11 — P1 | Katalog sayı/sayfa/aktif geçen süre var; ortak ETA/DB hız göstergesi yok. | Ayrı ağ/kayıt aşaması, işlem hızı, yeterli örnek sonrası ETA; bilinmeyen toplam için belirsiz gösterge; DB yavaşsa fetch backpressure. | Kullanıcı işlemin ilerlediğini ve hangi aşamada yavaşladığını görür; boş “0 sn kaldı” verilmez. |
| 12 — P2 | Tanı V7 JSON + maskeli/tam hesap TXT var. | V7'den ortak typed JSON/Markdown özeti, isteğe bağlı CSV; source/runId/kanıt/neden/tarih; yeni format maskesi ve alan tutarlılığı. | Opus'a gönderilecek tek rapor net olur; güvenli rapor ile geri yüklenebilir arşiv karışmaz. |

“Transport/session reuse” ayrıca yeni bir global client kurmak değildir: 4/6/7'nin ortak request context/policy'si içinde doğrulanmış endpoint, compat profile ve session cache yeniden kullanılır. TLS/cookie/kimlik/proxy bağlamları birbirine karıştırılmaz. Mevcut MAG katalog yöntem hafızası `magCatalogMethod.ts` ve live-first/verified Xtream enrichment korunur.

## 6. İlk paket önerisi ve bağımlılıklar

**İlk paket (önerilen v18.7.35):** 1 + 2 + 4 + 5 + 8'in mevcut kanıtı birleştiren kısmı. 3 için cihaz kanıtı elde edilirse kök neden düzeltmesi aynı pakete konabilir; kanıt olmadan “çıkış sorunu tamamen çözüldü” denmez. Her şeyi aynı anda yeniden yazmaktan kaçınılır; burada tekrar eden altyapılar özellikle elendi.

**Sonraki paket:** 6 + 7 (DNS/RTT); önce 1'in hostname bağlamı ve 4'ün ölçümü tamamlanır. Mevcut `MagDiscoveryBudget.grant()` yalnız kanıta bağlı tek uzatma sağlar; RTT ayarlayıcısı buna ilave sınırsız uzatma yapmaz.

**İçe aktarma/kurtarma paketi:** 9 + 10 + 11 + 12; 2'nin ortak kimliği ve 8'in kanıt modeli üzerine kurulur. Aynı build istenirse uygulanabilir kapsam birlikte kararlaştırılmalı; bu belge henüz kodlama onayı veya yayımlanmış sürüm değildir.

## 7. Kabul testleri — mevcut özellikleri koruyarak

1. Aynı IP/portta iki host; eşzamanlı ve sırayla istek; orijinal hostname ve gerçek foreign redirect ayrımı.
2. PIN TTL bitişi, kısa negatif bitişi, ağ değişimi, tek/çoklu A, resolver hatası, yalnız bir bekleyenin iptali, multi-tenant ipBack çakışması.
3. HTTPS multi-IP native route: doğru SNI, doğru sertifika, yanlış hostname sertifika reddi; TLS kontrolleri kapatılmaz.
4. `UserA`/`usera`, aynı user farklı password, HTTP/HTTPS, default port, explicit port, portal path; metadata case'i korunur.
5. Mevcut playlist ID/Room içeriği/favori/izlendi/progress yeni kimlik düzeninden etkilenmez; import mevcut hesabı kendiliğinden ezmez.
6. auth=1 ama expired/disabled/unknown ayrımı; auth=0; eksik auth; HTML200; 429/503; cancellation; metadata retry auth'u kaybetmez.
7. Boş canlı + dolu VOD hesabı; doğrulama derecesi ve katalog türü ayrı. Timeout “yetkisiz”, HEAD “ilk kare” sayılmaz.
8. `/c/` fingerprint ve `/portal.php` API kanıtı; endpoint lock refresh/alternatif DNS/import/export boyunca korunur.
9. Her operation START→stage→finish/failed/cancelled; nested ID aynı; hata raporu credential/token açmaz.
10. Yavaş DB writer ile kontrollü event burst; kuyruk byte/sayı bound; dropped/coalesced ölçümü; kritik kayıt kalıcılığı ve eski kayıt kapasitesi korunur.
11. Çoklu HOST/KIZILKAN TXT/JSON/CSV/MAG/M3U; maskeli kayıt import edilmez; dosyadaki Active etiketi başarı kanıtı değildir. Dosya/satır ve neden listesi görünür.
12. Katalog commit sonrası process death; yalnız kalan tür devam; güç kesintisi commit öncesi/sonrası; disk dolu; owner/profil değişimi; eski Room snapshot korunur.
13. Katalog ETA yeterli örnek olmadan yok; pause/foreground süreleri doğru; DB kayıt aşaması ağdan ayrı.
14. JSON/Markdown/CSV aynı schema ve aynı field sayısı; URL'de query/userinfo/M3U path token maskeleri; sadece kullanıcı seçerse maskesiz tam arşiv.
15. v18.7.34'ün temiz ekran, gerçek yarım test, terminal TXT, MAG yeni tur, frozen-process ve exit telemetry senaryoları.
16. Kodlama onayı sonrası tsc + master regresyon + Kotlin clean prebuild/assemble + gerçek cihaz açılış/kabul. Bu analizde yeni uygulama build/test PASS iddia edilmedi.

## 8. Önceki MD'ye özel düzeltmeler

- VerificationLevel `transport/session/account/catalog/stream-url/media/first-frame` tek bir sayısal merdiven gibi kullanılmamalı. Hesap doğrulanmışken codec/cihaz yüzünden ilk kare alınmayabilir; ilk kare geçmişi de yeni testte otomatik güncel sağlık değildir. Endpoint + account + testTime + network context ile kanıt projeksiyonu gerekir.
- `username present` sadece API'nin username alanını zorunlu tutmak değildir; kullanıcı tarafından verilen bilinen identity ve API'nin auth kanıtı birlikte değerlendirilir. API'nin opsiyonel alanı yok diye doğru hesap atılmaz.
- `critical/error never drop` sınırsız bellek anlamına gelmez. Bounded kapasite, ayrı kalıcı yol ve disk hatasının görünürlüğü tasarlanmalı; güç kesintisinde bütün uçuşta olayları koruma garantisi verilmez.
- Yeni diagnostics V1 ve yeni rotating files önerileri mevcut V7/rotating sistemi çoğaltmamalı.
- DNS cache'in mevcut TTL özellikleri rapordan çıkarılmamalı; buna rağmen yeni collision/HTTPS/ağ bağlamı ihtiyaçları gerçektir.
- Process-death refresh ile aynı süreçte pause/resume ve kalıcı test kuyruğu ayrı kabul edilmelidir.
- Sunucu scheme'i porttan tahmin edilmez; girdi ve doğrulanmış endpoint korunur. HEADER/HEAD/Content-Type, oynatma kanıtı yerine geçmez.
- PLAYER tarafına credential tahmini, otomatik MAC üretimi, exploit, WAF/Cloudflare atlatma veya global TLS doğrulamasını kapatma aktarılmayacak. Bu incelemenin karşılaştırması kullanıcı tarafından sağlanan hesapların oynatıcı/doğrulama/katalog işlevleridir.

## 9. Temel araştırma kaynakları

- [HTTP HEAD ve response semantiği — RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.2).
- [Executors ve single-thread executor kuyruk davranışı — Oracle](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/Executors.html#newSingleThreadExecutor()).
- Ağ değişimi callback'leri için [Android network state](https://developer.android.com/develop/connectivity/network-ops/reading-network-state). Cache invalidation bu API'nin proje için önerilen kullanımıdır, hazır otomatik DNS cache garantisi değildir.
- [Media3 render first frame callback — Android API](https://developer.android.com/reference/androidx/media3/exoplayer/video/VideoRendererEventListener#onRenderedFirstFrame(java.lang.Object,long)).

## 10. Opus'a devir

Başlangıç `a0bfbecf` / v18.7.34; son başarılı app build `29994eea` / build157. Bu turda yalnız bu Markdown dosyası eklendi. Üretim kodu değiştirilmedi, kullanıcı dosyaları kopyalanmadı/çalıştırılmadı, commit/push/build tetiklenmedi. DNS ve playlist-ID fixture'ları gerçek PLAYER fonksiyonları + sentetik input kullanır; cihaz kullanıcı sorununun kökü olduğu iddiası yoktur. İlk uygulanacaklar 4.1 ve 4.2; aynı zamanda v18.7.34 açık cihaz kabulü unutulmayacak. Onaylanan kapsam netleşmeden geniş yeniden yazma yapılmayacak.
