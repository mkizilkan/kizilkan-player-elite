# GPT → Opus devir notu — v18.7.30 RC1

Tarih: 11.10.2026. Dal: `codex/v18.7.30-rc1-scan-dns-reliability`.
Başlangıç commit'i: `69ed0c1c19394fb05f9f9fc31c46efd9570cf712` (v18.7.29 tabanı).
Kullanıcı 10 maddelik tarama sağlamlaştırma ve panel DNS sağlık/seçim/yenileme paketini, commit/push ve **manuel normal release** build'i onayladı. Bir sürümde birlikte teslim edilir. DEV ayrı paket olarak yerelde derlenir.

## 1. Kullanıcıya yansıyan değişiklikler

| Madde | Önceki sorun / kök | Yapılan | Sonuç ve sınır |
|---|---|---|---|
| 1. Xtream hata ayrımı | Bozuk JSON, timeout, rate limit ve auth reddi aynı null sonucuna düşüyordu. | `scanOutcome.ts`, `serverCode.ts`, native `ScanProbeOutcome` valid/rejected/temporary/protected/cancelled ayrımı. | Yalnız açık pozitif auth hesap doğrular. HTTP 200 ve HTML doğrulama değildir. 401/403 HTTP reddi tek başına yanlış parola kanıtı değildir. |
| 2. İkinci tur | Geçici sorunlarda otomatik yeniden deneme eksikti. | Android ilk turdan sonra en çok iki ek deneme; MAC bir sınırlı ikinci tur. Geçici işler AES-GCM journal kuyruğunda. | Timeout/503/bozuk yanıt kaybolmaz; belirsiz kalabilir. Sonsuz tekrar yok. Açık hesap reddi/CAPTCHA/WAF/challenge ikinci tura alınmaz. 429 istek sınırı geçici sayılır; aynı Retry-After gate üzerinden sınırlı ikinci turda denenir. |
| 3. MAC yöntem öğrenme | Her hesap için aynı katalog yöntem sırası. | `magCatalogMethod.ts`: gerçekten örnek döndüren itv/vod/series/all yöntemini endpoint bazında öğrenir, 24 saat TTL, en çok 512 kayıt. | Sonraki doğrulamalar öğrenilen yöntemle başlar; başarısızsa diğer yöntemlere döner. Öğrenilmiş yöntem başarı kanıtı değildir. |
| 4. Keşif bütçesi | Bütçe bitmesi portalın kesin yokluğu gibi algılanabiliyordu; ikinci bütçe yoktu. | Belirsiz MAC işinde yeni sınırlı ikinci bütçe. Önceden seçilmiş endpoint ikinci turda kilitlenir. | Seçilmiş API tekrar port/yol keşfine açılmaz. Bulunamayan portal kullanıcı kapsamı içinde yeniden araştırılabilir. |
| 5. Büyük yanıt | Opsiyonel büyük endpoint yanıtı bütün doğrulamayı durdurabiliyordu. | Önce küçük ordered-list sayfaları; get_all_channels için en çok 128 tam JSON öğesi ve 1 MiB sınırı; büyük opsiyonel yanıt diğer yöntemleri engellemez. | Tam katalog indirme sınırı değiştirilmedi. Streaming okuyucu bulunan doğrudan yanıtta erken örnekleme yapılır. Native proxy hâlâ 1 MiB tam yanıt sınırında kalır. |
| 6. Adaptif tempo | Sabit MAC temposu / sabit native paralellik. | MAC rate limit sonrası 650 ms alt sınırından yavaşlar; native panel başına kapasite 4→2→1, başarı serisinde kademeli geri dönüş. Retry-After ortak bekleme. | Hızlandırma sunucunun limitini aşmayı amaçlamaz. Ban bağışıklığı garantisi yok. |
| 7. Görüntü kanıtı | Katalog/kimlik doğrulama görüntüyle karışabiliyordu; tek örnek kanal. | `EndpointPlaybackTest`: üç ardışık kanal, toplam 45 sn; gerçek ilk kare; adres bazında kanıt. | İlk kanal bozuksa diğer örnek denenir. Üç kanaldan görüntü gelmemesi hesap reddi sayılmaz. Xtream katalog örneği tek alınır; MAG örnekleri yöntem hafızasını kullanır. |
| 8. Bağlantı çakışması | Test ve oynatma aynı anda medya bağlantısı açabilirdi. | Mevcut tek medya lease'i kullanılır. Test sonucu verilmeden önce pause + await replaceAsync(null), sonra lease bırakılır; stale kanal callback kontrolü. | Açık player varsa test başlamaz; player açılırsa test kesilir. API katalog/auth çağrıları medya slotu sayılmaz. |
| 9. DNS kanıt kalıcılığı | Alternatif adresler/proof güncellemeleri arşivden kopabiliyordu. | Başarılı adres Room playlist metadata/endpoints ve TXT kanıtına taşınır; gerçek ilk kare native arşive de yazılır. Tek primary işareti. | Gözlenmemiş adresler ilk kare var diye etiketlenmez. Eski sürümde validatedHosts'a yanlış eklenmiş adresler tekrar çalışır kabul edilmez. |
| 10. Hafif ilk tur | Tam katalog/görüntü testi ağır taramayla iç içe olabiliyordu. | İlk tur auth/sınırlı erişim örneği; otomatik tam katalog/görüntü yok. Native checkpoint ve kalıcı retry ayrıdır. | Kullanıcı daha sonra katalog/ilk kare testini veya playlist eklemeyi seçer. Mevcut canlı-önce katalog politikası korunur. |
| Panel DNS ekranı | Hesap DNS yöneticisi vardı; panel seçiminde DNS sağlık/alt küme yoktu. | Ortak `PanelDnsPicker`: tüm/seçili DNS, kimlik bilgisi olmadan HEAD yanıt süresi, ms, HTTP/koruma notu, sıralama. Xtream rehber + MAG panel kapsamına bağlı. | HTTP yanıt süresi TCP/ICMP ping veya ilk kare süresi değildir. Sağlam abonelik yalnız sonraki API/medya testiyle belirlenir. |
| Güncellemede DNS değişimi | Yalnız saklı yedek liste; rehber tazeleme ve kullanıcı kapsamı tam değildi. | Bağlı aynı panelin güncel kaynaklarından aday; MAG aynı portal path'ini ve açık portu korur, gerçek API örneğiyle doğrular. Xtream pozitif auth. | Korumaya/rate limite/hesap reddine karşı adres değiştirmeye devam edilmez. Kullanıcı rehber alternatiflerini kapatırsa eski yedekler de kapsamı aşamaz. |
| Yeniden başlatma | Belirsiz işler UI'da tekrar hazırlanamazdı. | Her iki ekleme ekranında “Kayıtlı belirsiz … denemelerini getir”. Native queue profile bağlı ve şifreli. | Düğme hazırlık yapar; yeni tarama kullanıcı Başlat'a basınca olur. MAC özgün kapsamı/seçilmiş endpoint'i korur. Xtream yalnız kaydedilmiş hesap/DNS çiftlerini hazırlar. |

