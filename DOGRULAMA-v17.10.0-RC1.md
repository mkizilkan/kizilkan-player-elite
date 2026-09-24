# DOĞRULAMA — v17.10.0 RC1

## Çalıştırılan kontroller
- `git diff --check`
- Değişen tüm TS/TSX dosyaları TypeScript `createSourceFile` parse kontrolü
- `checkdefs.js`, `checkcalls.js`, `checkdeps.js`, `checktdz.js`
- v17.9.10 recovery regression hard-gate'leri forward-semver uyumlu çalıştırıldı
- `check-v17100-platform-hardening.js`
- Patch SHA256 ve clean-copy `git apply --check`

## Ortam sınırı
Paketleme ortamında `frontend/node_modules` yoktur. Bu nedenle tam Expo/React Native `tsc --noEmit` proje gate'i bağımlılıklar kurulmadan çalıştırılamaz. Bu durum PASS olarak raporlanmaz. Termux/CI scripti bağımlılıkların bulunduğu ortamda mevcut proje gate'lerini yeniden çalıştırmalıdır.

## Donanım doğrulaması
Chromecast, fiziksel TV renkli tuşları, USB/SD ve gerçek MAG archive portalı statik kontrolden geçirilemez. Cihaz kabul testi gereklidir.
