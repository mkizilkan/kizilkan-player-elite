# TERMUX → GitHub — v17.0.0 RC1

Telefon proje klasörü:
`/sdcard/Download/kizilkan-player`

Önerilen branch:
`v17.0.0-rc1-tv-navigation-focus-player-stability`

```bash
cd /sdcard/Download/kizilkan-player

git status
git fetch origin

git switch -c v17.0.0-rc1-tv-navigation-focus-player-stability

# ZIP içeriğini bu klasöre güvenli biçimde staging/rsync ile aldıktan sonra:
node tools/check-v17000-tv-navigation-focus-player.js
node tools/check-v16149-tv-navigation-focus.js
node tools/check-v16148-performance-runtime.js

git diff --check
git status --short

git add -A
git diff --cached --check
git diff --cached --stat

git commit -m "v17.0.0 RC1: TV navigation focus and player stability"
git push -u origin v17.0.0-rc1-tv-navigation-focus-player-stability
```

`main` branch'e push/merge bu belge tarafından otomatik önerilmez; inceleme ve kullanıcı onayı sonrasında yapılmalıdır.
