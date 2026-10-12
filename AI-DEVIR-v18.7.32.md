# KIZILKAN PLAYER ELITE v18.7.32 RC1 — GPT / Opus devir dosyası

12 Ekim 2026. Dal: codex/v18.7.32-proxy-background. Taban: 940dffdc (v18.7.31 uygulama commit'i 8b7f42f4).
Kullanıcı; proxy ve arka plan paketini tek build olarak kodlamayı, kontrollerden sonra ayrı dala commit/push, MANUEL NORMAL release derlemesi ve PC'de bağımsız DEV APK istedi. Telefon bağlıysa veri silmeden DEV kurulumu da yetkili. Gerçek teslim kayıtları §8'e eklenir.

## 1. Kapsam ve korunmuş mimari

Proxy kaynak/seçim, protokol/kimlik doğrulama, iki aşamalı test, tarama penceresi/ilerlemesi, MAG kurtarma, kalıcı katalog/ilk kare kuyruğu ve bildirim değişti. Önceki DNS yöneticisi, hızlı MAG→Xtream katalog köprüsü, Room, PlayerHost, canlı önceliği, tek upstream, TXT/hesap arşivi ve kullanıcı verisi korunur. NPM paketi eklenmedi. Native modüle mevcut OkHttp 4.12.0 ve expo-video ile aynı Media3 1.8.0 bağımlılıkları eklendi.

429/Cloudflare/koruma cevabı proxy değiştirerek aşılmaz. Normal HTTP/SOCKS ve sağlayıcı kimliği desteklenir; CAPTCHA/Cloudflare atlatma eklenmedi. Runtime testleri localhost ve fixture hesaplarıyla yapılır; gerçek hesap/public proxy kullanılmadı.

## 2. Kanıt, çözüm ve etki

| Eski durum / kök neden | Yapılan değişiklik | Sonuç / sınır |
|---|---|---|
| SOCKS4 ve SOCKS5 aynı Java Proxy.Type.SOCKS yolundaydı. | ProxySocketFactory.java gerçek SOCKS4a ve SOCKS5 handshake; remote DNS, SOCKS5 IPv4/IPv6/auth. | Yanlış protokol nedeniyle kaçan adaylar doğru türle denenir. SOCKS4 parola desteklemez; açık hata. |
| Global Authenticator aynı host/port için yanlış kimlik seçebiliyordu; anahtar parolayı kapsamıyordu. | ProxyHttpConnection.kt isteğe özel 407/CONNECT; Entry parola dahil SHA-256 anahtarı. | Farklı gateway parolaları karışmaz. Proxy-Authorization hedefe aktarılmaz. |
| HTTPS proxy şeması/HTTPS hedef ayrımı eksikti. | Proxy'ye TLS ve gerekirse bunun içinde HTTPS CONNECT ayrı uygulanır. | HTTPS gateway desteklenir; sertifika/hostname kontrolü açık. JVM iki TLS katmanı PASS; fiziksel Android kabulü ayrı. |
| TCP açık port gerçek proxy sayılabiliyor; IP/yargıç/filtre hataları karışıyordu. | ProxyTestEngine: TCP → HTTP/HTTPS gerçek IP → anonimlik ayrı; auth/protokol/TLS/timeout/429/IP olmayan/içerik/filtre nedenleri. | Aday sayısı/çalışan proxy ayrılır. Kullanıcı neden sayımlarını görür; TCP tek başına havuza giremez. |
| Own-IP bilinmeyince elite; HTML/IP alt-string eşleşmesi yanlış sonuç verebiliyordu. | Bütün origin/IP doğrulanır, baseline bilinmiyorsa anonimlik unknown; header IP token eşleşmesi. | .1 ve .10 aynı sayılmaz; HTML reddedilir. Bilinmeyen elite/korumasız değildir. |
| Yargıç hatası çalışan proxy'yi öldürüyordu. | IP yankısından geçmiş aday korunur, anonimlik unknown; HTTP/HTTPS kanıtı ayrı. | Yargıç 503 proxy ölümü değildir. Elite/transparent filtreleri ayrı neden olarak sayılır. |
| Boş indirme/test eski havuzu silebiliyordu. | Boş aday uygulaması hata; sıfır doğrulama eski havuzu değiştirmez. | Önceki havuz korunur. Test etmeden kullan ayrı kullanıcı seçimi; eski havuz için çalışırlık garantisi yok. |
| Dolu proxy seçimi bağlantı sınırını aşabiliyordu. | Kesin proxy başına 4 istek, busy bekleme; unknown/target hatası proxy ölümü değildir. | Kontrollü yük. Target transport hatası olumlu panel kanıtı da değildir. |
| Rotasyon/ücretli gateway biçimleri eksikti; sırlar düz tercihteydi. | Sıralı/rastgele/gateway; URI, host:port:user:pass, IPv6, JSON, cURL metni. Manuel metin, custom kaynak/test URL ve beklenen metin AES-GCM. | Sağlayıcı gateway girilir. IP rotasyonunu sağlayıcı yapar; session/ülke tokenları değiştirilmez. cURL çalıştırılmaz. |
| Türler her kaynakta tek tek; ortak aday sahipliği yoktu. | Global Tümü/HTTP/S4/S5/Temizle, sonra bireysel düzenleme; sourceIds. | Desteklenen tür bütün sağlayıcılara uygulanır. Başka kaynakta da bulunan aday kaynak silinince korunur. |
| Sıralı/sınırsız gövde indirme ve kaynak hata belirsizliği. | 4 download worker, streaming 8 MiB byte cap, 200k aday cap, resmî mirror; ham/yeni/ms/error/mirror. | Gövde okunurken sınır; bellek büyümesi sınırlı. Kaynak hatası görünür; aday dedup. |
| Ekran proxy testini kaybediyor; eski işçi yeni state'e yazabiliyordu. | Native FGS + run başına engine/state/connections/workers; 5 sn checkpoint, wake lock, restore/resume. | Ekran kapalıyken test sürer. Process öldüğünde kalan işler elle devam; eski run yeni sayacı bozmaz. |
| İlk tur %100 ama retry sürüyor; stop takılıyor; tekli/çoklu pencereler çakışıyor. | Pencere sahipliği, retry etiketi (streaming dahil), terminal stop temizliği, 30 sn snapshot bütçesi ve run'a iptal. | İlk tur sonu bütün iş bitmiş sayılmaz. Kısmi hit varsa da terminal hata saklanmaz; hitler önce UI'ye alınır. |
| MAG proxy tercihi globalden kopuk; sıra gelmemiş ilk-tur işleri kayboluyordu. | Global restore/save, pool preflight, FGS başarısızsa başlamama, 2 sn heartbeat; tüm işler 128'lik partilerle ağ öncesi journal. | Bitmemiş ilk tur ve belirsiz retry kurtarılır. Seçimde elenen işler temizlenir; koruma retry değildir. DB sonucu yazılmadan iş tamamlanmaz. |
| Katalog testinde process/ekran sonrası kalanlar kayıp. | Durable queue profil/type/run sahibi, şifreli jobs/results, pre-network checkpoint, bounded workers, abort/fatal sonrası tüm işçileri join. | Kalan işler devam. Katalog testinde scanProxy tercihine uyulur; proxy ON iken gizli direct fallback yok. |
| Arka planda görünmeyen VideoView yanlış görüntü yok sonucu veriyordu. | Foreground VideoView korunur; background detached Surface + Media3 onRenderedFirstFrame. Seri, tek upstream, her kanıt ilerlemeden arşiv/journal. | Ready/katalog ilk kare değildir. Unmeasurable/cancelled geçersiz hesap olmaz, kalanlarda tutulur. Native stream 401/403/429 retry ve sonraki örneği durdurur. Cihaz kabulü ayrı. |
| Bitiş bildirimi/sonuç ekranı yanlış ya da yok. | JobNotices, terminal bildirim ve allowlist runId deep link; profil sahibi archiveInfo. | Bildirim ilgili arşive gider; hesap/parola içermez. Android13+ izin şart; mevcut açılış izin akışı korunur. |

## 3. 57k → 4–5k → 0–2 nedenleri

Aynı kullanıcı çalışmasına ait detaylı cihaz logu bu turda yok; kesin tek neden iddia edilmiyor. Koddan kanıtlanan eski sorunlar: SOCKS türü karışması, global/parola hariç auth, IP/yargıç/filtre karışması ve yüksek doğrulama yükü. Yeni neden sayaçları bunları ayrıştırır. TCP portu açık ama gerçek proxy olmayabilir; yanlış protokol/auth, target/HTTPS reddi veya anlık ölüm mümkündür.

11 Ekim 18:32 UTC kaynak gözleminde 28 dolu 200, beş 404, iki 502 ve bir 429 vardı. Hookzof tek listesi 51.567 aday verdi; kullanıcının 57k sayısının kesin kaynağı olduğu kanıtlanmadı. Yeni listeler uygulama parser'ında aday verdi; kaynak erişimi proxy kalitesi/anonimliği/portal hesabı kanıtı değildir. Runtime fixture'ları bu public adaylara trafik göndermedi.

## 4. Kaynak, biçim ve gateway kullanımı

Katalog 19 → 23 sağlayıcı: Almroot HTTP, Saisuiu HTTP, VannDev HTTP/SOCKS4, VMHeaven SOCKS4. Güncellik garantisi yok: fresh:false. Mevcut kaynaklar açık kullanıcı seçimiyle korunur; ProxyScrape kendi resmî GitHub HTTP/S4/S5 mirrors. Varsayılan türler kendiliğinden açılmaz.

Biçimler: http(s)://user:pass@gateway.example:8000, socks5://user:pass@gateway.example:1080, gateway.example:8000:user:pass, [2001:db8::1]:1080:user:pass, JSON array/results/provider alanları ve cURL -x/-U metni. URI'de özel karakterler percent-encoding ile korunabilir. IPv6 brackets, port ve scheme doğrulanır. Bilinmeyen şema reddedilir.

Gateway modu aynı girişi korur; bağlantılar idle pool'da tutulmaz. IP'nin per-request değişmesi veya session stickiness sağlayıcıya aittir. Token/ülke/session metni yeniden yazılmaz; bütün sağlayıcılar için rotasyon garantisi verilmez.

## 5. Dosya bazında Opus izleme

| Dosya/grup | İşlev |
|---|---|
| frontend/src/utils/scanProxyParse.ts | Scheme/port/IPv6/URI/JSON/cURL/auth, parola dahil dedup, sourceIds, mask. |
| frontend/src/utils/scanProxy.ts, frontend/app/scan-proxy.tsx | 23 kaynak, seçim, streaming/mirror/status, encrypted migration, rotation, restore/test UI/errors. |
| panelscan/ProxySocketFactory.java, ProxyHttpConnection.kt | Gerçek SOCKS ve isteğe özel HTTP auth/TLS; cancellable bounded connection adaptörü. |
| panelscan/ScanProxyPool.kt | Pool/health/cap/source ownership, AtomicFile AES-GCM, fail-closed restore, journals. Eski motor ayrı engine'e taşındı; test seçenekleri kaldırılmadı. |
| panelscan/ProxyTestEngine.kt, ProxyTestService.kt | TCP/IP/anonimlik/HTTP+HTTPS/nedenler, UUID isolation, BitSet resume, FGS/wake/timeout. |
| panelscan/FrameProbe.kt, JobNotices.kt | Background render/401-403-429 retreat, allowlist bildirim ve run route. |
| panelscan/PanelScanModule.kt, frontend/modules/panel-scan/index.ts | Restore/config/work/frame/cancel/archiveInfo ve typed bridge. |
| panelscan/PanelScanService.kt, ScanJournalStore.kt | Busy wait/transport/fault, terminal timeout/notification/archive owner. |
| frontend/app/add-playlist.tsx | Modal/terminal/retry/deadline, exact archive route, catalog/frame durable queue. |
| frontend/app/mag-bulk.tsx, frontend/src/utils/magBulkScan.ts | Global proxy, FGS heartbeat/preseed/scope/recovery/archive. |
| frontend/src/utils/durableTestQueue.ts | Profile jobs/results, checkpoints/workers/abort/fatal cleanup/notification. |
| frontend/src/components/AccountPlaybackTestQueue.tsx, EndpointPlaybackTest.tsx | Seri renderer, archive kanıtı/checkpoint, FG/native handoff, upstream/lease close. |
| frontend/src/utils/iptv.ts | Katalog scan button opt-in proxy; normal player/content refresh varsayılan yolu korunur. |
| frontend/modules/panel-scan/android/build.gradle, AndroidManifest.xml | OkHttp/Media3 mevcut sürümler, ProxyTestService/dataSync/WAKE_LOCK. |
| frontend/app.json, frontend/package.json | Beş alan 18.7.32/180732/RC1. |
| tools/test-scan-proxy.js, test-v18732-background.js, test-proxy-socket-runtime.js | Parser/source/queue/secret migration/gerçek SOCKS; son iki gate master'da. |
| tools/test-proxy-http-runtime.js, test-proxy-engine-runtime.js | PC Gradle-cache sonrası production Kotlin HTTP/TLS/engine fixture. CI Gradle öncesi cache olmadığı için master'a eklenmedi. |
| tools/check-v18500-release.js, check-v18724-release.js, check-v18725-release.js, test-proxy-cancellation-runtime.js, test-mag-bulk-runtime.js | Eski gate yeni engine/queue/third proxy arg/preseed ile uyarlanır; davranış beklentisi kaldırılmaz. |

panelscan/ yukarıda: frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/.

## 6. Kontrol kanıtı ve yakalanan hatalar

- Parser 28 grup PASS.
- Üretim Java SOCKS localhost PASS: 4a/IPv4, 5 domain/IPv4/IPv6/auth, auth izolasyonu/reject, target reject, timeout.
- Üretim Kotlin/OkHttp localhost HTTP/TLS PASS: 407/yanlış ve farklı parola aynı gateway/iptal/remote DNS, TLS proxy içinde TLS CONNECT, proxy auth hedefe gitmemesi, hostname sertifika reddi.
- Üretim Kotlin engine fixture PASS: IP/HTML/auth/429/anonimlik/unknown baseline, verify limit≤16, pause/process restore/completed bitset no-repeat. Journal ENCRYPTION INTERFACE stub'dır; gerçek Android Keystore donanım testi değildir.
- Gerçek TS source/queue fixture PASS: 4 download worker/mirror/shared source/oversize/empty/encrypted migration; pre-network save, cancel/restart/profile/FG timeout/fatal worker join/per-frame checkpoint.
- Üretim Kotlin cancel fixture PASS: localhost cancel/pre-cancel, UTF-8 bytes/body limit/proxy fault ayrımı.
- MAG scope/protection/cancel runtime PASS.
- Ek fiziksel Android12/API31 TLS fixture denemesi üretim socket koduyla hazırlandı; bağımsız `app_process` **Killed/137** oldu. Ayrı `app_process --help` de dalvik-cache ownership **Permission denied** verdi. Test uygulama içindeki TLS sonucunu kanıtlayamadı; PASS/FAIL-proxy diye etiketlenmez. Sistem trust store'u değiştirilmedi; root kullanılmadı; geçici cihaz dex/PKCS12 silindi, kaynak/log yalnız git dışı yerel inceleme klasöründe korundu. Bu fixture kurulmuş DEV uygulamasının crash'i değildir.
- Master 144 gate = 142 eski + iki yeni runtime. Son teslim sonuçları §8.
- İlk Kotlin compile'da ProxyTestService.poll recursive type inference: açık Runnable declaration ile düzeltildi; son compile geçti.
- İlk packageDebug genel hata; stacktrace tekrarında BUILD SUCCESSFUL (4m16s). İlk log somut exception nedeni içermedi; dosya kilidi/disk gibi kök neden uydurulmuyor. Son teslim build/ZIP/native/signature kontrolleri tekrar alınır.
- Sandbox full master'da localhost Java Permission denied:getsockopt ve Git Bash erişim hatası görüldü. Testler atlanmadı; aynı full master normal PC yetkileriyle tekrar çalıştırıldı.
- Archive terminal state düzeltmesinde TypeScript enum/string uyumsuzluğu yakalandı; açık literal daraltma sonrası tsc PASS (25,68s). Son native stream retreat eki de teslim Kotlin/Java/APK derlemesinden ve son tsc'den geçti (§8).

## 7. Dürüst çalışma sınırı ve cihaz kabulü

Native proxy kendi FGS'inde. MAG/katalog JS mevcut native keep-alive+wake ile; bütün mantık Kotlin'e taşınmadı. Ekranı kapatmak ile force-stop/reboot/pil bitmesi aynı değildir. OEM/Android süreci öldürmesini kesintisiz çalışır diye garanti etmiyoruz. Checkpoint'e kadar tamamlananlar korunur, kalanı kullanıcı devam ettirir. Proxy 5sn, katalog 2sn checkpoint; frame hesabı ilerlemeden kaydolur. Ani güç kesintisinde yarım iş tekrar edilebilir. AtomicFile depolama dolmasını engellemez; kayıt hatası açık olur.

Android15 dataSync timeout ve Doze/üretici pil sınırı geçerli. Genel FGS timeout queue abort+recovery, proxy terminal kaydı/bildirim yapar. Android13+ bildirim izni gerekir; açılış izin akışı mevcut.

Proxy katalog JSON mevcut native 1MiB sınırındadır; BODY_LIMIT belirsiz sonucu, hesap ölü/görüntü yok değildir. Normal tam refresh bu limit altında yeniden tasarlanmadı. Foreground ExpoVideo korunur; native detached Surface fiziksel telefon/TV/codec/screen-off kabulüne ihtiyaç duyar. PC compile bütün cihazlarda kare kanıtı değildir.

Cihaz kabul sırası:
1. Kendi HTTP/HTTPS/S4/S5 bilgileri, özel karakterli parola/JSON; global tür sonra bireysel düzenleme, kaydet/process restart.
2. Büyük proxy test: TCP/verify/reasons/unknown baseline, pause/background/restore/resume, zero-result old-pool koruma.
3. Proxy busy/empty/exhausted/429/CF: direct sızıntı veya koruma aşma olmamalı.
4. Single→bulk→Zorla çık→geri dönüş; retry etiketi, terminalde stop temiz, error+partial-hit koruma.
5. MAG ilk tur process/power interruption → aynı profil yalnız kalanlar; diğer profil görünmemeli.
6. Katalog background/cancel/restart/continue; katalog ilk kare diye etiketlenmemeli.
7. Seri frame foreground→background→foreground/cancel, tek upstream; normal player çakışması, 401/403/429 retreat, HLS/DASH/HEVC/TV.
8. Eski farklı bildirimler doğru run arşivine; profile owner kontrolü.
9. Room Film/Dizi, Xtream köprü/saf-Stalker fallback, DNS seçim, player/pause/timeshift regresyon kabulü.

## 8. Teslim — doğrulanmış PC kaydı

- Son `yarn tsc --noEmit`: **PASS, 26,59 sn**. Tam master: **144/144 PASS**, exit 0. `git diff --check` PASS.
- Son kaynaklarla yerel `:app:assembleDebug`: **BUILD SUCCESSFUL, 2 dk 54 sn, 475 task**. Başarılı önceki tekrarlar 4 dk 16 sn ve 3 dk 38 sn; teslim dosyası son koşudan kopyalandı.
- Dosya: `C:\Projeler\kizilkan-player-elite\artifacts\KIZILKAN-18.7.32-RC1-DEV.apk`, **487.318.158 byte** (yaklaşık 464,74 MiB).
- SHA-256: **f02e392b431885db872cff40d04a59c878dde2b496264a3313e784e48347070b**.
- Paket/versionCode/versionName: **com.gpt.kizilkan.player.dev / 180732 / 18.7.32-dev**; etiket **KIZILKAN DEV**. Bağımsız JS bundle **4.886.044 byte**; yeni FrameProbe DEX içinde.
- `apksigner verify`: **PASS**, v2 imza. Final APK MPV/native/DEX/C++ gate: **PASS**, arm64-v8a/armeabi-v7a/x86_64/x86; bütün dört ABI'da gereken __ndk1/from_chars sembolleri karşılanıyor. Yalnız AAR/cache bulunmasına dayanılmadı.
- İlk ADB listeleri boştu; sonra telefon **c3a4097e** bağlandı. `adb install -r -g` **Success**; **180731/18.7.31-dev → 180732/18.7.32-dev**, uygulama/veri silinmedi. Cihaz base.apk SHA'sı PC ile **birebir aynı**.
- DEV proxy ekranı deep link ile cold açıldı: **Status ok**, MainActivity, TotalTime **4487 ms**, çalışan PID **27233**. Açılış crash-buffer'da uygulama fatal kaydı yok; seçilen logdaki FeatureFlagsImplExport class lookup uyarısı W seviyesinde, uygulama fatal crash'i değil. Bu kısa açılış kontrolü §7'deki gerçek frame/codec/screen-off/hesap testlerinin yerine geçmez.
- Uygulama commit'i **0443c8c21175f1bdb16b7fa0fdbcd2a2f9ef085d**, ayrı dala push **başarılı**. 41 kaynak/test/rapor dosyası; hesap arşivi/ham cihaz logu/decompile kaynak/APK commit edilmedi.
- Manuel **NORMAL release**, new_architecture=true, make_release=true: [build155 / run38219027770](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/38219027770), **completed / success**. Job 07:40:12–08:02:03 UTC (**21 dk 51 sn**). Run headSha tam olarak uygulama commit'i. GitHub master/tsc/prebuild/manifest/signing/disk, release compile, final APK MPV/native, paket/sürüm/imza ve Release yayınlama kontrolleri **PASS**.
- [NORMAL APK doğrudan indir](https://github.com/mkizilkan/kizilkan-player-elite/releases/download/build-155/KIZILKAN-PLAYER-ELITE-v18.7.32-build155.apk): **KIZILKAN-PLAYER-ELITE-v18.7.32-build155.apk**, **385.487.395 byte**. GitHub asset **633098483 / uploaded**, download endpoint **HTTP200 / application/vnd.android.package-archive**. GitHub tarafından hesaplanan SHA-256 **57cdb9008be1c4eb2446a0e4ee2f1ec47c3e7ad25ce3c1b35004d02afcf94f8e**.
- [Release sayfası](https://github.com/mkizilkan/kizilkan-player-elite/releases/tag/build-155): normal APK ve **APK-BOYUT-RAPORU-v18.7.32.txt** mevcut. Release target_commitish uygulama commit'iyle aynı. DEV GitHub'a normal diye yüklenmedi. Release yayınlandığı için kota kullanan Actions artifact adımı tasarım gereği skipped; bu APK kaybı/derleme hatası değildir.
- Repo public doğrulandı; görünürlük değiştirilmedi. Son teslim raporu için yalnız MD güncellemesi ayrı commit olabilir; APK'nın derlendiği uygulama commit'i değişmez.

PC komutu (depo kökünden):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-dev.ps1
# Tek yetkili telefon bağlıysa yanına, veri silmeden:
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-dev.ps1 -Install
```

DEV ayrı com.gpt.kizilkan.player.dev; normal uygulama verisini taşımaz/silmez. Bu teslimde telefon sonradan bağlandı ve DEV güncelleme başarıyla kuruldu. Normal APK yalnız GitHub'da yayımlandı; telefona normal paket kurulmadı.

## 9. Birincil araştırma kaynakları

- [Java Proxy.Type](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/net/Proxy.Type.html): generic SOCKS sürüm garantisi değildir.
- [RFC1928](https://www.rfc-editor.org/info/rfc1928/) ve [RFC1929](https://www.rfc-editor.org/info/rfc1929/): SOCKS5 adres/auth.
- [RFC9110](https://www.rfc-editor.org/rfc/rfc9110.html): CONNECT/407/proxy auth.
- [OkHttp](https://github.com/square/okhttp/blob/master/README.md), [Conscrypt Platform](https://github.com/google/conscrypt/blob/master/android/src/main/java/org/conscrypt/Platform.java): TLS socket katmanı; Android kabulü JVM testine eşit değildir.
- [Media3 Listener](https://developer.android.com/reference/androidx/media3/common/Player.Listener), [SurfaceTexture](https://developer.android.com/reference/android/graphics/SurfaceTexture), [HTTP exception](https://developer.android.com/reference/androidx/media3/datasource/HttpDataSource.InvalidResponseCodeException): gerçek render ve status retreat.
- [FGS timeout](https://developer.android.com/develop/background-work/services/fgs/timeout), [Doze](https://developer.android.com/training/monitoring-device-state/doze-standby): Android arka plan sınırları.
- [ProxyScrape](https://github.com/ProxyScrape/free-proxy-list): resmî mirrors.
- [Oxylabs](https://developers.oxylabs.io/help-center/getting-started/start-using-residential-proxies), [Webshare](https://apidocs.webshare.io/), [Bright Data](https://docs.brightdata.com/api-reference/proxy/configuring_dns_resolution): giriş/dns/session biçimleri. Parser desteği sağlayıcı rotasyon garantisi değildir.
