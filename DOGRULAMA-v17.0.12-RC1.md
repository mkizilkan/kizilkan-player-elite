# KIZILKAN PLAYER v17.0.12 RC1 — Doğrulama

- GitHub Actions v17.0.11 gerçek build logundaki `:app:mergeReleaseJniLibFolders` implicit dependency hatası kök neden olarak alındı.
- `prepareKizilkanMpvLibcxx` producer taskı TaskProvider olarak tutuldu ve `merge*JniLibFolders` ile `merge*NativeLibs` tasklarına explicit dependency bağlandı.
- v17.0.11 sırasında bozulan `tools/denetle.js` gate listesi onarıldı.
- v17.0.9, v17.0.10, v17.0.11 ve v17.0.12 kaynak gate'leri çalıştırılacaktır.
- Android APK build bu paket oluşturulurken çalıştırılmış sayılmaz; gerçek kabul GitHub Actions release build ve final APK MPV ABI/sembol gate'i ile yapılacaktır.
