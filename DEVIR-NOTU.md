# GÜNCEL DURUM — KIZILKAN PLAYER ELITE v15.2.3-RC1

**Native Data Core / Room + SQLite Phase 1 aktif.** Büyük playlist verisi Room/SQLite indeksine alınır; ana Canlı ekran yalnız görünür sayfayı native sorgular. Native background scan ve MPV 1.0.0 korunur.

Kritik amaç: playlist seçimi sonrası 5–10 dakika Pressable/navigation kilitlenmesini dev JS koleksiyonlarını kaldırarak kökten gidermek. Bu RC GitHub Room/KSP build ve gerçek cihaz testi ile doğrulanmadan stabil sayılmaz.

---

# KIZILKAN PLAYER ELITE — DEVİR NOTU

**Güncel çalışma:** v15.2.3-RC1 — Room/SQLite Native Data Core

Bu kısa dosya yalnız yönlendirmedir. Yeni sohbet/model önce **`AI-PROJE-DEVIR-BAGLAM.md`** dosyasını tamamen okumalıdır; ayrıntılı mimari, gerçek cihaz bulguları, libmpv 1.0.0 migration, Scan Engine v2, Settings UI düzeltmesi, CI/signing ve kalan işler oradadır.

## Güncel teknik kimlik

- Uygulama: `15.2.3`
- Android versionCode: `150203`
- Player Engine: `1.0.0-RC`
- Native MPV: `dev.jdtech.mpv:libmpv:1.0.0`
- Motor zinciri: **Media3 → MPV/FFmpeg → VLC**
- Temiz repo: `mkizilkan/kizilkan-player-elite`
- Telefon: `/sdcard/Download/gpt-kizilkan-player-elite`

## Son kanıtlı APK

**v15.2.2-RC1 APK GitHub Actions ile derlendi ve gerçek telefona kuruldu.** Room/KSP + native bulk import derlenebilirliği kanıtlandı; ancak lifecycle reset, çok-playlist RAM/UI kilidi, discovery ve duplicate import P0 sorunları cihazda devam etti. v15.2.3-RC1 henüz GitHub full build + cihaz kabul testinden geçmedi.

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


## v15.2.3-RC1 Native Data Core ek not

- Room 2.8.3 + SQLite indexed store eklendi.
- KSP, Expo root `kspVersion` ile bağlandı.
- Playlist snapshot + media_items tabloları ve DAO paging/category/item sorguları var.
- Ana Canlı ekran Android'de Room paging kullanır; ilk 80 kayıt + onEndReached ile devam sayfası.
- Özel kullanıcı gruplarında mevcut davranışı korumak için legacy hydrate fallback devam eder.
- Bu RC'nin ilk kritik kapısı GitHub `:kizilkan-native-core:kspReleaseKotlin` / `compileReleaseKotlin` ve `tsc --noEmit` olacaktır.

## v15.2.4-RC1 DEVİR
Room canonical migration, Native EPG, M3U native import, Search/Favorites/VOD/Series paging, discovery progress/stale snapshot fix, editable server code ve Player Session Arbiter Phase 1 uygulanmıştır. Build sonucu GitHub Actions ile doğrulanmadan başarılı denmez. Tam bağlam AI-PROJE-DEVIR-BAGLAM.md içindedir.

## v15.2.5-RC1 DEVİR
v15.2.4 üzerine onaylı son audit uygulanmıştır. Büyük compatibility playlist write artık bounded chunk staging -> native Room final transaction kullanır. Chromecast source-change, existing-session rebind, remote status authority, VOD remote->local position handoff, live DVR capability ve player-exit remote stop zinciri güçlendirilmiştir. Tam ayrıntı `AI-PROJE-DEVIR-BAGLAM.md` içindedir.


## v15.2.6-RC1 DEVİR
GitHub TypeScript HARD gate v15.2.5'i Search `T | FuzzyResult<T>` model çakışması ve duplicate erişilemez Xtream branch nedeniyle durdurdu. v15.2.6 bu iki kökü type-safe normalize + tek Xtream giriş yolu ile düzeltir. v15.2.5 özellikleri korunur.
