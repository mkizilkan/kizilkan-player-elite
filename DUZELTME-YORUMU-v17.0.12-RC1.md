# KIZILKAN PLAYER v17.0.12 RC1 — Düzeltme Yorumu

- v17.0.11 GitHub Actions build'i `:app:mergeReleaseJniLibFolders` taskının `prepareKizilkanMpvLibcxx` çıktısını dependency bildirmeden tüketmesi nedeniyle Gradle 8.14.3 validation aşamasında durdu.
- MPV AAR-owned `libc++_shared.so` çözümü geri alınmadı; `prepareKizilkanMpvLibcxx` korunarak producer TaskProvider açık biçimde tutuldu.
- `merge*JniLibFolders` taskları artık `prepareKizilkanMpvLibcxx` taskına explicit `dependsOn` ile bağlıdır; mevcut `merge*NativeLibs` koruması da sürer.
- Rastgele global libc++ `pickFirst` yaklaşımına geri dönülmedi; MPV ABI/symbol hard-gate korunmuştur.
- v17.0.11 sırasında yanlış biçimlenen `tools/denetle.js` v17.0.10/v17.0.11 gate kayıtları düzeltilmiş ve v17.0.12 gate eklenmiştir.
- Multi-account v17.0.11 davranışı, MPV runtime readiness, linker telemetry, battery exemption, durable scan journal ve önceki tüm corrective özellikler korunmuştur.
