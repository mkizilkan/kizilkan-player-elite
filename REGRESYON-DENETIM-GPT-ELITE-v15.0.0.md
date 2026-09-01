# GPT KIZILKAN PLAYER ELITE v15.0.0 — Regresyon Denetimi

## Koddan doğrulanan
- v14.2 `.current of undefined` TDZ kökü kaldırıldı.
- Player Core TDZ/self-test HARD gate var.
- Media3 gerçek first-frame kullanıyor.
- VLC snapshot AUTO watchdog yok.
- VLC clock stall motor değiştirmiyor.
- MPV üçüncü native engine PlayerHost kontrollerine bağlı.
- MPV geçici View detach'ta destroy edilmiyor.
- Aynı kanal `visible` false->true geçişinde yeni session başlatıyor.
- VOD/Series progress Media3/VLC/MPV ortak clock'tan yazılıyor.
- `.ts/.m3u8` alternatif URL motor profilini koruyor.
- Buffer v15 varsayılanı Dengeli 1500 ms.
- TV hidden player alpha/zIndex kullanmıyor.
- MPV SurfaceView opaque/normal-Z/API34 attachment lifecycle.
- v14.2'den silinen dosya yok.
- Çoklu hesap / DNS / playlist akışları hash olarak v14.2 ile korunuyor.

## Yerel doğrulama
- KIZILKAN HARD denetleyiciler: temiz.
- TypeScript parse/transpile: 103 TS/TSX, 0 syntax/parse hata.
- Player v15 saf mantık testleri: OK.
- Kotlin standalone parser: Android/Expo/libmpv classpath olmadan yalnız harici
  semboller unresolved; parser `expecting/unexpected tokens/syntax error` üretmedi.
- `tsc --noEmit` yerelde node_modules olmadığı için Expo/React türlerini çözemedi;
  bu nedenle gerçek semantik gate GitHub Actions'a bırakıldı.
- Registry erişimi olmadığı için yerelde `yarn install` yapılamadı.

## GitHub build ile doğrulanacak
- Expo local MPV module autolinking.
- `dev.jdtech.mpv:libmpv:0.5.1` AAR indirme/compile.
- Expo Modules `OnViewDestroys` / View AsyncFunction API uyumu.
- Android API 34 `SurfaceView.setSurfaceLifecycle` compile.
- react-native-tvos + Expo SDK 54 release Gradle entegrasyonu.
- APK signing/package/version.

## Telefon test matrisi
1. Uygulama güncelleme olarak açılmalı; `.current undefined` olmamalı.
2. Aynı kanalı 10 kez aç/kapat/aç.
3. Media3 çalışan kanal: hızlı first frame.
4. MPEG-L2/unsupported codec: MPV/FFmpeg fallback.
5. Extractor error: alternatif URL ve/veya MPV.
6. VLC görüntü varken "codec açmıyor" deyip görüntüyü kesmemeli.
7. VLC spurious error çalışan görüntünün üstüne overlay bindirmemeli.
8. Runtime stall: önce soft resync, sonra aynı profile restart.
9. MPV manuel motor seçimi.
10. MPV play/pause/seek/speed/A-V delay/audio/subtitle.
11. Film/dizi: Media3/VLC/MPV ile kaldığın yerden devam.
12. Live -> VOD -> Live; arkada ses kalmaması.
13. Buffer Hızlı/Dengeli/Stabil ve gelişmiş seçenekler.
14. Kanal Test Et JSON/HTML 200 medya saymamalı.
15. Background panel scan ve çoklu hesap regresyonu.

## TV Box test matrisi
1. Aynı kanalda 20 zap.
2. Player paneli 10 kez aç/kapat.
3. Live -> VOD/Series -> Live.
4. Player kapat -> aynı kanal yeniden aç.
5. Media3 SurfaceView ve TextureView recovery.
6. MPV SurfaceView.
7. VLC.
8. Üst/alt mavi/kırmızı şerit olmamalı.
9. Tam/yarım ekran tint/boyanma olmamalı.
10. Eski frame/surface kalmamalı.
11. D-pad/focus gecikmesi/regresyonu.
12. Zap sonrası ses çatallaşması olmamalı.

## Açık teknik gerçek
Fiziksel TV Box testi yapılmadan üretici compositor/codec sürücüsü kaynaklı hiçbir
Surface artefaktına yüzde 100 garanti verilemez. v15 bilinen uygulama tarafı kökleri:
tema bleed-through, alpha/zIndex hidden SurfaceView ve surface lifecycle churn'u
doğrudan kapatır.