## 2. Dosya bazında uygulama ayrıntıları

### Native Android taraması / journal

- `frontend/modules/panel-scan/android/.../ScanWorkCoordinator.kt`: üç durumlu auth parser korunur; `ScanProbeOutcome` ayrıntıları ve `AdaptiveScanHostGate` eklenir. Rate limit sinyali kapasiteyi azaltır; iptal kuyruk bekleyişini bitirir.
- `PanelScanService.kt`: aynı rehber paneli alias'ları ortak gate/backoff/koruma grubuna girer. İlk turun ardından `drainDeferredProbes()` kalıcı kuyruğu işler. Deneme sayısı **istekten önce** yazılır; process ölümünde sınırsız tekrar oluşmaz. Pozitif/açık negatif probe cache kullanılır; geçici hata negatif cache'e girmez. Retry success normal kalıcı sonuç yolundan teslim edilir. Snapshot ikinci tur bitmeden terminal yapılmaz. JSON yanıt sınırı UTF-8 byte bazında 1 MiB.
- `ScanJournalStore.kt`: DB sürümü 4→5; yalnız `CREATE TABLE/INDEX IF NOT EXISTS scan_retry`, eski tablolar silinmez. Retry payload AES-GCM ile şifreli, dueAt/attempt/state/key metadata. Sayfalı okuma byte sınırı; bozuk/çok büyük tek kayıt sessiz atlanmaz. MAG sonucu ikinci turda aynı stable key ile yenilenir; duplicate kart oluşmaz. Retry-only son arşiv de bulunabilir.
- `PanelScanModule.kt` ve `modules/panel-scan/index.ts`: profil sahibi kontrolüyle `writeArchiveRetry/getArchiveRetries`; mevcut evidence arşiv API'si kullanılır. Sahibi farklı kuyruk UI'a verilmez.
- Tarama sonuçları kalıcı journal'dadır; public TXT başarısızlığı hesapların sessiz silinmesine dönüştürülmez. Bu sürüm `ScanSafetyBackup.kt` algoritmasını yeniden yazmaz; v18.7.29 dayanıklı yazma hattını kullanır.

