# KIZILKAN PLAYER v17.0.14 RC1 — TERMUX / GITHUB

Telefon yalnız hafif dosya/Git/Node gate işleri için kullanılacaktır. Telefonda ağır Gradle/Expo build çalıştırmayın.

```bash
cd /sdcard/Download/kizilkan-player
git switch -c v17.0.14-rc1-txt-export-dbhealth-corrective

cd /sdcard/Download
unzip -o "KIZILKAN-PLAYER-v17.0.14-RC1-TXT-EXPORT-DBHEALTH-CORRECTIVE-OVERLAY.zip" \
  -d /sdcard/Download/kizilkan-player

cd /sdcard/Download/kizilkan-player
node tools/check-v16130-db-health-telemetry.js
node tools/check-v17012-gradle-mpv-taskgraph.js
node tools/check-v17013-multiscan-mpv-export.js
node tools/check-v17014-txt-export-dbhealth.js
node tools/checkplayercore.js

git diff --check
git status --short
git diff --stat
```

Beklenmeyen dosya değişikliği/silmesi varsa COMMIT ETMEYİN. Özellikle eski unrelated dosyalar, `frontend/src/utils/pin.ts` veya `frontend/app/profile-select.tsx` değişmemelidir.

Staged son kontrol:

```bash
git add -A
git diff --cached --check
git status --short
git diff --cached --stat
```

Kapsam doğruysa:

```bash
git commit -m "fix: KIZILKAN PLAYER v17.0.14 RC1 TXT export DB-health corrective"
git push -u origin v17.0.14-rc1-txt-export-dbhealth-corrective
```

`main` branch'e doğrudan push yapılmaz. Build GitHub Actions üzerinden alınır.
