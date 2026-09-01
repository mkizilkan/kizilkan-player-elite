# REGRESYON DENETİMİ — v15.2.11-RC1

- [x] Sürüm `15.2.11`, Android `versionCode=150211`.
- [x] `user:pass` ve `user:password` fonksiyonel parser testi iki hesap döndürüyor.
- [x] Panel directory fetch harici `AbortSignal` kabul ediyor.
- [x] Tekli ve çoklu hazırlık ekranında Durdur, hazırlık AbortController'ını kesiyor.
- [x] Native Service `activeConnections`, `shutdownNow`, `disconnect` korumalarını sürdürüyor.
- [x] Native Service her çıkışta `finalizeSnapshot()` ile terminal state yazıyor.
- [x] Unified work queue hesaplar arasında round-robin.
- [x] Durdur UI tek basış sonrası `Durduruluyor…` kilidine giriyor.
- [x] Scan/import bariyeri korunuyor; tarama bitmeden ekleme butonu aktif değil.
- [x] Kullanıcı seçimi olmadan otomatik import helper yok.
- [x] Profil PIN `ProfileSessionGate` korunuyor.
- [x] `tools/denetle.js` üç ardışık tur temiz.

Gerçek Android/Kotlin release derlemesi ve cihaz davranışı GitHub Actions + gerçek cihaz testi ile ayrıca doğrulanmalıdır.
