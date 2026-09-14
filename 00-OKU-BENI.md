# KIZILKAN PLAYER v17.3.0 RC1 — kaynak checkpoint

Önce bu dosyayı, sonra DEVIR-BAGLAM-v17.3.0.md ve V17.3.0-DOGRULAMA.md dosyalarını okuyun.

Kaynak değişiklikleri uygulanmıştır. TypeScript ve 84 denetim geçmiştir. Bu paket APK veya Android derlemesi onaylanmış bir sürüm DEĞİLDİR.
GitHub entegrasyonu yazma isteğine 403 döndürdüğünden Android derlemesi başlayamadı.

frontend/, tools/ ve .github/ klasörleri tam kaynak içerir. node_modules ve üretilmiş Android build çıktıları dahil değildir; frontend/modules içindeki tüm Kotlin kaynakları dahildir.

Doğrulama: frontend klasöründe `yarn install --frozen-lockfile --production=false`, `node ../tools/denetle.js`, `yarn exec tsc --noEmit`.
GitHub: mkizilkan/kizilkan-player-elite deposunda v17.3.0-rc1-smart-db-multisource dalı için hazırlanan push tetikleyicisi mevcuttur. Dal henüz uzakta oluşturulmadı. Yazma erişimi sağlanınca devir notundaki doğrulanmış tabandan commit oluşturup bu dalda CI çalıştırın.
