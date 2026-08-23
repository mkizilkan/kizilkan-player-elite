# REGRESYON DENETİMİ — v15.2.7-RC1

- [x] GitHub logundaki gerçek Kotlin hata satırı kaynakta doğrulandı.
- [x] `OutputStream.bufferedWriter(charset, bufferSize)` geçersiz çağrısı kaldırıldı.
- [x] 64 KiB buffer korunarak `BufferedWriter(OutputStreamWriter(...), 64 * 1024)` kullanıldı.
- [x] Aynı native-core kaynak ağacındaki buffered writer/reader çağrıları tarandı.
- [x] v15.2.6 TypeScript fixleri korunur.
- [x] Room/KSP, chunked staging, Chromecast, Unified Discovery, Native EPG, Player Session ve telemetry özellikleri korunur.
- [ ] GitHub `:kizilkan-native-core:compileReleaseKotlin` gerçek sonucu bekleniyor.
- [ ] Gradle release/APK gerçek sonucu bekleniyor.
