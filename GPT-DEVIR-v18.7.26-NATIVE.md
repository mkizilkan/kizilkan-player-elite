# GPT DEVİR — v18.7.26 (NATIVE: Tarama sonuç kaybı + emniyet sibobu)

> **Bu dosya GPT-5.1 içindir.** Önce `CLAUDE.md`'yi (özellikle §2 çalışma sözleşmesi, §3 doğrulama, §4 sürüm/dal, §5 mimari, §7 tuzaklar, §8 log) oku. Bu senin tek görevin: **D + E-Xtream (native)**. Opus (Claude) paralelde v18.7.25'te **B+C+A+E-MAG (TS)** yapıyor — oraya DOKUNMA.
> **Taban:** v18.7.25 (Opus push edince `v18.7.25-rc1-...`). v18.7.25 henüz yoksa `v18.7.24-rc1-bulk-content-visibility`'den dallan; Opus push edince rebase/merge et. **Yeni dal:** `v18.7.26-rc1-scan-journal-recovery-safety`.
> İletişim dili Türkçe. Kullanıcı: Mustafa. Cihaz: OnePlus 7 Pro `c3a4097e` (DEV paket `com.gpt.kizilkan.player.dev`).

---

## 0. NEDEN (kanıtlı kök neden — log `kizilkan-diagnostics-2026-10-07`)

Kullanıcı galaplaytv.shop Xtream combo taraması yaptı: **26.176 adres denendi, 7.340 bulundu, ama listede yalnız 582 çıktı.** ~6.758 bulunan hesap seçim listesine HİÇ gelmedi.

