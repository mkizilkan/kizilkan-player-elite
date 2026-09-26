# AI DEVİR — v18.0.0 RC1

**Taban:** `v17.10.4-rc1-last-channel-per-playlist` (34346966). **Dal:** `v18.0.0-rc1-focus-restore-center`.
Sürüm 18: Claude Code ile ortak çalışmanın başladığı sürüm (kullanıcı kararı).

## A. Odak / konum geri yükleme (kullanıcının onayladığı 8 madde)
| # | Sorun (kanıt) | Düzeltme |
|---|---|---|
| A | Afiş ızgarasında `scrollToIndex` ÖĞE sırası alıyordu; FlatList `numColumns>1` iken SATIR sayar (`FlatList._getItemCount`) | `useFocusScroll.centerIndex(index, {numColumns})` satıra çevirir. `PosterGrid` ve TV ana ekran ızgarası bunu kullanır |
| B | TV ana ekran ızgarasında `onScrollToIndexFailed` yoktu; tek deneme, hata yutuluyordu | Ortak kanca + yeniden deneme |
| C | Detay ekranından dönüşte geri yükleme istenmiyordu (yalnız PlayerHost istiyordu) | Kütüphane, TV ana ekran, arama, favoriler: detay açılırken hedef `remember`, ekran odağı dönünce `requestRestore(..., "detail-return")` |
| D | Oynatıcıda film zap'ı `library:vod:vodplay-<id>`, dizi zap'ı bölüm kimliği yazıyordu | `PlayerContext.navigationForItem`: `vodplay-` öneki atılır; dizide hedef dizinin kendisi kalır |
| E | İstek 220/420/500/300 ms'de siliniyordu; büyük listede satır geç mount olunca TV odağı kaçıyordu. Tahmin 64 px sabitti | İstek TV'de hedef **odak alınca** (`bind().rememberFocus` → `fulfillRestore`), telefonda ortalama bitince kapanır; üst sınır TV 4 sn / telefon 2,5 sn. Tahmin: listenin gerçek ölçülen ortalama satır yüksekliği |
| F | Sekme düğmeleri `hasTVPreferredFocus` sürekli açık → dönüşte odak yarışı | `segFocusHold`: geri yükleme gelince kilitlenir, kullanıcı sekmeye basınca açılır |
| G | Kategori paneli açılınca odak hep ilk satırda | Tercihli odak seçili satırda; liste o satırı ortalar |
| H | Yatay kategori şeridi / TV sol sütun seçili kategoriyi ortalamıyordu | Şerit: seçim, ölçüm ve geri dönüşte ortalanır. TV sol sütun: geri dönüşte ortalanır |
| + | Arama/favoriler oynatıcı dönüşü "player" kapsamına düşüyordu (hiç çalışmıyordu) | PlayerHost `search`/`favorites` köken eşlemesi |

**Telemetri:** `FOCUS_RESTORE_REQUEST` (scope, key, source: `player-close`/`detail-return`),
`FOCUS_RESTORE_RESULT` (outcome: `success` via focus / `cleared` via centered / `timeout` /
`superseded`, elapsedMs), `FOCUS_RESTORE_CENTER` (surface, index, row, columns, attempts, ok, reason),
`FOCUS_RESTORE_SKIP` (reason: `no-remembered-key`, `target-not-in-list`, `not-found-in-room`,
`custom-group-target-not-loaded`, `favorites-target-not-loaded`).

## B. Timeshift takılma telemetrisi (§9/1 — yalnız ölçüm, davranış değişmedi)
Native (`LiveTimeshiftManager.kt` `status()` yeni alanlar):
- Üretim: `ingestKbps`, `producedSegments`, `firstSegmentSec`, `segMin/Avg/MaxSec`.
- TS: `readGapMaxMs`, `readGapsOver1s` (sağlayıcıdan veri bekleme).
- TS PCR: `pcrSamples`, `pcrMediaSumSec`, `pcrWallSumSec`, `pcrMaxDriftSec`,
  `pcrDiscontinuities`. Segment süresi duvar saatiyle yazılıyor; PCR (video saati) ile
  karşılaştırma bu şüpheyi kanıtlar/çürütür.
