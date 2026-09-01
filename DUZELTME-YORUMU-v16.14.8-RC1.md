# KIZILKAN PLAYER ELITE v16.14.8 RC1 — Düzeltme Yorumu

Bu sürüm v16.14.7 üzerine eklenmiştir; çalışan MAG/HKPREMIUM verified-persist, async catalog, gzip, Room incremental sync, source recovery, stale-frame ownership, backup ve playlist yönetim davranışları kaldırılmamıştır.

## Cihaz kanıtından doğrudan düzeltilenler

- MPV: cihaz kaydında APK içinde `libmpv.so` ve `libc++_shared.so` bulunmasına rağmen `dev.jdtech.mpv.MPVLib` `classLoaded:false` idi. v16.14.8 local Expo module dependency'sine ek olarak final app Gradle runtime classpath'ine `dev.jdtech.mpv:libmpv:1.0.0` ekleyen config plugin koyar, R8/ProGuard keep kuralları üretir ve final APK gate'ini DEX içindeki `MPVLib` descriptor'ını da zorunlu kılacak şekilde güçlendirir. Runtime status artık class-load hata sınıfını da kaydeder.
- Player RAM/hız hot-path: Android Native Core aktifken player açılır açılmaz tüm playlisti JS/Hermes'e `ensureHeavyLoaded()` ile hydrate eden kritik yol kaldırıldı. Kanal tek Room satırı olarak `getItemsByIds` ile alınır. Room satırı yoksa regresyon güvenliği için yalnız o hata durumunda legacy hydrate devreye girer.
- MAG kanal açılışı: Stalker `create_link` sonucu 8 saniyelik, 24 kayıtla sınırlı RAM cache'e alınır. Hızlı aynı-kanal dönüşünde tekrar resolver beklenmez. Force-fresh/session invalidation cache'i de temizler; 401/403/444/456/520 recovery davranışı korunur.
- Crash adli izi: player engine/profile + channel + session checkpoint Android process-state summary'ye yazılır.
- Stats: ekran yalnız son 120 eventten ilk-kare saydığı için export 18 örnek gösterirken UI 0 gösterebiliyordu. UI artık 5000 eventlik agregadan sayı üretir ancak yalnız son 120 eventi render eder. `Flight Recorder V7` ile `Native Journal Schema V6` etiketi ayrılmıştır.

## Özellikle yapılmayan iddialar

- Bu ortamda Android APK derlenmemiştir; dolayısıyla MPV'nin cihazda kesin çalıştığı iddia edilmez. Bunun yerine GitHub build sonrası final APK hard-gate hem native `.so` çiftini hem DEX içindeki `MPVLib` sınıfını doğrulayacaktır.
- Sunucu kaynaklı gecikmeler ortadan kaldırılamaz; yapılan değişiklik uygulamanın kendi hot-path gecikmesini ve gereksiz resolver/hydrate işini azaltır.
