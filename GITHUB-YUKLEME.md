# GÜNCEL DURUM — KIZILKAN PLAYER ELITE v15.2.3-RC1

**Native Core Migration Phase 1 başladı.** Ağır playlist JSON parse Android Kotlin Native Core'a, panel bilinmiyor çoklu hesap taraması foreground native service'e taşındı. React Native UI korunuyor. MPV dependency 1.0.0 olarak korunuyor.

Kritik amaç: playlist seçimi sonrası 5–10 dakika Pressable/navigation kilitlenmesini ve uygulama background'a alınınca çoklu hesap taramasının durmasını kökten gidermek. Bu sürüm gerçek cihaz/GitHub build ile doğrulanmadan stabil sayılmaz.

---

# KIZILKAN PLAYER ELITE v15.1.1-RC1 — GitHub / Termux Yükleme

Repo: `https://github.com/mkizilkan/kizilkan-player-elite.git`
Telefon çalışma klasörü: `/sdcard/Download/gpt-kizilkan-player-elite`

## Güvenlik

`.git` ve yerel signing materyali korunur. Şunlar Git'e kesinlikle girmez:

- `*.jks`
- `*.keystore`
- `*.base64`
- `*-release-GITHUB.txt`

GitHub Actions secret isimleri:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_CERT_SHA256`

## ZIP senkronu

Yeni ZIP'in kökü `gpt-kizilkan-player-elite/` olmalıdır. Geçici klasöre açıldıktan sonra örnek güvenli senkron:

```bash
rsync -av --delete \
  --exclude='.git' \
  --exclude='frontend/kizilkan-player-elite-release.jks' \
  --exclude='frontend/kizilkan-player-elite-release.jks.base64' \
  --exclude='frontend/kizilkan-player-elite-release-GITHUB.txt' \
  /sdcard/Download/<TEMP>/gpt-kizilkan-player-elite/ \
  /sdcard/Download/gpt-kizilkan-player-elite/
```

## Push öncesi

```bash
cd /sdcard/Download/gpt-kizilkan-player-elite
git status --short
git diff --check
git diff --stat
```

Signing dosyası görünüyorsa DUR.

Daha sonra:

```bash
git add .
git diff --cached --check
git status
git commit -m "feat: KIZILKAN PLAYER ELITE v15.2.3 RC1 lifecycle unified discovery native core"
git push origin main
```

GitHub Actions sonucu olmadan `tsc`, Kotlin, Gradle veya APK başarılı sayılmaz. Özellikle `:mpv-player:compileReleaseKotlin` libmpv 1.0.0 migration'ın ilk native kapısıdır.

## v15.2.4-RC1
Sürüm 15.2.4 / versionCode 150204. GitHub Actions build sonunda APK yanında `APK-BOYUT-RAPORU-v15.2.4.txt` artifact'i de üretilir. Signing dosyaları ve secret metinleri commit edilmez.

## v15.2.5-RC1
GitHub Actions bu sürüm için `15.2.5 / versionCode 150205` görmelidir. Gerçek `tsc --noEmit`, Expo prebuild, Room/KSP/Kotlin ve Gradle release sonucu CI tarafından kanıtlanmadan sürüm stabil kabul edilmez.


## v15.2.6-RC1
GitHub Actions `15.2.6 / versionCode 150206` görmelidir. Özellikle `npx tsc --noEmit` gate'in Search TS2339 ve add-playlist TS2367 hatalarını artık üretmemesi ilk kabul kapısıdır; ardından Expo/Room-KSP/Kotlin/Gradle doğrulanır.


## v15.2.7-RC1
GitHub Kotlin chunked staging writer API-signature düzeltmesi; ayrıntı için `AI-PROJE-DEVIR-BAGLAM.md` ve `SURUM-NOTU-GPT-ELITE-v15.2.7-RC1.md` okunmalıdır.


## v15.2.8-RC1 — Job Lifecycle / Discovery / Player Health Hardening
- Scan ve bulk import için runId/generation sahipliği eklendi; stale snapshot yeni işi tamamlayamaz.
- Discovery AUTH başarısı ile import başarısı ayrıldı; endpoint hataları artık sessizce [] yapılmıyor.
- Live VLC soft stall pause/play müdahalesi kaldırıldı; canlı VLC health son native event + advance sinyaliyle değerlendirilir.
- M3U/MAG canonical duplicate koruması, doğrulanmış Room sonrası legacy cleanup ve Android process-exit telemetrisi eklendi.

## v15.2.9-RC1
GitHub Actions `15.2.9 / versionCode 150209` görmelidir. İlk kapılar `npx tsc --noEmit`, Expo prebuild, `:panel-scan:compileReleaseKotlin`, `:kizilkan-native-core:compileReleaseKotlin` ve release APK'dır. Signing dosyaları commit edilmez. Cihaz kabulünde Sunucu Kodu üç yolu ayrı ayrı test edilmelidir.


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
