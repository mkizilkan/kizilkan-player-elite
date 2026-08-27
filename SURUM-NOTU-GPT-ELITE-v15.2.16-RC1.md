# KIZILKAN PLAYER ELITE v15.2.16-RC1 — SÜRÜM NOTU

**Tarih:** 2026-08-25
**Sürüm:** 15.2.16
**Android versionCode:** 150216

## 1. KIZILKAN Tanılama / Flight Recorder
- Kalıcı, bounded (400 olay) JS tanılama ring-buffer eklendi.
- Sistem, player, scan, catalog, backup ve navigation domainleri destekleniyor.
- Paylaşılabilir `KIZILKAN_DIAGNOSTICS_V1` JSON raporu eklendi.
- Credential/token/PIN/MAC/username/device id/serial redaksiyonu ve URL host hash-mask uygulanır.

## 2. Player performans ve hata telemetrisi
- Kanal seçimi zamanı.
- Player session start / engine.
- MAG resolve süresi.
- İlk görüntü zamanı ve seçimden ilk görüntüye toplam süre.
- Media3 status/rebuffer, VLC/MPV buffering başlangıç-bitiş.
- Engine success/error geçmişi.

## 3. MAG oturum hızlandırma
- Portal+MAC+identity scoped bellek içi session cache.
- Cache TTL 15 dakika, en fazla 8 session.
- Kanal değişiminde geçerli token varsa tekrar handshake/get_profile yapılmaz.
- HTTP 401/403/auth/token reddinde cache temizlenir ve yalnız bir fresh login ile create_link tekrar denenir.

## 4. MAG profil uyumluluk ve görünür hata
- Mevcut MAG250 explicit profile isteği korunur.
- Yalnız profil reddedilir/geçersiz dönerse legacy-minimal ve sahada kullanılan derived identity varyantları kontrollü denenir.
- Derived identity için projede zaten bulunan Expo Crypto 15.0.9 (SDK 54 uyumlu) kullanılır.
- Her profile varyantı success/empty/error olarak telemetry'ye işlenir.
- MAG ekleme hatasında form gerçek hata alanına kaydırılır; spinner bitip sessizce düğmeye dönme yerine aşama mesajı görünür hale gelir.

## 5. Process / RAM / scan diagnostics
- Android ApplicationExitInfo geçmişinden 5 kayda kadar reason/status/timestamp/process/description/PSS/RSS/trace-available alınır.
- Sistem available/total RAM, threshold ve low-memory durumu eklenir.
- Native panel scan son 80 kritik olayı credential saklamadan kalıcı ring-buffer olarak tutar.
- Process exit ile iki dakika içindeki son scan olayı UI'da korele edilir.

## Dış doğrulama
- Android ApplicationExitInfo reason/PSS/RSS/timestamp/trace alanları Android resmi API'sinde mevcuttur.
- Expo SDK 54 Crypto ~15.0.9 `digestStringAsync` ile MD5/SHA-1/SHA-256 sağlar.
- Sahadaki açık Stalker/Ministra implementasyonları get_profile kimlik alanlarında farklılık ve token/session reuse + auth failure'da refresh davranışları göstermektedir. Bunlar resmi protokol standardı değil, uyumluluk karşılaştırması olarak kullanılmıştır.

## Bilinen sınır
Build ve cihaz başarısı statik kontrollerden türetilmez. GitHub Actions ve gerçek cihaz acceptance zorunludur.
