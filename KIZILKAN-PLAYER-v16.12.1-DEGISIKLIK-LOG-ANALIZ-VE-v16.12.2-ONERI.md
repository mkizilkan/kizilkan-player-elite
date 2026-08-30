# KIZILKAN PLAYER v16.12.1 RC1
## Yapılan Değişiklikler, Cihaz Logu Bulguları, Hata Analizi ve v16.12.2 Önerileri

**Belge amacı:** Bu doküman; v16.12.1 RC1 sürümünde yapılan gerçek değişiklikleri, 30.08.2026 tarihli cihaz tanılama kaydında görülen MAG/Stalker bağlantı davranışını, tespit edilen hataları ve bunlara yönelik önerilen düzeltmeleri ayrıntılı biçimde kayıt altına almak için hazırlanmıştır.

**İncelenen cihaz logu:** `kizilkan-diagnostics-2026-08-30T13-06-45-586Z.json`

---

# 1. v16.12.1 RC1'in ana hedefi

v16.12.1 RC1'in ana amacı, daha önce PCAP üzerinden doğrulanan gerçek MAG320/Stalker portal trafiğini KIZILKAN PLAYER'ın MAG bağlantı katmanına daha doğru aktarmak, portal tarafında gereksiz veya agresif handshake denemelerini azaltmak ve oynatıcı tarafındaki Stalker/MAG URL çözümleme hatalarını gidermekti.

Bu sürümde iki ana alan üzerinde çalışıldı:

1. **MAG/Stalker protokol ve ban/rate-limit koruması**
2. **PlayerHost / Stalker create_link / eski görüntü karesi / kontrol yüzeyi düzeltmeleri**

Bu geliştirmeler yapılırken v16.11.0 ve önceki sürümlerde bulunan MAG/Stalker uyumluluk profilleri korunmuştur; yeni PCAP tabanlı davranış bunların üzerine eklenmiştir.

---

# 2. v16.12.1'de yapılan MAG/Stalker değişiklikleri

## 2.1. Gerçek PCAP'tan MAG320 profili eklendi

PCAP incelemesinde çalışan portal handshake paketinde aşağıdaki davranışlar gözlendi:

- Endpoint: `/portal.php`
- `action=handshake`
- `type=stb`
- `JsHttpRequest=1-xml` yok
- `token` query parametresi yok
- `prehash` yok
- MAG320 User-Agent
- `/c/` referer
- MAC cookie
- `stb_lang=en`
- `timezone=Europe%2FParis`
- `X-User-Agent: Model: MAG320; Link: Ethernet`
- `Accept: application/json`
- gzip kabulü
- Başarılı handshake sonrasında dönen token'ın Bearer olarak sonraki isteklere taşınması

Bu doğrultuda `pcap320-minimal` adlı yeni uyumluluk profili eklendi.

### Amaç

Generic MAG250/MAG254 tahminlerinden önce, PCAP'ta gerçek cihaz davranışı ile doğrulanmış MAG320 sözleşmesini kullanabilmek.

---

## 2.2. MAG320 User-Agent desteği

Yeni MAG320 User-Agent sabiti eklendi ve `StalkerCreds.deviceModel` artık aşağıdaki cihaz modellerini destekleyecek şekilde genişletildi:

- MAG320
- MAG254
- MAG250

Bu sayede bağlantı mantığı yalnızca eski MAG250/MAG254 davranışına bağlı kalmıyor.

---

## 2.3. PCAP uyumluluk profili mevcut profillere eklendi

Eski profiller kaldırılmadı.

Korunan profiller arasında:

- `wire250`
- `fulldevice`
- `fulldevice-macid`
- `golden`
- `mag254-encoded`
- `mag254-raw`
- `mag250-encoded`
- `mag250-raw`

bulunmaya devam etmektedir.

Bunlara ek olarak:

- `pcap320-minimal`

eklendi.

