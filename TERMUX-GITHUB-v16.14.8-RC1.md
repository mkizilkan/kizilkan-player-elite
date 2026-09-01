# Termux — v16.14.8 RC1 GitHub yükleme

```bash
cd /sdcard/Download/kizilkan-player

git status --short
git switch -c v16.14.8-rc1-performance-runtime

# ZIP'i önce /sdcard/Download içine indirin/açın; staging kökü örnek:
rm -rf /sdcard/Download/kizilkan-v16.14.8-stage
mkdir -p /sdcard/Download/kizilkan-v16.14.8-stage
unzip -q /sdcard/Download/KIZILKAN-PLAYER-v16.14.8-RC1-PLAYER-PERFORMANCE-MPV-RUNTIME-CORRECTIVE.zip -d /sdcard/Download/kizilkan-v16.14.8-stage

rsync -a --delete --exclude='.git/' /sdcard/Download/kizilkan-v16.14.8-stage/ ./

node tools/check-v16148-performance-runtime.js
node tools/check-v16147-definite-assignment.js
node tools/check-v16145-mag-persist-hardgate.js

git status --short
git add -A
git commit -m "v16.14.8 RC1: performance hot-path and MPV runtime corrective"
git push -u origin v16.14.8-rc1-performance-runtime
```

`main` dalına push/merge bu komutlarda yapılmaz.
