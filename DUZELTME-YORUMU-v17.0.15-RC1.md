# KIZILKAN PLAYER v17.0.15 RC1 — Düzeltme Yorumu

## Kök neden
GitHub Actions tam TypeScript denetimi `frontend/app/add-playlist.tsx` içindeki yeni TXT dosya adı alanında `FONT.size.md` kullanımını TS2339 ile reddetti. Tema sözleşmesinde `FONT.size` anahtarları `xs, sm, base, lg, xl, xxl, xxxl`; `md` yalnız `SPACING` ve `RADIUS` için mevcut.

## Düzeltme
- TXT dosya adı `TextInput` font boyutu `FONT.size.base` olarak düzeltildi.
- v17.0.14 TXT özel dosya adı, SAF uzantısız create, write/readback doğrulama ve DB-health düzeltmeleri korunuyor.
- v17.0.14 gate ileri sürümlerde de çalışacak şekilde forward-semver uyumlu hale getirildi.
- Yeni v17.0.15 gate, `add-playlist.tsx` içindeki tüm `FONT.size.*` ve `SPACING.*` kullanımlarını tema tanımındaki gerçek anahtarlarla karşılaştırıyor; aynı sınıf yanlış token yeniden eklenirse paketleme öncesi fail olur.
