# AI DEVİR — v18.7.10 RC1 (çoklu MAC handshake yedeği + GPT inceleme düzeltmeleri)

**Taban:** `v18.7.9-rc1-twophase-discovery` (fc5a51d1 / 70f7933f). **Dal:** `v18.7.10-rc1-bulk-handshake-fallback`.
**Native/Kotlin değişikliği YOK (tümü TS + test + gate + doküman).**

## Kök neden kanıtı (cihaz DEV, weko-azure.xyz)
- **Çoklu MAC başarısız, tekli ekleme başarılı:** port+yol+MAC girilse bile çoklu aramada portal bulunamıyordu; aynı host tekli eklemede 16:06:11 `STALKER_PORTAL_DISCOVERY_START` → **21266 kanal, AKTİF**. Fark: tekli ekleme **gerçek handshake keşfi** (`discoverMagPortal`) ile yedekleniyordu; çoklu akış yalnız **pasif keşfe** (`discoverMagHosts`, MAC'siz) dayanıyordu ve weko gibi "izsiz" portalleri pasif tanımıyordu.
- Açık `/c/` girişinde çoklu tarama `FOREIGN_REDIRECT` ile host'u komple "error" yapıp handshake'i hiç denemiyordu.

## Yapılan — ana 7 madde (#1–#7)
- **#1 Çoklu MAC handshake yedeği (`magBulkScan.ts`):** pasif keşif bir host'ta seçilebilir aday bulamazsa, TEKLİ eklemedeki gibi gerçek handshake keşfi yapılır (`discoverMagPortal`). Bulunan endpoint **seçilebilir aday** olarak rapora enjekte edilir → hem otomatik hem **"ben seçeceğim"** manuel seçicide görünür, hem de hesap doğrulaması o endpoint'te çalışır. Telemetri: `MAG_BULK_HANDSHAKE_FALLBACK_START/OK/EMPTY/ERROR`.
- **#2 Redirect bir host'u ÖLDÜRMESİN (`magPortalDiscovery.ts`):** `FOREIGN_REDIRECT` artık host'u error+stop yapmaz; yalnız o aday atlanır (`MAG_DISCOVERY_FOREIGN_REDIRECT`), diğer yollar/portlar ve handshake yedeği denenir. Yalnız `PROXY` durdurur.
- **#3 version.js tanıma (`magPortalDiscovery.ts`):** dizin-benzeri yolda 2xx alınınca `<base>/version.js` denenir; JS gövdesi gelirse portal KESİNLEŞİR (`MAG_DISCOVERY_VERSION_JS`). **(M05 ile düzeltildi, aşağıya bakın.)**
- **#4 Alternatif scheme (GPT'nin "TLS/TLS" noktası):** `classifyPorts` birincil scheme yanıt vermezse ALTERNATİF scheme'i (http↔https) BİR KEZ dener; çalışan scheme port başına öğrenilir (`portSchemes`) ve aday üretimine (`portalDiscoveryCandidates({schemes})`) geçer. **TLS doğrulaması KAPATILMAZ** (yalnız http/https şema seçimi; sertifika doğrulaması aynen açık).
- **#5 Sınırlı bilinmeyen-port fallback:** Aşama 2b yalnız ilk ~96 aday (yol-öncelikli); "bulunamadı" senaryosu 714 deneme/8,5 dk yerine kısa sürer.
- **#6 Kullanıcı adı name/fname (`stalker.ts`):** `loginCandidate` (boş/jenerik/MAC-eşiti değer eler) ile `login/username/user_name/user/account/subscriber/fname/name` sırası denenir. HKPREMIUM get_main_info'da ad yok (mac/phone); get_profile'da olabilir.
- **#7 Handshake-adayı seçilebilir:** #1'de enjekte edilen aday `selectable:true, confidence:"api"`.
- **UX:** tekli eklemede handshake ilerleme metni (`handshake i/t`). Çoklu MAC manuel portal seçici + "Seçili N geçerli hesabı playliste ekle" (Xtream gibi hepsini/istediğini seç) ZATEN VARDI (`mag-bulk.tsx` satır 232, 664); #1 sayesinde handshake-bulunan endpoint artık manuel seçicide de listelenir.

## GPT incelemesi düzeltmeleri (GPT-OPUS-DETAYLI-INCELEME-2026-10-03.md — yeni koddaki gerçek hatalar)
Bu inceleme aynı dal üzerinde yapıldı; yukarıdaki #1–#7 kodumu da eleştirdi ve **gerçek hatalar** buldu. Ship öncesi düzeltildi:
- **M05 — version.js yanlış-pozitif:** #3 ilk hâli, denenmemiş 4 PHP yolunu kör `httpStatus:200, selectable:true` yapıyordu (yollar gerçekte 404 olabilir). DÜZELTİLDİ: version.js artık yalnız **non-selectable** `portal-confirmed` izi bırakır; gerçek API yolları **kuyruğa alınıp PROBE edilir** → yanıt gerçekten API/handshake ise `inspect()` onu selectable yapar, 404 ise aday oluşmaz. "HTTP 200 tek başına yetmez" korundu.
- **T01 — version.js testi:** eski test "selectable API" bekliyordu (yanlış davranışı sabitliyordu). İki senaryoya çekildi: (a) tüm PHP 404 → API seçilebilir OLMAZ, yalnız non-selectable iz, state≠ready; (b) portal.php gerçek handshake token → seçilebilir api.
- **M02 — handshake yedeği korumayı delmesin:** rapor `protected` ya da koruma gözlemliyse yedek ÇALIŞMAZ (`MAG_BULK_HANDSHAKE_FALLBACK_SKIP`). Yedek sırasında terminal koruma/429 (`MAG_PROTECTION/MAG_RATE_LIMIT`) gelirse başka MAC denenmez, host `protected` işaretlenir (`..._PROTECTED`).
- **M03 — kapsam taşması:** bulk yedeğinde literal `.php` girişte YALNIZ o endpoint denenir; `/c/`/dizinde kurulum ailesi.
- **M04 — tek MAC host'u öldürmesin:** yedek ilk **3 distinct MAC**'i dener (biri reddedilse diğeri denenir).
- **M06 — bounded keşif ≠ "portal yok":** handshake yedeği de boşsa host "kesin portalsız" sayılmaz; mesaj "port/yol genişletmeyi deneyin" (durum enum'u değişmedi → regresyon yok).

## Doğrulama (PC)
- `yarn tsc --noEmit` temiz (exit 0)
- `node tools/denetle.js` → **✅ TÜM DENETİMLER TEMİZ — paketlenebilir** (exit 0)
- `check-v18708/18709/18710-release.js` PASS
- `test-mag-portal-discovery.js` → **17 grup PASS** (version.js (a) yanlış-pozitif yok + (b) gerçek API seçilebilir dahil)
- Native değişiklik YOK → Kotlin derlemesi gerekmiyor.

## Cihazda doğrulanacak (DEV APK)
1. **weko çoklu MAC:** pasif boş → `MAG_BULK_HANDSHAKE_FALLBACK_START/OK`; bulunan endpoint manuel seçicide görünüyor mu; hesaplar (bitiş/MAC/AKTİF) doğru mu.
2. **version.js:** portal gerçekten varsa `MAG_DISCOVERY_VERSION_JS` + ardından probe ile API adayı seçilebilir oluyor mu (kör 200 yok).
3. **Koruma:** 429/WAF olan bir host'ta `..._SKIP`/`..._PROTECTED` çalışıyor mu (yedek korumayı delmiyor).
4. **Kullanıcı adı:** HKPREMIUM `profileFields` → hangi alanda ad var, #6 yakalıyor mu.

## Sonraki (GPT backlog — v18.7.11+, onaysız kodlanmaz)
A01–A08 (hesap alanı/MAC/tarih/status), C01–C04 (katalog kısmi/iptal), D01 (profil sahipliği), P01–P05 (motor/token/ilk-kare ÖLÇÜMÜ), N01–N03 (native gzip/body/telemetri), T02 (redacted). Her biri kanıt+plan+onayla ayrı sürümde. Canlı-kanıtlanmamış: M07/M08 (profil uyumluluğu), P01 (104 sn kuyruk), HTTP 444 kökü.
