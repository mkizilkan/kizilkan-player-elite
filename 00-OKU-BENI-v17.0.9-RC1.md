# KIZILKAN PLAYER v17.0.9 RC1 — OKU BENİ

Bu sürüm v17.0.8 RC1 GitHub Actions release buildinde `:panel-scan:compileReleaseKotlin` aşamasında kanıtlanan Kotlin tip/isim hatalarını düzeltir. `PanelScanService.kt` içindeki Int/Long uyumsuzlukları giderilmiş, kaldırılmış lineer `offsets` değişkenine dayanan unified resume hesabı gerçek round-robin/layer iş sırasına göre yeniden kurulmuştur.

v17.0.8 konservatif in-flight checkpoint garantisi, v17.0.7 şifreli durable journal/process recovery, v17.0.6 background recovery ve önceki tüm özellikler korunur. Resume sırasında tamamlanmamış işin atlanmaması önceliklidir; güvenli checkpoint nedeniyle gerekirse bazı işler tekrar denenebilir ve journal sonuç anahtarları idempotent kalır.
