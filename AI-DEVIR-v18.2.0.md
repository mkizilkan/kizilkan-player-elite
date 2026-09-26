# AI DEVİR — v18.2.0 RC1

**Taban:** `v18.1.0-rc1-local-media` (af739ddd). **Dal:** `v18.2.0-rc1-epg-combo-cast-dev`.
Kullanıcı kararı: v18.1.0 incelemesindeki tüm hatalar + öneriler, olabildiğince az derlemede; gruplama Claude'a bırakıldı.

## A. Hata düzeltmeleri (kanıtlı)
| # | Sorun | Düzeltme |
|---|---|---|
| A1 | TV ana ekran EPG sütunu kanal listesiyle kaymıyordu → yanlış satır | EPG listesi kanal listesinin ofsetine kilitli (`onScroll` → `scrollToOffset`), aynı satır yüksekliği (`getItemLayout`), hiza boşluğu listenin dışında |
| A2 | EPG yalnız ilk 60 (TV) / 16 (kütüphane) kanal | Görünen satırdan itibaren pencere (TV: -10/+50, kütüphane: 16); yüklüler atlanır, "şimdi" bitmişler tazelenir, haritaya BİRLEŞTİRİLİR |
| A3 | Combo'da `http://…/get.php?username=&password=` satırları atlanıyordu (JS + Kotlin) | `fromAccountUrl` / `fromAccountUrlV182`: link + yanındaki ad okunur |
| A4 | `sunucu\|kullanıcı\|şifre` sırası yanlış eşleniyordu | İlk sütun KESİN sunucuysa (http(s)://, host:port, IPv4) ve son sütun sunucu değilse bu sıra kabul edilir; "ali.veli" gibi kullanıcı adları etkilenmez |
| A5 | Birincil DNS ölüyse her açılışta önce ona gidiliyordu | Son çalışan DNS doğrulanmış listedeyse ilk sıraya; birincil yine sırada (aday kaybı yok) |
| A8 | Arşiv regex'inde `\s` → "s" (boşluksuz satırda "secret" → "ecret") | `\\s` |
| A9 | v18.1.0 öncesi yerel dosya ilerlemeleri "Devam Et"te kırık | Açılışta tek seferlik TAŞIMA: yerel depoya aktarılır, kütüphaneden çıkarılır (`LOCAL_PROGRESS_MIGRATED`) |
| + | TV sol sütun: Room modunda "TÜMÜ" 250'de, favori sayısı sayfa kadar, çok listede liste sayısı 0 | TÜMÜ Room özetinden; favori/son izlenen sayısı `getItemsByIds`; liste düğümü `channelsCount` |

## B. Geliştirmeler
| # | Özellik |
|---|---|
| B1 | TV EPG sütunu: seçili kanalda ilerleme çubuğu + "X dk kaldı · Sonra: …" |
| B2 | TV sol sütun "🕘 SON İZLENENLER" (yalnız canlı, en yeni üstte; Room + legacy). `recent` ref ile okunur (oynatıcı dönüşünde liste sıfırlanmaz) |
| B3 | **Chromecast yayın köprüsü** (`CastBridgeServer.kt`): yerel dosya (Range), başlık isteyen yayın (HLS listesi yeniden yazılır), TS canlı → timeshift kaydedicisi → HLS. 128-bit erişim anahtarı, köken beyaz listesi, CORS. Canlı köprüde telefon motoru + telefon kaydedicisi kaynağı bırakır (`castDetachLocal`, tek bağlantı). Oturum biter/30 sn yükleme olmazsa yerel kaynak geri bağlanır |
| B4 | Chromecast'te telefonda seçili ses/altyazı dili alıcıda seçilir (`setActiveTrackIds`); yerel videonun dış altyazısı WebVTT izi olarak gider |
| B5 | Liste düzenle → **Sunucu adresleri (yedek DNS)**: ekle/sil/★ birincil yap/tek tek veya toplu TEST (gerçek Xtream girişi, ms). "Doğrudan DNS" hesaplarında da (`backupHosts`). Liste yenileme birincil düşünce yedeklere geçer (`REFRESH_BACKUP_DNS_OK/FAILED`) |
| B6 | Combo sonuçları: Sırala (bulunma / bitiş en geç / bağlantı en çok), "Aktifleri Seç (n)" |
| B7 | Yerel video yanındaki `.srt/.vtt` otomatik bağlanır (tam ad, `.tr` öncelikli). Motor bağımsız altyazı katmanı (Media3 konumu doğrudan okunur); UTF-8 / Windows-1254 otomatik; "Dış altyazı: Açık/Kapalı" düğmesi; listede "CC" etiketi |
| B8 | Son 7 günde eklenen film/diziye "YENİ" rozeti (Xtream `added`, Stalker tarih). Detay ekranındaki bulanık afiş ZATEN VARDI (tekrar yapılmadı) |

## C. Geliştirme altyapısı
- **Yan yana DEV uygulaması** (`plugins/withDevVariant.js`): debug = `com.gpt.kizilkan.player.dev`, ad "KIZILKAN DEV". Asıl uygulamanın YANINA kurulur, verisi ayrıdır.
- **Yerel release imzası** (`plugins/withLocalReleaseSigning.js`): `%USERPROFILE%\.gradle\gradle.properties` içinde `KIZILKAN_RELEASE_*` varsa `assembleRelease` aynı anahtarla imzalar → telefona güncelleme olarak kurulur. CI etkilenmez.
- **`tools/imza-bul.ps1`**: iki anahtardan hangisinin güncel olduğunu bulur (şifreyi gizli sorar).

## D. Telemetri (yeni)
`CAST_BRIDGE_ROUTE` (mode file/proxy/live-hls, ok, elapsedMs), `CAST_BRIDGE_FAILED`, `CAST_TRACKS_APPLIED`, `CAST_SESSION_ENDED_HOST`,
`CAST_BRIDGE_DETACH_TIMEOUT`, `EXT_SUBTITLE_LOADED/FAILED` (encoding), `DNS_MANAGER_TEST`, `REFRESH_BACKUP_DNS_OK/FAILED`,
`LOCAL_PROGRESS_MIGRATED`, `LOCAL_MEDIA_LIST` (+ subtitles, subtitleMatched).

## E. Denetim kapıları
`checkplayercore.js`: EPG penceresi 16 ile sınırlı kaldığı sürece kayan pencere de kabul (`epgWindowStart + 16`).
`test-v1730-functional.js`: `hostFailover` sahte modülü + YENİ test: birincil DNS düşünce yenileme yedeğe geçer / hepsi ölüyse başarısız.

## F. Cihaz testi
1. TV ana ekran: canlıda 100. kanala in → EPG sütunu aynı satırlarda, programlar dolu; seçili kanalda kalan dk.
2. Sol sütun: SON İZLENENLER (son açılan en üstte), FAVORİLER ve TÜMÜ sayıları doğru.
3. Kütüphane (telefon): uzun listede aşağıda "ŞİMDİ" bilgisi.
4. Combo dosyası: link satırları + `sunucu|kullanıcı|şifre` satırları bulunuyor mu. Sonuçlarda Sırala / Aktifleri Seç.
5. Liste düzenle → Sunucu adresleri: Tümünü test et; yedek ekle; ★ birincil yap + Kaydet.
6. Chromecast: (a) yerel mp4 + .srt, (b) M3U/MAG .ts canlı kanal, (c) User-Agent isteyen liste. Telefonla Chromecast aynı Wi-Fi'da olmalı. Kapatınca telefon yayını geri gelmeli.
7. Yerel video + aynı adlı .srt: altyazı görünüyor, Türkçe karakterler doğru, "Dış altyazı" düğmesi.
8. "YENİ" rozeti (Xtream'de yeni eklenmiş film).
9. DEV uygulaması asıl uygulamanın yanına kuruluyor mu (aşağıdaki akış).

## G. DEV akışı (JS değişikliği anında)
```
cd C:\Projeler\kizilkan-player-elite\frontend
adb install -r android\app\build\outputs\apk\debug\app-debug.apk   (bir kez; "KIZILKAN DEV")
adb reverse tcp:8081 tcp:8081      (USB) — Wi-Fi/TV box: uygulamada geliştirici menüsü → Debug server host = <PC_IP>:8081
npx expo start
```
TypeScript değişikliği → cihazda saniyeler içinde. Kotlin değişikliği → `gradlew assembleDebug` + yeniden kur.

## Doğrulama (PC)
`yarn tsc --noEmit` temiz · `node tools/denetle.js` TÜM DENETİMLER TEMİZ · Kotlin native-core + panel-scan derlendi ·
combo ayrıştırıcı 10 örnek, altyazı çözücü (cp1254/UTF-8/VTT/çakışan satır) Node'da doğrulandı · tam `assembleDebug`: sohbet özetinde.
