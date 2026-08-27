# KIZILKAN PLAYER ELITE v15.2.24 RC2 — Düzeltme Yorumu

RC1 özellikleri korunmuştur. RC2, gerçek cihaz telemetrisi ve kaynak kod çapraz incelemesinde ortaya çıkan bellek/çift-veri-yolu riskini azaltır.

- Ana katalog ekranında Android Native Core/Room mevcutken Room summary sayaçları canonical kabul edilir; JS ağır dizi length değerleri Room yolunu gölgelemez.
- Native Room sayfa sorgusu hata verdiğinde tüm Live/VOD/Series kataloğunu JS heap'e hydrate eden otomatik hata fallback'i kaldırıldı. Özel kullanıcı gruplarının mevcut davranışı korunmuştur; bu özellik gerektiğinde legacy veriyi halen isteyebilir.
- Unified panel taramada candidate×account büyüklüğünde `ArrayList<Work>` artık oluşturulmaz. Round-robin sıra, cursor indeksini çalışma anında çözen bounded yapı ile korunur.
- Periyodik scan snapshot'ı bütün geçmiş eşleşmeleri tekrar JSON'a çevirmek yerine son 200 eşleşmeyi taşır; `found` toplam sayacı korunur.
- MAG handshake uyumluluğuna kontrollü `mag250-raw`, `mag250-encoded`, `mag254-encoded` profilleri eklendi. Her deneme/başarı/hata telemetriye yazılır ve başarılı profil oturum boyunca sonraki çağrılarda kullanılır.
- MAG kategori timeout'u 60s→30s; büyük Live/VOD/Series katalog çağrıları 120s→60s üst sınıra çekildi. RC1 single-flight/cache/progress mekanizmaları korunur.
- Media3 RC1 adaptif timeUpdate azaltımı, verified Room activation, Flight Recorder V5 ve önceki tüm düzeltmeler korunur.

## Dürüst kapsam notu
Bu RC2, bütün uygulamadaki `activePlaylist.channels/vod/series` legacy tüketicilerini tamamen kaldırmaz. `tv-home`, favorites/search/stats/settings gibi ekranların native-only dönüşümü ayrı ve geniş bir migration gerektirir. Bu sürümde yapılmamış bir işi yapılmış göstermiyoruz.
