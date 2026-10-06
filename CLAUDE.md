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

## 9. Mevcut durum (v18.7.19 RC1 — dal `v18.7.19-rc1-stream-creds-persist`)

**v18.7.19 (bu sürüm — U4 kullanıcı adı kalıcılaştırma; PC doğrulandı, CİHAZ BEKLİYOR):**
Cihaz kanıtı (18.7.18-dev kart): Şifre `vtRSvSDdnl` görünüyor (get_profile.password, kayıtlı) ama Kullanıcı Adı "Belirlenemedi". Kök neden: portal `login` boş → kullanıcı adı yalnız oynatma URL'inden (U4) gelir; eski U4 haritası BELLEK-İÇİ idi → yeniden açılışta kayboluyordu.
- **Düzeltme:** türetilen kimlik storage'da (`kizilkan.streamCreds`) saklanır + açılışta `hydrateStreamDerivedCredentials` yüklenir → bir kez kanal açınca KALICI görünür. Değerler loglanmaz. `stalker.ts`, `_layout.tsx`.
- Doğrulama: tsc temiz · denetle TEMİZ · `check-v18719` PASS. Native değişiklik YOK. Ayrıntı `AI-DEVIR-v18.7.19.md`.
- **Not:** yeni kurulumda storage boş; ilk görüntü için hkpremium'da BİR kez kanal açmak gerekir, sonrası kalıcı.

## 9-eski-18718. v18.7.18 RC1 (dal `v18.7.18-rc1-backup-drive`)

