# KIZILKAN PLAYER v17.2.1 RC1 — Düzeltme Yorumu

GitHub Actions run #80 statik denetiminde yakalanan iki TypeScript sözleşme hatası cerrahi olarak düzeltildi.

- `ScanRecoveryIntent.mode` yeni native streaming tarama modu `streaming-file-v172` ile genişletildi. Mevcut `single`, `bulk`, `unified` modları aynen korundu.
- Diagnostics export single-flight telemetrisi, mevcut `DiagnosticDomain` sözleşmesinde geçerli olan `system` alanına taşındı. Yeni/uydurma domain eklenmedi.
- Sürüm 17.2.1 / versionCode 170201 / iOS buildNumber 17.2.1 / release label `GPT ELITE v17.2.1 RC1` olarak yükseltildi.
- v17.2.0 core gate ileri sürüm uyumlu hale getirildi; v17.2.1 için ayrı TypeScript semantic corrective hard-gate eklendi.
