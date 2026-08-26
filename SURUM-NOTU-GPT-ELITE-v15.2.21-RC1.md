# Sürüm Notu — KIZILKAN PLAYER ELITE v15.2.21 RC1

## Düzeltme
v15.2.20 verify CI sırasında bulunan TypeScript TS2339 hatası düzeltildi. `EngineProfile` ayrık birleşiminde Media3 profilinin `decoder` alanı bulunmadığından Flight Recorder hata telemetrisi artık engine'e göre daraltma yapar:

- Media3: `surface`
- VLC/MPV: `decoder`

## Koruma
Flight Recorder V3 v15.2.20 kapsamı azaltılmadan korunur. Yeni `check-v15221-typescript-media3.js` hem kaynak bloğu denetler hem de minimal gerçek TypeScript semantik programıyla union narrowing sözleşmesini derler.

## Sürüm
- package/app version: 15.2.21
- Android versionCode: 150221
