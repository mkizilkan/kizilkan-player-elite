# KIZILKAN PLAYER ELITE v15.0.1 — REGRESYON / BUILD FIX DENETİMİ

## Statik hard gate
Çalıştırılan komut: `cd frontend && node ../tools/denetle.js`

Sonuç:
- Tanımsız hook/JSX sembolü: temiz
- Tanımsız fonksiyon çağrısı: temiz
- Context value: temiz
- Stale closure: temiz
- JSX prop değişkeni: temiz
- TDZ / kullanım-önce-tanım: temiz
- Hook kaynağı: temiz
- Eksik React Native importu: temiz
- Player Core v15 kritik regresyon kapısı: temiz
- TDZ checker self-test: temiz

## Player Core koruma maddeleri
Hard gate aşağıdaki v15 sözleşmelerini kontrol etmeye devam eder:
- PlaybackSessionGate / profile-generation izolasyonu
- Media3 `onFirstFrameRender`
- VLC non-destructive health ve spurious-error koruması
- runtime stall aynı-profile restart
- alternatif playbackCandidates URL zinciri
- HLS explicit content type
- Hızlı / Dengeli / Stabil buffer profilleri
- MPV native view + stabil key
- MPV clock stall monitor
- kullanıcı MPV motor seçimi
- hidden player için `translateX: -20000`
- opacity/zIndex ile SurfaceView gizleme regresyonunun yasaklanması
- MPV ref bridge metodları
- MPV time-pos progress, explicit destroy, opaque SurfaceView, normal Z-order
- Android 14 `SURFACE_LIFECYCLE_FOLLOWS_ATTACHMENT`
- temporary detach sırasında player destroy edilmemesi
- stale END_FILE hata koruması
- Expo `OnViewDestroys`
- `dev.jdtech.mpv:libmpv:0.5.1`

## Henüz doğrulanması gerekenler
GitHub Actions gerçek bağımlılık ortamında:
1. `npx tsc --noEmit` -> 0 hata
2. Expo prebuild
3. Expo Modules autolink içinde KizilkanMpv
4. Kotlin compile + `dev.jdtech.mpv:libmpv:0.5.1`
5. Gradle assemble
6. APK fiziksel çıktısı
7. Telefon playback testi
8. TV Box: mavi şerit / ekran boyanması / Surface lifecycle testi

APK oluşmadan v15.0.1 başarılı build kabul edilmez.
