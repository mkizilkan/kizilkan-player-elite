# GPT KIZILKAN PLAYER ELITE v12.5.0 — Regresyon Denetimi

## Koddan doğrulanan
- PlayerHost kalıcı mount mimarisi korunmuştur.
- `PlayerContext.tsx`, `app/player.tsx` ve GitHub build workflow v12.0.0 ile hash olarak aynıdır.
- Gizli PlayerHost telefon gesture'ları devre dışıdır.
- Gizli PlayerHost TV focus catcher render etmez.
- Hidden player BackHandler görünmezken olayı tüketmez.
- VOD/Series player gizlenince VLC stop, Exo pause/source-null ve track reset yolları mevcuttur.
- Zap öncesi eski VLC source stop ve track reset yolları mevcuttur.
- Stats reset `clearAllProgress + clearRecent` yapar.
- Özel grup yatay sayaçları `panelCategories` count üzerinden okunur.
- Tüm playlistleri güncelle akışı mevcuttur.
- Backup v2 playlist metadata + heavy channels/VOD/series içerir.
- DNS self-heal preferred + validated + güncel Firebase host sırasını kullanır.
- Multi-add ve ardışık update/remove işlemlerinde PlaylistContext güncel ref üzerinden persist eder.

## Telefon cihazında kullanıcı tarafından daha önce doğrulanan
- Splash/logo merkezleme sağlam.
- Panel klavye over-scroll büyük ölçüde düzeldi.
- Tarama yüzde + panel/adres sayaçları çalışıyor.
- Çoklu panel seçimi ve birden fazla playlist ekleme çalışıyor.
- Active/Expired ayrımı çalışıyor.
- +18 gizleme çalışıyor; v12.5.0 performans ve switch UX'i yenidir, yeniden test edilmelidir.

## Cihaz testi bekleyen
- v12.5.0 canlı liste dokunmatik gesture izolasyonu.
- Son playlist 4 saniye auto-continue.
- Tüm DNS sonuçlarının üç giriş modunda doğru listelenip seçilmesi.
- +18 cache performansı ve PIN ile tekrar görünür yapma.
- ELITE shared kayıt klasörü.
- Profil/PIN tekrar açılış siyah ekran regresyonu.
- TV Box: D-pad/focus, PosterGrid hızlı gezinme, player paneli, zap sesi, VOD/Series -> Live geçişi.
- TV Box: şerit/görüntü boyanmasının geri gelmemesi.
- Exo MPEG-L2/unsupported audio -> VLC fallback ve hata recovery.
- Yedekleme/geri yükleme gerçek cihaz round-trip.
