# AI DEVİR — v17.10.3 RC1

**Taban:** GitHub `v17.10.2-rc1-final-timeshift` (telefonda uygulanan 3 TS düzeltmesi
+ favorites.tsx satır 409 `favorites:recent:` dahil). Patch: `17102-to-17103.patch`.

## Yapılanlar (kullanıcı onaylı)

1. **Canlı zaman kaydırma modu** — `src/player/timeshiftMode.ts` (yeni, küçük modül).
   Ayar: *Duraklatınca* (varsayılan) / *Her zaman* / *Kapalı* (Ayarlar → Açılış davranışı).
   - *Duraklatınca*: kanal DOĞRUDAN açılır (bekleme yok). Canlıda ilk duraklatmada
     `togglePlay` zaman kaydırmayı devreye alır → uygunluk değişir → motor trafiği
     kesilir (MPV/VLC kaldırılır, Media3 kaynağı açıkça `replace(null)`) → kaydedici
     başlar → tampon hazır olunca yerel yayın OYNATILMADAN yüklenir, başa sarılır,
     duraklatılmış bekler. Tek bağlantı ("1 kullanıcı" hesaplar).
   - *Her zaman*: eski davranış; ilk segment 2 sn yerine **0,5 sn** (LiveTimeshiftManager.kt
     `FIRST_TS_SEGMENT_MS`). 25.09 kaydında ilk segment 7,6 sn / READY 8,2 sn idi.
2. **Açılışta son kanal — her profil girişinde, o profilin kendi kanalı.**
   Kök neden: açılış ekranı (`app/index.tsx`) rotası `/`; expo-router `usePathname()`
   grup klasörlerini atladığı için ana sekme de `/` döner — kapı açılış ekranında
   tetikleniyordu; ayrıca hatırlanan profil "girilmiş" sayılıyordu.
   Çözüm: `ProfileContext.profileEntrySeq` (her `authorizeProfileSession`'da artar);
   kapı yalnız `sessionAuthorizedProfileId === aktif profil` iken ve `useSegments()[0]`
   `(tabs)`/`tv-home` iken, her giriş için en çok bir kez tetiklenir. Tek+PIN'siz
   profilin kapıyı atladığı `index.tsx` resume yolu ve Ayarlar'daki PIN'siz geçiş de
   artık yetkilendirme veriyor.
3. **Parçalı senkron sonuç birleştirme** (v17.9.9 hatası) — `index.ts`: her çağrının
   yalnız kendi kind'ı toplanır (diff, fingerprint, changed/skipped). 25.09 kaydında
   fark raporu canlı/film `0 → 0` gösteriyordu; parmak izi eski kalıp gereksiz yeniden
   yazım oluyordu.
4. **Çift kayıt bağlantısı** — timeshift effect'i `headers` NESNESİNE bağlıydı; içerik
   anahtarına (`liveTimeshiftHeadersKey`) çevrildi. `LIVE_TIMESHIFT_STOP` telemetrisi eklendi.
5. `tools/check-v17102-surgical-release.js`: sabit `=== '17.10.2'` kontrolü ileri uyumlu yapıldı.

## Yeni telemetri
`LIVE_TIMESHIFT_ARM_ON_PAUSE`, `LIVE_TIMESHIFT_PAUSED_START`, `LIVE_TIMESHIFT_STOP`,
`STARTUP_LAST_CHANNEL_OPEN` (artık `profileId`, `entrySeq` içerir).

## Doğrulama (sandbox)
denetle.js 88 ✓ (2 ortam kapısı node_modules ister) · betiğin 6 özel kapısı ✓ ·
karşılaştırmalı TS: gerçek yeni hata 0 · Kotlin denge ✓ (derlenmedi — CI/PC'de görülür).
**PC'de `yarn tsc --noEmit` ve `node tools/denetle.js` ile doğrulanmalı.**

## Cihazda doğrulanması gerekenler / bilinen sınırlar
- *Duraklatınca*: duraklatma ile kaydedicinin başlaması arasındaki birkaç saniye
  kaydedilmez; devam edince o kadar ileriden oynar. Duraklatma öncesine geri sarılamaz.
- MPV/VLC yerel kaynağa geçince ≤700 ms kendiliğinden başlayıp duraklatılabilir.
- Media3'te `currentTime = 0`'ın canlı pencerenin başı olduğu varsayıldı → cihazda doğrula
  (`SEEK_REQUEST target:0` ardından görüntü duraklatma anından mı?).
- *Her zaman*: 0,5 sn ilk segment sonrası çok kısa bir tamponlama görülebilir.

## Test matrisi
1. *Duraklatınca*: kanal anında açılıyor mu → duraklat → "Duraklatıldı · kayıt
   başlatılıyor" → hazır → devam → duraklatma anından mı oynuyor → geri/ileri → Canlıya dön.
2. *Her zaman*: açılış süresi (READY `elapsedMs`) 17.10.2'ye göre kısaldı mı.
3. Profil A (PIN) + son kanal açık: soğuk açılışta profil ekranı gelmeden kanal AÇILMAMALI;
   PIN sonrası A'nın kanalı açılmalı. A → B → A geçişinde her girişte kendi kanalı.
4. Liste yenile: `PLAYLIST_REFRESH_DIFF` canlı/film/dizi üçü de gerçek sayılar.
5. Kanal açılışında tek `LIVE_TIMESHIFT_PREPARE` (çift değil).
