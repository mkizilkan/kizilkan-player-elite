# KIZILKAN PLAYER ELITE v15.2.12-RC1

Bu sürüm v15.2.11-RC1 üzerinde yalnız build-blocker TypeScript regresyonunu giderir; mevcut özellik veya davranış kaldırmaz.

## Düzeltme
GitHub Actions'ta görülen:

`app/add-playlist.tsx(947,73) TS18048: 'control' is possibly 'undefined'`

ve

`app/add-playlist.tsx(967,73) TS18048: 'control' is possibly 'undefined'`

hatalarının kökü `resolveOneBulkAccount` fonksiyonundaki opsiyonel `control?: ScanExecutionControl` imzasıydı. Fonksiyonun gerçek çağrı sözleşmesi `control` nesnesini zorunlu sağladığından imza `control: ScanExecutionControl` olarak düzeltildi.

## Regresyon koruması
`tools/checkplayercore.js`, bu parametrenin yeniden opsiyonel yapılmasını build öncesi HARD gate ile engeller.
