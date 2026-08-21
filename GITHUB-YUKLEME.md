# KIZILKAN PLAYER ELITE — GitHub / Termux / APK Akışı (v15.0.4)

## Güncel kimlik
- Repo: `mkizilkan/kizilkan-player-elite`
- Telefon klasörü: `/sdcard/Download/gpt-kizilkan-player-elite`
- Branch: `main`
- Package: `com.gpt.kizilkan.player`
- Güncel sürüm: `15.0.4` / versionCode `150004`

> Yeni sohbet/devralma için önce `AI-PROJE-DEVIR-BAGLAM.md` okunmalıdır.

## Güvenli ZIP senkronu
Yeni ZIP her zaman `gpt-kizilkan-player-elite/` köküyle gelir. Mevcut çalışma ağacına aktarırken `.git` ve yerel release signing materyali korunmalıdır.

Örnek mantık:

```bash
rsync -av --delete \
  --exclude='.git' \
  --exclude='frontend/kizilkan-player-elite-release.jks' \
  --exclude='frontend/kizilkan-player-elite-release.jks.base64' \
  --exclude='frontend/kizilkan-player-elite-release-GITHUB.txt' \
  YENI_ZIP_ACILMIS_KOK/ \
  /sdcard/Download/gpt-kizilkan-player-elite/
```

## Commit / push

```bash
cd /sdcard/Download/gpt-kizilkan-player-elite
git status --short
git diff --check
git add .
git commit -m "fix: GPT KIZILKAN PLAYER ELITE v15.0.4 certificate gate"
git push origin main
```

Signing dosyaları `git status` içinde görünüyorsa DUR; `.gitignore` kontrol edilmeden commit yapılmaz.

## Release signing Secrets
Repository → Settings → Secrets and variables → Actions altında release build için beş değer gerekir:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_CERT_SHA256`

`ANDROID_CERT_SHA256`, kalıcı keystore için `keytool -list -v` çıktısındaki SHA256 fingerprint'tir. Şifre veya private key değildir. Keystore/Base64/parolalar repo veya Markdown içine yazılmaz.

## GitHub Actions sırası
1. dependencies
2. `denetle.js` HARD gate
3. `tsc --noEmit` HARD gate
4. Expo clean prebuild
5. kalıcı release signing
6. manifest/TV/HTTP doğrulama
7. Gradle release APK
8. package/version/apksigner/certificate fingerprint HARD gate
9. APK adlandırma
10. artifact upload
11. GitHub Release

## v15.0.3'te doğrulanan gerçek durum
v15.0.3 full Gradle release APK'yı gerçekten üretti, MPV Kotlin compile geçti, package/version ve `apksigner verify` geçti. Son failure yalnız eski hard-coded expected certificate fingerprint'iydi. v15.0.4 bunu `ANDROID_CERT_SHA256` Secret tabanlı gate'e taşır.

## APK alma
Actions tamamen yeşil olduktan sonra APK hem Artifact hem GitHub Release olarak yüklenir. Build zinciri tamamlanmadan “APK hazır” kabul edilmez.
