# KIZILKAN PLAYER ELITE v17.1.0 RC1 — ULTRA-SCALE SCAN RUNTIME

## Kapsam

Bu sürümde MPV player koduna dokunulmadı. Çalışma yalnız çoklu hesap / büyük tarama runtime'ı, recovery, backpressure, picker single-flight ve ilgili hard-gate zincirini kapsar.

## Kanıtlanan kök nedenler

- 54.899 hesaplık girişte eski JS hazırlık kodu, paneli bilinmeyen her hesap için aynı dev `candidates` dizisini yeniden oluşturuyordu. Native bridge bunu sonradan dedup etse de dedup öncesinde JS heap/React Native process çalışma seti gereksiz büyüyordu.
- Cihaz tanısında unified scan sırasında PSS yaklaşık 2 GB'a çıktı; sistem `lowMemory=false` idi. Bu nedenle yalnız toplam cihaz RAM'i değil, uygulamanın çalışma seti/backpressure davranışı hedeflendi.
- Aynı anda ikinci DocumentPicker açılabildiği için Expo `Different document picking in progress` hatası üretiyordu.

## v17.1.0 düzeltmeleri

1. JS candidate set compact payload: ortak panel/DNS havuzu tek kez oluşturulur; her hesap yalnız `candidateSet` indeksi taşır.
2. Native batch runtime: varsayılan 15, kullanıcı için 5–15 hesaplık atomik partiler.
3. Kullanıcı istenen paralelliği 1–250 aralığında seçebilir.
4. Etkin paralellik cihaz `memoryClass`, batch boyutu ve güncel process PSS baskısına göre güvenli biçimde düşürülür.
5. Her batch sonunda atomik checkpoint: `committed_account` + `committed_tested`.
6. Process ölürse yarım batch yeniden çalıştırılır; tamamlanmış batch atlanmaz/tekrar kaybedilmez.
7. Bulunan sonuçlar önceki v17.0.7 sözleşmesi gibi her hit'te AES-GCM journal'a anında yazılır.
8. Aktif UI progress yalnız aktif batch hesaplarını taşır; 50K hesabın tüm state'i her snapshot'ta üretilmez.
9. `requestedConcurrency` ve `effectiveConcurrency` UI/telemetry'de ayrı görünür.
10. DocumentPicker gerçek single-flight kilidi eklendi; picker açıkken ikinci çağrı bastırılır.
11. `sourceFingerprint` recovery eşleşmesi için eklenmiştir; credential raw değerleri telemetry'ye yazılmaz.
12. v17.1.0 hard-gate eklendi ve denetim zincirine bağlandı.

## Korunan özellikler

- v17.0.13 Fabric `removeClippedSubviews={false}` düzeltmesi.
- v17.0.14 TXT özel dosya adı + SAF write/readback doğrulaması.
- v17.0.14 DB-health açık property export sözleşmesi.
- v17.0.15 tema token TypeScript düzeltmesi.
- Durdur / Duraklat / Devam, canlı bulunan hesap gösterimi, seçim ve import akışları.
- MPV kaynakları değişmedi.
