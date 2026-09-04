# DOGRULAMA — v17.1.0 RC1

## Bu ortamda gerçekten çalıştırılan kontroller

- `tools/check-v17013-multiscan-mpv-export.js` — PASS
- `tools/check-v17014-txt-export-dbhealth.js` — PASS
- `tools/check-v17015-typescript-theme-token.js` — PASS
- `tools/check-v1710-ultrascale-scan.js` — PASS
- `tools/checkplayercore.js` — PASS
- `add-playlist.tsx` TypeScript `transpileModule` syntax diagnostics — 0
- `modules/panel-scan/index.ts` TypeScript `transpileModule` syntax diagnostics — 0
- Kotlin CLI parse denemesinde Android/Expo classpath olmadığı için unresolved-reference hataları beklenmiştir; `expecting` / `unexpected tokens` türü Kotlin syntax hatası görülmemiştir.
- v17.0.15 baseline ile dosya diff'i kontrol edildi; MPV modülü değişmedi.

## Bu ortamda çalıştırılmayan / kanıtlanmayan kontroller

- Android Gradle release build çalıştırılmadı.
- Expo/React Native tam `tsc --noEmit` dependency-backed proje build'i çalıştırılmadı.
- Gerçek cihazda 50K+ hesap taraması çalıştırılmadı.
- Process-kill recovery gerçek cihazda çalıştırılmadı.

## Cihaz kabul kriterleri

1. 50K+ hesap dosyası seçilirken ikinci picker çağrısı açılmamalı.
2. Varsayılan batch 15 olmalı; aktif progress en fazla batch hesaplarını göstermeli.
3. Özel paralellik 1–250 kabul edilmeli; ekranda istenen/etkin değer ayrı görünmeli.
4. Tarama boyunca PSS eski ~2 GB büyüme davranışını tekrarlamamalı; yüksek PSS'te etkin worker düşmeli.
5. Uygulama process'i yarım batch'te öldürülürse son tamamlanan batch checkpoint'inden devam etmeli.
6. Bulunan sonuçlar process-kill sonrası korunmalı.
7. Durdur/Duraklat/Devam ve TXT export regresyona uğramamalı.
