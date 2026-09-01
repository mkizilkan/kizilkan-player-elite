# KIZILKAN PLAYER ELITE v15.2.25 RC2 — Düzeltme Yorumu

RC1 GitHub Actions `npx tsc --noEmit` aşamasında `frontend/src/utils/stalker.ts` içinde TS2344/TS2345 ile durdu. Kök neden, MAG learned-compat cache'inin `Record<string, LearnedMagCompat>` nesnesini yalnızca primitive (`string | number | boolean | null`) kabul eden ortak storage API'sine doğrudan vermesiydi.

RC2 düzeltmesi:
- Learned MAG compatibility store ortak storage sözleşmesine uygun JSON string olarak saklanır.
- Okuma tarafında JSON parse + runtime şekil doğrulaması yapılır; bozuk/eski cache güvenli biçimde boş store'a düşer.
- MAG254 varsayılanı, MAG250 fallback'i, learned endpoint/profile sırası, bounded reject governor, live-first commit ve Room enrichment korunur.
- `tools/check-v15225-rc2-typescript-build.js` eklendi. Bu gate gerçek proje TypeScript derleyicisini `--noEmit` ile çalıştırır; TypeScript yoksa testi sahte başarıya çevirmek yerine hata verir.
- Master `tools/denetle.js` bu tam TypeScript gate'ini artık zorunlu çalıştırır.
