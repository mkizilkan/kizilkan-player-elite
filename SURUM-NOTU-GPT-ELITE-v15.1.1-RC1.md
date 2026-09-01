# KIZILKAN PLAYER ELITE v15.1.1-RC1 — Sürüm Notu

## Sürüm kimliği
- Uygulama: `15.1.1`
- Android `versionCode`: `150101`
- iOS build metadata: `15.1.1`
- Player Engine: `1.0.0-RC`
- Native MPV: `dev.jdtech.mpv:libmpv:1.0.0`

## Neden bu sürüm var?
v15.1.0-RC1 gerçek GitHub Actions native buildinde `:mpv-player:compileReleaseKotlin` aşamasına kadar ulaştı. Build, libmpv 1.0.0 API'sinde değil, Expo EventDispatcher payload tipinde iki somut Kotlin nullability hatasında durdu.

## Düzeltme
- `onVideoReady` artık açıkça `Map<String, Any>` payload gönderir.
- `videoCodec`, `videoFormat`, `hwdecCurrent` null ise JS bridge sınırında boş stringe normalize edilir.
- `onDiagnostic` payload'ı `LinkedHashMap<String, Any>` olarak kurulur.
- Diagnostic `extra` içindeki null değerler event payload'ına eklenmez.
- Unsafe `as Map<String, Any>` cast kullanılmadı.
- `checkplayercore.js` nullable diagnostic EventDispatcher payload regresyonunu HARD gate ile engeller.

## Korunan kapsam
v15.1.0-RC1'deki libmpv 1.0.0 multiple-instance migration, 4K HW→SW recovery, ZAP/session izolasyonu, resume doğrulaması, Scan Engine v2, 5 hız profili, pause/resume/stop ve Settings responsive UI çalışmaları korunmuştur.

## Doğrulama sınırı
Bu paket yerel statik gate'lerden geçirilir; gerçek Kotlin/Gradle/APK başarısı yeni GitHub Actions buildi ile kanıtlanacaktır. Başarılı build sonucu görülmeden native fix tamamlandı sayılmaz.
