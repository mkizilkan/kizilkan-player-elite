# AI DEVİR — v18.7.11 RC1 (MAG profil-uyumluluk çekirdeği + kullanıcı adı telemetrisi + keşif bütçesi)

**Taban:** `v18.7.10-rc1-bulk-handshake-fallback` (6910a934). **Dal:** `v18.7.11-rc1-mag-profile-variants`.
**Native/Kotlin değişikliği YOK (tümü TS + test + gate + doküman).**

## Kök neden kanıtı (cihaz DEV 18.7.10 tanı dosyası, 2026-10-04)
- İki portal: **hkpremium** `:2095/portal.php` → handshake OK, profil OK, katalog/oynatma ÇALIŞIYOR. **weko** `:80/portal.php` → handshake OK (token) ama `STALKER_PROFILE_VARIANT_EMPTY (MAG320-pcap-minimal)` → profil BOŞ; yine de `get_all_channels` **21266 kanal** döndürüyor.
- `STALKER_COMPAT_ATTEMPT` = 11× yalnız `pcap320-minimal` → tek profil varyantı; boş dönünce başkasına geçmiyordu.
- Çoklu MAC `MAG_BULK_SCAN_DONE valid=0` → profil boş olunca hesap "geçersiz" sayılıp eklenmiyordu.
- Keşif `STALKER_PORTAL_DISCOVERY_START 16:06:56 → NONE 16:25:36` = **~19 dakika**.
- Kullanıcı adı: `STALKER_ACCOUNT_SNAPSHOT.hasUsername` logda **[REDACTED]** (anahtar "username" içerip SAFE sonek taşımıyor) → kodun bulup bulmadığı görünmüyordu. hkpremium `get_profile` alanları: `id,name,sname,pass,...,phone,fname,login,password,...` → **`login` ALANI VAR**.

## İnternet araştırması (standart Stalker/Ministra istemci protokolü)
handshake → token → `get_profile` → `get_main_info`. StalkerTalker/Kodi pvr.stalker `get_profile`'ı **DOLU parametreyle** gönderir: `sn, stb_type(MAG250/254), image_version, ver, hw_version, num_banks, device_id, signature`. Bazı portaller (weko) **parametresiz** get_profile'a BOŞ `js` döndürür; profili ancak dolu parametreyle verir. Kullanıcı adı = `get_profile`'daki **`login`** alanı (Infomir yönetim paneli: "Login is a unique user login field"). Kaynaklar devir sonunda.

## Yapılan (hepsi `frontend/src/utils/stalker.ts`)
- **A / M07+M08 — MAG320 dolu-parametre profil varyantları:** `initialProfileVariants(MAG320)` artık `[MAG320-pcap-minimal, MAG254-explicit, MAG254-legacy, MAG250-explicit, MAG250-legacy]`; `derivedProfileVariants(MAG320)` artık MAG254+MAG250 türetilmiş kimlikli varyantları üretir (eskiden `[]`). Minimal İLK denenir (hkpremium gibi uyumlu portaller etkilenmez); **boş dönünce** dolu-parametreli varyantlara düşer → weko profili dolar.
- **B / M08 — boş profil + canlı erişim = geçerli:** `stalkerVerifyAccount` artık profil/main_info kimliği yoksa HEMEN `unverified` DEMİYOR; canlı/VOD/dizi probe'una devam eder. Gerçek örnek (positive id + name + kullanılabilir cmd) erişilebilirse `verified`. `accountMatchesMac` yanlış-MAC'i, `classify` bloklu/süresi-dolmuşu hâlâ eliyor → boş/yetkisiz hesap eklenmez. Böylece weko (21266 canlı) çoklu MAC'te de eklenir.
- **C / T02 + A03/A04 — güvenli kullanıcı adı telemetrisi:** ortak `pickUsernameField` (login→…→fname→name→sname; MAC/jenerik elenir) + snapshot telemetrisi `usernamePresent/passwordPresent/usernameFieldKind/usernameSourceKind` + aday varlık (`loginValuePresent/fnameValuePresent/nameValuePresent`). `*Present/*Kind` sonekleri redaksiyona takılmaz → değer açılmadan hangi alanda kullanıcı adı olduğu görünür.
- **M09 — keşif duvar-saati bütçesi:** `discoverMagPortal` artık `wallBudgetMs` (varsayılan `min(aday×(timeout+1.5sn), 240sn)`); aşılırsa `STALKER_PORTAL_DISCOVERY_BUDGET_STOP` (tamamlanamadı; "portal yok" DEĞİL). 19 dk → ≤4 dk.

## Doğrulama (PC)
- `yarn tsc --noEmit` temiz (exit 0)
- `node tools/denetle.js` → **✅ TÜM DENETİMLER TEMİZ** (exit 0)
- `check-v18711-release.js` PASS · hesap testi **12 grup** (yeni: MAG320 dolu-parametre varyant, boş-profil+canlı=verified, kullanıcı adı alan seçimi)
- Refactor nedeniyle güncellenen kapılar (özellik korunur, yeri değişti): check-v18708/v18710 kullanıcı adı aday alanları `USERNAME_SOURCE_FIELDS` dizisine; check-v15216 türetilmiş-kimlik model-bağımsız + session-cache fixture'ı geçerli profil (profiles=1 korunur).
- **Native değişiklik YOK.**

## Cihazda doğrulanacak (DEV APK)
1. **weko tekli ekleme:** `STALKER_PROFILE_VARIANT_OK` (MAG254/MAG250 varyantıyla) → profil dolu mu (kullanıcı adı/bitiş); yoksa bile hesap EKLENİYOR mu (canlı 21266).
2. **weko çoklu MAC:** `valid` ≥1 mi (boş profil + canlı erişimle verified).
3. **hkpremium kullanıcı adı:** `usernameFieldKind`/`usernameSourceKind` → hangi alandan (login mı name mi), `usernamePresent=true` mu. Kartta görünüyor mu (gerekirse yenile — eski kayıt yeni normalizer'la refresh'te güncellenir).
4. **Keşif:** 19 dk yerine bütçeyle kısa + `BUDGET_STOP`.

## Player (görüntü hızlanması) — ayrı iş, kanıt notu
Son logda oynatmalar XTREAM (TS); ilk kare ~1.8–2.9 sn, **srcSet ~1.5–2.7 sn** = Media3'ün canlı MPEG-TS akışını açması (buffer başlatma eşiği zaten ~200 ms; `expo-video bufferOptions`). Buffer kör dokunuşu hızlandırmaz, stutter riski yaratır. Gerçek uzun gecikmeler (28–132 sn) Stalker kanalında HTTP 444 + boş oturumdandı → M08 ile büyük ölçüde düzelmesi beklenir. Oynatma açılışını daha fazla hızlandırmak için önce aşama ölçümü (connect/TTFB/keyframe) gerekir; bu v18.7.12'ye önerilir.

## Sonraki (GPT backlog, onaysız kodlanmaz)
M10 (tekli ekran gelip gidiyor), M11 (:80/:443 portsuz sayılıyor), A05/A06/A07/A08, C01–C04, D01, P01–P05, N01–N03; player açılış ölçümü+optimizasyonu.

## Kaynaklar (protokol araştırması)
- quassi.nl "The wonderful world of Stalker IPTV"
- github.com/agsimeonov/StalkerTalker `session.py` (get_profile parametre seti)
- Infomir Ministra yönetim paneli (Login alanı)
- Kodi Add-on: Stalker Client (MAG254/255 middleware istemcisi)
