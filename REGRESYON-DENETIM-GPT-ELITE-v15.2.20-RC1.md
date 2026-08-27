# REGRESYON DENETİMİ — v15.2.20 RC1

| Alan | Koruma | Sonuç |
|---|---|---|
| Player Core v15 | Eski Media3/MPV/VLC hard-gate | PASS |
| Stalker/Backup v15.2.14 | Fixture | PASS |
| Stalker TS contract v15.2.15 | TypeScript contract | PASS |
| Diagnostics/MAG cache v15.2.16 | İleri uyumlu V1/V2/V3 gate | PASS |
| Scan transport v15.2.17 | Staging/Binder/crash contract | PASS |
| State consistency v15.2.18 | Playlist/seek/binder contract | PASS |
| Corrective v15.2.19 | Rolling version/state contract | PASS |
| Flight Recorder v15.2.20 | Native DB/crash/ANR/privacy/export/lifecycle contract | PASS |
| Playlist TS2322 | Exact Promise<void> semantic compiler contract | PASS |
| TS/TSX syntax | 109 dosya transpile | 0 diagnostic |
| Signing materyali | Paket taraması yapılacak | ZIP oluşturma aşamasında ayrıca doğrulanacak |

## Gerçek cihazda kabul testi
- Playlist A→B hızlı değişim x20; eski içerik görünmemeli.
- Çoklu hesap tarama ve import; background→foreground x10; siyah kilit ekran olmamalı.
- Live→VOD→Series geçişleri; eski frame sızması ve spinner state'i gözlenmeli.
- Seek x30; oynayan görüntü üstünde spinner kalmamalı.
- Başarısız live source; kontroller erişilebilir olmalı ve Flight Recorder terminal olayı göstermeli.
- Bilinçli test exception/ANR üretimi release cihazda yapılmamalı; debug/dev build üzerinde ayrı kontrollü test önerilir.
