# Termux / GitHub — v16.13.10 RC1

```bash
cd /sdcard/Download
unzip -o KIZILKAN-PLAYER-v16.13.10-RC1-CATALOG-MAG-PLAYLIST-CORRECTIVE.zip -d kizilkan-player
cd /sdcard/Download/kizilkan-player

grep '"version"' frontend/package.json | head
grep -n '"versionCode"' frontend/app.json

git status
git checkout -b v16.13.10-rc1
git add -A
git status
git commit -m "KIZILKAN PLAYER v16.13.10 RC1 - catalog MAG playlist corrective"
git push -u origin v16.13.10-rc1
```
