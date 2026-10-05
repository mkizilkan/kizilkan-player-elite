# GPT — v18.7.15 DEV1 devir karşılaştırması ve uygulama planı

Tarih: 05.10.2026  
Durum: Devir okundu, mevcut kaynakla karşılaştırıldı, başlangıç kontrolleri tamamlandı. Bu çalışma uygulama kodunu değiştirmez.  
Amaç: Build 1 kapsamını koddan doğrulanmış eksikler üzerinden kesinleştirmek; önceki düzeltmeleri korumak.

## 1. Okunan devir ve doğrulanan çalışma tabanı

- Devir: [KIZILKAN_PLAYER_ELITE_v18.7.15_DEV1_CODEX_HANDOFF.md](<C:/Users/KIZILKAN YOGA/Documents/KIZILKAN_PLAYER_ELITE_v18.7.15_DEV1_CODEX_HANDOFF.md>). Dosyanın 1.573 satırı okundu.
- Proje: `C:/Projeler/kizilkan-player-elite`.
- Güncel dal: `v18.7.14-rc1-verify-username-scope`.
- Güncel commit: `4dc91551c76115ee0e9307d2b0f69f030028dc8a`.
- Devirde belirtilen taban commit ile yerel HEAD aynı. İnceleme başlangıcında çalışma ağacı temizdi.
- Uygulama sürümü halen `18.7.14`; DEV1 uygulanmış sayılmamalı.
- Devirde önerilen yeni dal: `v18.7.15-dev1`. Bu incelemede dal oluşturulmadı, commit/push veya Actions tetiklemesi yapılmadı.
- Önceki Python değerlendirmesi: [GPT-PYTHON-REFERANSLARI-VE-MAC-INCELEME-2026-10-05.md](C:/Projeler/kizilkan-player-elite/GPT-PYTHON-REFERANSLARI-VE-MAC-INCELEME-2026-10-05.md). Referans programları çalıştırmak veya yeniden projeye taşımak gerekmiyor.

Devirdeki cihaz log özetleri, örnek hesap bilgileri ve taslak kodlar referanstır. Gerçek hesap değerleri bu rapora kopyalanmadı. Bir log özetindeki sebep-sonuç ilişkisi, güncel kaynak veya yeniden üretim olmadan kesin kök neden olarak işaretlenmedi.

## 2. Başlangıç doğrulaması

Kontroller güncel v18.7.14 kaynağı üzerinde çalıştırıldı. HTTP yanıtları izole test verileridir; gerçek portal veya cihaz testi yapılmadı.

| Kontrol | Sonuç | Kanıtın sınırı |
| --- | --- | --- |
| `frontend`: `node node_modules/typescript/bin/tsc --noEmit` | Başarılı, çıkış kodu 0 | TypeScript derleme kontrolü; Android derlemesi değil. |
| `node tools/test-mag-account-validation.js` | 19 davranış grubu başarılı | Tarih, hesap erişimi, MAC kimliği, snapshot, iptal, profil varyantları. |
| `node tools/test-mag-portal-discovery.js` | 19 davranış grubu başarılı | Kapsam, portal kanıtı, yönlendirme, koruma, port, iptal, yanıt sınırı. |
| `node tools/test-mag-bulk-runtime.js` | 10 davranış grubu başarılı | Toplu analiz kapsamı, seçim, yarış, iptal, TXT ve taşıma sınırları. |
| Ek izole gerçek-modül denemesi | Aşağıdaki dört açık yeniden üretildi | Mevcut test ortamıyla gerçek `stalker.ts` çalıştırıldı; ağ ve kalıcı dosya yazımı yok. |

Ek denemenin sonucu:

```json
{
  "fixtureOnly": true,
  "snapshotRetainsRealLogin": true,
  "bulkRetainsRealLogin": false,
  "bulkVerificationState": "verified",
  "displayNameOnlyTreatedAsLogin": true,
  "magActiveConnectionsPreserved": false,
  "magMaxConnectionsPreserved": false,
  "magFormatsPreserved": false
}
```

Testler başarılı olsa da bu eksikler mevcut testlerin kapsamadığı davranışlardır. Tam `tools/denetle.js`, Android APK derlemesi, telefon kurulumu ve gerçek hesap kabul testi bu okuma aşamasında yapılmadı.

