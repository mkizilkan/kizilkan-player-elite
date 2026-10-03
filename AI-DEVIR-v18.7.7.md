# AI DEVİR — v18.7.7 RC1 (MAG hesap kartı doğruluğu + oynatma/senkron düzeltmeleri)

**Taban:** `v18.7.6-rc1-mag-scan-fixes` (014cb034). **Dal:** `v18.7.7-rc1-mag-account-fixes`.
Kullanıcı (Mustafa) onayı: v18.7.6 cihaz testi sonrası 8 maddelik plan (P1–P8). **Push/derleme BEKLETİLDİ** (kullanıcı
mevcut 18.7.6 DEV ile test ederken kodlandı).

## Kanıt (tanı `kizilkan-diagnostics-2026-10-03T05-13` + cihazdaki kayıtlı AsyncStorage + IPTV Extreme ekran görüntüleri)

| Bulgu | Kanıt |
|---|---|
| Bitiş `phone`'da geliyor | vip.rxs1 kayıtlı accountInfo: `phone:"January 8, 2027, 3:45 pm"`, `tariff_expired_date:null`. IPTV Extreme aynı değeri "Bitiş" gösteriyor |
| `get_main_info` gzip | HKPREMIUM: `STALKER_HTTP_PARSE_ERROR NON_JSON bytes:90` gövde `\x1f\x8b` (gzip). `get_profile` native yoldan sorunsuz |
| status 0 "SÜRESİ DOLDU" | HKPREMIUM kayıtlı `status:"blocked"` ama katalog çalışıyor (2790 canlı). accountDenial `/^(?:0|false)$/` → 0'ı bloklu sayıyordu |
| base64 MAC | kayıtlı `mac:"MDA6MUE6Nzk6MzA6M0E6QTc="` = `00:1A:79:30:3A:A7` |
| Kullanıcı adı/şifre | IPTV Extreme HKPREMIUM için kullanıcı adı+şifre gösteriyor (portal get_main_info döndürüyor; gzip açılınca gelecek) |
| Motor geçişinde bayat token | kanal 163662: Media3→MPV geçişinde yeni create_link alınmadı → `MPV ... Failed to open ...play_token`; `ENGINE_ERROR` |
| Ekleme yavaş | vip ekleme sırasında aynı portal için 2 katalog işi; canlı 13. sn hazır ama listeye ~2 dk sonra (katalog kilidi) |

## Yapılan (P1–P8)

- **P1 — `stalker.ts` + `accountExpiry.ts`:** Açık bitiş alanı yoksa `phone` tarih olarak denenir → bitiş; o zaman Telefon
  alanı gösterilmez (gerçek telefon, tarih değilse kalır). `accountExpiry` "D Month YYYY [HH:MM:SS]" (ör. "11 May 2027 18:18:00")
  + Türkçe ay adları (tam/3-harf) tanır. Saatsiz tarih = UTC gün başı.
- **P2 — `stalker.ts` (önceki oturumdan, korundu):** exactEndpoint expo/fetch yolunda elle `Accept-Encoding` kaldırılır →
  OkHttp gzip'i şeffaf açar (snapshot + toplu doğrulama). Açılmamış gzip ayrı `GZIP_UNDECODED` türü. Snapshot artık
  exactEndpoint ZORLAMAZ → get_profile ile aynı native (gzip-açan) yol.
- **P3 — `stalker.ts`:** Stalker sayısal `status 0 = AKTİF` (kaynak: stalker_portal launcher_profile.php). accountDenial'dan
  `/^(?:0|false)$/` kuralı kaldırıldı; normalize `status "0"`/aktif bayrağı → "Active", bare kayıt → undefined.
- **P4 — `stalker.ts` + `types/index.ts` + ayarlar kartı:** base64 MAC/login çözülür (`base64DecodeAscii`/`decodeMacIfBase64`);
  `AccountInfo.password` eklendi, normalize/snapshot `password` okur; kartta "Şifre" alanı.
- **P5 — `PlayerHost.tsx`:** `switchProfile`'da Stalker için motor değişince taze create_link istenir
  (`stalkerForceFreshRequestedRef`+nonce; `STALKER_ENGINE_SWITCH_REFRESH`). Tek-kullanımlık play_token yeni motora taşınmaz.
- **P6 — `PlaylistContext.tsx`:** İlk senkron (pending/live_ready/enriching) sürerken otomatik güncellik kontrolü o hesabı
  ATLAR (`FRESHNESS_SKIP_INITIAL_SYNC`). Çift katalog işi + katalog kilidi beklemesi biter.
- **P7 — `PlayerHost.tsx` (yalnız ÖLÇÜM):** `media3SourceSetAtRef` + FIRST_FRAME'e `sinceSourceSetMs`. İlk-kare gecikmesi
  KAYNAK ÖNCESİ (çözümleme/handshake) mi SONRASI (tampon/ağ) mı ayrılır. Düzeltme kanıttan sonra.
- **P8 — `index.tsx` + `PlaylistContext.tsx`:** `freshnessStatus.active` bayrağı; canlı TV ekranında otomatik güncelleme
  sürerken ORTADA, simgeli (sync) kutuda ilerleme (manuel güncellemedeki gibi). Küçük satır final mesaj için kalır.

## Doğrulama (PC)
- `yarn tsc --noEmit` → **temiz (exit 0)**.
- `node tools/check-v18707-release.js` → **PASS**.
- `node tools/test-mag-account-validation.js` → **PASS, 9 grup** (yeni: phone→bitiş, status 0=aktif, base64 MAC, password, D-Month-Y/TR tarih).
- `node tools/denetle.js` → **TÜM DENETİMLER TEMİZ (exit 0)**.
- Kapı: `tools/check-v18707-release.js`; `denetle.js`'e kaydedildi.
- **Push/derleme BEKLİYOR** (kullanıcı onayıyla yapılacak). Native/Kotlin değişikliği YOK (tümü TS) → açılış çökme riski düşük.

## Cihazda doğrulanacak
1. **P1/P2/P4:** HKPREMIUM + vip.rxs1 → bitiş tarihi geliyor mu; kullanıcı adı/şifre görünüyor mu; MAC düzgün mü.
2. **P3:** HKPREMIUM "AKTİF" mi (artık "SÜRESİ DOLDU" olmamalı).
3. **P5:** Media3→MPV'ye düşen kanal artık açılıyor mu (`STALKER_ENGINE_SWITCH_REFRESH` + sonra başarı).
4. **P6:** Yeni MAG eklerken canlı ~13. sn listede; çift katalog işi yok (`FRESHNESS_SKIP_INITIAL_SYNC`).
5. **P7:** `FIRST_FRAME.sinceSourceSetMs` ile Media3 12 sn gecikmenin nerede olduğu okunur.
6. **P8:** Otomatik güncellemede ortada simgeli kutu görünüyor mu.

## Tuzaklar (bu sürümde)
- **Stalker status ≠ Xtream status.** Stalker'da 0=aktif; Xtream'de farklı. accountDenial Stalker'a özeldir.
- **Elle Accept-Encoding = gzip açılmaz.** OkHttp şeffaf gzip ancak başlık elle verilmezse çalışır.
- **`{blocked:0}` gibi bare kayıt "Active" DEĞİL** → status undefined (test korur). Yalnız gerçek status "0"/aktif bayrağı "Active".
