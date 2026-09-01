# DÜZELTME YORUMU — v15.2.20 RC1

## 1) v15.2.19 build patlaması
Kök neden `PlaylistContext.tsx` içinde `activeSwitchWriteQueue.current` değişkeninin `Promise<void>` olması, fakat `.then(() => storage.setItem(...))` ifadesinin `storage.setItem()` dönüşü nedeniyle `Promise<boolean | void>` üretmesiydi.

Düzeltme:
```ts
.then(async () => {
  await storage.setItem(key, id);
});
```
Böylece callback değer döndürmez ve kuyruk tekrar `Promise<void>` sözleşmesini korur. Ayrıca bu exact kod bloğunu TypeScript semantic compiler API ile kontrol eden `check-v15220-typescript-semantic.js` eklendi.

## 2) KIZILKAN Flight Recorder v3
Black Box artık yalnız AsyncStorage/JSONL değildir. Android Native Core'a `NativeBlackBox.kt` eklendi.

Eklenenler:
- Room/WAL `diagnostic_events` append-only tablosu.
- Room schema 2→3 migration.
- 5.000 normal + 500 kritik DB kayıt retention modeli.
- Kritik crash/ANR olayları için Room'dan bağımsız, senkron `fsync()` edilen native critical JSONL journal.
- `UncaughtExceptionHandler`: exception/thread/stack/memory kaydı alır, ardından önceki handler'a DELEGE EDER; crash yutulmaz.
- Main-thread heartbeat watchdog: >=4 sn stall durumunda main stack + memory snapshot saklar. Android sistem ANR kaydının yerine geçmez, erken kanıt toplar.
- Android 11+ `ActivityManager.setProcessStateSummary()` ile 128 byte sınırına uygun, rate-limit edilmiş ölüm öncesi checkpoint.
- `ApplicationExitInfo` geçmişi mevcut telemetriyle export edilir.
- Thread count, FD count, PSS/native/dalvik memory snapshotları.
- Native Room snapshot + kritik journal + JS ring + legacy JSONL birlikte export edilir.
- URL host hashing, credential/query redaction ve hassas key filtresi güçlendirildi.
- Player: `MEDIA3_ERROR`, `VLC_ERROR_SIGNAL`, `MPV_NATIVE_DIAGNOSTIC` olayları eklendi.
- Navigation/lifecycle: `ROUTE_CHANGED`, `APP_ROOT_READY`, `APP_BACKGROUND`, `APP_FOREGROUND` kayıtları.
- Otomatik anomaly özeti: stale buffering, stale playlist async result, >=5sn first-frame, black screen, stall/timeout/resource ve kritik failure sınıfları.
- İstatistik ekranında Flight Recorder DB olay sayısı, kritik sayısı, kritik journal boyutu, ANR watchdog, thread/FD/uptime görünür.

## 3) Regresyon koruması
- v15.2.16 diagnostics gate yeni V3 formatını ileri uyumlu kabul edecek şekilde düzeltildi; eski işlevleri kontrol etmeye devam ediyor.
- v15.2.18 Black Box gate V2 veya daha yeni V3 formatını kabul ediyor.
- v15.2.19 gate sürüm numarasına sabitlenmek yerine minimum sürüm + app/package/versionCode tutarlılığını kontrol ediyor.
- v15.2.20 Flight Recorder ve semantic TS gate ana `denetle.js` zincirine bağlandı.
