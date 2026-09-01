# KIZILKAN PLAYER v16.14.6 RC1

Build-corrective sürümüdür. v16.14.5'in MAG verified-account persistence / async catalog / gzip geliştirmelerini korur ve GitHub Actions'ta görülen TypeScript control-flow regresyonunu giderir.

Ana değişiklikler:
- MAG ve M3U commit akışları tip güvenli ayrı branch'lere ayrıldı.
- TS2367 / TS2339 üreten erişilemez eski MAG kontrolleri kaldırıldı; enrichment davranışı yeni MAG bootstrap hattında korunuyor.
- Tarihi v15.2.24/v15.2.25/v15.2.27 gate'leri davranış-temelli forward-compatible kontrol yapıyor.
- v16.14.6 semantic TypeScript/MAG control-flow hard-gate eklendi.
