# AI-DEVIR — v18.7.24 RC1

**Dal:** `v18.7.24-rc1-bulk-content-visibility` (taban v18.7.23 `v18.7.23-rc1-card-autoprime-autotest`)
**Konu:** Xtream + MAC çoklu ekleme **seçim ekranında** her hesap için "görüntü var/yok" göstergesi + "sadece görüntü olanları seç" süzmesi.

## Kaynak / istek
Kullanıcı: "xtream ve mac çoklu eklemede, bulunan hesapları listeye eklemeden önce seçim ekranındaki her bir mac ya da xtream hesabının bilgi kartında görüntü var/yok diye kullanıcının rahatça fark edeceği şekilde gösterilse, hatta veri süzme kısmında sadece görüntü olanları seç gibi bir kısım olsa." Xtream tarafı için **(b) istek üzerine** seçildi (kullanıcı "B olsun").

## Dürüst sinyal farkı (§2.2 — yanıltma yok)
- **MAG:** `MagScanResult.liveCount` doğrulama sırasında **zaten** hesaplanıyor (gerçek canlı içerik örneği). `liveCount>0` = görüntü VAR → **ücretsiz, otomatik, dürüst**.
- **Xtream combo:** tarama yalnız `player_api.php` login'i çekiyor, içerik çekmiyor. "Görüntü var" ancak `get_live_streams` probe'u ile bilinir → **istek üzerine** (otomatik değil, ban/hız riski yok).

## Değişiklikler (yalnız TS; native YOK)

### MAG çoklu — `frontend/app/mag-bulk.tsx`
- `ResultFilter`'a `"has-content"` eklendi; `contentResults = results.filter(liveCount>0)`.
- Süzme chip'i **"Görüntü olanlar (N)"** + `visibleResults` has-content dalı.
- Seçim butonu **"Görüntü olanları seç (N)"** (`mag-select-has-content`).
- Her sonuç kartında satır: `📺 Görüntü: VAR · N kanal` (yeşil) / `Belirsiz (içerik örneği alınamadı)` (probable) / `Yok / erişilemedi`.

### Xtream combo — `frontend/app/add-playlist.tsx`
- `bulkContentTest` state (`Record<key,{state:testing|yes|no|err;count}>`) + `bulkContentTesting` + ilerleme + `bulkContentAbortRef`.
- `testBulkContent()`: bulunan hesaplara **6 paralel** `xtreamLiveStreams(cred, signal)` probe'u (hesap başına 15 sn timeout; iptal edilebilir). `streams.length>0` → yes.
- Buton **"Görüntü Test Et"** (`bulk-content-test-btn`; çalışırken "Test ediliyor d/t (durdur)"), test sonrası **"Görüntü Olanları Seç (N)"** (`bulk-select-content-btn`, `bulkContentYesKeys`).
- Kartta rozet: `📺 Görüntü var · N kanal` / `Görüntü yok` / `kontrol ediliyor…` / `testi başarısız` (test edilmemişse rozet yok).
- Telemetri: `BULK_CONTENT_TEST_START` / `BULK_CONTENT_TEST_DONE` (tested/withContent/aborted).

## Doğrulama (PC)
- `yarn tsc --noEmit`: temiz (16.20s)
- `node tools/denetle.js`: **TÜM TEMİZ** (kapı `check-v18724-release.js` PASS)
- Native değişiklik YOK → assembleDebug zorunlu değil (DEV APK yine üretildi).

## Cihazda doğrulanacak
- MAG çoklu tarama → her kartta "Görüntü: VAR · N kanal" / yok; "Görüntü olanlar" süzme + "Görüntü olanları seç".
- Xtream combo tarama → "Görüntü Test Et" → kartlarda var/yok rozeti → "Görüntü Olanları Seç".

## Bekleyen
- GPT G07-G10.
- v18.7.23 cihaz doğrulaması (hkpremium kartı oto-prime kullanıcı adı + görüntü oto-testi).
