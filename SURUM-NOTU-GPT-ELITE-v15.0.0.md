# GPT KIZILKAN PLAYER ELITE v15.0.0 — Playback Core

## Temel
v15.0.0, v14.2.0 tabanından geliştirilmiştir.
Package ID korunur: `com.gpt.kizilkan.player`.

## v14.2 açılış çökmesi
- `PlayerHost` içindeki `isPlayingRef.current`, `isBufferingRef.current`,
  `showControlsRef.current`, `sheetRef.current` yazımları ilgili `useRef`
  tanımlarından sonra çalışacak şekilde düzeltildi.
- Aynı sınıf kullanım-önce-tanım/TDZ hatası için HARD denetleyici ve
  self-test eklendi.

## Playback Core
- Tek orkestratör PlayerHost korunur.
- Media3, MPV/FFmpeg ve VLC birbirinden bağımsız motor profilleri olarak yönetilir.
- Session ID + profile-generation gate + transition lock korunur/geliştirilir.
- Eski session veya eski motor callback'i yeni playback UI/state'ini değiştiremez.

## AUTO motor sırası
- Media3: ana hızlı motor.
- Media3 unsupported codec / extractor / decoder fatal -> MPV / FFmpeg.
- Media3 HTTP/auth/network davranışı -> VLC transport yolu.
- Media3 ready ancak first-frame yok -> bir kez alternatif SurfaceView/TextureView;
  AUTO'da devamında MPV/FFmpeg.
- MPV gerçek fatal hata -> VLC HW.
- VLC HW gerçek native fatal hata -> VLC SW.
- VLC SW gerçek fatal hata -> final error.
- Runtime clock stall tek başına motor değiştirmez.

## VLC non-destructive health
- v14.1/v14.2 snapshot watchdog AUTO motor kararından tamamen çıkarıldı.
- Snapshot callback gecikti diye çalışan VLC artık stop edilmez.
- VLC başarı: Playing + video metadata/track + ilerleyen playback clock.
- Çalışan VLC oturumunda geç/spurious EncounteredError görüntüyü kesmez.
- HW -> SW yalnız gerçek native fatal error'da yapılır.
- Final error sırasında arkada oynayan VLC bırakılmaz.

## MPV / FFmpeg motoru
- Yeni local Expo Android native module: `frontend/modules/mpv-player`.
- AAR: `dev.jdtech.mpv:libmpv:0.5.1`.
- SurfaceView, HW decode + FFmpeg/libmpv fallback stack.
- User-Agent / Referer / custom HTTP header, buffer, volume, speed,
  fit, A/V delay, seek, audio/subtitle track desteği.
- PlayerHost play/pause/reload/zap/seek/track/cast lifecycle'ına bağlandı.
- MPV progress gerçek `time-pos` property üzerinden 1 saniye civarı throttle edilir.
- Geçici view detach libmpv'yi destroy etmez; Expo `OnViewDestroys` gerçek cleanup yoludur.
- Playback başladıktan sonra eski/non-fatal MPV log satırı END_FILE'da yanlış final
  hata üretemez.
- Aynı kanal retry'da singleton MPV native view remount edilmeden source yeniden yüklenir.

## Runtime stall / donma
- Stall = foreground + başarılı playback + kullanıcı pause değil + buffering değil +
  playback clock ilerlemiyor.
- İlk aşama: aynı motor/profil pause/play soft-resync.
- İkinci aşama: aynı motor/profil temiz session restart.
- Clock stall tek başına Media3->MPV/VLC veya VLC HW->SW yapmaz.
- Uygulama background'da veya gerçek buffering'de yanlış stall recovery çalışmaz.

## Aynı kanal yeniden açma
- PlayerHost kalıcı mount olsa bile session başlangıcı `visible` false->true geçişine bağlıdır.
- Aynı kanal kapatılıp tekrar açıldığında Media3/VLC/MPV kesin yeni session alır.
- Media3 source URL cache yeni session'da invalidate edilir.
- VLC native view generation artar.
- MPV source generation artar fakat singleton native view korunur.

## VOD / Series ilerleme
- Eski Media3-only polling kaldırıldı.
- Media3/VLC/MPV ortak native playback-clock modelinden 5 saniyede bir Library progress yazılır.
- Player/route kapanırken son progress ayrıca flush edilir.
- Kaldığın yerden devam üç motorda da korunur.

## Buffer
- Hızlı: 450 ms.
- Dengeli: 1500 ms — v15 varsayılanı.
- Stabil: 4000 ms.
- Eski gelişmiş 0/300/450/1000/1500/2500/4000/6000 seçenekleri korunur.
- Player paneli ve Ayarlar aynı storage anahtarını kullanır.

## Xtream / HTTP
- `.ts` / `.m3u8` alternatif yayın yolu aktif motor profili korunarak denenir.
- Alternatif URL'ye geçiş yeni session oluşturur ancak motoru istemeden AUTO başlangıcına döndürmez.
- Media3 PlaybackRequest User-Agent/Referer/custom headers taşır.
- Kanal Test Et JSON/HTML HTTP 200 cevabını medya başarılı saymaz.

## TV Box şerit / ekran boyanması
- Kalıcı PlayerHost korunur.
- `playerHidden` artık `opacity:0 + zIndex:-1` kullanmaz.
- Gizli player surface'i detach/GONE yapmak yerine ekran dışına taşınır.
- Player root opak `#000` ve `overflow:hidden`.
- MPV SurfaceView: siyah opaque, `PixelFormat.OPAQUE`, normal Z-order.
- Android 14+: `SURFACE_LIFECYCLE_FOLLOWS_ATTACHMENT`.
- Eski alpha/zIndex yaklaşımına dönüş HARD gate ile yasaktır.
- Media3 TV ana yolu SurfaceView; TextureView yalnız recovery seçeneğidir.

## Korunan v14.2 özellikleri
- Çoklu IPTV hesap ekleme (manuel / CSV / TXT / JSON).
- Sunucu ile üç giriş yöntemi.
- Native background panel/DNS scan.
- Streaming scan results.
- DNS self-heal.
- Playlist tür renkleri / sunucu kodu / özel playlist adı.
- Tümünü Güncelle 2 worker.
- +18 cache/switch/PIN.
- Backup/restore.
- Zap, kayıt, screenshot, cast, sleep, track, subtitle, A/V sync, speed, fit.
- Telefon touch ve TV focus altyapısı.

## CI / build kapısı
GitHub workflow sırası:
1. `yarn install`
2. `node ../tools/denetle.js` HARD gate
3. `npx tsc --noEmit` HARD gate
4. `expo prebuild --platform android --clean`
5. manifest / TV / HTTP doğrulama
6. gerçek Gradle release/debug assemble
7. APK package/version/signature doğrulama

## Yerel ortam sınırı
Bu çalışma ortamında proje `node_modules` yüklü değildir ve registry DNS erişimi
yoktur. Bu nedenle tam Expo TypeScript/Gradle build'i yerelde gerçekleştirilemedi.
Global `tsc` bağımlılık tiplerini bulamadığı için anlamlı bir proje semantik sonucu
üretemez. Gerçek semantik + native build GitHub Actions HARD gate'inde yapılacaktır.

## Sürüm
- version: 15.0.0
- buildNumber: 15.0.0
- Android versionCode: 150000
- package: com.gpt.kizilkan.player
