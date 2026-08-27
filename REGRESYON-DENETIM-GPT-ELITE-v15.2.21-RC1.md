# Regresyon Denetimi — v15.2.21 RC1

- [x] v15.2.20 Flight Recorder V3 kaynakları korunuyor.
- [x] NativeBlackBox / Room schema v3 / diagnostic DAO-entity korunuyor.
- [x] Crash handler önceki handler'a delegasyon yapıyor; crash yutulmuyor.
- [x] ANR watchdog, process state summary ve kritik journal sözleşmeleri korunuyor.
- [x] Playlist Promise<void> semantik gate geçiyor.
- [x] Media3 EngineProfile TS2339 kök nedeni giderildi.
- [x] Media3 hata telemetrisinde decoder yalnız VLC/MPV profillerinden okunuyor.
- [x] Media3 surface telemetrisi korunuyor.
- [x] v15.2.14→v15.2.21 tüm `denetle.js` gate zinciri gerçek Node ile PASS.
- [x] TS/TSX transpile syntax taraması uygulanacak paket doğrulamasında raporlanır.
- [ ] Tam `npx tsc --noEmit`: node_modules olmadığı için bu ortamda çalıştırılamadı.
- [ ] Expo prebuild / Kotlin / Gradle / release APK: GitHub Actions verify branch ile doğrulanmalı.
