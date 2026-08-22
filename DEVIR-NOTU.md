# GÜNCEL DURUM — KIZILKAN PLAYER ELITE v15.2.0-RC1

**Native Core Migration Phase 1 başladı.** Ağır playlist JSON parse Android Kotlin Native Core'a, panel bilinmiyor çoklu hesap taraması foreground native service'e taşındı. React Native UI korunuyor. MPV dependency 1.0.0 olarak korunuyor.

Kritik amaç: playlist seçimi sonrası 5–10 dakika Pressable/navigation kilitlenmesini ve uygulama background'a alınınca çoklu hesap taramasının durmasını kökten gidermek. Bu sürüm gerçek cihaz/GitHub build ile doğrulanmadan stabil sayılmaz.

---

# KIZILKAN PLAYER ELITE — DEVİR NOTU

**Güncel çalışma:** v15.1.1-RC1

Bu kısa dosya yalnız yönlendirmedir. Yeni sohbet/model önce **`AI-PROJE-DEVIR-BAGLAM.md`** dosyasını tamamen okumalıdır; ayrıntılı mimari, gerçek cihaz bulguları, libmpv 1.0.0 migration, Scan Engine v2, Settings UI düzeltmesi, CI/signing ve kalan işler oradadır.

## Güncel teknik kimlik

- Uygulama: `15.1.1`
- Android versionCode: `150101`
- Player Engine: `1.0.0-RC`
- Native MPV: `dev.jdtech.mpv:libmpv:1.0.0`
- Motor zinciri: **Media3 → MPV/FFmpeg → VLC**
- Temiz repo: `mkizilkan/kizilkan-player-elite`
- Telefon: `/sdcard/Download/gpt-kizilkan-player-elite`

## Son kanıtlı APK

**APK v15.0.4 DERLENDI**, imza/SHA gate geçti ve gerçek telefona kuruldu. v15.1.1-RC1 henüz GitHub full build + gerçek cihaz kabul testinden geçmedi; başarılı gibi sunulmayacaktır.

## Bu RC'de ana değişiklikler

- libmpv 0.5.1 → 1.0.0 multiple-instance migration
- MPV session/surface/codec diagnostics
- Session-isolated MPV view lifecycle
- Resume seek actual-position confirmation
- Scan Engine v2: 5 hız profili + account worker pool + Pause/Resume/Stop
- Native panel scan pause/resume
- Settings telefon overlap kök düzeltmesi
- v15.0.5 RC1 Çoklu Hesap / Hızlı Yapıştırma / MAG / seek geliştirmeleri korunuyor

## İlk yapılacak

1. `cd frontend && node ../tools/denetle.js`
2. Uygun dependency ortamında `npx tsc --noEmit`
3. GitHub Actions ile libmpv 1.0.0 Kotlin/release build
4. 4K MPV + 20 ZAP + resume + VLC VOD + scan + UI gerçek cihaz matrisi
