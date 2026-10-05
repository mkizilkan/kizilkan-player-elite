# AI DEVİR — v18.7.15 RC1 (dal `v18.7.15-rc1-mag-endpoint-lock`)

**Tarih:** 2026-10-05 · **Taban:** v18.7.14 `4dc91551` · **Yazan:** GPT (Build 1 kodu) + Claude Opus (tamamlama, doğrulama, commit)
**Kaynak plan:** `GPT-v18.7.15-DEV1-DEVIR-KARSILASTIRMA-VE-UYGULAMA-PLANI-2026-10-05.md` (D01–D15)

## Nasıl oluştu
GPT, v18.7.14 üstünde `v18.7.15-dev1` adlı dalda Build 1'i (D01–D15) kodladı; doğrulama sırasında token limiti
bitti. 47 dosya commit edilmemiş, tsc temiz ama **iki denetim kapısı kırıktı**. Kullanıcı "devral ve bitir" (seçenek 1)
dedi. Opus iki kapıyı kök nedenle düzeltti, yeni modülleri inceledi, statik kapı ekledi, dalı CLAUDE §4 adına
(`v18.7.15-rc1-mag-endpoint-lock`) çevirdi.

## GPT'nin yaptıkları (Build 1, koddan doğrulandı)
| ID | Ne değişti | Nerede |
|---|---|---|
| D01/D02 | Kullanıcı adı yalnız GERÇEK login alanlarından (`login/username/user_name/user/account/subscriber`). `name/fname/sname` → ayrı `display_name` ("Görünen Ad" satırı). Kart artık MAC'i kullanıcı adı diye göstermez; yoksa "Belirlenemedi". | `stalker.ts pickUsernameField / normalizeStalkerAccountInfo`, `settings.tsx:1898-1899` |
| D03 | Toplu doğrulamadaki `mergeInfo` ortak `mergeStalkerAccountInfo` kullanır (boş/unknown değer dolu değeri ezmez). | `stalker.ts` |
| D04 | MAG `active_cons`, `max_connections`, `allowed_output_formats` normalize edilir. | `stalker.ts normalizeStalkerAccountInfo` |
| D05/D06 | Hesap durumu: aktif / süresi dolmuş / engelli / **bilinmeyen** ayrımı; bağlantı sayısındaki `0` kaybolmaz. | `accountCard.ts`, `settings.tsx` |
| D07 | Ortak katalog hazırlama görünümü `CatalogPreparationModal` (ana ekran, onarım katmanı, düzenleme). Düzenleme modalı İptal + geri tuşu ile durdurulur. İlerleme sayıları `applyCatalogProgress` ile yapılandırılmış taşınır. | `components/CatalogPreparationModal.tsx`, `utils/catalogProgress.ts`, `PlaylistRepairOverlay.tsx`, `edit-playlist.tsx`, `(tabs)/index.tsx` |
| D08 | Tekli MAG ekleme `resolveMagInput` → çözülen endpoint `cred.resolvedPortal` + `endpointPolicy:'exact'` ile KİLİTLENİR (login başka adaya kaymaz). | `utils/magResolveInput.ts`, `add-playlist.tsx:2638` |
| D10/D11 | Kapsam/port: tekli eklemede açık port/yol niyeti `parsePortalHosts` ile okunur; `allowOtherPorts` yalnız `all` veya portsuz girişte. | `magResolveInput.ts`, `magPortalDiscovery.ts` |
| D12 | Profil zenginleştirmede kalan süre transport timeout'una uygulanır. | `stalker.ts` |
| D13 | Host başına ortak bütçe `MagDiscoveryBudget` (deadline + istek sayısı + iptal); pasif faz aynı sayaçtan tüketir. | `utils/magDiscoveryBudget.ts` |
| D14 | Joker yanıtlayıcı (tüm portlara aynı gövde) parmak izi → `wildcard-responder`. | `utils/magResponseFingerprint.ts`, `magPortalDiscovery.ts reachProbe` |
| D15 | Güvenli başlık listesi (`cf-ray`, `cf-mitigated`, `server`…); Cloudflare edge ≠ challenge. | `magResponseFingerprint.ts`, `stalker.ts observeMagProtection` |
| — | Kurulum ailesi kaydı (`classic`/`stalker-portal`/`ministra`) + `xpcom.common.js` METİN olarak çözümlenir (uzak JS asla çalıştırılmaz; yabancı origin/`portal_ip`, `..`, çok katmanlı kodlama reddedilir). | `utils/magEndpointRegistry.ts`, `utils/magClientJsResolver.ts` |