## 3. Mevcut durum, neden, yapılacak iş ve sonuç

Kanıt düzeyleri: **Çalıştırılarak doğrulandı**, **Kaynakta doğrulandı**, **Cihazda yeniden doğrulanacak**.

| ID / öncelik | Mevcut durum ve sebep | Kod kanıtı / doğrulama | Yapılması gereken | Yapılınca ne olacak |
| --- | --- | --- | --- | --- |
| D01 / P1 | Hesap kartı gerçek kullanıcı adı bulunmayınca MAC'i kullanıcı adı olarak gösteriyor. | **Kaynakta doğrulandı:** [settings.tsx:1899](<C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1899>) `acc.username || acc.mac`. | Login alanı ile MAC'i ayır; gerçek login yoksa `Belirlenemedi` göster. | Kullanıcı adı ve cihaz kimliği birbirine karışmaz. |
| D02 / P1 | Normalizasyon `fname/name/sname` değerlerini de login yerine kabul ediyor. Görünen ad giriş kimliği olmayabilir. | **Çalıştırılarak doğrulandı:** [stalker.ts:2017](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2017), [stalker.ts:2037](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2037). | Gerçek login kaynaklarını görünen ad kaynaklarından ayır; görünen ad ayrı alanda saklanabilir. | Yalnız isim veren portal için sahte kullanıcı adı üretilmez. |
| D03 / P1 | G02 düzeltmesi snapshot'ta var; toplu doğrulamanın ayrı `mergeInfo` işlevinde yok. Main-info görünen adı profil login'ini ezebiliyor. | **Çalıştırılarak doğrulandı:** [stalker.ts:2124](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2124) login'i korurken [stalker.ts:2254](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2254) koşulsuz birleştiriyor. | İki akış için ortak, alan kaynağını bilen hesap birleştirmesi kullan; gerçek login önceliğini her ikisinde test et. | Tekli ve çoklu analiz aynı hesap için tutarlı kullanıcı adı verir. |
| D04 / P1 | MAG normalizasyonu `active_cons`, `max_connections`, `allowed_output_formats` değerlerini almıyor. Tipte bulunmalarına rağmen veriler kayboluyor. | **Çalıştırılarak doğrulandı:** [stalker.ts:2064](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2064); mevcut tip [index.ts:73](C:/Projeler/kizilkan-player-elite/frontend/src/types/index.ts:73). | Mevcut `AccountInfo` alanlarını kullan; portal varyantlarını doğrula, sayı/format değerlerini güvenle normalize et. | Portalın gerçekten gönderdiği bağlantı ve format bilgileri MAG kartında da görünür. |
| D05 / P1 | Bilinmeyen hesap durumu aktif sayılıyor; bloklu/inaktif gibi durumlar da `SÜRESİ DOLDU` etiketine düşebiliyor. | **Kaynakta doğrulandı:** [settings.tsx:1883](<C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1883>), [settings.tsx:1890](<C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1890>). | Aktif, süresi dolmuş, engelli/inaktif ve bilinmeyen durumları ayrı değerlendir. Bitiş tarihini mevcut tarih ayrıştırıcısıyla birleştir. | Bilinmeyen hesap yeşil aktif etiketi almaz; engellenme ile bitiş birbirinden ayrılır. |
| D06 / P2 | Bağlantı sayıları ve formatlar yalnız Xtream bölümünde. Aktif bağlantı eksikse `0` varsayılıyor; maksimumdaki `0` değeri `||` ile kayboluyor. | **Kaynakta doğrulandı:** [settings.tsx:1905](<C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1905>), [settings.tsx:1913](<C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1913>), [settings.tsx:1980](<C:/Projeler/kizilkan-player-elite/frontend/app/(tabs)/settings.tsx:1980>). | Kartı mevcut verilere göre ortaklaştır; yokluk ile sıfırı ayır; bağlantı değerini son sorgu anına ait bilgi olarak sun. | MAG bilgileri de gösterilir; eksik bilgi uydurulmuş sıfır olarak sunulmaz. |
| D07 / P1 | İlerleme bilgisi kaynakta yapılandırılmış olsa da güncellik ve düzenleme ekranlarında mesaja indirgeniyor. | **Kaynakta doğrulandı:** [PlaylistContext.tsx:1062](C:/Projeler/kizilkan-player-elite/frontend/src/store/PlaylistContext.tsx:1062), [edit-playlist.tsx:272](C:/Projeler/kizilkan-player-elite/frontend/app/edit-playlist.tsx:272), [StalkerCatalogProgress:221](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:221). | Sayfa, yüklenen/toplam, tür durumları ve süreyi ortak modele taşı; mesinden sayı ayrıştırma. Mevcut onarım görünümünü ortak sunuma bağla. | Üç ekranda aynı anlaşılır görünüm ve gerçek işlem bilgisi kullanılır. |
| D08 / P0 | Tekli eklemede keşiften sonra credential'da exact policy yok; login kendi adaylarına/öğrenilmiş endpoint'e genişleyebiliyor. Kayıtta da `session.endpoint` yerine `cred.portal` kullanılıyor. | **Kaynakta doğrulandı:** [add-playlist.tsx:2623](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2623), [add-playlist.tsx:2664](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2664), [add-playlist.tsx:2682](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2682), [stalker.ts:1482](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1482). | Çözülen API endpoint'ini typed nesne ve kilit ile taşı; snapshot, katalog, kayıt ve sonraki oturum aynı doğrulanmış endpoint'i kullanmalı. Playlist kimliği/dedup ve eski kayıt geçişi birlikte incelenmeli. | Doğrulanan endpoint başka bir UI yoluna kaymaz; kaydedilen adres gerçekten kullanılan endpoint olur. |
| D09 / P0 | Devirde `/portal.php` bulunduğundan sonra `/c` hesap isteğine dönüş anlatılıyor. Güncel otomatik seçim API'ye zaten daha yüksek puan veriyor; tek başına seçici bu iddiayı açıklamıyor. | **Kaynak + yeniden doğrulama gerekli:** [magBulkScan.ts:114](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:114), [magBulkScan.ts:249](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:249), [mag-bulk.tsx:595](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:595). | Otomatik, manuel seçim ve tekli ekleme için ayrı `/c → portal.php → hesap` fixture'ları ekle. Kullanıcı manuel başka yol seçerse yeni seçimin kanıtını ayrıca doğrula; düşük güvenli aday otomatik olarak verified endpoint'i ezmemeli. | P0 kök nedeni gerçek akışta belirlenir; mevcut doğru API önceliği gereksiz yere yeniden yazılmaz. |
| D10 / P1 | Keşif motoru scope verilmediğinde fallback uygulayabiliyor; çoklu UI ise başlangıçta `exact` seçip daima açıkça gönderiyor. Host-only giriş bu yüzden varsayılan genişlemeyi kullanamıyor. | **Kaynakta doğrulandı:** [mag-bulk.tsx:101](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:101), [mag-bulk.tsx:224](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:224), [magPortalDiscovery.ts:197](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:197). | Kullanıcının açık scope tercihi ile otomatik ilk tercihi ayır. Host-only için fallback öner; kullanıcının seçtiği exact'i portsuz girişte de koru. | Host-only girişte anlamlı keşif yapılır; `Yalnız girilen` tercihi sessizce genişlemez. |
| D11 / P1 | Tekli ekleme yalnız `URL.port` ile portsuzluk kontrolü yapıyor; normalize edilen `:80/:443` ve gerçek path bilgisi yanlış yorumlanabilir. | **Kaynakta doğrulandı:** [add-playlist.tsx:2636](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2636); keşif host nesnesinde `hasPort:false, hasPath:false` kullanımı. | Mevcut `parsePortalHosts` ile ham girişin açık port/path niyetini koru; tekli ve çoklu giriş aynı politikayı kullanmalı. | Kullanıcı port/yol yazmışsa bunların anlamı URL normalizasyonunda kaybolmaz. |
| D12 / P1 | Profil zenginleştirme sayacı artık sınırlı; 12 saniyelik kontrol istekler arasında. İçerideki tek istek halen 20 saniyeye kadar sürebilir. | **Kaynakta doğrulandı:** [stalker.ts:1758](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1758), [stalker.ts:1767](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1767). | Kalan süreyi transport timeout'una uygula; ortak deadline sinyali bekleyen gate, fetch ve body okumasını kesmeli. En iyi profil varsa süre sonunda onunla dön. | Süre sınırı yalnız yeni denemeyi engellemekle kalmaz; devam eden isteği de sonlandırır. |
| D13 / P1 | Port erişim ön kontrolleri ile HTML/API/handshake/profil denemeleri tek bir host bütçesinde sayılmıyor. | **Kaynakta doğrulandı:** [magPortalDiscovery.ts:367](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:367), [magBulkScan.ts:185](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:185). | Host başına paylaşılan deadline + request budget kullan; her gerçek taşıma isteğinden önce atomik tüket. Aynı hostta keşif farklı MAC'e geçince bütçe sıfırlanmamalı. Kullanıcının hesap doğrulama fazı keşif bütçesinden ayrıca ayrılmalı. | Çok sayıda port/path ve fallback süreyi kontrolsüz büyütmez; bütçe hesabı gerçek istekleri kapsar. |
| D14 / P2 | Port ön kontrolünde herhangi bir HTTP yanıtı `open` kabul ediliyor; benzer gövdeyle tüm portlara yanıt veren ara sunucu ayrı tanınmıyor. Genel native TCP probe API'si mevcut kaynakta gösterilmedi. | **Kaynakta doğrulandı:** [magPortalDiscovery.ts:380](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:380). Kotlin'deki Socket kontrolü proxy testi içinde özel yöntemdir. | Mevcut taşıma üzerinde sınırlı durum/header/gövde parmak izi topla; `wildcard-responder` bir gözlem olsun. Benzer gövdeli portları otomatik kapalı sayma. Native TCP gerekiyorsa ayrı yetenek ve derleme doğrulamasıyla ele al. | Ara sunucu yanıtı portal kanıtı sayılmaz; gerçek portal yanlış budanmaz. |
| D15 / P2 | Koruma ayrımı kısmen mevcut; keşifte yalnız üç header toplanıyor. Cloudflare edge varlığı ile gerçek challenge ayrımı genişletilmeli. | **Kaynakta doğrulandı:** [magPortalDiscovery.ts:251](C:/Projeler/kizilkan-player-elite/frontend/src/utils/magPortalDiscovery.ts:251), [stalker.ts:140](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:140). | Güvenli header listesini genişlet; edge, challenge, rate-limit ve belirsiz erişim reddini ayır. Eski `present/not_observed/unknown` filtre sözleşmesini koru. | Sadece Cloudflare kullanımı ban/koruma diye etiketlenmez; CAPTCHA/429 daha doğru açıklanır. |

