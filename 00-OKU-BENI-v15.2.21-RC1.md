# KIZILKAN PLAYER ELITE v15.2.21 RC1

Bu sürüm v15.2.20 Flight Recorder V3 mimarisini aynen korur ve GitHub Actions'ta kanıtlanan `PlayerHost.tsx` TS2339 EngineProfile hatasını düzeltir.

- Sürüm: 15.2.21
- Android versionCode: 150221
- Ana düzeltme: Media3 profilinde olmayan `decoder` alanına doğrudan erişim kaldırıldı; engine narrowing + Media3 `surface` telemetrisi eklendi.
- Yeni koruma: `tools/check-v15221-typescript-media3.js`.
- Flight Recorder V3, native Room/WAL event journal, crash/ANR öncesi kayıt, process-exit korelasyonu ve kritik journal v15.2.20'den korunmuştur.

Tam `npx tsc --noEmit` ve Android build bu paketin üretim ortamında bağımlılıklar olmadığı için çalıştırılmadı; verify branch GitHub Actions sonucu nihai build kanıtıdır.
