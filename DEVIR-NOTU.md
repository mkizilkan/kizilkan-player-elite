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


## v15.2.7-RC1
GitHub Kotlin chunked staging writer API-signature düzeltmesi; ayrıntı için `AI-PROJE-DEVIR-BAGLAM.md` ve `SURUM-NOTU-GPT-ELITE-v15.2.7-RC1.md` okunmalıdır.


## v15.2.8-RC1 — Job Lifecycle / Discovery / Player Health Hardening
- Scan ve bulk import için runId/generation sahipliği eklendi; stale snapshot yeni işi tamamlayamaz.
- Discovery AUTH başarısı ile import başarısı ayrıldı; endpoint hataları artık sessizce [] yapılmıyor.
- Live VLC soft stall pause/play müdahalesi kaldırıldı; canlı VLC health son native event + advance sinyaliyle değerlendirilir.
- M3U/MAG canonical duplicate koruması, doğrulanmış Room sonrası legacy cleanup ve Android process-exit telemetrisi eklendi.

## v15.2.9-RC1 DEVİR
Sunucu Kodu `Kodum var / Paneli biliyorum / Paneli bilmiyorum` orchestration kök hataları giderildi: atomik native job claim, açık BUSY sonucu, runId-scoped kontrol, Firebase client+server timeout, retry, cache-first panel directory ve seçilmiş `hosts[]` doğrudan native scan. v15.2.8 ve önceki Room/Cast/Player/Discovery özellikleri korunur. Gerçek build CI, üç yolun davranış kabulü gerçek cihazla doğrulanacaktır.


## v15.2.10-RC1
- Panel taraması gerçek ağ bağlantısı iptali + worker shutdown ile durdurulur.
- Analiz UI tarama başında açılır; progress/pause/resume/stop ve explicit selection zorunludur.
- PIN’li profil process restart/session restore ile atlanamaz; runtime profile-session gate eklendi.

## v15.2.11-RC1 — Scan Terminal Cancellation / Selection / Quick Parser Hardening
- v15.2.10 cihaz testinde hazırlık aşamasında `Durdur`un yalnız mesaj üretmesi kökten düzeltildi: katalog REST çağrıları harici AbortSignal ile kesilir.
- PanelScan native job finalization artık her çıkışta terminal snapshot yazar; CANCELLING/STARTING kalıcı olamaz.
- Tekli/çoklu Durdur tek basışta `Durduruluyor…` kilidine girer; tekrar cancel spam'i yoktur.
- Unified hesap taraması round-robin dağıtılır; hesaplar paralel ilerleme görür.
- Discovery sonucundan playlist importuna geçiş kullanıcı seçimine bağlı kalır; aynı aboneliğin DNS alias'ları tek playlist/validatedHosts olarak gruplanır.
- Hızlı yapıştırmada `user:pass` ve `user:password` geçerli hesap çiftleridir.

## v15.2.12-RC1
TypeScript TS18048 build blocker giderildi: resolveOneBulkAccount ScanExecutionControl parametresi zorunlu hale getirildi; v15.2.11 davranışları korunur.