**v18.7.18 (bu sürüm — yedek dayanıklılığı + Google Drive runtime; PC doğrulandı, CİHAZ BEKLİYOR):**
Kaynak: cihaz (18.7.13) tam yedekleme hatası + Google Drive isteği. Ayrıntı `AI-DEVIR-v18.7.18.md`.
- **B1:** Tam yedekte yetim/boş-kabuk playlist (`queryItems` IllegalStateException: "Room indeksi ve legacy veri bulunamadı") TÜM yedeği düşürmez; o tür atlanır (`chunk-error`/`BACKUP_KIND_SKIPPED`), yedeğe devam edilir. Abort hariç. **Bu hata tüm eski sürümlerde vardı.**
- **G1:** Google Drive OAuth Client ID uygulama içinde girilir (env zorunlu değil). Kullanıcı kendi Web OAuth Client ID'sini Yedekleme ekranına yapıştırır, gösterilen redirect URI'yi Google Console'a ekler → "Giriş yap ve Yükle" tarayıcıda OAuth. Storage: `kizilkan.googleDrive.clientId`, açılışta `hydrateGoogleDriveConfig`. Redirect scheme artık uygulama scheme'i (`kizilkan-gpt`; eski yanlış `'frontend'` kaldırıldı).
- **APK #1:** "güncelleyerek yüklenmedi" = imza kuralı: 18.7.13 release üstüne yalnız aynı anahtarlı `assembleRelease` kurulur; DEV ayrı paket (adb ile yanına). Kod hatası değil (§7).
- **Yeni istek (v18.7.19'a bırakıldı):** arka planda çalışma (çoklu arama/ekleme/güncelleme app arkadayken) = native foreground service (§9 "PanelScanService'e bağlamak").
- Doğrulama: tsc temiz · denetle TEMİZ · `check-v18718` PASS. Native değişiklik YOK. Kırılan 3 harness (diagnostics/googleDrive mock) düzeltildi.

## 9-eski00000. v18.7.17 RC1 (dal `v18.7.17-rc1-discovery-copy-update`)

**v18.7.17 (bu sürüm — portal keşfi + kopyala + güncelleme; PC doğrulandı, CİHAZ BEKLİYOR):**
Kaynak: v18.7.16-dev cihaz logu (U4 ÇALIŞTI — hkpremium kullanıcı adı `ud3B3yRH` yayın adresinde kanıtlandı; portal keşfi 4 test; güncelleme 16800→6776 silme) + kullanıcı istekleri. Ayrıntı `AI-DEVIR-v18.7.17.md`.
- **P1:** portal version.js/xpcom doğrulanınca `MagDiscoveryBudget.grant(6000)` → API yolları deadline'dan önce denenir (çoklu+DNS "bulamadı" düzelir).
- **P2:** "Yalnız girilen" (exact) + arayüz yolu `/c` → aynı kurulumda API çözülür (literal .php hâlâ kati). **P3:** paralellik 1–100, girilen=çalışan (`MAG_MAX_PARALLEL` 16→100; turbo 12 kırpması kalktı).
- **K1:** MAG kartı kullanıcı adı ÖNCE U4 stream değeri (bayat name=1787 gösterilmez). **K2:** kart + düzenleme ekranı kopyala butonları (expo-clipboard kurulu).
- **E1:** tekli MAG eklemede görsel `CatalogPreparationModal`. **G1:** yıkıcı diff koruması (`MAG_REFRESH_SHRINK_GUARD` — auto refresh'te eksik çekilen tür Room'u yarıdan aza düşüremez; manuel tam yenileme atlar).
- **S1:** Flight Recorder sil bildirimi. **M1:** soğuk açılış ölçümü `APP_COLD_START`.
- **Kör düzeltme yok:** G2 (süre) — sayfalama paralel, yavaşlık sunucu kaynaklı (avgPageMs 53↔10547ms); concurrency artışı "1 kullanıcı"da ban riski (§5) → yapılmadı, G1 kaybı önler.
- Doğrulama: tsc temiz · denetle TEMİZ · `check-v18717` PASS · MAG testleri PASS. Native değişiklik YOK.

## 9-eski0000. v18.7.16 RC1 (dal `v18.7.16-rc1-bulk-ux-portal-discovery`)

**v18.7.16 (bu sürüm — toplu UX + portal keşfi + kullanıcı adı; PC doğrulandı, CİHAZ BEKLİYOR):**
Kaynak: cihaz DEV logu (goldensm32 çoklu MAC) + MAG Converter aracı. Kanıtla teşhis, hepsi `AI-DEVIR-v18.7.16.md`.
- **A:** yeni **"probable"** (muhtemel geçerli) kategorisi — doğrulama "unverified" ama kimlik+gelecek bitiş varsa eklenebilir (içerik örneği çökük host/süre bütçesinden alınamadı; blocked/expired ayrı). `stalkerVerifyAccount`→`accountIdentity/expiryValid`.
- **B:** toplu ekleme görsel `CatalogPreparationModal`. **C:** küresel otomatik yenileme ana anahtarı (`FRESHNESS_SKIP_GLOBAL_OFF`; kapalıyken hiçbir liste güncellenmez).
- **D:** katalog sayfalama hız ölçümü (`STALKER_PAGINATION_STOP.avgPageMs/elapsedMs`). **E2a:** version.js API yolları öne (`unshift`); **E2b:** "all" aile-önce; **E1:** keşif telemetrisi deadline'da da yazılır.
- **U1:** dolgulu base64 kullanıcı adı çözme. **U2:** alan biçim telemetrisi (değer yok). **U3:** yayın URL yapı telemetrisi. **U4:** Xtream-şekilli URL'den kullanıcı adı/şifre çıkar+kartta göster (kendi hesabın; loglanmaz).
- **Kök neden (portal "all"+turbo bulamıyor):** version.js bulunup 6 API yolu `queue.push` ile SONA ekleniyordu; turbo'nun ~6,6 sn bütçesi o yollara sıra gelmeden doluyordu (`MAG_DISCOVERY_BUDGET_RESULT reason:deadline`).
- Doğrulama: tsc temiz · denetle TEMİZ · `check-v18716` PASS · MAG testleri (discovery/bulk/account/dev1) PASS. Native değişiklik YOK.

## 9-eski000. v18.7.15 RC1 (dal `v18.7.15-rc1-mag-endpoint-lock`)

**v18.7.15 (bu sürüm — GPT Build 1 D01-D15 + Opus tamamlama; PC doğrulandı, CİHAZ BEKLİYOR):**
GPT `v18.7.15-dev1`'de kodladı, token bitti (47 dosya, 2 kırık kapı); kullanıcı onayıyla Opus devraldı, dalı §4 adına çevirdi.
- **D01/D02:** kullanıcı adı yalnız gerçek login alanlarından; MAC'e düşmez ("Belirlenemedi"); `name/fname` → ayrı **"Görünen Ad"** (hkpremium: Kullanıcı Adı Belirlenemedi, Görünen Ad 1787 — bilerek).
- **D03/D04:** toplu `mergeInfo` ortak birleştirici; MAG `active_cons/max_connections/allowed_output_formats`. **D05/D06:** durum bilinmeyen/engelli ayrımı, 0 bağlantı korunur.
- **D07:** ortak `CatalogPreparationModal` (ana ekran/onarım/düzenleme; düzenleme İptal+geri tuşu). **D08:** tekli ekleme `resolveMagInput` → endpoint exact kilit.
- **D13:** `MagDiscoveryBudget` ortak host bütçesi. **D14/D15:** joker yanıtlayıcı parmak izi, CF edge≠challenge. İstemci JS (xpcom) yalnız METİN olarak çözülür.
- **Opus:** (1) alternatif scheme genişletmesi yalnız seçilebilir API yokken (http API bulunmuşken https'e taşma); (2) D12 `reqTransport` finally'de `c.abort()` (iptal edilen oturumda açık taşıma kalmaz).
- **Tuzak:** `stalker.ts`'teki yeni üst düzey importlar SAF modüllerdir; eski VM kapıları `tools/_mag_pure.js` ile yükler. Platform modülü (panel-scan/failover) yine tembel.
- Doğrulama: tsc temiz · denetle TEMİZ · `check-v18715` PASS · keşif 19 grup · DEV1 13 grup. Native değişiklik YOK. Ayrıntı `AI-DEVIR-v18.7.15.md`.

## 9-eski00. v18.7.14 RC1 (dal `v18.7.14-rc1-verify-username-scope`)

**v18.7.14 (bu sürüm — GPT G01-G06 + back-trap iptal; PC doğrulandı, CİHAZ BEKLİYOR):**
Kaynak: GPT v18.7.13 incelemesi (`GPT-PYTHON-REFERANSLARI-VE-MAC-INCELEME-2026-10-05.md`) + kullanıcı "oynatma listesi ekle'den geri çıkamıyorum".
- **A (back-trap):** MAG ekleme modalına İptal butonu + onRequestClose abort + `stalkerAddAbortRef` signal (stLogin/snapshot/keşif). Takılınca kullanıcı çıkabilir.
- **G01:** çoklu doğrulama ordered-list boşsa sınırlı `get_all_channels` dener (tekli çalışıp çoklunun reddi biter).
- **G02:** main-info görünen-adı profildeki gerçek `login`'i ezmez. **G03:** base64-MAC decode'dan önce elenir (login alanında olsa da username olmaz).
- **G04:** enrichment gerçek bütçe (best sonrası her deneme sayılır + 12s deadline). **G05:** "Yalnız girilen" portsuz girişte bile kati; HTML-link/soft-404 exact'te kapalı. **G06:** snapshot main-info yalnız MAC eşleşiyor+boş değilse otoriter.
- Doğrulama: tsc temiz · denetle TEMİZ · `check-v18714` PASS · hesap testi 19 grup · keşif testi 19 grup. Ayrıntı `AI-DEVIR-v18.7.14.md`.
- **Bekleyen (GPT):** G07/G08/G09/G10 (keşif profil farkı, ortak deadline, oynatma ölçümü, "katalog≠ilk kare" etiketi).

## 9-eski0. v18.7.13 RC1 (dal `v18.7.13-rc1-exact-scope-username-mac`)

**v18.7.13 (bu sürüm — manuel portal seçimi + kullanıcı adı + A01 base64 MAC + "Yalnız girilen" kati kapsam; PC doğrulandı, CİHAZ BEKLİYOR):**
Cihaz kanıtı: "ben seçeyim"de bulunan izler tıklanamıyordu; hkpremium kullanıcı adı `ud3B3yRH` yerine `1787` (name); goldensm32 base64 MAC `profile-mac-mismatch`.
- **#1** Manuel modda "portal izi" adaylar da seçilebilir; seçim fazı iz içeren terminal-olmayan raporda açılır (terminal/koruma hariç); seçim handshake ile doğrulanır. (`mag-bulk.tsx`, `magBulkScan.ts`)
- **#2** Kullanıcı adı zenginleştirme: gerçek login yoksa dolu-parametre `get_profile` denenir (bütçe 2), login getiren tercih edilir; yoksa eski davranış. (`stalkerProfile`)
- **#3 A01** `accountMatchesMac` base64 MAC'i `decodeMacIfBase64` ile çözer (kullanıcının defalarca istediği; artık yapıldı).
- **#4** "Yalnız girilen" (exact) KATİ: yalnız girilen port+yol; family/version.js/iki-aşama YOK. (`magPortalDiscovery.ts`, `magBulkScan.ts`)
- Doğrulama: tsc temiz · denetle TEMİZ · `check-v18713` PASS · hesap testi 14 grup · keşif testi 18 grup. Ayrıntı `AI-DEVIR-v18.7.13.md`. GPT devir: `GPT-OPUS-GUNCELLEME-DEVRI.md`.

## 9-eski1. v18.7.12 RC1 (dal `v18.7.12-rc1-mag-ip-failover`)

**v18.7.12 (bu sürüm — MAG çoklu-IP DNS failover; PC doğrulandı, CİHAZ BEKLİYOR):**
Kök neden (adb + PC kanıtı): goldensm32.xyz 5 A kaydı, **yalnız .225 canlı**; telefonun DNS'i ölü IP veriyor → 6 sn timeout,
diğer IP'ler denenmiyordu. Host failover oynatıcıda vardı, MAG ekleme/taramada yoktu. Yeni `magHostFailover.ts`: DoH ile tüm A kayıtları
→ canlı IP yoklanıp sabitlenir → bağlantı IP'ye (Host=hostname), yanıt URL'i hostname'e çevrilir (güvenlik kontrolleri bozulmaz). Yalnız HTTP,
yalnız RN ortamında aktif. **Tuzak tekrarlandı:** stalker.ts/magPortalDiscovery.ts'e üst düzey import 10 kapıyı kırdı → tembel `loadHostFailover()`.
Doğrulama: tsc temiz · denetle TEMİZ · `check-v18712` PASS · failover testi 7 grup. Ayrıntı `AI-DEVIR-v18.7.12.md`.

## 9-önceki. v18.7.11 RC1 (dal `v18.7.11-rc1-mag-profile-variants`)

**v18.7.11 (MAG profil-uyumluluk çekirdeği; cihazda hkpremium kullanıcı adı 1787 görüldü — `name` alanından):**
Kök neden (cihaz 18.7.10 tanı + protokol araştırması): weko `:80/portal.php` handshake OK (token) ama `get_profile` **MAG320-pcap-minimal** ile BOŞ → profil boş; yine de `get_all_channels` **21266 kanal** açıyor. Kod yalnız minimal profili deniyordu (`STALKER_COMPAT_ATTEMPT` 11× pcap320-minimal), boş profili "geçersiz" sayıp çoklu MAC'te `valid=0` yapıyordu. Standart istemci (StalkerTalker/Kodi) get_profile'ı **sn/stb_type/image_version/ver** ile gönderir; weko profili ancak öyle verir. Kullanıcı adı = `get_profile`'daki **`login`** alanı.
- **A / M07+M08:** `initialProfileVariants(MAG320)` artık minimal + **dolu-parametreli MAG254/MAG250** varyantları; `derivedProfileVariants(MAG320)` türetilmiş kimlik üretir (eskiden boş). Minimal ÖNCE (uyumlu portaller etkilenmez), boşsa dolu varyantlara düşer.
- **B / M08:** `stalkerVerifyAccount` kimlik (profil/main_info) yoksa HEMEN `unverified` DEMEZ; canlı/VOD/dizi erişiminde gerçek örnek varsa `verified` (weko 21266 çoklu MAC'te eklenir). yanlış-MAC/denial hâlâ elenir.
- **C / T02+A03/A04:** ortak `pickUsernameField` (login→…→name→sname) + snapshot telemetrisi `usernamePresent/usernameFieldKind/usernameSourceKind/loginValuePresent…` (redaksiyona takılmayan SAFE sonekler) → kullanıcı adının hangi alanda olduğu değer açılmadan görünür.
- **M09:** `discoverMagPortal` duvar-saati bütçesi (cihaz: keşif ~19 dk) → `DISCOVERY_BUDGET_STOP` (tamamlanamadı; "portal yok" değil).
- Doğrulama: tsc temiz · **denetle TEMİZ (exit 0)** · `check-v18711-release.js` PASS · hesap testi **12 grup** (yeni: dolu-parametre varyant, boş-profil+canlı=verified, kullanıcı adı alanı). **Native değişiklik YOK.** Ayrıntı `AI-DEVIR-v18.7.11.md`.
- **Player (ayrı):** ilk kare ~2 sn = Media3 TS açılışı (buffer başlatma zaten ~200 ms); kör buffer dokunuşu YAPILMADI (stutter riski). Uzun gecikmeler HTTP 444+boş oturumdandı → M08 ile düzelmesi beklenir. Açılış ölçümü v18.7.12'ye.

## 9a. Önceki durum (v18.7.10 RC1 — dal `v18.7.10-rc1-bulk-handshake-fallback`)

**v18.7.10 (çoklu MAC handshake yedeği + GPT inceleme düzeltmeleri):** pasif keşif boşsa gerçek handshake keşfi (`discoverMagPortal`), bulunan endpoint seçilebilir aday (`MAG_BULK_HANDSHAKE_FALLBACK_*`); redirect host'u öldürmez; version.js tanıma (M05: non-selectable iz + API probe); alternatif http/https scheme; sınırlı unknown-port fallback; korumada yedek yok (M02); literal `.php` kapsamı (M03); ilk 3 MAC (M04). Ayrıntı `AI-DEVIR-v18.7.10.md`.

## 9b. Önceki durum (v18.7.9 RC1 — dal `v18.7.9-rc1-twophase-discovery`)

**v18.7.9 (iki aşamalı portal keşfi + telemetri, kanıtlı):**
Cihaz kanıtı: `weko-azure.xyz` çoklu-MAC "all" taraması 54 portun hepsinde yol denedi (~757, 8,8 dk, valid:0, görünürlük yok).
- **İki aşamalı keşif:** önce açık portlar (paralel), sonra yollar **yalnız açık portlarda** (bulununca dur); bulunamazsa
  bilinmeyen portlar fallback. ~757 yerine ~(açıkPort×14); yanlış-negatif korunur. (`magPortalDiscovery.ts`)
- **Keşif telemetrisi `MAG_DISCOVERY_RESULT`:** açık portlar + bulunan aday endpoint'ler (confidence/HTTP/kanıt) + state/probes.
- **Kullanıcı adı:** `STALKER_ACCOUNT_SNAPSHOT.profileFields` (get_profile alan adları). Ayrıntı `AI-DEVIR-v18.7.9.md`.

## 9c. Önceki durum (v18.7.8 RC1 — dal `v18.7.8-rc1-catalog-speed-discovery`)

**v18.7.8 (bu sürüm — katalog hızı + keşif yanlış-negatif + tekli/çoklu birleştirme, kanıtlı):**
v18.7.7 cihaz testi (bitiş/şifre/MAC/AKTİF ÇALIŞTI) sonrası kalan sorunlar + GPT keşif analizi.
- **B — katalog çok yavaş (kanıt: VOD 14/sayfa sıralı, 45 sn'de %5):** `stalkerOrderedList` artık **paralel sayfalama** —
  bootstrap (p0/p1 base+total) sıralı, ilk gerçek sayfa tek (duplicate governor ≤3), sonrası parti-6 PARALEL (sırayla işlenir,
  dedup korunur). Mutlak sayfa sınırı 120→600, bütçe 45→75 sn. ~7× içerik, kat kat hız.
- **Keşif P0 (GPT) — hiçbir port yanlışlıkla elenmez:** `open|unknown|closed`; yalnız kesin bağlantı reddi=closed;
  timeout/TLS/body-limit=unknown (yollar yine denenir); proxy BODY_LIMIT=açık; `/` başarısızlığı/tek açık port
  diğerlerini elemez; portsuz girişte **auto scope**. (`magPortalDiscovery.ts`)
- **Tekli/çoklu motor birleştirme:** tekli MAG ekleme (`add-playlist.tsx`) artık çoklu ile aynı MAC'siz `discoverMagHosts`
  motorunu kullanır (handshake-keşfi fallback). Aynı host her iki ekranda aynı endpoint'i bulur.
- **A — kullanıcı adı:** `STALKER_ACCOUNT_SNAPSHOT.mainInfoFields` (alan adları, değer yok) + kullanıcı adı aday alanları genişletildi.
- **C — ilk-kare:** kanıt hızlı (0.6–1.1 sn) gösterdi; kör düzeltme yok, P7 ölçümü kalır.
- Doğrulama: tsc temiz · denetle TEMİZ (exit 0) · `check-v18708-release.js` PASS · keşif testi 15 grup. Native değişiklik YOK.
  Kırılan 4 eski kapı (unsupported→VOD fallback, DUPLICATE_PAGE, nextPage:2, P0_EMPTY_P1_FALLBACK, PORT_CLOSED) düzeltildi.
  **v18.7.9'a bırakıldı:** native gerçek-TCP, endpoint registry, soft-404, edge/challenge ayrımı, hata sınıfları, learned cache.
  Ayrıntı `AI-DEVIR-v18.7.8.md`.

## 9d. Önceki durum (v18.7.7 RC1 — dal `v18.7.7-rc1-mag-account-fixes`)

**v18.7.7 (bu sürüm — MAG hesap kartı doğruluğu + oynatma/senkron, kanıtlı; PUSH/DERLEME BEKLİYOR):**
v18.7.6 cihaz testi sonrası 8 düzeltme (P1–P8). Kök neden kanıtları: tanı `...05-13`, cihaz AsyncStorage, IPTV Extreme görüntüleri.
- **P1 — bitiş `phone`'da geliyor:** vip.rxs1 bitişi `phone:"January 8, 2027..."` alanında; biz telefon sanıyorduk. Artık açık bitiş
  yoksa phone tarih olarak bitiş sayılır (telefon gösterilmez). `accountExpiry` "D Month YYYY [HH:MM:SS]" + Türkçe ay tanır.
- **P2 — gzip (önceki oturum + korundu):** `get_main_info` gzip gelip "JSON değil" sayılıyordu. exactEndpoint expo/fetch yolunda
  elle `Accept-Encoding` kaldırıldı (OkHttp şeffaf açar); snapshot artık exactEndpoint zorlamaz. `GZIP_UNDECODED` telemetrisi.
- **P3 — status 0 = AKTİF:** Stalker'da sayısal 0 aktiftir (launcher_profile.php). accountDenial'ın 0'ı "bloklu" sayması kaldırıldı
  → HKPREMIUM artık "SÜRESİ DOLDU" değil "AKTİF". Bare kayıt (ör. {blocked:0}) status'u undefined kalır.
- **P4 — base64 MAC/login + password:** `MDA6...`=`00:1A:79:...` çözülür; `AccountInfo.password` eklendi, kartta "Şifre".
- **P5 — motor geçişinde taze create_link:** `switchProfile`'da Stalker için tek-kullanımlık play_token yeni motora taşınmaz
  (`STALKER_ENGINE_SWITCH_REFRESH`). Media3→MPV'de "Failed to open ...play_token" düzelir.
- **P6 — ilk senkronda otomatik güncellik atlanır** (`FRESHNESS_SKIP_INITIAL_SYNC`): çift katalog işi + ~2 dk kilit beklemesi biter.
- **P7 — Media3 geç açılma ÖLÇÜMÜ:** FIRST_FRAME'e `sinceSourceSetMs` (gecikme kaynak öncesi mi sonrası mı). Düzeltme kanıttan sonra.
- **P8 — ilerleme kutusu:** otomatik güncellemede ORTADA simgeli kutu (freshnessStatus.active).
- Doğrulama (PC): tsc temiz · denetle TEMİZ (exit 0) · `check-v18707-release.js` PASS · hesap testi 9 grup. **Native/Kotlin değişikliği YOK (tümü TS).**
  Ayrıntı `AI-DEVIR-v18.7.7.md`. **Push/derleme ve cihaz doğrulaması bekliyor.**

**v18.7.6 (dal `v18.7.6-rc1-mag-scan-fixes`) — MAG + Tarama düzeltmeleri, kanıtlı:** Kullanıcı onayıyla "1 (MAG) + 3 (Tarama)" beraber.
- **D1 (bitiş "Bilinmiyor") — REGRESYON düzeltmesi:** `profilePayload` v18.7.4'te katı `hasAccountIdentity` yapılınca
  bitiş+MAC taşıyan gerçek profiller "boş" sayılıp bitiş kayboluyordu (v16.14.4–18.7.3 toleranslıydı; `git -S` ile kanıt).
  Yeni `hasDisplayableAccountFields` (gerçek hesap sinyali: pozitif id/login/MAC/bitiş/tarife/telefon; cihaz-tipi/jenerik ad
  DEĞİL) ile toleranslı okuma geri. Katı gate toplu taramada korunur (gösterim ≠ doğrulama).
- **Hesap API doğrulaması (Xtream get_account_info karşılığı):** `stalkerAccountSnapshot` → bounded `get_main_info`;
  ekleme/yenileme/elle-güncellemede otoriter durum/bitiş; boş sonuç eldeki bitişi EZMEZ. MAG yenileme yaması artık
  `accountInfo` yazıyor ("elle güncelleyince bile bozulma" nedeni buydu — hiç yazmıyordu).
- **C (18.7.4'te açılan kanal 18.7.5'te açılmıyor):** bayat cache oturumu boş create_link üretince taze handshake'e
  düşülmüyordu; artık `cacheHit && boş-link` de forceFresh tetikler (`STALKER_RESOLVE_STALE_RETRY`).
- **D2 (ANR/donma):** handshake duvar-saati bütçesi `HANDSHAKE_WALL_BUDGET_MS=90s` (log: tek handshake 19 dk +
  212 sn JS donması); katalog yield 80→32 (GC rahatlaması). Cihazda ANR'nin gerçekten düştüğü DOĞRULANACAK.
- **A4 (tarama "757 versiyon"):** port-öncelikli keşif + ölü port budama + **PARALEL port erişilebilirliği**
  (`reachableOpenPorts`, port bilinmeyen keşifte gate'siz paralel; açık portlarda gated/ban-güvenli yol denemesi).
- **A3:** aday bulundukça canlı yayın (`emitLive` + onHost host-upsert). **A2:** tarama boyunca `setKeepScreenOn`.
  (Gerçek arka plan/home-tuşu yürütmesi = ayrı iş: MAG taramasını `PanelScanService`'e bağlamak.)
- **B:** tekli MAC/portal yenilemede gerçek ilerleme `freshnessStatus`'a akar.
- Doğrulama (PC): tsc temiz · denetle TEMİZ (exit 0) · `check-v18706-release.js` PASS · keşif testi 14 grup · hesap testi 9 grup.
  **assembleDebug + cihaz doğrulaması bekliyor.** Ayrıntı `AI-DEVIR-v18.7.6.md`. **Build geçti = çalışıyor DEĞİL.**

**v18.7.5 (TELEMETRİ):** (1) Media3 "bazen ses yok" için `MEDIA3_AUDIO_STATE`
(readyToPlay/sourceLoad/ilk-kare sonrası; `suspectSilent` = parça var ama aktif yok). (2) `FIRST_FRAME`
olayına `timeshiftMode` etiketi (Kapalı vs Her zaman ilk-kare kıyası). Kök neden kanıtlanınca düzeltme
v18.7.6'da yapılacak. Ayrıntı `AI-DEVIR-v18.7.5.md`. Kapı `check-v18705-release.js`.
Ölçümler (etiketsiz): media3 ilk-kare 1414–2269 ms, mpv 2269–3976 ms; uygulama soğuk açılış ~2,5 sn,
sıcak ~0,04–0,25 sn. **"Çöktü" sanılan durum:** `am force-stop` ile açılış ölçümü uygulamayı kapatıp
açar → ekranda tekrarlayan çökme gibi görünür; gerçek çökme DEĞİL. Cihazda kapatıp-açan komut öncesi
kullanıcıya haber ver.

**v18.7.4:** GPT'nin çoklu-MAC keşif/doğrulama + timeshift onPause sahiplik çalışması; Opus 3 kırık kapıyı
(expo/fetch mock, requestScope iptal→CANCELLED, eksik action-ownership testi) düzeltip bitirdi; cihazda
çökmeden açıldı. Rapor "PlaylistContext M174-13 değişti" demiş ama dosya değişmemiş (uygulanmadı).
Ayrıntı `AI-DEVIR-v18.7.4.md`. **Tuzak:** exact endpoint yolu `expo/fetch` kullanır → VM test harness'i
`expo/fetch`'i mock'lamalı; requestScope iptali CANCELLED, yaşam döngüsü kurtarması BACKGROUND_PAUSE.

## (eski) v18.7.4 durumu

Kullanıcının gerçek MAC ekran görüntüleri ve bağlı DEV logları sonrasında yeni patch:
MAC'siz tek host/API keşfi → otomatik veya manuel tek endpoint seçimi → exact API üzerinde
hesap kimliği ve sınırlı katalog erişimi doğrulaması. HTTP 200/token/genel cihaz profili
tek başına geçerli hesap değildir. Bitiş yılı 0002 ve bozuk tarihler bilinmiyor kabul edilir.
onPause eski pause işareti ve gecikmiş always ayarı yarışları kaynak/fixture ile kanıtlanıp
düzeltildi. Tüm ilk görüntü gecikmelerinin giderildiği henüz cihazda kanıtlanmadı.
Taban `fbbe2d7d`; ayrıntı `AI-DEVIR-v18.7.4.md`, `GPT-v18.7.4-MAC-PLAYER-RAPORU.md`
ve `GPT-OPUS-GUNCELLEME-DEVRI.md`. Native PanelScan Kotlin derlemesi geçti. Son ek bağımsız
bulgular sonrası final denetim, DEV APK/kurulum, ayrı dal push ve manuel Actions sonuçları
bu belgelerde gerçek çıktılarla güncellenir. Henüz üretilmemiş APK'yı tamamlandı sayma.

### Önceki tamamlanmış dağıtım: v18.7.3

Kullanıcı, kaynak incelemesindeki tüm bulguların uygulanmasını onayladı. MAG exact/fallback/all,
koruma gözlemi, sonuç seçimi, kategorili TXT ve boyutu sınırlı giriş; seçmeli yedek merge/journal;
gerçek Room sayımı ve empty/missing ayrımı; profil/liste sahipliği; player/Cast/kayıt/TV;
native tarama checkpoint/probe; PIN ve şifreli Android yedeği; bozuk kayıtta erişimi kapalı
tutma ve eski Android kısayol yazıcısı düzeltmeleri uygulandı.
Ayrıntı: `AI-DEVIR-v18.7.3.md`, `GPT-TESPIT-VE-ONERILER.md`, `GPT-OPUS-GUNCELLEME-DEVRI.md`,
`GPT-S01-NATIVE-TARAMA-DEVIR.md`. Final test/commit/manuel CI/APK kaydı bu devirlerde güncellenir.
Son yerel 111 kapı + TypeScript PASS; manuel run **36984915544 SUCCESS**, release **build-123**.
İmzalı APK kaynak commit'i **5757920a**, uygulama değişiklikleri **096fddfe**;
sonraki workflow/tag düzeltmesi **a7bbfdd8** ve dokümantasyon commit'leri APK kaynağı değildir.
OnePlus 7 Pro'ya 18.7.3-dev / 180703, DEV verileri korunarak kuruldu; görünür UI kontrolü
ekran kilidi nedeniyle yapılamadı. Kullanıcı telefonu çıkarabilir. Build/fixture sonucu cihaz kabulü sayılmaz. Tarihî timeshift donması
tamamen çözüldü diye yazma. Hesap kimlik bilgileri ve kurtarma verisi mevcut uygulamaya özel
depoda tutulur; tüm DB şifreli değildir.

**Her güncellemede zorunlu:** Opus'a iletilecek `GPT-OPUS-GUNCELLEME-DEVRI.md` dosyasına
tarih/sürüm/taban/dal/commit; her dosyada nerede, neyin ve neden değiştiği; bulgu ID'si;
gerçek test ve sonuçlar; kalan cihaz senaryoları; manuel Actions run ve APK bağlantılarını
ayrıntılı ekle. Kullanıcı dosyayı iletecek.

### Önceki sürümler ve korunacak cihaz gözlemleri

**v18.7.1:** v18.7.0 her açılışta çöküyordu (kısayol dinleyicisi Activity yapıcısında `applicationContext`
istiyordu). Düzeltme + kalıcı kapı. Cihazda doğrulandı (OnePlus 7 Pro, adb). Ayrıntı `AI-DEVIR-v18.7.1.md`.

**v18.7.2 (bu sürüm):** çoklu-MAC UX. (A) MAG ekranı ters renk — palette'te `background` yok, `surface` kullan;
`makeStyles` tipi `ThemePalette` (any tema hatasını gizliyordu). (B) portsuz keşif takılması — toplu tarama düz fetch
(`setMagBulkRouting`, native exact atla), kısa timeout, aday başına bütçe, **yol-öncelikli süpürme**, port 54 + yol 14'e
genişletildi. (C) canlı bilgilendirme (`onStage`). (D) analiz modları + elle paralel sayı. (E) dosyadan MAC. (F) bulunanı
TXT+katalog kaydet. (G) portsuz NORMAL MAG eklemede de port keşfi. Ayrıntı `AI-DEVIR-v18.7.2.md`. Kapı `check-v18702-release.js`.
**Veri uyarısı:** v18.7.x kurulu cihazda uygulamayı KALDIRMA (veri silinir); üstüne kur.

**Tuzak (v18.7.2):** tema paletinde `background` anahtarı YOK → kök zemin için `colors.surface`. `makeStyles`/stil üreticilerini
`c: any` tipleme (olmayan anahtarı gizler) → `ThemePalette` tiple. `magExactRequest` toplu taramada reddedilir → toplu tarama
hostları düz fetch kullanmalı. Keşifte host eşleşmesi PORTSUZ (hostname) yap (keşif portu bulunca host:port değişir).

**SIRADAKİ İŞ (onaylı, v18.7.3): kısayolların asıl sorunu** — kodda İKİ kısayol sistemi var; eski `src/utils/quickActions.ts`
(`expo-quick-actions`, `icon=null`, `act=expo.modules.quickactions.SHORTCUT`) her açılışta bizimkinin üstüne yazıyor.
Plan ve kanıt: `AI-DEVIR-v18.7.1.md` "AÇIK — v18.7.2". Cihazda `adb shell dumpsys shortcut` ile doğrula.

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
