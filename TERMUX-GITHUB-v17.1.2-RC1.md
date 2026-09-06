# TERMUX / GITHUB — v17.1.2 RC1

Telefon üzerinde ağır build/test çalıştırılmaz. Overlay uygulandıktan sonra yalnız hafif Git kontrolleri kullanılır:

```bash
cd /sdcard/Download/kizilkan-player
git status --short
git diff --stat
git diff --name-status
git diff --check
```

Beklenmeyen dosya yoksa yeni corrective branch/commit GitHub'a push edilir. Android release build ve tam gate zinciri GitHub Actions üzerinde yürütülür.
