# GÜNCEL DURUM — KIZILKAN PLAYER ELITE v15.2.3-RC1

**Native Data Core / Room + SQLite Phase 1 aktif.** Büyük playlist verisi Room/SQLite indeksine alınır; ana Canlı ekran yalnız görünür sayfayı native sorgular. Native background scan ve MPV 1.0.0 korunur.

Kritik amaç: playlist seçimi sonrası 5–10 dakika Pressable/navigation kilitlenmesini dev JS koleksiyonlarını kaldırarak kökten gidermek. Bu RC GitHub Room/KSP build ve gerçek cihaz testi ile doğrulanmadan stabil sayılmaz.

---

# BAŞLARKEN OKU — KIZILKAN PLAYER ELITE

**Güncel çalışma: v15.2.3-RC1 — Room/SQLite Native Data Core**

Yeni sohbet/model için ilk ve zorunlu belge: **`AI-PROJE-DEVIR-BAGLAM.md`**.

Kritik gerçekler:

- Motor zinciri: **Media3 → MPV/FFmpeg → VLC**.
- Native MPV artık `libmpv 1.0.0` multiple-instance API migration hattındadır.
- Son kanıtlı/kurulmuş APK: **v15.2.2-RC1**. Build/kurulum başarılı oldu; gerçek cihazda lifecycle/RAM/discovery/duplicate import sorunları devam etti.
- v15.2.3-RC1 henüz GitHub build ve cihaz kabul testi geçmedi.
- Kör patch/fallback yasaktır; önce kök neden kanıtlanır.
- Çalışan özellik silinmez/azaltılmaz.
- Her ZIP `gpt-kizilkan-player-elite/` kökü ve güncel AI devir belgesi ile çıkar.

Detay için sırasıyla:
1. `AI-PROJE-DEVIR-BAGLAM.md`
2. `SURUM-NOTU-GPT-ELITE-v15.2.3-RC1.md`
3. `REGRESYON-DENETIM-GPT-ELITE-v15.2.3-RC1.md`

## v15.2.4-RC1 NOTU
Native Core Phase 2: Android playlist canonical store Room/SQLite'dır; legacy heavy JSON yalnız migration/fallback. Native M3U + Native EPG + Room paging + unified discovery progress + native player session arbiter Phase 1 eklenmiştir. Ayrıntı: AI-PROJE-DEVIR-BAGLAM.md ve SURUM-NOTU-GPT-ELITE-v15.2.4-RC1.md.

## v15.2.5-RC1 NOTU
Güncel aktif sürüm: v15.2.5-RC1. Native Core Phase 2 korunur; son audit ile chunked native playlist staging ve Chromecast remote authority/rebind/handoff hardening eklendi. Ayrıntı için `AI-PROJE-DEVIR-BAGLAM.md` ve `SURUM-NOTU-GPT-ELITE-v15.2.5-RC1.md` okunmalıdır.


## v15.2.6-RC1 NOTU
Güncel aktif sürüm v15.2.6-RC1'dir. v15.2.5 GitHub `tsc --noEmit` gate'inde yakalanan Search Room/Fuzzy result shape çakışması ve erişilemez duplicate Xtream/Code control-flow branch'leri gerçek tip modelinden düzeltilmiştir; HARD gate bypass edilmemiştir. Ayrıntı `AI-PROJE-DEVIR-BAGLAM.md` ve `SURUM-NOTU-GPT-ELITE-v15.2.6-RC1.md` içindedir.


## v15.2.7-RC1
GitHub Kotlin chunked staging writer API-signature düzeltmesi; ayrıntı için `AI-PROJE-DEVIR-BAGLAM.md` ve `SURUM-NOTU-GPT-ELITE-v15.2.7-RC1.md` okunmalıdır.


## v15.2.8-RC1 — Job Lifecycle / Discovery / Player Health Hardening
- Scan ve bulk import için runId/generation sahipliği eklendi; stale snapshot yeni işi tamamlayamaz.
- Discovery AUTH başarısı ile import başarısı ayrıldı; endpoint hataları artık sessizce [] yapılmıyor.
- Live VLC soft stall pause/play müdahalesi kaldırıldı; canlı VLC health son native event + advance sinyaliyle değerlendirilir.
- M3U/MAG canonical duplicate koruması, doğrulanmış Room sonrası legacy cleanup ve Android process-exit telemetrisi eklendi.

## v15.2.9-RC1 AKTİF GELİŞTİRME NOTU
Güncel kaynak sürüm 15.2.9 / versionCode 150209'dur. Sunucu Kodu üç yolu artık Server Discovery Orchestrator üzerinden ortak candidate -> native scan -> verify -> import -> Room akışına bağlanmıştır. PanelScan başlangıçları atomik claim + ACCEPTED/BUSY sözleşmelidir; pause/resume/cancel runId-scoped'dur. Panel directory cache-first + timeout/retry kullanır. Ayrıntı `AI-PROJE-DEVIR-BAGLAM.md` ve `SURUM-NOTU-GPT-ELITE-v15.2.9-RC1.md` içindedir.


## v15.2.10-RC1
- Panel taraması gerçek ağ bağlantısı iptali + worker shutdown ile durdurulur.
- Analiz UI tarama başında açılır; progress/pause/resume/stop ve explicit selection zorunludur.
- PIN’li profil process restart/session restore ile atlanamaz; runtime profile-session gate eklendi.
