# KIZILKAN PLAYER ELITE v17.0.4 RC1

Bu paket v17.0.3 üzerine **yüksek kapasiteli çoklu hesap tarama temeli + kullanıcı kontrollü validatedHosts + TXT hesap arşivi** ekler. Önceki özellikler çıkarılmamıştır.

## Yeni
- Unified native scheduler kritik global iş sayaçları 64-bit (`Long` / `AtomicLong`).
- 100.000+ hesap hedefinde per-tick 100K durum JSON'u üretmemek için ultra hesap durum penceresi.
- Native UI snapshot/notification güncellemesi 250 ms backpressure/throttle.
- Sonuç listesi `FlatList` ile sanallaştırıldı.
- Kullanıcı aynı abonelikte **Tüm Çalışan DNS'ler** veya **Yalnız Seçilen DNS'ler** politikasını belirleyebilir.
- Seçili abonelikler tam TXT arşiv veya maskeli güvenli rapor olarak kaydedilebilir.
- Tam KIZILKAN TXT arşivi tekrar çoklu hesap içe aktarma ekranından okunabilir.
- TXT'de gerçek API metadata'sı (status, max connections, active connections, created/expiry) varsa yazılır; yoksa `Sunucu bildirmedi`.
- Sunucu kodu, panel adı, primary host ve validatedHosts korunur.

## Dürüst doğrulama sınırı
Bu ortamda Android/Gradle APK derlemesi ve fiziksel cihazda 100.000 hesap gerçek ağ taraması yapılmadı. 100K+ ifadesi **mimari kapasite hedefidir**, cihazda ölçülmüş hız garantisi değildir. 10 milyar gibi kombinasyonlar 64-bit scheduler matematiği içindir; milyarlarca gerçek HTTP isteği test edilmemiştir.
