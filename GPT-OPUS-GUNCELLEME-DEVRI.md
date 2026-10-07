# GPT DEVİR — KIZILKAN PLAYER ELITE (güncel durum ve talimatlar)

**Son güncelleme:** 2026-10-07, Claude (Opus) oturumu — v18.7.24'e kadar güncel + **v18.7.25 KATALOG HIZ PLANI** (aşağıda, onay bekliyor). Bu dosya, token/bağlam azaldığında
başka bir yapay zekânın (GPT) işi kaldığı yerden sürdürmesi için yazıldı. Önce `CLAUDE.md`'yi (özellikle §2 çalışma
sözleşmesi, §3 doğrulama, §4 sürüm/dal, §5 mimari, §7 tuzaklar, §8 log analizi) oku; aşağıdakiler ona EKtir.
**EN GÜNCEL DURUM aşağıda "## 0. GÜNCEL (v18.7.16–v18.7.23)" bölümünde.**

## 0. GÜNCEL DURUM (v18.7.16 → v18.7.23) — EN ÖNEMLİ BÖLÜM

**Dal zinciri (her biri bir öncekinin dalından):** v18.7.15 → v18.7.16 → v18.7.17 → v18.7.18 → v18.7.19 `v18.7.19-rc1-stream-creds-persist` → v18.7.20 `v18.7.20-rc1-catalog-speed-vod-class` → v18.7.21 `v18.7.21-rc1-addtime-user-xtparallel-m3u` → v18.7.22 `v18.7.22-rc1-vod-series-classification` → **v18.7.23 (AKTİF) `v18.7.23-rc1-card-autoprime-autotest`**.

