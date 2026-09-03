# DÜZELTME YORUMU — v17.0.4 RC1

1. Unified taramada Int tabanlı global cursor/total katmanı Long'a yükseltildi.
2. Büyük hesap listesinde her snapshot'ta tüm hesapları serialize etme davranışı 2.000 üzeri için 250 satırlık aktif pencereye çevrildi; normal taramalarda tam görünüm korunur.
3. Snapshot üretimi 250 ms ile sınırlandı; bulunan sonuç ve terminal durum gecikmeden snapshot üretebilir.
4. Sonuç kartları ScrollView+map yerine sanallaştırılmış FlatList kullanır.
5. validatedHosts politikası kullanıcı kontrolüne verildi: tüm çalışan DNS'leri veya yalnız seçilen DNS satırları.
6. TXT tam arşiv + güvenli maskeli rapor eklendi. Tam arşiv tekrar parse edilebilir.
7. Sunucu kodu ve otomatik güncelleme/failover için kullanılan ServerCodeBinding yolu değiştirilmedi; makeBinding ile validatedHosts aktarımı korunur.
