# REGRESYON DENETİMİ — v15.2.5-RC1

## Zorunlu statik kapılar
- [ ] package version 15.2.5 / Android versionCode 150205
- [ ] libmpv 1.0.0 korunuyor
- [ ] Room canonical store korunuyor
- [ ] begin/append/finish/cancel chunked native import bridge mevcut
- [ ] chunk size bounded ve JS event-loop yield mevcut
- [ ] final Room write transaction içinde
- [ ] Cast resumed-session rebind mevcut
- [ ] source-change remote load mevcut
- [ ] Cast load generation guard mevcut
- [ ] remote media status ilk bind + update listener mevcut
- [ ] remote VOD position -> local handoff mevcut
- [ ] liveSeekableRange capability guard mevcut
- [ ] player exit remote stop mevcut
- [ ] signing/private material ZIP'e girmiyor

## Gerçek cihaz kabul testleri
1. Büyük Xtream/M3U/MAG ekleme sırasında UI touch response kaybolmamalı.
2. Cast bağlan -> kanal A -> kanal B: TV yalnız B'ye geçmeli, eski A kalmamalı.
3. Cast VOD 10:00'da başlat -> TV'de 20:00 -> disconnect: telefon yaklaşık 20:00'dan devam etmeli.
4. Cast açıkken uygulamayı background/foreground yap: TV medyası baştan yüklenmemeli.
5. Receiver pause/play telefon UI'a yansımalı.
6. Live seek yalnız receiver DVR range sunuyorsa çalışmalı.
7. Player geri/çıkış remote medyayı durdurmalı; session cihaz bağlantısı korunabilir.
8. TV Box D-pad/focus/player yüzeylerinde regresyon olmamalı.
