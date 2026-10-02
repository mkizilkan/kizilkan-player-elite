# GPT → Opus ayrıntılı güncelleme devri

## 1 Ekim 2026 — v18.7.3 RC1 başlangıç kaydı

Bu bölüm tarihî başlangıç durumudur. Güncel uygulama, test ve dağıtım durumu aşağıdaki **2 Ekim** kaydındadır.

- Taban: `4240f6cc` / `v18.7.2-rc1-multimac-ux`.
- Çalışma dalı: `v18.7.3-rc1-gpt-audit`.
- Kullanıcı tespit/öneri raporu, bütün kanıtlı düzeltmeleri tek build içinde uygulama, ayrı dal push ve manuel APK tetikleme istedi.
- Önceki salt okunur incelemede kod değiştirilmedi. Uygulama bu kayıtta başlar.
- Ayrıntılı bulgu ve kabul matrisi: `GPT-TESPIT-VE-ONERILER.md`.
- Mevcut workflow push dalları main/master/eski özel dal; bu çalışma dalı push ile APK başlatmaz.
- Kalıcı PlayerHost, Room kanonik depolama, MAG live-first, tek upstream ve mevcut imza düzeni korunur.

### Dosya/işlem günlüğü

| Dosya | Ne yapıldı / neden | Durum / doğrulama |
|---|---|---|
| `GPT-TESPIT-VE-ONERILER.md` | Önceki inceleme ve kullanıcının MAG/yedek talepleri kaynak kökleri, çözümler ve kabul senaryolarıyla kaydedildi. | Oluşturuldu. Uygulama durumu bu devirde takip edilir. |
| `frontend/src/utils/accountExpiry.ts` | Tarama/kart/TXT/sıralama için ortak epoch/tarih sözleşmesi oluşturuldu. | Entegrasyon ve regresyon testi sürüyor. |
| MAG tarama ve sonuç ekranı | Kapsam/koruma/seçim/export/iptal geliştirmeleri. | Uygulama sürüyor. |
| Yedekleme motoru ve ekranı | Seçmeli önizleme/merge/staging/journal geliştirmeleri. | Uygulama sürüyor. |
| Player ve native kaynak yaşam döngüsü | Önceki kanıtlı player bulguları. | Uygulama sürüyor. |
| Profil/kütüphane/Room/TV | Sayaç, async sahiplik ve alternatif girişler. | Uygulama sürüyor. |

### Gerçek doğrulama sonuçları

1 Ekim başlangıcında bu sürüm için tamamlanmış build veya cihaz kabulü yoktu. Sonuçlar aşağıdaki güncel kayda eklenmiştir. Önceki sürümün başarılı kontrolleri bu sürümün kanıtı sayılmaz.

### Opus'un devam ederken koruyacağı kurallar

1. Önce CLAUDE.md, bu dosya ve sürüm devrini oku; belirtilen taban/dalı doğrula.
2. Android'de JS boş içerik dizilerini gerçek boş katalog sayma; native sayım esas alınır.
3. Exact MAG kapsamını login fallback veya kayıt/export yeniden girişinde farkında olmadan genişletme.
4. Seçmeli restore'da bütün mevcutları temizleyen eski helper'ları kullanma.
5. Native restore applied/finalized durumunu kalıcı journal ile birlikte değerlendir; yanlış rollback veri silebilir.
6. Test edilmemiş cihaz davranışını çalışıyor diye yazma. Uygulamayı kaldırıp kullanıcı verisini silme.
7. Her değişiklikte dosya/işlem/kanıt/sonuç/eksik senaryo tablosunu ve sürüm devrini güncelle.

## 2 Ekim 2026 — v18.7.3 RC1 ayrıntılı uygulama kaydı

Bu bölüm önceki çalışma başlangıcı kaydını günceller. Taban `4240f6cc`, dal `v18.7.3-rc1-gpt-audit`. Beş sürüm alanı **18.7.3 / 180703 / GPT ELITE v18.7.3 RC1** olarak yükseltildi. Yeni paket bağımlılığı veya Room şema değişimi yok. Gömülü master PIN ve kurtarma yolu kullanıcı talebiyle korunuyor. Kalıcı PlayerHost/Room/live-first/tek upstream kararları korunuyor.

### MAG — M01–M11 ve E03