Bu, regresyon oluşturmadan yeni portal türlerine uyumluluk kazandırmak amacıyla yapıldı.

---

# 3. Handshake ban/rate-limit korumasında yapılan değişiklikler

## 3.1. Minimum istek aralığı 450 ms → 1.25 saniye

Önceki sürümde handshake varyantları yaklaşık 450 ms minimum aralıkla denenebiliyordu.

v16.12.1'de bu değer:

```text
450 ms
↓
1250 ms
```

olarak artırıldı.

### Amaç

Portalın kısa sürede arka arkaya çok sayıda farklı fingerprint/handshake görmesini engellemek ve istemciyi agresif tarayıcı gibi göstermemek.

---

## 3.2. Authorization failed sonrası adaptif bekleme

Yeni sistem sabit 1.25 saniye ile yetinmiyor.

Her `Authorization failed.` sonrasında bekleme süresi kademeli olarak büyütülüyor.

Mantık:

```text
adaptiveSpacing =
HANDSHAKE_MIN_SPACING_MS × (authRejects + 1)
```

Bu nedenle cihaz logunda denemeler yaklaşık olarak şu davranışı göstermiştir:

```text
1. başarısızlık
→ sonraki deneme yaklaşık 2.5 sn sonra

2. başarısızlık
→ sonraki deneme yaklaşık 3.75 sn sonra

3. başarısızlık
→ sonraki deneme yaklaşık 5 sn sonra
```

Bu davranış logda gerçekten görülmüştür.

---

## 3.3. Maksimum auth reject sınırı

v16.12.1'de art arda yetkilendirme reddi için güvenlik sınırı:

```text
HANDSHAKE_MAX_AUTH_REJECTS = 4
```

olarak korunmuştur.

Dördüncü tekrar eden `Authorization failed.` sonrasında yeni handshake varyantlarının denenmesi durdurulur.

---

## 3.4. Cooldown 45 saniye → 5 dakika

Önceki koruma süresi:

```text
45 saniye
```

iken v16.12.1'de:

```text
300000 ms
= 5 dakika
```

olarak yükseltildi.

Amaç, kullanıcı tekrar tekrar “Kaydet ve Yükle” butonuna bassa bile aynı portal/MAC kombinasyonu için yeni handshake bombardımanı oluşmasını önlemekti.

---

## 3.5. Cooldown kalıcı hale getirildi

Koruma yalnızca RAM'de tutulmadı.

Guard state kalıcı storage anahtarına yazıldığı için uygulama kapatılıp açılsa bile cooldown sıfırlanmamaktadır.

Bu tasarım bilinçli olarak yapılmıştır.

Ama yeni cihaz testi göstermiştir ki bu davranış bazı senaryolarda kullanıcıyı gereğinden fazla kilitlemektedir.

---

# 4. PlayerHost tarafında yapılan değişiklikler

## 4.1. Stalker raw URL fallback kaldırıldı

Önceki davranışta create_link henüz tamamlanmamış olsa bile bazı durumlarda kanalın ham Stalker komutu/URL'si oynatıcıya düşebiliyordu.

v16.12.1'de:

- Stalker kaynaklarında yalnızca çözülmüş create_link URL'si kullanılacak hale getirildi.
- Raw kanal URL fallback'i kaldırıldı.

Amaç:

- yanlış URL'nin native player'a gitmesini engellemek,
- create_link tamamlanmadan oynatıcıyı başlatmamak,
- önceki kanalın çözülmüş URL'sinin yeni kanalda kullanılmasını önlemek.

---

## 4.2. resolvedStalkerKey sahiplik kontrolü

Yeni kanal seçildiğinde önceki kanalın çözülmüş URL'sinin yeni kanal için yanlışlıkla kullanılmaması amacıyla kanal/playlist bazlı ownership anahtarı eklendi.

Özet mantık:

```text
playlist id
+ channel id
+ raw channel url
=
resolvedStalkerKey
```

