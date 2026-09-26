# CLAUDE.md — KIZILKAN PLAYER ELITE

Bu dosyayı her oturumun başında oku. Burada yazanlar, bu projede aylar süren
çalışmada öğrenilmiş kurallardır; "daha iyi bir fikrin" olsa bile önce kullanıcıya sor.

---

## 1. Proje ve kullanıcı

- **Uygulama:** Android TV box (Homatics 4K+), telefon ve tablet için IPTV oynatıcısı.
  Kaynaklar: M3U, Xtream, MAG/Stalker. Canlı, film, dizi, EPG, catch-up, timeshift.
- **Kullanıcı:** Mustafa. Tek geliştirici ve tek test eden kişi; gerçek cihazda test eder.
  **İletişim dili: Türkçe.** Sade ve anlaşılır anlat; teknik terimi ilk geçtiği yerde açıkla.
- **Depo:** `github.com/mkizilkan/kizilkan-player-elite` · PC'de `C:\Projeler\kizilkan-player-elite`
- **Teknoloji:** React Native (react-native-tvos) + Expo SDK 54 + TypeScript (strict) + Kotlin native modüller.

## 2. Çalışma sözleşmesi (kullanıcının 11 maddesi — harfiyen uy)

1. Kodda gerileme, çıkarma, azaltma, özetleme YOK. Her sürüm bir öncekinden gelişmiş olur.
2. Simülasyon / "yapıyormuş gibi" / sahte iş YOK. Kullanıcıyı yanıltma.
3. Kod çalışır durumda olur; her seçenek en güçlü hâliyle çalışır.
4. Temel amaç ve mevcut özellikler korunur; kullanıcıya sormadan kaldırılmaz, azaltılmaz.
5. Kod vermeden önce 3 kez kontrol et; dosya adı ve sürümü MUTLAKA yükselt.
6. Yalan yok, tembellik yok, "token/oturum yetmez" bahanesi yok.
7. Acele yok, sıkıştırma yok.
8. **Geliştirme önce PLAN olarak maddelenip sunulur; kullanıcı ONAYLAYINCA kodlanır.**
9. İstenen şeyi yapmamak için bahane üretilmez.
10. Özellikler sınırları zorlayan, mükemmel kalitede planlanır ve kodlanır.
11. "İncele" denince gerçekten satır satır incele; eksikleri, geliştirilebilir yerleri,
    mevcut durumu ve yapılınca ne olacağını TABLO ile anlat.

**Ek kural — kör düzeltme yapma:** Kullanıcı bir sorun bildirdiğinde önce kanıtla
(log + kod). Kanıt yoksa bunu açıkça söyle; gerekiyorsa önce telemetri ekle, sonra düzelt.

## 3. Her değişiklikten sonra ZORUNLU doğrulama (PC'de)

```powershell
cd C:\Projeler\kizilkan-player-elite\frontend
yarn tsc --noEmit            # çıktı vermemeli (hata yok)
cd ..
node tools/denetle.js        # sonunda başarısız kapı olmamalı
```
- Kotlin değiştiyse ve Android SDK kuruluysa derleme kontrolü:
  `cd frontend; npx expo prebuild --platform android --clean --no-install; cd android; .\gradlew.bat assembleDebug`
- **Debug APK'yı telefona KURMA** (bkz. §7 imza uyarısı). Yalnız derleme doğrulaması içindir.
- Doğrulama geçmeden commit/push yapma. Geçtiyse kullanıcıya sonucu özetle.

## 4. Sürüm ve dal kuralları

**Beş sürüm alanı HER sürümde birlikte değişir:**
1. `frontend/app.json` → `expo.version`
2. `frontend/app.json` → `expo.ios.buildNumber`
3. `frontend/app.json` → `expo.android.versionCode` = major×10000 + minor×100 + patch (17.10.4 → 171004)
4. `frontend/app.json` → `expo.extra.kizilkanReleaseLabel` = `"GPT ELITE v<sürüm> RC1"`
5. `frontend/package.json` → `version`

