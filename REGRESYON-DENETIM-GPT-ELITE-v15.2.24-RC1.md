# REGRESYON DENETİMİ — v15.2.24 RC1

| Alan | Koruma / yeni kontrol |
|---|---|
| MAG protokol | v15.2.14-23 fixture/gate zinciri korunur |
| MAG duplicate download | `stalkerCatalogInFlight` + davranışsal single-flight fixture |
| MAG cache | cache hit ve forceFresh fixture ile doğrulanır |
| MAG progress | Live/VOD/Series aşama ve sayfa ilerlemesi kaynak gate'inde aranır |
| Room consistency | `PLAYLIST_SWITCH_VERIFY_READY` active publish'ten önce olmak zorunda |
| Media3 stall | 5s background / 1s UI adaptive interval sözleşmesi |
| Codec fallback | v15.2.23 RC2 gate korunur |
| Gesture crash | v15.2.23 RC2 gate korunur |
| Flight Recorder V5 | v15.2.23 gate korunur |
| Tam temizleme | Panel Scan + diagnostics reset gate korunur |

Çalıştırılan gate'lerin tamamı ayrı süreçlerde exit 0 vermiştir. `tools/denetle.js` bütün zinciri kaydeder; uzun toplu koşu çalışma ortamı süre sınırına takıldığı için zincirin kalan kontrolleri ayrıca tek tek çalıştırılıp doğrulanmıştır.
