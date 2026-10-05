# AI DEVİR — v18.7.16 RC1 (dal `v18.7.16-rc1-bulk-ux-portal-discovery`)

**Tarih:** 2026-10-06 · **Taban:** v18.7.15 `f2b0cc31` · **Yazan:** Claude Opus
**Kaynak:** Kullanıcı cihaz testi (v18.7.15-dev) + DEV tanı logu (goldensm32 çoklu MAC) + MAG Converter aracı incelemesi.

## Kanıtla teşhis (log + kod)
| Bulgu | Kanıt |
|---|---|
| 4 seçili ama 2 ekleniyor | `mag-bulk.tsx` yalnız `category==="valid"` ekliyordu; 76 hesaptan 39 verified, gerisi "verification-time-budget". |
| "190 gün kaldı ama doğrulanamadı" | `STALKER_ACCOUNT_VERIFIED`: `profile-account-identity, live-unavailable, verification-time-budget` — kimlik+bitiş var, içerik örneği 20 sn bütçede gelmedi (çökük host). |
| Portal "all"+turbo bulamıyor | `MAG_DISCOVERY_VERSION_JS enqueued:6` ama `MAG_DISCOVERY_BUDGET_RESULT exhausted:true reason:deadline (6618ms)` → version.js API yolları `queue.push` ile SONA ekleniyor, egzotik portlar bütçeyi tüketiyor, o yollara sıra gelmiyor (valid:0). "fallback" aile-önce olduğu için buluyordu. |
| Ekleme ilerlemesi gözden uzak/yavaş | katalog 151–161 sn (series 16.072); ilerleme küçük metin. |
| Otomatik yenileme kapanmıyor | liste-başı anahtar vardı ama küresel ana anahtar yoktu; yeni hesaplar varsayılan AÇIK. |
| hkpremium kullanıcı adı | MAG `get_profile.login` boş. MAG Converter (readme): Portal+MAC → kullanıcı adı/şifre. Mekanizma: create_link yayın URL'i Xtream `.../kullanıcı/şifre/id.ext` biçiminde. Uygulama URL yapısını kaydetmiyordu. |

