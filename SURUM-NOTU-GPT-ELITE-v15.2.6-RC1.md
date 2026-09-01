# KIZILKAN PLAYER ELITE v15.2.6-RC1
## TypeScript HARD-Gate Regression Fix

Bu revizyon v15.2.5-RC1 özelliklerini eksiksiz korur ve GitHub Actions `tsc --noEmit` aşamasında kanıtlanan iki kaynak regresyonunu düzeltir.

### Search Room/Fuzzy tip modeli
Native Room araması doğrudan item döndürürken legacy fuzzy arama `{ item, score }` döndürüyordu. UI artık iki shape taşımaz: fuzzy sonuçlar render öncesi gerçek item dizisine normalize edilir; Room sonuçları aynı `Channel[] / VodItem[] / SeriesItem[]` sözleşmesine girer. Native Series sonucu da artık gerçekten kullanılır.

### Playlist control-flow
Xtream yöntemi zaten `submitXtreamDirect()` ile işlenip return ettiği halde aşağıda kalan eski ikinci Xtream bloğu erişilemez durumdaydı. Duplicate blok kaldırıldı; Android native importer → Room ana yolu ve native olmayan fallback `submitXtreamDirect()` içinde korunur. Üst discovery akışınca tamamen tüketilen ölü `code` branch'i de kaldırılmıştır. MAG/Stalker yolu korunur.

### Korunanlar
Room canonical store, Native EPG, Search/Favorites/VOD/Series paging, Unified Discovery, 5 tarama profili, sunucu kodu/DNS self-heal, Native Player Session Arbiter, Chromecast authority/rebind/handoff, chunked native staging, RAM/storage/APK telemetry ve MPV 1.0 zinciri korunur.

### Doğrulama
Tam dependency ortamı bu paketleme ortamında kurulamadığı için `npx tsc --noEmit`, Expo prebuild, KSP/Kotlin ve Gradle gerçek sonucu GitHub Actions tarafından kanıtlanacaktır.
