# AI-DEVIR — v18.7.25 RC1

**Dal:** `v18.7.25-rc1-contenttest-parallel-ui-macsafety` (taban v18.7.24)
**Konu:** Combo tarama TS düzeltmeleri — B (görüntü testi hızı) + C (paralellik UI birleştirme) + A (TXT UX) + E-MAG (MAC emniyet sibobu). **Yalnız TS, native YOK.**
**Not:** D + E-Xtream (native) GPT-5.1'e verildi (`GPT-DEVIR-v18.7.26-NATIVE.md`). Bu sürüm Opus'un TS yarısı.

## Kaynak / kanıt (log `kizilkan-diagnostics-2026-10-07`, galaplaytv combo)
- Görüntü testi 582 hesap = **86,5 dk** (`BULK_CONTENT_TEST_START→DONE`). Kök: her hesaba tam `get_live_streams`, 6 paralel, 15 sn + arka plan throttle.
- Üç örtüşen paralellik alanı (kullanıcı "fark ne?").
- "5-6 kaydetti" yanılgısı (aslında 579 yazıldı; eski dosyaya bakılmış).
- MAC tarama sonuçları yalnız JS belleğinde (app ölürse uçar).

## Değişiklikler

### B — Görüntü testi hızı (`add-playlist.tsx` `testBulkContent`)
- Paralellik **6→20**, hesap timeout **15→10 sn**.
- `KizilkanNativeCore.startForegroundKeepAlive`/`stop` sargısı → arka planda da throttle olmadan sürer (86 dk'nın büyük kısmı arka plan yavaşlamasıydı).
- Beklenen: 86 dk → birkaç dakika.

### C — Paralellik UI birleştirme (`add-playlist.tsx`)
- "Paralel analiz sayısı" (`comboParallelText`) ile Özel paralellik'teki "İstenen paralellik" artık **TEK değer** — ikisi de `comboParallelText`'e bağlı, hep senkron.
- `bulkRequestedConcurrency` state **kaldırıldı**; `requestedCustom` artık `comboParallelText`'ten okur.
- "Parti boyutu" (`bulkBatchSize`) ayrı kaldı (farklı kavram: motor öbek boyutu). Etiketlere "aynı alan" notu eklendi.

### A — TXT UX (`add-playlist.tsx`)
- `lastSavedArchive` state; kayıt başarısında `{name, count}` set edilir.
- Kaydet butonunun altında **"✓ Son kaydedilen: `<ad>` · N kayıt / İndirilenler/.../Hesap Arşivi/"** net gösterilir → kullanıcı eski dosyayla karıştırmaz.

### E-MAG — MAC tarama emniyet sibobu (`mag-bulk.tsx`)
- `allFoundRef` tüm bulunanları biriktirir; `writeMagSafetyBackup` görünür klasöre (`İndirilenler/KIZILKAN PLAYER ELITE/Canlı Tarama Yedeği/KIZILKAN-MAC-TARAMA-<tarih>.txt`) **tam listeyi** yazar (üzerine yazar).
- `flushResults` içinde her 3 sn'de bir debounce'lu yazım + tarama bitişinde (`finally`) zorla son yazım.
- Satır biçimi: `portal|mac|bitiş|kategori|liveCount`. → app ölse/çökse bile MAC sonuçları diskte kalır.
- (Xtream tarafı emniyet sibobu = E-Xtream, native, GPT'de v18.7.26.)

## Doğrulama (PC)
- `yarn tsc --noEmit`: temiz (30.09s)
- `node tools/denetle.js`: **TÜM TEMİZ** (kapı `check-v18725-release.js` PASS)
- Native değişiklik YOK → assembleDebug zorunlu değil (DEV APK yine üretildi, telefon bağlı test için).

## Cihazda doğrulanacak
- Görüntü testi (582 hesap) artık **dakikalar** (86 dk değil); arka plana alınca da sürer.
- Paralellik: tek alan; "Paralel analiz sayısı" = "İstenen paralellik".
- TXT kaydından sonra "Son kaydedilen" satırı; doğru dosya adı + sayı.
- MAC taraması sırasında `Canlı Tarama Yedeği/` klasöründe yedek TXT oluşup büyümeli.

## Bekleyen
- **v18.7.26 (GPT, native):** D (tam journal → 7.340 seçilebilir) + E-Xtream (native emniyet sibobu). Devir: `GPT-DEVIR-v18.7.26-NATIVE.md`.
- 0.1 katalog Xtream-first (ayrı); GPT G07-G10.
