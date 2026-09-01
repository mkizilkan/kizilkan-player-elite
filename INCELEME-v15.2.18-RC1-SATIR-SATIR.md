# v15.2.18-RC1 SATIR-SATIR YENİDEN İNCELEME
Tarih: 2026-08-26
Taban karşılaştırma: v15.2.17-RC1 -> v15.2.18-RC1

## Sonuç
v15.2.18'de gerçek runtime kaynak değişikliği 3 ana dosyadaydı: PlayerHost.tsx, PlaylistContext.tsx, diagnostics.ts. Ayrıca sürüm metadata ve dokümanlar eklendi. GitHub Actions'ın ilk HARD gate'te durmasının nedeni üç eski gate'in sürüme/string'e hard-code edilmesi ve v15.2.18 gate'inin denetle.js zincirine hiç bağlanmamış olmasıydı.

## PlayerHost.tsx
1. `recordBlackBox` importu: doğru ve yan etkisiz.
2. AppState listener BLACKBOX_APP_STATE kaydı: amaç doğru; ancak useEffect([]) içinde `visible/channel/v2Phase/v2Profile` closure ile yakalandığı için v15.2.18'de eski değer kaydetme riski vardı. v15.2.19'da `playerTelemetryContextRef` ile düzeltildi.
3. `SEEK_REQUEST`: doğru; hedef saniye, motor, phase ve buffering kaydediliyor.
4. `SEEK_RELATIVE_REQUEST`: doğru; +/- seek talebi kaydediliyor.
5. spinner render guard: görüntü oynarken stale spinner'ı görsel olarak bastırıyordu; fakat `isBuffering=true` state'ini temizlemiyordu. Bu nedenle telemetry/state makinesi gerçekte hâlâ buffering sanabilirdi. v15.2.19'da aynı başarılı session gerçekten oynuyorsa `STALE_BUFFERING_CLEARED` ile state de temizleniyor.

## PlaylistContext.tsx
1. `recordDiagnostic` importu: doğru.
2. `setNativeSummary(null)`: yeni playlist seçilir seçilmez eski summary'nin kullanılmasını engelleyen doğru adım.
3. `getPlaylistSummary(id)`: hedef playlist summary'sini yeniden okuma doğru.
4. Eksik/risk: hızlı A->B seçiminde A'nın geç gelen async summary sonucu B ekranını ezebilirdi; generation guard yoktu.
5. Eksik/risk: active playlist disk yazımları üst üste binerse eski seçim daha geç tamamlanıp storage değerini bozabilirdi.
6. v15.2.19: `activeSwitchGeneration` + seri `activeSwitchWriteQueue` + stale result discard eklendi.

## Ana ekran index.tsx
v15.2.18 bu dosyayı değiştirmemişti. Bu nedenle PlaylistContext summary temizlense bile ekranda tutulan `nativeLiveItems`, `nativeLibraryItems`, kategori satırları, offset ve EPG state'i önceki playlistten kalabiliyordu. Bu, cihazda görülen "playlist değişti ama manuel yenilemeye kadar önceki içerik görünüyor" semptomunu açıklayan eksikti.

v15.2.19:
- `nativePageOwnerId` eklendi.
- eski owner'a ait item'lar yeni active playlist renderında kullanılmıyor.
- playlist id değişiminde page generation, offset, live/library item, kategori, total/hasMore, selected category, preview ve EPG state temizleniyor.
- `PLAYLIST_UI_INVALIDATED` olayı kaydediliyor.

## diagnostics.ts
1. V2 KEY + LEGACY_KEY: geriye dönük okuma doğru.
2. MAX_EVENTS 400 -> 1500: kapasite artışı doğru.
3. V1 key fallback: doğru.
4. clear sırasında V1+V2 temizliği: doğru.
5. `recordBlackBox`: olay isimlendirme yardımcı fonksiyonu; doğru.
6. Export formatı `KIZILKAN_BLACK_BOX_V2`: doğru.
7. Önemli eksik: v15.2.18 hâlâ AsyncStorage'daki tek JSON blob'u her eventte read/parse/rewrite ediyordu. Önceki açıklamalarda ima edilen native append-only/Room kara kutu v15.2.18 kodunda YOKTU.
8. v15.2.19: SDK54 File/FileHandle ile `Paths.document` altında bounded append-only JSONL journal eklendi. 8 MiB segment dolunca bir arşiv segmente rotate edilir. AsyncStorage ring hızlı UI için korunur; journal kalıcı ikinci kanıttır. Export kritik olay özetini ve journal boyut bilgisini taşır.
9. Sınır: bu hâlâ global native Room/ANR tombstone sistemi değildir. Native scan crash recorder v15.2.17'den korunur. Global native crash/ANR/player AnalyticsListener derinliği ayrı geliştirme gerektirir; yapılmış sayılmaz.

## Gate/Test altyapısı
### checkplayercore.js
- v15.2.18'de 15.2.17 ve 150217 sabit bekleniyordu: gerçek yanlış alarm.
- v15.2.19: package/app version consistency + versionCode türetimi + minimum sözleşme sürümü kontrolü.
- ayrıca repo kökü veya frontend içinden çalışabilir.

### check-v15216-diagnostics.js
- V1 string ve MAX_EVENTS=400 sabit arıyordu.
- v15.2.19: V1/V2 uyumluluğu ve kapasite >=400 davranış kontrolü.

### check-v15217-scan-transport.js
- 15.2.17/150217 sabit kilidi vardı.
- v15.2.19: current package/app tutarlılığına döndürüldü; scan transport sözleşmesi aynı kaldı.

### check-v15218-blackbox.js
- v15.2.18'de cwd bağımlıydı ve denetle.js'e bağlı değildi.
- v15.2.19: `__dirname` tabanlı, cwd bağımsız; gerçek TEMIZ/HATA final sonucu üretir; denetle zincirine bağlıdır.

### denetle.js
- v15.2.18 gate'i yoktu.
- v15.2.19: v15.2.18 ve v15.2.19 gate'leri bağlı; repo kökünden veya frontend'den çağrıldığında kendisi frontend cwd'ye geçer.

## Gerçek doğrulama
Node v22.16.0 ile ayrı ayrı çalıştırıldı:
- checkplayercore.js: EXIT 0
- check-v15214-hardening.js: EXIT 0
- check-v15215-typescript-contract.js: EXIT 0
- check-v15216-diagnostics.js: EXIT 0
- check-v15217-scan-transport.js: EXIT 0
- check-v15218-blackbox.js: EXIT 0
- check-v15219-corrective.js: EXIT 0
- denetle.js: EXIT 0
- tools/_ts ile 109 TS/TSX dosya transpile syntax kontrolü: 0 diagnostic

Tam `tsc --noEmit`, Expo prebuild, Kotlin/Gradle release ve gerçek cihaz testi bu ortamda node_modules/Android toolchain olmadığı için yapılmış sayılmaz.
