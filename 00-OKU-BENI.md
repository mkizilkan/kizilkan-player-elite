# KIZILKAN PLAYER 17.3.1 RC1 — düzeltme paketi

Önce DEVIR-BAGLAM-v17.3.0.md, ardından V17.3.1-RC1-UYGULAMA-PLANI.md ve V17.3.1-RC1-DOGRULAMA.md dosyalarını okuyun.

17.3.0 RC1 GitHub dalı `v17.3.0-rc1-smart-db-multisource` üzerinde `0aea0c4081a034dd072a1c4cfbbb8cfc5916ad41` olarak gönderildi ve Actions #83 APK oluşturdu. Gerçek cihazda çoklu dosya taramasının ilerlemediği ve durdurma ekranının kapatılamadığı bildirildi. Bu kaynak, sürüm kodu 170301 olan 17.3.1 RC1 düzeltmesidir; Android/Kotlin derlemesi ve cihaz kabulü henüz yapılmadı.

Pakette `verification/rc1-to-1731.patch` önceki başarılı dala uygulanacak değişiklikleri, `TERMUX-GONDER-1731.sh` ise dalı güvenli biçimde güncelleyip Actions derlemesini başlatacak komutları içerir. Telefonda APK derlenmez. SHA256 doğrulaması ve dal beklenen commit kontrolü zorunludur. İşlem `main` dalına dokunmaz.
