# Playback mimarisi — v13.0.0

## Tercih
PlayerHost daha sağlıklı gerçek mimaridir; SmartVideoPlayer daha küçük bir legacy wrapper'dır.

## Neden tek dosyada eritilmiyor?
Exo ve VLC farklı native lifecycle/track/recording/surface API'lerine sahiptir.
Birleştirilen şey motorların implementasyonu değil, karar ve sağlık katmanıdır.

## AUTO sırası
1. Kanal için doğrulanmış memo profil varsa onu kullan.
2. Exo normal surface profili.
3. Exo alternatif surface.
4. VLC HW.
5. VLC SW.
6. Gerçek hata.

## Başarı kriteri
- Exo: onFirstFrameRender.
- VLC: expo-libvlc-player mevcut API'sinde gerçek rendered-frame callback yok; width/height içeren onFirstPlay video-output readiness için proxy olarak kullanılır.
Bu sınırlama açıkça korunur; native libVLC modülünde ileride gerçek first-frame olayı açılırsa proxy onunla değiştirilmelidir.