- **Etiket soneki DAİMA `RC1`.** `RC2/RC3` yazmak ~12 denetim kapısını kırar (regex `... RC1$`).
  Yeni deneme = yeni patch sürümü (17.10.4 → 17.10.5).
- **Dal:** her sürüm, bir önceki sürümün dalından yeni bir dal: `v17.10.5-rc1-<kisa-konu>`.
  Push → GitHub Actions → "GPT KIZILKAN APK Derle" → dal seç → tip `release`.
- Denetim kapılarına **sabit sürüm yazma** (`=== '17.10.2'` gibi). İleri uyumlu yaz (`>=` + formül).

## 5. Değiştirilmez mimari kararlar

- **Kalıcı oynatıcı (YOL B):** `src/player/PlayerHost.tsx` kalıcı bir katmandır, `app/_layout.tsx`
  içinde Stack'in DIŞINDA yaşar. Mimarisini değiştirme.
- **Room kanonik depodur.** Native Core modunda `playlist.channels/vod/series` bellekte **BOŞ
  dizidir**; içerik Room'dadır. Okuma: `KizilkanNativeCore.getItem / queryItems / getCategories`.
  Bunu unutmak şu hataları üretti: fark raporu "önce=0", boş catch-up, boş EPG.
- **MAG live-first:** Canlı hemen; film/dizi arka planda (stalkerEnrichment). `liveOnly:false` ile
  ekleme akışına 100 bin film sokmak donmaya yol açar.
- **Meta yazma güvenliği:** meta yazmaları `runExclusive` ile sıralanır; `persistMeta` silme
  korumalıdır (`allowRemoval` yoksa kaybolan liste geri eklenir).
- **Native'e büyük veri:** `syncPlaylistKindsJson` kind başına ayrı çağrılır (OOM önlemi,
  `modules/kizilkan-native-core/index.ts`). Sonuçlar birleştirilir (diff + fingerprint).
  Panel tarama köprüsünde `sources` alanı gönderilmez (Binder ~1 MB sınırı).
- **Room şema sürümü asla düşürülmez;** migration eklenir.
- **Timeshift tek bağlantı:** kullanıcının hesaplarının çoğu "1 kullanıcı". Aynı kanala aynı anda
  iki upstream bağlantı açma (oynatıcı + kaydedici).

## 6. Önemli dosyalar

| Alan | Dosya |
|---|---|
| Oynatıcı (motor zinciri, timeshift, son kanal kaydı) | `frontend/src/player/PlayerHost.tsx` |
| Timeshift modu (Her zaman / Duraklatınca / Kapalı) | `frontend/src/player/timeshiftMode.ts` |
| Timeshift kaydedici (localhost HLS, TS segment) | `frontend/modules/kizilkan-native-core/android/.../LiveTimeshiftManager.kt` |
| Yedek DNS | `frontend/src/player/hostFailover.ts` |
| Motor deneme defteri | `frontend/src/player/v2/attemptLedger.ts` |
| Liste yönetimi, onarım, fark raporu | `frontend/src/store/PlaylistContext.tsx`, `src/utils/refreshDiff.ts` |
| Profil + oturum yetkisi (`authorizeProfileSession`, `profileEntrySeq`) | `frontend/src/store/ProfileContext.tsx` |
| Açılışta son kanal kapısı | `frontend/app/_layout.tsx` (`StartupLastChannelGate`) |
| Liste/hesap ekleme, combo tarama | `frontend/app/add-playlist.tsx` |
| Combo dosya ayrıştırma | `frontend/src/utils/bulkAccounts.ts` |
| Panel tarama servisi | `frontend/modules/panel-scan/android/.../PanelScanService.kt` |
| Room, senkron, fark | `frontend/modules/kizilkan-native-core/android/.../KizilkanNativeCoreModule.kt` |
| MAG/Stalker | `frontend/src/utils/stalker.ts` |
| M3U/Xtream, catch-up URL | `frontend/src/utils/iptv.ts` |
| Telemetri / uçuş kaydedici | `frontend/src/utils/diagnostics.ts` |
| Yerel medya ekranı / ortak durum | `frontend/app/local-media.tsx`, `frontend/src/utils/localMedia.ts` |
| Yerel medya native (SAF liste, kapak/süre) | `frontend/modules/kizilkan-native-core/android/.../LocalMediaLibrary.kt` |
| Denetim koşucusu (Windows uyumlu) | `tools/denetle.js` |