- **v18.7.20** (katalog hızı + filmler teşhisi): MAG katalog `PAGE_CONCURRENCY` 6→**20**, `PAGE_BUDGET_MS` 75→100 sn, sayfa sınırı 600→2000, salt-okunur `get_ordered_list`. `STALKER_VOD_PARTITION` telemetrisi (hangi ölçüt kaç öğeyi diziye attı). Ayrıntı `AI-DEVIR-v18.7.20.md`.
- **v18.7.21** (A+B+C+D — NATIVE): A) ekleme anında `stalkerPrimeStreamCredentials` (ilk kanalın create_link'inden kullanıcı adı/şifre, oynatmasız); B) Xtream combo özel paralellik (1–250, girilen=çalışan); C) kartta Xtream M3U get.php linki üret+kopyala+görüntü testi; D) genel `ForegroundKeepAliveService` (native, dataSync) — MAG tarama/ekleme/güncelleme arka planda sürer. **assembleDebug BAŞARILI.** Ayrıntı `AI-DEVIR-v18.7.21.md`.
- **v18.7.22** (filmler kayboldu): cihaz `STALKER_VOD_PARTITION` kanıtı — portal filmlere de BOŞ `series:[]` koyuyor, `rowLooksSeries` koşulsuz dizi sayıyordu → `v.series.length > 0`. Ayrıntı `AI-DEVIR-v18.7.22.md`.
- **v18.7.24 (AKTİF)** (çoklu ekleme seçim ekranı görüntü var/yok + süzme): Xtream+MAC çoklu eklemede bulunan hesap kartlarında "görüntü var/yok". **Dürüst sinyal:** MAG `liveCount` doğrulama anında zaten var → ücretsiz/otomatik (kartta `📺 Görüntü: VAR · N kanal`, süzme "Görüntü olanlar", seçim "Görüntü olanları seç"); Xtream tarama içerik çekmez → **istek üzerine** "Görüntü Test Et" butonu (6 paralel `get_live_streams` probe'u, 15 sn timeout, iptal edilebilir) → kartta rozet + "Görüntü Olanları Seç". Telemetri `BULK_CONTENT_TEST_START/DONE`. Yalnız TS (`mag-bulk.tsx`, `add-playlist.tsx`), native YOK. Ayrıntı `AI-DEVIR-v18.7.24.md`.
- **v18.7.23** (kart oto-prime + görüntü oto-testi): Cihaz kanıtı — hkpremium **manuel güncellendi**, kullanıcı adı yine "Belirlenemedi" (v18.7.21 A yalnız yeni eklemede çalışıyordu). Düzeltme: `AccountInfoCard` `useFocusEffect` — MAG hesabında kullanıcı adı yoksa + hesap başına bir kez (`primeTriedRef`), Room'dan BİR canlı kanal (`queryItems(id,"live",{limit:1})`) alınıp `stalkerResolveStream(..., ch.url)` ile create_link OYNATMASIZ çözülür → kullanıcı adı türetilip kalıcılaştırılır, kart yenilenir. Ayrıca `m3uLink` hazır olunca görüntü testi `autoTestedRef` ile OTOMATİK çalışır. **Yalnız TS (`settings.tsx`), native YOK.** Ayrıntı `AI-DEVIR-v18.7.23.md`.

**Dal zinciri (eski not):** v18.7.15 `v18.7.15-rc1-mag-endpoint-lock` → v18.7.16 `v18.7.16-rc1-bulk-ux-portal-discovery` → v18.7.17 `v18.7.17-rc1-discovery-copy-update` → v18.7.18 `v18.7.18-rc1-backup-drive` → v18.7.19 `v18.7.19-rc1-stream-creds-persist`.
**Cihaz:** OnePlus 7 Pro `c3a4097e`. DEV paket `com.gpt.kizilkan.player.dev`. Her sürüm DEV APK adb ile kuruldu (`adb install -r`, ~460 MB). Release güncelleme SORUNU: telefondaki release imza anahtarı Actions Secrets anahtarından farklı olabilir (açık konu) → "Uygulama yüklenmedi"; test DEV'de yapılıyor.
**Her sürüm:** PC doğrulandı (tsc temiz + `node tools/denetle.js` TÜM TEMİZ + `check-v<kod>-release.js` PASS), commit+push, Actions `release` tetiklendi, yerel DEV APK derlendi. Native değişiklik YOK (hepsi TS) — v18.7.16-19 arası.

- **v18.7.16** (toplu UX + portal keşfi + kullanıcı adı): A) "probable" kategorisi (kimlik+bitiş var, içerik örneği yok → eklenebilir); B) toplu ekleme görsel `CatalogPreparationModal`; C) küresel otomatik yenileme ana anahtarı (`FRESHNESS_SKIP_GLOBAL_OFF`); D) katalog sayfalama hız ölçümü (`STALKER_PAGINATION_STOP.avgPageMs`); E) portal keşfi version.js yolları öne (`unshift`) + "all" aile-önce + deadline'da keşif telemetrisi; U1-U4 kullanıcı adı (base64 çözme, alan biçim telemetrisi, **U4: Xtream-şekilli yayın URL'inden kullanıcı adı/şifre çıkarma+kartta gösterme**). Ayrıntı `AI-DEVIR-v18.7.16.md`.
- **v18.7.17** (keşif + kopyala + güncelleme): P1) portal version.js/xpcom doğrulanınca `MagDiscoveryBudget.grant(6000)` → API yolları deadline'dan önce denenir (çoklu+DNS "bulamadı" düzelir); P2) exact + arayüz yolu `/c` → aynı kurulumda API çözülür; P3) paralellik 1–100 (girilen=çalışan, `MAG_MAX_PARALLEL` 16→100); K1) kart kullanıcı adı önce U4 değeri; K2) kart+düzenleme kopyala butonları (expo-clipboard); E1) tekli MAG eklemede görsel modal; G1) **yıkıcı diff koruması** (`MAG_REFRESH_SHRINK_GUARD`: auto refresh'te eksik çekilen tür Room'u yarıdan aza düşüremez); S1) Flight Recorder sil bildirimi; M1) `APP_COLD_START` ölçümü. **Cihaz kanıtı: U4 ÇALIŞTI** — hkpremium yayın URL'i `.../ud3B3yRH(8)/şifre(10)/id`, `streamCredsFound:true`. Ayrıntı `AI-DEVIR-v18.7.17.md`.
- **v18.7.18** (yedek + Drive): B1) tam yedekte yetim/boş-kabuk playlist (`queryItems` IllegalStateException) TÜM yedeği düşürmez — o tür atlanır (`chunk-error`/`BACKUP_KIND_SKIPPED`), yedeğe devam (bu hata TÜM eski sürümlerde vardı); G1) Google Drive OAuth Client ID uygulama içinde girilir (env zorunlu değil), Yedekleme ekranı → redirect URI kopyala → Console'a ekle → Client ID yapıştır → "Giriş yap ve Yükle" tarayıcı OAuth. Storage `kizilkan.googleDrive.clientId`, açılışta `hydrateGoogleDriveConfig`. Redirect scheme `kizilkan-gpt` (eski yanlış `'frontend'` kaldırıldı). Ayrıntı `AI-DEVIR-v18.7.18.md`.
- **v18.7.19 (AKTİF)** (U4 kullanıcı adı görünmüyor düzeltmesi): **Kök neden log'dan KANITLANDI** — `STALKER_RESOLVE_DONE.streamCredsFound=true` (çıkarma çalışıyor) ama kart `magDerived` bir `useMemo`'ydu ve Ayarlar sekmesi mount kaldığından oynatmadan sonra yeniden okumuyordu → "Belirlenemedi". Düzeltme: (1) kart `state + useFocusEffect` ile ekrana her dönüşte yeniden okur [ASIL]; (2) türetilen kimlik storage'da (`kizilkan.streamCreds`) saklanır + açılışta `hydrateStreamDerivedCredentials` [kalıcılık]; (3) MAC-only yedek key. Değerler loglanmaz. Ayrıntı `AI-DEVIR-v18.7.19.md`.

