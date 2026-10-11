# GPT — v18.7.29 güncel kod, dağıtım ve cihaz kontrolü

**Tarih:** 10.10.2026, Türkiye. **İşlem:** inceleme; uygulama kaynakları değiştirilmedi. Bu belge bir düzeltme yapıldığı anlamına gelmez.

## 1. Doğrulanan sonuç

Commit/push, release derleme ve telefondaki normal APK doğru. Ancak önceki 14 maddelik planın tamamı bitmiş değil. Özellikle katalog bütünlüğü, eski içerik kimlikleri ve kalıcı Xtream görüntü kanıtları tamamlanmalı.

| Kontrol | Gerçek sonuç |
|---|---|
| Dal | `codex/v18.7.29-rc1-recovery-catalog-player` |
| Yerel HEAD / GitHub dalı | İkisi de `69ed0c1c19394fb05f9f9fc31c46efd9570cf712`; çalışma ağacı inceleme başında temiz |
| Uygulama kodunun son değişikliği | `ef46e3d3ffd90648d732fb01374b026b8fa3184c`; sonraki commit devir belgesi |
| Beş sürüm alanı | 18.7.29 / 180729 / GPT ELITE v18.7.29 RC1 ile uyumlu |
| GitHub Actions | [37828331883](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/37828331883), **success**, kod commit'i `ef46e3d3` |
| Release | [build-149](https://github.com/mkizilkan/kizilkan-player-elite/releases/tag/build-149), `KIZILKAN-PLAYER-ELITE-v18.7.29-build149.apk`, 385.359.719 bayt |
| Normal APK | OnePlus 7 Pro'da `com.gpt.kizilkan.player`, 18.7.29, 180729; son güncelleme cihaz kaydında 10.10.2026 19:39:52 |
| DEV APK | Aynı telefonda ayrı paket `com.gpt.kizilkan.player.dev`, 18.7.29-dev, 180729; son güncelleme 08.10.2026 22:16:29 |
| Normal APK dosya özeti | Telefonun kurulu `base.apk` SHA-256 değeri GitHub release asset digest'iyle **birebir aynı** |
| SHA-256 | `69ebf724b041f6397a3067526535021af163fe4de794e738020dda4aea90e893` |
| Depo erişimi | GitHub API'den `private:true` doğrulandı |
| Bu incelemede `yarn tsc --noEmit` | PASS, 58,44 saniye |
| Bu incelemede `node tools/denetle.js` | PASS, “TÜM DENETİMLER TEMİZ” |
| `git diff --check` | PASS |

Native kod bu incelemede değiştirilmedi veya yeniden derlenmedi. GitHub'daki başarılı release işinde native derleme, APK paket/sürüm/imza ve MPV paketleme kontrolleri geçmiş. Mevcut APK'nın cihazdaki bütün kullanım senaryolarının sorunsuz olduğu bundan çıkarılamaz.

## 2. Claude'un son düzeltmelerinin doğrulanması

`835d64a0` çalışma commit'iyle `ef46e3d3` karşılaştırıldı.

1. **Şişirilmiş portal toplamı:** `loadedCount < total` tek başına artık eksik katalog hatası üretmiyor. Tekrarlanan/boş son sayfaya gelindiğinde gerçekten alınmış öğelerin yanlışlıkla reddedilmesini düzeltmiş. Bu düzeltme yerinde. Bunun yanında aşağıdaki B01, yani gerçek sayfa hatasının başarı sayılması, ayrı bir sorun olarak kalıyor.
2. **Tarama modülü import'u:** `storage` üst düzey import'tan `ownedScan` içindeki tembel import'a taşınmış. VM kontrolüne storage mock'u eklenmiş. Uygulamadaki profil sahipliği sarmalayıcısı korunmuş.
3. **İçerik testi denetimi:** 30 saniyelik dış bütçe ile denetim uyumlu. Bu süre katalog testine ait; gerçek ilk kare testinin bütçesi 45 saniye.
4. **Sürüm ve dağıtım:** Beş alan 18.7.29'a yükselmiş, release Actions ve telefon kurulumu doğrulanmış.

Kaynak: [stalker.ts](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2727), [panel-scan/index.ts](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/index.ts:52), [AI-DEVIR](C:/Projeler/kizilkan-player-elite/AI-DEVIR-v18.7.29.md:5).

## 3. Devir notlarında düzeltilmesi gereken bilgiler

Devir notlarının bazı alt bölümleri eski çalışma durumunu koruyor. Bunları güncel kod yerine kanıt kabul etmedim.

| Notlarda yazan | Güncel koddan doğrulanan |
|---|---|
| MAG görüntü test kuyruğu bağlanmalı | **Bağlı:** `mag-bulk.tsx:583`, test kapsamı/seçimi `:803–808`. Cihazda başarılı bir gerçek kare oturumu bu incelemede yeniden üretilmedi. |
| MAG JSON-lines geri içe alma tamamlanmalı | **Mevcut:** `magArchive.ts:6`, `mag-bulk.tsx:559`. İçe alma sahipliği konusunda B05 açık. |
| Kullanıcı adı/şifreyi küçük harfe çeviren anahtar hâlâ açık | `add-playlist.tsx:465` anahtarında kullanıcı adı ve şifre küçük harfe çevrilmiyor. Bu eski bulgu burada giderilmiş. |
| Xtream arşivinde profil sahipliği yok | Native owner tablosu/schema v4, `ownedScan`, snapshot profil kontrolü **var**. Eski Xtream arşivlerini UI'dan açma ve MAG içe alma sahipliği ayrı eksikler. |
| TXT kuyruk kuyruğuna sonradan eklenen kanıtlar kaçabilir | `ScanSafetyBackup.kt` içinde `generations` ve `dirty` denetimi **var**; aynı kayıt sayısındaki kanıt güncellemesi de yeniden yazımı tetikleyebiliyor. Gerçek güç kesintisi kabul testi hâlâ eksik. |
| Commit/push/APK henüz yok, sürüm hâlâ 18.7.28 | Bu alt paragraf tarihsel WIP durumu. Güncel dağıtım Bölüm 1'de doğrulandı. |
| 14 madde yapıldı | Çekirdek değişiklikler var; tüm maddelerin eksiksiz tamamlandığı doğrulanmıyor. Bölüm 6'daki durum tablosu esas alınmalı. |

Mevcut devir/CLAUDE dosyaları bu incelemede değiştirilmedi; bu rapor sonraki kodlama için güncel farkları kaydeder.

## 4. Bulgular — mevcut durum, neden, sonuç ve çözüm

**P1:** katalog/kayıt bütünlüğü veya profil sahipliği riski. **P2:** işlev, doğruluk veya kalıcılık eksiği. “Koddan risk” olan satırlar cihazda yaşanmış hata gibi sunulmamıştır.

| No / önem | Mevcut durum ve kod kanıtı | Neden / kullanıcıya etkisi | Yapılması gereken | Yapılınca ne olacak |
|---|---|---|---|---|
| **B01 — P1, davranış testiyle doğrulandı** | [stalker.ts:2685](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2685) döngüsü sadece `TOTAL_OR_END` iken sürüyor. `:2699` sıradan sayfa hatasında `PAGE_ERROR` yapıyor. `:2731` bu nedeni eksik kabul etmiyor. | Tek 500/zaman aşımı sonraki partileri kesiyor. Elde yalnız 2/6 öğe kalmasına rağmen üst katalog `vod:OK`, uyarı yok döndürüyor. Kullanıcı eksik katalogla karşılaşabilir. | Başarısız sayfa numaralarını kaydet; iptal edilebilir sınırlı tekrar uygula. Giderilemeyen hata varsa katalog kısmi olarak dönsün ve eski tam katalog değiştirilmesin. Doğal son sayfa ile ağ hatası ayrı tutulmalı. | Geçici bir sayfa hatası film/dizi kaybını sessizce başarılı yenilemeye dönüştürmez. |
| **B02 — P1, koddan risk** | [Stalker ID'leri:2755](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2755) `st-vod/st-series`; [Xtream ID'leri:489](C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:489) `xt-vod/xt-series`. [Hızlı köprü:3075](C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:3075) bu yeni ID'leri koruyor. Library kayıtları içerik ID'sine bağlı. | Aynı MAG listesi hızlı Xtream yoluna geçince eski favori/izlendi/devam et anahtarları yeni öğeyle eşleşmeyebilir. Eski kayıt diskte dursa bile kullanıcı kaybolmuş gibi görür. | Room'daki mevcut içerik kimlikleriyle kanıtlı eşleme/kalıcı alias tasarla; favori, ilerleme, izlendi, dizi son bölümü birlikte korunmalı. Yalnız sayısal ID'ye bakıp kör `xt→st` değiştirme yapılmamalı. | Katalog hızlanırken kullanıcının geçmişi korunur. |
| **B03 — P1, davranış testiyle doğrulandı** | [iptv.ts:485](C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:485) ve `:530`: `items || []`; gerçek `Array.isArray` doğrulaması yok. `xtGet` yalnız JSON parse ediyor. | HTTP 200 + `{error:...}` veya `{}` nesnesi dönerse döngü çalışmadan `[]` dönüyor. Hızlı MAG köprüsü bunu “EMPTY” kabul edebilir; gerçek hata boş katalogla karışır. | Canlı örnekteki gibi Film/Dizi yanıtının dizi ve öğelerin geçerli ID taşıdığını doğrula. Hatalı şekil `INVALID_CATALOG_RESPONSE` olsun; Stalker yedeği veya eski katalog koruması çalışsın. | API hatası, gerçekten boş katalogdan ayrılır. |
| **B04 — P1/P2, korumanın farklı yollarda atlanması** | [PlaylistContext.tsx:1022](C:/Projeler/kizilkan-player-elite/frontend/src/store/PlaylistContext.tsx:1022) otomatik yenilemede yarıdan fazla küçülmeyi koruyor. [playlist-select.tsx:110](C:/Projeler/kizilkan-player-elite/frontend/app/playlist-select.tsx:110), `:113`, `:196`, `:233` doğrudan fetch + update kullanıyor. | Manuel/toplu yenileme aynı ortak korumadan geçmiyor. B01/B03'teki başarılı görünen kısmi/boş liste Room'u değiştirebilir. Ayrıca `beforeSnapshot` Room modunda boş bellek dizileridir; fark raporunun “önce” kısmı yanıltıcı olabilir. | Yenilemeleri tek commit politikası altında birleştir. Önce/sonra sayımı Room'dan al. Gerçek tam liste küçülmesini kullanıcıya uygulama **öncesi** göster; eksik/error sonucu eski katalog üzerine yazma. | Otomatik, manuel ve toplu yenileme aynı kayıt güvenliğine sahip olur. |
| **B05 — P1, koddan profil/iş yarışı** | [mag-bulk.tsx:559](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:559) içe almada `busyRef` yalnız okunuyor; işlem sahipliği alınmıyor. Profil/epoch picker ve dosya okuma öncesi sabitlenmiyor; `:567` o anki `profileRef.current` kullanılıyor. | Dosya seçimi sırasında profil değişirse önceki profil için seçilmiş hesap yeni profilin arşivine yazılabilir. Çift dokunma veya arada tarama başlatma da iki sonuç akışını yarıştırabilir. Bu geçiş cihazda uygulanmadı; risk koddan açık. | Diğer `addValid/saveFound` işlemlerindeki owner + epoch + action + AbortController sözleşmesini içe almaya uygula; her await sonrası kontrol et. Profil değişiminde görüntü kuyruğunu da kapat. | İçe alınan özel hesaplar doğru profilde kalır, eşzamanlı işlem sonuçları birbirini ezmez. |
| **B06 — P2, Xtream ilk kare kanıtı geçici** | [add-playlist.tsx:2950](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2950) test sonucu yalnız `setBulkCandidates` yapıyor. MAG karşılığında journal `updateResultEvidence` ve Room update çağrısı var. | Xtream'de gerçek kareyi görseniz bile ekran/process kapanınca kanıt kaybolabilir. TXT üretiminde `stored?.endpoints` mevcutsa daha eski Room kanıtı yeni UI testine tercih edilebilir. | Xtream kanıtını sahip olunan run'ın journal'ına ve ilgili Room playlist endpoint'ine yaz. Eski/yeni kanıtı zamanıyla birleştir; false dönen update sonucunu da ele al. | Görüntü testi sonucu kartta, geri açılışta ve TXT'de tutarlı kalır. |
| **B07 — P2, Xtream TXT kategorileri doldurulmuyor** | [accountArchive.ts:60](C:/Projeler/kizilkan-player-elite/frontend/src/utils/accountArchive.ts:60) kategori alanını yazabiliyor. [add-playlist.tsx:2214](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2214) üretilen record'a `categories` vermiyor. | Kullanıcının istediği Canlı/Film/Dizi kategorileri çoklu Xtream TXT'de “Henüz alınmadı” kalıyor. API kategori hataları da [iptv.ts:481](C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:481), `:526` tarafından sessiz boş diziye çevriliyor. | Room'un kategori özetini veya üç kategori API'sini ortak export akışına bağla. Boş/alınamadı ayrımı, iptal ve host kuyruğu korunmalı. Parser'ın kategori bilgisini de saklaması tamamlanmalı. | TXT hesap bilgisiyle gerçek kategori listesini ve alınamayan bölümün sebebini taşır. |
| **B08 — P2, davranış testiyle doğrulandı** | [hostRequestPolicy.ts:40](C:/Projeler/kizilkan-player-elite/frontend/src/utils/hostRequestPolicy.ts:40) kalan süreyi bir kez hesaplayıp uyuyor. `:8` Retry-After'ı 120 saniyeye kesiyor. | Kuyruktaki bekleyici uyurken yeni 429/503 beklemeyi uzatırsa eski süre dolunca izin alıyor. Testte yaklaşık 370 ms yerine 95 ms'de izin aldı. `Retry-After:600` → 120000 ms. | Bekleme bittiğinde güncel `state.until` tekrar kontrol edilmeli. Sunucunun süre isteğini erken kesmek yerine uzun beklemeyi iptal edilebilir göster; politika sınırı varsa istek erken gönderilmesin. | Aynı hosta sunucu hazır olmadan yeniden yük bindirilmez. |
| **B09 — P2, kalıcı erteleme eksik** | [add-playlist.tsx:1506](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:1506) “Daha sonra” yalnız ekran ref'i ve modalı değiştiriyor. `deferScanRecovery` sadece Zorla çık'ta çağrılıyor. | Kullanıcı “Daha sonra” dese bile sonraki cold start aynı kurtarma ekranına yönlenebilir. Tekli taramada “Sonuçları aç” bulk modalını açıyor; doğru modal seçimi de gerekli. | Ertelemeyi profil/run ile kalıcılaştır; aç/devam et seçeneklerinde bilinçli temizle. Tekli/bulk sonuç penceresini moduna göre aç. | Erteleme kararı sonraki açılışta da uygulanır; yanlış sonuç penceresi açılmaz. |
| **B10 — P2, TXT güncel durum bildirimi sınırlı** | MAG `onResult` [mag-bulk.tsx:306](C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:306) kuyruk anındaki durumu gösteriyor. Asıl dosya çalışanı sonra yazıyor. “Hazırlanıyor”dan “yazıldı”ya geçiş için ayrı durum aboneliği/poll yok. `getLatestAccountArchive` köprüde var, UI çağrısı yok. | Dosya yazılmışken MAG ekranda eski hazırlanıyor/önceki nesil yolu kalabilir. Son snapshot onaylandıktan sonra daha eski Xtream journal arşivini kullanıcı UI'dan kolayca yeniden açamıyor. | Yazıcı tamamlanma durumunu run sahibi tüketiciye ilet; DB/TXT/görünen sayıyı ayrı göster. Profilin geçmiş Xtream arşivlerini açma seçeneğini bağla. | Kullanıcı gerçek son başarılı dosyayı ve korunmuş eski sonuçları bulabilir. |
| **B11 — P2, içerik sayımı ham satır** | [iptv.ts:530](C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:530) aynı ID/kategori tekrarını çıkarmıyor. Native [rowKey:1469](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt:1469) sıra da içeriyor; [DAO:74](C:/Projeler/kizilkan-player-elite/frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeDataDao.kt:74) `COUNT(*)`. | Testte aynı dizinin aynı kategoride iki kopyası → 2 satır, 1 benzersiz ID. Katalog/kart toplamı şişebilir. Aynı ID'nin farklı kategorilere ait olması ise geçerli olabilir. | Aynı ID+aynı kategori tekrarını ayrı ele al. Ham satır, benzersiz içerik ve kategori üyeliği sayısını açık göster. Yedek bütünlük sayımlarını koordineli güncelle. | Tekrarlanan içerikler kullanıcı sayımını şişirmez; gerçek kategori üyelikleri kaybolmaz. |
| **B12 — P2, görüntü testinin kapanış kanıtı** | [EndpointPlaybackTest.tsx:27](C:/Projeler/kizilkan-player-elite/frontend/src/components/EndpointPlaybackTest.tsx:27) `replaceAsync(null)` beklenmeden sonuç yayınlıyor. Kuyruk sabit 750 ms sonra ilerliyor. `xtreamLiveSample` yalnız ilk geçerli kanalı seçiyor. | Sabit gecikme native bağlantının tamamen kapandığına dair teyit değil. Tek kanalın geçici hatası diğer kanallar/motorlar hakkında kanıt vermez. Gerçek çift bağlantı bu incelemede gözlenmedi; bu bir doğrulama/yaşam döngüsü riski. | Test tamamlanmasını stop/release teyidine bağla; sonra sıradakine geç. Sonuçları test edilen kanal/motor kapsamıyla göster; gerekirse az sayıda alternatif örneği sırayla dene. | Tek bağlantı şartı zaman tahminine bağlı kalmaz; kullanıcı bir kanal hatasını bütün hesabın çalışmamasıyla karıştırmaz. |
| **B13 — P2, DNS kanıtı ve ana player ölçümü** | [PlayerHost.tsx:4068](C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:4068) MAG kanıtını her zaman ana `stalkerPortal`a yazıyor. `:4069` endpoint'e ilk kare zamanı yazıyor, yeni `firstFrameElapsedMs` alanını doldurmuyor. | Gerçekte farklı çözümlenmiş portal/kaynak kullanıldıysa ana adrese yanlış başarı etiketi yazılabilir. Özel test süresi ile normal player süresi karşılaştırılamıyor. | Resolver'dan hesap portalı ve gerçek kaynak kökenini ayrı taşı. Yalnız kullanılan endpoint'e kanıt yaz; ilk kare süresi, test zamanı ve motoru sakla. Açılış optimizasyonunu DNS/resolve/motor süreleriyle ölçerek seç. | Çalışan DNS'ler doğru işaretlenir; hızlı açılan adres tercihi ölçüme dayanır. |
| **B14 — P2, zorla çık hata dayanıklılığı** | [add-playlist.tsx:2920](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:2920) çıkışta `getSnapshot()` senkron ve try/finally dışında. Native [getSnapshot:425](C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt:425) DB sahipliği ve bazı restart durumlarında journal/Keystore okuyor. | DB/Keystore okuması hata verirse yönlendirmeye ulaşılmayabilir. Önceden `leavingRef=true` olduğu için ikinci basış da geri döner. Cihazda yeniden yaşanmış çıkış kilidi kanıtlanmadı; koddan hata yolu. | Çıkış yönlendirmesini finally/güvenli fallback ile garanti et. Anlık UI çıkışını pahalı native kurtarma okumalarından ayır; son bilinen run sahibiyle duraklatma/flush isteğini gönder. | Kurtarma verisi okunamasa bile kullanıcı ekrandan çıkabilir. |

### B01 için önemli ayrım

Claude'un `loadedCount < total` koşulunu kaldırması doğrudur: portalın şişirilmiş toplamı bir bitiş kanıtı değildir. Ancak `PAGE_ERROR` bir doğal son değildir. Döngü mevcut kodda sayfa hatasından sonra **devam etmiyor**. Çözüm eski koşulu geri koymak olmamalı; hata/sayfa kapsaması ve doğal son bilgisi ayrı taşınmalı.

### B03/B04 için kayıt riski

Yenilemede bazı alanlar bozulunca otomatik küçülme koruması bir ölçüde işe yarar. Fakat yalnız `roomCount > 20` ve yüzde 50 eşiği yeterli bütünlük kanıtı değildir; manuel yollar da aynı korumayı paylaşmıyor. Geçersiz yanıtı daha baştan hata olarak sınıflandırmak gerekli.

### Katalog hızı hakkındaki sınır

Film ve dizi öğelerinin sayfalama yerine iki toplu endpoint'ten alınması kodda var. Bununla birlikte mevcut iş akışı toplam yalnız **iki HTTP isteği** değildir: hesap ve canlı örneği için iki, Film/Dizi katalogları ve kategori listeleri için dört olmak üzere başarılı köprü içinde altı istek var; önceki MAG login/live/account aşamaları buna ayrıca eklenir. “17 dakika kesin saniyelere indi” ölçümü bu incelemede cihazdan doğrulanmadı.

## 5. Gerçekten çalıştırılan ek davranış kontrolleri

Kaynak TypeScript bellekte transpile edildi. Sahte sunucu yanıtları yalnız hata dallarını sınamak için kullanıldı; hiçbir gerçek portal hesabına istek atılmadı. Uygulama kodu veya denetim kapıları değiştirilmedi.

| Senaryo | Beklenen güvenli davranış | Gözlenen |
|---|---|---|
| 6 öğeli Stalker katalog; p0/p1 başarılı, p2 HTTP 500 | Eksik/kısmi uyarı veya sınırlı tekrar; tam başarı olmamalı | İstekler `[0,1,2]`; VOD 2; `vod:OK`; `warnings:[]` |
| VOD/Series endpoint'i HTTP 200 ile JSON hata nesnesi döndürüyor | Yanıt şekli hatası | İki işlev de `[]` döndürdü |
| Host 80 ms bekliyor; 20 ms sonra bekleme 350 ms daha uzuyor | Yaklaşık 370 ms'den önce izin verilmemeli | Yaklaşık 95 ms'de izin verildi; zamanlama toleransı yeni deadline farkını açıklamıyor |
| Retry-After 600 saniye | Erken istek göndermeyen iptal edilebilir bekleme | 120 saniyeye kesildi |
| VOD kategori isteği 401, film öğeleri geçerli | Kategori alınamadı uyarısı | Film grubu sessizce `Genel` oldu |
| Aynı dizi ID'si aynı kategoride iki kez | Aynı kategori tekrarı ayırt edilmeli | 2 öğe döndü, benzersiz ID 1, kategori 1 |

Genel denetimlerin PASS olması bu yeni senaryoların mevcut testlerde kapsandığını göstermez. Sonraki düzeltme sürümünde bu davranışlar kalıcı regresyon testlerine eklenmeli; kapıları yalnız yeni hatalı davranışa uyarlamakla yetinilmemeli.

## 6. Önceki 14 maddelik planın gerçek tamamlanma durumu

| Plan no | Güncel durum | Kalan |
|---|---|---|
| 1 — Zorla çık | Ekleme/MAG ekranları, sonuç ve katalog katmanlarında var; donanım geri bağlı | B14, çıkış hata dayanıklılığı ve gerçek cihaz senaryosu |
| 2 — Kurtarma servisi | Foreground bildirim DB/Keystore hazırlığından önce; hazırlık Thread'e taşınmış; erken pause/cancel korunuyor | Çok kayıtlı yeniden açılış ve güç kesintisi kabul testi; sync snapshot okumasını ayrıca ele al |
| 3 — Tam sonuç aktarımı ve seçim | `getResultsPage` ve sınırlı cursor okuyucu var; 200'lük snapshot tek kaynak değil; kurtarma seçenekleri var | Eski Xtream arşiv UI'sı, kalıcı erteleme, tüm sayaçların açık ayrımı |
| 4 — Boş emniyet TXT | Tek yazıcı, ilk sonuç isteği, yeni nesil, geri okuma SHA-256, önceki sağlam kopya var. Cihazdaki eski iki TXT 678/2 gerçek kayıt taşıyor | Yeni nesil formatta güç kesintisi/hata/kapanma testleri ve MAG tamamlanma durum bildirimi |
| 5 — Harf duyarlı hesaplar | İlgili çoklu giriş anahtarında düzeltme var | Yeni harf duyarlılığı regresyon testi; host normalize ile credential/path normalize ayrı tutulmalı |
| 6 — Hesap/katalog/gerçek görüntü | Gerçek renderer testi MAG ve Xtream'e bağlı. Katalog testi ayrı | Xtream kanıt kalıcılığı, bağlantı kapanış teyidi, örnek/motor kapsamı |
| 7 — Hızlı MAG katalog | Ortak verified Xtream helper normal yenileme ve enrichment'te çağrılıyor; saf Stalker yedeği var | B02/B03; gerçek sağlayıcı hız ve oynatma testi |
| 8 — Bütünlük, ID, sayım, checkpoint | Room commit/fingerprint altyapısı var | ID eşleme, PAGE_ERROR, benzersiz/ham sayım, normal MAG JS işini process sonrası sürdüren checkpoint tamamlanmadı |
| 9 — Hızlı canlı açılış/motor/timeshift | Mevcut ilk kare ve kaynak verilme süreleri, motor zinciri, pause arming sahipliği var | Bu sürümde yeni ölçülmüş hız kazanımı kanıtı yok; onPause ilk açılış + duraklatma/sarma üç motorda canlı test edilmeli |
| 10 — MAG/Xtream çalışan DNS | Endpoint türü/kanıtı ve çoklu host saklama altyapısı var | Xtream kanıt kalıcılığı, MAG gerçek portal eşlemesi, normal player süreleri ve adres sıralaması |
| 11 — Port/path ve koruma | Host başına keşif, manuel/otomatik seçim, exact/fallback/all, endpoint kilidi ve üç koruma durumu mevcut | Gerçek sağlayıcı port/path doğrulaması; HTTP 200 HTML'in portal sayılmaması korunmalı. Yeni kodla bütün MAC'lerin her yolu tekrar denediği iddiası bu incelemede doğrulanmadı |
| 12 — Seçili/tümü TXT ve kategori | MAG seçimi, kategori önizleme, HESAP_JSON, expiry/username/password alanları var. Xtream seçimli TXT var | Xtream kategori doldurma ve kanıt merge, MAG import sahipliği |
| 13 — Seçimli yedek, sıfır sayı, MAC kutusu | Mevcut seçili restore ve metadata-only yerel/uzak sayım sözleşmeleri var; ilgili davranış denetimleri PASS. MAC alanı sınırlı yükseklik/iç kaydırma kullanıyor | Güncel APK'da kullanıcı senaryolarının cihaz kabul testi. “Bunlar yok” denip yeniden yazılmamalı |
| 14 — Retry/status/iptal/log | 401/403 ve HTML/JSON hata sınıflaması, iptal edilebilir host kuyruğu var; native manuel paralellik korunmuş | B08; katalog yanıt şekli ve sessiz kategori hataları |

Normal MAG yenilemesinde genel foreground keep-alive servisi zaten mevcut (`PlaylistContext.tsx:1002`). Ancak gerçek katalog işi hâlâ JS tarafında; foreground bildirim tek başına işlem öldürülünce sayfalama checkpoint'inden devam etme yeteneği sağlamaz.

## 7. Telefondan okunan kanıtlar ve sınırları

- DEV `kizilkan_scan_safety.xml` içindeki iki arşiv URI'si bulundu. Dosyalar `content read` ile gerçekten okundu; içerik terminale/rapora basılmadı.
- Birinci dosya: kayıtlı count **678**, gerçek JSON satırı **678**, başlık doğru, boş değil.
- İkinci dosya: kayıtlı count **2**, gerçek JSON satırı **2**, başlık doğru, boş değil.
- Bu iki status'ta yeni `state/bytes` alanları yok; eski nesil dosyaların korunmuş olmasıyla uyumlu. Yeni 18.7.29 yazıcısının güç kesintisindeki davranışına ait yeni kabul testi yerine geçmez.
- Normal APK'nın güncelleme sonrası en yeni kapanma kaydı `USER REQUESTED / remove task`; kurulumdaki kapanma da `installPackageLI`. İncelenen yeni normal paket kapanma kayıtları uygulama crash'i kanıtlamıyor. Android bu kapanma nedenlerini ayrı sınıflandırır. [ApplicationExitInfo resmi belge](https://developer.android.com/reference/android/app/ApplicationExitInfo).
- Mevcut logcat tamponunda 14.872 satır, uygulamayla ilişkili filtrede 422 satır; bu kapsamda fatal/ANR ve ReactNativeJS error eşleşmesi **0**. İlk kare veya CATALOG_INCOMPLETE olayı da **0**. Dolayısıyla bu tampon player açılış hızı/katalog başarısı için yeterli değil.
- Downloads'taki en yeni dışa aktarılmış tanı raporu **07.10.2026, v18.7.24**. Eski 6.000 olaylık raporu v18.7.29 davranışı gibi değerlendirmedim.
- Kullanıcının mevcut listeleri silinmedi, yeni tarama başlatılmadı, hesapların yayınları açılmadı, telefon uygulaması kaldırılmadı/güncellenmedi.

## 8. Önerilen düzeltme ve kabul sırası

1. **Katalog kaybını kapat:** B01, B03, B04. Doğal bitiş, transient sayfa hatası, gerçek boş dizi ve HTTP 200 hata nesnesi ayrı test edilmeli. Eksik katalog eski dolu Room'a uygulanmamalı.
2. **Geçmişi koru:** B02. Mevcut favori/izlendi/devam et bulunan MAG hesabı Stalker'dan Xtream köprüsüne geçirilip kayıtların görünür kaldığı doğrulanmalı; belirsiz eşleşmeler otomatik taşınmamalı.
3. **Profil ve kalıcılık:** B05, B06, B09, B14. Picker açıkken profil A→B→A, çıkış sırasında pending await, uygulama yeniden açılışı, yeni/önceki arşiv kanıtları sınanmalı.
4. **Rapor ve hız doğruluğu:** B07, B08, B10, B11, B13. Kategoriler/boş-hata ayrımı ve son çalışan DNS kanıtları TXT+Room ile aynı olmalı; host yeni bekleme süresine uymalı.
5. **Tek bağlantı ve gerçek cihaz:** B12. Örnek kanal testinden ana player'a dönüş, arka plan/iptal, Media3/VLC/MPV, onPause'da ilk açılış ve sonra duraklatıp sarma ayrı ölçülmeli.
6. Genel kontroller ve yeni davranış testleri geçtikten sonra sürümün beş alanı birlikte yükseltilmeli, ayrı dala commit/push ve manuel release build yapılmalı. v18.7.29'ın cihazdaki hash kanıtı bu raporda başlangıç karşılaştırması olarak saklandı.

Bu rapor sonraki kodlamanın kapsamını önerir; bu incelemede yeni düzeltme, commit/push veya build tetiklemesi yapılmadı.

## 9. Güncel birincil kaynak kontrolü

- [Expo SDK 54 — Video](https://docs.expo.dev/versions/v54.0.0/sdk/video/): `onFirstFrameRender` görüntünün VideoView'a çizilmesiyle ilişkilidir; `createVideoPlayer` yaşam döngüsünü geliştirici yönetir. Kodun gerçek kare olayını kullanması doğru, asenkron kapanış sıralaması ayrıca doğrulanmalıdır.
- [RFC 9110 — Retry-After §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after): sunucunun sonraki istek için önerdiği bekleme süresi saniye veya HTTP tarihi olabilir. Buradaki erken izin ve kesme bulgusu gerçek fonksiyon testiyle ayrıca doğrulandı.
- [Android — ApplicationExitInfo](https://developer.android.com/reference/android/app/ApplicationExitInfo): kullanıcı kapatması, güncelleme, sistem sonlandırması, crash ve ANR ayrı nedenlerdir. Bu nedenle yalnız bir process kapanmasını uygulama çökmesi diye etiketlemedim.

Hesap kullanıcı adı/şifresi, M3U erişim linkleri ve ham özel tanı içerikleri bu belgeye eklenmedi.
