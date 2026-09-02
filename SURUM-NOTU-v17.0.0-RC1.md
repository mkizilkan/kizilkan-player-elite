# KIZILKAN PLAYER ELITE v17.0.0 RC1

Sürüm: 17.0.0
Android versionCode: 170000
iOS buildNumber: 17.0.0

## Yeni ve düzeltilenler
- Native Room tabanlı Previous/Next navigation.
- Live CH+/- zapping geri kazandırıldı; full JS catalog hydrate geri getirilmedi.
- VOD Previous/Next capability-driven hale getirildi.
- Series episode Previous/Next ve sezon sınırı navigation altyapısı.
- Favori/özel grup sırasını koruyan bounded ID navigation scope.
- TV numeric channel zap (görünür liste sırası temelinde).
- Merkezi TV focus memory/restore.
- Player sheet/modal TV focus trap.
- CH+/- ve MEDIA_NEXT/PREVIOUS remote semantik ayrımı.
- Media3 timeUpdate interval deduplication.
- Player resource release telemetry ve Media3 source detach.
- Rebuffer START/END ve duration telemetry.
- v17.0.0 release hard-gate + v16.14.9+ preservation gate.

## Açık runtime doğrulamaları
APK build ve gerçek TV Box/telefon testi assistant-side yapılmadı. Numeric zap şu an provider channel-number değil görünür navigation sırasını kullanır. RAM/ANR iyileşmesinin nihai kanıtı yeni cihaz logu ile yapılacaktır.
