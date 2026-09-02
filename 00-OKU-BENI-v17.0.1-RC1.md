# KIZILKAN PLAYER ELITE v17.0.1 RC1

Bu paket, v17.0.0 RC1 TV navigation/focus/player-stability sürümünü aynen koruyan ve eski `v16.14.2` regresyon gate'inde kanıtlanan major-sürüm kilidini düzelten corrective sürümdür.

## Kritik düzeltme
`tools/check-v16142-regression-contract.js` içindeki `maj===16` koşulu kaldırıldı. Sürüm doğrulaması artık gerçek `>=16.14.2` semver mantığıyla çalışır. Böylece v17 ve sonraki major sürümler, korunan v16.14.2 sözleşmesini yanlışlıkla FAIL etmez.

## Sürüm
- Uygulama: 17.0.1
- Android versionCode: 170001
- iOS buildNumber: 17.0.1
- Etiket: GPT ELITE v17.0.1 RC1

v17.0.0 içindeki TV/remote navigation, focus memory, scoped neighbor navigation, player lifecycle/rebuffer telemetry ve önceki sürüm korumaları kaldırılmamıştır.
