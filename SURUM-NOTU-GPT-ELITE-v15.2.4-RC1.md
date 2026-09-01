# KIZILKAN PLAYER ELITE v15.2.4-RC1
## Native Core Phase 2 + Full Playlist Pipeline Audit

Tarih: 2026-08-23
Durum: RC1 kaynak paketi. GitHub Actions / gerçek cihaz doğrulaması henüz yapılmadı.

## Neden bu sürüm var?
v15.2.3-RC1 gerçek cihaz testinde lifecycle/profile restore belirgin biçimde düzeldi; ancak çok playlist altında RAM/JS baskısı, EPG gecikmesi, discovery görünürlüğü, duplicate import, stale snapshot modalı ve player stale callback sorunları devam etti. Ayrıca iki büyük playlist ile uygulama verisinin 212 MB'a çıkması Room + legacy heavy JSON çift saklama ihtimalini doğrulama gerektirdi.

## 1. Room artık Android'de canonical playlist deposu
- Yeni/yenilenen katalog başarılı Room transaction'ından sonra ikinci heavy JSON kopyasına ihtiyaç duymaz.
- `bigStore.native.ts` Android Native Core varsa `importPlaylistHeavyJson()` ile doğrudan Room'a yazar.
- Legacy JSON yalnız eski sürüm migration/fallback kaynağıdır.
- Başarılı migration/import sonrası legacy dosya kontrollü temizlenir.
- `ensureIndexed()` Room snapshot `sourceStamp=0` ise legacy dosya aramaz.
- Kritik düzeltme: canonical import sonrası tekrar `reindexPlaylist()` ile invalidate edilip silinmiş JSON'a geri düşme regresyonu kaldırıldı; `PlaylistContext` hazır Room snapshot'ını `getPlaylistSummary()` ile doğrular.

## 2. M3U URL / M3U Dosya native parse
Android Native Core mevcutsa:
- M3U URL native tarafta indirilir.
- M3U text Kotlin worker'da parse edilir.
- Channel/VOD/Series doğrudan Room'a indekslenir.
- React/Hermes'e on binlerce item array'i verilmez.
- Deterministik kanal ID mantığı korunur.
Web/legacy ortamda eski parser fallback olarak korunmuştur.

## 3. Search / Favorites / Detail / Stats ağır hydrate azaltıldı
- Search: `Room queryItems()` üzerinden sayfalı/limitli sorgu.
- Favorites/Recent: ID listesiyle `getItemsByIds()`.
- Detail: tek item için `getItem()`.
- Stats: toplam sayaçları metadata'dan; top favorites/recent Room ID sorgusundan.
- Stats ekranına gerçek Android RAM PSS/native/ART ve Room/legacy storage telemetrisi eklendi.

## 4. VOD / Series paging
Canlı TV'deki Room paging modeli film ve diziye genişletildi.
- İlk sayfa yüklenir.
- Scroll sonunda yeni sayfa alınır.
- Tüm VOD/Series koleksiyonu JS state'e zorunlu olarak taşınmaz.
- Özel kullanıcı grupları için legacy lazy hydrate fallback korunur; özellik silinmedi.

## 5. Native EPG Core
- XMLTV Android'de native indirme + parse.
- `epg_programs` Room tablosu.
- DB migration 1→2 explicit.
- Now/Next yalnız görünür kanal ID'leri için sorgulanır.
- Kanal program listesi Room'dan alınır.
- JS regex/bigStore EPG yolu web/legacy fallback olarak korunur.

## 6. Unified Discovery görünürlüğü
- Her hesap için tested/total/remaining/found/state snapshot'ı.
- Global hesap/panel/adres progress.
- `currentServer` / panel görünürlüğü.
- Pause/Resume/Stop mevcut native service aksiyonları korunur.
- Tamamlanmış eski snapshot yeni Activity açılışında modalı zorla diriltmez.
- `PENDING_BULK_SCAN_KEY` tamamlanınca temizlenir.
- Canlı tarama sırasında bulunan sonuçlar yine anlık gösterilir.

