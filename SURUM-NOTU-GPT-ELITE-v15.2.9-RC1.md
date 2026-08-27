# KIZILKAN PLAYER ELITE v15.2.9-RC1

## Server Discovery Orchestrator Hardening
- PanelScan job başlangıcı atomik `claimRun` ile sahiplenilir; sessiz `if (!running)` reddi kaldırıldı.
- Native bridge `ACCEPTED / BUSY` sonucu ve `activeRunId` döndürür.
- Pause / Resume / Cancel runId-scoped yapıldı.
- BUSY durumunda kullanıcı `Vazgeç` veya `Durdur ve Yeni Tara` seçebilir.
- Firebase panel directory çağrılarına client AbortController timeout, REST server timeout ve bounded retry eklendi.
- Son sağlam panel directory yerel cache'de tutulur; cache-first açılış ve background refresh vardır.
- `Paneli biliyorum` seçilen panelin `hosts[]` listesini korur ve submitte ikinci Firebase lookup yapmaz.
- `Kodum var`, `Paneli biliyorum`, `Paneli bilmiyorum` candidate üretiminden sonra aynı native scan motoruna gider.
- Çoklu hesap unified discovery cache-first directory kullanır.

## Korunan özellikler
Room/SQLite canonical store, Native EPG, paging, Cast hardening, chunked import, player health ve v15.2.8 lifecycle/telemetry özellikleri çıkarılmadı.

## Henüz kanıtlanmayan
Gerçek Kotlin/Gradle release build ve üç Sunucu Kodu yolunun gerçek cihaz uçtan uca kabul testi GitHub/cihaz üzerinde yapılacaktır.
- AUTH başarılı fakat `status != Active` sonuçlar görünür kalır ancak otomatik seçilmez.
- Aynı panelin birden fazla çalışan DNS'i ayrı playlist oluşturmaz; tek playlist + bütün `validatedHosts` olarak kaydedilir.
