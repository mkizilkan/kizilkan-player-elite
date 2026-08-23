# GÜNCEL DURUM — KIZILKAN PLAYER ELITE v15.2.1-RC1

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
git commit -m "feat: KIZILKAN PLAYER ELITE v15.1.1 RC1 player core mpv1 scan v2 ui fixes"
git push origin main
```

GitHub Actions sonucu olmadan `tsc`, Kotlin, Gradle veya APK başarılı sayılmaz. Özellikle `:mpv-player:compileReleaseKotlin` libmpv 1.0.0 migration'ın ilk native kapısıdır.
