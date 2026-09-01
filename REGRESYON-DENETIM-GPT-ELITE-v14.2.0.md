# GPT KIZILKAN PLAYER ELITE v14.2.0 — Regresyon Denetimi

## Kod/statik doğrulama
- v14.1.0'a göre silinen dosya: 0 olmalıdır.
- Package ID `com.gpt.kizilkan.player` korunur.
- PlayerContext, app/player, build workflow ve native panel-scan kritik mimarisi korunur.
- KIZILKAN denetleyici 8/8 temiz olmalıdır.
- TS/TSX parse/transpile hata sayısı 0 olmalıdır.
- Bulk CSV/TXT/JSON/manual parser testleri temiz olmalıdır.
- Player V2 error/session/clock logic testleri temiz olmalıdır.

## Telefon test matrisi
1. Aynı canlı kanalı 10 kez aç/çık: hayalet ses/eski hata overlay'i yok.
2. 10+ dakika canlı izleme: UI akıcı, kontrol paneli dokunmaya cevap verir.
3. Gerçek network stall: önce soft resync, devam ederse kontrollü fallback/restart.
4. Normal buffering sırasında watchdog yanlış motor değiştirmemeli.
5. Uygulama background -> foreground: background süresi stall sayılmamalı.
6. Manuel pause: watchdog devreye girmemeli.
7. Media3 MPEG-L2/extractor hata: mevcut hızlı VLC fallback korunmalı.
8. VLC gerçek görüntü sağlık/snapshot davranışı v14.1.0'a göre regresyon yapmamalı.
9. Tampon seçimleri player paneli ve genel Ayarlar'da aynı değeri göstermeli.
10. VOD/Series progress kaydı devam etmeli; kontroller gizliyken gereksiz UI render beklenmez.

## Çoklu hesap test matrisi
1. Formdan 2 hesap -> ikisi de playlist olarak eklenir.
2. Form + CSV dosyası aynı anda -> birleşik önizleme ve tek toplu işlem.
3. CSV başlıklı, TXT pipe, JSON accounts biçimleri.
4. Yalnız kullanıcı+şifre -> panel otomatik keşfi.
5. Sunucu kodlu hesap -> tüm DNS taranır, serverCodeBinding saklanır.
6. Panel adlı hesap -> doğru panel ve DNS'ler.
7. Aynı credentials iki farklı panelde -> otomatik yanlış seçim YOK, güvenli hata.
8. Aynı hesap form+dosyada tekrar -> yalnız bir kez eklenir.
9. Aynı panelde birden çok DNS -> bir playlist + validatedHosts.
10. Dosya kaldır -> form/hızlı yapıştırma hesapları korunur.
11. Bir hesap başarısız olsa da diğer batch hesapları işlenmeye devam eder; final özet doğru sayıları verir.

## TV Box testi (cihaz erişildiğinde)
- D-pad/focus, player paneli, zap, VOD/Series -> Live.
- Kalıcı player şerit/boyanma regresyonu.
- Runtime stall monitor'un TV focus/UI üzerinde yan etkisi olmaması.
- Çoklu hesap formunun kumanda/klavye erişilebilirliği.
