# KIZILKAN PLAYER v17.2.2 RC1 — Doğrulama

## Kanıtlanan kök neden
GitHub Actions run #81'de statik denetim, TypeScript `tsc --noEmit`, Expo prebuild, release imza hazırlığı ve manifest kontrolleri geçti. Gerçek kırılma `:mpv-player:compileReleaseKotlin` görevinde oluştu:

`KizilkanMpvView.kt:182:28 Argument type mismatch: actual type is 'Surface?', but 'Surface' was expected.`

Kaynakta nullable lifecycle alanı `renderSurface: Surface?` doğrudan `MPVLib.attachSurface(Surface)` çağrısına veriliyordu.

## v17.2.2 corrective
- `val surface = Surface(surfaceTexture)` ile non-null yerel Surface oluşturuldu.
- `renderSurface = surface` ile lifecycle alanında saklama korundu.
- `mpv?.attachSurface(surface)` ile nullable değer API'ye taşınmıyor.
- TextureView mimarisi, detach/release lifecycle, first-visible-frame telemetrisi ve audio ownership korunuyor.
- v17.2.1 semantic gate ileri sürüm uyumlu hale getirildi; önceki semantik kontroller eksiltilmedi.
- v17.2.2 için ayrı MPV Surface Kotlin hard-gate eklendi.

## Bu ortamda gerçekten çalıştırılan kontroller
- `node --check`: v17.2.0 player hardening, v17.2.1 TypeScript gate, v17.2.2 MPV gate ve `denetle.js` — PASS.
- `check-v1720-consolidated-core.js` — PASS.
- `check-v1720-streaming-scan-pipeline.js` — PASS.
- Güncellenmiş `check-v1720-player-diagnostics-hardening.js` — PASS.
- Güncellenmiş `check-v1721-typescript-contract.js` — PASS.
- Yeni `check-v1722-mpv-surface-kotlin.js` — PASS.
- `frontend/app.json` + `frontend/package.json` metadata senkronizasyonu — PASS.
- Exact baseline → corrective diff whitespace kontrolü — PASS.
- Değişiklik yüzeyi yalnız planlanan 11 dosya — PASS.

## Bilerek çalıştırılmayan kontrol
Bu ortamda tam Android Gradle/release derlemesi çalıştırılmadı. Otoritatif compile/build kabulü GitHub Actions'ta yapılacaktır. Telefon build sunucusu olarak kullanılmayacaktır.
