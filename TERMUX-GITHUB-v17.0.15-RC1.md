# v17.0.15 RC1 — Termux / GitHub

Bu paket yalnız corrective OVERLAY'dir. Ağır build telefonda yapılmaz.

```bash
cd /sdcard/Download/kizilkan-player
git switch -c v17.0.15-rc1-typescript-theme-token-corrective
cd /sdcard/Download
unzip -o "KIZILKAN-PLAYER-v17.0.15-RC1-TYPESCRIPT-THEME-TOKEN-CORRECTIVE-OVERLAY.zip" -d /sdcard/Download/kizilkan-player
cd /sdcard/Download/kizilkan-player
node tools/check-v17014-txt-export-dbhealth.js
node tools/check-v17015-typescript-theme-token.js
git diff --check
git status --short
git diff --stat
```

Commit/push ancak diff kapsamı doğrulandıktan sonra yapılır.
