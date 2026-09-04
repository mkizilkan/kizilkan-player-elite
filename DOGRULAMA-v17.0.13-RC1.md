# KIZILKAN PLAYER ELITE v17.0.13 RC1 — DOĞRULAMA

## Kaynak-seviyesi doğrulamalar
- `node tools/check-v17009-kotlin-roundrobin-resume.js` — PASS
- `node tools/check-v17010-mpv-multiscan-battery.js` — PASS
- `node tools/check-v17011-buildgate-multiscan-ui.js` — PASS
- `node tools/check-v17012-gradle-mpv-taskgraph.js` — PASS (v17.0.13 forward-semver)
- `node tools/check-v17013-multiscan-mpv-export.js` — PASS
- `node tools/checkplayercore.js` — PASS
- Değiştirilen JS gate dosyaları `node --check` ile temiz.
- Değiştirilen TS/TSX dosyalarında TypeScript parser/syntax taraması temiz; çalışma paketinde `frontend/node_modules` olmadığı için tam tsconfig/Expo type-resolution bu ortamda çalıştırılamadı.
- `KizilkanMpvView.kt` Kotlin parser/syntax taramasında yeni syntax hatası görülmedi; Android/Expo/libmpv classpath bu ortamda bulunmadığından gerçek Android Kotlin compile burada çalıştırılmadı.

## Kapsam kanıtları
- Multi Account büyük dosyası seçim anında bir kez parse edilir; parse sonucu state'te yeniden kullanılır.
- Ham büyük dosya metni React state'te tutulmaz.
- Multi Account `SectionList` için `removeClippedSubviews={false}`; cihazdaki `ReactViewGroup.updateClippingToRect` / `Invalid clipping state` crash hattına dar müdahaledir.
- CSV/TXT/JSON, `kullanıcı:şifre`, manuel satırlar, DNS/panel/kod otomatik arama, seçim, Durdur/Duraklat ve ekleme akışları korunur.
- MPV parent siyah arka planı korunurken child `SurfaceView` opak background kaldırıldı. `PixelFormat.OPAQUE`, normal Z-order, attach/detach ve v17.0.12 libc++ task-graph çözümü korunur.
- MPV surface validity/size/attachment/background telemetry eklendi.
- Flight Recorder rapor içeriği azaltılmadı; bağımsız events/native/database snapshot okumaları paralel hale getirildi ve export timing telemetry eklendi.

## Henüz kanıtlanmayanlar
- GitHub Actions Android release build bu dosya hazırlanırken çalıştırılmadı.
- Gerçek APK cihaz testi yapılmadı.
- MPV gerçek görüntü/first-frame kabulü cihazda doğrulanmadı.
- Büyük Multi Account dosyasında reset/stall giderildi sonucu gerçek cihaz testi gelmeden ilan edilmez.
