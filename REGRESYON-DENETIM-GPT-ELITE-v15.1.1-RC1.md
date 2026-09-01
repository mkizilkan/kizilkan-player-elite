# KIZILKAN PLAYER ELITE v15.1.1-RC1 — Regresyon / Kabul Matrisi

## Build kapıları
- [x] Kanıtlanan v15.1.0 Kotlin hata satırları analiz edildi.
- [x] `onVideoReady` EventDispatcher payload: `Map<String, Any>`.
- [x] `onDiagnostic` payload: `LinkedHashMap<String, Any>`.
- [x] Nullable telemetry bridge sınırında normalize/eleniyor; unsafe cast yok.
- [ ] `npx tsc --noEmit` GitHub gerçek dependency graph ile 0 hata.
- [ ] `:mpv-player:compileReleaseKotlin` libmpv 1.0.0 ile başarılı.
- [ ] Release Gradle/APK/signature/artifact başarılı.

## Korunması zorunlu
- [x] libmpv 1.0.0 instance lifecycle korunur.
- [x] MPV 4K fresh software instance recovery korunur.
- [x] ZAP/session generation izolasyonu korunur.
- [x] Resume position confirmation korunur.
- [x] Scan Engine v2 ve 5 profil korunur.
- [x] Pause/Resume/Stop tarama davranışı korunur.
- [x] Responsive Settings/playlist layout düzeltmeleri korunur.

## Gerçek cihaz kabul testleri — build sonrası
- [ ] 4K/UHD MPV görüntü+ses stabil.
- [ ] 20 hızlı ZAP, eski ses kalmıyor/yeni görüntü geliyor.
- [ ] Media3 ve MPV resume gerçek pozisyondan başlıyor.
- [ ] VLC VOD açılıyor veya kök neden kanıtlanıyor.
- [ ] Çoklu hesap canlı sonuç + pause/resume/stop + hız profilleri.
- [ ] Telefon Settings overlap/touch target regresyonu yok.