## Opus'un düzelttikleri (kanıtla)
1. **Keşif origin taşması (kapı `test-mag-portal-discovery.js:86`).** Birebir fixture izi: `http://…:8080/stalker_portal/server/load.php`
   zaten seçilebilir API iken, 404 dönen `server/portal.php` ve `portal.php` için **https** varyantları kuyruğa ekleniyordu
   (`https://…:8080/stalker_portal/…` ×3). Düzeltme: alternatif scheme genişletmesi yalnız `!hasSelectable()` iken
   (`magPortalDiscovery.ts` ~310). twoPhaseExpand'in mevcut `!hasSelectable()` kapısıyla tutarlı. "all" kapsamında hiçbir şey
   bulunmadığında https yine denenir (19/19 keşif grubu PASS).
2. **D12 iptalde taşıma kapanışı (kapı `test-v18715-dev1.js:164`).** `reqTransport` her istek için kendi `AbortController`'ını
   (`c`) açıyor, `finally`'de dinleyicileri söküyordu → tamamlanan handshake'in taşıma sinyali, oturum iptal edildiğinde açık
   kalıyordu. Düzeltme: `finally` sonunda `c.abort()`. Güvenli çünkü gövde `await res.text()` ile try içinde tamamen okunur;
   proxy yolu kendi dinleyicisini söker; native-exact sinyal almaz.
3. **Statik kapı** `tools/check-v18715-release.js` (denetime kayıtlı).

## İnceleme notları (Opus)
- Yeni modüllerde `eval`/`new Function` YOK; kimlik bilgisi telemetriye yazılmıyor; TLS doğrulaması kapatılmıyor.
- `stalker.ts`'e eklenen üst düzey importlar (`magEndpointRegistry`, `magDiscoveryBudget`, `magResponseFingerprint`) platform
  bağımsız saf modüllerdir; eski VM kapıları bunları `tools/_mag_pure.js` ile gerçek kaynaktan yükler (§7 tuzağı değil).
- **Davranış değişikliği (bilerek):** hkpremium kartında "Kullanıcı Adı" artık `1787` değil **"Belirlenemedi"**; `1787` ayrı
  **"Görünen Ad"** satırında. Sebep: MAG `get_profile.login` bu portalda boş (v18.7.13 telemetrisi `realLogin=false`×3);
  `1787` portalın `name` alanı, giriş kimliği değil. `ud3B3yRH` Xtream kimliğidir, MAG protokolü vermez.

## Doğrulama (PC)
- `yarn tsc --noEmit` → çıktı yok (exit 0)
- `node tools/denetle.js` → ✅ TÜM DENETİMLER TEMİZ (exit 0)
- `test-mag-portal-discovery.js` 19 grup · `test-v18715-dev1.js` 13 grup · `check-v18715-release.js` PASS
- **Native/Kotlin değişikliği YOK.**

## Cihazda test edilecekler
1. Tekli MAG ekle (portlu `/c/` adresi): bulunan endpoint ile hesap eklenmeli; ekleme sırasında **İptal** ve **geri tuşu** çalışmalı.
2. Playlist düzenle → MAG kaydet: hazırlama penceresi canlı/film/dizi sayılarını göstermeli; İptal/geri tuşu kapatmalı.
3. Hesap kartı: Kullanıcı Adı (gerçek login yoksa "Belirlenemedi"), Görünen Ad, MAC, bağlantı sayısı, formatlar, durum etiketi.
4. Çoklu MAC "Çalışmazsa diğerleri": çalışan http API bulununca https'e boş yere gitmemeli (log: `MAG_DISCOVERY_*`).
5. Bir hesabı eklerken iptal et → sonra aynı hesabı ekle: takılma/çift bağlantı olmamalı.

## Bekleyen (Build 2 ve sonrası, onaysız kodlanmaz)
Canlı/VOD/dizi paralel fetch, adaptif worker, kontrollü DB yazımı, yüzdelik ilerleme; GPT G07–G10; oynatıcı ilk-kare ölçümü.
