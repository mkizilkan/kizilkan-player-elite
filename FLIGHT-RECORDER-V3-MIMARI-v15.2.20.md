# KIZILKAN FLIGHT RECORDER V3 — v15.2.20

## Katmanlar

### A. Native Room/WAL journal
`diagnostic_events` tablosu: id, epoch/monotonic time, appSessionId, domain, event, severity, player/session/run correlation, thread, pid, critical ve sanitized JSON payload.

### B. Ölüm anı critical journal
Room veya JS event loop'a güvenmeden `filesDir` altında senkron append + `fd.sync()`.
- Java/Kotlin uncaught exception
- JS tarafından terminal/kritik olay
- ANR watchdog main-thread stall
- 2 MiB segment rotation

### C. Process death correlation
Android 11+ `setProcessStateSummary()` 128 byte sınırına göre rate-limit edilir. Sonraki açılışta mevcut `ApplicationExitInfo` geçmişi ile birlikte export edilir.

### D. ANR öncesi kanıt
1 sn heartbeat, 4 sn stall eşiği, 15 sn tekrar koruması. Main thread stack + PSS/native/dalvik/system memory + thread/FD bilgisi kaydedilir. Bu bir Android sistem ANR raporu DEĞİLDİR; ANR öncesi uçuş kaydıdır.

### E. Player correlation
- Media3: status, error, first-frame, buffering/seek mevcut olayları.
- VLC: buffering + error signal + session timings.
- MPV: native diagnostic event/codec/format/hwdec/dimensions + existing buffering/player events.

`expo-video` tarafından doğrudan ExoPlayer instance paylaşılmadığı için bu sürüm custom native `AnalyticsListener` bağlamaz. Bu sınıra rağmen erişilebilir Media3 olayları Flight Recorder'a kaydedilir. İleride player motoru tamamen native KIZILKAN engine'e taşınırsa AnalyticsListener doğrudan aynı journal'a bağlanabilir.

### F. Privacy
- password/token/cookie/authorization/secret/pin/device-id/serial/mac/username alanları redacted.
- URL username/password temizlenir.
- Host gerçek haliyle değil FNV tabanlı kısa hash ile `host-xxxxxxxx.invalid` olarak saklanır.
- ProcessStateSummary içine credential/URL yazılmaz.

### G. Automatic anomalies
Export sırasında kanıta dayalı anomaly listesi oluşturulur:
- PLAYER_STALE_BUFFERING_STATE
- PLAYLIST_STALE_ASYNC_RESULT
- PLAYER_SLOW_FIRST_FRAME (>= 5000 ms)
- PLAYER_BLACK_SCREEN
- RUNTIME_STALL_OR_RESOURCE
- CRITICAL_FAILURE

## Retention
- Native DB: yaklaşık 5.000 normal + 500 kritik event.
- Native critical file: 2 MiB + 1 eski segment.
- JS ring: 1.500 event.
- JS legacy journal: 8 MiB + 1 arşiv segmenti.

## Resmî kaynaklarla doğrulanan tasarım kararları
- Android `ApplicationExitInfo` ve `setProcessStateSummary()` process ölümünden sonra özel state korelasyonuna izin verir; state maksimum 128 byte ve aşırı çağrı yapılmamalıdır.
  https://developer.android.com/reference/android/app/ActivityManager#setProcessStateSummary(byte[])
- Android input-dispatch ANR tipik olarak main thread yaklaşık 5 saniye yanıt vermediğinde oluşur; bu nedenle watchdog 4 saniyede "erken uyarı" kanıtı alır, sistem ANR'si olduğunu iddia etmez.
  https://developer.android.com/topic/performance/anrs/diagnose-and-fix-anrs
- Media3 `AnalyticsListener` dropped frames, loading ve playing gibi detaylı native olayları sağlayabilir. Expo-video doğrudan player instance vermediğinden v15.2.20'de bu listener fork edilmemiştir.
  https://developer.android.com/reference/androidx/media3/exoplayer/analytics/AnalyticsListener
- Room migration mevcut veriyi koruyan schema değişiklikleri için kullanılır; v2→v3 migration yalnız yeni diagnostic tablo/indexlerini ekler.
  https://developer.android.com/training/data-storage/room/migrating-db-versions