## 4. Zaten var olan ve korunacak davranışlar

- Toplu akış keşfi host başına yapıyor; her MAC için port/path matrisini baştan çalıştırmak temel tasarım değil. Fallback içindeki tekrarlar ve bütçe yine incelenmeli.
- Toplu hesap fazı `endpointPolicy: "exact"` kullanıyor. Devirdeki endpoint lock bu mevcut davranışı genişletmeli, bozup yeniden kurmamalı.
- Otomatik portal seçimi API adayını fingerprint adayının önüne koyuyor.
- 401/403 gözlemi mevcut sınıflandırmada otomatik ban değil; belirsiz erişim reddi. 429 ve challenge ayrı ele alınıyor.
- Base64 MAC ayrımı, yanlış MAC'in reddi, snapshot'ın boş/başka MAC main-info verisini reddetmesi mevcut testlerle korunuyor.
- Ordered-list desteklenmeyen portallarda sınırlı `get_all_channels` erişim doğrulaması mevcut.
- Snapshot'ta gerçek login'i görünen addan koruyan G02 düzeltmesi mevcut; açık kalan yer toplu birleştirme.
- Manuel portal seçimi, seçimli playlist/TXT işlemleri ve iptal sahipliği mevcut; yeni yapı bunları taşımak zorunda.
- `AccountInfo` içinde bağlantı sayıları ve çıktı formatları zaten var. Aynı alanlar için ikinci model oluşturulmayacak.
- Mevcut session/compat öğrenme önbelleği kullanılacak; ikinci bağımsız endpoint/profile cache eklenmeyecek.
- Native modda boş JS katalog dizileri tek başına boş playlist kanıtı değil; Room sayımları ve native sorgular esastır.
- Canlı önce hazırlanıyor, VOD/dizi arka planda zenginleşiyor. PlayerHost kalıcı; ilk görüntü akışını bu değişikliklerle tekrar ağır katalog beklemeye bağlamamak gerekiyor.
- Playlist/profile sahiplik kontrolleri, `runExclusive`, `withCatalogLock`, restore bariyerleri ve aşamalı Room kayıtları korunacak.

