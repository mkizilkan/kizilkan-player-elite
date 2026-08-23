# REGRESYON DENETİMİ — v15.2.1-RC1

## Room Native Data Core
- [ ] GitHub `tsc --noEmit` = 0
- [ ] `:kizilkan-native-core:kspReleaseKotlin` başarılı
- [ ] `:kizilkan-native-core:compileReleaseKotlin` başarılı
- [ ] Gradle release + signing + APK artifact başarılı
- [ ] Playlist ilk seçildiğinde UI tıklanabilir; 5–10 dk touch lock yok
- [ ] Canlı ilk sayfa hızlı gelir
- [ ] 80 kayıt sonrası aşağı kaydırmada devam sayfası gelir, duplicate yok
- [ ] Kategori sayıları ve toplam kanal sayısı tam playlist ile doğru
- [ ] Playlist değişince eski Room index kullanılmaz
- [ ] Playlist güncellenince stamp/size değişimi reindex tetikler
- [ ] Playlist silinince Room index temizlenir
- [ ] Özel kullanıcı grupları legacy fallback ile kaybolmaz
- [ ] VOD/Series mevcut davranışını korur

## Önceki kritik özellikler
- [ ] MPV 1.0.0 instance lifecycle
- [ ] 4K HW→SW recovery
- [ ] ZAP sonrası eski ses kalmıyor
- [ ] Resume Media3/MPV gerçek position confirmation
- [ ] VLC VOD regresyonu ayrıca test
- [ ] Native Scan Pause/Resume/Stop ve background
- [ ] Çoklu hesap bulunan sonuçlar canlı gösterim
- [ ] Settings UI overlap yok

## RAM / performans ölçümü
- [ ] cold start PSS/RSS
- [ ] playlist loaded PSS/RSS
- [ ] 1080p playback PSS/RSS
- [ ] 4K MPV PSS/RSS
- [ ] 20 ZAP sonrası PSS/RSS; monoton leak yok
