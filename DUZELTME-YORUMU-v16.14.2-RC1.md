# KIZILKAN PLAYER ELITE — DÜZELTME YORUMU v16.14.2 RC1
Tarih: 2026-09-01
Taban: v16.14.1 RC1 Recovery Checkpoint
Son sağlam referans: v16.13.10 RC1 (SHA-256: 05cf032c3ff1aa9c5e5885584c596f3e180ffc2f7abd1b2d520d11ad0372a874)

## Amaç
v16.14.1 devir sözleşmesinde fiziksel recovery kaynak ağacında eksik olduğu doğrulanan 1–9 bloklarını, v16.13.10 özelliklerini çıkarmadan tamamlamak.

## Gerçek entegrasyonlar
1. MAG Capability Discovery
- `catalogCapabilities` ve `magCapabilities` gerçek Stalker katalog diagnostics/session/profile kanıtından türetiliyor.
- VOD/Series için UNSUPPORTED ile gerçek ERROR ayrıldı.
- Native/fetch transport ve güvenli endpoint/profile kanıtı playlist metadata'ya yazılabiliyor.

2. Incremental Sync V2
- Native `syncPlaylistKindsJson` eklendi.
- Live/VOD/Series snapshot'ları SHA-256 fingerprint ile karşılaştırılıyor.
- Değişmeyen kind skip ediliyor.
- Değişen kind'lar tek Room transaction içinde replace ediliyor.
- DAO row-count transaction içinde doğrulanıyor; mismatch rollback sebebi.
- Fingerprint metadata yalnız Room doğrulamalı commit dönüşünden sonra yayınlanıyor.
- Bu SERVER DELTA değildir; client snapshot diff'tir.

3. Playlist Activation P0
- Eski `Set<string>` coalescing kaldırıldı.
- `Map<string, Promise<void>>` gerçek same-target single-flight eklendi.
- Aynı playlist'e eşzamanlı çağrılar aynı gerçek Promise'i bekliyor.
- Mevcut generation stale-discard, Room verify, repair throttle ve serialized active-key write korunuyor.
- Startup'ta persisted active key doğrudan publish edilmiyor; Room doğrulamalı activation kapısından geçiyor.

4. Player stale-frame ownership
- Playlist/channel/session/candidate/engine bileşenlerinden render ownership token üretiliyor.
- Media3/VLC/MPV callback'leri stale owner ise reddediliyor.
- Engine fallback'te ownership token yeni engine ile güncelleniyor.
- Gecikmeli resume-seek timer'ları da ownership doğrulamasından geçiyor.

5. HTTP source recovery
- 404=not_found; 444/456=session_or_link_expired; 401/403=auth; 520=upstream sınıflandırması eklendi.
- Resolve edilmiş URL için SHA-256 fingerprint, creation time/age, origin ve candidate provenance tutuluyor.
- Stalker create_link kaynaklarında 401/403/444/456/520 için aynı stale URL'yi kör engine fallback'e taşımadan önce source/session yenileme isteniyor.
- Media3, VLC ve MPV hata yollarına bağlandı.
- Çıplak `444`, `456`, `520` gibi native hata metinleri de güvenli parser ile yakalanıyor.

6. MPV runtime doğrulama
- `dev.jdtech.mpv:libmpv:1.0.0` dependency korunuyor.
- Native runtime status API ile MPVLib class yüklenebilirliği ve supported ABI bilgisi raporlanıyor.
- `tools/check-mpv-packaging-v16142.js`, resolve edilmiş AAR veya release merged native libs üzerinde `libmpv.so`, arm64-v8a ve `libc++_shared.so` kanıtı arıyor.
- Dependency satırı tek başına başarı sayılmıyor.

7. Flight Recorder V7
- schemaVersion gerçekten 7 yapıldı.
- Correlation zinciri: playlistSelect → roomVerify → catalogRecovery → channelSelect → urlResolve → enginePrepare → httpResponse → fallback → firstFrame.
- Trace ID playlist ve player lifecycle boyunca aktarılıyor.
- Mevcut credential redaction korunuyor.

8. Startup/ANR
- Native/Room canonical activation güçlendirildi.
- Başlangıçta başarısız warm index durumunda otomatik dev legacy JS heavy hydrate yerine kontrollü repair sinyali kullanılıyor.
- Legacy heavy hydrate gerektiğinde süre/count stall telemetry üretiyor.
- Mevcut native ANR watchdog kaldırılmadı.

9. MAG Exact Wire V2
- Shared OkHttp client ile connection-pool reuse korunuyor.
- EventListener üzerinden bağlantı reuse ve yalnız IPv4/IPv6 aile bilgisi izleniyor; plaintext IP yok.
- Native request metadata, çalışan HKPREMIUM PCAP handshake şekliyle header/protocol/cookie/auth parity açısından karşılaştırılıyor.
- Bu kontrol raw TCP byte-order iddiası değildir.

## Regresyon koruması
v16.13.10 kaynak ZIP'i SHA-256 ile doğrulandı. v16.14.1 recovery'de v16.13.10'dan hiçbir dosyanın kaybolmadığı daha önce byte-diff ile doğrulandı. v16.14.2'de ayrıca `tools/check-v16142-regression-contract.js` ile v16.13.10 kritik fonksiyon sözleşmeleri yeniden doğrulanıyor.

## Doğrulama sınırı
Bu kaynak arşivinde `frontend/node_modules` ve generated `frontend/android` bulunmadığından dependency-resolved TypeScript build ve Android release/mergeReleaseNativeLibs bu ortamda tamamlanamadı. Bu nedenle cihaz HKPREMIUM/MPV sonucu veya APK runtime sonucu için "fixed" iddiası yapılmıyor. Kaynak hard-gate/statik denetimler temizdir; final build/device gate ayrıca çalıştırılmalıdır.
