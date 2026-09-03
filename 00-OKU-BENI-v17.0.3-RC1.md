# KIZILKAN PLAYER ELITE v17.0.3 RC1

## Paket amacı
Bu paket v17.0.2 tabanını koruyarak dört ana düzeltme/geliştirme grubunu birleştirir:

1. MPV runtime forensics ve APK/native yükleme doğrulamasının güçlendirilmesi.
2. Room snapshot eksikliği için doğrulanmış self-repair / fail-closed yaşam döngüsü.
3. Çoklu hesap taramasında terminal sonuçların kullanıcı açıkça kapatana veya başarıyla ekleyene kadar korunması; process restart sonrası orphan RUNNING snapshot'ın bulunan sonuçları kaybetmeden terminal FAILED durumuna çevrilmesi.
4. TV Guide / focus / Quick Guide / Recent Channels / numeric zap kapsam iyileştirmeleri.

## Çoklu hesap sözleşmesi
- COMPLETED / FAILED / CANCELLED terminal snapshot otomatik silinmez.
- Kullanıcı sonuç ekranını kapattığında veya seçili hesapları başarıyla eklediğinde açık acknowledgement yapılır.
- Process restart sonrası devam edemeyen RUNNING tarama sahte şekilde çalışıyor gösterilmez; FAILED + PROCESS_RESTARTED olur ve bulunan sonuçlar korunur.
- Toplam ve hesap bazında `Bulunan > 0` değeri aktif tema `brandPrimary` rengiyle gösterilir; sıfır değeri ikincil renkte kalır.

## Doğrulama dürüstlük notu
Hedefli v17.0.3 hard-gate, geçmiş sürüm preservation gate'leri, JS syntax kontrolleri, değiştirilmiş TS/TSX dosyalarının TypeScript parse/transpile kontrolleri ve Kotlin yapısal/parser seviyesi kontrolleri çalıştırılmıştır. Android/Gradle APK build'i bu ortamda Android/Expo proje bağımlılıkları bulunmadığı için çalıştırılmamıştır; cihaz runtime doğrulaması yapılmış gibi iddia edilmez.