### MAC keşif/doğrulama

- `magBulkScan.ts`: keşif önce host başına, sonra seçili endpoint üzerinden hesap doğrulama. İkinci turda aynı seçili endpoint kilitli; paylaşılan host gate **yenilenmez**, koruma gözlemi kaybolmaz. Bilinen ve henüz keşfedilemeyen endpoint'ler ayrıdır. Restored scope grupları ayrı yürütülür. Aynı hostRaw/MAC sonucu upsert edilir.
- `magPortalDiscovery.ts`: gözlem shared gate'e aktarılır; başka alias'ta korunma görüldüğünde sonraki ağ çağrıları durur. HTTP 200'ün portal kanıtı olmadığı önceki ayrım korunur.
- `stalker.ts`: bounded transport yalnız örnek doğrulamaya uygulanır. Opsiyonel büyük hesap bilgisi/catalog yanıtında küçük diğer yöntemler denenebilir. Ordered-list gerçek PAGE_ERROR partial başarı sayılmaz; mevcut duplicate-page normal bitiş davranışı değiştirilmedi. Full catalogue ve Xtream backend ID eşleştirme mimarisi değiştirilmedi.
- `boundedPortalSample.ts`: yalnız Stalker js/js.data envelope'ündeki tamamlanmış JSON öğeleri örneklenir; HTML/rastgele data/error objesi örnek kataloğa dönüştürülmez. Reader cancel/release; TextDecoder olmayan JS ortamında parçalı UTF-8 desteği.
- `magCatalogMethod.ts`: storage tek hydration promise ve seri write zinciri; endpoint-only öğrenme kaydı; kullanıcı şifre/MAC/token içermez.

### DNS, UI, Room ve TXT

