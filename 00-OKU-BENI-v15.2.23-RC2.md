# KIZILKAN PLAYER ELITE v15.2.23 RC2 — COMPLETE CORRECTIVE

Bu paket v15.2.23 RC1'in üzerine, kullanıcı tarafından açık bırakıldığı tespit edilen P0 sorunları aynı 15.2.23 sürüm hattında tamamlar. RC1'deki Flight Recorder V5 ve MAG/Stalker telemetrisi korunmuştur; özellik çıkarılmamıştır.

## RC2'de tamamlanan eksikler
- **Tam temizleme:** PanelScan `diagnostic_events`, `last_crash` ve aktif tarama yoksa eski `snapshot` da temizlenir. Hem üstteki “İstatistikleri sıfırla” hem alttaki “Geçmişi Temizle” butonu Flight Recorder + process-exit görünümü + scan tanı state'lerini temizler.
- **Gesture/Reanimated crash:** Player gesture callback'leri `Gesture.*.runOnJS(true)` ile JS thread authority altında çalışır. UI worklet içinden React ref/state/Dimensions/native çağrı yolu kaldırılmıştır. Gerçek cihazdaki `CppException / undefined is not a function / PlayerHostTsx2 / GestureHandler-Reanimated` zincirinin kök neden sınıfı hedeflenmiştir.
- **Media3 codec fallback / siyah ekran:** fatal codec/decoder fallback telemetrisi eklendi. Media3 sonrası VLC yalnız ses üretip doğrulanmış video-output vermezse HW -> SW bir kez denenir; SW de görüntü üretmezse spinner sonsuza kadar kalmak yerine terminal hata üretilir.
- **Xtream/Room consistency:** ağır katalog React state'e artık canonical bigStore/Room commit ve summary doğrulamasından önce publish edilmez. `PLAYLIST_COMMIT_START/READY/FAILED` kayıtları eklendi. Playlist seçiminde index problemi için kontrollü `warmPlaylist` recovery eklendi.
- **Main-thread stall hardening:** Flight Recorder her eventte 50K AsyncStorage JSON blob'unu yeniden parse/stringify etmez. Native Room/WAL tam geçmiş authority'sidir; JS fallback cache 5K ile sınırlı, AsyncStorage flush 64 olayda bir, JSONL normal olaylar örneklemeli; kritik/warn olaylar kalıcıdır. Export/read sırasında native snapshot 50K'ya kadar alınabilir.

## Sürüm kimliği
- Uygulama semantic sürümü: `15.2.23`
- Android versionCode: `150223`
- Paket revizyonu: **RC2** (RC1'in yerini alan aynı v15.2.23 corrective paket)

## Doğrulama sınırı
Bu ortamda JS syntax + tüm mevcut hard-gate zinciri + yeni RC2 hard-gate gerçek çalıştırılmıştır. Tam `tsc --noEmit`, Kotlin/Gradle/APK build ve cihaz acceptance GitHub Actions/fiziksel cihazda ayrıca doğrulanmalıdır.

### RC2 son ek doğrulaması
Bu RC2 ayrıca Xtream ve MAG büyük katalog normalizasyonunda cooperative event-loop yield içerir. Bu değişiklik, Flight Recorder persistence optimizasyonuyla birlikte main-thread/JS stall riskini azaltmak için eklenmiştir.
