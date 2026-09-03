# TERMUX / GITHUB — v17.0.4 RC1

Telefon build/doğrulama sunucusu değildir. Aşağıdaki komutlar yalnız ZIP'i projeye aktarma, commit ve ayrı branch'e push içindir. Komutlar `&&` ile zincirlenir; biri başarısız olursa sonraki kritik adım çalışmaz.

```bash
cd /sdcard/Download/kizilkan-player && \
git status --short && \
git switch -c v17.0.4-rc1-ultra-scale-account-archive && \
git add -A && \
git commit -m "KIZILKAN PLAYER v17.0.4 RC1: ultra-scale multi-account and TXT archive" && \
git push -u origin v17.0.4-rc1-ultra-scale-account-archive && \
git log -1 --oneline && \
git status --short
```

Main branch'e push yapılmaz.
