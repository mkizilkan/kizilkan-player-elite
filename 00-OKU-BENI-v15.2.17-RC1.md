# KIZILKAN PLAYER ELITE v15.2.17-RC1

**Sürüm:** 15.2.17
**Android versionCode:** 150217

Bu sürüm v15.2.16 gerçek cihaz telemetrisiyle doğrulanan toplu analiz `CRASH` olayını ve MAG portal bağlantı tanılamasındaki kör noktaları hedefler.

Ana değişiklikler:
- Unified scan jobs payload artık Android Intent/Bundle içinde taşınmaz; app-private staging dosyasından okunur.
- Aynı candidate listeleri `candidateSets` ile deduplicate edilir.
- `STARTING → STAGED → SERVICE_DISPATCH → SERVICE_ENTER → STAGING_READ → WORKERS_STARTED → terminal` kalıcı checkpoint zinciri eklendi.
- Android 11+ `setProcessStateSummary()` ile process death öncesi scan fazı saklanır.
- Java uncaught exception recorder gerçek exception class/thread/top stack bilgilerini yerelde saklar ve sonra default handler'a devreder.
- Worker exception'ları görünür hale getirilir ve birleşik scan terminal FAILED durumuna taşınır.
- MAG endpoint denemeleri HTTP/content-type/redirect/network-timeout sınıflarıyla tanılanır; ham response body kaydedilmez.

Build/cihaz doğrulaması GitHub Actions + gerçek APK acceptance testiyle yapılmalıdır.
