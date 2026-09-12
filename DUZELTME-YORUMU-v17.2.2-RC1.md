# KIZILKAN PLAYER v17.2.2 RC1 — Düzeltme Yorumu

GitHub Actions run #81, v17.2.1 kaynak ağacında TypeScript/denetim/prebuild aşamalarının temiz geçtiğini; gerçek kırılmanın `:mpv-player:compileReleaseKotlin` görevinde olduğunu kanıtladı. Kotlin derleyici hatası `KizilkanMpvView.kt:182` satırında nullable `Surface?` değerinin `MPVLib.attachSurface(Surface)` API'sine verilmesiydi.

- TextureView mimarisi, MPV audio ownership, lifecycle detach/release ve ilk görünür frame telemetrisi korunmuştur.
- `Surface(surfaceTexture)` artık yerel ve non-null `val surface` olarak oluşturulur.
- `renderSurface = surface` ile lifecycle için saklanır.
- `mpv?.attachSurface(surface)` ile API'ye nullable değer geçirilmez.
- Önceki v17.2.1 TypeScript semantic gate ileri sürüm uyumlu hale getirilmiş, semantik kontrolleri aynen korunmuştur.
- v17.2.2 için nullable Surface regresyonunu tekrar engelleyen ayrı hard-gate eklenmiştir.
- Sürüm: 17.2.2 / Android versionCode 170202 / iOS buildNumber 17.2.2 / `GPT ELITE v17.2.2 RC1`.