## 5. Build 1 uygulama sırası

### Adım 1 — Dal ve regresyon tabanı

Onaylanan kapsamla `v18.7.15-dev1` dalını belirtilen commit'ten oluştur. Başlangıç test sonuçlarını muhafaza et. Önce endpoint aktarımı, bulk login ezilmesi ve MAG metadata kaybını mevcut gerçek modüllerde başarısız fixture olarak yakala.

### Adım 2 — Ortak hesap alanları ve kart

`stalker.ts`, `accountCard.ts`, mevcut `AccountInfo` ve Ayarlar kartı birlikte güncellenecek. Kaynak önceliği tekli/bulk aynı olacak. Gerçek login bulunamazsa `Belirlenemedi`; MAC ayrı satır. Görünen ad gerçek login'i ezmeyecek. Bitiş, kalan gün, durum, sunucu, mevcut bağlantı değerleri, format ve koruma gözlemi aynı kartta sunulacak. Örnek kalan gün sayısı sabitlenmeyecek; hesaplanmış tarih ve şimdiki zaman kullanılacak. Açık sınırsızlık ile tarih bildirilmemesi ayrılacak.

### Adım 3 — Ortak ilerleme sunumu

Mevcut `PlaylistRepairOverlay` ve `CatalogProgressCards` sunumunu ortak `CatalogPreparationModal`/görünüm altında birleştir. `RefreshProgress` ve `StalkerCatalogProgress` gerçek veri kaynağı olacak. Güncellik state'i ve düzenleme state'i sayıları kaybetmeyecek. Tamamlanan türler korunacak; süre hesabı arka plandaki beklemeyi mevcut onarım davranışı gibi ayrı tutacak. Ortak görünüm, ayrı işlemlerin sahiplik/iptal state'lerini tek bir küresel işlem gibi birleştirmeyecek. Otomatik arka plan güncellemesinin player etkileşimine etkisi ayrıca doğrulanacak.