| Dosya / bölge | Ne yapıldı, neden | Son davranış / kanıt |
|---|---|---|
| `frontend/app/mag-bulk.tsx` kapsam/start | exact varsayılan, fallback/all ayrı seçenek; hızdan bağımsız kapsam, hazırlık dahil tek iş sahipliği, 1–16 paralellik, gerçek abort/pause/unmount | Kullanıcı girdiği adresle sınır koyabilir; çift başlatma/durdur sonrası devam önlenir. |
| Aynı dosya input/results | Boyutu 128 px ile sınırlı çok satırlı giriş ve FlatList sonuçları; endpoint+MAC checkbox; hepsi/görünenler/koruma görülmeyenler seçimi ve seçimi kaldırma | Çok MAC ekranı uzatmaz; yalnız seçilenler eklenir veya dışa aktarılır. Cihazda odak/kaydırma kabulü ayrıdır. |
| Aynı dosya add/export | Native ok/uri/path sonucu denetlenir; kısmi TXT/JSON durumları ve kategori uyarıları gösterilir; son doğrulanan hesap bilgisi korunur; live-first sonrasında zenginleştirme yapılır | Sahte dosya başarı mesajı yok; toplu eklenen hesap film/dizi aşamasında unutulmaz. |
| `frontend/src/utils/magBulk.ts` | Ham :80/:443 bilgisi, canonical endpoint, scope aday planı, TXT hesap bloğu ve bütün kategori türleri | URL port normalizasyonu kullanıcı niyetini silmez; aynı host farklı portal tekilleşmez. |
| `frontend/src/utils/magBulkScan.ts` | Yalnız pozitif sonuçları paylaşan singleflight; ilk MAC'in başarısızlığı host için null cache olmaz; host başına 650 ms gate/Retry-After; abort/pause sahipliği | Daha az tekrar keşif; koruma/429 sonrasında kör genişleme yapılmaz. |
| `frontend/src/utils/stalker.ts` classifier/login | Cloudflare cf-mitigated/CAPTCHA/WAF güçlü işaretleri; 429 ve erişim reddi ayrı; genel 403, geçersiz MAC sayılmaz; endpoint/stage/zaman/transport/evidence saklanır | Koruma görüldü/görülmedi/belirsiz gözlemidir; ban bağışıklığı veya atlatma özelliği değildir. |
| Aynı dosya account/date | expire_billing_date alias; epoch/tarih ortak parser; eksik yeni profil eski doğrulanmış bilgiyi silmez | Kart, tarama ve TXT aynı bitişi gösterir. |
| Aynı dosya catalog/enrichment | WeakMap ile hesap çalışma kapsamı, terminal durum ve AbortController; türü belirlenmiş protection/rate-limit/cancel hataları catch bloklarında korunur; sıradaki kategori önizlemesi iptal edilir | VOD CAPTCHA sonrası Series hiç çağrılmaz; farklı hesap etkilenmez. |
| `frontend/modules/panel-scan/index.ts` | AbortSignal → native job cancel + typed CANCELLED | Durdurma yalnız UI bayrağı değildir. |
| Yeni `accountExpiry.ts`, `accountCard.ts` | Tarih/sınırsız/bilinmeyen parser; bitiş/protection/catalog state için ortak kart satırı | Ayarlar ve seçim kartları aynı alanları kullanır. |
| `frontend/app/(tabs)/settings.tsx`, `app/playlist-select.tsx`, `src/utils/playlistManagement.ts` | Ortak hesap satırları ve expiry sıralaması; gerçek count ve empty/missing açıklama; load error retry | Eski pozitif sayı ve yanlış bitiş ayrışması giderilir. |

### Seçmeli yedek — B01–B07

| Dosya / bölge | Ne yapıldı, neden | Son davranış / kanıt |
|---|---|---|
| `frontend/app/backup.tsx` preview/apply | Dosya önce önizlenir; liste seçimi/hepsi/filtre/mevcut hedef profil; profil/ayar snapshot'ı ayrı ve açık eylemdir; barrier bırakıldıktan sonra başarıda ve hatada yeniden yükleme yapılır | Kullanıcı yükleme kapsamını seçer, seçilmeyenler korunur; finalized cleanup hatasında da ekran diskle uzlaşır. |
| Yeni `frontend/src/utils/backupSelection.ts` | Kaynak profil+ID anahtarı; payload doğrulama; hedefe yönelik merge; global ID tekrarlarını ayıklama; farklı hesap/paylaşılan/yetim veya ayrılmış hedefler için yeni ID | Seçilmeyen meta/katalog/profil/ayar silinmez; yanlış hesabın üzerine yazılmaz. |
| Yeni `backupRestoreTransaction.ts` | KV before/after journal; native applied/finalized marker; eski rollback kopyası; açılış kurtarması; ikinci JSON encoding dahil 1,5 MiB sınırı ve readback | Process-kill/iptal/yazma hatasında tutarlı eski veya finalized durum. Cihaz process-kill testi yerine geçmez. |
| Aynı dosya cleanup | Finalized legacy hedef temizliği, staging/rollback cleanup, finalized yanlış rollback reddi | Eski dosyanın Room'u yeniden canlandırması önlenir. |
| `frontend/src/utils/backup.ts` | Seçmeli JSON staging/journal; eski full/quick/personal yolları açıkça ayrı tutulur; progress/hidden/watched/seriesLast/startLast/libraryLegacyOwner anahtarları kapsanır | Yeni kişisel kayıtlar yedekten eksilmez. |
| `frontend/src/utils/backupV3.ts` | Yalnız header önizlemesi; bütün dosyada end/digest/set doğrulama; yalnız seçilenlerin staging'e alınması; ortak journal | Bozuk seçilmeyen bölüm sessiz kabul edilmez; büyük katalog tek JS JSON nesnesi olmaz. |
| `frontend/app/_layout.tsx` | Provider açılışı öncesi bekleyen restore kurtarması; hatada koruma ve yeniden deneme | Yarım restore üzerine normal çalışma açılmaz. |

