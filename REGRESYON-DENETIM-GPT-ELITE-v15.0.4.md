# KIZILKAN PLAYER ELITE v15.0.4 — REGRESYON DENETİMİ

## Kod sözleşmesi
- Uygulama sürümü 15.0.4 / versionCode 150004.
- libmpv dependency 0.5.1 olarak korunur.
- Yanlış nested MPV 0.5.1 API sembolleri geri dönmez.
- Media3 → MPV/FFmpeg → VLC fallback zinciri korunur.
- TV hidden surface alpha/zIndex gerilemesi yapılmaz.
- `ANDROID_CERT_SHA256` GitHub Secret workflow env'ine bağlıdır.
- Hard-coded 64-hex expected certificate SHA workflow içinde yasaktır.
- Secret fingerprint formatı normalize edilir ve 64 hex olarak doğrulanır.
- `AI-PROJE-DEVIR-BAGLAM.md` mevcut ve v15.0.4'e günceldir.

## Gerçek CI geçmişinden doğrulanan
- v15.0.3 TypeScript HARD gate geçti.
- v15.0.3 MPV Kotlin compile geçti.
- v15.0.3 full Gradle release APK üretti.
- v15.0.3 apksigner verify geçti.
- Yerel keystore fingerprint'i APK fingerprint'iyle eşleşti.
- v15.0.3 failure yalnız eski hard-coded expected certificate SHA gate'inde oldu.

## v15.0.4 GitHub CI ile doğrulanacak
1. `ANDROID_CERT_SHA256` secret mevcut/format doğru.
2. Full build tekrar geçiyor.
3. APK fingerprint expected secret ile eşleşiyor.
4. `APK'yi adlandir` çalışıyor.
5. Artifact upload başarılı.
6. GitHub Release başarılı ve doğrudan APK erişilebilir.

## Sonraki cihaz testleri
- Telefon: kurulum/update, uygulama açılışı, Media3, MPV, VLC, same-channel retry, VOD progress, stall recovery.
- TV Box: zap, surface şerit/tint, ses-var-görüntü-yok, panel aç/kapat, focus/D-pad, eski frame.

## Sonraki büyük migration
Build ve temel cihaz testi sonrasında ayrı plan/onay ile `dev.jdtech.mpv:libmpv:1.0.0` instance API migration değerlendirilecek.
