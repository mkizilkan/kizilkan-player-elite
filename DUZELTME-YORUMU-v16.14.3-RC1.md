# KIZILKAN PLAYER v16.14.3 RC1 — CORRECTIVE PREBUILD HARDENING

Bu sürüm v16.14.2 RC1 üzerinde yapılan ikinci kaynak incelemesinde bulunan dört gerçek açığı kapatır. Hiçbir mevcut özellik çıkarılmadı.

## 1) Incremental Sync V2 fail-closed skip verification
- Fingerprint eşitliği artık tek başına `skip` yetkisi vermez.
- Incoming count + gerçek Room row count + snapshot count üçü eşleşmeden kind skip edilmez.
- Fingerprint aynı olduğu halde Room/snapshot eksikse kind `repairedKinds` olarak işaretlenir ve aynı atomic transaction içinde yeniden yazılır.
- Commit sonrası supplied TÜM kind'lar tekrar row-count + snapshot-count ile doğrulanır; sapma varsa `roomVerified:true` dönmez.

## 2) MAG all-empty capability persistence
- Session/catalog isteği gerçekten tamamlandıktan sonra capability patch içerik-empty kararından ÖNCE üretilir.
- Live/VOD/Series tamamı boşsa refresh `ok:false` döner fakat yalnız capability metadata patch'i taşır.
- Mevcut kanal/VOD/Series dizileri boş array ile overwrite edilmez.
- UI refresh ve self-repair failure yolları bu metadata patch'ini persist ederken refresh'i yine başarısız gösterir.

## 3) Flight Recorder V7 parent/child correlation
- Playlist trace parent olarak korunur.
- Her kanal seçimi `createFlightRecorderChildTrace(...)` ile ayrı child trace üretir.
- Aynı playlist içindeki farklı kanal denemelerinin urlResolve/enginePrepare/httpResponse/fallback/firstFrame olayları artık aynı trace altında karışmaz.

## 4) MPV fail-closed packaging/runtime verification
- Runtime status artık yalnız Class.forName sonucunu başarı saymaz.
- Kurulu APK içindeki `lib/<ABI>/libmpv.so` ve `lib/<ABI>/libc++_shared.so` ZipFile ile kontrol edilir.
- `nativeLibrariesVerified` ancak class + APK libmpv + APK libc++ + cihaz ABI eşleşmesi varsa true olur.
- Yeni `tools/check-mpv-packaging-v16143.js` AAR varlığını release PASS saymaz.
- Final APK'da aynı ABI altında `libmpv.so + libc++_shared.so` yoksa FAIL verir; arm64-v8a tam çifti zorunludur.
- mergeReleaseNativeLibs yalnız ara kanıttır; final APK yoksa exit 2 / BLOCKED döner.

## Build durumu
Bu çalışma ortamında gerçek Android build ALINMADI. Sebep:
- Yarn registry erişimi `EAI_AGAIN` ile başarısız oldu.
- npm registry erişimi `EAI_AGAIN` ile başarısız oldu.
- Android SDK/sdmanager bu container'da yok.

Dolayısıyla MPV final APK packaging ve cihaz first-frame sonucu burada başarılı ilan edilmemiştir.