### Adım 4 — Endpoint registry ve güvenli istemci dosyası çözümleme

Önerilen dosyalar: `frontend/src/utils/magEndpointRegistry.ts`, `magClientJsResolver.ts`.

Kurulum ailesinin UI/API/version/client-JS yollarını tek registry'de topla. `xpcom.common.js` içindeki sabit yol değerleri yalnız metin olarak çözümlenecek; hiçbir uzak JS çalıştırılmayacak. `portal_path`, `portal_ip`, göreli ve iç içe kurulum yolları dikkatle ele alınacak. URL origin, protokol, base-path ve normalleştirilmiş/encoded traversal sınırları doğrulanacak. `version.js` yalnız beklenen içerik/tokens ile fingerprint verecek; HTML 200 başarı sayılmayacak.

### Adım 5 — Çözülen endpoint'in uçtan uca aktarımı

`ResolvedMagPortal` benzeri küçük bir tip, input URL / API endpoint / kaynak / kanıt / güven / profil / kilit bilgisini taşıyacak. Kimlik ve token bu tipin içinde olmayacak. Discovery → otomatik veya manuel seçim → login → snapshot → katalog → persist akışında aynı nesne ve endpoint kullanılacak. Manuel seçim yalnız kullanıcı seçimiyle değişebilecek; seçilen aday henüz doğrulanmadıysa doğrulanmış olarak etiketlenmeyecek. Persist edilen portal, başarılı oturum endpoint'iyle uyumlu olacak. Ham kullanıcı girişi gerekiyorsa ayrıca saklanacak.

### Adım 6 — Giriş kapsamı, uyumluluk ve bütçe

