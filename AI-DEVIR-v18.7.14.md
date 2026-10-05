# AI DEVİR — v18.7.14 RC1 (GPT G01-G06 + back-trap iptal)

**Taban:** `v18.7.13-rc1-exact-scope-username-mac` (31bd8e5c). **Dal:** `v18.7.14-rc1-verify-username-scope`.
**Native/Kotlin değişikliği YOK (TS + test + gate + doküman).** Kaynak: `GPT-PYTHON-REFERANSLARI-VE-MAC-INCELEME-2026-10-05.md` (G01-G10) + kullanıcı back-trap bildirimi.

## Yapılan
- **A — back-trap iptal (`add-playlist.tsx`):** MAG ekleme modalı (`loading && stalker`) artık **İptal butonu** + `onRequestClose` abort taşıyor (eskiden boştu → takılınca kullanıcı kilitleniyordu). `stalkerAddAbortRef` (AbortController) `stLogin`/`stalkerAccountSnapshot`/`discoverMagHosts`/`discoverMagPortal` signal'ine geçirilir; iptal akışı catch/finally'de `loading=false` yapıp modalı kapatır.
- **G01 (`stalkerVerifyAccount`):** ordered-list hiçbir türde örnek vermezse canlı için **sınırlı `get_all_channels`** denenir (aynı 20 sn + yanıt boyutu bütçesi; ilk 128 örnek). Tekli oynatmada çalışan ama ordered-list desteklemeyen hesap artık çokluda da verified. Desteklenmeyen ≠ yetkisiz.
- **G02 (`stalkerAccountSnapshot`):** main-info'nun görünen-ad türevi (`name/fname/sname`) username'i, profildeki **gerçek login**'i (login/username/user_name/user/account/subscriber) EZMEZ (`keepProfileLogin`).
- **G03 (`pickUsernameField`):** aday ÖNCE `decodeMacIfBase64` ile çözülür; herhangi bir geçerli MAC biçimi (base64 dahil) kullanıcı adı sayılmaz → base64-MAC bir `login` alanında gelse bile atlanıp sonraki gerçek alan okunur.
- **G04 (`stalkerProfile`):** gerçek enrichment bütçesi — ilk kullanılabilir (login'siz) profilden sonra **her deneme** (dolu/boş/hata) sayılır, gruplar (initial+derived) arası ORTAK, + `ENRICH_DEADLINE_MS=12s`. Eski "2 dolu profil" sayacı boş/hatalıyı saymıyordu (8 ek isteğe çıkabiliyordu).
- **G05 (`magPortalDiscovery.ts`):** "Yalnız girilen" (exact) **portsuz girişte bile kati** (eskiden `!hasPort && exact → fallback` yükseltiliyordu); explicit exact her zaman exact kalır. HTML-link/soft-404 baseline kuyruğu exact'te kapalı.
- **G06 (`stalkerAccountSnapshot`):** main-info yalnız (a) supplied MAC ile eşleşiyor (base64 dahil, `accountMatchesMac`) VE (b) boş değilse (`Object.keys>0`) OTORİTER sayılır; `{js:{}}` veya başka-MAC yanıtı profil bilgisini ezmez (`STALKER_MAIN_INFO_REJECTED`).

## Doğrulama (PC)
- `yarn tsc --noEmit` temiz · `node tools/denetle.js` → **✅ TÜM DENETİMLER TEMİZ** (exit 0)
- `check-v18714-release.js` PASS · hesap testi **19 grup** (G01/G02/G03/G04/G06 yeni) · keşif testi **19 grup** (portsuz exact kati).
- Kırık kalan gate düzeltildi: `check-v18708` portsuz-auto-scope assertion yeni forma (G05).

## Cihazda doğrulanacak (DEV 18.7.14)
1. **Back-trap:** MAG ekleme uzarsa "İptal et ve geri dön" ile çıkılabiliyor mu.
2. **hkpremium:** yenile → kart `ud3B3yRH` (G02/G03/G04 + v18.7.13 enrichment). Log: `usernameFieldKind=login`.
3. **G01:** ordered-list desteklemeyen bir portal hesabı artık çoklu doğrulamada verified oluyor mu.
4. **G05:** portsuz + "Yalnız girilen" yalnız varsayılan portu deniyor mu.

## Bekleyen (GPT): G07 (keşif profil farkı), G08 (ortak deadline/sayaç — kısmen M09), G09/G10 (oynatma ölçümü + "katalog ≠ ilk kare" etiketi). Ayrıntı `GPT-OPUS-GUNCELLEME-DEVRI.md`.