Çözülmüş URL yalnızca mevcut kanalın anahtarıyla eşleşiyorsa oynatıcıya verilir.

---

## 4.3. Resolve generation mekanizması

Yeni Stalker URL çözümlemesi başladığında:

- eski resolved URL temizlenir,
- eski runtime header temizlenir,
- generation artırılır,
- geç kalan eski async sonuçlar artık yeni kanal üzerine yazamaz.

Bu özellikle hızlı kanal değiştirmelerinde önemli bir yarış koşulu düzeltmesidir.

---

## 4.4. Eski kanalın son karesinin görünmesi engellendi

Stalker create_link tamamlanmadan Media3/VLC/MPV surface'lerinin yeni kanal için gösterilmesi engellendi.

Amaç:

- yeni kanala geçerken eski kanalın son karesini göstermemek,
- çözümleme aşamasında gerçek yeni medya hazır olmadan native yüzeyi ekrana getirmemek.

---

## 4.5. Kontrol paneli / gesture iyileştirmeleri

Player kontrollerinde:

- hide timer generation kontrolü,
- stale timeout engelleme,
- emergency touch ownership,
- double toggle koruması,
- kanal değişiminde kontrol state reset

gibi ek korumalar eklendi.

Amaç, kontrollerin yanlışlıkla 1–2 saniyede kaybolması veya çift dokunuş/gesture yarışlarının paneli kapatması gibi sorunları azaltmaktı.

---

# 5. Medya credential sınırı

PCAP'ta portal isteğinin farklı bir portta çalışan medya sunucusuna yönlendirildiği görüldü.

Örneğin:

```text
portal:
:2095

media:
:8080
```

Bu nedenle v16.12.1'de portal credential'larının medya sunucusuna körü körüne taşınması engellendi.

Aynı hostname olsa bile farklı port:

```text
trusted same-origin
```

olarak kabul edilmiyor.

Bu sayede aşağıdaki hassas header'ların medya/CDN sunucusuna gereksiz taşınması engelleniyor:

- Authorization Bearer
- MAC cookie
- MAG User-Agent
- X-User-Agent
- Portal referer

Bu güvenlik açısından doğru ve korunması gereken bir değişikliktir.

---

# 6. v16.12.1 için eklenen doğrulama/hard-gate

Yeni kontrol dosyası:

```text
tools/check-v16121-pcap-mag-player-controls.js
```

eklendi.

Bu gate şu davranışları kontrol etmek üzere oluşturuldu:

- MAG320 PCAP profilinin varlığı
- wire-nojs handshake desteği
- token/session reuse
- credential boundary
- farklı port medya URL'sine portal credential sızmaması
- Stalker resolved URL ownership
- raw fallback engeli
- stale surface engeli
- controls/touch guard
- ban/rate-limit governor
- 1.25 saniye pacing
- 5 dakikalık cooldown

Bu gate cihaz testi değildir; statik/dinamik fixture doğrulamasıdır.

---

# 7. v16.12.1 cihaz logunda görülen gerçek çalışma sırası

İncelenen cihaz logu v16.12.1'in handshake planını açıkça göstermektedir.

Logdaki plan:

```text
strategy: learned-first-bounded
candidateCount: 6
preferredProfile: golden
defaultModel: MAG254
```

Bu satır önemli bir problemi açığa çıkarmaktadır.

Beklenen yeni PCAP profili ilk sıraya gelmemiştir.

Gerçek istek sırası:

```text
1. golden / MAG250 / wire-nojs
2. golden / MAG250 / wire-nojs-token
3. pcap320-minimal / MAG320 / wire-nojs
4. mag254-raw / MAG254 / wire-nojs
```

Dördüncü yetkilendirme reddinden sonra governor sistemi durdurmuştur.

---

# 8. Logdan tespit edilen hata #1
## Eski learned profile PCAP profilinin önüne geçiyor

