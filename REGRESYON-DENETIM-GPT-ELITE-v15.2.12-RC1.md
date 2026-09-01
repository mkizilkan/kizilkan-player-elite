# KIZILKAN PLAYER ELITE v15.2.12-RC1 Regresyon Denetimi

## Build P0
- `resolveOneBulkAccount` artık `control: ScanExecutionControl` zorunlu parametresine sahiptir.
- `control.signal` kullanan katalog hazırlık yolları TypeScript açısından nullable değildir.
- Mevcut tek çağrı yolu gerçek `control` nesnesini vermektedir.

## Korunan v15.2.11 davranışları
- Hazırlık ve native scan cancellation.
- Terminal `COMPLETED / FAILED / CANCELLED` snapshot.
- `user:pass` ve `user:password` hızlı yapıştırma parser düzeltmesi.
- Tarama bitmeden import engeli ve kullanıcı seçimi zorunluluğu.
- Profil PIN session gate.

## Kabul kapısı
GitHub Actions `npx tsc --noEmit` ve Android release build geçmeden sürüm başarılı kabul edilmez.