- HLS: `hlsDownloadMaxMs`, `hlsSlowDownloads`, `playlistFetchFailures`.
- Yerel sunucu: `playlistRequests`, `segmentRequests`, `segmentNotFoundPruned`,
  `segmentNotFoundAhead`, `lastPlaylistRequestAgeMs`, `lastRequestedBehindSegments`,
  `lastSegmentAgeMs`.
- Durdurulan oturumun son istatistiği 8 kayıtlık `finishedStats`'ta tutulur. Durdurma
  bekletilmez (tek bağlantı kuralı).

JS (`PlayerHost.tsx`):
- `REBUFFER_START/END` olaylarına: `timeshiftMode`, `timeshiftPhase`, `timeshiftActive`,
  `positionSec`, `bufferAheadSec`, `offsetFromLiveSec`, `liveEdgeDistanceSec`,
  `startedDuringTimeshift`.
- `LIVE_TIMESHIFT_HEALTH`: 30 sn'de bir (`trigger: interval`) ve timeshift sırasında her
  takılmada (`trigger: stall`).
- `LIVE_TIMESHIFT_SESSION_SUMMARY`: kaydedici durunca; son native istatistik + takılmalar.
- `LIVE_SESSION_STALL_SUMMARY`: her canlı kanal oturumu (≥5 sn) için. Timeshift **açık
  ve kapalı** kıyası: `stallCount`, `stallMs`, `maxStallMs`, `stallsPerHour`, `timeshiftUsed`.

**Log okuma ipucu:** `pcrMediaSumSec` ile `pcrWallSumSec` belirgin farklıysa veya
`pcrMaxDriftSec` > 0,5 ise segment süreleri yanlış yazılıyor demektir.
`segmentNotFoundAhead` > 0 ise oynatıcı üretilmemiş segment istiyor (canlı uç çok dar).
`readGapsOver1s` yüksekse sağlayıcı kesik gönderiyor.

## C. Denetim kapıları (ileri uyum, §4)
`check-v17009/-v17012/-v17013/-v1710/-v1720` "v17" sabitlerine bağlıydı; artık etiket
`GPT ELITE v<package.json sürümü> RC1` ile **birebir** eşleşmeli (eskisinden sıkı).
`check-v17101` ve `check-v17003` yeni biçimi de kabul eder.

## D. Cihaz testi
1. Telefon + TV: Canlı'da uzun listede 300. kanala in, aç, çık → kanal ortada ve (TV'de) odaklı.
2. Film ve dizi: 100. afişe in, detay aç, geri → afiş ortada ve odaklı. Detaydan oynat, çık, geri → aynı.
3. Oynatıcıda film "sonraki"ye geç, çık → yeni film kartında. Dizide bölüm geç → dizi kartında.
4. Kategori panelini aç → seçili kategori ortada ve odaklı. Yatay şeritte uzak bir kategori seç → ortalanır.
5. TV ana ekranı (sütunlu): aynı testler + sol sütun seçili kategori ortada.
6. Arama ve favoriler: kanal/film aç, dön → öğe ortada.
7. Timeshift "Her zaman" ile 15–20 dk izle (takılma olsun), ardından "Kapalı" ile aynı
   kanalda 15–20 dk → Flight Recorder raporu gönder.

## Doğrulama (PC)
`yarn tsc --noEmit` temiz · `node tools/denetle.js` "TÜM DENETİMLER TEMİZ" ·
`:kizilkan-native-core:compileDebugKotlin` BUILD SUCCESSFUL.
Tam `assembleDebug` PC'de C++ bağlama aşamasında (`react-native-screens`, `expo-modules-core`,
`ld.lld: undefined symbol operator new / std::__ndk1...`) durdu: yerel NDK/libc++ ortam sorunu.
Bu sürümde C++ değişikliği yok. Nihai APK GitHub Actions'ta derlenir.
Derleme artıkları (`frontend/android/`, `modules/*/android/build/`, `frontend/.expo/`) izlenmiyor; commit'e EKLENMEMELİ.
