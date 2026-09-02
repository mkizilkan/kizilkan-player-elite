# KIZILKAN PLAYER ELITE v17.0.0 RC1

Bu paket v16.14.8 tabanı üzerine TV Box navigation/focus ve player stability corrective çalışmasını taşır.

## Kritik koruma sözleşmesi
- v16.14.8 Native Core tek-kayıt player hot-path korunur; normal Android player akışında full playlist JS hydrate geri getirilmez.
- MAG verified persistence, live-first async catalog, gzip, Incremental Sync V2, source-recovery, stale owner protection, Flight Recorder V7 ve MPV runtime hardening korunur.
- Live/VOD/Series Previous/Next içerik bağlamına göre çözülür.
- Live komşuları Room üzerinden; favori/özel grup sırası bounded ID scope üzerinden; Series komşuları yalnız ilgili episode navigation bundle üzerinden çözülür.
- CH+/- ile MEDIA_NEXT/PREVIOUS semantikleri ayrıdır.
- TV focus memory/restore ve player sheet focus trap eklenmiştir.

## Doğrulama durumu
Assistant-side yeni v17.0.0 release gate, v16.14.9+ feature gate ve v16.14.2–v16.14.8 kritik preservation gate'leri PASS oldu. Değişen TS/TSX dosyaları TypeScript transpile parse kontrolünden geçti; tools/plugins JS syntax kontrolü geçti; Room neighbor SQL fixture geçti.

Tam `tools/denetle.js` çalıştırması bu ortamda `frontend/node_modules` olmadığı için bağımlılık tabanlı full TypeScript gate'lerinde React/Expo modüllerini çözemedi ve uzun çıktı sırasında zaman aşımına uğradı. Bu nedenle full-project dependency-backed TypeScript build PASS iddiası yoktur. APK/TV Box runtime testi de bu pakette assistant-side yapılmamıştır.
