# AI DEVİR — v18.7.22 RC1 (dal `v18.7.22-rc1-vod-series-classification`)

**Tarih:** 2026-10-06 · **Taban:** v18.7.21 · **Yazan:** Claude Opus
**Kaynak:** Cihaz logu (18.7.21-dev) `STALKER_VOD_PARTITION` telemetrisi (v18.7.20'de eklenmişti).

## KÖK NEDEN (kanıtlandı)
panel-a'da tüm filmler kayboluyordu (`vod=0`, hepsi diziye). `STALKER_VOD_PARTITION`:
`bySeriesArray=2814/2814` ve `868/868` — yani `rowLooksSeries`'teki `Array.isArray(v.series)` TÜM
VOD öğesinde tetikleniyordu. Portal (panel-a) FİLMLERE de BOŞ `series: []` koyuyor. Örnek kategoriler
filmleri kanıtlıyor: "VOD | EN - LATEST MOVIES", "COMEDY", "SCIENCE FICTION", "TR ✦ SİNEVİZYON", "NETFLIX".

## Düzeltme (tek satır, kanıta dayalı)
`rowLooksSeries`: `Array.isArray(v?.series)` → `(Array.isArray(v?.series) && v.series.length > 0)`.
Boş `series: []` artık dizi sayılmaz → boş olanlar FİLM; dolu season dizisi veya "Dizi"/"Series" kategorisi
veya is_series bayrağı olanlar DİZİ. `stalker.ts`.

## Doğrulama (PC)
- tsc temiz · denetle TEMİZ · `check-v18722` PASS. Eski `check-v15214` (seriesFromVod fixture) bozulmadı. Native değişiklik YOK.

## Cihazda test
panel-a'u yenile → Filmler bölümü dolmalı (`STALKER_VOD_PARTITION` artık `asVod>0`, `bySeriesArray` yalnız dolu dizilerde).

## Bekleyen
Ekleme-anında kullanıcı adı "eklenmiyor" (kullanıcı ekran görüntüsü gönderecek — v18.7.21 A); release imza; GPT G07-G10.
