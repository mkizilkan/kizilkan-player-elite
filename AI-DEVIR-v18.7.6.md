# AI DEVİR — v18.7.6 RC1 (MAG hesap doğrulama + bayat-oturum + handshake bütçesi + port-öncelikli keşif + canlı sonuç + yenileme ilerlemesi)

**Taban:** `v18.7.5-rc1-media3-audio-telemetry` (3b27130c). **Dal:** `v18.7.6-rc1-mag-scan-fixes`.
Kullanıcı (Mustafa) onayı: "1 (MAG: C+D1+D2) ile 3 (Tarama: A1–A4+B) beraber, aynı build, hatasız ve eksiksiz."

## Kanıt (log 18.7.5 `bd59c11d-...` 6000 olay/55 saat + v18.7.1 geriye karşılaştırma)
- **D1 regresyonu (kesin):** `profilePayload` toleranslı (`meaningfulKeys`) idi → **v16.14.4 (ab94fae3)**'ten **v18.7.3**'e kadar bitiş okunuyordu. **v18.7.4 (5c632025)** katı `hasAccountIdentity`'ye çevirince, bitiş+MAC taşıyan ama pozitif id/login'i olmayan profiller "boş" sayıldı → `STALKER_PROFILE_VARIANT_EMPTY ×10`, bitiş "Bilinmiyor". Pickaxe (`git -S`) ile doğrulandı.
- **C:** `STALKER_RESOLVE_ERROR`: "create_link boş" **cacheHit:true**; `STALKER_PLAYBACK_SOURCE_RENEW status:403`. Boş-link mesajı auth desenine uymadığı için taze handshake'e düşülmüyordu.
- **D2:** `ANR_WATCHDOG_STALL` — `mag:handshake` sırasında **lagMs 212789** (212 sn), görev yaşı 19 dk; `mag:catalog-vod` lagMs 43747/28419; `_system.totalPssKb ~788MB`. Ön planda (`_fg:true`).

## Yapılan değişiklikler (dosya bazında)

### Grup 1 — MAG/Stalker
- **D1 — `src/utils/stalker.ts`:**
  - `hasDisplayableAccountFields()` eklendi; `profilePayload` artık bununla **toleranslı** kabul eder (v16.14.4–18.7.3 davranışı). Katı `hasAccountIdentity` toplu taramanın "geçerli/değil" gate'inde AYNEN korunur (gösterim ≠ doğrulama ayrımı).
  - `stalkerAccountSnapshot(cred, ses, profile)` eklendi: Xtream `get_account_info` karşılığı **bounded** `account_info&get_main_info` ile OTORİTER durum/bitiş; ağ/erişim başarısızsa profile zarifçe düşer. `STALKER_ACCOUNT_SNAPSHOT(_FALLBACK)` telemetrisi.
  - Ekleme `app/add-playlist.tsx`, yenileme `src/utils/refreshPlaylist.ts`, elle güncelleme `app/edit-playlist.tsx` → snapshot kullanır; **boş sonuç eldeki iyi bitişi EZMEZ** (merge). Refresh capability yaması artık `accountInfo` taşır (önceden hiç yazmıyordu → "elle güncelleyince bile bozulma" nedeni buydu).
- **C — `stalker.ts` `stalkerResolveStream`:** `cacheHit && !refreshed` iken boş-link ("create_link boş / yayın adresi vermedi") de bayat-oturum sayılır → BİR KEZ `forceFresh`. `STALKER_RESOLVE_STALE_RETRY` telemetrisi. Tek upstream korunur.
- **D2 — `stalker.ts`:** `HANDSHAKE_WALL_BUDGET_MS=90_000` duvar-saati bütçesi (endpoint + profil döngülerinde `overBudget()` kontrolü; aşılırsa `STALKER_HANDSHAKE_BUDGET_STOP`). `stalkerCatalogYield` aralığı **80→32** (senkron parça küçülür, GC nefes alır, ANR gecikmesi düşer).

