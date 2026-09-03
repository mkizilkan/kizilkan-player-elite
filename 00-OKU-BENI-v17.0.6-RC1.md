# KIZILKAN PLAYER ELITE v17.0.6 RC1
## Background Scan Survivability & Session Recovery

Bu sürüm v17.0.5 üzerine kuruludur. v17.0.3 cihaz tanısında görülen tarama tamamlandıktan sonra React/UI root yeniden kurulduğunda profil seçimine düşme problemi hedeflenmiştir.

- Aktif/terminal native panel taraması bootstrap sırasında algılanır.
- PIN/çoklu profil güvenlik kapısı atlanmaz; doğru aktif profil doğrulandıktan sonra `/add-playlist` tarama/sonuç ekranına dönülür.
- `single` tarama (Paneli biliyorum / Paneli bilmiyorum native DNS taraması) snapshot'tan yeniden kurulur.
- `bulk/unified` v17.0.3 terminal-result recovery korunur.
- Native servis Android foreground `dataSync` service olarak korunur.
- Uzun tarama başlatılırken pil optimizasyonu durumu sorgulanır; kullanıcı isterse Android pil optimizasyonu ayarlarına gider. Uygulama muafiyeti kendi kendine vermez.
- Android'in process'i zorla öldürmeyeceği garanti edilemez. Process gerçekten ölürse mevcut snapshot terminal FAILED/PROCESS_RESTARTED olarak korunur; sahte devam iddiası yoktur.
