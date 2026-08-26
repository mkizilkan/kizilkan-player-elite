# KIZILKAN PLAYER ELITE v15.2.18 RC1 — Düzeltme Yorumu

Bu sürüm v15.2.17 üzerine eklenmiştir; mevcut MAG/Stalker, native scan staging, player fallback ve Room mimarisi korunmuştur.

## Uygulananlar
- Playlist değişiminde eski native özetin ekranda kalmasını önlemek için seçim anında `nativeSummary` sıfırlanır ve hedef playlist özeti doğrudan yeniden okunur. Başarı/hata kara kutuya yazılır.
- Player seek istekleri motor, faz ve buffering durumu ile kaydedilir.
- App foreground/background geçişleri BLACK BOX olayına çevrilir.
- İlk görüntüsü başarıyla gelmiş ve oynayan oturumda gecikmiş/stale buffering callback'inin görüntünün üzerinde sonsuz spinner bırakması engellenir. Buffering telemetrisi kaldırılmamıştır.
- Flight recorder V2: 400 olaydan 1500 olaya çıkarıldı; V1 kayıtları okunabilir kalır; export formatı `KIZILKAN_BLACK_BOX_V2` oldu.
- v15.2.17 büyük unified scan payload'ını Binder Intent içine taşımayan app-private staging dosyası mimarisi aynen korunmuştur.

## Bilerek yapılmayan iddialar
- APK bu ortamda Android toolchain/node_modules olmadığı için derlenmedi ve fiziksel cihazda test edilmedi.
- MAG portal uyumluluğunun tüm sağlayıcılarda çözüldüğü iddia edilmez; v15.2.17 hardening korunur ve yeni kara kutu sonraki gerçek cihaz testinde kök neden kanıtı üretmek için genişletilmiştir.
