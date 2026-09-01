# KIZILKAN PLAYER v16.13.10 RC1 — Doğrulama

## Gerçek cihaz kaydından hedeflenen kök nedenler
- Playlist metadata mevcutken Room index/legacy heavy veri bulunmaması nedeniyle PLAYLIST_SWITCH_VERIFY_FAILED döngüsü.
- Aynı hedef listeye peş peşe dokunmanın generation artırıp çalışan self-repair'i stale hale getirmesi.
- Xtream Live çalışırken VOD/Series HTTP 404 nedeniyle tüm katalog commitinin iptal edilmesi.
- Uygulama içindeki playlist değiştirme akışının gelişmiş sıralama/yönetim ekranına girmemesi.
- MAG ekleme/runtime metninin eski MAG254 varsayılanını yansıtması; gerçek önceliğin MAG320 Exact olması.

## Uygulanan düzeltmeler
- Aynı playlist için in-flight switch coalescing: yeni dokunuş çalışan repair generation'ını iptal etmiyor.
- 30 sn self-repair throttle korunuyor; fırtına önleme genişletildi.
- Xtream: Live başarılı + VOD/Series gerçek HTTP 404 => unsupported capability; çalışan katalog Room'a commit edilir. 404 dışı hata => mevcut snapshot korunur.
- Native BulkPlaylistImportService aynı 404 politikasına getirildi.
- Uygulama içi switch butonu yönetim modunda playlist-select ekranını açıyor; auto-continue kapalı.
- Maksimum kullanıcı az→çok / çok→az sıralaması, pinned-first, sürükle-bırak özel sıra ve açık SEÇ/AKTİF aksiyonu korunuyor/görünür.
- MAG runtime fallback varsayımları MAG320'a çekildi; MAG254/MAG250 fallbackleri kaldırılmadı.
- Xtream playback provenance telemetry credential sızdırmadan korunuyor.

## Çalıştırılan doğrulamalar
- `tools/checkplayercore.js`: PASS, 3 tur regresyon setinde tekrar PASS.
- `check-v16135`, `v16136`, `v16137`, `v16138`, `v16139`, `v161310`: art arda 3 tur PASS.
- Tüm `tools/*.js`: `node --check` PASS.
- Değişen kritik TS/TSX dosyaları: TypeScript `transpileModule` syntax diagnostics = 0.
- ZIP bütünlük testi paketleme sonrası ayrıca yapılır.

## Açık ve dürüst sınır
Bu ortamda tam `node_modules` olmadığı için dependency-resolved `tsc --noEmit` çalıştırılamadı. Android generated app/Gradle release build de burada çalıştırılmadı. MPV cihaz kaydındaki `libc++_shared.so`/`libmpv.so` ABI runtime uyuşmazlığı bu pakette çözülmüş olarak işaretlenmemiştir; GitHub Android build/dependency/APK native-lib incelemesiyle ayrıca doğrulanmalıdır.
