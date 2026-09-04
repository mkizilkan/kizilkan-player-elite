# v17.0.15 RC1 Doğrulama

- [x] `FONT.size.md` kök nedeni tema kaynağından doğrulandı.
- [x] TXT dosya adı alanı `FONT.size.base` kullanıyor.
- [x] Yeni gate tüm `FONT.size.*` ve `SPACING.*` tokenlarını gerçek tema anahtarlarıyla karşılaştırıyor.
- [x] v17.0.14 DB-health ve TXT export sözleşmeleri korunuyor.
- [x] v17.0.14 gate forward-semver uyumlu.
- [ ] Tam TypeScript `tsc --noEmit`: yerel artifact ortamında `frontend/node_modules` bulunmadığından çalıştırılamadı; GitHub Actions gerçek doğrulama kaynağıdır.
- [ ] Android release build: bu ortamda çalıştırılmadı; GitHub Actions ile doğrulanacaktır.
