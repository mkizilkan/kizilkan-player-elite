# KIZILKAN PLAYER ELITE v17.0.14 RC1

- Sürüm: 17.0.14
- Android versionCode: 170014
- Release label: GPT ELITE v17.0.14 RC1

## Ana değişiklikler

1. v16.13.0 DB Health export hard-gate gerilemesi düzeltildi; v17.0.13 paralel Flight Recorder snapshot optimizasyonu korundu.
2. Android SAF TXT export çağrısı Expo sözleşmesine uygun uzantısız baseName ile çalışacak şekilde düzeltildi.
3. TXT yazımı sonrası gerçek read-back içerik doğrulaması eklendi.
4. Kullanıcının TXT dosya adını kaydetmeden önce değiştirebildiği yeni modal eklendi.
5. TXT export başarı/hata telemetry eklendi.
6. v17.0.13 Multi Account / MPV Surface / Flight Export özellikleri korunur.

## Gerçek cihaz kabul kriterleri

- Çoklu hesapta bulunan satırları seç -> TXT'ye Kaydet -> Tam Arşiv/Güvenli Rapor -> özel dosya adı yaz -> klasör seç -> "Bu klasörü kullan".
- Başarı mesajından sonra seçilen klasörde TXT gerçekten bulunmalı ve içerik okunabilir olmalı.
- Dosya adı kullanıcı girdisini taşımalı ve `.txt` uzantılı olmalı.
- Tam Arşiv tekrar içe aktarılabilir kalmalı; Güvenli Rapor credential alanlarını maskelemeli.
- MPV ve büyük Multi Account v17.0.13 cihaz kabul testleri ayrıca tekrarlanmalı.
