# TERMUX / GITHUB — v17.0.13 RC1

Telefon klasörü: `/sdcard/Download/kizilkan-player`

Ağır Gradle/Expo build telefonda çalıştırılmayacaktır. ZIP overlay sonrası yalnız kaynak gate ve Git işlemleri yapılır.

```bash
cd /sdcard/Download/kizilkan-player
git switch -c v17.0.13-rc1-multiscan-mpv-surface-export-corrective

cd /sdcard/Download
unzip -o "KIZILKAN-PLAYER-v17.0.13-RC1-MULTISCAN-MPV-SURFACE-EXPORT-CORRECTIVE.zip" -d /sdcard/Download/kizilkan-player

cd /sdcard/Download/kizilkan-player
node tools/check-v17009-kotlin-roundrobin-resume.js
node tools/check-v17010-mpv-multiscan-battery.js
node tools/check-v17011-buildgate-multiscan-ui.js
node tools/check-v17012-gradle-mpv-taskgraph.js
node tools/check-v17013-multiscan-mpv-export.js
node tools/checkplayercore.js

git diff --check
git status --short
git diff --stat
```

Diff yalnız amaçlanan v17.0.13 dosyalarını içeriyorsa:

```bash
git add -A
git diff --cached --check
git status --short
git diff --cached --stat
git commit -m "fix: KIZILKAN PLAYER v17.0.13 RC1 multi-scan MPV surface export corrective"
git push -u origin v17.0.13-rc1-multiscan-mpv-surface-export-corrective
```

`main` doğrudan push edilmez. Android release build GitHub Actions/remote CI üzerinde doğrulanır.
