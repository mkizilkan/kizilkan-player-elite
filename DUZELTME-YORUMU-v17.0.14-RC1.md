# KIZILKAN PLAYER ELITE v17.0.14 RC1 — DÜZELTME YORUMU

Bu sürüm v17.0.13 RC1 üzerine dar kapsamlı corrective sürümdür. Önceki özellikler kaldırılmamış veya azaltılmamıştır.

## 1) CI build-gate gerilemesi — v16.13.0 DB Health

v17.0.13 Flight Recorder hızlandırmasında `databaseHealth` değeri `Promise.all()` ile paralel hazırlanmış, payload içinde shorthand `databaseHealth,` biçimine dönmüştü. Runtime verisi korunmasına rağmen v16.13.0 tarihî hard-gate açık `databaseHealth:` property sözleşmesini aradığı için CI denetimi `database health export missing` ile duruyordu.

v17.0.14 düzeltmesi:
- Paralel snapshot optimizasyonu korunur.
- Payload alanı `databaseHealth: databaseHealth` biçiminde açık property olarak geri getirilir.
- v16.13.0 gate tekrar PASS olur.
- Yeni v17.0.14 gate bu kontratı ayrıca korur.

## 2) Çoklu Hesap — TXT arşiv seçilen klasöre yazılmıyor

Kaynak incelemesinde Android SAF yolunda `createFileAsync()` çağrısına `.txt` dahil tam dosya adı verildiği ve yazım sonrası gerçek read-back doğrulaması olmadığı görüldü. Expo FileSystem legacy SAF sözleşmesinde `createFileAsync(parentUri, fileName, mimeType)` için `fileName` uzantısız addır.

v17.0.14 düzeltmesi:
- SAF create çağrısına uzantısız `baseName` verilir; MIME `text/plain` korunur.
- Yazımdan sonra oluşturulan SAF URI tekrar UTF-8 okunur ve içerik birebir karşılaştırılır.
- Doğrulama başarısızsa artık "Kaydedildi" mesajı verilmez.
- Başarılı doğrulama `BULK_TXT_EXPORT_VERIFIED`, hata `BULK_TXT_EXPORT_FAILED` telemetry olayı üretir.
- Uygulama cache kopyası paylaşım/fallback için korunur.

## 3) Kullanıcı dosya adını kendisi belirleyebilir

"Güvenli Rapor" veya "Tam Arşiv" seçildikten sonra yeni bir dosya adı penceresi açılır.
- Varsayılan KIZILKAN tarih damgalı ad hazır gelir.
- Kullanıcı adı değiştirebilir.
- `.txt` yazılması gerekmez; girilmişse normalize edilir.
- Geçersiz kontrol/ayraç karakterleri güvenli biçimde dönüştürülür.
- Tam Arşiv / Güvenli Rapor içerik semantiği değiştirilmemiştir.

## 4) Korunan v17.0.13 düzeltmeleri

- Büyük çoklu hesap dosyasında tek-parse state ve Android Fabric clipping corrective.
- MPV SurfaceView child background corrective ve surface telemetry.
- Flight Recorder paralel snapshot/export timing telemetry.
- v17.0.12 MPV libc++ Gradle task-graph corrective.
