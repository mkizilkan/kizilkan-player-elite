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
- **v18.2.0+: Debug APK ayrı pakettir** (`com.gpt.kizilkan.player.dev`, "KIZILKAN DEV", `plugins/withDevVariant.js`);
  asıl uygulamanın YANINA kurulur, veri ayrıdır → kurulabilir. Asıl paketin üstüne kurulacak APK yalnız
  aynı release anahtarıyla imzalı `assembleRelease` olabilir (`plugins/withLocalReleaseSigning.js`, anahtar
  bilgileri yalnız `%USERPROFILE%\.gradle\gradle.properties` içinde; depoya ASLA girmez).
- PC derlemesi için oturumda: `$env:ANDROID_HOME="C:\Android\Sdk"` ve JDK 17.0.20 (bkz. §7).
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
| Chromecast yayın köprüsü | `frontend/modules/kizilkan-native-core/android/.../CastBridgeServer.kt`, `src/components/CastButton.tsx` |
| Yedek DNS yöneticisi | `frontend/src/components/DnsManager.tsx` (+ `app/edit-playlist.tsx`, `src/utils/refreshPlaylist.ts`) |
| Dış altyazı | `frontend/src/utils/subtitles.ts` |
| Taramaya özel proxy (havuz, test motoru, rotasyon) | `frontend/modules/panel-scan/android/.../ScanProxyPool.kt`, `src/utils/scanProxy.ts`, `scanProxyParse.ts`, `app/scan-proxy.tsx` |
| Medya Merkezi (MediaStore, fotoğraf görüntüleyici) | `frontend/app/media-center.tsx`, `app/photo-viewer.tsx`, `src/utils/deviceMedia.ts`, `deviceMediaModel.ts` |
| Arka planda oynatma (Media3) tercihi | `frontend/src/player/backgroundPlayback.ts` |
| İndirme motoru (parçalı) / görünür klasör | `.../kizilkannativecore/DownloadEngine.kt`, `PublicStorage.kt`, `src/components/DownloadDialog.tsx`, `NativeDownloadsSection.tsx` |
| İzlendi / dizide son bölüm | `frontend/src/store/LibraryContext.tsx` (`watched`, `seriesLast`) |
| Simge üretimi (Türk Bayrağı oranı) | `tools/make-icons.py`; kısayol simgeleri `plugins/withShortcutIcons.js` |
| Hangi anahtar güncel | `tools/imza-bul.ps1` |
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
- **PC'de C++ bağlama hatası (`ld.lld: undefined symbol: operator new`, `std::__ndk1`):** Sebep,
  Android SDK yolundaki BOŞLUK (`C:\Users\KIZILKAN YOGA\...`). CMake/Ninja derleyiciyi 8.3 kısa adla
  (`CLANG_~1.EXE`) çağırıyor; bu adla bağlama başarısız, aynı komut `clang++.exe` ile başarılı (26.09.2026
  kanıtlandı). Proje kodu değil, PC ortamı sorunu. **ÇÖZÜLDÜ (26.09.2026):** `C:\Android\Sdk` junction →
  gerçek SDK; kullanıcı `ANDROID_HOME=C:\Android\Sdk`, `JAVA_HOME=...jdk-17.0.20.101-hotspot`. Sonrasında
  tam `assembleDebug` BUILD SUCCESSFUL (~31 dk ilk derleme). SDK yolu değişirse eski yolu hatırlayan
  `node_modules/*/android/.cxx` klasörleri silinmeli. "object file directory ... 250 characters" CMake
  uyarısı zararsız (derlemeyi durdurmaz).
