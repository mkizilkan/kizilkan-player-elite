# KIZILKAN PLAYER v17.0.8 RC1 — OKU BENİ

Bu sürüm v17.0.7 kalıcı tarama journal altyapısındaki checkpoint doğruluk açığını düzeltir. Eski `cursor - workerCount` yaklaşımı, bir worker uzun süre geride kaldığında process restart sonrası tamamlanmamış bir işi atlayabilirdi. v17.0.8 her workerın gerçek in-flight indeksini izler ve yalnız tamamlandığı kesin contiguous prefixi kalıcı checkpoint olarak yazar.

Single, bulk ve unified resume akışlarında hesap/panel ilerleme sayaçları da checkpointten yeniden kurulmaktadır. v17.0.7 şifreli journal, idempotent sonuç kaydı, PIN/profil güvenlik kapıları ve önceki tüm özellikler korunur.