**Kanıt (koddan):**
- Native `persistentFound` (snapshot'ta `found`) = journal'daki benzersiz (hesap\|panel\|kod\|host) TOPLAM = 7.340. `PanelScanService.kt:216-217` (`if(added) persistentFound.incrementAndGet()`), `:490` (`obj.put("found", persistentFound.get())`).
- AMA snapshot'ın `matches` dizisi **yalnız SON 200** sonucu serialize ediyor: `PanelScanService.kt:799-801` (`start=(matches.size-200)`), `:1137` (`if(matches.size>200) matches.removeAt(0)`).
- JS'in TEK erişimi `getSnapshot()` (`modules/panel-scan/index.ts:135`). **Tam journal'a köprü YOK.** JS kayan 200-pencereyi poll+merge ile 582'ye ulaşabildi; kalanı journal'da kaldı.
- Journal tam yükleme yalnız resume/recovery yolunda var (`PanelScanService.kt:725`, `:1029`), normal tamamlanmada değil.
- **MAC (mag-bulk) tarafında bu kayıp YOK** (saf JS, tüm sonuç `results` state'inde) — ama MAC'in persistence'ı hiç yok (app ölürse uçar). MAC'in emniyet sibobu Opus'ta (E-MAG, JS).

**Kurtarma durumu:** O taramanın 7.340'ı GERİ GETİRİLEMEZ — journal `payload_enc` **AES-GCM + AndroidKeyStore** (cihaza bağlı, off-device çözülemez: `ScanJournalStore.kt:58-71`) ve sonraki tarama journal'ı sildi. **Bu görev gelecekteki taramalar için.**

---

## 1. GÖREV D — Tam journal'ı JS'e aç (7.340'ın hepsi seçilebilsin)

### D1 · ScanJournalStore'a sayfalı okuyucu (zaten temel var)
`ScanJournalStore.kt`'de `results(runId, limit)` var (`:154`, `SELECT payload_enc ... ORDER BY id LIMIT ?`, decrypt eder) ve `:179` civarında id-cursor okuyucu (`WHERE run_id=? AND id>? ORDER BY id LIMIT 200`) ZATEN var. Bunu temel al.
- **Ekle:** `@Synchronized fun resultsPaged(runId: String, afterId: Long, limit: Int): JSONObject` →
  `SELECT id, payload_enc FROM scan_result WHERE run_id=? AND id>? ORDER BY id LIMIT ?`; her satırı `dec()` ile çöz, `JSONObject.optString`→`JSONObject(decrypted)` olarak diziye koy; dönüş `{ "rows": JSONArray, "lastId": Long, "count": Int }`. (decrypt UYGULAMA İÇİNDE olur — Keystore anahtarı cihazda.)

### D2 · PanelScanModule köprüsü
`PanelScanModule.kt` (kalıp: `AsyncFunction("ad") { args -> ... }`, bkz. `:39-69`). Ekle:
```kotlin
AsyncFunction("getResultsPage") { runId: String, afterId: Double, limit: Int ->
  ScanJournalStore.get(appContext.reactContext!!.applicationContext)
    .resultsPaged(runId, afterId.toLong(), limit).toString()
}
AsyncFunction("getResultCount") { runId: String ->
  ScanJournalStore.get(appContext.reactContext!!.applicationContext).resultCount(runId)
}
```
(`resultCount` zaten var: `ScanJournalStore.kt:165`. Context erişimi için modüldeki mevcut `appContext` kalıbını kullan — diğer Function'lar nasıl context alıyorsa aynen.)

### D3 · index.ts köprüsü
`modules/panel-scan/index.ts` — mevcut `getSnapshot` (`:135`) kalıbıyla:
```ts
getResultsPage: async (runId: string, afterId: number, limit: number): Promise<{rows:any[];lastId:number;count:number}> => {
  if (!native) return { rows: [], lastId: afterId, count: 0 };
  try { return JSON.parse(await native.getResultsPage(runId, afterId, limit) || "{}"); }
  catch { return { rows: [], lastId: afterId, count: 0 }; }
},
getResultCount: async (runId: string): Promise<number> => { if (!native) return 0; try { return await native.getResultCount(runId); } catch { return 0; } },
```
Tip arabirimine (`NativeSnapshot` yakını) `getResultsPage`/`getResultCount` imzalarını ekle.

### D4 · add-playlist.tsx — tarama BİTİNCE tam çek
`add-playlist.tsx` içindeki snapshot senkron döngüsünde tarama terminal olunca (`scanTerminal = ["COMPLETED","CANCELLED","FAILED"]`, ~`:1432`) **bir kez** (`fullPulledRef` guard) tüm journal'ı çek:
- `const total = await PanelScan.getResultCount(runId)`; eğer `total > bulkCandidates.length` ise tam çekme gerekir.
- Döngü: `let afterId=0; while(true){ const p=await PanelScan.getResultsPage(runId, afterId, 500); if(!p.rows.length) break; afterId=p.lastId; const mapped=p.rows.map(hit → BulkResolvedCandidate); mergeBulkCandidates(mapped,false); }`
- **hit → BulkResolvedCandidate eşlemesi** (mevcut kalıp `add-playlist.tsx:1487`): `{ key: bulkCandidateKey(hit.sourceRow??hit.accountIndex, hit.username, hit.code, hit.panelName, hit.server), sourceRow: hit.sourceRow??hit.accountIndex, name: hit.name||hit.panelName, username: hit.username, password: hit.password, panelName: hit.panelName, code: hit.code, server: hit.server, login: hit.login, sources: hit.sources, validatedHosts:[hit.server], direct: !!hit.server || hit.panelName==="Doğrudan DNS" }`. (hit alanları `PanelScanService.kt:1127-1134`'te: accountIndex, sourceRow, username, password, name, panelName, code, server, sources, login.)
- Telemetri: `recordDiagnostic("scan","BULK_FULL_JOURNAL_PULL",{ total, surfaced: bulkCandidates.length })`.
- **Binder ~1 MB sınırı (§5):** sayfa boyutu **≤ 500** satır tut (string dönüş). Gerekirse 300'e indir.

**D sonucu:** tarama bitince 7.340'ın hepsi `bulkCandidates`'e girer → seçilebilir/TXT olur.

---

## 2. GÖREV E-Xtream — EMNİYET SİBOBU (bulunanı anında düz-metne yaz)

**Fikir (kullanıcı):** bulunan HER hesap, UI'a ulaşsın ulaşmasın, anında **kalıcı düz-metne** yazılsın → app ölse/pencere kaybetse bile hiçbir hesap kaybolmaz. (D = UI'da görünür; E = diske garanti. İkisi tamamlayıcı.)

### Tek nokta: `persistScanResult` (`PanelScanService.kt:215`)
Bu fonksiyon TÜM bulunan sonuçların tek geçiş noktası (5 çağrı: `:753, :1136, :1477, :1731, :1830`). Buraya **tek** ekleme tüm tarama yollarını kapsar.
- `addResult` başarılı olunca (`added==true`), `hit`'i düz-metin bir satır olarak **görünür klasöre ekle**:
  `İndirilenler/KIZILKAN PLAYER ELITE/Canlı Tarama Yedeği/<runId>.txt`
- Satır biçimi (kullanıcı TXT arşiviyle uyumlu, re-import edilebilir sade biçim):
  `server|username|password|exp_date|panel|status` (hit.login.user_info'dan exp/status; yoksa boş).
- **Android 10+ MediaStore** ile yaz (izin gerekmez). panel-scan modülü halen public dosya yazıyor mu kontrol et; yoksa `MediaStore.Downloads` ContentResolver ile **append** (aynı runId dosyasına ekle). Alternatif sade yol: `context.getExternalFilesDir(null)/scan-backup/<runId>.txt` (izinsiz, ama daha az görünür) — **tercih: MediaStore Downloads görünür klasör.**
- **Performans:** her satırda dosya açıp kapama pahalı (7.340×). Çözüm: `BufferedWriter`'ı runId başına aç, periyodik `flush()` (ör. her 50 satırda veya 1 sn), tarama bitince kapat. Yarış için `synchronized`.
- **Güvenlik:** düz-metin kimlik bilgisi = kullanıcının KENDİ hesapları, KENDİ cihazı, kullanıcı AÇIKÇA istedi (mevcut TXT arşivi zaten böyle yazıyor: `writePublicTextFile`). Loglama Yok, yalnız dosya.
- Telemetri: tarama bitişinde `recordDiagnostic` yerine native snapshot'a `safetyBackupPath` + `safetyBackupCount` alanı ekleyip JS'e taşı (opsiyonel), VEYA basitçe `BULK_SAFETY_BACKUP_WRITTEN` olayı JS tarafında dosya yolu bilinince.

**Not — Room:** panel-scan modülü Room'a (kizilkan-native-core) sahip DEĞİL; çapraz-modül Room yazımı karmaşık. **E-Xtream = yalnız düz-metin dosya.** (Room'lu sibop MAC tarafında Opus'ta, JS'in Room erişimi var.)

---

## 3. SÜRÜM + GATE + DOĞRULAMA

### Sürüm (5 alan, §4) → 18.7.26 / 180726
`app.json`: version `18.7.26`, ios.buildNumber `18.7.26`, android.versionCode `180726`, extra.kizilkanReleaseLabel `GPT ELITE v18.7.26 RC1`; `package.json`: `18.7.26`.

### Gate `tools/check-v18726-release.js` (ve `tools/denetle.js`'e kaydet)
Kontrol et (regex): sürüm 5 alanı tutarlı; `resultsPaged` (`ScanJournalStore.kt`); `getResultsPage`+`getResultCount` (`PanelScanModule.kt` ve `index.ts`); `BULK_FULL_JOURNAL_PULL` + `getResultsPage(` (`add-playlist.tsx`); `persistScanResult` içinde emniyet yedeği ekleme (ör. yeni fonksiyon adı `appendSafetyBackup` / `Canlı Tarama Yedeği`). Kalıp örneği `tools/check-v18724-release.js`.

### Doğrulama (§3)
```
cd frontend
yarn tsc --noEmit            # temiz olmalı
cd ..
node tools/denetle.js        # TÜM TEMİZ (yeni gate PASS)
```
**NATIVE değişti → derleme ZORUNLU:**
```powershell
$env:ANDROID_HOME="C:\Android\Sdk"
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
cd C:\Projeler\kizilkan-player-elite\frontend
npx expo prebuild --platform android --clean --no-install
cd android
.\gradlew.bat --stop
.\gradlew.bat assembleDebug          # ~14 dk; BUILD SUCCESSFUL olmalı
```
- **PowerShell'de derle** (Git Bash'te Gradle "Unable to establish loopback connection" verebilir — §7).
- Prebuild sonrası `git diff frontend/package.json` → yalnız sürüm kalmalı (prebuild `android`/`ios` betiklerini `expo run:*` yapar, geri al — §7).
- DEV APK: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Kur: `adb install -r <yol>` (cihaz `c3a4097e`).
- **Cihaz testi (§7 "derleme geçti ≠ çalışıyor"):** büyük bir combo tara → "Bulunan N" ile liste sayısı **eşit olmalı** (artık ~582'de takılmamalı); `İndirilenler/KIZILKAN PLAYER ELITE/Canlı Tarama Yedeği/<runId>.txt` dosyası oluşmalı ve bulunan sayısı kadar satır içermeli. `adb logcat | grep -i BULK_FULL_JOURNAL` ile doğrula.

---

## 4. TUZAKLAR (§7 — native ilgili)
- **SDK yolundaki BOŞLUK** (`C:\Users\KIZILKAN YOGA\...`) C++ bağlama hatası verir → `C:\Android\Sdk` junction kullan (ZATEN kurulu). SDK yolu değişirse `node_modules/*/android/.cxx` sil.
- **`stalker.ts`'e üst düzey `@/modules/panel-scan` importu EKLEME** (VM gate'lerini kırar; tembel `await import`). Bu görevde stalker.ts'e dokunmuyorsun zaten.
- **`FONT.size.md` YOK** (`base` kullan) — UI'a dokunursan.
- Expo modül context erişimi: panel-scan'de mevcut Function'ların context aldığı kalıbı aynen kullan (uydurma).
- **Binder ~1 MB** (§5): getResultsPage sayfa ≤ 500.

## 5. DOKUNMA (Opus'un v18.7.25 TS işi)
- `add-playlist.tsx`: görüntü testi (`testBulkContent`/`bulkContentTest`), paralellik UI (comboParallelText/requestedCustom), TXT UX. **Sadece D4 paging bloğunu + hit-eşlemesini ekle**, bunlara dokunma.
- `mag-bulk.tsx`: E-MAG (MAC sibobu) Opus'ta — dokunma.

## 6. DEVİR DİSİPLİNİ (§ "Her güncellemede zorunlu")
Bitince: `AI-DEVIR-v18.7.26.md` yaz; `CLAUDE.md` §9'u güncelle (v18.7.26 aktif); `GPT-OPUS-GUNCELLEME-DEVRI.md` §0'a ekle (tarih/dal/commit/dosya-satır/bulgu/gerçek test sonuçları/Actions run/APK). Commit sonu: `Co-Authored-By: ...` (kendi imzan). Push → Actions "GPT KIZILKAN APK Derle" → dal `v18.7.26-rc1-...` → tip `release`.

---

## 7. ÖZET AKIŞ
1. Dal aç (taban v18.7.25). Sürümü 180726'ya yükselt.
2. D1 `resultsPaged` (ScanJournalStore) → D2 köprü (PanelScanModule) → D3 index.ts → D4 add-playlist paging+eşleme.
3. E-Xtream: `persistScanResult`'a buffered düz-metin append (`Canlı Tarama Yedeği/<runId>.txt`).
4. Gate `check-v18726` + denetle.js kaydı.
5. tsc temiz · denetle TEMİZ · **assembleDebug BUILD SUCCESSFUL** · cihazda "Bulunan=liste" + yedek dosyası doğrula.
6. Devir dosyaları + commit + push + Actions.

**Takılırsan / native hata ayıklama derinleşirse:** Opus'un haftalık tokeni **09.10 12:00**'de yenileniyor; kalanı birlikte bitiririz. Eksik bırakırsan hangi adımda kaldığını `AI-DEVIR-v18.7.26.md`'ye yaz.
