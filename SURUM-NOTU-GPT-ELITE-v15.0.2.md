# KIZILKAN PLAYER ELITE v15.0.2 — CLEAN CI TYPE RESOLUTION BUILD FIX

## Amaç
Temiz `kizilkan-player-elite` reposundaki ilk v15.0.1 CI çalışmasının ortaya çıkardığı gerçek TypeScript platform-modül çözümleme hatalarını kapatır. v15 Playback Core mimarisi ve Media3 → MPV/FFmpeg → VLC zinciri korunur.

## Düzeltmeler
- `src/native/vlc.ts` suffix'siz TypeScript facade eklendi. Metro native/web varyantlarını kullanmaya devam eder; `tsc --noEmit` artık `@/src/native/vlc` importunu çözebilir.
- `src/native/cast.ts` suffix'siz TypeScript facade eklendi; native Google Cast paketi web/type-check zincirine zorla sokulmaz.
- VLC `onFirstPlay` callback'i için `VlcFirstPlayInfo` gerçek tipi tanımlandı ve legacy `SmartVideoPlayer` implicit-any hatası kaldırıldı.
- CI altyapısı `actions/setup-java@v5`, `actions/setup-node@v6` ve Node.js 22'ye yükseltildi.
- Uygulama sürümü 15.0.2 / Android versionCode 150002 / iOS build 15.0.2 olarak yükseltildi.

## Başarı koşulu
Bu paket ancak temiz GitHub CI üzerinde `denetle.js` ve `npx tsc --noEmit` 0 hata verdikten, ardından Expo prebuild/native/Gradle adımları geçtikten ve APK gerçekten üretildikten sonra başarılı build kabul edilir.