Tekli/çoklu girişte `parsePortalHosts` temelli ortak niyet kullan. Kullanıcının açık port/path ve exact tercihini koru. Host-only ilk girişte varsayılan fallback davranışını görünür kıl.

Önerilen dosya: `frontend/src/utils/magDiscoveryBudget.ts`. Ortak host keşif süresi ve istek sayısı; port ön kontrolü, şema denemesi, yönlendirme, HTML, version, xpcom ve handshake dahil gerçek taşımaları kapsayacak. Süre tüketimi gate beklemesini de kapsayacak. Kalan süre timeout'a uygulanacak; deadline ve iptal devam eden işlemleri kesecek.

Uyumlulukta toplam en çok üç kontrollü profil denemesi hedefleniyor. Bu, üç cihaz modeli seçip her modelin altında sınırsız/eski sekiz varyantı çalıştırmak şeklinde uygulanmayacak. Daha önce çalıştığı öğrenilen legacy profil öncelikli korunacak. Başarılı endpoint/profil öğrenmesi sonraki istekte kullanılacak; dördüncü profil denemesi fixture ile yasaklanacak. Keşif, hesap erişim doğrulaması ve profil bilgi zenginleştirmesi ayrı amaçlar olarak bütçelenecek.

Devirdeki 12/25/40 saniyelik hızlı/dengeli/yavaş değerler taslak hedeftir; transport gerçek davranışı ve mock süre testleriyle doğrulanacak. JS transport'un sağlamadığı ayrı TCP/TLS/header/body süreleri varmış gibi gösterilmeyecek.

### Adım 7 — Port, koruma ve güvenli diagnostics

Gerekirse `magResponseFingerprint.ts` ekle. Açık/kapalı/bilinmeyen/wildcard gözlemlerinin kanıtını kaydet; timeout'u kapalı veya ban sayma. 429 `Retry-After` beklemesini koru. Cloudflare edge ile challenge ayrı sunulacak. HTTP/HTTPS seçimi, sadece root erişimi yerine gerçek API kanıtıyla öğrenilecek; kullanıcının açık protokolü ve TLS doğrulaması korunacak.

Tanılar resolved path, kanıt türü, profil ID, request sayısı ve elapsed/remaining sürelerini içerecek. Kullanıcı adı, parola, token ve tam MAC loga açılmayacak. `VERIFIED` gibi başarı olaylarının severity sınıflaması gözden geçirilecek; mevcut kaynaktan doğrulanmadan burada ayrı bir hata olarak iddia edilmiyor.

### Adım 8 — Kabul, sürüm, build ve devir

TypeScript kontrolü ve tam `node tools/denetle.js` geçmeli. Native değişiklik varsa Kotlin/Android derlemesi ve DEV açılışı zorunlu. Sürüm alanları proje sözleşmesine göre `18.7.15` tabanına alınacak; DEV dağıtım etiketi ile mevcut release-label kontrolü tutarlı kalacak. Kullanıcı verisi silinmeden ayrı DEV paket doğrulaması yapılacak.

Gerçek cihazda izinli hesapla, hem açık port/path hem host-only senaryosu; otomatik ve manuel endpoint seçimi; snapshot/katalog/persist path eşitliği; ilk görüntü ve arka plan/geri dönüş ölçülecek. Gerçek cihaz veya hesap yoksa fixture sonucu cihaz sonucu gibi raporlanmayacak. Yeni APK'nın yüklenmesi/build'in tamamlanması ancak gerçek çıktı doğrulandıktan sonra bildirilecek. GitHub işlemleri yapılırsa ayrı dal ve manuel workflow çalışma kimliği raporlanacak.

## 6. Kabul testlerinin ayrıntısı

