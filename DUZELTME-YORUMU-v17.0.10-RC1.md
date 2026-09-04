# Düzeltme Yorumu — v17.0.10 RC1

- Genel `libc++_shared.so` pickFirst kaldırıldı; libmpv 1.0.0 AAR içindeki kendi libc++ runtime'ı build sırasında app-owned generated jniLibs kaynağına alınır.
- Final APK MPV hard-gate, libmpv'nin `__ndk1` undefined sembollerini paketlenen libc++ exportlarıyla karşılaştırır.
- Çoklu tarama modalı SectionList ile tek virtualized kaydırılabilir gövdeye çevrildi; tarama/ekleme kontrol ve seçim butonları gövde dışında erişilebilir kalır.
- Bulunan toplamı ve hesap başına bulunan sayısı ayrı, güçlü vurguya alındı.
- Pil optimizasyonu için paket-özel ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS ve uygulama ayar fallback'i eklendi.
- MPV linker hataları telemetride `MPV_NATIVE_LINK_ERROR_MISSING_CXX_SYMBOL` olarak ayrıştırılır.

## Grok MPV-CXX çapraz inceleme sonrası cerrahi güçlendirme
- Grok v17.0.9-MPV-CXX teşhisindeki runtime-availability bulgusu doğrulandı: Expo view varlığı native MPV init başarısını kanıtlamaz.
- `isKizilkanMpvNativeReady()` ve `mpvEngineUsable()` yaklaşımı v17.0.10'a entegre edildi; bir native init arızasından sonra MPV sonraki kanal seçimlerinde tekrar zorlanmaz.
- `System.loadLibrary("c++_shared")` MPV module/view öncesi savunma katmanı olarak eklendi. Bu, doğru libc++ paketleme çözümünün yerine geçmez.
- Grok'un tek-ABI/tek-sembol gate yaklaşımı aynen alınmadı. Mevcut v17.0.10 final-APK gate'i tüm ortak desteklenen ABI çiftlerinde libmpv'nin `__ndk1` undefined sembol kümesini paketlenmiş libc++ export kümesiyle karşılaştıracak şekilde güçlendirildi.
- v17.0.10'un `MPV_NATIVE_LINK_ERROR_MISSING_CXX_SYMBOL` telemetrisi korundu; Grok patch'indeki daha zayıf eski KizilkanMpvView sürümü üzerine yazılmadı.
