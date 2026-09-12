# KIZILKAN PLAYER v17.2.1 RC1 — Doğrulama

Kök neden: GitHub Actions run #80, `app/index.tsx` üzerinden `streaming-file-v172` değerinin eski ScanRecoveryIntent union tipine atanamadığını (TS2322) ve diagnostics export single-flight olayında geçersiz `diagnostics` domain kullanımını (TS2345) kanıtladı.

Yerel doğrulamalar bu corrective pakette hard-gate, JS syntax, JSON metadata ve diff kontrolleri ile yapılır. Tam Android Gradle/release derlemesi yerel telefona yüklenmez; GitHub Actions otoritatif derleme kapısıdır.