### Grup 3 — Tarama
- **A4 — `src/utils/magBulk.ts` + `magPortalDiscovery.ts`:** `discoveryPortsFor()` + `portalDiscoveryCandidates({ports})`. Keşifte **ölü port budama**: yol turunda bağlantı reddi/zaman aşımı alan port `dead` işaretlenir, sonraki yollarda atlanır (`MAG_DISCOVERY_PORT_DEAD/SKIP`). 57×14 kartezyen → ~57 + (açık port×14).
- **A4 hız — PARALEL PORT ERİŞİLEBİLİRLİĞİ (`reachableOpenPorts`):** port BİLİNMEYEN gerçek keşifte, tüm portlar **paralel ve gate'siz** (her port ayrı TCP ucu; portal API'si değil → ban riski yok) "/" ile denenir; yalnız **açık portlarda** yol/API denemesi mevcut aralıklı/protection-aware gate ile yapılır. 57 portu sırayla 650 ms aralıkla (~37 sn) denemek yerine tek timeout penceresi. Kullanıcı port verdiyse paralel ön-tarama YAPILMAZ (normal gated sweep; ban-güvenli). `MAG_DISCOVERY_PORT_SCAN` telemetrisi; `onStage` "N port paralel taranıyor" + "açık portlar: …".
- **A3 — `magPortalDiscovery.ts` + `magBulkScan.ts`:** `emitLive()` ile aday bulundukça rapor **canlı yayınlanır**; `onHost` host-başına **upsert** (çift blok yok) → UI anında dolar.
- **A2 — `app/mag-bulk.tsx`:** tarama boyunca native `setKeepScreenOn(true)` (bitince/çıkışta false). Cihaz uykusunun taramayı kesmesini azaltır. **NOT:** gerçek arka plan (home tuşu) yürütmesi için MAG taramasını mevcut `PanelScanService` ön-plan servisine bağlamak AYRI/sonraki iştir (bu build'de native servis değişikliği yapılmadı).
- **B — `src/store/PlaylistContext.tsx`:** tekli MAC/portal `checkFreshness` → `refreshPlaylistKinds`'a gerçek `progress` geri-çağrısı; aşama + kategori sayısı `freshnessStatus`'a akar ("Güncellik kontrol ediliyor…" artık canlı).

## Doğrulama (PC)
- `yarn tsc --noEmit` → **temiz (exit 0)**.
- `node tools/check-v18706-release.js` → **PASS**.
- `node tools/test-mag-portal-discovery.js` → **PASS, 14 grup** (yeni: port-first paralel reachability).
- `node tools/test-mag-account-validation.js` → **PASS, 9 grup** (bare device/id:0/blocked:0/name → null korunur).
- `node tools/denetle.js` → **TÜM DENETİMLER TEMİZ (exit 0)**.
- `assembleDebug` (DEV) → (sonuç güncellenecek).
- Kapı: `tools/check-v18706-release.js`; `denetle.js`'e kaydedildi.

## Cihazda doğrulanacak (kanıt gerek — "build geçti = çalışıyor" DEĞİL)
1. **D1/hesap:** MAG hesaplarında **bitiş tarihi** görünüyor mu (hem yeni ekleme hem elle güncelleme); `STALKER_ACCOUNT_SNAPSHOT mainInfoOk` logda.
2. **C:** 18.7.4'te açılan ama 18.7.5'te açılmayan kanal artık açılıyor mu; `STALKER_RESOLVE_STALE_RETRY` sonrası başarı.
3. **D2:** MAG ekleme/güncelleme sırasında ön-plan `ANR_WATCHDOG_STALL` düştü mü; `STALKER_HANDSHAKE_BUDGET_STOP` gerekiyorsa.
4. **A4/A3:** keşif hızlı mı; "açık portlar" + bulunan yollar anında görünüyor mu; `MAG_DISCOVERY_PORT_DEAD` sayısı.
5. **A2:** tarama ekran açıkken kesintisiz mi.
6. **B:** tekli portal eklemede listede canlı ilerleme görünüyor mu.

## Önemli tuzaklar (bu sürümde öğrenilen/korunan)
- **Gösterim ≠ doğrulama.** Profil "boş sayma" katılığını hesap-geçerlilik gate'iyle birleştirme → bitiş kaybolur (v18.7.4 hatası). Toleranslı okuma + ayrı API doğrulaması.
- **`setKeepScreenOn` native zaten var** (KizilkanNativeCoreModule.kt:959, index.ts:335) — yeni native paket/fonksiyon eklenmedi.
- Boş create_link bir auth hatası gibi status taşımaz; kurtarma koşulu mesajı da kapsamalı.
