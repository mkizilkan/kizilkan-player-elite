# KIZILKAN PLAYER v16.14.6 RC1 — Düzeltme Yorumu

## Kök neden
GitHub Actions v16.14.5 çalışmasında iki bağımsız build engeli doğrulandı:
1. `app/add-playlist.tsx` içinde MAG dalı terminal `return` ile bittiği halde generic M3U commit bloğunda eski `method === "stalker"` ve `magEnrichment.run()` kontrolleri kalmıştı. TypeScript control-flow analizi burada `method` değerini `m3u_url | m3u_file` olarak daralttığı için TS2367, `magEnrichment` için de `never`/TS2339 üretiyordu.
2. v15.2.24/v15.2.25/v15.2.27 tarihi hard-gate'leri yeni verified-persist/async-catalog davranışı korunmasına rağmen eski literal kod/metin biçimlerini arıyordu.

## Düzeltme
- MAG akışı açık `else if (method === "stalker")` branch'ine ayrıldı.
- MAG branch'i `commitPlaylist(shell)` sonrası live-first bootstrap ve VOD/Series enrichment ile terminal return yapıyor.
- Generic commit bloğu yalnız M3U URL / M3U dosya legacy parser akışına ait hale getirildi.
- Eski, artık erişilemez `magEnrichment` köprüsü davranışı yeni bootstrap içine taşınmış olduğundan kaldırıldı; enrichment özelliği kaybedilmedi.
- v15.2.24 progress gate literal metin yerine `onProgress -> setProgress(progress.message)` davranışını doğruluyor.
- v15.2.25 gate hem eski hem v16.14.5+ verified persist sırasını doğrulayarak forward-compatible hale getirildi.
- v15.2.27 gate yeni kullanıcı bilgilendirme metnini de kabul ediyor; background enrichment kullanıcı sözleşmesi korunuyor.
- Yeni `check-v16146-typescript-mag-controlflow.js` eklendi. MAG/M3U control-flow, verified persist-before-catalog, progress ve TS2367/TS2339 semantic regression probe zorunlu.

## Korunan v16.14.5 davranışları
- doğrulanmış MAG hesabını ağır katalogdan önce persist etme,
- live-first bootstrap,
- kategori başlıklarını full VOD/Series indirmeden önizleme,
- non-blocking default catalog enrichment,
- partial_error ile hesabı koruma,
- native MAG gzip header/magic-byte decode ve telemetry.
