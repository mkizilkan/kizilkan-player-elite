# KIZILKAN PLAYER ELITE — REGRESYON DIFF v16.14.2 RC1
Tarih: 2026-09-01
Karşılaştırma tabanı: v16.14.1 RC1 Recovery Checkpoint

## Fiziksel dosya sonucu
- v16.14.1 base: 528 dosya
- v16.14.2 entegrasyon öncesi final dokümantasyon dahil: yeni sürümde base'den kaybolan dosya: **0**
- Kaynak değişiklikleri yalnız planlanan entegrasyon alanlarında yapıldı.

## Değişen kaynak alanları
- frontend/app.json
- KizilkanNativeCoreModule.kt
- native core TS bridge
- KizilkanMpvModule.kt / MPV TS bridge
- frontend/package.json
- PlayerHost.tsx
- player/v2 index + yeni sourceRecovery.ts
- PlaylistContext.tsx
- types/index.ts
- diagnostics.ts
- refreshPlaylist.ts
- stalker.ts
- tools/denetle.js

## Eklenen doğrulamalar
- check-v16142-integrated-hardgate.js
- check-v16142-regression-contract.js
- check-mpv-packaging-v16142.js
- denetle-v16142.js

## v16.13.10 kritik kontrat sonucu
`tools/check-v16142-regression-contract.js` PASS:
- max-user sort korunuyor
- pinned-first korunuyor
- sort/reorder UI korunuyor
- SEÇ action korunuyor
- management mode no-auto-redirect korunuyor
- settings playlist management entry korunuyor
- Xtream partial 404 commit korunuyor
- playlist repair storm guard korunuyor
- MAG320 exact UI/default korunuyor
- safe Xtream playback provenance korunuyor

Bu kontrol tüm uygulamanın cihaz davranışının otomatik kanıtı değildir; fiziksel kaynak/regresyon kontratıdır. Cihaz/build doğrulaması ayrıca gereklidir.
