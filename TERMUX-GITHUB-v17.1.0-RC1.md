# TERMUX / GITHUB — v17.1.0 RC1

Telefon yalnız hafif Git ve Node gate kontrolleri için kullanılmalıdır. Gradle/Expo ağır build telefonda çalıştırılmamalıdır.

Önerilen branch:

`v17.1.0-rc1-ultrascale-scan-runtime`

Overlay uygulandıktan sonra commit öncesi:

```bash
cd /sdcard/Download/kizilkan-player
node tools/check-v17013-multiscan-mpv-export.js
node tools/check-v17014-txt-export-dbhealth.js
node tools/check-v17015-typescript-theme-token.js
node tools/check-v1710-ultrascale-scan.js
node tools/checkplayercore.js
git diff --check
git status --short
git diff --stat
```

Beklenmeyen dosya değişikliği varsa commit atmayın. Özellikle MPV modülü bu sürümde değişmemelidir.
