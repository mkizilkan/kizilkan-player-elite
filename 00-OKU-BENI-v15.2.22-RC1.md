# KIZILKAN PLAYER ELITE v15.2.22 RC1

Bu sürüm v15.2.21 üzerine gerilemesiz corrective/hardening sürümüdür.

## Ana değişiklikler
- Flight Recorder V4: JS ring 10.000 olay, native Room 20.000 normal + 2.000 kritik olay.
- JSONL journal 4 segmente ve segment başına 16 MiB sınırına çıkarıldı.
- Tam temizleme: JS V4/V3/V1 kayıtları, JSONL V4/V2 segmentleri, native Room ve kritik V4/V3 journal dosyaları temizlenir.
- Android ApplicationExitInfo fiziksel olarak silinemediği için clear-epoch ile temizleme öncesi exit kayıtları rapordan dışlanır.
- İstatistikleri sıfırla artık izleme geçmişiyle birlikte Flight Recorder kayıtlarını da sıfırlar.
- MAG/Stalker: MAG254 legacy profil varyantı, handshake random taşıma, get_all_channels -> get_ordered_list canlı fallback'i ve Live/VOD/Series partial-success izolasyonu eklendi.
- Önceki hard-gate zinciri korunmuş ve v15.2.22 gate eklenmiştir.

## Doğrulama durumu
`node tools/denetle.js` bu kaynak üzerinde çalıştırıldı ve tüm kapılar temiz geçti.
Bu ortamda `frontend/android` üretilmiş Gradle projesi ve `node_modules` bulunmadığı için gerçek Android/Gradle build ve `tsc --noEmit` çalıştırılmış gibi gösterilmemektedir. Nihai APK doğrulaması GitHub Actions + gerçek cihaz testidir.
