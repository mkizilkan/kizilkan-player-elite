# KIZILKAN PLAYER ELITE v15.1.0-RC1 — Sürüm Notu

## Sürüm kimliği

- Uygulama: `15.1.0`
- Android `versionCode`: `150100`
- iOS build metadata: `15.1.0`
- Player Engine: `1.0.0-RC`
- Native MPV: `dev.jdtech.mpv:libmpv:1.0.0`
- ZIP kökü: `gpt-kizilkan-player-elite/`

## Neden bu sürüm var?

v15.0.5 RC1 gerçek cihaz testlerinde 4K MPV ses-var-görüntü-yok, ZAP sonrası eski sesin kalması/yeni görüntünün gelmemesi, player/UI donması, Media3 ve MPV resume başarısızlığı, VLC VOD açılmaması, yavaş çoklu hesap taraması ve Settings telefon UI overlap sorunları görüldü. Bu sürüm bu semptomları tek bir kör patch ile gizlemek yerine player session izolasyonu, libmpv 1.0.0 migration, ölçülebilir diagnostics, Scan Engine v2 ve responsive Settings düzeni ile ele alır.

## Player Core / libmpv 1.0.0

- MPV dependency `0.5.1` → `1.0.0`.
- Upstream breaking multiple-instance API'ye geçildi.
- Her `KizilkanMpvView` kendi `MPVLib` instance'ına sahip.
- Native cleanup aynı instance üzerinde observer/surface/destroy sırasıyla yapılır.
- Session + recovery generation MPV React key'ine bağlandı; ZAP sonrası eski native view'in tekrar kullanılması engellenir.
- Native MPV diagnostics eklendi: surface create/attach/destroy/detach, file loaded, video reconfig, playback restart/end, codec/format/hwdec.
- `video-codec`, `video-params/format`, `hwdec-current` gözlenir.
- MPV doğrulanmış first-frame üretmezse önce **fresh software-decoding MPV instance** denenir; o da başarısızsa AUTO zinciri VLC’ye devam eder. Bu, 4K ses-var-görüntü-yok semptomuna karşı ölçülebilir HW→SW recovery’dir; cihaz testi geçmeden çözüldü sayılmaz.
- Mevcut software fallback, headers, buffer, tracks, A/V sync, speed ve seek özellikleri korunur.

## Resume / seek

- Eski tek 120 ms resume timer kaldırıldı.
- Resume motor bazlı uygulanır ve gerçek playback position ile doğrulanır.
- Kontrollü retry pencereleri kullanılır; gerçekleşmeyen resume başarı sayılmaz.
- RC1'deki MPV `seek absolute+keyframes` ve stall seek grace korunur.

## Scan Engine v2

Tüm sunucu/panel keşfi için 5 profil temeli:

- Çok Güvenli
- Güvenli
- Dengeli
- Hızlı
- Turbo

Çoklu hesap üst seviyesinde bounded account worker pool eklendi. Cooperative pause/cancel, canlı aday sonuçları, Pause/Resume/Stop ve native panel scan pause/resume desteği eklendi. Native worker limiti kontrollü şekilde genişletildi; sınırsız request/thread üretimi yapılmaz.

## Telefon Settings UI

- Sabit yüksekliğe sıkıştırılan buffer/settings kartı dinamik içerik kartına geçirildi.
- Genel link/card stilinde fixed height yerine minimum yükseklik + padding kullanılır.
- Playlist kartları içeriğe göre büyür.
- Amaç: “Canlı Yayın Tamponu / Tümünü Güncelle / Playlist kartları / buffer seçenekleri” overlap ve touch-target çakışmasını kaldırmak.

## Korunan v15.0.5 RC1 geliştirmeleri

- Çoklu hesap seçim/doğrulama akışı
- Panel/DNS progress
- `kullanici:sifre` hızlı yapıştırma
- Baştan/Devam resume seçimi
- seek grace
- MPV documented seek
- MAG/Stalker endpoint/header/cookie compatibility

## Bilinçli olarak çözülmüş sayılmayan alanlar

Bu ZIP yalnız kaynak değişikliği ve yerel gate ile hazırlanır. GitHub full build ve gerçek cihaz testi olmadan şunlar çözüldü ilan edilmez:

- 4K MPV görüntü
- ZAP sonrası eski ses/session cleanup
- VLC VOD
- Media3/MPV resume
- Android background scan
- Telefon UI'nin tüm ekran/font ölçeklerinde sonucu

Detaylı durum `AI-PROJE-DEVIR-BAGLAM.md` ve `REGRESYON-DENETIM-GPT-ELITE-v15.1.0-RC1.md` içindedir.
