# KIZILKAN PLAYER v17.2.0-RC1 — TERMUX / GITHUB

Telefon build sunucusu değildir. Aşağıdaki komutlar yalnız corrective overlay'i gerçek Git çalışma ağacına uygulamak, diff kontrol etmek ve GitHub'a push etmek içindir.

```bash
cd /sdcard/Download/kizilkan-player

git status --short
git branch --show-current
git log -1 --oneline

# Güvenlik dalı
git switch -c v17.2.0-rc1-consolidated-corrective

# ZIP Download klasöründeyse overlay'i repo köküne aç
unzip -o /sdcard/Download/KIZILKAN-PLAYER-v17.2.0-RC1-CONSOLIDATED-CORRECTIVE-OVERLAY.zip -d /sdcard/Download/kizilkan-player

# ZORUNLU diff kontrolleri
git status --short
git diff --stat
git diff --name-status
git diff --check

# Korunan dosyalar beklenmedik değişmişse COMMIT ETME
git diff -- frontend/src/utils/pin.ts frontend/app/profile-select.tsx

# Değişiklikler beklenen listedeyse
git add \
  frontend/package.json \
  frontend/app.json \
  frontend/app/add-playlist.tsx \
  frontend/app/diagnostic.tsx \
  frontend/src/player/PlayerHost.tsx \
  frontend/src/utils/diagnostics.ts \
  frontend/modules/panel-scan \
  frontend/modules/kizilkan-native-core \
  frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvView.kt \
  tools \
  DUZELTME-YORUMU-v17.2.0-RC1.md \
  DOGRULAMA-v17.2.0-RC1.md \
  SURUM-NOTU-v17.2.0-RC1.md \
  TERMUX-GITHUB-v17.2.0-RC1.md \
  AI-PROJE-DEVIR-BAGLAM-v17.2.0.md

git diff --cached --stat
git diff --cached --name-status
git diff --cached --check

git commit -m "KIZILKAN PLAYER v17.2.0 RC1 consolidated runtime corrective"
git push -u origin v17.2.0-rc1-consolidated-corrective
```

GitHub Actions release build sonucu görülmeden APK başarılı kabul edilmemelidir.