- `panelDirectoryModel.ts`: `PanelTarget.dnsSelections` aynı panelin yalnız seçili DNS'lerini, seçilmiş sırayı koruyarak geçirir. Kaynak provenance saklanır; boş seçilmiş panel analize katılmaz.
- `PanelScopePicker.tsx` / `PanelDnsPicker.tsx`: ortak DNS modalı, tüm/seçili, iptal/temizleme, bounded scroll, altı saniyelik HEAD ve en çok üç eşzamanlı istek. Koruma/rate sinyali kalan yeni ölçümleri durdurur.
- `serverCode.ts`: ayrıntılı `probeXtreamHostOutcome`, auth için açık pozitif değer şartı, CF header/HTML ayrımı, iptal edilen proxy transport, shared Retry-After ve header case-normalizasyonu. JS fallback de koruma gözlendiğinde o panelin kalan DNS'lerine yeni istek başlatmaz. Null sonucu kalıcı negatif gibi kullanılmaz. `resolveServerCode` yalnız gerçekten doğrulanan server'ı validated listesine koyar; rehber adaylarının tümüne doğrulandı demez.
- `panelDnsFailover.ts`: yeni credential hedefi yalnız bağlı panelin kaynaklarıdır; strict selection halinde rehber genişletilmez. MAG mevcut API path'i korunur. Directory explicit `:80/:443`, normal URL portu boşlaştırsa bile eski `:8080` ile değiştirilmez.
- `refreshPlaylist.ts`: taze panel rehberi ve stored backup desteği; terminal auth/protection/rate/cancel'de failover kesilir. MAG adayda sadece handshake değil katalog erişim doğrulaması da şart. Başarılı eski primary yedek olarak korunur. Katalog başarısızsa playlist commit edilmez.
- `PlaylistContext.tsx`: `DNS_AUTO_SWAP` olayı playlist değişikliği başarıyla commit edildikten sonra yazılır; candidate doğrulaması ayrı olaydır. Room kataloglarını JS metadata'ya kopyalamaz.
- `edit-playlist.tsx`: aynı panel rehberindeki seçilmemiş alternatifleri otomatik doğrulama tercihi hem MAG hem Xtream için Açık/Kapalı.
- `add-playlist.tsx` / `mag-bulk.tsx`: sonuç kanıtı UI+journal+playlist endpoint'e; snapshot'tan dönen run ID evidence için saklanır; imported TXT'ye sahte auth timestamp eklenmez. Arşiv evidence API'sinin false dönüşü kullanıcıya başarısız yazma olarak görünür. Profile değişiminde playback/restore state bırakılmaz. Force-exit native pause/snapshot hatasında bile yönlendirmeyi engellemez.
- `playlistEndpoints.ts`: yeni primary geldiğinde önceki aynı tür primary false olur; eski endpoint'in kendi first-frame bilgisi korunur, yeni adrese taşınmaz.

### Gerçek ilk kare testi

- `EndpointPlaybackTest.tsx`: bir player, tek lease, en çok üç ardışık örnek, kanal başına 12 sn bekleme ve tüm işlem için 45 sn. Xtream sample bir kez; MAC bounded sample.
- Sonuç `replaceAsync(null)` tamamlandıktan sonra gönderilir; callback önce lease bırakılır. `onFirstFrameRender` callback'i beklenen kanal indeksine bağlıdır. Error/cancel/unmount bağlantıyı kapatır. Katalog var → ilk kare var çıkarımı yapılmaz.
- Ana canlı player motorlarının buffer/timeshift/engine-switch ayarları bu sürümde değiştirilmedi. Bu paket ana player'ın ilk görüntü süresinin her sunucuda azaldığını iddia etmez.

## 3. Testler ve eski testlerin uyarlanması

Yeni `tools/test-v18730-reliability.js`, gerçek TS modüllerini transpile edip sahte HTTP/depolama sınırlarında çalıştırır. Canlı üçüncü taraf hesabı veya credential arşivi kullanılmaz. Auth sınıflandırması, HTTP200+HTML, CF başlığı, UTF-8 sınırı/128 örnek/cancel, queue capacity/cancel/deadline extension, DNS subset/sıra/provenance/path/default port, kanıtın yalnız kendi adresinde kalması ve learned-method tek hydration/kalıcılığı sınanır. `denetle.js` içine alınmıştır.

`tools/test-panel-scan-runtime.js --native`: gerçek Kotlin coordinator ve service fonksiyonları fixture'a eklenir; Android storage/network/UI sınırları substituted. Adaptive capacity/cancel testi eklendi. Bu test gerçek cihaz/Room migration entegrasyonunun yerine geçmez.

Eski fixture'lar yeni saf helper'ları gerçek kaynaktan yükler (`_mag_pure.js`). Gerçek HTTP response metadata mock'ları eklendi. İkinci tur yüzünden beklenen fallback sayısı iki sınırlı tur olarak güncellendi. 1 MiB cap ve aynı turun shared bütçesi hâlâ sınanır. `check-v18724` etiketi “Katalog örneği”ne uyarlanır: sampledItems bütün kanal sayısı değildir. `check-v1711` sabit Semaphore yerine gerçek Adaptive gate kapasitesini doğrular. Test başarı şartları kaldırılmadı.

### Komutlar

```powershell
cd C:\Projeler\kizilkan-player-elite\frontend
yarn tsc --noEmit
node ..\tools\denetle.js
```

Native offline fixture için JDK17 PATH ve Gradle Kotlin cache'i gerekir:

