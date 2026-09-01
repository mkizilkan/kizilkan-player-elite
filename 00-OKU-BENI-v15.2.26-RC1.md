# KIZILKAN PLAYER ELITE v15.2.26 RC1

## PACKAGE / LOCKFILE HARDENING

Bu sürüm v15.2.25 RC3 kaynak tabanını korur ve kanıtlanmış paket bütünlüğü hatasını düzeltir.

- `frontend/package.json` içindeki `@react-native-tvos/config-tv@^0.1.6` bağımlılığı korunmuştur.
- `frontend/yarn.lock`, Yarn 1.22.22 ile gerçek resolver üzerinden yeniden üretilmiş lockfile ile senkronize edilmiştir.
- Yeni `tools/check-v15226-rc1-lockfile.js` hard-gate'i package/lock uyumunu zorunlu doğrular.
- Sürüm `15.2.26`, Android `versionCode` `150226` olarak yükseltilmiştir.
- v15.2.25 RC3 TypeScript project hard-gate ve önceki regresyon zinciri korunmuştur.
