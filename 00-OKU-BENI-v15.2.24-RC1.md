# KIZILKAN PLAYER ELITE v15.2.24 RC1 — TELEMETRY-DRIVEN P0 CORRECTIVE

Bu paket v15.2.23 RC2 üzerine kuruludur; önceki player, Flight Recorder V5, MAG/Stalker, backup, scan ve Room özellikleri korunmuştur. v15.2.24 değişiklikleri 27.08.2026 gerçek cihaz telemetrisinde görülen üç ana sınıfı hedefler: tekrarlı MAG katalog indirmesi, doğrulanmadan aktif edilen Room playlisti ve expo-video `emitTimeUpdate/IntervalUpdateClock` hattındaki main-thread baskısı.

## Bu sürümde
- **MAG single-flight + kısa ömürlü katalog cache:** aynı portal/MAC/endpoint için eşzamanlı katalog çağrıları tek gerçek ağ işine bağlanır. Başarılı katalog 3 dakika cache'lenir; manuel yenileme `forceFresh` ile cache'i atlar fakat aynı anda çalışan fresh isteğe yine bağlanır.
- **MAG stage telemetry/progress:** Live, VOD ve Series aşamalarının süreleri ve sayıları Flight Recorder'a yazılır. VOD/Series sayfalamasında gerçek sayfa/yüklenen/toplam ilerlemesi UI'ye aktarılır.
- **Verified Room activation:** Native Core açıkken hedef playlist `getPlaylistSummary/warmPlaylist` ile `roomIndexed` doğrulanmadan `activeId` veya kalıcı active key değiştirilmez. Doğrulama başarısızsa eski aktif playlist korunur.
- **Adaptive Media3 timeUpdate:** kontroller kapalı normal izleme sırasında expo-video time update interval 5 saniyeye düşer; kontroller, yayın bilgi paneli veya synthetic playback aktifken 1 saniyeye döner. Amaç telemetride görülen `IntervalUpdateClock -> emitTimeUpdate` main-thread uyanma baskısını azaltmaktır.
- **Yeni hard-gate:** `tools/check-v15224-mag-room-stall.js` hem kaynak sözleşmesini hem de MAG single-flight/cache davranışını deterministik fixture ile test eder.

## Sürüm
- version: `15.2.24`
- Android versionCode: `150224`
- Paket: RC1

## Doğrulama sınırı
Bu çalışma ortamında bütün mevcut gate'ler ayrı ayrı çalıştırılmış ve temiz sonuç vermiştir; yeni v15.2.24 gate ayrıca gerçek single-flight/cache fixture'ı çalıştırır. Tam dependency kurulumu ile `tsc --noEmit`, Android Gradle/APK build ve fiziksel cihaz acceptance GitHub Actions/cihazda ayrıca doğrulanacaktır.
