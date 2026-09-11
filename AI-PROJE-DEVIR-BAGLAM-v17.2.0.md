# KIZILKAN PLAYER — AI DEVİR BAĞLAMI v17.2.0-RC1

## Kaynak durumu
Bu paket canlı Git clone'u değildir; v17.1.2 tabanından oluşturulmuş doğrulanabilir corrective çalışma ağacıdır. Gerçek Git repo üzerine **overlay** olarak uygulanmalı ve commit öncesi diff zorunlu kontrol edilmelidir.

## v17.2.0 ana değişiklikleri
- Native TXT/CSV streaming scan producer/consumer queue.
- Adaptive concurrency + encrypted journal + process recovery.
- Native sınırlı file preview; Android büyük dosya için JS full-text hot path kaldırılması.
- DB Content Cleanup Center: Live/VOD/Series/EPG transaction + post verification; playlist/account korunur.
- Diagnostics fast database health ve export single-flight.
- Media3 hidden timeUpdate 60s.
- Next/Previous canonical Room fallback.
- MPV TextureView/SurfaceTexture render yolu ve audio ownership.
- v17.2 hard-gate ailesi.
- Eski gate'ler forward-semver/TextureView mimarisini semantik olarak doğrulayacak şekilde güncellendi; kaldırılmadı.

## Kalan kabul testleri
1. GitHub Actions Android release compile.
2. Tam TypeScript tsconfig build dependency ortamında.
3. MPV TextureView gerçek cihaz görüntü/kontrol/audio overlap.
4. 100k+ TXT/CSV scan pause/resume/cancel/restart.
5. DB cleanup gerçek cihaz veri koruma.
6. Diagnostics büyük DB export süre karşılaştırması.

## Kesin çalışma kuralı
Telefon build sunucusu yapılmayacak. CI/remote build kullanılacak. Bir test çalıştırılmadıysa çalıştırılmış gibi yazılmayacak. Regression için `pin.ts`, `profile-select.tsx` ve unrelated eski belgeler korunacak.
