# KIZILKAN PLAYER ELITE v15.0.2 — REGRESYON DENETİMİ

- [x] v15.0.1 temiz repo CI hataları kök neden bazında ele alındı.
- [x] `@/src/native/vlc` TypeScript çözümleme facade'ı eklendi.
- [x] `@/src/native/cast` TypeScript çözümleme facade'ı eklendi.
- [x] Metro platform ayrımı korunuyor: native/web dosyaları silinmedi.
- [x] VLC callback implicit-any gerçek tipe çevrildi.
- [x] Media3 → MPV/FFmpeg → VLC PlayerHost mimarisine dokunulmadı.
- [x] MPV Expo local module kaynakları korunuyor.
- [x] TV SurfaceView/off-screen surface politikası ve Player Core gate korunuyor.
- [x] CI Node/Java action sürümleri güncellendi.
- [ ] Temiz GitHub `tsc --noEmit` sonucu: kullanıcı reposunda doğrulanacak.
- [ ] Expo prebuild / Kotlin / libmpv / Gradle / APK üretimi: HARD gate sonrasında doğrulanacak.
