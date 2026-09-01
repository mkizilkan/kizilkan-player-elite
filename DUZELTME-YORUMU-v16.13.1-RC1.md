# KIZILKAN PLAYER v16.13.1 RC1 — Düzeltme Yorumu

GitHub Actions gerçek Android release derlemesi `:kizilkan-native-core:compileReleaseKotlin` aşamasında durdu. Derleyici `NativeBlackBox.kt:330:116` için Boolean/String tip uyuşmazlığı ve `payloadJson`/`critical` eksik parametrelerini raporladı.

Kök neden, Flight Recorder V6 ile `insertEvent()` imzasına `traceId`, `operationId`, `stage`, `durationMs`, `outcome` ve `errorClass` alanları eklenmesine rağmen ANR watchdog çağrısının eski positional imzada kalmasıydı.

v16.13.1'de ANR çağrısı named arguments biçimine geçirildi; yeni telemetri alanları anlamlı ANR değerleriyle dolduruldu. v16.13.0 DB Health/maintenance/Flight Recorder V6 özellikleri korunmuştur. Yeni `check-v16131-native-blackbox-kotlin.js` gate'i eski positional çağrının geri gelmesini engeller.

Gerçek Android release build bu ortamda tamamlanmış olarak iddia edilmemektedir; son native doğrulama GitHub Actions release build'idir.
