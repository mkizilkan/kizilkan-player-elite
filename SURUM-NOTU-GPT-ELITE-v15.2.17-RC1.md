# SÜRÜM NOTU — KIZILKAN PLAYER ELITE v15.2.17-RC1

**Tarih:** 2026-08-26
**Sürüm:** 15.2.17
**Android versionCode:** 150217

## Amaç
v15.2.16 gerçek cihaz testinde çoklu hesap unified scan sırasında `ApplicationExitInfo.REASON_CRASH` görüldü. Crash kaydında düşük bellek yoktu ve `scanDiagnostics` boştu. Kaynakta büyük `jobsJson` payload'ının `Intent.putExtra()` ile foreground service'e taşındığı doğrulandı.

## Düzeltmeler
1. Unified scan payload artık Intent içine konmuyor. App-private `filesDir/kizilkan/panel-scan-staging/<runId>.json` staging dosyasına yazılıyor; Intent yalnız runId/stagingKey/sayaç/concurrency/timeout taşıyor.
2. JS bridge payload'ında aynı candidate listeleri `candidateSets` ile tekilleştiriliyor; hesaplar yalnız `candidateSet` indeksini taşıyor.
3. Staging dosyası service tarafından RAM'e okunduktan hemen sonra siliniyor.
4. Crash öncesi checkpoint zinciri ve payload/account/test sayaçları kalıcı telemetry'ye eklendi.
5. Android 11+ `ActivityManager.setProcessStateSummary()` kullanılarak son scan fazı `ApplicationExitInfo.processStateSummary` ile sonraki process'te okunabilir hale getirildi.
6. Chained `Thread.setDefaultUncaughtExceptionHandler` gerçek Java exception class/thread/top stack bilgilerini saklıyor; crash yutulmuyor, önceki default handler'a devrediliyor.
7. Unified worker exception'ları artık sessiz kalmıyor; worker failure terminal FAILED'e taşınıyor.
8. MAG handshake endpoint denemeleri `NETWORK/TIMEOUT/HTTP/HTML/NON_JSON/NO_TOKEN`, status, content-type, redirect/final URL bilgileriyle tanılanıyor. Ham response body telemetry'ye alınmıyor.

## Korunan davranışlar
- scan runId/claim/BUSY sözleşmesi
- pause/resume/cancel
- round-robin hesap ilerlemesi
- terminal COMPLETED/FAILED/CANCELLED snapshot
- selection-before-import
- DNS alias grouping
- profil PIN session gate
- MAG session cache
- Xtream/M3U/MAG katalog hardening
- v3 chunk/atomic backup restore

## Dış doğrulama
Android resmi dokümantasyonu Binder transaction buffer'ın process genelinde sınırlı (~1 MB) olduğunu ve büyük Bundle/Intent payload'larında `TransactionTooLargeException` oluşabileceğini belirtir. Android 11+ `setProcessStateSummary()` / `getProcessStateSummary()` process-death analizi için sağlanır; state özeti en fazla 128 byte olmalıdır ve hassas veri içermemelidir. Custom uncaught handler'ın default handler'a devretmesi Android'in önerdiği davranıştır.

## Kanıt sınırı
Kaynak/statik fixture kontrolleri temiz olsa da tam `npx tsc --noEmit`, Expo prebuild, Android/Kotlin/Gradle release build ve gerçek cihaz davranışı GitHub Actions/APK ile ayrıca doğrulanmalıdır.
