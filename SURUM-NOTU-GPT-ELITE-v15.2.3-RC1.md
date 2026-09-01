# KIZILKAN PLAYER ELITE v15.2.3-RC1 — Lifecycle / Unified Native Discovery / RAM / Atomic Import

## Amaç
Bu RC, v15.2.2 gerçek cihaz testlerinde kanıtlanan dört P0 sınıfını hedefler: kısa background geçişinde uygulamanın cold-start/profil seçimine düşmesi, çok playlist ile JS/RAM baskısı ve dokunma kilitlenmesi, karma çoklu hesap discovery yollarının JS worker'da kalması ve aynı Xtream hesabının tekrarlı dokunmalarla birden fazla kez eklenmesi. Ayrıca EPG'nin kanal listesini yavaşlatması ve başarılı playback sonrasında bayat fallback mesajının/URL geçişinin devam etmesi ele alınır.

## Değişiklikler
- `appSession.ts`: güvenli route + background timestamp kalıcılığı. Son 15 dakika içindeki activity/process recreation için son güvenli ekran restore edilir; uzun cold-startta profil/PIN akışı korunur.
- Root loader yönlendirme gecikmesi 1200 ms → 80 ms; splash sonrası minimum iş.
- `PlaylistContext.addPlaylist`: Android Native Core varken büyük channels/vod/series dizileri React state'te tutulmaz; heavy dosya yazılır, Room reindex yapılır, state metadata-only kalır.
- Playlist değişiminde aktif olmayan heavy listeler metadata-only forma sıkıştırılır; eski playlistlerin dev dizileri JS heap'te birikmez.
- `toMeta` mevcut `channelsCount/vodCount/seriesCount` değerlerini boş diziler yüzünden sıfırlamaz.
- Çoklu discovery: direct server, server code, panel name ve tamamen bilinmeyen hesapların tamamı per-account candidate set ile `PanelScan.startUnifiedScan()` foreground native service'e gider.
- Native scan/import snapshot'ları ekrana dönüşte tekrar bağlanır; pending credential/job eşlemesi yalnız cihaz SecureStore'da tutulur, snapshot'a parola yazılmaz.
- Xtream playlist kimliği deterministic hale getirildi; aynı server+username aynı playlist id üretir. Ayrıca in-flight account lock, UI gecikmesi sırasında aynı işlemin 2-3 kez kuyruğa girmesini engeller.
- EPG ilk görünür 16 kanal için `InteractionManager.runAfterInteractions` sonrasında küçük batch ile yüklenir; kanal listesi EPG'yi beklemez.
- Player: first-frame başarısından hemen sonra gelen bayat source/VLC error 1.8 sn penceresinde çalışan oturumu alternatif URL'ye sürükleyemez.

## Korunanlar
Media3 → MPV/FFmpeg → VLC, libmpv 1.0.0, Room 2.8.3, MAG/Stalker, M3U/Xtream, 5 scan profili, pause/resume/stop, profile/PIN, favorites, EPG, backup, TV remote, Cast ve önceki regresyon korumaları kaldırılmadı.

## Doğrulama durumu
Bu paket ortamında statik/syntax gate çalıştırılır. GitHub `tsc --noEmit`, Expo prebuild, KSP/Room Kotlin, unified PanelScan Kotlin ve release APK sonucu ayrıca kanıtlanmalıdır. Gerçek cihazda özellikle background restore, çok playlist RAM davranışı, 8+ hesap native discovery/import, tek hesabın tek kez eklenmesi ve EPG ilk görünme süresi ölçülmelidir.
