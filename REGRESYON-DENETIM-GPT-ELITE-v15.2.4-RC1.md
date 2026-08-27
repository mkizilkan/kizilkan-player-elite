# REGRESYON DENETİMİ — v15.2.4-RC1

## HARD kabul kriterleri
1. Background→foreground profil reset: 0.
2. Room canonical playlist importundan sonra legacy JSON zorunluluğu: 0.
3. Aynı playlistin tekrar eklenmesi: 0 duplicate kayıt.
4. Search/Favorites/Detail/Stats normal kullanımında full playlist hydrate: Android Native Core modunda yok.
5. VOD/Series scroll: paged Room query.
6. EPG ilk kanal ekranını bloklamaz; now/next görünür kanal bazlı native sorgu.
7. Unified discovery gerçek tested/total ve hesap bazlı progress gösterir.
8. Pause/Resume/Stop native discovery'de çalışır.
9. Completed stale scan snapshot Activity restore'da modalı zorla açmaz.
10. Sunucu kodu editinde gerçek doğrulama başarısızsa eski binding korunur.
11. Player stale session callback native generation gate tarafından reddedilir.
12. APK footprint raporu ABI/native `.so` dağılımını üretir.

## Özellikle gerçek cihazda test
- 1 / 3 / 5 playlist ile açılış ve touch responsiveness.
- M3U URL ve dosya: büyük liste eklenirken UI tepkisi.
- Xtream: katalog indirirken background/foreground.
- Çoklu discovery: 4 farklı credential, panel/address progress gerçek artmalı.
- Scan pause 10 sn → tested artmamalı; resume → devam etmeli; stop → active state bitmeli.
- EPG büyük XMLTV: kanal listesi EPG'den önce kullanılabilir olmalı.
- 1080p→4K→1080p ve 10 ZAP: eski ses/fallback overlay kontrolü.
- Stats Native Core Telemetri: RAM PSS ve Room/legacy footprint gerçek değer göstermeli.

## Bilinen sınır
MAG/Stalker ağ protokolü bu RC'de foreground service'e taşınmamıştır. Cihaz içi async protokol + deterministic duplicate guard + Room canonical persist korunmuştur.
