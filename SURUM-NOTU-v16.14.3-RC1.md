# KIZILKAN PLAYER v16.14.3 RC1

Corrective prebuild hardening release.

- Incremental Sync skip artık fingerprint-only değildir; Room + snapshot sayıları fail-closed doğrulanır.
- Corrupt/missing skipped kind otomatik repair-write olur ve `lastRepairedKinds` telemetrisi tutulur.
- MAG all-empty capability sonucu içerik silmeden persist edilir.
- Flight Recorder V7 playlist -> channel child trace korelasyonu eklendi.
- MPV runtime installed-APK native lib kontrolü eklendi.
- MPV build gate final APK olmadan VERIFIED vermez; arm64-v8a libmpv + libc++ çifti zorunludur.
- v16.14.2 ve v16.13.10 özellik sözleşmeleri korunmuştur.

Build/device sonucu bu source release notunun parçası değildir; ayrıca doğrulanmalıdır.
