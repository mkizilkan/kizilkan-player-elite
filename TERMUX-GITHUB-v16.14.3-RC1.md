# TERMUX / BUILD / GITHUB — v16.14.3 RC1

Proje klasörü:
```bash
cd /sdcard/Download/kizilkan-player
```

## 1. Source prebuild doğrulaması
```bash
node tools/denetle-v16143.js
```
Beklenen build öncesi durum: SOURCE PREBUILD PASS; MPV packaging NOT VERIFIED.

## 2. Bağımlılık + TypeScript
```bash
cd /sdcard/Download/kizilkan-player/frontend
corepack enable
yarn install --frozen-lockfile
npx tsc --noEmit
```

## 3. Expo Android native proje
Generated android klasörü yoksa:
```bash
npx expo prebuild --platform android --clean
```

## 4. Release APK build
```bash
cd /sdcard/Download/kizilkan-player/frontend/android
./gradlew clean :app:assembleRelease
```

## 5. MPV FINAL APK hard-gate
```bash
cd /sdcard/Download/kizilkan-player
node tools/check-mpv-packaging-v16143.js --apk frontend/android/app/build/outputs/apk/release/app-release.apk
```
Bu komut PASS vermeden MPV native packaging çözülmüş kabul edilmez.

## 6. GitHub — RC branch
```bash
cd /sdcard/Download/kizilkan-player
git checkout -B v16.14.3-rc1-corrective
git add -A
git commit -m "KIZILKAN PLAYER v16.14.3 RC1 - corrective prebuild hardening"
git push -u origin v16.14.3-rc1-corrective
```
Main'e merge/push ayrıca açık onay gerektirir.