### Metadata, profil ve kişisel kayıt — D02–D07 / E02/E06/E07/E08

| Dosya / bölge | Değişiklik | Neden / sonuç |
|---|---|---|
| `frontend/src/store/PlaylistContext.tsx` boot/count | fromMeta'da ağır verinin gerçek 0 sayısı veya doğrulanmış Room sayımı önceliklidir; ready/empty/missing ve expectedCounts; açılış yazımının sonucu denetlenir | Kart gerçek 0 gösterir; sağlıklı boş kaynak onarım döngüsüne sokulmaz. |
| Aynı dosya publish | publishMetadata güncel ref üzerinde patch ve ortak commit kuyruğu; kalıcı kayıt sonrası state; expectedProfile ve yazım öncesi restore guard; bozuk deletion guard açık hata verir | Düzenleme kaybolmaz; bozuk metadata üzerine sessiz yazılmaz. |
| Aynı dosya active switch | Bütün işlem drainer'a kayıtlıdır; yalnız lastUsedAt/count/state patch'i; sonucu denetlenen active-key kuyruğu; await sonrası generation/profile/restore kontrolü | Eski seçim, restore metadata/key'sini ezmez. |
| Aynı dosya restore/reload | Pending catalog barrier, repair abort/wake; commit/active-key/provider/load drain; reload bus + resolve/reject waiter | Geç yazım ve kilit döngüleri önlenir. |
| Aynı dosya migration | Anahtar başına kilit; sonucu denetlenen write/remove; önce migration owner claim; mevcut Room korunur; kaynak başarıya kadar kalır; aynı sahip yeniden deneyebilir | Taşıma hatasında kaynak korunur; başka profile ikinci kopya olmaz. |
| Aynı dosya mutations | add/prepared/remove/heavy/enrich için catalog lock+commit; actual count ve false bigStore sonucunda hata; paylaşılan Room sahipliği; iç içe eski commit deadlock'u giderildi | Eşzamanlı işlemler birbirini ezmez; başka profil katalogları silinmez. |
| Aynı dosya favorites/recent | Profil+liste namespace; raw ref, sıralı ve sonucu denetlenen yazım, load epoch; eski verinin sahibi ve yalnız mevcut kapsamı temizleme | Hesaplar, aynı ID üzerinden kişisel bilgiyi paylaşmaz. |
| Aynı dosya kritik okuma/aux | Metadata hazır olmadan mutasyon reddi; strict storage okuması ve iç şema kontrolü; aux yüklemesi başında önceki raw snapshot geçersizleştirilir | Bozuk kaynak yeni boş listeyle değiştirilmez; başarısız boot sonrası ağır katalog yazımı başlamaz. |
| `frontend/src/utils/catalogOperations.ts` | restorePending ve restoreWriting ayrı; pending yeni işleri reddeder, eski tail biter | Restore eski tail'i bloke edip kendisini beklemez. |
| Yeni `profileDataReload.ts` | Ortak reload ve write/load drainer registry | Restore sonrası providerların kalıcı veriye dönmesi. |
| `frontend/src/store/ProfileContext.tsx` | Sıralı ve sonucu denetlenen kalıcı kayıt; ilk profil/seçim rollback/generation; PIN/load drainer; strict dış/iç kayıt; loadError/retryLoad/readiness; credentialEpoch ve await sonrası PIN/profil/restore kontrolü; anahtar temizliği/paylaşılan Room sahipliği | Kaydedilmeyen profil/PIN başarı sayılmaz; bozuk kaynak korunur; eski yükleme veya PIN sonucu yeni oturumu açmaz. |
| `frontend/src/store/ParentalContext.tsx` | ref üzerinden sıralı checked write; load cancel/drain/PIN migration; strict şema; loadError/retryLoad/readiness; credentialEpoch ve eski unlock sahibinin kontrolü | Kategori oturumu başka profile taşınmaz; başlangıç hatasında kategori erişimi açılmaz. |
| `frontend/src/store/LibraryContext.tsx` | Tüm koleksiyonlarda profil/liste kapsamı; sahipliği denetlenen callback, load epoch, raw ref ve sıralı yazım; updater'da disk yan etkisi yok; restore drain/reload | Progress/watchlist/hidden/watched/seriesLast, aynı ID'li hesaplarda karışmaz. |
| Aynı dosya iç kayıt doğrulama — E12 | Dış JSON ve map/ID dizisi yanında progress/seriesLast/watched iç kayıtlarının null/yanlış alanlı biçimleri doğrulanır | Bozuk kaynak korunur; başarısız load sonrası mutasyon reddedilir, geçerli reload toparlanır. Yeni senaryo dahil Library 8 grup PASS. |
| Yeni `libraryScope.ts`, `libraryLegacyOwner.ts` | Encode edilmiş playlist namespace; eski verinin ilk sahibini sonucu denetlenen claim ile kaydetme; eski raw kaynak korunur | Kayıpsız geçiş; eski kayıtlar otomatik tüm hesaplara kopyalanmaz. |
| `frontend/src/utils/localMedia.ts` | saveLocalProgressChecked; migration sırasında silmeden önce kopyalama | Kopya hatasında eski ilerleme kaybolmaz; local ID IPTV'ye girmez. |
| `frontend/src/types/index.ts` | catalogLocalState ve expectedCounts için uyumlu alanlar | Gerçek sayı/beklenen sayı ayrımı. |

