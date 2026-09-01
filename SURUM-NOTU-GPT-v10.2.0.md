# GPT KIZILKAN Player — GPT v10.2.0

## Amaç
GPT v10.1.0 gerçek cihaz testinde görülen regresyonları toparlar.
Referans/golden davranış: Claude v9.19.0 YOL B kalıcı PlayerHost.

## Düzeltmeler
- Fullscreen `tv-focus-catcher` üzerindeki zorunlu preferred-focus kaldırıldı.
  Genel `FocusButton` preferred-focus düzeltmesi korunur.
- Film/Dizi PosterGrid v9.19'un çalışan render/virtualization geometrisine döndü.
- Çok kolonlu grid'i zıplatan programatik `useFocusScroll` kullanımı geri getirilmedi.
- StickyHeader tekrar PosterGrid `ListHeaderComponent` olarak kullanılır.
- VOD/Series çıkışında Exo `pause + replace(null)` ile source/audio session bırakılır.
- Canlı yayında source unload yapılmaz; kalıcı PlayerHost yüzeyi korunur.
- VLC çıkışında gerçek `stop()` kullanılır.
- Exo hata ekranına `VLC ile Dene` fallback düğmesi eklendi.
- Player Controls v2 ve sheet focus düzenlemeleri korunur.

## Sürüm
- GPT v10.2.0
- Expo version: 10.2.0
- iOS buildNumber: 10.2.0
- Android versionCode: 100200
- package.json: 10.2.0

## Doğrulama
- KIZILKAN 8/8 denetleyici temiz.
- TypeScript 5.8.3: 89 TS/TSX parse/transpile hata 0.
- JSON/YAML temiz.
- TDZ ve kritik kaynak invariantları temiz.
- ZIP CRC temiz.

## Dürüst sınır
Bu ortamda frontend node_modules/Android Gradle ortamı yok; gerçek `tsc --noEmit`,
Expo prebuild ve Gradle APK build burada çalıştırılmadı. Homatics gerçek cihaz testi
şerit/tint, afiş/focus ve VOD çıkış sesi için belirleyicidir.
