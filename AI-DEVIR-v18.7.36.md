# KIZILKAN PLAYER ELITE v18.7.36 RC1 — Oynatıcı hazırlanma bekçisi + yükleme kontrolleri + TV odak

Tarih: 12 Kasım 2026. Dal: `v18.7.36-rc1-player-prepwatchdog-tvfocus`.
Taban: `66ba2823` (v18.7.35). Kaynak: kullanıcı talebi (P1+P2+T1) + 13.10.2026 uçuş kaydı
(`kizilkan-diagnostics-2026-10-13T07-46-47`, 47 oynatma oturumu) + kod incelemesi.

## 1. Neden bu iş

Oturum incelemesinde oynatıcı ve TV arayüzü üç somut sorun gösterdi; kullanıcı üçünü de onayladı.

| # | Sorun | Kanıt |
|---|---|---|
| P1 | Yayın hiç hazır olamazsa ekran sonsuz "yükleniyor" kalıyor | 47 oturumun **7'si** görüntü GELMEDEN 9–61 sn bekleyip terk edildi |
| P2 | Yükleme sırasında kullanıcının hiçbir kontrolü yok | 35 "acil kontrol" dokunuşunun **35'i de** ilk kare gelmeden yapıldı (21 waiting_first_frame, 14 preparing) |
| T1 | TV'nin en çok kullanılan ekranlarında kumanda odak göstergesi yok | EPG, EPG zaman çizelgesi, catch-up, çoklu izleme, indirmeler, liste düzenleme, gizli kanal yönetimi — hepsi ham `TouchableOpacity`, `useTVFocus`/`onFocus` sıfır |

## 2. P1 — Hazırlanma (readyToPlay-öncesi) bekçisi

**Kök neden:** `exoReady` yalnız Media3 `readyToPlay` olayında true olur. Mevcut ilk-kare bekçisi
`!exoReady` ile erken çıkıyordu — yani readyToPlay HİÇ gelmezse (sunucuya bağlanılamıyor / akış
hazır olmuyor) hiçbir bekçi tetiklenmiyor, ekran sonsuza dek takılıyordu.

**Çözüm:** İlk-kare bekçisinin kardeşi olan yeni bir "hazırlanma bekçisi" eklendi. Media3 oturumu
başladığı hâlde `readyToPlay` CÖMERT bir süre içinde gelmezse motor zincirini (MPV → VLC → terminal
hata) ilerletir.
- Yeni sabitler (`controller.ts`): `PREPARE_TIMEOUT_LIVE_MS = 14000`, `PREPARE_TIMEOUT_VOD_MS = 18000`.
  İlk-kare eşiklerinden (3200/5000) belirgin daha cömert — çünkü bu süreye ağ bağlantısı + manifest/
  segment indirme de dahil. Amaç yavaş-ama-sağlıklı yayını kesmek değil, sonsuz takılmayı kırmaktır.
- **§5 TEK BAĞLANTI:** Yeni motor açılmadan ÖNCE Media3 `pause()` + `replace(null)` ile durdurulur —
  aynı kanala iki upstream bağlantı açılmaz. Zincir/koşullar ilk-kare bekçisiyle birebir aynı; yalnız
  yüzey-değiştirme adımı YOK (sorun görüntü yüzeyi değil, akışın hiç hazır olmaması).
- Telemetri: `recordEngineFailure(..., "timeout", "Media3 Nms içinde readyToPlay üretmedi")`.

## 3. P2 — Yükleme kurtarma kontrolleri

**Çözüm:** Yayın `RESCUE_DELAY_MS = 4000` içinde oynamaya başlamazsa (hata da yoksa) ekranda kurtarma
kartı gösterilir: kanal adı + **Kapat** + **Motoru Değiştir**. Hızlı açılan kanallar (medyan ~1,7 sn)
bu süreyi hiç görmez; takılan kanalda kullanıcı mahsur kalmaz.
- `showRescueControls` durumu + 4 sn gecikmeli zamanlayıcı (oturum/kanal değişiminde sıfırlanır).
- TV'de D-pad ile odaklanabilir (`FocusButton`), ilk odak "Kapat"ta (`autoFocus`).
- `pointerEvents="box-none"` → yalnız butonlar etkileşimli; hata ekranı açılırsa katman görünmez.
- Telemetri: `PLAYER_RESCUE_CLOSE`, `PLAYER_RESCUE_ENGINE`.
- P1 (14/18 sn otomatik) ile P2 (4 sn manuel) birbirini tamamlar: kullanıcı otomatik geçişten önce
  elle de çıkabilir/motor değiştirebilir.

## 4. T1 — TV box odak düzeltmeleri

7 ekrandaki ham `TouchableOpacity`'ler `FocusButton`'a çevrildi (FocusButton, TouchableOpacity ile
aynı API'ye sahip birebir yedek; TV'de odaklanınca çerçeve+parlama gösterir, telefonda görünüm
değişmez). Her ekrana açılışta ilk odak (`autoFocus`, genelde geri butonunda) verildi.

| Ekran | Dönüştürülen | Not |
|---|---|---|
| `epg.tsx` | 1 (geri) | Program satırları salt-okunur View, dokunulmadı |
| `epg-timeline.tsx` | 4 (2 geri + program hücresi + Chip) | Chip'in mevcut `hasTVPreferredFocus` korundu |
| `catchup.tsx` | 2 (geri + program) | Arşivsiz program `focusable={false}` (tıklanamaz) |
| `multi-view.tsx` | 10 | 2 `Pressable` (modal arka plan/stop-propagation) kasıtlı bırakıldı |
| `downloads.tsx` | 11 | İç içe kart+çöp butonu FocusButton'a çevrildi |
| `edit-playlist.tsx` | 7 | Zaten 3 FocusButton vardı |
| `hidden-manager.tsx` | 5 | |

