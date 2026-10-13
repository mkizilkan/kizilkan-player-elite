# KIZILKAN PLAYER ELITE v18.7.34 RC1 — Yapışık ekran öğeleri, ANR ölçümü, çıkış telemetrisi

Tarih: 13 Ekim 2026. Dal: `v18.7.34-rc1-ui-stale-anr-telemetry`.
Taban: `f00dfab4` (v18.7.33 teslim kaydı). Kullanıcı 4 maddenin tamamını ("hepsi") onayladı ve
commit/push/tetikleme/gerekirse yineleme yetkisini verdi.

## 1. Kaynak: gerçek cihaz kanıtı

Kullanıcı ekran görüntüsü + `kizilkan-diagnostics-2026-10-13T07-46-47-057Z.json` (8,9 MB,
`appVersion` 18.7.33, 6000 olay, `spanMinutes` 9560) gönderdi. Şikâyet: bomboş "Oynatma Listesi
Ekle" ekranında yapışık yazılar ve "o ekrandan uzun süre çıkamadım".

Ayrıca cihazın kendi çıkış geçmişinde (`dumpsys activity exit-info`) **gerçek bir sistem ANR'ı**:

```
2026-10-13 10:36:10  reason=6 (ANR)  importance=100 (ÖN PLAN)
"Input dispatching timed out ... MainActivity ... Waited 5003ms for MotionEvent"
pss=261MB rss=429MB   trace=/data/anr/anr_2026-10-13-10-36-03-259 (root gerekti, okunamadı)
```

## 2. Koddan doğrulanan kök nedenler

| Bulgu | Kanıt | Düzeltme |
|---|---|---|
| Kırmızı "Yarım kalan görüntü testlerini devam ettir" bandı HER ZAMAN görünüyor | `add-playlist.tsx:3052` ve `mag-bulk.tsx:714` — buton hiçbir koşula bağlı değil; hemen altındaki kardeşi `catalogRecoveryCount>0` ile korunuyor. Basınca "Kalan kayıtlı görüntü testi yok." diyor. | Kardeş butonun kalıbı birebir izlendi: `playbackRecoveryCount` durumu + `refreshPlaybackRecovery` yenileyici; bant yalnız sayı > 0 iken çizilir ve sayıyı gösterir. |
| "Emniyet TXT hazırlanıyor · DB: 0 sonuç" yapışık | `add-playlist.tsx:1533` — durum yalnız SET ediliyor; anlık görüntüde `safetyBackup` kalmayınca temizlenmiyor. Ayrıca tarama BİTMİŞ ama sonuç bildirilmemişse "hazırlanıyor" deniyordu — hiçbir şey hazırlanmıyordu (§2.2 yanıltma). | Kesin sonuç (ok true/false) hep gösterilir; belirsiz durum YALNIZ tarama sürerken "hazırlanıyor" olur; terminal+belirsizde metin temizlenir ve `BULK_TXT_EXPORT_INDETERMINATE` bir kez yazılır. `mag-bulk.tsx`te yeni tarama başında eski metin temizlenir. |
| `autoSummary.anrOnPlan: 265` — tamamen yanıltıcı | Kayıtların lag'leri 77 sn ile **43 DAKİKA** arası; yığın tepelerinde uygulama kodu değil `MessageQueue.nativePollOnce`, `OplusTheiaUIMonitor`, `LooperMessageSuperviser`, hatta 11 kayıtta bekçinin KENDİ kalp atışı var. Gerçek ön plan bloğu TEK: 4346 ms. | Aşağıdaki §3. |
| "Ekrandan çıkamıyorum" | Uçuş kaydında çıkış ÇALIŞMIŞ görünüyor (`ADD_PLAYLIST_FORCE_EXIT` + `ROUTE_CHANGED`, 07:34:14). **KÖK NEDEN KANITLANMADI.** | Kör düzeltme YOK. §4'teki telemetri eklendi. |

## 3. ANR ölçümü: "ana thread bloke" ile "süreç donduruldu" ayrımı

v17.7.0 `uptimeMillis()`e geçerek **derin uyku** yanlış pozitifini çözmüştü (`sleptMs`). Ama OEM
**süreç dondurması** (OnePlus `OplusHansManager` / cgroup freezer) farklıdır: cihaz uyanıktır,
`uptimeMillis` ilerler, `sleptMs` 0 kalır — yalnız uygulamanın thread'leri koşmaz. Bekçi bunu
kilitlenme sanıyordu; `_fg` bayrağı da dondurma öncesinden kalma olduğu için kayıt "ön plan"
görünüyordu.

**Çözüm (uydurma süre eşiği YOK):** Bekçi ana thread'den BAĞIMSIZ bir thread'de koşar. Süreç
dondurulduysa o thread de tikleyemez; ana thread gerçekten bloke ise normal tikler. Ölçüt iki
thread'in göreli gecikmesidir.

