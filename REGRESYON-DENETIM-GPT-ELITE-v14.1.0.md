# GPT KIZILKAN PLAYER ELITE v14.1.0 — Regresyon Denetimi

## Statik doğrulanan
- 8/8 KIZILKAN denetleyici temiz.
- 100 TS/TSX parse/transpile: 0 hata.
- Player V2 saf mantık testleri: MPEG-L2, extractor, 401, 407, surface fallback, session izolasyonu OK.
- v14.0.0'dan silinen dosya: 0.
- Workflow, native panel-scan service/module, PlayerContext ve app/player v14.0.0 ile hash olarak korunmuştur.
- VLC snapshot callback köprüsü PlayerHost <-> VlcPlayerView arasında mevcuttur.
- JSON/HTML HTTP 200 medya başarılı sayılmaz.
- Settings `Tümünü Güncelle`, genel buffer, playlist tür renkleri, server playlist adı ve sunucu kodu görünürlüğü koddan doğrulandı.
- DNS current-directory priority + working DNS persist koddan doğrulandı.

## Cihaz testi bekleyen
1. Önceden görüntü arkasında `VLC donanım görüntüsü oluşmadı` çıkan TRT/TRT Türk benzeri kanallarda yanlış-negative watchdog'un kaybolması.
2. Aynı kanala 10 kez gir/çık: ses+görüntü sürekliliği.
3. VLC HW gerçek görüntü veriyorsa SW'ye gereksiz geçmemesi.
4. Gerçek HW başarısızlığında SW recovery.
5. Gerçek final failure'da hata arkasında yayının devam etmemesi.
6. Kanal Test Et: application/json yanıtını provider/source problemi olarak göstermesi.
7. Üç sunucu giriş yolunda özel playlist adı + sunucu kodu.
8. Firebase DNS değişikliği sonrası mevcut playlistin otomatik yeni DNS'e geçmesi.
9. Playlist kart renkleri ve aktif kırmızı çerçeve.
10. Ayarlar > Tümünü Güncelle 2 worker ilerlemesi.
11. Ayarlar buffer seçimi ile player paneli buffer seçiminin aynı değeri kullanması.
12. TV Box: D-pad/focus/surface/şerit-boyanma regresyonu ayrıca yapılmalı.

## Bilinen teknik sınır
- `expo-libvlc-player` snapshot yolu Android tarafında gerçek render edilmiş görüntüyü doğrulamak için kullanılır; cihaz/package snapshot callback'i çalışmazsa compatibility proxy devreye girer.
- Gerçek Android Gradle/APK build ve cihaz testi bu çalışma ortamında yapılmamıştır.
