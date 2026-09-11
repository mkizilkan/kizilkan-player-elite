# KIZILKAN PLAYER — DÜZELTME YORUMU v17.2.0-RC1

Bu sürüm v17.1.2 üzerine konsolide corrective olarak hazırlanmıştır. Çalışan mevcut özellikler korunarak aşağıdaki alanlar genişletildi.

## Uygulanan düzeltmeler

- Toplu TXT/CSV hesap taraması için Android native `ContentResolver -> 64KB BufferedReader -> bounded ArrayBlockingQueue -> producer/consumer worker pool` yolu eklendi.
- Native streaming scan akışında pause/cancel, queue backpressure, immediate encrypted journal result ve process recovery korundu.
- Runtime adaptive worker sınırı eklendi; worker havuzu yeniden yaratılmadan etkin concurrency azaltılıp artırılabilir.
- Büyük dosya Android önizlemesi tam dosyayı JS stringine çevirmeden native sınırlı örnek/metadata yolu kullanır; tarama doğrudan native stream yoluna bağlanır.
- Playlist içerik temizliği için Live/VOD/Series/EPG önizleme + transaction + post-verify native API eklendi. Playlist hesabı ve kimliği silinmez.
- Cleanup işleminde snapshot silmek yerine invalidate edilir; kullanıcı favori/recent/watch-progress verileri cleanup yoluna dahil edilmez.
- Diagnostics normal exportu ağır deep DB health yerine fast health kullanır; export single-flight koruması eklendi.
- Media3 görünmeyen player katmanında native time-update cadence 60 saniyeye düşürüldü; görünür UI hassasiyeti korunur.
- Next/Previous scope miss durumunda canonical Room neighbor fallback korunur.
- MPV render hedefi `SurfaceView` yerine `TextureView -> SurfaceTexture -> Surface -> MPVLib.attachSurface()` yoluna taşındı.
- MPV tekil audio owner/revoke korunarak önceki instance sesi stop + mute edilir.
- MPV TextureView compositor ilk görünür frame telemetry'si eklendi.
- Eski hard-gate'lerin yalnız sürüm regex'i veya SurfaceView implementasyonuna kilitli olan bölümleri ileri sürüm/TextureView mimarisini semantik olarak doğrulayacak şekilde güncellendi; gate kaldırılmadı.
- Eksik iki v17.1.0 gate dosyası yeniden oluşturuldu ve denetim zinciri korunuyor.

## Özellikle korunmuş dosyalar

- `frontend/src/utils/pin.ts` değiştirilmedi.
- `frontend/app/profile-select.tsx` değiştirilmedi.

## Doğrulanmamış iddialar

- Bu çalışma ortamında Android Gradle/Expo tam build çalıştırılmadı.
- Gerçek cihazda MPV TextureView görünür kontrolleri ve audio overlap kabul testi henüz yapılmadı.
- Proje `node_modules` mevcut olmadığı için tam tsconfig-bound TypeScript build çalıştırılamadı; yalnız parse-sınıfı syntax kontrolü ve kaynak hard-gate'leri çalıştırıldı.
