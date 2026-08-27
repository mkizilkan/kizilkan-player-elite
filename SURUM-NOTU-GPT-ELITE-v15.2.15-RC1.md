# KIZILKAN PLAYER ELITE v15.2.15-RC1

**Tarih:** 2026-08-25
**Sürüm:** 15.2.15
**Android versionCode:** 150215

## Amaç
v15.2.14-RC1 GitHub Actions çalışmasında TypeScript HARD gate'te görülen `frontend/src/utils/stalker.ts(440,61) TS2345` build blocker'ını en dar kapsamda düzeltmek.

## Kök neden
`[{series_id:string},{movie_id:string}]` heterojen object literal dizisi TypeScript tarafından karşılıklı opsiyonel alanları `undefined` olabilen union olarak çıkarılıyordu. Bu değer `Record<string,string>` isteyen `stalkerOrderedList` parametresine verildiğinde TS2345 oluşuyordu.

## Düzeltme
MAG Series lookup varyantları `Record<string,string>[]` olarak açıkça tiplendi. `series_id` ve `movie_id` davranışları korunmuştur; runtime protokol akışı değiştirilmemiştir.

## Regresyon koruması
`tools/check-v15215-typescript-contract.js` eklendi ve `tools/denetle.js` zincirine bağlandı. Gate explicit contract'ı, iki lookup varyantını ve ilgili TS2345 sınıfını denetler.

## Sınır
Gerçek GitHub Actions build ve gerçek cihaz testi bu kaynak paketi oluşturulurken yapılmış sayılmaz; CI ve cihaz acceptance ayrıca kanıtlanmalıdır.
