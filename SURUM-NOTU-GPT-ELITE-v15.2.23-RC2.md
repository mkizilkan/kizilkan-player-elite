# SÜRÜM NOTU — KIZILKAN PLAYER ELITE v15.2.23 RC2

- RC1 Flight Recorder V5 + MAG HTTP telemetrisi korunur.
- PanelScan dahil tam tanı geçmişi temizliği tamamlandı; idle snapshot da silinir.
- Gesture Handler callback'leri JS thread'e alındı; Reanimated worklet kaynaklı PlayerHost crash yolu kaldırıldı.
- Media3 fatal codec/decoder fallback görünürlüğü ve VLC video-output HW→SW watchdog eklendi.
- Sonsuz siyah ekran/spinner yerine kontrollü fallback ve terminal hata state'i uygulanır.
- Xtream refresh canonical Room commit doğrulanmadan UI'ya publish edilmez.
- Playlist switch index recovery bir kez `warmPlaylist` ile denenir.
- Flight Recorder 50K per-event AsyncStorage rewrite kaldırıldı; Native Room primary + 5K JS fallback + batched flush/sampled journal mimarisine geçildi.
- Native Flight Recorder snapshot export/read limiti 10K → 50K çıkarıldı; native toplam retention 100K normal + 10K kritik korunur.

### Main-thread / JS event-loop hardening
- Çok büyük Xtream katalogları artık parça parça normalize edilerek periyodik olarak event-loop'a kontrol verir.
- MAG ordered-list pagination ve katalog dönüşümleri de cooperative yield kullanır.
- Böylece Flight Recorder'ın daha önce yakaladığı onlarca saniyelik katalog kaynaklı stall riskinin uygulama tarafındaki senkron CPU bileşeni azaltılmıştır.