### Kanıt

Log:

```text
preferredProfile: golden
```

ve ilk gerçek deneme:

```text
compatProfile: golden
model: MAG250
attempt: 1
```

olmuştur.

Oysa v16.12.1'de eklenen PCAP tabanlı profil:

```text
pcap320-minimal / MAG320
```

ilk kontrollü aday olması hedeflenmişti.

### Muhtemel neden

Eski sürümlerde storage'a kaydedilmiş:

```text
learned profile = golden
```

bilgisi v16.12.1'de yaşamaya devam etmektedir.

Yeni profil eklense de “learned-first” stratejisi eski golden tercihini PCAP profilinin önüne taşımaktadır.

### Sonuç

Yeni PCAP davranışı kodda mevcut olsa bile gerçek cihazda ilk deneme olarak kullanılmamaktadır.

Bu, v16.12.1 tasarımının önemli bir çalışma zamanı açığıdır.

### Öneri

v16.12.2'de learned profile mekanizması migration/confidence mantığıyla yeniden düzenlenmelidir.

Önerilen davranış:

```text
portal için doğrulanmış PCAP profil varsa
→ PCAP profil önce

eski learned profile
→ ikinci katman fallback
```

Eski öğrenilmiş veri tamamen silinmemelidir; ancak yeni kanıtlanmış profilin önüne körü körüne geçmemelidir.

---

# 9. Logdan tespit edilen hata #2
## pcap320-minimal gerçekten deneniyor ama portal yine Authorization failed dönüyor

### Kanıt

Log:

```text
compatProfile: pcap320-minimal
model: MAG320
variant: wire-nojs
```

sonrasında:

```text
HTTP 200
text/javascript
Authorization failed.
```

gelmiştir.

### Kritik sonuç

Sadece profil sırasını değiştirmek tek başına yeterli olmayabilir.

Çünkü PCAP profili üçüncü sırada olsa da gerçek ağ isteği olarak gönderilmiş ve portal tarafından reddedilmiştir.

### Burada henüz bilinmeyen

Cihaz logu şu bilgileri göstermektedir:

```text
hdrSessionPresent: true
hdrSessionShape: encoded
hdrCount: 6
```

ancak header değerlerini ayrıntılı biçimde göstermemektedir.

Bu nedenle cihazdan çıkan gerçek isteğin PCAP'taki çalışan paketle şu alanlarda birebir aynı olup olmadığı logdan kanıtlanamıyor:

- tam User-Agent
- cookie dizilimi
- cookie encoding
- timezone
- referer
- X-User-Agent
- Accept
- Accept-Encoding
- query key sırası
- ekstra query var mı
- gizli/sentetik header var mı
- network stack tarafından değiştirilen header var mı

### Öneri

v16.12.2'de hassas değerleri açık etmeden “request fingerprint telemetry” eklenmelidir.

Örneğin logda:

```text
uaProfile: MAG320-PCAP
cookieMacShape: encoded
cookieHasStbLang: true
cookieTimezone: Europe/Paris
refererShape: /c/
xUserAgentModel: MAG320
accept: application/json
acceptEncoding: gzip
queryKeys: action,type
jsHttpPresent: false
tokenQueryPresent: false
prehashPresent: false
```

gibi alanlar bulunmalıdır.

Bu sayede gerçek cihaz request'i PCAP ile alan alan karşılaştırılabilir.

---

# 10. Logdan tespit edilen hata #3
## Authorization failed ile rate-limit aynı risk sınıfına fazla yakın ele alınıyor

### Kanıt

Portalın gerçek cevabı:

```text
HTTP 200
Authorization failed.
```

olmuştur.

Portal hiçbir yerde:

```text
HTTP 429
Retry-After
Too Many Requests
```

gibi açık rate-limit cevabı üretmemiştir.

Buna rağmen dört auth reddinden sonra sistem:

