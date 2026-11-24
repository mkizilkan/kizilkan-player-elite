# KIZILKAN PLAYER ELITE v18.7.40 RC1 — M3U Link Test Aracı + paralellik + katalog süre ölçümü

Tarih: 25 Kasım 2026. Dal: `v18.7.40-rc1-link-test-tools`. Taban: v18.7.39.
Kaynak: kullanıcı isteği (HITHUNTER M3U Checker ekran görüntüleri) — test → seç → ekle aracı;
ayrıca paralel test sayısı (1–50) ve C (ekleme yavaşlığı) için detaylı süre ölçümü.

## 1. Yapılan (A + paralellik + C-telemetri)

### A — M3U/Xtream Link Test & Ekle (yeni ekran `app/link-test.tsx`)
- **Giriş:** `.txt` dosyası seç (kirli olsa da `get.php` linklerini ayıklar) **+** metin yapıştır → "N link bulundu · M yinelenen atlandı".
- **Hızlı test:** her link → `xtreamLogin` (durum/bitiş/maks bağlantı) + 3 kategori çağrısı (Live/VOD/Series kategori sayıları). Keşif YOK, hızlı. Paralel (seçilebilir).
- **Sonuç kartları:** `kullanıcıadı · ACTIVE · bitiş · bağlantı · Live/VOD/Series kategori adedi` (HITHUNTER tarzı).
- **Karta tıkla → detay:** tam Live/VOD/Series **stream sayısı** (tembel, `xtream*CatalogProbe`) + Live/VOD/Series **kategori listeleri** (sekmeli, `#id + ad`).
- **Seç + Ekle:** tek / Tümünü / Aktifleri → `importHitRecord` (doğrulanmış ekleme motoru, dedup).
- **Yeni util** `src/utils/linkTest.ts` (extract/fast/full) + `iptv.ts`'e `xtreamVodCatalogProbe`/`xtreamSeriesCatalogProbe`.

### Paralellik (1–50)
- M3U testi: ekranda "Paralel test (1–50)" girişi → `runPool` eşzamanlılığı. Varsayılan 6.
- MAC testi: mevcut "Çoklu MAC" ekranı (kendi 1–100 paralellik girişi).

### B — MAC Portal (sekme)
- "MAC Portal" sekmesi, aynı işi yapan mevcut **Çoklu MAC** (`mag-bulk`) motorunu açar (test→seç→ekle). MAC sonuçlarını birebir aynı kart UI'ına gömme AYRI iş (v18.7.41).

### C — Katalog ekleme süre ölçümü (uçuş kaydına, "logdan bakarız")
- `add-playlist` normal Xtream: `trace.stage('catalog-fetch',{ms})` + `trace.stage('room-sync',{ms,channels,vod,series})`.
- `importHitRecord` native bulk: `bulk-start` + `live-ready{ms}` + `catalog-complete{totalMs,liveReadyMs,vodSeriesMs,...}`.
- Bunlar HIT_FILE_IMPORT/ADD_PLAYLIST trace'ine yazılır → tanı JSON'unda görülür. **C düzeltmesi bu ölçümden SONRA (kör düzeltme yok, §7).**

### Erişim (3 nokta)
- **Liste Ekle** ekranında buton · **Ayarlar**'da satır · **Ana ekran** (boş durum) kısayolu.

## 2. Mimari / regresyon
- Native değişiklik YOK (tümü TS/TSX); iptv.ts'e 2 saf sayaç eklendi. Mevcut HitFileImport/add akışı korundu.
- Ekleme `importHitRecord` ile → mevcut dedup/Room doğrulama korunur. Paket eklenmedi.

## 3. Doğrulama
- `yarn tsc --noEmit`: **PASS** · `check-v18740`: **PASS** · `node tools/denetle.js`: **TÜM TEMİZ** (exit 0).
- PC DEV `assembleDebug`: **BUILD SUCCESSFUL** (APK 482 MB, 18.7.40-dev). İlk packageDebug Gradle daemon
  OOM verdi (kod değil); `GRADLE_OPTS=-Xmx6144m` ile incremental yeniden 48 sn'de başarılı.
- **Telefon bağlı DEĞİL** → cihaz kurulumu/kabulü bekliyor (kullanıcı takınca).

## 4. Cihaz kabulü (YAPILACAK)
1. **A:** Liste Ekle/Ayarlar/Ana ekrandan "M3U Link Testi" aç → dosya seç veya yapıştır → "N bulundu" → paralel sayı seç → Testi Başlat → kartlar (durum/bitiş/kategori) → karta tıkla (tam sayı + kategori listesi) → seç → ekle.
2. **C:** Bir Xtream liste ekle → tanı raporunda `catalog-fetch`/`room-sync`/`live-ready`/`catalog-complete` sürelerini oku (asıl yavaşlığın hangi adımda olduğu).

## 5. Gerçek teslim kaydı — Opus, 25.11.2026
- Commit **`7209812b`** → dal `v18.7.40-rc1-link-test-tools` push (ana dal değişmedi).
- CI manuel release: [run 45499116706](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/45499116706) (teslim anında in_progress).
- PC DEV APK hazır (`frontend/android/app/build/outputs/apk/debug/app-debug.apk`, 18.7.40-dev); telefon bağlanınca `adb install -r` ile kurulacak.
- **Cihaz kabulü YAPILMADI** (telefon bağlı değil). §4 senaryoları bekliyor.
