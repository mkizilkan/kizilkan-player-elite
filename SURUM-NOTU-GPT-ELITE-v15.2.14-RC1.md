# KIZILKAN PLAYER ELITE v15.2.14-RC1 — SÜRÜM NOTU

**Tarih:** 2026-08-25
**Sürüm:** 15.2.14
**Android versionCode:** 150214
**Amaç:** v15.2.13 yeniden denetiminde bulunan iki kritik açığı kapatmak: MAG/Stalker katalog hatalarının sessiz boş listeye dönüşmesi ve Tam Yedek v3 geri yüklemesinin bütün dosya doğrulanmadan canlı Room verisine playlist bazında commit edebilmesi.

## 1. MAG / Stalker katalog bütünlüğü

- VOD ve Series katalog hataları artık `[]` fallback ile sessizce başarılı sayılmaz.
- Geçici HTTP/ağ hataları bounded retry sonrasında açık hata olarak üst katmana taşınır.
- HTTP 400/404/405/501 gibi endpoint desteklenmiyor sinyalleri transient arızadan ayrılır.
- `type=series` endpointi boş veya desteklenmiyor olsa dahi VOD satırlarındaki `is_series`, embedded `series[]`, kategori ve stream-type sinyalleri değerlendirilir.
- `is_series` hem string `"1"` hem sayı `1` gibi gerçek portal varyasyonlarıyla normalize edilir.
- p=0 / p=1 başlangıç varyasyonları korunur.
- VOD-backed Series sezon/bölüm çözümünde `movie_id -> season_id -> episode_id` akışı desteklenir; ayrı `type=series` akışı da korunur.
- `stalkerCatalog()` `vod`, `seriesNative`, `seriesFromVod` ve warning diagnostikleri üretir.

Bu çalışma gerçek dünyadaki Stalker/Ministra implementasyonlarıyla çapraz doğrulandı. İncelenen örnekler, bazı portalların ayrı `type=series`, bazılarının VOD `is_series=1`, bazılarının da VOD `movie_id/season_id/episode_id` sezon zinciri kullandığını gösteriyor.

## 2. Tam Yedek v3 — atomik restore

v15.2.13 streaming export büyük `JSON.stringify` sorununu ortadan kaldırmıştı; ancak yeniden denetimde restore tarafında bütün dosya doğrulanmadan her playlistin canlı Room ID'sine ayrı ayrı final commit edilebildiği bulundu.

v15.2.14'te:
- Tüm playlistler önce session'a özel `__kzb_stage_*` ID'lerinde Room'a indekslenir.
- Header, end kaydı, playlist başlangıç/bitiş dengesi, item sayaçları ve metadata playlist seti doğrulanmadan canlı playlist ID'lerine dokunulmaz.
- Bütün dosya doğrulandıktan sonra native Room transaction içinde mevcut canlı snapshot rollback alanına taşınır ve staging snapshot canlı ID'ye alınır.
- Restore metadata uygulaması başarısız olursa Room/EPG eski snapshot transaction ile geri alınır ve eski metadata exact-snapshot olarak yeniden uygulanır.
- Başarıdan sonra rollback alanı ayrı transaction ile finalize edilir.
- Snapshot'tan kaldırılmış playlistler aynı hedef setinde atomik olarak kaldırılır; başarıdan sonra olası legacy JSON temizliği yapılır.
- Media + EPG + playlist snapshot kimlikleri birlikte taşınır.

## 3. Exact metadata rollback

Yeni `restoreBackupMetadataExact()` backup'ın yönettiği metadata namespace'ini önce temizleyip sonra snapshot'ı uygular. Böylece restore sırasında yazılmış yeni profil/favori/recent/playlist metadata anahtarları hata sonrası yetim kalmaz. Ağır katalog Room swap'ı bu fonksiyon tarafından silinmez.

## 4. Yeni fonksiyonel HARD gate

`tools/check-v15214-hardening.js` gerçek TypeScript kaynaklarını transpile edip ağsız fixture'larla çalıştırır ve standart `tools/denetle.js` zincirine dahildir.

Fixture kapsamı:
- Stalker VOD içindeki `is_series` fallback.
- `type=series` endpointi explicit empty iken fallback.
- `type=series` 404/unsupported iken fallback.
- VOD transient HTTP 500 hatasının retry sonrası sessizce yutulmaması.
- Ministra VOD-series `movie_id -> season -> episode` akışı.
- Başarılı atomik backup restore.
- Metadata hatasında Room rollback.
- Eksik/bozuk backup dosyasının canlı Room'a swap edilmemesi.

## 5. Önceki özellikler korunur

v15.2.13 ve önceki sürümlerdeki scan control görünürlük düzeltmesi, MAG AccountInfoCard tip normalizasyonu, Xtream Live/VOD/Series partial-catalog barrier, M3U metadata-aware sınıflandırma, streaming backup export, Room canonical storage, selection-before-import, round-robin, DNS alias grouping ve profile session gate geri alınmadı.

## 6. Dış kaynak doğrulaması

- Expo SDK 54 FileSystem: `File`, `FileHandle`, `readBytes`, `writeBytes`, `close`, `move` API'leri mevcut; SDK 54 için önerilen expo-file-system sürümü ~19.0.24'tür.
  https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/
- AndroidX Room `runInTransaction`: body exception atmadan biterse transaction başarılı, exception halinde transaction başarısız/rollback olur; Room aynı anda en fazla bir transaction yürütür.
  https://developer.android.com/reference/androidx/room/RoomDatabase
- Stalker varyasyon örneği — ayrı Series endpointi + VOD `is_series`:
  https://github.com/DimitarCC/iptv-m3u-reader/blob/main/src/StalkerProvider.py
- Stalker varyasyon örneği — VOD `movie_id/season_id/episode_id` sezon akışı:
  https://github.com/Cyogenus/IPTV-MAC-STALKER-PLAYER-BY-MY-1/blob/main/stalker.py

## 7. Doğrulama sınırı

Yerel kaynak denetimleri ve deterministik fixture testleri temizdir. Ancak bu paket ortamında `frontend/node_modules` bulunmadığı için tam `npx tsc --noEmit` çalıştırılmış ve geçmiş sayılmaz. Expo prebuild, Android KSP/Kotlin/Gradle release build ve gerçek APK cihaz acceptance testleri de bu ortamda yapılmamıştır. Gerçek build kanıtı GitHub Actions, davranış kanıtı gerçek cihazdır.
