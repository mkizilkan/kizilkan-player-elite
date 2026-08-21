# GPT KIZILKAN PLAYER ELITE v14.0.0 — Player V2

## Temel mimari
- Tek gerçek playback orkestratörü PlayerHost olarak korunur.
- Yeni `src/player/v2/` katmanı: PlaybackRequest, session gate, hata sınıflandırması, motor profili/hafıza ve recovery kararları.
- SmartVideoPlayer legacy/deprecated kalır; üretim yolu değildir.
- Media3 motoru mevcut expo-video native binding üzerinden kullanılır. Bu binding Android'de request headers ve gerçek `onFirstFrameRender` sağlar.
- VLC motoru expo-libvlc-player üzerinden korunur.

## Player V2 session izolasyonu
- Her kanal/source/retry yeni playback session ID alır.
- Eski session callback'leri yeni session UI/state'ine dokunamaz.
- Aynı session içinde SurfaceView->TextureView veya VLC HW->SW değişimlerinde profile-generation gate vardır.
- Aynı session'da üst üste hata callback'lerinin çift motor geçişi yapmasını transition lock önler.
- Motor profil çözülmeden Media3/VLC native view başlatılmaz.

## HTTP / PlaybackRequest
- Media3 VideoSource artık kanal header'larını taşır.
- User-Agent ve Referer tek PlaybackRequest içinde normalleştirilir.
- VLC aynı User-Agent'ı, Referer varsa libVLC http-referrer option'ını kullanır.
- Kanal Test Et, player'ın kullandığı gerçek URL ve header setiyle test yapar.
- Not: expo-libvlc-player wrapper genel key/value HTTP header enjeksiyonu sunmadığı için VLC tarafında tüm özel header'lar birebir geçirilemez; User-Agent + Referer desteklenir.

## Hata sınıflandırması
- unsupported codec / MPEG-L2 -> Media3 surface beklemeden VLC.
- extractor/source format hatası -> Media3 surface beklemeden VLC.
- decoder/MediaCodec init -> VLC.
- no-first-frame -> yalnız surface recovery.
- 401/403/407/timeout/network -> Surface/decoder hatası sayılmaz; VLC transport bir kez denenir, aynı network/auth hatasında final hata.
- VLC network/auth hatasında HW->SW decoder gibi anlamsız fallback yapılmaz.
- Ham Java/Media3 hata metni kullanıcı ekranına basılmaz; teknik ayrıntı yerel telemetry'ye kaydedilir.

## Hız / buffer
- v13'teki 4.5 + 4.5 saniyelik sabit watchdog zinciri kaldırıldı.
- First-frame timer yalnız Media3 readyToPlay sonrasında başlar.
- Canlı first-frame eşiği 1800 ms; VOD 2600 ms.
- VLC video-health eşiği live 2200 ms; VOD 3500 ms.
- v13 ve öncesi 1500 ms varsayılan live buffer bir kez 450 ms Player V2 varsayılanına migrate edilir.
- Kullanıcı daha sonra 0/300/450/1000/1500/... tampon değerini elle seçebilir.

## Motor öğrenme
- Yeni profil hafızası: `media3:surfaceView`, `media3:textureView`, `vlc:hw`, `vlc:sw`.
- Başarı yalnız doğrulanmış Media3 first-frame veya VLC video-health proxy sonrasında kaydedilir.
- Tek session başarıyı yalnız bir kez kaydeder; first-frame tekrar event'leri confidence şişirmez.
- Başarısız profiller confidence kaybeder ve gerektiğinde unutulur.
- Telemetry son 20 sonucu cihazda yerel olarak tutar.

## Audio-only
- Radio/audio-only metadata'sı tespit edilen kaynaklar video-frame watchdog'a sokulmaz.
- Bu yayınlar playing event'i ile başarılı sayılabilir.

## VLC sınırı
- Mevcut expo-libvlc-player wrapper gerçek rendered-first-frame callback'i sunmuyor.
- v14 VLC sağlığı video metadata + ilerleyen native playback clock ile doğrulanır.
- Bu bir proxy'dir; gerçek frame callback varmış gibi raporlanmaz.
- Wrapper gelecekte native first-frame event açarsa bu proxy onunla değiştirilecektir.

## Korunan özellikler
- Zap, kayıt, screenshot, ses track, altyazı, speed, A/V sync, seek/jump, sleep, fit, cast, TV focus, kalıcı PlayerHost, gizli gesture izolasyonu.
- v13 native background panel/DNS scan modülü ve streaming results korunur.
- Şerit/boyanma için kalıcı PlayerHost mimarisi korunur.

## Sürüm
- version: 14.0.0
- buildNumber: 14.0.0
- Android versionCode: 140000
- package: com.gpt.kizilkan.player