```powershell
cd C:\Projeler\kizilkan-player-elite
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
node tools/test-panel-scan-runtime.js --native
```

## 4. PC DEV komutu, release üretimi

```powershell
cd C:\Projeler\kizilkan-player-elite
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-dev.ps1 -Install
```

`-Install` olmadan yalnız derler. Birden çok telefonda `-DeviceSerial SERI_NO` eklenir. Kontroller önceden tamamlanmışsa `-SkipChecks` kullanılabilir. Script var olan debug variant plugin'ini kullanır: `com.gpt.kizilkan.player.dev`, DEV adı ve bundled JS. Normal uygulama kaldırılmaz; `adb install -r -g` sadece DEV APK için kullanılır. APK `artifacts/KIZILKAN-18.7.30-RC1-DEV.apk` içine kopyalanır, Git'e eklenmez. Telefon yoksa dosya PC'de kalır.

Windows JDK17u20 loopback pipe hatasının doğrulanmış çözümü: yalnız bu process için kısa ASCII `.jdk-sockets` Unix-domain temp yolu. Global JDK/firewall ayarı değiştirilmedi. Gradle/SDK için yerel cache yazma yetkisi gerekir. Script process JAVA_HOME/JAVA_TOOL_OPTIONS değerlerini finally içinde geri getirir.

Release workflow komutu:

```powershell
gh workflow run build-apk.yml --ref codex/v18.7.30-rc1-scan-dns-reliability -f build_type=release -f make_release=true -f new_architecture=true
```

Bu dal push tetik listesinde yoktur: normal release build ayrıca manuel başlatılır. Özel deponun görünürlüğü değiştirilmez. Sürümün beş alanı 18.7.30 / 180730 / GPT ELITE v18.7.30 RC1 olarak aynı tutulur.

## 5. Cihazda kabul kontrolleri — henüz sonuç iddiası değildir

1. Rehberden panel → DNS modalı → yalnız bir DNS seç → analizde seçilmemiş adrese credential gitmediğini logla doğrula. All seçiminde seçili sıralamayı kontrol et.
2. MAC kullanıcı port/API yolu + “Yalnız girilen” → çok MAC aynı seçilmiş API'de doğrulansın; ikinci turda başka port/path açılmasın.
3. Bilinen geçerli hesabın ilk isteğine geçici 503/timeout ver → kuyruk → ikinci tur başarı → tek kart/tek journal sonucu. Açık auth=0 → tekrar yok.
4. 429 Retry-After / CF challenge → panel alias'larına geçerek tekrar saldırgan istek üretmesin. Bekleme/koruma görünür; captcha çözme veya protection bypass yok.
5. Tarama ortasında process kill/restart → native encrypted queue/checkpoint ve sonuçlar korunsun; resume diğer profilde sonuç göstermesin. Tamamlanmış belirsiz işleri “getir” düğmesiyle yeniden hazırla; otomatik başlamasın.
6. Test kanalının birincisi bozuk, ikincisi sağlam → gerçek ilk kare kaydı. Normal player aç → test kesilsin; playback max_connections=1 hesabında iki stream açılmasın.
7. İlk kare testinden sonra TXT/Room/journal'da endpoint kanıtı mevcut olsun; sadece auth/catalog olan adrese firstFrameAt yazılmasın.
8. MAG ve Xtream primary DNS'i erişilmez yap → aynı panelden gerçek çalışan aday; refresh başarılı commit sonrası DNS_AUTO_SWAP. Rehber alternatifi kapalıyken eski kaydedilmiş ama seçilmemiş yedek de denenmesin.
9. Büyük Stalker yanıt / eski Android JS engine → OOM/ANR olmadan bounded örnek ve diğer yöntem fallback. Full Film/Dizi yenilemesi boşalmamalı.
10. Force-exit, geri tuşu, Android arka plan, profil değişimi ve TXT public yazma hatası → ekleme ekranından çıkış engellenmesin; sonuçlar korunmalı.

## 6. Bilinen sınırlar / sonraki değerlendirme

