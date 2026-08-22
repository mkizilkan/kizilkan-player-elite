# KIZILKAN PLAYER ELITE — DEVİR NOTU (GÜNCEL)

> **Güncel sürüm: v15.0.4**
> Bu dosya kısa giriş noktasıdır. Yeni sohbette / yeni yapay zekâda **önce `AI-PROJE-DEVIR-BAGLAM.md` dosyasını tamamen oku.** O dosya ayrıntılı mimariyi, gerçek build tarihçesini, sorun/kök neden/çözüm zincirini, kalan işleri ve çalışma sözleşmesini taşır.

## Zorunlu okuma sırası
1. `AI-PROJE-DEVIR-BAGLAM.md`
2. `SURUM-NOTU-GPT-ELITE-v15.0.4.md`
3. `REGRESYON-DENETIM-GPT-ELITE-v15.0.5-RC1.md`
4. `SURUM-NOTU-GPT-ELITE-v15.0.3.md` (MPV 0.5.1 Kotlin API fix geçmişi)
5. `SURUM-NOTU-GPT-ELITE-v15.0.0.md` (v15 Playback Core ana mimarisi)

## Güncel durum
- Temiz repo: `mkizilkan/kizilkan-player-elite`
- Telefon klasörü: `/sdcard/Download/gpt-kizilkan-player-elite`
- Package: `com.gpt.kizilkan.player`
- Playback: **Media3 → MPV/FFmpeg → VLC**
- libmpv: `dev.jdtech.mpv:libmpv:0.5.1`
- v15.0.3: APK Gradle tarafından gerçekten üretildi; MPV Kotlin compile geçti.
- v15.0.3 son failure: eski hard-coded certificate SHA gate.
- v15.0.4: fingerprint doğrulamasını `ANDROID_CERT_SHA256` GitHub Secret'a taşıyor.
- Sonraki büyük plan: v15.0.4 build + cihaz testi sonrası ayrı onayla libmpv 1.0.0 instance API migration.

## Devir sözleşmesi
Her ZIP güncel `AI-PROJE-DEVIR-BAGLAM.md` içermek zorundadır. Yeni sürümde yapılan/kalan işler bu belgeye işlenmeden paket tamamlanmış sayılmaz. Gizli signing değerleri hiçbir Markdown dosyasına yazılmaz.


## Yeni teşhis/çözüm kuralı
- Körü körüne patch/fallback yapılmaz; önce kök neden kanıtlanır.
- Yerel kod ve loglar yeterli değilse resmi dokümantasyon, upstream GitHub issue/commit/release notları ve güvenilir implementasyonlar internetten araştırılır.
- Dış çözüm mevcut sürüm/API ile eşleştirilmeden uygulanmaz; değişiklik cerrahi ve dar tutulur, ardından regresyon testi yapılır.
