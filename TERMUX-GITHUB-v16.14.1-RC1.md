# Termux / GitHub — v16.14.1 RC1 Recovery Checkpoint

```bash
cd /sdcard/Download
rm -rf kizilkan-player
unzip -o KIZILKAN-PLAYER-v16.14.1-RC1-RECOVERY-CHECKPOINT.zip -d kizilkan-player
cd /sdcard/Download/kizilkan-player

grep '"version"' frontend/package.json | head
grep -n 'versionCode' frontend/app.json | head
node tools/check-v16141-recovery-checkpoint.js

git status
git checkout -b v16.14.1-rc1-recovery
git add -A
git status
git commit -m "KIZILKAN PLAYER v16.14.1 RC1 - recovery checkpoint"
git push -u origin v16.14.1-rc1-recovery
```

Eğer branch zaten varsa:

```bash
git checkout v16.14.1-rc1-recovery
```
