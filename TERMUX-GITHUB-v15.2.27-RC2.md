# Termux / GitHub — v15.2.27-RC2

Önerilen sürüm branch adı: `v15.2.27-rc2`

Temiz repo tabanı olarak önceki sürüm branch'i `origin/v15.2.27-rc1` kullanılmalıdır.

```bash
cd /sdcard/Download/kizilkan-player
```

```bash
git switch -c v15.2.27-rc2 origin/v15.2.27-rc1
```

RC2 ZIP bu klasörün üzerine açıldıktan sonra:

```bash
git status --short
```

Beklenmeyen `D` kaydı yoksa:

```bash
git add -A
```

```bash
git commit -m "fix: KIZILKAN PLAYER ELITE v15.2.27 RC2 CI TypeScript hard gate"
```

```bash
git push -u origin v15.2.27-rc2
```
