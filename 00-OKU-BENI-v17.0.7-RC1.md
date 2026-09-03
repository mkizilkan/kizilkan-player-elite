# KIZILKAN PLAYER ELITE v17.0.7 RC1
## Durable Scan Journal & Process Resume Corrective

Bu sürüm v17.0.6 üzerine kuruludur. Gerçek Android process ölümü sonrasında yarım kalan panel/hesap taramasının yalnız UI route recovery ile değil, kalıcı ve şifreli bir tarama journal'ı üzerinden güvenli checkpoint'ten yeniden başlatılmasını hedefler.

- Tarama session payload/credential bilgileri Android Keystore AES-GCM ile şifreli journal'da tutulur.
- Bulunan sonuçlar anında SQLite journal'a idempotent yazılır.
- Cursor konservatif checkpoint ile kalıcılaştırılır; process restart sonrası küçük bir güvenli tekrar aralığına izin verilir, sonuç UNIQUE anahtarla çoğalmaz.
- single, bulk ve unified native taramalar journal entegrasyonuna sahiptir.
- Gerçek process restart sonrası snapshot `PROCESS_RESTARTED_RECOVERABLE` olarak işaretlenir ve UI `recoverInterruptedScan()` ile yeniden bağlanır.
- PIN/çoklu profil güvenlik kapısı korunur. Bayat `/add-playlist` appSession kaydı tek başına recovery kanıtı sayılmaz.
- Terminal sonuç kullanıcı onayına kadar korunur; mevcut v17.0.6 Activity/React-root recovery davranışı korunur.

Not: Android/üretici işletim sistemi foreground service veya uygulama sürecini her koşulda yaşatmayı garanti etmez. Bu sürümün amacı process kaybı gerçekleştiğinde kalıcı journal'dan kontrollü yeniden başlatmadır; fiziksel cihaz runtime testi ayrıca gereklidir.
