# KIZILKAN PLAYER ELITE v15.2.8-RC1

## Kök neden düzeltmeleri
- PanelScan ve BulkPlaylistImport stale snapshot yarışları runId/generation sözleşmesiyle kapatıldı.
- Discovery sonucu artık "kimlik doğrulaması başarılı aday" olarak ifade edilir; gerçek eklenebilirlik import aşamasında endpoint + Room doğrulamasıyla belirlenir.
- Xtream endpoint hataları LIVE/VOD/SERIES bazında snapshot tanısına eklenir; sessiz hata yutma kaldırıldı.
- Live VLC false-stall: media-time tek sağlık sinyali değildir; soft pause/play enjeksiyonu kaldırıldı.
- Aynı M3U/MAG kaynağı canonical identity ile ikinci kez eklenemez.
- Room doğrulanmışsa orphan legacy heavy dosya temizlenir.
- Android 11+ ApplicationExitInfo telemetrisi eklendi.