```text
STALKER_HANDSHAKE_COOLDOWN
durationMs: 300000
reason: MAG_AUTH_GOVERNOR
```

üretmiştir.

### Sorun

`Authorization failed.` şu an bir kimlik/doğrulama reddidir.

Bu tek başına portalın rate-limit uyguladığı anlamına gelmez.

### Sonuç

Uygulama gerçek rate-limit kanıtı olmamasına rağmen kullanıcıyı 5 dakika kilitleyebilmektedir.

### Öneri

Hata sınıfları ayrılmalıdır:

```text
AUTH_REJECT
RATE_LIMIT
HTTP_429
NETWORK_TIMEOUT
NON_JSON
ENDPOINT_NOT_FOUND
SERVER_ERROR
```

Gerçek uzun cooldown yalnızca:

- HTTP 429
- Retry-After
- açık portal rate-limit mesajı
- çok güçlü tekrar eden anti-abuse sinyali

gibi durumlarda devreye girmelidir.

---

# 11. Logdan tespit edilen hata #4
## Manuel tekrar deneme gereğinden fazla engelleniyor

Dördüncü auth reddinden sonra 5 dakikalık persistent cooldown başladı.

Kullanıcı tekrar “Kaydet ve Yükle” dediğinde log:

```text
Portal koruma bekleme süresi aktif (266 sn).
Ban/rate-limit riskini azaltmak için yeni handshake gönderilmedi.
```

daha sonra:

```text
233 sn
```

kaldığını göstermiştir.

### Sorun

Bu davranış ban koruması açısından çalışıyor ancak kullanıcı deneyimi açısından fazla serttir.

Gerçek 429 veya server rate-limit kanıtı olmadan kullanıcı manuel olarak kontrollü tek bir handshake dahi başlatamıyor.

### Öneri

İki ayrı kavram oluşturulmalıdır:

#### Otomatik fallback cooldown

Uygulamanın kendi kendine art arda profil denemesini durdurur.

#### Manuel kullanıcı retry

Gerçek 429 yoksa, kullanıcı yeni bir “Kaydet ve Yükle” işlemi başlattığında kontrollü tek bir birincil profil denemesine izin verir.

Bu deneme:

```text
1 adet
MAG320 PCAP
wire-nojs
```

olmalı; yeniden 6 profil taraması başlatmamalıdır.

---

# 12. Logdan tespit edilen hata #5
## Learned profile başarısız olsa bile ilk tercih olarak yaşamaya devam ediyor

Log:

```text
preferredProfile: golden
```

göstermektedir.

Fakat golden profil ilk iki denemede:

```text
Authorization failed.
```

almıştır.

Bu durumda learned profile confidence düşmelidir.

### Öneri

Learned profile veri modeli genişletilmelidir:

```text
profile
successCount
failureCount
lastSuccessAt
lastFailureAt
confidence
portalFingerprint
```

Bir profil art arda auth reddi alırsa:

```text
confidence düşür
```

Belirli eşikte:

```text
learned-first konumundan çıkar
```

Başarılı profil tekrar doğrulanırsa:

```text
confidence yükselt
```

Bu sistem düz bir “son seçilen profil” kaydından daha doğru olacaktır.

---

# 13. Logdan tespit edilen olumlu sonuçlar

Bu log yalnızca hataları değil, v16.12.1'de çalışan bazı yeni mekanizmaları da doğrulamıştır.

## 13.1. Portal erişimi var

İstekler:

```text
/portal.php
HTTP 200
yaklaşık 180–390 ms
```

dönmüştür.

Dolayısıyla sorun:

- DNS
- port kapalı
- sunucu erişilemiyor
- timeout
- 404 endpoint

değildir.

Portal aktif olarak cevap vermektedir.

---

## 13.2. Adaptif pacing gerçekten çalışıyor

Log zamanları, auth reject sonrası bekleme sürelerinin büyüdüğünü göstermektedir.