- `NativeBlackBox.kt`: `lastWatchdogTickUptime` alanı; her tikte `watchdogLateMs` hesaplanır;
  `processFrozen` kararı yüke yazılır. Dondurulmuş kayıt artık `severity=warn`, `errorClass=PROCESS_FROZEN`,
  `critical=false` ve **kritik dosyaya yazılmaz** — cihazda 258 kaydın 257'si bu türdendi ve gerçek
  kayıtları dışarı itiyordu. Kayıt SİLİNMEZ, yalnız doğru etiketlenir.
- `diagnostics.ts`: `anrLooksFrozen()` önce native `processFrozen` ölçümünü kullanır; eski loglarda
  (18.7.33 ve öncesi) yığın imzasına düşer. Yeni sayaçlar: `anrDonmusSurec_yanlisPozitif`,
  `anrToplamKayit` ve **`anrOlcumGuvenilir`**.

`anrOlcumGuvenilir` neden gerekli: geri düşüş eksik sayar. Kullanıcının logunda 258 kaydın
**185'ini** yakalar, 73'ü hâlâ "ön plan" görünür. Bayrak okuyucuya sayının tahmini olduğunu söyler.
Bu sayı 18.7.34'ten sonra toplanan loglarda `true` olacaktır.

> Dürüstlük notu: bu tur boyunca Opus iki kez kendi yorumunu düzeltti — önce `anrOnPlan:265`'i
> "gerçek" sanıp kullanıcıya öyle söyledi, sonra `BULK_IMPORT_RESUME_OFFERED remaining:0` kaydını
> hata sandı (kod zaten kendini temizliyordu). İkisi de kullanıcıya açıkça düzeltildi.

## 4. Çıkış telemetrisi (düzeltme değil, kanıt toplama)

Kodda somut bir şüpheli var: `forceExit` ilk satırda `if (leavingRef.current) return;` ile çıkar.
`leavingRef`, sahiplik satırında (profil değişince) sessizce `true` olursa geri tuşu ve "Zorla çık"
**hiçbir şey yapmaz** — kullanıcı için ekran kilitlenmiş görünür. Bu KANITLANMADI, ölçülüyor:

- `markLeaving(reason)` — bayrağın ne zaman ve neden kalktığı işaretlenir (`profile-changed`, `unmount`, tetikleyici adı).
- `ADD_PLAYLIST_EXIT_IGNORED` — yok sayılan her çıkış denemesi: `trigger`, `leavingReason`,
  `leavingSinceMs`, ve o an meşgul olanlar (`loading`, `bulkAdding`, `bulkContentTesting`,
  `playbackTests`, `archiveRestoring`).
- `ADD_PLAYLIST_FORCE_EXIT` artık `trigger` + `teardownMs` + `busy` taşır.
- Tetikleyici etiketleri: `hardware-back`, `button`, `close-button`, `modal-exit`,
  `modal-request-close`, `loading-modal-close`.

Düzeltme bir sonraki cihaz logundan SONRA yapılacak.

## 5. Dosya bazında değişiklik

| Dosya | Değişiklik |
|---|---|
| `frontend/app/add-playlist.tsx` | `playbackRecoveryCount` + `refreshPlaybackRecovery`; bant koşullandı; emniyet TXT durumu temizleme/terminal mantığı + `safetyIndeterminateRef`; `markLeaving`, `leavingSinceRef`, `leavingReasonRef`; `forceExit(trigger)` + 5 çağrı yeri etiketlendi |
| `frontend/app/mag-bulk.tsx` | Aynı bant düzeltmesi (`mac-frame`); tarama başında `setSafetyStatus('')` |
| `frontend/modules/.../NativeBlackBox.kt` | `lastWatchdogTickUptime`, `watchdogLateMs`, `processFrozen`; donmuş kayıt warn/non-critical ve kritik dosyaya yazılmaz; checkpoint metni ayrıştırıldı |
| `frontend/src/utils/diagnostics.ts` | `anrLooksFrozen()`; üç sayaç + `anrToplamKayit` + `anrOlcumGuvenilir` |
| `tools/check-v18734-release.js` | **YENİ** kapı (26 kontrol) |
| `tools/denetle.js` | Kapı kaydı |
| `frontend/app.json`, `frontend/package.json` | Beş sürüm alanı → 18.7.34 / 180734 |

## 6. Doğrulama (gerçek çıktılar)

- `yarn tsc --noEmit`: **PASS** (18,08 sn).
- `node tools/denetle.js`: **TÜM DENETİMLER TEMİZ**, exit 0.
- `node tools/check-v18734-release.js`: **PASS** (26 kontrol).
- **`tools/build-dev.ps1 -SkipChecks` → `:app:assembleDebug` BUILD SUCCESSFUL, 5 dk 44 sn**,
  475 görev (**78 çalıştırıldı** — Kotlin gerçekten derlendi), `e:`/`error:`/`FAILED` yok.
  Çıktı: `artifacts/KIZILKAN-18.7.34-RC1-DEV.apk`.
