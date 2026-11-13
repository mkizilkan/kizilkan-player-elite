# KIZILKAN PLAYER ELITE v18.7.39 RC1 — İkinci tur bütçesi + backoff sınırı + modal + klavye

Tarih: 13 Kasım 2026. Dal: `v18.7.39-rc1-retry-budget-modal-keyboard`.
Taban: v18.7.38 (`e403166a`). Kaynak: **13.11.2026 canlı cihaz izleme oturumu** (Poco X3, DEV).
Kullanıcı çoklu-hesap taramasını "sunucu bilmiyorum" (keşif) modunda yaptı; ilk tur çalıştı ama
**ikinci tur bir türlü bitmiyordu** ve ilk hesap bulununca bloke "Liste ekleniyor" perdesi bulunan-kutuyu
örtüyordu. Kök nedenler **kod + ekran görüntüsü** ile kanıtlandı. Kullanıcı onayladı.

## 1. Kök nedenler (kanıtlı)

| # | Sorun | Kanıt |
|---|---|---|
| 1 | **İkinci tur (drainDeferredProbes) sonsuza takılıyor** | `scanBackoffDeadline` (ScanWorkCoordinator.kt:178) + host backoff (PanelScanService.kt:767) **ÜST SINIRSIZ**. Panel 429/503 + büyük `Retry-After` (dk/saat) gönderince retry işleri saatler sonrasına erteleniyor; döngü 500 ms uykularla bekliyor. |
| 2 | İkinci turun **duvar-saati bütçesi yok** | `drainDeferredProbes` yalnız iş kalmayınca biter → rate-limit eden sunucu süresiz tutabiliyor |
| 4 | Bulunan-kutu "Liste ekleniyor" perdesiyle örtülüyor | Ekran: "1 abonelik" bulundu + üstüne "Liste ekleniyor · 1/1 · Lütfen bekleyin" perdesi. Kök: kurtarma döngüsü `setLoading(!!scan.running)` (add-playlist.tsx:1707) → `visible={loading...}` perdesi kutuyu kaplıyor |
| 6 | Düzenleme ekranı klavye düzeltmesi (v18.7.38) tutmadı | Sadece `scrollResponderScrollNativeHandleToKeyboard` yetmedi (KAV=undefined + yetersiz kaydırma alanı) |

## 2. Düzeltmeler

| # | Düzeltme | Dosya |
|---|---|---|
| **#1** | Tarama backoff'una **30 sn üst sınır** (`SCAN_MAX_BACKOFF_MS`): `scanBackoffDeadline` coerce + host backoff `retryMs.coerceAtMost`. Sunucu ne derse desin 30 sn'den fazla beklenmez. | `ScanWorkCoordinator.kt`, `PanelScanService.kt` |
| **#2** | İkinci tura **~2 dk duvar-saati bütçesi** (`RETRY_PHASE_BUDGET_MS`): dolunca `markAllPendingUnresolved` + sonlanır. **Bulunanlar korunur**, kalan belirsizler "unresolved". **Garanti: ikinci tur her zaman biter.** Telemetri `RETRY_BUDGET_EXHAUSTED`. | `PanelScanService.kt`, `ScanJournalStore.kt`, `ScanWorkCoordinator.kt` |
| **#4** | Bloke "Liste ekleniyor" perdesi **sonuç kutusu açıkken (`showBulkCandidates`/`showDiscoveryMatches`) GÖSTERİLMEZ**. Kutu zaten kendi ilerlemesini + ekle butonunu gösterir; kullanıcı taramada bulunanları seçip ekleyebilir. | `app/add-playlist.tsx` |
| **#6** | Düzenleme ekranında **klavye yüksekliği kadar alt boşluk** (`keyboardHeight` + `keyboardDidShow`); ScrollView odaklanan alanı klavyenin üstüne kaydırabilir. KAV'a dokunulmadı (check-v1711 korunur). | `app/edit-playlist.tsx` |

**Ertelenen (kritik fix'i riske atmamak için):** #5 "sunucu yazılıysa önce dene + Derinlemesine tara anahtarı" (hız optimizasyonu; kullanıcının şu anki keşif-modu blokajı değil; üstteki HOST/KIZILKAN import butonu zaten o işi görüyor). Sonraki build'e.

## 3. Mimari uyum / regresyon
- #1/#2 yalnız tarama retry/backoff'unu sınırlar; ilk tur, bulunan sonuçlar, `persistScanResult`, tek-upstream korunur. Bulunan hesap ASLA silinmez.
- #4 yalnız perdeyi gizler; commit (kutu kapalı) perdesi ve MAG CatalogPreparationModal korunur.
- #6 yalnız edit-playlist; KAV behavior=undefined korunur (check-v1711).
- Özellik çıkarılmadı (§2.4); paket eklenmedi.

## 4. Doğrulama
- `yarn tsc --noEmit`: **PASS** · `check-v18739`: **PASS** · `node tools/denetle.js`: **TÜM TEMİZ** (exit 0).
- **NATIVE değişiklik → `assembleDebug`: BUILD SUCCESSFUL** (19m58s, tam C++/Kotlin). APK 482 MB.
- **Cihaz:** `18.7.39-dev` `install -r` **Success** (veri korundu), açıldı, **çökme/ANR YOK** (§7 cihaz-açılış geçti).
- **Davranış kabulü (ikinci tur ~2 dk'da biter / kutu örtülmez / klavye):** kullanıcı taramayı çalıştırınca
  canlı doğrulanacak — adb ile uygulamaya dokunulamadığı (MIUI) için tarama kullanıcı tarafından başlatılır.

## 5. Cihaz kabul senaryoları
1. **#1/#2:** Keşif taraması başlat → ikinci tur **en geç ~2 dk içinde biter** (eskiden saatlerce/hiç bitmiyordu). "N belirsiz" ile sonlanır, bulunanlar listede durur.
2. **#4:** Tarama sırasında ilk hesap bulununca "Bulunan Çoklu Hesaplar" kutusu **açık ve etkileşimli kalır** (perde örtmez); seçip ekleyebilirsin.
3. **#6:** Düzenleme ekranında kullanıcı adı/şifre/MAC alanına dokununca alan **klavye üstüne kayar**.

## 6. Gerçek teslim kaydı — Opus, 13.11.2026
<commit/push/run/APK + cihaz doğrulaması doldurulacak>
