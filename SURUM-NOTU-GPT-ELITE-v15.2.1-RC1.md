# KIZILKAN PLAYER ELITE v15.2.1-RC1 — Room/SQLite Native Data Core

## Amaç
Playlist seçimi sonrası native ScrollView hareket ederken React Native Pressable/navigation'ın dakikalarca cevap vermemesi sorununu veri mimarisinden çözmek. Dev playlist koleksiyonları JS/Hermes'e otomatik taşınmayacak; Android native Room/SQLite indeksinden yalnız gerekli sayfa istenecek.

## Yapılanlar
- `kizilkan-native-core` Room 2.8.3 + KSP ile gerçek SQLite persistence/index katmanına geçirildi.
- `playlist_snapshots` ve `media_items` tabloları eklendi.
- Playlist dosyası stamp+size ile doğrulanır; değişmediyse reindex yapılmaz.
- Reindex tek transaction ve 750 kayıtlık batch insertlerle yapılır.
- `getCategories`, `queryItems`, `getItem`, `reindexPlaylist`, `removePlaylistIndex` native API'leri eklendi/güçlendirildi.
- `queryItems` LIMIT/OFFSET paging ve `total/hasMore` döndürür.
- Canlı TV ana ekranı native paging modunda ilk 80 kanalı ister; `onEndReached` ile yeni sayfa yükler.
- Provider kategorileri SQLite GROUP BY sonucundan gelir; ilk sayfa üzerinden eksik kategori üretmez.
- Özel kullanıcı grupları ve VOD/Series için mevcut legacy hydrate fallback korunur; özellik çıkarılmadı.
- bigStore playlist silerken Room index'i de temizler.
- `checkplayercore.js` önceki unreachable Native Core gate hatası düzeltilerek Room/KSP/schema/paging kontrolleri gerçek HARD gate içine alındı.

## Bilinçli sürüm kararı
Room 3.0.1 güncel olsa da KMP odaklı yeni major/breaking yüzeyi bu Android-only Phase 1'e eklenmedi. Room 2.8.3 olgun 2.x hattı ve Cursor/JNI performans düzeltmesi nedeniyle seçildi.

## Korunanlar
Media3 → MPV/FFmpeg → VLC, libmpv 1.0.0, Scan Engine, background scan, MAG/Stalker, Hızlı Yapıştırma, Çoklu Hesap, resume/seek, favoriler, özel gruplar, EPG ve TV davranışları kaldırılmadı.

## Henüz kanıtlanmayan
Bu paket burada gerçek Gradle/KSP/APK build görmedi. GitHub Actions `tsc --noEmit`, KSP Room compiler, Kotlin/Gradle ve gerçek cihaz performans testi geçmeden stabil/çözülmüş sayılmaz.