### Player/Cast/kayıt/TV/EPG — P/T/D01/D05/D06 / E04/E05

| Dosya / bölge | Değişiklik | Neden / sonuç |
|---|---|---|
| `frontend/src/player/PlayerHost.tsx` motor | Profil await'i sonrası token tekrar denetlenir; header içeren kaynak kimliği; override aboneliği; synthetic sahiplik/kategori guard | Eski istek yeni oturumu değiştirmez; yalnız header değişen düzenleme uygulanır. |
| Aynı dosya lifecycle | Media3 null replaceAsync ile gerçek detach; timeshift/kaynak sahipliği; yakalanmış cleanup işlemini await etme | Eski görünmeyen bağlantı, tek upstream hesabı işgal etmez. |
| Aynı dosya Cast | Sürekli mounted controller; selector playback yönetmez; disconnect cleanup, yerel bağlantı tekrar kurulmadan önce tamamlanır; generation kontrolü | Panel kapalıyken zap/teardown ve eski callback davranışı doğru yönetilir. |
| Aynı dosya recording | Bekleyen REC ile native onaylı REC ayrıdır; sahiplik denetimli iptal ve yakalanmış stop; seçilen SAF URI parametresi; özel staging ve doğrulanan public kopya | Erken yanlış REC/eski klasör önlenir; kopyalama başarısız olursa kaynak kalır. |
| Aynı dosya progress | Synthetic öğede gerçek profil/liste/tür; await sonrası kapsam guard | Eski hesaptan çözülen bölüm yeni hesaba progress yazmaz. |
| `frontend/src/components/CastButton.tsx` | controllerOnly/managePlayback/load generation; bütün await/end/unmount guard'ları | Geç çözülen kaynak, yanlış eski/yeni oturuma yüklenmez. |
| `frontend/src/player/v2/request.ts`, `types.ts` | UA/Referer/Origin/Cookie/Authorization kanonik biçimi; packed Kodi decode, CRLF filtresi, sıralı header kimliği ve açık UA bridge gereksinimi | Header isteyen bütün türler ve Cast aynı sözleşmeyi kullanır. |
| `frontend/src/player/v2/memo.ts` | JSON([playlistId,channelId]) | Farklı sağlayıcılar aynı ID üzerinden motor öğrenimini paylaşmaz. |
| `frontend/src/utils/iptv.ts` | VOD/series pending headers korunur | Native/JS M3U eşdeğerdir. |
| Yeni `categoryAccess.ts` | allowed/pin/blocked ortak politikası; kids profilinde kilitli kategori kapalıdır | Alternatif giriş, kategori PIN'ini atlamaz. |
| Yeni `resolveLivePlayback.ts` | Önce kanonik Room getItem/izin; sonra override/MAG/token/headers | Boş JS dizisi/ham MAG URL yerine gerçek kaynak kullanılır. |
| `frontend/app/tv-home.tsx` | Generation sahipli busy/reset/son sorgu; eski finally guard; ortak resolver/PIN ve navigasyon sahipliği | Busy sırasında kategori/arama reset'i kaybolmaz. |
| `frontend/app/multi-view.tsx` | Adil paylaştırılan, sınırlı native sonuçlar; toplam <=300; sağlayıcı kapsamlı ID; ortak resolver/PIN/header; TV yönü ve gizli sesin sıfırlanması | Room/MAG çoklu ekran ve TV yönü doğru yönetilir. |
| `frontend/app/epg.tsx` | Native getItem/sahiplik; await sonrası eski sonucu engelleme; program hatasını sıfırlama | Room kanalının EPG'si bulunur. |
| `frontend/app/(tabs)/favorites.tsx` | Native özel grup; türe göre ID; PIN sahipliği | Android özel favorileri boş kalmaz; doğru rota kullanılır. |
| `frontend/app/detail.tsx` | Gerçek kategori/headers; profil/liste sahibi; kanonik öğe; resume await sonrası guard | Synthetic başlık/kilit/sahiplik kaybolmaz. |