## 7. Bilinen tuzaklar (gerçek hatalardan öğrenildi)

- **"Yok" demeden önce koddan doğrula.** MPV, EPG, global arama, kullanıcı başına User-Agent,
  indirme yöneticisi… hepsine bir ara "yok" denildi; hepsi vardı. `grep` ile ara, dosyayı oku.
- **İmza / veri kaybı:** Telefondaki uygulama GitHub Secrets'taki release anahtarıyla imzalı.
  Farklı anahtarla derlenmiş APK üstüne kurulamaz; kaldırmak TÜM listeleri ve Room verisini siler.
- **`package.json`'a paket ekleme** kullanıcı onayı olmadan yapılmaz. CI `--frozen-lockfile` ile
  çalışır; eklenirse PC'de `yarn install` ile `yarn.lock` güncellenip ikisi birlikte commit edilmeli.
  Önce ihtiyacın kurulu bir pakette olup olmadığına bak (ör. keep-awake → `expo-video`).
- **Import kaynağını kontrol et:** yeniden dışa aktaran (barrel) modül sembolü export etmiyor
  olabilir (`serverCode.ts` → `validPanelHosts` TS2459 hatası).
- **Tema anahtarı uydurma:** `FONT.size.md` gibi olmayan anahtarlar CI'ı kırdı. Var olanı kullan.
- **Yorum içine `*/` yazma** (URL desenleri blok yorumu erken kapatır).
- **expo-router `usePathname()` grup klasörlerini atlar:** açılış ekranı ve ana sekme ikisi de `/`.
  Ayırt etmek için `useSegments()` kullan (`"(tabs)"`, `"tv-home"`).
- **Aynı işlevin iki kod yolu olabilir:** combo taramada küçük liste `runNativeBulkAccounts`,
  büyük dosya `startStreamingFileScanV172`. Birini düzeltince diğerini ara.
