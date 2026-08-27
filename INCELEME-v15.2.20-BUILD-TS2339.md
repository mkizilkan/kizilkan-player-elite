# v15.2.20 CI TS2339 Kök Neden İncelemesi

## Kanıtlanan hata
GitHub Actions `npx tsc --noEmit` adımında `frontend/src/player/PlayerHost.tsx` içindeki `MEDIA3_ERROR` tanılama kaydı `v2Profile.decoder` alanına doğrudan erişti. `EngineProfile` ayrık birleşiminde `media3` varyantı `{ engine: "media3"; surface: PlaybackSurface }` biçimindedir ve `decoder` alanı yoktur. TypeScript bu nedenle TS2339 üretti.

## Kök neden
Flight Recorder V3'e eklenen Media3 hata telemetrisi ortak engine profilini kaydederken VLC/MPV'ye özgü `decoder` alanını engine ayrımı yapmadan okudu. Önceki v15.2.20 özel semantik gate yalnız `PlaylistContext` Promise<void> sözleşmesini derlediği için bu ikinci TypeScript sınıfını kapsamadı.

## v15.2.21 düzeltmesi
- `decoder` yalnız `engine !== "media3"` dalında okunur.
- Media3 için kaybolan profil bilgisini korumak üzere `surface` alanı kaydedilir.
- `tools/check-v15221-typescript-media3.js` gerçek `EngineProfile` union'ını minimal TypeScript programında semantik olarak derler ve doğrudan `v2Profile.decoder` regresyonunu yasaklar.
- v15.2.20 Flight Recorder gate'i sonraki sürümlerde de davranış sözleşmesini koruyacak biçimde sürüm-tutarlılık kontrolüne çevrildi.
- Yeni gate `tools/denetle.js` ana zincirine eklendi.

## Doğrulama sınırı
Bu paket ortamında proje `node_modules` dizini bulunmadığı için tam proje `npx tsc --noEmit`, Expo prebuild ve Android Gradle/APK derlemesi çalıştırılmadı. Bunların nihai doğrulaması verify branch üzerinde GitHub Actions ile yapılmalıdır.