### Native dosya günlüğü

Tam Kotlin yolları `frontend/modules/<modül>/android/src/main/java/expo/modules/<paket>/` altındadır.

| Dosya | Değişiklik / işlem sınırı | Doğrulama / sınır |
|---|---|---|
| `kizilkan-native-core/.../KizilkanNativeCoreModule.kt` | Atomic restore duplicate/reserved ID denetimi ve Room applied/finalized marker; doğrulanan summary ile üç tablonun gerçek sayımı; kanonik M3U headers; public kopyalama; arka planda crypto/PIN ve senkron iptal | Gerçek release Kotlin/KSP derlemesi geçti; cihazda Room transaction kabulü ayrıdır. |
| `frontend/modules/kizilkan-native-core/index.ts` | Restore marker/summary/crypto/public copy bridge; getItemsByIds için sırası korunan, tekilleştirilmiş 250'lik partiler ve giriş sırası | Büyük ID listesi 500'de kesilmez. |
| `kizilkan-native-core/.../PublicStorage.kt` | TXT readback/finish hatası; 64 KB kopyalamada SHA-256+boyut/readback; hatada hedef silinir, kaynak korunur | Gerçek SAF provider için cihaz kabulü bekliyor. |
| `kizilkan-native-core/.../LiveTimeshiftManager.kt` | Ortak OkHttp, tek upstream; örtük AES IV, upstream sequence üzerinden açık IV'ye çevrilir; teeLock/running tekrar kontrolü; gerçek kayıt hatası/bytes/stop sırası | RFC 8216 dayanağı; canlı HLS/decoder cihaz testi bekliyor. |
| `kizilkan-native-core/.../CastBridgeServer.kt` | startLiveHls synchronized; stopAll ile aynı kilit | Cast eski recorder'ı bırakmaz. |
| `mpv-player/.../KizilkanMpvView.kt` | currentSoftwareDecode, reload sırasında korunur | Yazılım fallback'inin reload sonrası donanım çözmeye dönmesi önlenir. |
| `panel-scan/.../PanelScanModule.kt` | Bloklayan proxy işleri arka plan CoroutineScope'ta; iptal ayrı tek thread'de; OnDestroy temizliği | Üretim registration+JVM yavaş HTTP fixture PASS; JSI cihaz testi değildir. |
| `panel-scan/.../ScanProxyPool.kt` | Atomik iptal, mevcut bağlantı, önceden iptal, disconnect ve cleanup; iptal proxy hatası sayılmaz | Yerel HTTP iptali <1,5 sn; heartbeat <500 ms; lease bir kez bırakıldı. |
| Yeni `panel-scan/.../ScanWorkCoordinator.kt` | Atomik claim/checkpoint; birleştirilmiş completed prefix/tested aralıkları; worker failure/interrupt drain | Sıra dışı tamamlanan işlerde hesap atlanmaz ve sayaç iki kez artmaz. |
| `panel-scan/.../PanelScanService.kt` | Future hatası FAILED; streaming done/drain/açık stream iptali; strict auth; geçici probe; tam Retry-After; tüm found sayısı; versiyonlu committed prefix recovery | 500 found/UI 200, 20.000 satırlık producer failure ve HTTP fixture. |
| `panel-scan/.../ScanJournalStore.kt` | Eski cursor/tested güncellemesine karşı guard; tüm found sayısı/versiyonlu checkpoint | Recovery'nin gerilemesi önlenir; legacy uyumu sağlanır. |
| `frontend/src/utils/bulkAccounts.ts` | Sondaki boş locator ve label alias için native eşdeğerlik | Combo satırı yanlış atılmaz. |

### PIN ve şifreli yedek — X01/E08