Bu, v16.12.1'in ban-safe pacing kodunun cihazda gerçekten devreye girdiğini kanıtlamaktadır.

---

## 13.3. Auth governor gerçekten çalışıyor

Dördüncü tekrar eden auth reject sonrası:

```text
authRejects: 4
duplicateCount: 4
```

ve ardından:

```text
MAG_AUTH_GOVERNOR
```

devreye girmiştir.

Bu koruma mekanizmasının çalışmadığı söylenemez.

Sorun, korumanın **ne zaman ve ne kadar sert uygulanacağıdır.**

---

## 13.4. Persistent cooldown gerçekten çalışıyor

Uygulama tekrar denendiğinde kalan süre azalarak devam etmiştir.

Bu, storage tabanlı guard state'in gerçekten korunduğunu göstermektedir.

---

# 14. Hata / Etki / Öneri özeti

| Tespit | Log kanıtı | Etki | Öneri |
|---|---|---|---|
| Eski learned profil ilk sıraya geçiyor | `preferredProfile: golden` | PCAP MAG320 ilk istek olmuyor | PCAP doğrulanmış profili önceliklendir, learned confidence ekle |
| PCAP profili de auth reddi alıyor | `pcap320-minimal` + `Authorization failed.` | Sadece sıra değişikliği yetmeyebilir | Request fingerprint telemetry ile PCAP/runtime farkını ölç |
| Auth reject rate-limit gibi ağır cezalandırılıyor | HTTP 200 + `Authorization failed.` sonrası 300000 ms cooldown | Kullanıcı gereksiz 5 dk kilitleniyor | AUTH_REJECT ve RATE_LIMIT sınıflarını ayır |
| Manuel retry engelleniyor | 266 sn / 233 sn cooldown mesajı | Kullanıcı kontrollü test dahi yapamıyor | Gerçek 429 yoksa tek primary retry'a izin ver |
| Learned profil başarısızlığa rağmen yaşamaya devam ediyor | golden ilk tercih olmaya devam ediyor | Yanlış profil tekrarlanıyor | success/failure/confidence tabanlı invalidation |
| Tam request fingerprint loglanmıyor | yalnız `hdrCount`, `hdrSessionShape` var | PCAP ile birebir kıyas yapılamıyor | Hassas verisiz alan bazlı telemetry ekle |

---

# 15. v16.12.2 için önerilen düzeltme planı

## P0 — Handshake sırası

HKPREMIUM/PCAP ile eşleşen portal için ilk deneme:

```text
MAG320
pcap320-minimal
wire-nojs
```

olmalıdır.

Eski learned golden profili bu profilin önüne geçmemelidir.

---

## P0 — Request fingerprint telemetry

Gerçek cihaz isteği ile PCAP isteğini karşılaştırmak için hassas verileri sızdırmayan telemetry eklenmelidir.

Amaç:

```text
PCAP request
vs
Android runtime request
```

farkını kesin olarak görmek.

---

## P0 — Auth reject / rate-limit ayrımı

`Authorization failed.` doğrudan uzun cooldown sebebi olmamalıdır.

Yeni sınıflandırma:

```text
AUTH_REJECT
HTTP_429
RATE_LIMIT_EXPLICIT
NETWORK_FAILURE
PARSE_FAILURE
SERVER_FAILURE
```

---

## P0 — Manuel retry politikası

Gerçek rate-limit yoksa kullanıcı yeniden “Kaydet ve Yükle” dediğinde:

```text
tek kontrollü primary handshake
```

gönderilebilmelidir.

6 profil yeniden taranmamalıdır.

---

## P0 — Learned profile invalidation

Başarısız learned profile:

```text
golden
```

art arda auth rejection alıyorsa preference düşürülmelidir.

Eski storage verisi için migration uygulanmalıdır.

---

## P1 — Success state reset

Başarılı handshake olduğunda:

- authRejects
- duplicateCount
- cooldown
- failure streak

kesin olarak sıfırlanmalıdır.

---

## P1 — Portal fingerprint bazlı learned profile

Learned profile yalnız portal URL'ye değil mümkün olduğunca portal fingerprint'e bağlanmalıdır.

Örneğin:

- host
- port
- portal path
- response behavior
- portal software family sinyali

Bu sayede bir portal için öğrenilen davranış başka portalda yanlış kullanılmaz.

---

# 16. Korunması gereken v16.12.1 özellikleri

v16.12.2 hazırlanırken aşağıdaki v16.12.1 geliştirmeleri kesinlikle korunmalıdır:

- PCAP MAG320 profili
- wire-nojs handshake
- mevcut eski MAG250/MAG254 uyumluluk profilleri
- token/session reuse
- credential boundary
- farklı port medya sunucusuna portal Bearer/MAC sızdırmama
- resolvedStalkerKey
- async resolve generation
- raw Stalker fallback engeli
- stale previous-frame engeli
- PlayerHost surface readiness gate
- control panel timer generation
- emergency touch ownership
- gesture/double-toggle korumaları
- v16.12.1 hard-gate kapsamı

Yeni düzeltme bunları kaldırmamalı; yalnızca handshake karar mekanizmasını daha doğru hale getirmelidir.

---

# 17. Doğrulama durumu ve dürüstlük notu

v16.12.1 için daha önce gerçekten çalıştırılan kontroller arasında:

- yeni v16.12.1 hard-gate PASS
- eski MAG architecture fixture PASS
- 40/40 `tools/*.js` syntax kontrolü PASS
- değiştirilen `stalker.ts` ve `PlayerHost.tsx` için transpileModule kontrolü PASS
- ZIP bütünlük kontrolü PASS

bulunmaktadır.

Ancak dependency eksikliği nedeniyle tüm proje TypeScript `--noEmit` kapıları yerel ortamda tam çalıştırılamamıştır. Bu iki gate PASS olarak kabul edilmemelidir.

Ayrıca bu cihaz logu, fixture testlerinin tek başına gerçek portal kabulünü garanti etmediğini açıkça göstermektedir. Bu nedenle v16.12.2'de cihaz runtime request fingerprint ölçümü kritik hale gelmiştir.

---

# 18. Sonuç

v16.12.1 başarısız bir sürüm değildir; cihaz logu birçok yeni koruma mekanizmasının gerçekten çalıştığını kanıtlamaktadır.

Fakat MAG bağlantısının ana problemi halen çözülmemiştir.

En kritik yeni bulgular:

1. Eski learned `golden` profili PCAP MAG320 profilinin önüne geçmektedir.
2. `pcap320-minimal` gerçekten denenmiş ancak portal yine `Authorization failed.` döndürmüştür.
3. Cihaz logu tam request fingerprint'ini göstermediği için PCAP ile runtime isteğinin birebir eşitliği henüz kanıtlanamamaktadır.
4. `Authorization failed.` ile gerçek rate-limit ayrımı yeterince net değildir.
5. 5 dakikalık persistent cooldown gerçek 429 olmadan kullanıcıyı gereğinden fazla kilitlemektedir.
6. Learned profile başarısız olduğunda confidence/invalidation mekanizması bulunmamaktadır.

Bu nedenle v16.12.2'nin ana hedefi “daha fazla profil denemek” olmamalıdır.

Ana hedef:

```text
doğru profili önce gönder
+
gerçek request'i ölç
+
auth reject ile rate-limit'i ayır
+
gereksiz fallback'i durdur
+
manuel retry'ı kontrollü şekilde izinli tut
+
başarısız learned profile'ı düşür
```

olmalıdır.

Bu yaklaşım hem portal ban riskini düşük tutar hem de körü körüne yeni varyant eklemek yerine gerçek kök nedeni ölçülebilir hale getirir.
