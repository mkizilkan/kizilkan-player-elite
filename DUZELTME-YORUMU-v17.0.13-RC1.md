# KIZILKAN PLAYER ELITE v17.0.13 RC1 — DÜZELTME YORUMU

Bu corrective sürüm, 04.09.2026 gerçek cihaz Flight Recorder ve manuel player testi üzerinden hazırlanmıştır.

## P0 — Multi Account reset / büyük dosya performansı
Cihaz logunda `java.lang.IllegalStateException: Invalid clipping state` main thread crash'i `ReactViewGroup.updateClippingToRect -> ReactScrollView.updateClippingRect` zincirinde kanıtlandı. Kaynakta Android `SectionList` için `removeClippedSubviews` açık olduğundan bu optimizasyon yalnız Multi Account canlı listesinde kapatıldı; sanallaştırma kaldırılmadı.

Büyük dosyada aynı içerik seçim anında parse ediliyor ve `bulkParsed` useMemo içinde ikinci kez parse ediliyordu. v17.0.13 tek-parse sonucu state'e alır, ham büyük metni state'te tutmaz ve parser'ın `map/filter` ara dizilerini kaldırır. Import için byte/karakter/satır/hesap/uyarı ve pick/read/parse/toplam süre telemetry'si eklendi.

## P0 — MPV ses var / görüntü yok
Manuel testte aynı kanal VLC'de görüntülü çalışırken MPV'ye geçince görüntü kaybolup ses devam etti. MPV native init ve audio pipeline çalıştığı için render/surface hattı hedeflendi. `SurfaceView` pencerenin arkasındaki dedicated surface'i hole-punch ile gösterirken child view'e opak siyah background verilmişti. Parent ExpoView siyah kalacak şekilde child `SurfaceView` background kaldırıldı. Decoder/hwdec körü körüne kapatılmadı.

Surface telemetry artık validity, attach/show state, view/holder ölçüleri, alpha ve background durumunu raporlar. `VIDEO_READY` mevcut bridge uyumluluğu korunarak surface snapshot ile zenginleştirildi.

## P1 — Flight Recorder paylaşım gecikmesi
Rapor içeriği veya event kapasitesi azaltılmadı. `loadDiagnostics`, native Black Box snapshot ve DB health birbirinden bağımsız olduğundan `Promise.all` ile paralel okunur. Serialize/redaction/write/pre-share ve share-dialog timing tek telemetry olayında sonraki rapora kaydedilir.

## Build güvenliği
v17.0.12 `prepareKizilkanMpvLibcxx -> merge*JniLibFolders/merge*NativeLibs` dependency ve AAR-owned libc++ çözümü değiştirilmedi. v17.0.12 gate forward-semver yapıldı; Player Core gate yeni telemetry parametreli `SURFACE_ATTACH` çağrısını kabul edecek şekilde dar biçimde güncellendi.
