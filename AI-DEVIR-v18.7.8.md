# AI DEVİR — v18.7.8 RC1 (katalog paralel sayfalama + keşif yanlış-negatif düzeltmeleri + tekli/çoklu motor birleştirme + hesap telemetrisi)

**Taban:** `v18.7.7-rc1-mag-account-fixes` (fbebcd6c). **Dal:** `v18.7.8-rc1-catalog-speed-discovery`.
Kullanıcı onayı: "A, B, C + MAC portal/port/path/portal testi + tekli/çoklu MAC bulma bu build'de."

## Kanıt (tanı 18.7.7 `d6f010b8`, 3 dk)
- **B:** VOD `total 22901`, **14 satır/sayfa**, **sıralı**, ~540 ms/sayfa → 45 sn'de yalnız 1176/22901 (%5). ANR yok (saf ağ gecikmesi). Mutlak sınır da 120 sayfaydı (≈1680 öğe tavanı).
- **C:** İlk-kare bu oturumda **665–1143 ms (hızlı)** — zap hızlı. Yavaş "ilk açılış" muhtemelen katalog yükü çekişmesi. Kör düzeltme yok; P7 ölçümü kalır.
- **A:** main-info çalıştı (Active, bitiş, şifre `fcTwy5ykkP`) ama kullanıcı adı MAC görünüyor; portal gerçek login'i farklı alanda döndürüyor (şifre Xtream `ud3B3yRH` hesabıyla aynı). Alan adını bilmek için telemetri eklendi.

## Yapılan
- **B — paralel sayfalama (`stalker.ts` `stalkerOrderedList`):** bootstrap (p0/p1 ile base 0/1 + total) sıralı; ilk gerçek sayfa (p=2) tek (duplicate/empty governor ≤3 sayfa hızlı durur); sonrası **parti ${6} PARALEL** çekilir, **sırayla işlenir** (dedup + onUniqueRow sırası korunur). `seenFp` sayfa-alias, `seen` satır dedup. 429/koruma/unsupported/cancel korunur. Mutlak sayfa sınırı 120→**600**. Bütçe 45→**75 sn**. → ~7× daha çok içerik, kat kat hızlı.
- **Keşif P0 (`magPortalDiscovery.ts`) — hiçbir portu yanlışlıkla eleme:**
  - `portClosedByError`: yalnız KESİN bağlantı reddi/erişilemezlik = `closed`; TIMEOUT/TLS/body-limit/belirsiz = `unknown`.
  - Port modeli `open | unknown | closed`; `reachProbe` üç durumlu; proxy **BODY_LIMIT = açık** (sunucu yanıt verdi).
  - `reachableOpenPorts`: OPEN-önce ama **UNKNOWN portlar ASLA düşürülmez** (yollar yine denenir). `/` başarısızlığı/tek açık port diğerlerini elemez.
  - Portsuz girişte **auto scope** (exact/boş → fallback; port verildiyse dokunulmaz).
- **Tekli/çoklu motor birleştirme (`add-playlist.tsx`):** tekli MAG ekleme artık çoklu ile aynı MAC'siz `discoverMagHosts` motorunu kullanır (önce MAC'siz keşif → en iyi endpoint → tek login); eski `discoverMagPortal` handshake-keşfi fallback.
- **A — kullanıcı adı:** `STALKER_ACCOUNT_SNAPSHOT`'a `mainInfoFields` (alan ADLARI, değer YOK → güvenli) + `hasUsername/hasPassword`; `normalizeStalkerAccountInfo` kullanıcı adı aday alanları genişletildi (login/username/user_name/user/account/subscriber), password alanları genişletildi.

## Doğrulama (PC)
- `yarn tsc --noEmit` temiz · `node tools/denetle.js` **TÜM DENETİMLER TEMİZ (exit 0)** · `check-v18708-release.js` PASS.
- Keşif testi **15 grup** (yeni: root-fail port düşmez AC-2/AC-3) · hesap testi 9 grup · bulk-runtime 10 grup.
- Kırılan 4 eski kapı düzeltildi (fetchPage unsupported→VOD fallback; DUPLICATE_PAGE governor ≤3 sayfa; `nextPage:2`; checkplayercore P0_EMPTY_P1_FALLBACK işaretçisi; v18706 PORT_DEAD→PORT_CLOSED).
- **Native/Kotlin değişikliği YOK (tümü TS).**

## v18.7.9'a bırakılan (onaysız kodlanmaz)
- GPT'nin **native gerçek-TCP connect** maddesi (Kotlin + ~16 dk derleme) — JS overhaul yanlış-negatifleri zaten çözüyor.
- Merkezi endpoint registry (#10), soft-404 normalizasyonu, Cloudflare edge/challenge ayrımı, ayrıntılı hata sınıfları, öğrenilmiş endpoint cache, C için (yavaş ilk açılış yakalanırsa) düzeltme.

## Cihazda doğrulanacak
1. **B:** MAG katalog (VOD/dizi) belirgin daha hızlı + daha çok içerik (`STALKER_PAGINATION_PAGE parallel:true`, daha çok `loaded`).
2. **Keşif:** portsuz portal + port bilinmeyen senaryoda bulma oranı (zeroonex2 gibi `/` timeout + `/c/` çalışan).
3. **A:** `STALKER_ACCOUNT_SNAPSHOT.mainInfoFields` ile login alanını gör → gerekiyorsa v18.7.9'da kesin eşle.
4. **C:** katalog hızlanınca ilk açılış çekişmesi azaldı mı.