**CİHAZDA TEST BEKLEYEN (v18.7.24-dev — tek APK iki sürümü içerir):** (a) hkpremium kartını aç (oynatMADAN) → Kullanıcı Adı `ud3B3yRH` + "✓ Görüntü var · N kanal" OTOMATİK gelmeli (v18.7.23); (b) MAG çoklu tarama kartlarında "📺 Görüntü: VAR · N kanal / Yok" + "Görüntü olanlar" süzme + "Görüntü olanları seç" (v18.7.24); (c) Xtream combo "Görüntü Test Et" → rozet → "Görüntü Olanları Seç" (v18.7.24); (d) filmler Film sekmesinde (v18.7.22); (e) arka plan keep-alive (v18.7.21 D).
**DEV APK (iki sürüm birlikte):** `frontend/android/app/build/outputs/apk/debug/app-debug.apk` (v18.7.24, ~460 MB). Kurulum `adb install -r <yol>`.

---

## 0.1 — v18.7.25 PLANI: KATALOG HIZI (MAG Film/Dizi Xtream-first) — **ONAY BEKLİYOR, KODLANMADI**

**Kullanıcı şikayeti (2026-10-07, ekran görüntüsü):** hkpremium eklerken modal "Geçen süre: **17:35** · Aktif işlem" — Canlı 2.795 doğrulandı, Film **12.603** (başlıkta 16.243 → %78, bütçeye takıldı), Dizi 5.373. **IPTV Extreme Pro aynı hesabı 5-10 saniyede ekliyor.** Kullanıcı "kodlamadan bilgi ver" dedi → teşhis yapıldı, KOD YAZILMADI.