- Belirsiz/korunmuş sonuç otomatik olarak başarısız abonelik sayılmaz; kullanıcı tekrar test edebilir. “Koruma görülmedi” sadece o andaki gözlemdir. Anti-ban garantisi yok.
- HEAD ms sağlık ekranı credential-free erişim ölçüsüdür; gerçek TCP ping ve ilk kare ayrı ölçümlerdir. IP/DNS, ağ ve sunucu davranışı süreyi etkiler.
- Streaming bulunmayan fetch ortamında metin cevabı runtime tarafından önce alınabilir; byte sınırı parse/örnek sınırıdır. Native proxy büyük get_all yanıtını 1 MiB'da keser; proxy üzerinden streaming prefix sağlandı iddiası yok.
- MAG full catalogue Xtream backend ID eşleştirmesi ve canlı player buffering/timeshift ayarları önceki mimaride bırakıldı; bu sürüm bunları yeniden tasarlamaz. v18.7.29 audit raporundaki bu bağımsız konular ayrı inceleme ister.
- Manuel “belirsiz denemeleri getir” hazırlığı iki ekranda da 8192 iş sınırındadır. Daha büyük kuyrukta kullanıcıya açık hata verilir; sessiz kesme veya kalıcı kuyruğu silme yapılmaz. Native taramanın checkpoint/retry yürütümü bu UI sınırından ayrıdır. Daha büyük manuel kuyruklar için sayfalı seçim ayrı UI geliştirmesi gerektirir.
- Profile ownership ve offline tests güçlü guard sağlar; gerçek process ölümü, SDK/cihaz heap davranışı ve Room upgrade telefon kabul testlerinde ayrıca kontrol edilmelidir.

## 7. Araştırılan birincil kaynaklar