- **Tanı raporu 80 olay (v18.5.0'a kadar):** `sanitizeValue` her diziyi 80'e kesiyordu; `exportScope.returned`
  ile dosyadaki olay sayısı farklıysa bu sebeptir. v18.5.0+ raporlarda `exportScope.exported` gerçek yazılan sayıdır.
- **Proxy açık + havuz boş:** v18.4.0'da tarama istek göndermeden "bulunamadı" sayıyordu. Proxy kodunda `select()==null`
  durumunu asla "sunucu yok" diye yorumlama.
- **ANR_WATCHDOG_STALL'ı ön/arka plan ayırmadan yorumlama:** v18.5.0 logunda 47 kaydın hepsi uygulama arka
  plandayken (zamanlayıcılar yavaşlar). APP_BACKGROUND/FOREGROUND aralıklarıyla eşleştir.
- **Android kısayol isteği:** ek veri (extra) Intent eşleştirmesine girmez; kısayol normal açılışla aynı eylemi kullanırsa
  açık uygulamaya iletilmez. Her kısayola ayrı eylem ver.
- **Sessiz çıkış bırakma:** her `return` noktası bir sebep ile telemetri yazmalı; yoksa sorun
  logdan teşhis edilemiyor.
- **Expo `Package.createReactActivityLifecycleListeners` Activity YAPICISINDA çalışır** (v18.7.0 açılış çöküşü,
  release + DEV her açılışta kapandı). Orada ve dinleyici yapıcısında `applicationContext`/kaynak/sistem servisi
  KULLANMA (bağlam henüz yok → NullPointerException). Bağlamı yalnız `onCreate`/`onNewIntent` geri çağrılarında al,
  try/catch ile sar. Kapı: `check-v18700-release.js`.
- **Derleme geçti ≠ çalışıyor.** `tsc` + denetim + `assembleDebug` açılış çöküşünü YAKALAMAZ. Native yaşam döngüsü/
  başlangıç koduna dokunan sürümü, kullanıcıya vermeden önce cihazda/emülatörde AÇ (adb install + logcat).

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

## 9. Mevcut durum (v18.7.1 RC1 — dal `v18.7.1-rc1-startup-crash`)

**v18.7.1 (bu sürüm):** v18.7.0 her açılışta çöküyordu (kısayol dinleyicisi Activity yapıcısında `applicationContext`
istiyordu). Düzeltme + kalıcı kapı + stalker.ts'in açılışta statik yüklenmesi kaldırıldı. Ayrıntı `AI-DEVIR-v18.7.1.md`.
**Veri uyarısı:** v18.7.0 kurulu cihazda uygulamayı KALDIRMA (veri silinir); v18.7.1 üstüne kurulur.
Cihazda doğrulandı (OnePlus 7 Pro, adb): açılış ve kısayolla soğuk açılış çalışıyor.
**SIRADAKİ İŞ (onaylı, v18.7.2): kısayolların asıl sorunu** — kodda İKİ kısayol sistemi var; eski `src/utils/quickActions.ts`
(`expo-quick-actions`, `icon=null`, `act=expo.modules.quickactions.SHORTCUT`) her açılışta bizimkinin üstüne yazıyor.
Plan ve kanıt: `AI-DEVIR-v18.7.1.md` "AÇIK — v18.7.2". Kısayol durumunu cihazda `adb shell dumpsys shortcut` ile doğrula.

v18 = Claude Code ile çalışmanın başladığı sürüm. Ayrıntı: `AI-DEVIR-v18.0.0.md` … `AI-DEVIR-v18.6.0.md`.

Cihazda doğrulananlar (v17.10.4'e kadar): timeshift (duraklat/geri-ileri/canlıya dön), açılışta son kanal
(profil + liste başına), OOM düzeltmesi, boş kabuk onarımı, combo + doğrudan DNS.

**Cihazda henüz test edilmeyenler:** v18.0.0 (odak/konum geri yükleme, timeshift telemetrisi), v18.1.0 (yerel
medya, ses, arka planda müzik), v18.2.0 (EPG sütunu/pencere, combo link/sıra, yedek DNS yöneticisi + yenileme
geçişi, Chromecast yayın köprüsü, dış altyazı, son izlenenler, YENİ rozeti, DEV uygulaması), v18.3.0 (taramaya özel
proxy: Ayarlar/tarama → "Tarama Proxy'si"; DEV APK'nın PC'siz açılması).

**v18.3.0:** Taramaya özel proxy (ilk sürüm) + PC'siz çalışan DEV APK. Cihazda: proxy çalıştı (21/400), yerel medya MAG aktifken 404 verdi.

**v18.4.0 (bu sürüm):** (1) Yerel medya MAG aktifken 404 — kök neden `PlayerHost` yalnız `activePlaylist.source`'a bakıyordu;
artık yerel dosya `playlistSource="local"` (kapı `check-v18400-local-source.js`). (2) Proxy test motoru (tür bazlı indirme, canlı
doğrulanmış katalog, duraklat/devam/yeter, rotasyonlu tekrar, havuz tükenince tarama DURAKLAR). (3) Medya Merkezi (MediaStore;
müzik/video/fotoğraf, arama/sıralama/gruplama, fotoğraf görüntüleyici). (4) Ayarlar'daki yanlış "yakında/Publish" iddiaları
düzeltildi; kısayollar ve arka planda oynatma (Media3) eklendi. (5) EPG düğmesi seçili kategorinin rehberini açar.
Ayrıntı `AI-DEVIR-v18.4.0.md`. Actions: v18.0.0 = build-112, v18.1.0 = build-113, v18.2.0 = build-114.

**v18.4.0 cihaz:** yerel medya MAG'de açıldı, EPG kategori çalıştı; Medya Merkezi yavaş, proxy taraması yavaş/bilgisiz.

**v18.5.0 (bu sürüm):** Medya Merkezi performansı; proxy açık + havuz boşken sessiz yanlış negatif hatası (artık sorulur/bekler);
iki aşamalı proxy testi (TCP → httpbin yargıç) + Elite/Anonim/Şeffaf; tarama ekranında proxy'li/normal anahtarı ve canlı proxy satırı;
tarama öncesi havuz tazeleme; kalıcı "iyi proxy" listesi; tanı raporunun 80 olaya kesilmesi düzeltildi. Ayrıntı `AI-DEVIR-v18.5.0.md`.

**v18.5.0 cihaz:** proxy anahtarı çoklu hesapta yoktu; combo "etkin 1"; TXT kaydı hata; Medya Merkezi yavaş (19.521 fotoğraf);
kısayollar boş simge + yönlendirme yok. Logdaki 47 ANR'nin hepsi uygulama ARKA PLANDAYKEN (sahte donma).

**v18.6.0 (bu sürüm):** kayıt 3 motorda (MPV stream-record, Media3 canlı "tee" — ikinci bağlantı yok); parçalı indirme motoru
(`DownloadEngine.kt`, görünür klasör `PublicStorage.kt`); kısayol kendi eylemi + kendi simgeleri; combo parti işçi doyurma;
TXT görünür klasöre; Medya Merkezi native sayfa önbelleği + aşamalı yükleme; Cast fotoğraf/slayt; sürekli çal; izlendi işaretleri;
Türk Bayrağı oranlı ay-yıldız simgesi. Ayrıntı `AI-DEVIR-v18.6.0.md`.

**v18.6.0 cihaz:** yerel medya "tekrar" çalışmadı; kısayollar yine ekrana götürmedi, simgeler boş; Medya Merkezi fotoğrafta 80 sn.

**v18.7.0 (bu sürüm):** tekrar düzeltmesi (MPV `idle=yes` → dosya bitince boşalıyordu; artık `reload`); kısayol kimliği Activity
oluşturulurken yakalanır (`ShortcutInbox` + `KizilkanShortcutPackage`) + native telemetri; bitmap kısayol simgeleri; Medya Merkezi
hızı (tek `Intl.Collator`, önbellek); **çoklu MAC** (`app/mag-bulk.tsx`: çoklu DNS, MAC liste/aralık, port/portal keşfi, rehber, proxy).
Ayrıntı `AI-DEVIR-v18.7.0.md`.

**Önerilerin kod denetimi (30.09):** sıralama/kategori düzenleme, ebeveyn kilidi, uyku zamanlayıcı, yedekle/geri yükle ZATEN VAR.
Gerçek eksikler (sonraki build'ler, onaysız kodlanmaz): EPG'den zamanlı kayıt + hatırlatıcı; ana ekranda film/dizi "devam et" şeridi;
aramada EPG program adı; ölü kanal taraması; hız testi; yazı boyutu ayarı; yedek şifreleme.

**Tuzak (v18.7.0):** stalker.ts'e üst düzey `@/modules/panel-scan` import'u EKLEME — v15214/v15216 kapıları stalker.ts'i sahte
`require` ile çalıştırıyor; panel-scan tembel (`await import`) yüklenir. `FONT.size.md` YOK (`base` kullan).
Git Bash altında Gradle "Unable to establish loopback connection" verebilir → derlemeyi PowerShell'de çalıştır.

**Tuzak (v18.4.0):** PlayerHost'ta oynatma kararında `activePlaylist?.source` DOĞRUDAN kullanma → `playlistSource`.
MAG film/catch-up da `ext=true` ile açılır; "external = yerel" sanma.

**Açık konular (öncelik sırasıyla, hiçbiri onaysız kodlanmaz):**
1. **Timeshift "Her zaman" takılması (KANITLANMADI).** v18.0.0 telemetrisiyle "Her zaman" ve "Kapalı" log bekleniyor.
2. **Release anahtarı:** kullanıcıda 2 anahtar var, hangisi güncel bilinmiyor → `tools/imza-bul.ps1`.
3. Media3 canlıda HTTP 401 alırken aynı adres MPV'de açılıyor (başlık/User-Agent farkı şüphesi).
4. MAG dizi kataloğu ana thread'i kilitliyor (`mag:catalog-series`, ANR).
5. Combo tarama sırasında ANR (`scan:panel-stream-v172`, 65 sn) — kök neden kanıtlanmadı.
6. `iptv.ts` `xtGet` 60 sn zaman aşımı büyük katalog onarımını yarıda kesiyor.
7. Room temizliği sonrası boş kabuk listeler (seçince onarım yapılıyor; toplu onarım yok).
8. Chromecast oturumu yalnız kontroller açıkken CastButton'da dinleniyordu (v18.2.0'da oynatıcıya kalıcı
   dinleyici eklendi); `castSession` durumu da aynı eksiklikten etkilenebilir — cihaz testinde gözlenecek.

## 10. Nasıl çalışalım

1. Kullanıcı isteğini anla → gerekiyorsa tek soru sor.
2. Koddan ve logdan kanıt topla → bulguları tablo ile sun.
3. Planı maddele → **onay bekle**.
4. Onaydan sonra yeni dal aç, kodla, §3 doğrulamasını çalıştır, sonuçları göster.
5. Kullanıcı isterse commit + push; Actions'ta hangi dalın derleneceğini söyle.
6. Değişikliği ve cihazda test edilecekleri kısa bir devir notuna yaz (`AI-DEVIR-v<sürüm>.md`)
   ve bu dosyanın §9'unu güncelle.