- **Effect bağımlılığında nesne kullanma** (içerik aynıyken kimlik değişir → effect tekrar çalışır;
  timeshift'te çift bağlantı açılmıştı). İçerikten türeyen anahtar kullan.
- **Denetim araçları çapraz platform kalmalı:** `denetle.js`'de kabuk jokeri (`*.tsx`) ve `find`
  kullanma; Node ile listele, `execFileSync` ile çalıştır.
- **OOM mesajlarını doğru oku:** `growth limit 402653184` = uygulamanın Java heap sınırı (~384 MB),
  cihaz RAM'i değil. `largeHeap` açık (`plugins/withLargeHeap.js`).
- **`expo prebuild` package.json'u değiştirir:** `android`/`ios` betiklerini `expo run:*` yapar.
  Derleme kontrolünden sonra `git diff frontend/package.json` ile bak, yalnız sürüm kalmalı.
- **JAVA_HOME eskiyebilir:** JDK güncellenince sistem değişkeni eski klasörü gösterebilir.
  Gradle için oturumda `$env:JAVA_HOME` ile kurulu JDK'yı ver; sistem ayarını değiştirme.
- **Sessiz çıkış bırakma:** her `return` noktası bir sebep ile telemetri yazmalı; yoksa sorun
  logdan teşhis edilemiyor.

## 8. Log (tanı dosyası) analizi

Kullanıcı `kizilkan-diagnostics-*.json` gönderir (Ayarlar → İstatistikler → Flight Recorder Raporunu Paylaş).
- `appVersion` → hangi sürüm test edildi (önce bunu kontrol et).
- `events` + `critical` → olaylar; `exportScope.spanMinutes` → kapsanan süre. Kullanıcının
  anlattığı an bu aralıkta mı, kontrol et.
- `processExitHistory` → kapanma sebebi (ör. WebView güncellemesi `installPackageLI` = uygulama hatası değil).
- `databaseHealth` → Room (`snapshotCount`, `mediaCount`, `pageCount`×4 KB ≈ boyut).
- Önemli olaylar: `LIVE_TIMESHIFT_PREPARE/READY/STOP/ARM_ON_PAUSE/PAUSED_START/RUNTIME_FALLBACK`,
  `STARTUP_LAST_CHANNEL_OPEN/SKIP(reason)`, `PLAYLIST_REFRESH_DIFF(diffSource)`,
  `PLAYLIST_SELF_REPAIR_*`, `ENGINE_ERROR(errorKind)`, `ANR_WATCHDOG_STALL(task, lagMs)`,
  `PLAYER_SOURCE_FAILOVER(_OK)`, `BULK_SCAN_PLAN`, `ORPHAN_SNAPSHOT_AUDIT`.

## 9. Mevcut durum (v18.1.0 RC1 — dal `v18.1.0-rc1-local-media`)

v18 = Claude Code ile çalışmanın başladığı sürüm. Ayrıntı: `AI-DEVIR-v18.0.0.md`, `AI-DEVIR-v18.1.0.md`.

Cihazda doğrulananlar (v17.10.4'e kadar): timeshift (duraklat/geri-ileri/canlıya dön),
açılışta son kanal (profil + liste başına), OOM düzeltmesi, boş kabuk onarımı, combo + doğrudan DNS.

v18.0.0'da kodlanan, **cihazda henüz test edilmeyen**: odak/konum geri yükleme (oynatıcı ve
detay dönüşü, ızgara satır düzeltmesi, kategori paneli/şerit ortalama), timeshift takılma
telemetrisi (`LIVE_TIMESHIFT_HEALTH`, `LIVE_TIMESHIFT_SESSION_SUMMARY`, `LIVE_SESSION_STALL_SUMMARY`,
zenginleştirilmiş `REBUFFER_*`), `FOCUS_RESTORE_*` olayları.

v18.1.0'da kodlanan, **cihazda henüz test edilmeyen**: yerel medya yenilemesi (native tek sorgu
listeleme, ses dosyaları, kapak/süre, filtre/sıralama/arama, kuyruk + otomatik geçiş, kaldığın yer,
ses modu ekranı, yalnız yerel müzikte arka planda çalma + bildirim).

**Açık konular (öncelik sırasıyla, hiçbiri onaysız kodlanmaz):**
1. **Timeshift "Her zaman" modunda takılma (KANITLANMADI).** v18.0.0 telemetrisi eklendi;
   kullanıcıdan "Her zaman" ve "Kapalı" ile aynı kanalda izleme logu bekleniyor. Şüpheler:
   segment süresi duvar saatiyle yazılıyor (PCR kayması), canlı uçta ≤2 sn tampon, 0,5 sn ilk segment.
2. Yerel medya v18.1.0 cihaz testi (AI-DEVIR-v18.1.0.md → Cihaz testi).
3. Media3 canlıda HTTP 401 alırken aynı adres MPV'de açılıyor (başlık/User-Agent farkı şüphesi).
4. MAG dizi kataloğu ana thread'i kilitliyor (`mag:catalog-series`, ANR).
5. Combo tarama sırasında ANR (`scan:panel-stream-v172`, 65 sn) — kök neden kanıtlanmadı.
6. `iptv.ts` `xtGet` 60 sn zaman aşımı büyük katalog onarımını yarıda kesiyor.
7. Room temizliği sonrası boş kabuk listeler (seçince onarım yapılıyor; toplu onarım yok).

## 10. Nasıl çalışalım

1. Kullanıcı isteğini anla → gerekiyorsa tek soru sor.
2. Koddan ve logdan kanıt topla → bulguları tablo ile sun.
3. Planı maddele → **onay bekle**.
4. Onaydan sonra yeni dal aç, kodla, §3 doğrulamasını çalıştır, sonuçları göster.
5. Kullanıcı isterse commit + push; Actions'ta hangi dalın derleneceğini söyle.
6. Değişikliği ve cihazda test edilecekleri kısa bir devir notuna yaz (`AI-DEVIR-v<sürüm>.md`)
   ve bu dosyanın §9'unu güncelle.