- Cloudflare challenge başlığı: [Detect a Challenge Page response](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/). `cf-mitigated: challenge` tespiti; yalnız Server header “cloudflare” görmek challenge demek değildir.
- Kullanılan SDK54 player API: [Expo Video](https://docs.expo.dev/versions/v54.0.0/sdk/video/). Async source replacement ve manuel oluşturulmuş player'ın release sorumluluğu.
- Kalıcı DB sürüm yükseltme: [Android SQLiteOpenHelper](https://developer.android.com/reference/android/database/sqlite/SQLiteOpenHelper). Mevcut veriyi silmeden onUpgrade.

## 8. Teslim doğrulama kaydı

Kod teslimi öncesi yerel doğrulama tamamlandı. Henüz cihaz kabul testleri yapılmış sayılmaz.

- Yeni v18.7.30 TS davranış fixture'ları: geçti.
- TypeScript: son UI değişiklikleriyle geçti (`.codex-v18730-tsc-final.log`).
- Tam regresyon: `node tools/denetle.js`, **140 kontrol temiz** (`.codex-v18730-denetle-final.log`). Son JS koruma duruşu değişikliğinden sonra etkilenen gerçek DNS/source-isolation testleri ve sürüm/player kapıları ayrıca geçti.
- MAC restore/selected-endpoint/protection testleri: **12 davranış grubu**, geçti (`.codex-v18730-mag-final.log`).
- Native Kotlin runtime + gerçek SQLite additive retry-table migration + yerel HTTP probe/backoff/cache/interrupt testleri: geçti (`.codex-v18730-native-fixtures.log`). Bu test bir iptal hatası yakaladı: `AdaptiveScanHostGate.acquire` bekleyişinde InterruptedException thread işaretini temizliyordu; catch içinde işaret geri konup exception tekrar gönderildi. Ayrıca aşırı Retry-After'ın journal dueAt alanında Long overflow üretmesi saturating deadline ile engellendi.
- DEV APK son 429 düzeltmesiyle yeniden derlendi: BUILD SUCCESSFUL, 3 dakika 12 saniye. SHA-256 `ce2d3861b7c0e9dff29ada5397150eba3a5123a814a89b7a990f3adf34500eda`. Son Metro sourcemap içinde 22 çalıştırılabilir değişen kaynak güncel kodla eşleşti; type dosyası tsc ile doğrulandı. APK içindeki assets/index.android.bundle da son Gradle çıktısıyla birebir eşleşti.
- Kullanıcı telefonu sonradan bağladı; DEV `adb install -r -g` ile başarıyla yüklendi (Success). Telefon dumpsys: `com.gpt.kizilkan.player.dev`, versionCode=180730, versionName=18.7.30-dev, lastUpdateTime=11.10.2026 09:01:32. Telefonun kurulu base.apk SHA-256 değeri de PC APK ile birebir eşleşti (`ce2d3861b7c0e9dff29ada5397150eba3a5123a814a89b7a990f3adf34500eda`). Normal uygulama/verileri silinmedi. APK yolu: `artifacts/KIZILKAN-18.7.30-RC1-DEV.apk`. Cihazda kurulum doğrulandı; gerçek panel/player kabul senaryoları tamamlandı iddiası yok.
- Depo kimliği/görünürlüğü `gh repo view` ile doğrulandı: `mkizilkan/kizilkan-player-elite`, **private**. Yeni dal push'u sonrası **release / make_release=true / new_architecture=true** ile workflow_dispatch yapıldı; DEV GitHub release yerine gönderilmedi.
- Yerel loglar, APK, socket temp klasörü ve credential arşivleri commit edilmez. Önceki iki GPT audit/plan raporu kodun başlangıç durumu olarak repoda korunur.
- GitHub koşusu ve APK linki gerçekleşince bu dosyaya teslim sonucu eklenir. [Bu dala ait Actions sayfası](https://github.com/mkizilkan/kizilkan-player-elite/actions?query=branch%3Acodex%2Fv18.7.30-rc1-scan-dns-reliability).

## 9. Son kontrol: MAC 429 yeniden deneme düzeltmesi

- İlk paket commit/push: `f7f5c8ec`. Bu commit için normal release workflow_dispatch başlatıldı: [38116211461](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/38116211461).
- Son çapraz kontrolde `magBulkScan.ts` kategori `protected` filtresinin 429 rate_limit sonucunu da kalıcı retry kuyruğundan dışladığı bulundu. Sunucu bekleme gate'i vardı; ikinci tur seçimi eksikti. Henüz APK yayımlanmadan bu CI koşusu iptal edildi.
- `isUncertainMagResult` tek ortak karar: error/unverified/probable/no-portal ile yalnız **rate_limit** gözlemli protected sonuç pending/unresolved olur. CAPTCHA/WAF/challenge otomatik ikinci tura girmez.
- Handshake yedeğinde terminal hata gözlemi eskiden sadece mesaj/state'e taşınıyordu. Şimdi seçilemeyen protected candidate içinde rate_limit/koruma türü korunur; UI sonucu ve kalıcı kuyruk doğru ayrımı görür. Hata gözlemi yoksa MAG_RATE_LIMIT türü korunur; olmayan HTTP200/429 kanıtı uydurulmaz.
- `tools/test-mag-bulk-runtime.js`: beş yeni gerçek orchestration senaryosu (pasif keşif, handshake yedeği, seçilmiş hesap endpoint'i, kalıcı 429, CAPTCHA). Retry-After=2 saniye kapısı gerçek bekleme ile sınanır; pending→resolved veya pending→unresolved, API seçiminin yeniden açılmaması, MAC fallback döngüsünün durması ve CAPTCHA'da tekrar yokluğu doğrulanır. Toplam 12 grup geçti; tsc geçti.
- Son düzeltmeden sonra tam denetim yeniden geçti: 140 kontrol temiz. Yerel DEV derlenmiş ve telefona yüklenmiştir; son commit üzerinden normal release manuel başlatılmıştır. Bir eski build iptal edilmiştir; tek son normal APK teslim edilecektir.

## 10. Son normal release teslimi

- Son kod commit: `9219216bb4d34dd78495bb98200222d6acb16a1a` (MAC 429 düzeltmesi dahil); dal `codex/v18.7.30-rc1-scan-dns-reliability`, origin'e push edildi.
- Son manuel koşu: [38116788617 / build 151](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/38116788617). `headSha` son kod commit'iyle doğrulandı. **APK derleme, final MPV paketleme ve paket/sürüm/imza HARD gate'leri geçti.** Koşu APK oluşturulduktan sonra Actions artifact yüklemesinde başarısız oldu: `Artifact storage quota has been hit`, 11.10.2026 06:42 UTC. Release adımı artifact yüklemesinden sonra olduğu için çalışmadı; normal APK yayımlanmış değildir.

## 11. Build 151 yayınlama kotası kök neden düzeltmesi

- Uygulama kaynaklarında değişiklik yapılmadı. `.github/workflows/build-apk.yml`: bütün derleme/MPV/paket/sürüm/imza kapıları korunarak **Release yayınlama artifact yüklemesinden önceye taşındı**. APK ve ABI/boyut TXT raporu ikisi de Release'e yüklenir. Etiket doğrudan `$GITHUB_SHA` ile derlenen commit'e bağlanır. `gh release view` ile iki asset adı ayrıca doğrulanır; eksik/yüklenemeyen asset başarısızlık olarak kalır.
- Release adımı `id: release` aldı. `actions/upload-artifact` yalnız Release adımı `skipped` ise çalışır: `make_release=false` ve mevcut özel dal istisnası korunur. Başarılı normal Release APK'sı kota sınırlı artifact deposuna ikinci kez yüklenmez. `continue-on-error` eklenmedi; yayınlama veya artifact-only yüklemesi hatası gizlenmez. Eski artifact'lar silinmedi, ücret/bütçe ayarı değiştirilmedi.
- `tools/test-ci-release-publication.js`: gerçek YAML parse edilir; hard gate sırası ve Release/artifact-only koşulları doğrulanır. YAML'daki gerçek Bash Release adımı dış `gh` sınırı stub edilerek çalıştırılır: başarı, create hatası, view hatası, eksik APK, eksik rapor. İki dosya ve derlenen commit hedefi sınanır; GitHub'a istek gitmez. Git Bash Windows'ta sandbox dışı nesne erişimi gerektirdi; yetkili yerel çalıştırmada test geçti. `tools/denetle.js` içine eklendi.
- Son CI değişikliğiyle tam `node tools/denetle.js`: **141 kontrol temiz**, exit 0 (`.codex-v18730-denetle-ci-release.log`). TypeScript ve uygulama regresyon kapıları da bu koşuya dahildir. `git diff --check` temiz. Bu CI-only değişiklik için telefondaki doğrulanmış DEV APK değişmedi.
- Resmi dayanak: [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) — Release asset başına 2 GiB, toplam Release boyutu/bant genişliği sınırı yok. [Actions ücretlendirme](https://docs.github.com/en/billing/concepts/product-billing/github-actions) — artifact depolama kotası ayrı neden. [steps.outcome](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context) — skipped/success/failure ayrımı.

### Public isteği ve gerçek hassas veri durumu

Kullanıcı build hatasından sonra depoyu public yapıp yeniden denemeyi istedi. Görünürlük değiştirilmeden önce **11.10.2026** GitHub contents API eski `b7e62889b8d5070a81d4e34d2521186eeb8d8c8e` commit'indeki `KIZILKAN-HESAP-ARSIVI-579-2026-10-07.txt` için **518034 byte** metadata döndürdü (blob `12a54ce2bfaf736624cf8f1189abebd576c4e065`). Hesap bilgileri terminale veya rapora yazılmadı. Güncel dal temiz olsa da eski obje sunucuda hâlâ mevcut. Public yapmak anonim erişimi yeniden açabilir. Kullanıcıya somut risk soruldu; kullanıcı **“Riski kabul ediyorum; public yap”** yanıtını verdi. Buna dayanarak `gh repo edit --visibility public` talep edildi ancak **otomatik onay denetimi işlemi çalıştırmadan reddetti**: eski credential arşivinin anonim erişime açılması kritik risk olarak belirtildi. Görünürlük değiştirilmedi; PRIVATE kaldı. Ret başka araçla aşılmadı; bağımsız Release kota düzeltmesine devam edildi. Önceki güvenlik temizliği: `AI-DEVIR-v18.7.25-GUVENLIK-TEMIZLIGI.md`. Public için eski SHA/cache erişiminin sağlayıcı tarafında temizlenmesi gerekir; güncel daldan dosya silmek bu sunucu objesini silmedi.
