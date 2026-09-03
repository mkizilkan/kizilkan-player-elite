# TERMUX / GITHUB — v17.0.3 RC1

> Ana branch'e doğrudan push yapılmaz. Yeni sürüm branch'i kullanılır.

```bash
cd /sdcard/Download/kizilkan-player

git status --short
git switch -c v17.0.3-rc1-mpv-room-multiscan-tv-foundation

# ZIP'i önce ayrı staging klasörüne açın; aşağıdaki STAGE yolunu gerçek açtığınız klasöre göre ayarlayın.
STAGE="/sdcard/Download/KIZILKAN-PLAYER-v17.0.3-RC1-STAGE"
cp -a "$STAGE"/. .

node tools/check-v17003-mpv-room-tv-foundation.js

git status --short
git add -A
git commit -m "v17.0.3 RC1: MPV Room multi-scan TV foundation"
git push -u origin v17.0.3-rc1-mpv-room-multiscan-tv-foundation
```

Not: ZIP'in kendisini doğrudan proje köküne açıp var olan dosyaları körlemesine karıştırmak yerine staging kullanılması önerilir.