| Alan | Mutlaka doğrulanacak davranış |
| --- | --- |
| Endpoint aktarımı | `/c` girişiyle keşfedilen gerçek `/portal.php`, hesap/katalog/kayıt aşamalarında aynı kalır. |
| Aday kanıtı | API/handshake kanıtı HTML/version fingerprint'i tarafından otomatik ezilmez; HTTP 200 tek başına portal sayılmaz. |
| Manuel seçim | Kullanıcı başka aday seçerse seçim açıkça temsil edilir ve o endpoint doğrulanır; eski verified etiketi taşınmaz. |
| Client JS | Geçerli göreli/iç içe kurulum yolu çözümlenir; yabancı origin, kötü protokol ve encoded traversal reddedilir; JS çalıştırılmaz. |
| Kapsam | Açık `:80/:443` dahil port/path korunur; portsuz exact bile genişlemez; tercih yapılmamış host-only giriş fallback kullanır. |
| Login | Profil gerçek login'i main-info görünen adıyla hem snapshot hem bulk akışında ezilmez; yalnız görünen ad bulunan kayıtta login belirsizdir. |
| Metadata | Mevcut bağlantı sayıları/formatlar taşınır; `0`, boş ve bilinmeyen birbirinden ayrılır. |
| Hesap durumu | Aktif, süresi dolmuş, bloklu/inaktif, bilinmeyen ve sınırsız/tarih bildirilmemiş ayrımları doğru görünür. |
| Uyumluluk | Öğrenilmiş legacy profil çalışır; toplam üç uyumluluk denemesinden sonra dördüncü yapılmaz. |
| Host bütçesi | Port probe ve yönlendirme dahil tüm keşif istekleri sayılır; aynı host başka MAC'e geçince keşif bütçesi yenilenmez. |
| İptal/deadline | Bekleyen gate, yanıt vermeyen fetch ve body okuması sonlanır; iptal yeni fallback başlatmaz. |
| Koruma | Server header'ındaki Cloudflare tek başına challenge değildir; 403 otomatik ban değildir; 429 beklemesi korunur. |
| Port | Aynı gövdeye sahip ara sunucu yanıtları ayrı gözlemlenir; gerçek API'nin bulunduğu port yanlış budanmaz. |
| Progress | Üç ekran aynı sunumu kullanır; owner/profile değişimi eski işlemin görünümünü veya kaydını yeni hesaba taşımaz. |
| Katalog/player | Room otoritesi, canlı-önce akışı, kalıcı PlayerHost, onarım ve duraklatma sahipliği korunur. |

## 7. Build 2 ve diğer açık işler

Build 2'ye ayrılanlar: canlı/VOD/dizi paralel fetch, adaptif worker, sınırlı concurrency, kontrollü DB yazımı, yüzdelik ilerleme ve kapsamlı stage timing optimizasyonu.

Önceki player ilk görüntü/motor çalışmaları ve diğer eski raporların tüm maddeleri bu okuma ile çözülmüş sayılmaz. Build 1 değişikliklerinin player üzerinde regresyon yaratmadığı kontrol edilecek; ilk görüntü hızını ayrıca değiştirmek için cihazdaki player ölçümü ve somut neden gerekir.

## 8. Her uygulama güncellemesinde Opus'a aktarılacak bilgiler

Her kodlama adımı için tek kayıt:

1. Dal, taban commit ve yeni commit kimliği.
2. Değiştirilen dosya, işlev ve değiştirilme sebebi.
3. Önce/sonra davranışı; bu rapordaki D/Kabul maddesiyle ilişki.
4. Çalıştırılan test ve gerçek sonucu; fixture ile cihaz sonucunun ayrımı.
5. Korunan sözleşmeler: scope, endpoint, profile owner, Room, iptal, player.
6. Bilinen eksik, ölçülmemiş davranış ve sonraki adım.
7. APK yolu/paket/sürüm, kurulum sonucu; varsa workflow/run/commit eşleşmesi.

Bu incelemede yapılmış güncelleme: yalnız bu MD raporu. Uygulama kodu, sürüm, dal ve kurulu DEV değiştirilmedi.

## 9. Kodlamaya geçiş koşulu

Projedeki [CLAUDE.md:26](C:/Projeler/kizilkan-player-elite/CLAUDE.md:26) kuralı: **“Geliştirme önce PLAN olarak maddelenip sunulur; kullanıcı ONAYLAYINCA kodlanır.”**

Bu belge somut Build 1 planıdır. Kapsam onaylandığında uygulama yukarıdaki sırayla ilerleyecek. Devir belgesindeki taslak kodlar veya commit komutları tek başına çalıştırılmış ya da onaylanmış işlem sayılmadı.
