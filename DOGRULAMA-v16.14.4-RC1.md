# v16.14.4 RC1 Doğrulama

Gerçek çalıştırılan kontroller:
- Daha önce GitHub'da patlayan 13 legacy/current gate tek tek tekrar çalıştırıldı: 13/13 PASS.
- v16.14.3 regression contract: PASS.
- v16.14.3 corrective hard-gate: PASS.
- v16.14.4 CI hard-gate: PASS.
- Workflow YAML parse: PASS.
- Sürüm düşürme mutation fixture (16.14.4 -> 16.14.3): v16.14.4 gate FAIL; fail-closed kanıtlandı.
- MPV fake APK fixture: yalnız `libmpv.so` => FAIL; `libmpv.so + libc++_shared.so` aynı arm64-v8a altında => PASS.

Master `tools/denetle.js` bu container'da iki TypeScript project gate'inde durur; sebep `frontend/node_modules` ve `expo/tsconfig.base` bulunmamasıdır. Bu iki adım için dependency-resolved CI ortamı gerekir. Bu durum PASS olarak gösterilmemiştir. CI workflow bağımlılıkları kurduktan sonra aynı master gate'i çalıştıracak şekilde düzeltilmiştir.
