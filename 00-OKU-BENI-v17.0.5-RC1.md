# KIZILKAN PLAYER ELITE v17.0.5 RC1

Build-gate forward-compat corrective release. v17.0.4 ultra-scale multi-account/TXT archive özellikleri korunur.

Kök neden: `check-v15224-rc2-memory-native.js`, eski `resolveWork(index: Int)` imzasını zorunlu tutarken v17.0.4 tarama motoru 64-bit ölçek için bilinçli olarak `Long` kullanıyordu. Kaynak doğru, geçmiş regresyon gate'i güncel mimariyi yanlış negatif olarak reddediyordu.

Düzeltme: legacy gate hem Int legacy hem Long ultra-scale resolver'ı kabul eder; v17.0.4 gate ileri sürümlerde preservation gate olarak çalışır; yeni v17.0.5 hard-gate bu sözleşmeyi doğrular.
