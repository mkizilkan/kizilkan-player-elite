# REGRESYON DENETİMİ — v15.2.23 RC2

## Korunan zincir
v15.2.14 Stalker/Backup → v15.2.15 Series TS → v15.2.16 diagnostics/session → v15.2.17 scan transport → v15.2.18 state/blackbox → v15.2.19 corrective → v15.2.20 Flight Recorder/playlist semantic → v15.2.21 Media3 semantic → v15.2.22 FR V4/MAG → v15.2.23 FR V5/MAG → **v15.2.23 RC2 complete corrective**.

## Yeni hard-gate
`tools/check-v15223-complete-corrective.js` şu P0 sözleşmelerini zorunlu tutar:
- gesture JS-thread authority ve eski `runOnJS(toggleControls)`/worklet Dimensions yolunun yokluğu,
- Media3 fatal fallback + VLC video-output timeout/terminal recovery,
- Room commit'in React publish'den önce olması + switch index recovery,
- Flight Recorder batched JS persistence/native primary read,
- PanelScan snapshot/diagnostic reset + UI state reset.

## Gerçek sonuç
`tools/denetle.js` içinde 22 kapının tamamı temiz geçti. Bu sonuç JS/TS kaynak hard-gate seviyesidir; Android build ve cihaz runtime acceptance değildir.

## Büyük katalog / event-loop regresyon kapısı
- `frontend/src/utils/iptv.ts`: `catalogYield()` ve Xtream Live/VOD/Series döngülerindeki cooperative yield zorunludur.
- `frontend/src/utils/stalker.ts`: `stalkerCatalogYield()` ve MAG katalog/pagination normalizasyonundaki cooperative yield zorunludur.
- `tools/check-v15223-complete-corrective.js` bu iki helper ve kullanımını doğrular; her iki kaynak da TypeScript transpile kontrolüne dahildir.
