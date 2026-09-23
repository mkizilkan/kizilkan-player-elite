# KIZILKAN PLAYER v17.9.10 RC1 — BOŞ KABUK KÖK ÇÖZÜM + CANLI AŞAMA GÖSTERİMİ

## Hedef
23.09.2026 cihaz kaydında `SEÇ` dokunuşu alındığı halde `pl-xt-43874e7c` için Room/legacy indeks bulunamadı; `PLAYLIST_SELF_REPAIR_START` sonrasında `refresh:xtream:Dolby` uzun süre açık kaldı. Kullanıcı bunu donma/tepkisizlik olarak görüyordu.

## Bu buildde yapılanlar
- Profil sonrası otomatik seçim ve uygulama içi `SEÇ` aynı verified `setActivePlaylist()` yolundan geçer. ActiveId aynı olsa bile Room doğrulaması atlanmaz.
- Primary/fallback boş-kabuk onarımları `repairMissingPlaylist()` altında tekleştirildi.
- Manuel yenileme ve otomatik recovery aynı `RefreshProgress` / `formatRefreshProgress()` sözleşmesini kullanır.
- Global `PlaylistRepairOverlay`, `_layout.tsx` seviyesinde tüm rotaların üstünde çalışır. Profil sonrası recovery dahil her tetikleme görünürdür.
- Kullanıcı DNS, hesap, katalog, cihaza kayıt ve Room doğrulama aşamalarını; ayrıca `Canlı ⏳ · Film ✅ · Dizi ⏳` benzeri gerçek katalog durumunu ve geçen süreyi görür.
- 15/30 saniyelik sessizlikte kullanıcıya sunucudan yanıt beklendiği / işlemin normalden uzun sürdüğü açıkça gösterilir.
- Xtream boş-kabuk recovery'sinde live→vod→series sırayla alınır. Her katalog gelir gelmez Room'a commit edilir; üç büyük katalog dizisinin aynı anda JS heap'te tutulması engellenir.
- VOD/Series geçici hata verirse canlı katalog kullanılabilir durumdaysa kısmi recovery korunabilir; hata türü telemetriye yazılır.
- `catalogRecovery` kalıcı bariyeri eklendi. Uygulama süreç ortasında kapanırsa yarım Room snapshot sonraki açılışta tam hazır sanılmaz.
- Same-target singleflight korunur. 30 saniyelik eski kör throttle yerine yalnız 2,5 saniyelik repair-storm güvenlik aralığı vardır.
- Yeni telemetry: `PLAYLIST_REPAIR_PROGRESS`, `PLAYLIST_REPAIR_KIND_COMMITTED`, `PLAYLIST_RECOVERY_BARRIER_HIT`, `PLAYLIST_SELF_REPAIR_PARTIAL/OK/ERROR`.

## Sürüm
- Expo: 17.9.10
- iOS buildNumber: 17.9.10
- Android versionCode: 170910
- Release label: GPT ELITE v17.9.10 RC1

## Bilinçli olarak korunmuş davranışlar
- Verified activation: Room doğrulanmadan aktif playlist yayınlanmaz.
- Same-target Promise singleflight.
- Native Core / Room canonical veri modeli.
- v17.9.9 per-kind native JSON/OOM koruması ve largeHeap.
- Manuel yenilemenin mevcut paralel katalog davranışı; yalnız boş-kabuk otomatik recovery bellek güvenliği için sıralıdır.
