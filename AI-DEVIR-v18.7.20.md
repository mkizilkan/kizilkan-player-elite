# AI DEVİR — v18.7.20 RC1 (dal `v18.7.20-rc1-catalog-speed-vod-class`)

**Tarih:** 2026-10-06 · **Taban:** v18.7.19 · **Yazan:** Claude Opus
**Kaynak:** Cihaz logu `kizilkan-diagnostics-2026-10-06T16-45-26` (hkpremium).

## Kanıt (log)
- **Filmler kayboldu:** `STALKER_CATALOG_DONE vod=0, series=12740, seriesFromVod:6244`. `STALKER_PAGINATION_STOP type=vod loaded=6244/22905`. Yani hkpremium'un 22905 "film"inin yüklenen 6244'ünün HEPSİ diziye sınıflandı → Filmler bölümü boş.
- **Yavaş/yarım:** VOD %27 (6244/22905), dizi 6496/9501 — her tür 75 sn TIME_BUDGET'e takılıp kesiliyor. avgPage ~165ms, conc=6, sunucu ~1 sn/sayfa. Üst sayfa sınırı 600 (≈8400 öğe) da büyük katalogları kesiyordu.

## Yapılan
| Kod | Değişiklik | Dosya |
|---|---|---|
| **S (hız)** | Katalog sayfalama: `PAGE_CONCURRENCY` 6→**20** (kullanıcı isteği), `PAGE_BUDGET_MS` 75→**100 sn**, `ORDERED_LIST_ABSOLUTE_MAX_PAGES` 600→**2000**. `get_ordered_list` SALT-OKUNUR liste API'si (oynatma/create_link değil) → "tek upstream" oynatma kuralını bozmaz. Aynı/az fazla sürede kat kat fazla içerik. | `stalker.ts` |
| **V (filmler teşhisi, kanıt-önce)** | `STALKER_VOD_PARTITION` telemetrisi: hangi ölçütle (`is_series` bayrağı / `series` dizisi / kategori adı / tip) kaç öğenin diziye sınıflandığı + ilk 10 kategori ADI (değer yok). Bir sonraki testte hangi ölçütün yanlış tetiklediği KESİN görünür → ardından sınıflama düzeltilir (diğer portalleri bozmadan). **Kör düzeltme yapılmadı (§2).** | `stalker.ts` |

## Doğrulama (PC)
- tsc temiz · denetle TEMİZ · `check-v18720` PASS. `check-v18708` ileri-uyumlu yapıldı (conc/sayfa sabit yerine >=). Native değişiklik YOK.

## Cihazda test
hkpremium'u yenile → (a) içerik daha hızlı/çok yüklenmeli (conc 20); (b) log'da `STALKER_VOD_PARTITION` → `byIsSeriesFlag/byCategoryTitle/...` ve `sampleCategories` ile filmlerin neden diziye gittiği görünecek → bir sonraki sürümde sınıflama düzeltilecek.

## Bekleyen (onay/sıra)
A (ekleme-anında kullanıcı adı), B (Xtream combo özel paralellik), C (M3U linki üret+kopyala+görüntü testi), D (arka plan servisi), filmler sınıflama DÜZELTMESİ (V telemetrisinden sonra), release imza, GPT G07-G10.
