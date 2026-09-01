# KIZILKAN PLAYER v16.14.5 RC1 — Düzeltme Yorumu

- MAG hesap ekleme validation/persistence ile katalog bootstrap birbirinden ayrıldı.
- Başarılı handshake sonrası hesap boş ama doğrulanmış Room snapshot + metadata ile atomik kaydedilir.
- Live/VOD/Series katalog hataları artık doğrulanmış hesabı geri almaz; `initialSyncState=partial_error` ile görünür kalır.
- Varsayılan MAG ekleme `liveOnly:true` ile yürür; full VOD/Series pagination ekleme ekranını bloke etmez.
- Kategori seçimi açıkken tüm VOD/Series öğeleri yerine yalnız kategori başlıkları önizlenir.
- Arka plan enrichment kullanıcı seçimlerini VOD/Series üzerinde de uygular.
- Native OkHttp MAG gövdesi, `Content-Encoding:gzip` veya gzip magic bytes üzerinden güvenli decode edilir.
- v16.14.4 ve önceki özellikler/gate'ler korunmuştur.
