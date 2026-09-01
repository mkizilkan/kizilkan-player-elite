# KIZILKAN PLAYER v16.13.0 RC1 — Termux / GitHub

Telefon proje klasörü:

```bash
cd /sdcard/Download/kizilkan-player
```

Önerilen sürüm branch'i:

```bash
git switch -c v16.13.0-rc1
```

Durumu kontrol et:

```bash
git status
git diff --stat
```

Tüm v16.13.0 RC1 değişikliklerini ekle:

```bash
git add -A
```

Commit:

```bash
git commit -m "KIZILKAN PLAYER v16.13.0 RC1 - DB Health Center and Flight Recorder V6"
```

Doğru remote'u kontrol et:

```bash
git remote -v
```

Beklenen repository:
`https://github.com/mkizilkan/kizilkan-player-elite.git`

Sürüm branch'ini gönder:

```bash
git push -u origin v16.13.0-rc1
```

Doğrula:

```bash
git branch -vv
git log -3 --oneline --decorate
git status
```

`main` branch'e otomatik push/merge yapılmaz. Native Android build ve full dependency TypeScript gate'leri GitHub/CI ortamında çalıştırılmalı; telefon final fiziksel kabul testi içindir.
