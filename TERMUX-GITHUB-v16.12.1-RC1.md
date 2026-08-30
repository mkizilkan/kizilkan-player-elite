# TERMUX → GitHub — v16.12.1 RC1

Telefon proje klasörü:

```bash
cd /sdcard/Download/kizilkan-player
```

ZIP'i bu klasöre açtıktan sonra:

```bash
git status
git switch -c v16.12.1-rc1
git add -A
git commit -m "fix: v16.12.1 PCAP MAG320 ban-safe player controls hardening"
git push -u origin v16.12.1-rc1
```

`main` dalına push yapılmaz. GitHub Actions build sonucunda full dependency install + project TypeScript gate çalışmalıdır; telefon yalnız oluşan APK'nın fiziksel cihaz kabul testi için kullanılmalıdır.
