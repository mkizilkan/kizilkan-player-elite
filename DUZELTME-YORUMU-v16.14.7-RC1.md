# KIZILKAN PLAYER v16.14.7 RC1 — Düzeltme Yorumu

## Kök neden
GitHub Actions gerçek `tsc --noEmit` aşaması v16.14.6'da `frontend/app/add-playlist.tsx` içinde TS2454 üretti: ortak `let playlist: Playlist;` değişkeni yalnız M3U branch'lerinde atanıyordu. MAG branch'i terminal `return` yapsa da TypeScript ortak commit noktasında `playlist` için definite-assignment garantisi kuramıyordu.

## Düzeltme
- Ortak, atanmamış `playlist` değişkeni kaldırıldı.
- M3U URL branch'i `const m3uPlaylist: Playlist` oluşturup kendi branch'inde commit ediyor.
- M3U dosya branch'i `const filePlaylist: Playlist` oluşturup kendi branch'inde commit ediyor.
- Ortak davranış `commitLegacyParsedPlaylist(candidate)` helper'ında korunuyor: boş katalog reddi, commit, progress ve yönlendirme.
- `playlist!`, sahte varsayılan Playlist veya `as Playlist` ile compiler bypass kullanılmadı.
- MAG v16.14.5 verified-persist -> live-first -> async VOD/Series enrichment akışı korunuyor.
- v16.14.6 gate ileri sürüm uyumlu hale getirildi.
- Yeni `check-v16147-definite-assignment.js` TS2454/TS2367/TS2339 regresyonlarını ve MAG/M3U akış sözleşmesini koruyor.

## Sürüm
- app/package: 16.14.7
- Android versionCode: 161407
- iOS buildNumber: 16.14.7