## Yapılanlar (A–E + U1–U4)
| Kod | Değişiklik | Dosya |
|---|---|---|
| **A** | Yeni **"probable"** (muhtemel geçerli) kategorisi: doğrulama "unverified" ama `accountIdentity \|\| expiryValid` → eklenebilir. `stalkerVerifyAccount` sonucuna `accountIdentity/expiryValid` eklendi. Ekleme döngüsü probable'ı kabul eder, kart "doğrulanmadı" işaretlenir. UI: "Muhtemel geçerli" çipi/filtresi, "Geçerli + muhtemelleri seç", buton sayacı. | `stalker.ts`, `magBulkScan.ts`, `mag-bulk.tsx` |
| **B** | Toplu ekleme görsel `CatalogPreparationModal` (Canlı/Film/Dizi + süre + iptal); `applyCatalogProgress` ile yapılandırılmış ilerleme. | `mag-bulk.tsx` |
| **C** | **Küresel otomatik yenileme ana anahtarı** (`kizilkan.autoRefresh.global`). Kapalıyken HİÇBİR liste güncellenmez (`FRESHNESS_SKIP_GLOBAL_OFF`). Ayarlarda ayrı kart; liste-başı kart yalnız küresel AÇIK iken görünür. Yeni hesabın ilk içerik yüklemesi bundan bağımsız (açıklama metni). | `PlaylistContext.tsx`, `settings.tsx` |
| **D** | Katalog sayfalama **hız ölçümü**: `STALKER_PAGINATION_STOP` → `elapsedMs/pagesFetched/avgPageMs/concurrency`; `STALKER_PAGINATION_PAGE` → `sinceStartMs`. (İyileştirme bu ölçümden sonra — kör düzeltme yok. Sayfalama zaten paralel.) | `stalker.ts` |
| **E2a** | version.js ile doğrulanan API yolları kuyruğun **önüne** (`unshift`, ters sırayla) — xpcom ile tutarlı. Bütçe dolmadan denenirler. | `magPortalDiscovery.ts` |
| **E2b** | "all" kapsamı **aile-önce** tarar (fallback gibi), sonra tüm portlara genişler (tüketici keşif korunur). | `magPortalDiscovery.ts` |
| **E1** | Keşif sonucu telemetrisi (`MAG_DISCOVERY_RESULT`) artık **deadline/bütçe** yolunda da yazılır (portState'ten türetilir) + bütçe özeti. "Portal bulunamadı" sebebi logda görünür. | `magPortalDiscovery.ts` |
| **U1** | Kullanıcı adı alanında **dolgulu base64** çözme (`decodeBase64Username`). Dolgu ('=') kuvvetli base64 sinyali; padding'siz değerler ham kullanılır (normal kullanıcı adı bozulmaz). Ham base64 asla gösterilmez. | `stalker.ts` |
| **U2** | `get_profile`/`get_main_info` **alan biçim telemetrisi**: her alan için `{f, b:base64?, t:çözülünce metin?, m:MAC?}` — DEĞER YOK. Kullanıcı adı gizli/base64 alanda mı kanıtlanır. | `stalker.ts` |
| **U3** | create_link **yayın URL yapı telemetrisi**: parça sayısı, her parçanın uzunluk/tip, Xtream kalıbı mı, host portaldan farklı mı — DEĞER YOK. | `stalker.ts` |
| **U4** | Xtream-şekilli URL'den (`.../kullanıcı/şifre/sayısal-id`) kullanıcı adı/şifre **çıkarılır**, host'a göre modül-içi haritada tutulur, hesap kartında gösterilir (kullanıcının kendi hesabı). Değerler **loglanmaz** (yalnız `streamCredsFound`+uzunluk). Kart `getStreamDerivedCredentials` ile okur; bir kanal açıldıktan sonra dolar. | `stalker.ts`, `settings.tsx` |

## Güvenlik
- U2/U3/U4 telemetrisi yalnız biçim/uzunluk/boolean — kimlik DEĞERİ yazılmaz (kapıda kontrol edildi).
- U4 kart gösterimi kullanıcının KENDİ hesabı içindir (IPTV Smarters gibi). TLS doğrulaması kapatılmadı.
- `stalker.ts`/`magPortalDiscovery.ts`'e üst düzey platform importu eklenmedi (§7).
- **MAG Converter (JAR) disassemble edilmedi** — otomatik mod güvenlik denetimi engelledi; gerek de olmadı (yöntem `readme`'den + uygulamanın kendi create_link'inden doğrulandı).

## Doğrulama (PC)
- `yarn tsc --noEmit` → çıktı yok (exit 0)
- `node tools/denetle.js` → ✅ TÜM DENETİMLER TEMİZ (exit 0)
- Yeni kapı `check-v18716-release.js` PASS. Kırılan 3 kapı düzeltildi: `check-v18709` (`openPorts:` literali), `test-mag-action-ownership` + `test-mag-bulk-runtime` (addValid girdileri `selectedAddable`/yeni setter'lar).
- **Native/Kotlin değişikliği YOK (tümü TS).**

## Cihazda test edilecekler
1. **Portal keşfi:** goldensm32'yi **"Tüm adaylarda keşif" + otomatik** ile dene → portal bulunmalı (E2a/E2b). Bulunamazsa log'da `MAG_DISCOVERY_RESULT` artık açık portları/adayları/bütçeyi gösterir (E1).
2. **Muhtemel geçerli:** doğrulanamayan ama bitişi olan hesapları seç → "Geçerli + muhtemelleri seç" → eklenebilmeli.
3. **Görsel ekleme:** ekleme sırasında büyük modal (Canlı/Film/Dizi + süre + iptal).
4. **Otomatik yenileme:** Ayarlar → "Otomatik Yenileme (Tümü)" KAPALI → listeye girince güncelleme OLMAMALI (log: `FRESHNESS_SKIP_GLOBAL_OFF`).
5. **Kullanıcı adı:** hkpremium'da bir kanal aç → Ayarlar → hesap kartı: Kullanıcı Adı/Şifre yayın adresinden dolmalı mı? Dolmazsa log'da `STALKER_RESOLVE_DONE.streamShape` + `streamCredsFound` yapıyı gösterir (U3) → sonraki adım.
6. **Katalog hızı:** log'da `STALKER_PAGINATION_STOP.avgPageMs` ile darboğaz görülür (D).

## Bekleyen
U4 cihazda kanıtlanınca (streamCredsFound=true) kalıcılaştırma (playlist accountInfo'ya yazma); katalog hız iyileştirmesi (ölçümden sonra); GPT G07–G10.
