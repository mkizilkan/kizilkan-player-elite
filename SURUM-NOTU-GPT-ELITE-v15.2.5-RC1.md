# KIZILKAN PLAYER ELITE v15.2.5-RC1
## Cast + Chunked Native Import Hardening

Bu revizyon v15.2.4-RC1 Native Core Phase 2 kapsamını KORUR ve son audit'te kanıtlanan iki riski kapatır.

### 1. Chunked Native Playlist Import
Android Native Core mevcutken compatibility `bigStore.write()` yolu artık 50-100 bin kaydı tek `JSON.stringify` ile JS thread'de bloklamaz. Kataloglar 500 kayıtlık chunk'lar halinde native staging'e akar. Room canonical store yalnız final native transaction başarıyla tamamlanınca değişir. Yarım staging mevcut sağlam Room snapshot'ını bozmaz.

### 2. Chromecast Authority / Rebind / Handoff
- Existing Cast session remount'ta yeniden load edilmez.
- Cast bağlıyken kanal/source değişimi TV'ye aktarılır.
- Remote status telefon UI için authoritative olur.
- VOD Cast->telefon dönüşünde remote son position local player'a seek edilir.
- Live DVR seek `liveSeekableRange` capability'sine bağlanır.
- Player exit remote media stop eder, session zorla sonlandırılmaz.
- Receiver volume/status telefona geri senkronlanır.

### Korunan v15.2.4 özellikleri
Room canonical playlist store, Native EPG Core, Search/Favorites/VOD/Series paging, Unified Discovery, 5 tarama profili, sunucu kodu + DNS self-heal, Native Player Session Arbiter Phase 1, RAM/storage/APK telemetry ve mevcut Media3 -> MPV 1.0 -> VLC zinciri korunur.

### Dürüst sınır
MAG/Stalker protokol katmanı tamamen native foreground core'a taşınmış değildir. Bu sürüm MAG persistence tarafında chunked/native Room hardening yapar. GitHub Actions gerçek KSP/Kotlin/Gradle build'i henüz bu paketin üretildiği ortamda çalıştırılmamıştır.