## 7. Beş tarama hızı profili ortak UI
Aynı profil kümesi Sunucu Kodu / Panel adı / Panel bilmiyorum / Çoklu Hesap yüzeylerinde görünür:
- Çok Güvenli
- Güvenli
- Dengeli
- Hızlı
- Turbo
Native unified taramaya concurrency/timeout aynı `scanConfigForSpeed()` üzerinden gider.

## 8. Sunucu kodu / DNS self-heal
Mevcut DNS self-heal korunur. Ek olarak:
- Canlı TV üst hesap bilgisinde sunucu kodu görünür.
- Edit playlist'te Sunucu Kodu editable.
- Kod değişirse directory çözümü + gerçek Xtream auth başarılı olmadan binding değiştirilmez.
- `DNS otomatik güncelle` kullanıcıya görünür kontrol haline gelir.
- Manuel DNS override mevcut davranış gereği autoResolve'i kapatabilir; eski çalışan binding başarısız doğrulamada korunur.

## 9. Playlist duplicate koruması
- Xtream: deterministic server+username kimliği + in-flight lock.
- M3U URL: normalized URL deterministic ID.
- M3U Dosya: içerik deterministic ID.
- MAG/Stalker: portal+MAC deterministic ID.
- `PlaylistContext` aynı ID'yi replace eder; aynı playlist metadata'sı çoklanmaz.

## 10. Native Player Session Arbiter — Phase 1
Tam player motor ownership henüz Kotlin'e taşınmadı. Bu RC'de doğru kapsam:
- Native Core AtomicLong generation authority.
- `PlaybackSessionGate` Android'de begin/isActive/invalidate için native arbiter kullanır.
- JS fallback web/legacy için korunur.
- Amaç stale callback/fallback'in yeni playback session'a dokunmasını daha sert engellemektir.
Bu, “tam Native Player Manager tamamlandı” anlamına gelmez.

## 11. RAM / Storage / APK footprint
- `getRuntimeMemory()` gerçek Android `Debug.MemoryInfo` verisi döndürür.
- `getStorageFootprint()` Room DB/WAL/SHM + legacy playlist byte/file count döndürür.
- Stats ekranında telemetri gösterilir.
- Yeni `tools/analyze-apk.js` GitHub APK'sını ABI ve `.so` bazında analiz eder.
- CI artifact'e `APK-BOYUT-RAPORU-v15.2.4.txt` ekler.

## 12. Playlist ekleme audit sonucu
### Android'de Native Core'a taşınan ağır yollar
- Xtream direct: foreground native bulk importer → Room.
- Sunucu kodu/panel discovery sonucu Xtream: aynı native importer.
- Çoklu hesap seçilen sonuçları: aynı native importer.
- M3U URL: native fetch + parse → Room.
- M3U Dosya: native parse → Room.

### MAG/Stalker
MAG protokolü halen cihaz içi `stalker.ts` implementasyonunu kullanır; portal network I/O async'dir ve deterministic portal+MAC duplicate guard vardır. Son katalog `addPlaylist` üzerinden Room canonical store'a alınır. Bu RC'de MAG protokolünün tamamı foreground service'e yeniden yazılmamıştır; aksi iddia edilmez.

## Değişmeyen temel motorlar
- Media3
- libmpv-android 1.0.0
- VLC
- AUTO fallback
- TV SurfaceView kuralları
- resume/seek/session gate'leri
- panel DNS self-heal
- profiller/favoriler/EPG/MAG/M3U/Xtream özellikleri

## Derleme doğrulama durumu
Yerel statik kontroller çalıştırılır; ancak GitHub Actions olmadan şu kapılar başarılı sayılmaz:
- `npx tsc --noEmit`
- Expo prebuild
- Room/KSP code generation
- Kotlin compile
- Gradle release
- APK install
- gerçek cihaz performans testi