## 5. Doğrulama (gerçek çıktılar)

- `yarn tsc --noEmit`: **PASS**.
- `node tools/denetle.js`: **TÜM DENETİMLER TEMİZ**, exit 0.
- `node tools/check-v18736-release.js`: **PASS** (yeni kapı, 7 ekranda ham TouchableOpacity = 0,
  P1 sabitleri + §5 tek-bağlantı, P2 kontrolleri + gecikme).
- ESLint (değiştirilen 9 dosya): **0 yeni hata**, 70 önceden var olan uyarı (array-type/exhaustive-deps).
- **Native değişiklik YOK** (tümü TS/TSX) → `assembleDebug` sözleşme gereği zorunlu değil; yine de PC
  DEV derlemesi kullanıcı isteğiyle yapıldı (aşağıya kaydedilecek).
- Satır-sonu notu: dönüştürme betikleri 7 dosyanın satır sonlarını CRLF'e çevirmişti; hepsi HEAD'deki
  LF'e geri normalize edildi → commit yalnız gerçek 74 satırlık değişikliği içerir.

## 6. Cihaz kabul senaryoları (YAPILMADI — telefon/TV bağlı değil)

1. **P1:** Erişilemeyen bir sunuculu kanal aç → 14 sn (canlı) sonra otomatik MPV/VLC denemesi; hepsi
   başarısızsa net hata ekranı. Ekran SONSUZ yüklenmemeli.
2. **P2:** Yavaş açılan kanalda 4 sn sonra "Kapat / Motoru Değiştir" kartı görünmeli; hızlı açılan
   kanalda hiç görünmemeli. TV'de D-pad ile butonlar seçilebilmeli (ilk odak "Kapat").
3. **T1:** 7 ekranın her birinde kumandayla gezerken odaklı öğe çerçeve+parlama ile GÖRÜNMELİ; ekran
   açılınca odak geri/ilk butona düşmeli; telefonda görünüm değişmemeli.

**Abartma yok:** P1 sonsuz takılmayı kırar ama 4346 ms'lik gerçek ANR'ın veya ağ/sunucu kaynaklı
yavaşlığın kökünü çözmez. T1 kod incelemesine dayanır; kullanıcının "TV arayüzü sıkıntılı" derken
kastettiği somut belirti henüz doğrulanmadı — bu düzeltme odak görünürlüğünü hedefler.

## 7. Derleme engeli: Chromecast bağımlılık kayması (bu kod değil)

v18.7.36 derlemesi (yerel DEV + ilk CI run 43298132000) ÇÖKTÜ:
`androidx.mediarouter:1.9.0-beta01 requires AGP 9.1.0` (proje AGP 8.11.0).

`dependencyInsight` kanıtı: `react-native-google-cast` cast framework'ü İKİ yerde dinamik `'+'` ile
çekiyor (kendi modülü + expo autolink'in `app/build.gradle`'a enjekte ettiği @generated satır). Google
yeni cast 23.0.0 yayınlayınca `'+'` ona çözülüyor → geçişli mediarouter 1.9.0-beta01 (AGP 9.1 ister).
`ext.castFrameworkVersion` sabitlemesi TEK BAŞINA yetmedi (app autolink'in `'+'`ı bağımsız; Gradle en
yükseği seçti). Bu, projenin KENDİ kodu değil — dış bağımlılık kayması. v18.7.35 (14.10) yalnız o an
`'+'` 22.3.1'e, mediarouter 1.8.0-beta01'e çözüldüğü için derlenmişti (ikisi de AGP 8.11 ile derlenir;
yalnız 1.9.0-beta01 AGP 9.1 ister).

**Çözüm (`plugins/withCastFrameworkPin.js`, commit `2f413f50`):** Kök build.gradle'a `allprojects
resolutionStrategy.force` yazıp 14.10'da başarıyla derlenen kombinasyonu kilitler: cast-framework
22.3.1 + cast 22.3.1 + mediarouter 1.8.0-beta01. Projenin `plugins/with*.js` kalıbıyla aynı;
package.json/yarn.lock'a dokunmaz. Doğrulama: temiz prebuild + dependencyInsight →
`mediarouter:1.8.0-beta01 (forced)`, 1.9.0-beta01 yok.

## 8. Gerçek teslim kaydı — Opus, 12-13.11.2026

- Commit `b3d611f4` (P1+P2+T1) + `2f413f50` (Chromecast sabitleme), dal
  `v18.7.36-rc1-player-prepwatchdog-tvfocus` origin'e push edildi. Ana dal değiştirilmedi.
- **PC DEV derlemesi:** `:app:assembleDebug` **BUILD SUCCESSFUL** (17dk41sn). APK
  `frontend/android/app/build/outputs/apk/debug/app-debug.apk` (482 MB),
  `com.gpt.kizilkan.player.dev` / versionCode **180736** / versionName **18.7.36-dev** / "KIZILKAN DEV".
- **İlk CI run 43298132000:** FAILURE (aynı mediarouter hatası — fix öncesi, beklenen).
- **Fix'li CI run [43305400801](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/43305400801):**
  **success**. Adımlar: APK derle · GitHub Release olustur · Calisma ozeti · Artifact olarak yukle —
  hepsi success.
- **Release build-160:** `KIZILKAN-PLAYER-ELITE-v18.7.36-build160.apk` (367 MB) + boyut raporu.
  Actions artifact da oluştu (172 MB sıkıştırılmış).
- **CİHAZ KABULÜ YAPILMADI:** telefon/TV bağlı değil. §6'daki 3 senaryo da bekliyor.
