# KIZILKAN PLAYER ELITE v15.2.23 RC1

v15.2.22 üzerine gerilemesiz Flight Recorder V5 / tam reset / MAG HTTP telemetry corrective sürümüdür.

## Değişiklikler
- JS Flight Recorder ring kapasitesi 10.000 -> 50.000 olaya çıkarıldı.
- Native Room kapasitesi 20.000 normal + 2.000 kritik -> 100.000 normal + 10.000 kritik olaya çıkarıldı.
- JS JSONL journal 4x16 MiB -> 8x32 MiB segmente çıkarıldı; V4/V2 legacy journal okuma/temizleme korunur.
- Native kritik journal 8 MiB -> 32 MiB; V4 ve V3 legacy kritik journal temizliği korunur.
- İstatistikleri sıfırla artık PanelScan diagnostic event + last crash geçmişini de siler ve ekrandaki tanı state'lerini anında boşaltır.
- MAG/Stalker her HTTP isteğinde action/type/path/status/süre/yanıt boyutu/content-type/redirect telemetrisi kaydeder; transport ve JSON parse hataları ayrı olaylardır. Token/MAC/şifre kayda yazılmaz.
- Eski v15.2.16/v15.2.18/v15.2.20/v15.2.22 gate'leri ileri sürüm Flight Recorder formatlarını regresyon saymayacak şekilde düzeltildi.
- Yeni `tools/check-v15223-flight-recorder-mag.js` master denetim zincirine eklendi.

## Bu ortamda gerçek doğrulama
- `node tools/check-v15223-flight-recorder-mag.js`: PASS.
- `node tools/check-v15222-flight-recorder-mag.js`: PASS.
- `cd frontend && node ../tools/denetle.js`: TÜM DENETİMLER TEMİZ / exit 0.
- Denetim için yalnız TypeScript 5.9.3 uyumlu mevcut sistem modülü geçici olarak bağlandı; node_modules pakete eklenmedi.
- Tam `tsc --noEmit`, Android/Kotlin/Gradle release ve APK cihaz testi bu ortamda çalıştırılmadı; GitHub Actions + fiziksel cihaz ile doğrulanmalıdır.