**KANITLANMIŞ kök neden (koddan):**
- Canlı HIZLI: `get_all_channels` = **tek** istek (`stalker.ts` ~1877). 2.795 anında.
- Film/Dizi YAVAŞ: `stalkerEnrichment` → `stalkerOrderedList(cred,ses,"vod"/"series")` = Stalker `get_ordered_list`, **sayfa başı 14 öğe** (`stalker.ts` ~2550-2711, `expectedPageLimit(total,14)`). Bu hesap: Film ~1.160 sayfa + Dizi ~680 sayfa = **~1.840 HTTP isteği**. 20 paralel + tür başına 100 sn bütçe (PAGE_CONCURRENCY=20, PAGE_BUDGET_MS=100000) ile bile DAKİKALAR ve EKSİK (12.603/16.243).
- **IPTV Extreme neden hızlı:** bu paneller **Xtream-tabanlı** (U4 kanıtı: `create_link` = `.../kullanıcı/şifre/id.ext` = Xtream yayın URL'i). O uygulama panelin Xtream API'sini kullanıyor: `get_vod_streams` + `get_series` = **2 tek-çağrı**, tüm katalog bir yanıtta. 2 istek vs ~1.840.

**ÖNERİLEN ÇÖZÜM (v18.7.25):** MAG hesabı Xtream-tabanlıysa Film/Dizi'yi sayfalama yerine **Xtream tek-çağrı** ile çek → ~1.840 istek **2'ye** iner, 17 dk → saniyeler, hem TAM liste. Saf-Stalker paneller için `get_ordered_list` YEDEK kalır (probe: get_vod_streams boş/hatalıysa sayfalamaya düş).
- **Altyapı HAZIR:** (1) Xtream kullanıcı adı/şifre MAG hesabından türetiliyor + saklanıyor (`kizilkan.streamCreds`, v18.7.19 + ekleme anında `stalkerPrimeStreamCredentials` v18.7.21 A); (2) `xtreamVod`/`xtreamSeries` tek-çağrı fonksiyonları var (`iptv.ts` 448/493), add-playlist'e import'lu (satır 34); (3) sunucu origin U4'ten.
- **ASIL İŞ (dikkat — §5 mimari):** Xtream'le çekilen film/dizi **Xtream stream ID** taşır → oynatma `create_link` yerine **Xtream yayın URL'inden** gitmeli (creds elde var; U4 bunun çalıştığını gösterdi). Oynatma kimlik eşlemesi dikkatli bağlanmalı — 5 dk'lık değişiklik DEĞİL, gerçek plan ister. "Tek upstream/1 kullanıcı" (§5) BOZULMAZ, iyileşir (2 sıralı istek < 20 paralel sayfa).
- **Açık soru (kullanıcıya soruldu, yanıt bekliyor):** enrichment arka planda mı (canlı 17 dk boyunca izlenebilir mi) yoksa modal blokluyor mu? `add-playlist.tsx` ~2755 `initialSyncState:"enriching"` arka plan niyeti ama modal görünüyor.

**PLAN ONAYI BEKLEYEN (eski):** (kapsandı — v18.7.24'te yapıldı).

**ONAYLI AMA KODLANMAMIŞ — SIRADAKİ BÜYÜK İŞ:** Arka planda çalışma (çoklu arama/ekleme/güncelleme app arkadayken). Plan `AI-DEVIR` + sohbet: **Xtream çoklu ve panel ZATEN native foreground service kullanıyor** (`BulkPlaylistImportService.kt`, `PanelScanService.kt`); **MAG çoklu tarama/ekleme ve güncelleme saf JS** → arka planda duruyor. Önerilen yaklaşım A: genel "canlı tut" ön plan servisi (`startForegroundKeepAlive`/`stop`), Android 14 için `foregroundServiceType=dataSync`+izin; JS işi başında başlat/bitince durdur. **Native iş → prebuild+assembleDebug+cihaz testi şart.** Kullanıcı planı gördü, onayı bekliyor.

**DİĞER BEKLEYEN:** release imza anahtarı eşitleme (`tools/imza-bul.ps1`); katalog/açılış hız (ölçüm var, iyileştirme kanıttan sonra, §5 ban riski); GPT G07-G10.

## 1. Çalışma kuralları (harfiyen)
- **Önce PLAN sun, kullanıcı onaylayınca kodla.** Kör düzeltme yok: her sorunu önce log + kod ile KANITLA.
- **Doğrulama (PC, her değişiklikten sonra):** `cd frontend && yarn tsc --noEmit` (çıktı yok) → `cd .. && node tools/denetle.js` (✅ TÜM DENETİMLER TEMİZ / exit 0). Geçmeden commit/push YOK.
- **Sürüm:** beş alan birlikte (`frontend/app.json`: version, ios.buildNumber, android.versionCode=major*10000+minor*100+patch, extra.kizilkanReleaseLabel="GPT ELITE v<sürüm> RC1"; `frontend/package.json`: version). Etiket soneki DAİMA **RC1**. Her sürüm yeni dal: `v<sürüm>-rc1-<konu>`.
- Her sürüme `tools/check-v<kod>-release.js` gate + `tools/denetle.js` kaydı + `AI-DEVIR-v<sürüm>.md` + `CLAUDE.md §9` güncellemesi.
- **CLAUDE §7 TUZAĞI (bu oturumda tekrar yaşandı):** `stalker.ts` ve `magPortalDiscovery.ts` sahte-`require` VM testleriyle koşuyor → bu dosyalara **üst düzey import EKLEME**. Yeni modülleri `await import` ile **tembel** yükle (örnek: v18.7.12 `loadHostFailover()`).
- **Native (Kotlin) değişmedi** (v18.7.9–v18.7.12 tümü TS). Native'e dokunursan `expo prebuild` + `gradlew assembleDebug` şart.
- Commit attribution satırı oturuma göre değişiyor; kullanıcının verdiği EN SON reminder'daki `Co-Authored-By` satırını kullan.

## 2. Mevcut durum (TARİHÎ — GÜNCEL DURUM İÇİN "## 0" BÖLÜMÜNE BAK; aşağısı v18.7.12 anındaki durumdur)
- **Dal:** `v18.7.12-rc1-mag-ip-failover`. **Son commit:** `5d9e3b2f` (v18.7.12). Taban zinciri: v18.7.10 `6910a934` → v18.7.11 `1efefcfc` → v18.7.12.
- **Cihaz:** OnePlus 7 Pro, `c3a4097e`. DEV paket `com.gpt.kizilkan.player.dev` ("KIZILKAN DEV"), debuggable. Release paket `com.gpt.kizilkan.player` (debuggable DEĞİL).
- Telefonda kurulu: **18.7.12-dev**. Cihazda Özel DNS `DNS.google` yapıldı (kullanıcı ayarladı).

## 3. Bu oturumda tamamlananlar (PC doğrulandı + kısmen cihaz)
- **v18.7.11 — MAG profil-uyumluluk:** MAG320 `get_profile` minimal BOŞ dönerse dolu-parametreli MAG254/MAG250 varyantlarına düşer; `stalkerVerifyAccount` kimlik yoksa canlı erişimle "verified" (boş profil ama 21266 kanal). Kullanıcı adı telemetrisi (`usernamePresent/usernameFieldKind`, redaksiyona takılmaz). Keşif duvar-saati bütçesi (19 dk → ≤4 dk, `DISCOVERY_BUDGET_STOP`). Ayrıntı `AI-DEVIR-v18.7.11.md`.
- **v18.7.12 — MAG çoklu-IP DNS failover (`frontend/src/utils/magHostFailover.ts`):** Cihaz kanıtı: goldensm32.xyz 5 A kaydı, yalnız `172.110.220.225` canlı; sistem DNS ölü IP veriyor → 6 sn timeout. DoH (dns.google→cloudflare) ile tüm A kayıtları → canlı IP yoklanıp **pin** → bağlantı IP'ye (Host=hostname), finalUrl `logicalUrl` ile hostname'e çevrilir. Yalnız http, yalnız RN ortamında aktif. `stalker.ts req()` (düz fetch + exactFetch) ve `magPortalDiscovery raw()` TEMBEL importla bağlı. **CİHAZDA KANITLANDI:** `MAG_HOST_IP_FAILOVER goldensm32 A=5` sonrası handshake'ler artık BAŞARILI (önce hepsi timeout). Ayrıntı `AI-DEVIR-v18.7.12.md`.

## 3a. v18.7.15 — GPT Build 1 Opus tarafından TAMAMLANDI (2026-10-05)
- **Dal:** `v18.7.15-rc1-mag-endpoint-lock` (GPT'nin `v18.7.15-dev1` yerel dalı yeniden adlandırıldı; uzakta hiç yoktu). **Taban:** v18.7.14 `4dc91551`.
- GPT'nin D01–D15 kodu korunarak alındı; Opus iki kırık kapıyı kök nedenle düzeltti:
  1. `frontend/src/utils/magPortalDiscovery.ts` ~310: alternatif scheme (http↔https) genişletmesine `!hasSelectable()` eklendi.
     Kanıt: fixture izinde http `load.php` seçilebilirken 404 `portal.php` yolları için 3 https isteği → origin taşması (`test-mag-portal-discovery.js:86`).
  2. `frontend/src/utils/stalker.ts` `reqTransport` finally: `c.abort()` (D12). Kanıt: `test-v18715-dev1.js:164` tamamlanan handshake taşıma sinyali iptalde açık kalıyordu.
- Yeni statik kapı `tools/check-v18715-release.js` (denetime kayıtlı). Doğrulama: tsc temiz, denetle TEMİZ, keşif 19 grup, DEV1 13 grup.
- Commit/push/Actions ve DEV APK sonuçları `AI-DEVIR-v18.7.15.md`'ye yazılır. Cihaz testi bekliyor (liste aynı dosyada).
- Bekleyen: Build 2 (paralel katalog/adaptif worker/DB yazımı/yüzde), G07–G10, oynatıcı ilk-kare ölçümü.

## 3b. v18.7.13'te YAPILANLAR (dal `v18.7.13-rc1-exact-scope-username-mac`, PC doğrulandı, cihaz bekliyor)
Aşağıdaki P1/P2'lerin KODU YAZILDI (ayrıntı `AI-DEVIR-v18.7.13.md`):
- **#1 Manuel portal seçimi:** "ben seçeyim"de iz adaylar seçilebilir; seçim fazı terminal-olmayan iz raporunda açılır; seçim handshake ile doğrulanır.
- **#2 Kullanıcı adı:** gerçek login yoksa dolu-parametre get_profile (bütçe 2), login tercih edilir. Hedef hkpremium `ud3B3yRH`.
- **#3 A01:** `accountMatchesMac` base64 MAC çözer.
- **#4 "Yalnız girilen" (exact) KATİ:** yalnız girilen port+yol; family/version.js/iki-aşama yok.
Cihazda doğrulanacak: hkpremium kullanıcı adı `ud3B3yRH` mı; "ben seçeyim" seçim çalışıyor mu; goldensm32 base64 mismatch düzeldi mi; exact tek endpoint mi deniyor.

## 3c. v18.7.14'te YAPILANLAR (dal `v18.7.14-rc1-verify-username-scope`, PC doğrulandı, cihaz bekliyor)
GPT v18.7.13 incelemesi (G01-G06) + back-trap kodlandı (ayrıntı `AI-DEVIR-v18.7.14.md`):
- **A** MAG ekleme modalı iptal edilebilir (abort + İptal butonu). **G01** çoklu doğrulama get_all_channels yedeği.
- **G02** gerçek login main-info görünen-adıyla ezilmez. **G03** base64-MAC decode'dan önce elenir.
- **G04** enrichment gerçek bütçe (her deneme + deadline). **G05** exact portsuz da kati + HTML-link/soft-404 kapalı. **G06** snapshot main-info MAC/boş otorite.
Kalan GPT maddeleri: **G07** (keşif handshake yalnız ilk profil), **G08** (fazlar arası ortak deadline/sayaç; M09 kısmi), **G09** (oynatma gecikmesi ölçümü), **G10** ("katalog erişimi ≠ ilk kare" etiket ayrımı). GPT K07-K10 fixture'ları eklenecek.

## 4. BEKLEYEN İŞLER (öncelik sırası — hiçbiri onaysız kodlanmaz)

### P1 — "Ben seçeyim" (manuel portal) seçimi çalışmıyor  [cihaz kanıtı: kullanıcı ekran görüntüsü 2026-10-04]
Kullanıcı "ben seçeyim" seçse de bulunan portal/API yolları **tıklanınca seçilmiyor**.
- **Kök:** `frontend/app/mag-bulk.tsx:589` aday butonu `disabled = report.state !== "ready" || !candidate.selectable || scanPhase !== "selection" ...`. goldensm32'de bulunan adaylar "portal izi" = **`selectable:false`** (v18.7.10 M05: marka-izi/version.js non-selectable yapıldı) → hepsi devre dışı.
- **Ayrıca** `runMagBulkScan` (`frontend/src/utils/magBulkScan.ts`) seçim fazına yalnız `reports.some(selectablePortalCandidates>0)` ise giriyor; yalnız non-selectable iz varsa `selectPortals` HİÇ çağrılmıyor → picker açılmaz.
- **Çözüm önerisi:** Manuel modda kullanıcı NON-selectable izleri de seçebilsin; seçtiği endpoint'te handshake doğrulaması yapılsın (seçim = aday, doğrulama handshake'le). UI disabled koşulundan `!candidate.selectable`'ı manuel modda kaldır; selection fazını manuel modda her zaman tetikle. GPT A02/M05 güvenliğini koru: seçim ≠ doğrulama; gerçek handshake/hesap kanıtı şart.

### P1 — hkpremium kullanıcı adı yanlış (gerçek login gelmiyor)  [cihaz kanıtı: IPTV Extreme Pro ekran görüntüsü]
Kart "1787" gösteriyor; **gerçek kullanıcı adı `ud3B3yRH`** (şifre `fcTwy5ykkP` — IPTV Extreme Pro Xtream kartı; aynı abonelik).
- **Kök:** hkpremium `get_profile` MINIMAL yanıtında `login` BOŞ, yalnız `name=1787`. Telemetri: `usernameFieldKind=name, loginValuePresent=false`. v18.7.11 dolu-parametre varyantı yalnız profil TAMAMEN boşsa deneniyor; hkpremium'da profil boş değil (name var) → gerçek login hiç istenmiyor.
- **Çözüm önerisi (`frontend/src/utils/stalker.ts` `stalkerProfile`/`initialProfileVariants`):** Profil kabul edilse bile `login`/kullanıcı adı eksikse dolu-parametreli (`sn/stb_type/image_version/ver`) `get_profile`'ı DA dene ve `login` dolu gelirse onu kullan. Hedef: `ud3B3yRH` gelmeli. Normalizer `login`'i zaten önceliyor (`pickUsernameField`), sorun login'in minimal yanıtta boş gelmesi.

### P2 — goldensm32 "profile-mac-mismatch" (A01)  [cihaz: handshake OK ama tüm MAC'ler unverified]
Failover sonrası handshake başarılı ama doğrulama `profile-mac-mismatch` → unverified.
- **Kök adayı (A01):** `frontend/src/utils/stalker.ts:2054` `accountMatchesMac` base64 MAC'i ÇÖZMÜYOR (normalizer `decodeMacIfBase64` kullanıyor, eşleştirici kullanmıyor → tutarsızlık). Portal MAC'i base64 döndürüyorsa geçerli hesap yanlışlıkla reddedilir.
- **Alternatif:** Girilen MAC'ler goldensm32'de kayıtlı abone değilse mismatch DOĞRU olabilir. Log MAC değerini (gizlilik) yazmıyor; ayrım için ya değeri güvenli sınıflandır ya kullanıcıya sor (goldensm32 kendi aboneliği mi).
- **Çözüm:** `accountMatchesMac`'e `decodeMacIfBase64` ekle (düşük risk, normalizer ile tutarlı). Gerçekten farklı MAC ise mismatch korunur.

### P3 — Player ilk-kare ~2 sn (Xtream TS açılışı)
Kanıt: `FIRST_FRAME srcSet ~1.5–2.7 sn` = Media3'ün canlı MPEG-TS ilk keyframe'ini açması (buffer başlatma zaten ~200 ms). Kör buffer dokunuşu YAPILMADI (stutter riski). Önce connect/TTFB/keyframe aşama ölçümü gerekir. Uzun (28–132 sn) gecikmeler Stalker kanalında HTTP 444 + boş oturumdandı → v18.7.11 M08 ile düzelmesi beklenir.

### Diğer (GPT backlog, daha önce iletildi): M09-tam, M10 (tekli ekran gelip gidiyor), M11 (:80/:443 portsuz sayılıyor), A02/A05/A06/A07/A08, C01–C04, D01, P01–P05, N01–N03, T02. Özellik eksikleri: EPG zamanlı kayıt, "devam et" şeridi, hız testi, yazı boyutu, yedek şifreleme.

## 5. Cihaz / DEV iş akışı (bu oturumda kullanıldı)
- **ADB:** `C:\Android\Sdk\platform-tools\adb.exe`. Ortam: `$env:ANDROID_HOME="C:\Android\Sdk"`, `$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"`. Gradle PowerShell'de çalıştır (Git Bash'te loopback hatası).
- **DEV derleme:** `cd frontend; npx expo prebuild --platform android --clean --no-install; cd android; .\gradlew.bat assembleDebug` (~15–18 dk). APK: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Kur: `adb install -r <apk>`. **Tuzak:** önceki Gradle daemon dosya kilitlerse `.\gradlew.bat --stop` sonra tekrar.
- **Tanı DB çekme (DEV debuggable):** `adb exec-out "run-as com.gpt.kizilkan.player.dev cat databases/kizilkan-native-core.db" > k.db` (+ `-wal`). `run-as ... cp /data/local/tmp/` ÇALIŞMAZ (izin). Node `node:sqlite DatabaseSync` ile oku; tablo `diagnostic_events`, kolonlar `atEpochMs,event,payloadJson,...`. Olaylar en-yeniden-eskiye değil `atEpochMs ASC` ile sırala. MAC/şifre/token değerleri `payloadJson`'da REDAKTE (yalnız `*Present/*Kind/*Fields` metadata açık).
- **Cihazda ağ teşhisi:** `adb shell "nc -w 6 host port < /dev/null; echo EXIT=$?"` ("nc: Timeout" = ölü). `ping -c N host`. DNS çözümleme round-robin ölü IP verebilir (goldensm32 kanıtı). **Sistem ayarını (DNS vb.) sen DEĞİŞTİRME** — kullanıcıya söyle.

## 6. Güvenlik / kapsam sınırları (DEĞİŞMEZ)
Bu, kullanıcının KENDİ aboneliği/MAC cihazları için standart bir Stalker/Ministra IPTV istemcisidir (TiviMate/IPTV Smarters gibi). TLS doğrulamasını KAPATMA. Düz kimlik bilgisi (şifre/kullanıcı adı/MAC/token) loglama — yalnız var/yok + biçim. Kullanıcı verisini/listesini silme; DEV verisini koru. HTTP 200/token tek başına geçerli hesap DEĞİL; gerçek profil/katalog erişimi kanıtı şart.

## 7. Son cihaz kanıtı özeti (18.7.12-dev, 2026-10-04 akşam)
- `MAG_HOST_IP_FAILOVER goldensm32 A=5` → handshake'ler başarılı (failover çalışıyor). ✅
- goldensm32 tüm MAC'ler `STALKER_ACCOUNT_VERIFIED state=unverified ev=["profile-mac-mismatch"]` (P2/A01).
- hkpremium `STALKER_ACCOUNT_SNAPSHOT uField=name uPres=true login=false name=true` → 1787 (P1 username).
- weko-azure.xyz host aralıklı/ulaşılamaz olabiliyor (ISP/round-robin); PC'den erişilebilir.