- `git diff frontend/package.json` prebuild sonrası **yalnız sürüm satırı** (§7 tuzağı temiz).
- Sınıflandırıcı gerçek kullanıcı logu üzerinde doğrulandı: 258 kaydın **185'i** donmuş süreç,
  73'ü ön plan görünüyor, `anrOlcumGuvenilir: false`. Belgelenen sayılarla birebir uyuştu.

### Kırılan ve ileri uyumlu hâle getirilen kapı

`check-v16131-native-blackbox-kotlin.js` `stage = "main-thread-stall"` ve
`errorClass = "MAIN_THREAD_STALL"` metinlerini BİREBİR arıyordu; bu dört alan artık koşullu.
Kapının amacı isimli parametre imzasının korunmasıdır (eski hata konumsal çağrıydı), değerlerin
sabit metin olması değil. Kapı **gevşetilmedi**: `stage`, `errorClass`, `severity` ve `critical`
alanlarının hem VARLIĞI hem de stall dalındaki doğru değeri (sırasıyla `main-thread-stall`,
`MAIN_THREAD_STALL`, `critical`, `true`) regex ile aranır hâle getirildi.

## 7. Cihaz kabul senaryoları

1. **Temiz ekran:** Hiç tarama yapılmamış profille "Oynatma Listesi Ekle" aç → kırmızı bant
   GÖRÜNMEMELİ, "Emniyet TXT…" yazısı OLMAMALI.
2. **Gerçek yarım test:** Görüntü testi başlat, yarıda bırak, ekranı kapat/aç → bant "Kalan N
   görüntü testini devam ettir" ile görünmeli; testler bitince kendiliğinden KAYBOLMALI.
3. **Tarama sırasında:** Emniyet TXT yazılırken "hazırlanıyor" görünmeli; tarama bitince ya
   "TXT doğrulandı…" ya da hata metni kalmalı — "hazırlanıyor" ASILI KALMAMALI.
4. **MAG çoklu:** İkinci bir tarama başlat → önceki turun emniyet TXT metni sızmamalı.
5. **ANR ölçümü:** Uygulamayı arka plana al, uzun süre bekle, geri dön → yeni raporda
   `anrDonmusSurec_yanlisPozitif` artmalı, `anrOnPlan` ARTMAMALI, `anrOlcumGuvenilir: true` olmalı.
6. **Çıkış:** Ekrandan çıkamama tekrarlanırsa yeni rapordaki `ADD_PLAYLIST_EXIT_IGNORED` kayıtları
   (özellikle `leavingReason` ve `leavingSinceMs`) kök nedeni gösterecek.

## 8. Sınırlar — abartılmayacak

- Gerçek ön plan donmasının (4346 ms, metin ölçümü yığını) kök nedeni **bu turda çözülmedi**;
  yalnız ölçüm güvenilir hâle getirildi. "ANR düzeltildi" denemez.
- "Ekrandan çıkamıyorum" sorunu **düzeltilmedi**, ölçüldü.
- Room veritabanı 552 MB / `mediaCount` 489.706. Bu turda dokunulmadı.
- OEM süreç dondurmasını engellemiyoruz; yalnız doğru etiketliyoruz.

## 9. Teslim kaydı — Opus, 13.10.2026

- Commit **`29994eea`**, dal `v18.7.34-rc1-ui-stale-anr-telemetry` origin'e push edildi.
  Ana dal değiştirilmedi.
- Manuel normal build [38371114946](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/38371114946)
  — **success**. `build_type=release`, `make_release=true`, `new_architecture=true`.
- Release **build-157**: `KIZILKAN-PLAYER-ELITE-v18.7.34-build157.apk` (**367 MB**) + boyut raporu.
- **Actions artifact da oluştu** (172 MB sıkıştırılmış) — v18.7.34 öncesi eklenen CI görünürlük
  düzeltmesi (`0707d19d`) ikinci build'de de çalıştı. Adımlar: "GitHub Release olustur" success ·
  "Calisma ozeti (APK nerede?)" success · "Artifact olarak yukle" success.
- **CİHAZA KURULMADI:** telefon bağlı değildi. §7'deki 6 kabul senaryosunun hiçbiri yapılmadı.
  Derlemenin geçmesi çalıştığı anlamına gelmez (CLAUDE.md §7).

### Sıradaki oturumda yapılacak

1. Telefona build-157'yi kur (ya da telefondan `releases/latest`), açılış kontrolü + logcat.
2. §7'deki 6 senaryoyu geç; özellikle **temiz profille boş ekran** (bant ve TXT yazısı
   GÖRÜNMEMELİ) ve **arka plan/dönüş sonrası** `anrOlcumGuvenilir: true` + `anrOnPlan` artmaması.
3. Yeni uçuş kaydında `ADD_PLAYLIST_EXIT_IGNORED` varsa "çıkamıyorum" kök nedeni kanıtlanmış olur;
   düzeltme ancak o zaman yapılır.
