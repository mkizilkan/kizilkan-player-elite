# DÜZELTME YORUMU — v17.0.1 RC1

## Kanıtlanan hata
v17.0.0 kaynak paketindeki `tools/check-v16142-regression-contract.js`, metadata kontrolünde `maj===16` şartına sahipti. Bu yüzden `17.0.0`, fonksiyonel sözleşme kontrollerinin tamamı geçse bile yalnız metadata satırında yanlış FAIL üretiyordu.

## Uygulanan düzeltme
- `check-v16142-regression-contract.js`: `>=16.14.2` semver karşılaştırması eklendi; sabit major-16 kilidi kaldırıldı.
- `check-v17000-tv-navigation-focus-player.js`: v17.0.0 özelliklerini sonraki patch sürümlerinde de koruyacak forward-compatible preservation gate'e dönüştürüldü.
- `check-v17001-forward-semver-regression.js`: v17.0.1 exact metadata, v16.14.2 gate düzeltmesi, v17.0.0 feature preservation ve korunmasız major-16 kilidi taraması için yeni release hard-gate eklendi.
- `tools/denetle.js`: yeni v17.0.1 gate zincire eklendi.
- v16.14.8 sürüm notundaki iki trailing-whitespace satırı temizlendi; içerik değişmedi.

Bu sürümde v17.0.0 oynatıcı/TV fonksiyon kodunda özellik azaltımı veya kaldırımı yapılmadı.