- Yeni `BackupCrypto.kt`: Android JCA AES-256-GCM; 16 byte salt, 8 byte nonce prefix ve chunk index; header/index/final AAD; 64 KB kayıt, 16 byte tag ve zorunlu final tag. PBKDF2-HMAC-SHA256 **600.000** iterasyon. Yanlış parola, bozulma, kesilme, sıra hatası ve sondaki fazladan veri reddedilir; bütün doğrulama bitmeden restore URI yayımlanmaz. Türetilen key/char/spec temizlenir.
- Kripto iptali; girişte, KDF öncesi/sonrası, her chunk'ta ve final flush sırasında kontrol edilir. Tek KDF generateSecret çağrısının ortası kesilemez; KDF sonrası kontrolde iptal edilir. Native wrapper, hata/iptalde özel output'u siler ve job cleanup yapar. Önceki doğrulanmış chunk staging'e yazılmış olabilir; public'e yayımlanmaz.
- Yeni `pinProtection.ts`: Android native ve WebCrypto'da eşdeğer `kzpin:1:iterations:salt:hash`; eski düz PIN doğrulaması ve load/persist migration. Profil/parental/playlist PIN kapsamı. verifyPin, `Promise<boolean>` döndürür; mevcut uygulama akışları async checkPin kullanır.
- `pin.ts`: CSPRNG ve bias-rejection ile kurtarma kodu; sıralı, sonucu denetlenen yazım ve restore drain. Kullanıcının istediği master/recovery korundu. Kurtarma kodu ve hesap user/pass/URL bilgileri mevcut uygulamaya özel depoda tutulur; tüm yerel DB şifreli değildir. WebCrypto olmayan eski platformda düz PIN uyumu korunur.
- Android şifreli export varsayılandır; export/import parola alanı en az 8 karakter ister, parola saklanmaz. Şifreli dosya clipboard JSON'a düşmez; düz export kullanıcı seçimidir. UI ve native sınırları aşağıdaki tabloda kayıtlıdır.
- Birincil kaynak araştırması: [OWASP 600k](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Android AES-GCM](https://developer.android.com/privacy-and-security/cryptography), [Cloudflare challenge](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/), [HLS IV](https://www.rfc-editor.org/rfc/rfc8216#section-5.2).

| Dosya / bölge | Son değişiklik / bulgu | Davranış, doğrulama ve sınır |
|---|---|---|
| `frontend/src/utils/storage/storage-base.ts` | `retrieveStrict` ve additive `getItemStrict` — E09 | Gerçek null/yokluk fallback alır. Bozuk dış JSON, yanlış tip ve geçersiz sayı hata olur. Geçerli boolean/number korunur; eski permissive API uyumluluk için durur. |
| `frontend/src/utils/storage/index.ts`, `index.web.ts` | Native/web strict I/O uygulaması — E09 | Platform getItem hatası varsayılana çevrilmez; kritik çağıran kaynak değişmeden hata alır. Gerçek storage fixture: 8 grup PASS. |
| `ProfileContext.tsx`, `ParentalContext.tsx`, `PlaylistContext.tsx`, `LibraryContext.tsx` | Kritik strict okuma ve iç şema; başarısız yüklemeden sonra mutasyon guard — E09/E10/E12 | Malformed JSON, yanlış dış/iç biçim veya read failure yeni boş kayıt diye yayımlanmaz. Profile/Parental `loadError/retryLoad` ve hazır olma kapısı, Playlist metadata sahibi, Library yükleme sahibi kontrol edilir. |
| `frontend/app/_layout.tsx` | Profile/Parental yükleme hatasında kök hata/yeniden dene kapısı — E10 | Başarısız başlangıç güvenlik durumu ile normal uygulama açılmaz; geçerli reload sonrası kapı kalkar. |
| `frontend/src/utils/pinProtection.ts` | 600k salt'lı PBKDF2-HMAC-SHA256; native/WebCrypto; eski PIN migration — X01/E10 | PIN biçimi korunur, migration false write/hash failure kaynağı silmez. Credential epoch ile bekleyen doğrulama eski yetki veremez. |
| `frontend/src/utils/pin.ts` | Strict kurtarma okuması; checked serial write/drain; ortak 4–10 sayısal PIN sabitleri | Master/recovery kullanıcı isteğiyle korunur. Yerel recovery ve hesap depolaması şifreli kasaya dönüşmedi. |
| `frontend/app/pin-entry.tsx` | Sayısal 4–10 giriş; maxLength/kırpma aynı politikada; loading/error ve profil/kategori işlem sahipliği — E10 | 10 haneli PIN girişte kesilmez; geç çözülen doğrulama eski kategori/profil rotasını açmaz. Gerçek ekran fixture: 4 grup PASS. |
| `frontend/src/utils/backup.ts` | Strict snapshot; `false/0` ayrımı; number/boolean metadata patch; gelen hassas iç şema doğrulaması — E09/E11 | Yedekte geçerli false/0 kaybolmaz. Yanlış profil/PIN/parental/liste biçimi yazımdan önce reddedilir. |
| `frontend/src/utils/backupRestoreTransaction.ts` | Strict journal readback; schema, session/phase, before/after anahtarları, duplicate/reserved hedef, stage/rollback sahipliği — E09/E11 | Bozuk journal ile native/metadata yan etkisi başlatılmaz; kaynak journal korunur. Primitive snapshot rollback'te aynı değerine döner. Restore: 52 grup PASS. |
| `frontend/app/backup.tsx` export/share | Android şifreli varsayılan; full/quick/personal önce üretilir, sonra `.kzbe`; mount+işlem tokeni+AbortController; her await sonrası sahiplik | Geç picker/crypto sonucu paylaşım/state başlatmaz; encryption sonrası düz kaynak silinir. Yanlış parola önizleme/restore üretmez. Gerçek ekran fixture: 6 grup PASS. |
| Aynı dosya import/apply | `.kzbe` parola/auth decrypt → mevcut önizleme ve seçmeli restore; preview/profil sahipliği ve restore barrier/reload | Çözülmüş düz geçici dosya kapanış/değiştirme/unmount/uygulama başarı-hatasında temizlenir. Hata sonrasında ekran diskten tekrar yüklenir. |
| Aynı dosya paylaşım ömrü | Paylaşım başarılı dönerse ciphertext veya açıkça seçilen düz export URI'si hemen silinmez; share failure hedefi temizler | Android chooser dönüşü alıcının dosyayı okuduğunu kanıtlamaz. Paylaşılan hedef cache'de tutulur; alıcı URI'yi sonradan okuyabilir. |
| `frontend/src/utils/encryptedBackup.ts` | Native encrypt/decrypt için jobId+AbortSignal; abort listener cleanup, cache sahipliği ve native ok/uri/kind doğrulaması | Hata/iptal output'u temizler; KDF ortasında zorla durdurma garantisi yoktur. Üretim native kripto 9 grupta ayrıca doğrulandı. |
| Aynı dosya TTL | Yalnız yönetilen export adları ve cache kökü; sonraki export açılışında 24 saatten eski dosya temizliği | Restore geçici dosyaları ve başka cache dosyaları taranmaz/silinmez. Tam 24 saatte çalışan arka plan görevi değildir. |
| `frontend/app/backup.tsx`, `frontend/src/utils/googleDrive.ts` | Şifreli modda doğrudan düz Drive upload hem UI hem çalışma zamanında engellenir; plaintext için açık opt-out; fetch'e AbortSignal | Şifreli dosya sistem paylaşımıyla Drive'a gönderilebilir. Uygulama içinden binary `.kzbe` upload eklenmedi; direct Drive kullanıcı açık düz export seçince çalışır. |

### Araçlar, sürüm ve kısayol

- `frontend/app.json`/`package.json`: beş sürüm alanı 18.7.3'e yükseltildi; bağımlılık değişmedi.
- `src/utils/quickActions.ts`: Android'deki eski yazıcı, native bitmap/action shortcut kümesinin üzerine yazmaz; iOS korunur. X02.
- `tools/checkdeps.js`: computed olmayan property adı closure capture sayılmaz; shorthand/computed gerçek referans korunur. `test-checkdeps-references.js` altı AST senaryosu içerir.
- `checkplayercore.js`, `check-v15214-hardening.js`, `check-v15220-flight-recorder.js`, `check-v15223-complete-corrective.js`, `check-v17008-conservative-checkpoint.js`, `check-v1720-streaming-scan-pipeline.js`, `check-v18400-local-source.js`, `check-v18600-release.js`, `test-v1730-functional.js`: bölünmüş restore helper, sıralı publish, yakalanmış record handle ve coordinator için yeni gerçek sözleşmeye uyumlu statik beklenti ve I/O fixture'ları. Kapsam kaldırılmadı; işlev testleri eklendi.
- `denetle.js`: bütün yeni JS/TS davranış testleri kontrol kapısına bağlıdır. JVM fixture cache gerektirdiğinden ayrı yerel komutla çalışır; CI geçişi sayılmaz.
- Bu MD, tespit MD, CLAUDE/context/sürüm devri her güncellemede gerçek dosya/bulgu/test/run/sınır kaydını taşır.

### Gerçek doğrulama kaydı

| Komut | Sonuç / kapsam |
|---|---|
| `node tools/test-mag-bulk-runtime.js` | 8 grup PASS; gerçek TS ve HTTP fixture. |
| `node tools/test-mag-bulk.js` | 7 model grubu PASS. |
| `node tools/test-backup-selection.js` | 7 grup PASS; gerçek merge helper. |
| `node tools/test-backup-restore.js` | 52 grup PASS; gerçek helper ile storage/native sınırları, process-kill kesitleri, false/0 snapshot ve hassas journal/incoming şemaları. |
| `node tools/test-player-regressions.js` | 13 grup PASS; gerçek TS/AST callback; decoder/alıcı çalıştırılmaz. |
| `node tools/test-library-runtime.js` | 8 grup PASS; gerçek provider ve taklit I/O; E12 null/yanlış iç kayıt, kaynak koruma ve geçerli reload dahil. |
| `node tools/test-profile-catalog-regressions.js` | 15 grup PASS; geciktirilmiş read/write/hash, restore, migration, sıfır sayı, bozuk kaynak ve strict reader fault; geç PIN sonucu/yükleme hazır olma kapısı. |
| `node tools/test-storage-strict-runtime.js` | 8 grup PASS; gerçek storage native/web gövdeleriyle yokluk/bozuk dış JSON/yanlış tip/platform I/O ve false/0 ayrımı. |
| `node tools/test-pin-entry-runtime.js` | 4 grup PASS; gerçek ekranın 4–10 hane politikası ve async oturum sahipliği. |
| `node tools/test-encrypted-backup-ui.js` | 6 grup PASS; gerçek UI/utility ile native/fs sınırı taklit edilir; cancel, geç sonuç, paylaşım ömrü/TTL, import cleanup ve Drive opt-out. |
| `node tools/test-checkdeps-references.js` | 6 AST senaryosu PASS. |
| `node tools/test-panel-scan-runtime.js --native` | Son legacy checkpoint değişikliklerinden sonra tekrar PASS / exit 0; gerçek Kotlin fonksiyon gövdeleri/HTTP/SQLite fixture. |
| `node tools/test-proxy-cancellation-runtime.js` | Gerçek Kotlin pool/registration ile yavaş HTTP/pre-cancel/heartbeat PASS. |
| `node tools/test-backup-security-runtime.js` | Gerçek WebCrypto/Node PBKDF ve native wrapper sözleşmeleri PASS. |
| `node tools/test-backup-security-runtime.js --native` | Doğrudan BackupCrypto.kt, 600k: 9 native grup ve iki yönlü PIN uyumu PASS; Unicode parola, kısa/uzun input, cancel, tamper. |
| TypeScript/denetle | Son kaynakla TypeScript exit 0; denetle 110 kapı PASS / exit 0. |
| Expo Android prebuild `--no-install` | Başarılı. |
| Üç native `compileReleaseKotlin` | BUILD SUCCESSFUL, 5m40s. |
| Yerel DEV APK + release Kotlin modülleri — önceki tur | Tam `assembleDebug` BUILD SUCCESSFUL, 6m17s; release APK değildir. Üç `compileReleaseKotlin` modül kontrolü ayrıca başarılı. |
| Yerel DEV APK + release Kotlin modülleri — son kaynak | Standalone DEV `assembleDebug` + üç modül `compileReleaseKotlin`: BUILD SUCCESSFUL, 2m22s. DEV APK cihazda `install -r` ile güncellendi. |
| Son DEV APK MPV paket kontrolü | Dört ABI ve native DEX paketleme PASS; donanım decoder davranışının cihaz kanıtı değildir. Final release APK manuel CI'da üretilecek. |
| OnePlus 7 Pro / GM1910 ADB kurulumu | `c3a4097e`: install-r Success; 18.7.3-dev / versionCode 180703 doğrulandı. PID 27529 canlı; PID logunda crash/JS error eşleşmesi 0. Görünür ekran kabulü telefon kilidi nedeniyle bekliyor. |

Windows JDK 17 Unix socket geçici yolu için `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Projeler\kizilkan-player-elite\frontend\android -Dfile.encoding=UTF-8` kullanıldı. JAVA_OPTS/Gradle property ayarı daemon başlangıcına yetişmedi. JDK 17.0.20, Android SDK `C:\Android\Sdk`. Signing değerlerini yazdırma.

### Final dağıtım kaydı

Henüz kaynak commit'i/push/manuel Actions run yapılmadı. Workflow `build-apk.yml`, workflow_dispatch: new_architecture=true/build_type=release/make_release=true. Bu dal push filtresinde değil; otomatik build eklenmedi. Final komutlar, commit, run/APK sonucu aşağıya gerçek değerlerle eklenecek.

ADB'de `c3a4097e` seri numaralı **OnePlus 7 Pro / GM1910** bağlıdır. Cihazdaki **18.7.2-dev**, kullanıcı verileri korunarak **18.7.3-dev / 180703** olarak güncellendi; uygulama kaldırılmadı/veri silinmedi. PID 27529 canlı ve ilgili PID logunda crash/JS error eşleşmesi 0. Telefon kilitli/dozing olduğu için görünür uygulama ekranı kabulü henüz tamamlanmadı. TV focus, 1000 MAC kaydırma, SAF provider, Cast receiver, canlı AES/HW decoder ve ilgili Android JSI/Room senaryoları için gerçek cihaz kanıtı henüz yok. Tarihî timeshift donması tamamen çözüldü iddiası yok.

Final bekleyen işler: cihaz kilidi açıldıktan sonra görünür DEV ekranı/açılış kabulü; commit/push; manuel release Actions run ve APK bağlantısı. Release CI paketi ve ürünün cihaz kabul senaryoları ayrı kaydedilecek. Bu alanlar root'un gerçek çıktılarıyla tamamlanacak; henüz yapılmayan CI/ekran kabulü başarılı diye işaretlenmedi.

### Opus sonraki her güncellemede

Yeni tarih/sürüm bölümü ekle: taban/dal/commit; her dosyanın fonksiyon/bölgesi; bulgu ID'si ve önce/sonra davranışı; gerçek komut/sonuç; çalıştırılmayan cihaz senaryosu; manuel run ve APK bağlantısı. Eski PASS yeni değişimin kanıtı değildir. Fixture sınırlarını belirt; kullanıcı verisini silme. Kullanıcı bu dosyayı Opus'a iletecek; başka sohbet/servise mesaj izni varsayma.
