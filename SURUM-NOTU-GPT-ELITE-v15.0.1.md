# KIZILKAN PLAYER ELITE v15.0.1 — BUILD FIX

## Amaç
v15.0.0 GitHub Actions derlemesi TypeScript `tsc --noEmit` HARD gate aşamasında durduğu için APK üretilememişti. v15.0.1, v15 Playback Core mimarisini ve v14.x özelliklerini çıkarmadan gerçek semantik TypeScript hata kümesini düzeltir.

## Düzeltmeler
- `settings.tsx`: React Native'de geçersiz CSS `order` kaldırıldı; +18 anahtarındaki knob/text görsel sırası gerçek JSX child sırası ile korundu.
- `profile-select.tsx`: eksik `haptic` gerçek proje utility'sinden bağlandı.
- `profile-setup.tsx`, `welcome.tsx`, `CategoryPanel.tsx`: tanımsız `ThemePalette.background` yerine mevcut tema sözleşmesindeki `surface` kullanıldı.
- `tv-home.tsx`: var olmayan `Playlist.channelCount` yerine yüklenmiş `channels.length` kullanıldı.
- `ChannelActionSheet.tsx`: var olmayan `RADIUS.xl` kaldırıldı; önceki fiili fallback değeriyle aynı olan `RADIUS.lg` kullanıldı.
- `PlayerHost.tsx`: `recordTarget` gerçek `SheetType` union'ına eklendi.
- `src/types/index.ts`: duplicate `added` / `release_date` alanları tekilleştirildi. M3U'da doğal olarak bulunmayan `stream_id` / `series_id` için `null` modelde açıkça desteklendi.
- `quickActions.ts`: nullable `initial.params` değeri async callback öncesinde immutable `initialHref` değişkenine alındı.
- MPV native wrapper: `requireNativeViewManager` React Native yerine Expo'nun resmi `expo-modules-core` API'sinden alındı; `expo-modules-core@3.0.30` doğrudan bağımlılık olarak eklendi.
- VLC capability: bileşen truthiness kontrolü yerine platforma ait `VLC_AVAILABLE` capability flag kullanıldı; PlayerHost'taki TS2774 koşulları kaldırıldı.
- Legacy `SmartVideoPlayer`: eski VLC prop sözleşmesi güncel `VlcPlayerView` sözleşmesine uyarlandı; URI, UA/Referer, rate, first-play ve time callback'leri normalize edildi.
- Player Core hard gate v15.0.1 sürüm/versionCode değerlerine yükseltildi.

## Korunan v15 sözleşmeleri
Media3 -> MPV/FFmpeg -> VLC AUTO zinciri, first-frame doğrulaması, non-destructive VLC health, runtime stall recovery, alternatif Xtream URL zinciri, buffer profilleri, stabil MPV native view key'i, off-screen hidden surface policy, Android 14 attachment lifecycle, opaque SurfaceView, çoklu hesap/DNS/self-heal ve v14.x regresyon sözleşmeleri korunmuştur.

## Doğrulama durumu
- `node ../tools/denetle.js`: TÜM DENETİMLER TEMİZ.
- Yerel `tsc --noEmit`: bu çalışma ortamında proje `node_modules` bağımlılıkları bulunmadığı ve ağdan Yarn/registry erişimi kapalı olduğu için gerçek Expo SDK type graph ile tamamlanamadı. Bu nedenle v15.0.1 henüz “final başarılı build” olarak işaretlenmemiştir.
- Zorunlu sonraki kapı: temiz GitHub çalışma ağacında `npx tsc --noEmit = 0`, ardından Expo prebuild/native autolink, Kotlin/libmpv ve Gradle APK build.
