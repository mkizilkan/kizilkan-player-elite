# KIZILKAN PLAYER ELITE v18.7.31 RC1 — GPT / Opus devir dosyası

Tarih: 11 Ekim 2026. Dal: `codex/v18.7.31-dns-tests-fast-catalog`. Başlangıç commit'i: `bc2bfbfbba603d23930d2f6ddd64293094a07f29` (v18.7.30 uygulaması ve Release yayınlama kota düzeltmesi). Bu dosya gerçek değişiklikleri, nedenlerini, kontrolleri ve teslim durumunu kaydeder. Son build/kurulum kayıtları aşağıdaki teslim bölümüne eklenecektir.

## 1. Kullanıcı isteği ve arşiv sürümü

Kullanıcı; sunucu koduyla veya elle eklenen Xtream ve MAG hesaplarında bütün alternatif DNS/portal adreslerini görmek, istediği kadar adres eklemek, adresleri hesap ve gerçek görüntü bakımından sınamak, birini elle aktif yapmak veya programın en hızlı görüntü veren adresi seçmesini istedi. İşlemler Ayarlar → Hesap Bilgileri'nin üstünde bulunmalı; eski DNS ölürse otomatik alternatif denemesi çalışmalı. Ayrıca Xtream destekli MAG panellerin ilk ekleme ve çeşitli güncelleme yollarında sayfalama yerine doğrulanmış toplu API kullanması, güncelleme sıklıklarına 1/2/3 gün, 1 hafta ve 1 ay eklenmesi istendi. Önceki commit/push, ayrı dal, manuel **normal release**, PC'de DEV ve bağlı telefona kurulum yetkisi devam ediyor.

“520 hit olan sürüm” sorusu daha sonra kullanıcı tarafından **579 hesaplık arşiv** olarak netleştirildi. GitHub'a arşiv yüklenmesi ve ardından private'a alma olayı **7 Ekim 2026, v18.7.25 RC1** ile ilgili. Kanıt: `AI-DEVIR-v18.7.25-GUVENLIK-TEMIZLIGI.md`; arşiv adı `KIZILKAN-HESAP-ARSIVI-579-2026-10-07.txt`. 520 sayısını farklı bir build'e bağlayan kanıt yok; hesap içerikleri bu rapora veya terminale taşınmadı.

v18.7.30 normal APK gerçekten yayımlandı: [build 153 APK](https://github.com/mkizilkan/kizilkan-player-elite/releases/download/build-153/KIZILKAN-PLAYER-ELITE-v18.7.30-build153.apk). SHA-256: `e5cd6f1adb6617ebe5d31c6c93a968d5b57a8ed1dc433901032ce23403ec02a0`. Önceki build 151 APK üretmiş, Actions artifact kotasında takılmıştı; 152 ve 153 Release asset'leri başarılıdır. Ayrıntı: `AI-DEVIR-v18.7.30.md` §10–12.

## 2. Koddan doğrulanan kök neden ve düzeltmeler

| Mevcut durum / neden | Yapılan değişiklik | Sonuç ve doğrulama sınırı |
|---|---|---|
| DNS yöneticisi liste düzenleme ekranındaydı; Ayarlar'daki hesap bölümünde bütün DNS'ler için ortak görüntü/best testi yoktu. | `PlaylistDnsControls.tsx` ile hesap bölümüne ortak yönetici eklendi; Xtream/MAG hesabında accountInfo boş olsa da görünür. | Sunucu kodlu ve kodsuz hesaplar aynı kontrolleri kullanır. Ayarlar'da metadata hemen kaydedilir; tüm kataloğu test başına yeniden çekmez. |
| Tek adres auth testi veya katalog sayısı gerçek görüntü kanıtı değildir. | `DnsManager.tsx`: “DNS adreslerini test et”, “En iyi çalışanı seç”; satırda “Hesap testi”, “Görüntü test et”, “Aktif yap”, “Sil”, ekstra adres girişi. | Adresler sırayla, gerçek renderer ilk karesiyle sınanır. En iyi seçim yalnız bu turda kare veren adreslerden, ilk kareye kadar geçen süreye göre yapılır. Katalog/auth başarısı görüntü diye etiketlenmez. |
| Başarılı eski ilk kare, daha yeni başarısız testten sonra hâlâ güncel sağlık gibi değerlendirilebilirdi. | `playbackTestAt/state`, `lastErrorKind`, `accountLatencyMs`; güncel kare filtresi ve tarihli sonuç etiketleri. | Tarihsel başarı korunur; daha yeni başarısız/iptal edilmiş test en iyi seçim hesabına eski başarıyla girmez. Son hata ayrıca görünür. |
| Rehber adreslerinin tamamı kayıtlı olmayabilir; kullanıcı elle eklediği adresi strict seçim kapsamına alamazsa yenileme kullanamaz. | `playlistDnsManagement.ts`: birincil, yedekler, seçili kapsam, endpoint kanıtları birlikte güncellenir. Otomatik rehber izni varsa aynı panelin güncel alias'ları hesaba aday olarak eklenir. | Yeni adres adaydır; eklenmek veya rehberden gelmek onu doğrulanmış yapmaz. Panel kimliği/autoResolve/izin tercihi korunur. Strict modda kullanıcı elle eklediği adres açık seçime dahil edilir. |
| Aktif adresin arka planda kaydedilmesi ve test kanıtı yazımı yarışabilir. | Yazmalar sıralanır; her yazma tam DNS metadata izdüşümünü taşır. Son yazma başarısızsa son doğrulanmış kayda dönülür. | Önceki yazmanın hatası sonraki birincil ve endpoint.primary alanlarını ayırmaz; başarısız kayıt kullanıcıya gösterilir. Sekmeden çıkmış bileşenin eski callback'i yeni yazma başlatamaz. |
| Liste düzenleme ekranında “Aktif yap” seçimi, Kaydet'e basmadan oynatıcı tercih depolamasını etkileyebilirdi. | Oynatıcı tercih yazımı Save'in metadata commit aşamasına taşındı; kayıt başarısızsa eski adres geri hatırlanır. | Düzenleme ekranından kaydetmeden çıkmak oynatıcı tercihini değiştirmez. Ayarlar'daki yönetici ise açıkça anında kaydeder. |
| Panel çözümleyicide bir alias'ın auth=0 cevabı diğer alias'ların denenmesini kesiyordu. | `pickWorkingHost`: kullanıcı tarafından yetkilendirilmiş panel adreslerinde auth=0 sonrası sıradaki adres; adres başına 10 sn süre; ebeveyn iptali ayrı. Refresh yalnız onaylı alternatiflerde aynı ayrımı kullanır. | Eski/başka yere taşınmış alias hesabı yanlışlıkla bütün DNS'lerde reddedilmiş saydırmaz. HTTP 401/403/429 ve koruma sinyali alternatif bombardımanıyla aşılmaya çalışılmaz. |
| Xtream 429 kendi retry/cooldown bekleyişinde zaman aşımına dönüşürse DNS testine yanlış hata türü ulaşabilirdi. | `xtGet` RATE_LIMIT'i hemen typed sonuç olarak döndürür; host cooldown korunur. | Kuyruk/çağıran 429 türünü görür; gizli ikinci istek yok. Geçici 5xx için mevcut retry davranışı korunur. |
| Player, DNS metadata değiştiğinde eski preferredHost'u kullanabiliyor; Room'daki eski yayın URL'sinin alternatif listesinde yeni birincil eksik olabiliyordu. | `PlayerHost.tsx`: tercih hesabın birincil DNS'i değiştiğinde yeniden yüklenir; güncel xtreamServer adaylara dahil edilir. | Kullanıcının seçtiği yeni DNS, mevcut Room URL'lerinden de aday üretir. Kalıcı player mimarisi, motor zinciri, buffer ve timeshift ayarları yeniden tasarlanmadı. |
| MAG'da elle girilen özel port/yol strict kapsam eşleştirmesinde ana portal yoluna dönüşebilirdi. | `selectedMagDnsCandidate`: tam portal URL kendi yolunu/portunu korur; yalnız origin girilmişse aktif portal yolu miras alınır. | `:8081/custom/portal.php` yanlışlıkla `:8080/c` olmaz. Query, userinfo ve geçersiz URL kabul edilmez. Rehber origin'leri için mevcut aynı-yol kuralı korunur. |
| v18.7.29 hızlı MAG köprüsü vardı; fakat türetilmiş kimlik önbelleği boşsa VOD sayfalaması başlamadan create_link denenmiyordu. | `verifiedXtreamEnrichment` full catalog ve enrichment girişinde aynı hesabın create_link'inden kimliği erken çıkarır. Canlı sıra önce Room'a bırakılmış olsa da tek örnek kanal saklanır. Film-only yenilemede sınırlı canlı örnek kullanılır. | Doğrulanmış Xtream API varsa Film/Dizi toplu alınır; yüzlerce Stalker sayfasına gerek kalmaz. İlk eklemenin live-first ve önceki prime çağrıları korunur. Saf Stalker panel sayfalama yedeğini kullanır. |
| Soğuk okuma sırasında depodan eski türetilmiş kimlik, eşzamanlı yeni create_link sonucunu ezebilirdi. | Hydrate, bellekte daha yeni `at` varsa eski depolanan değeri yazmaz. | Yeni portal kimliği eski snapshot'a dönmez; anahtar profil+portal+MAC kapsamındadır. |
| Güncelleme seçeneği yalnız dakika/saatti; alt hesaplama 1440 dk'ya kırpıyordu. | Yeni seçenekler ve 43200 dk üst sınır. | 1/2/3 gün, 1 hafta, 1 ay (30 gün) gerçekten uygulanır; 1 haftalık seçim 1 güne kırpılmaz. Mevcut kısa aralıklar ve varsayılan 15 dk korunur. |

## 3. Dosya bazında Opus'a devir

- **Yeni** `frontend/src/components/PlaylistDnsControls.tsx`: hesap üstü yönetim, aynı-panel rehber adayları, focus/profile sınırı, seri metadata yazımı ve rollback.
- **Yeni** `frontend/src/utils/playlistDnsManagement.ts`: adres üyeliği/birincil/yedek/binding güncellemesi ve güncel ilk kareden en iyi adres seçimi.
- `frontend/src/components/DnsManager.tsx`: toplu gerçek görüntü kuyruğu, tek-adres görüntü testi, auth gecikmesi, manuel aktifleştirme, ekleme/silme, hata gösterimi. Önceki toplu auth-only testi “Tüm hesapları test et” olarak ve yeni adresin otomatik hesap testi korunur. İptal düğmesi auth/video testlerini durdurur. Eski iptal veya kanal callback'i yeni DNS testini ilerletemez.
- `frontend/src/components/EndpointPlaybackTest.tsx`: kanıt ve tamamlanma callback'i upstream durdurulduktan sonra teslim edilir; toplam süre 45 sn, en fazla üç örnek kanal. İlk kare yalnız `VideoView.onFirstFrameRender` ile kaydedilir. Aktif ana player açılırsa test durur; player nesnesi kaynak boşaltılıp bırakılır.
- `frontend/app/(tabs)/settings.tsx`: hesap bölümünde ortak yönetici, yeni güncelleme sıklıkları.
- `frontend/app/edit-playlist.tsx`: aynı panelin mevcut/test edilmiş alternatifine geçişte otomatik rehber takibi gereksiz kapatılmaz; DNS üyeliği saklanır; Kaydet aşamasında oynatıcı tercihi güncellenir. Düzenleme ilk açıldığında selectedHosts da listelenir. MAG'da Kaydet, seçili adresleri de günceller; silinen adres sonraki açılışta eski binding'den geri gelmez.
- `frontend/src/utils/playlistEndpoints.ts`: seçili adreslerin aday izdüşümü, özel MAG URL desteği, son görüntü sonucu etiketi. Mevcut endpoint JSON bilgisi korunur.
- `frontend/src/types/index.ts`: isteğe bağlı yeni kanıt alanları. Room endpoint JSON depolaması ek alanları taşır; native şema/migration değişmedi.
- `frontend/src/utils/serverCode.ts`, `panelDnsFailover.ts`, `refreshPlaylist.ts`, `iptv.ts`: yukarıdaki auth/timeout/protection ve alternatif üyelik düzeltmeleri.
- `frontend/src/player/PlayerHost.tsx`: güncel birincil DNS adaylığı/tercih yeniden yükleme. Aynı hesabın birincili manuel veya commit edilmiş refresh ile değişince eski preferredHost yeni birincili ezemez; yeni adres hatırlanır ve deneme indeksi sıfırlanır. Gerçek effect fonksiyonu ayrıca çalıştırılarak eski A tercihinin yeni B'yi ezmediği sınandı.
- `frontend/src/utils/stalker.ts`: soğuk/film-only API köprüsü, 20 sn sınırlı keşif; doğrulanmış bulk VOD/Series ve saf Stalker yedeği; daha yeni kimliği koruyan hydrate.
- `frontend/src/utils/catalogOperations.ts`: aralık listesi/etiket ve gerçek süre hesabı.
- **Yeni** `tools/test-v18731-dns-catalog.js`: üretim TS/TSX koduyla davranış testleri. `tools/denetle.js` içine eklendi.
- `tools/test-mag-bulk-runtime.js`: modül yükleyicisinin göreli import çözümü; cold bridge'in ilk STB isteğinde CAPTCHA görüp hiçbir katalog isteğine devam etmemesi doğrulandı. Koruma assertion'ı kaldırılmadı; yeni gerçek istek sırasına uyarlandı.
- `frontend/app.json` ve `frontend/package.json`: beş sürüm alanı v18.7.31 RC1 / 180731. Bağımlılık eklenmedi.
- `AI-DEVIR-v18.7.30.md`: önceki normal APK'nın yayımlandığı ve 579 arşiv sürümü kaydı tamamlandı. `CLAUDE.md`: güncel devir işaretçisi yükseltildi.

## 4. Performans ve güvenlik sınırları

- “En iyi” ölçüsü gerçek ilk görüntü açılış süresidir; saatlerce yayın kararlılığı, bitrate kalitesi veya sürekli bant genişliği kıyaslaması değildir. Birkaç örnekte kare alınamaması bütün kanalların çalışmadığını kanıtlamaz. Satırda test tarihi ve sonucu görünür.
- Görüntü testleri bir DNS/renderer upstream'ini sırayla kullanır. Üç kanal bütün DNS'lerde aynı kanal kimliklerine denk gelmeyebilir; ölçüm o anki gerçek örnekler içindir. Auth-only testi yayın akışı açmaz.
- MAG hızlı yol her panelde çalışmaz: create_link kendi hesap kimliğini vermeli, gerçek API auth ve katalog örneği doğrulanmalı. Sadece URL'nin Xtream biçimine benzemesi yeterli değildir. Saf Stalker'da native pagination kalır. Olumsuz native-only köprü sonucu 1 saat / en fazla 512 kapsamlık bellekte tutulur; geçici hatalar bu başarı temelli olumsuz kayda yazılmaz.
- Film ve dizi katalogları birer toplu çağrıdır; toplam ağ isteği kesinlikle “yalnız 2” diye sunulmaz. Kimlik, örnek kanal ve kategoriler ayrıca gerekebilir. Gerçek süre panel/ağ/katalog büyüklüğüne bağlı; 17 dakikanın belirli saniyeye ineceği henüz cihazda ölçülmedi.
- Xtream'da toplu katalog yolu zaten vardı: `BulkPlaylistImportService.kt` canlı/film/dizi için `get_live_streams`, `get_vod_streams`, `get_series` çağrılarını ayrı future'larla alıyor; JS refresh de aynı bulk API işlevlerini kullanıyor. Var olan bu yol yeniden yazılmadı/“yeni eklendi” sayılmadı. Bu sürümdeki yeni hız düzeltmesi MAG'ın soğuk kimlik önbelleği yüzünden o yolu kaçırmasını giderir. Ekleme, liste düzenleme, ayarlar ve toplu refresh'in mevcut ortak Stalker katalog/enrichment girişleri korunur.
- `xtream-verified:` marker, backend türü ve dizi API sunucusu korunur. Önceki Stalker-ID → Xtream-ID geçişinde favori/progress devamlılığı ayrı bilinen risktir; bu tur sahte ID eşleştirmesi eklemez. Gerçek cihaz film/dizi/bölüm kabul testi zorunludur.
- Periyot mevcut uygulama açık/focus tazelik mekanizmasına uygulanır; Android kapalı uygulamayı her gün uyandıran yeni alarm/WorkManager servisi eklenmedi.
- Cloudflare/CAPTCHA/401/403/429 sinyalinde aynı işi DNS/proxy gezdirerek engel aşma yok; koruma ve bekleme kullanıcıya görünür. Ban bağışıklığı iddiası yok.
- Repo PRIVATE kaldı. Eski `b7e62889...` commit sunucuda 579 hesap arşiv metadata'sını hâlâ veriyordu. Kullanıcı public riskini kabul etti; **otomatik onay denetimi public yapma işlemini eski credential arşivinin anonim erişime açılacağı gerekçesiyle reddetti**. Ret başka araçla aşılmadı. Ayrıntı `.30` devir §11. İndirme için GitHub oturumu/erişimi gerekir; bu turda credential içerikleri, APK/log/temp dosyaları commit edilmez.

## 5. Doğrulama ve araştırma

Yeni davranış testleri üretim modüllerini çalıştırır; network/renderer sınırında sentetik örnekler kullanılır. Bunlar gerçek IPTV panelinde görüntü görüldüğü iddiası değildir.

1. Birincil/yedek/strict seçimin birlikte saklanması; birincil flag'in tek olması; doğrulanmamış DNS'e kanıt uydurulmaması; özel MAG port/yolun korunması.
2. Daha yeni başarısız ilk kare testinin eski başarıyı en iyi seçimden çıkarması; en hızlı güncel kare seçimi.
3. 1/2/3/7/30 gün aralıklarının gerçek süre sınırı.
4. Gerçek panel çözümleyicide auth=0 ve yerel süre aşımından sonra B adresi; ebeveyn iptalinde duruş; süre dolma yarışında da CF/429 duruşu.
5. Gerçek `xtGet` üzerinde 429: bir istek, RATE_LIMIT türü, host cooldown ve release cleanup; gizli ikinci inline istek yok.
6. Gerçek DNS TSX kuyruğu: A reddi → B kare → C kare; B daha hızlıysa seçilir. Geç gelen A callback'i, iptal ve koruma kuyruğu ilerletemez.
7. Gerçek hesap üstü kontrol TSX'i: ilk metadata yazımı hata verirken sonraki tam izdüşüm doğru kaydolur; son yazma hata verirse birincil/tercih geri alınır; focus kaybı eski callback'i engeller.
8. Gerçek MAG köprü fonksiyonu: boş kimlik önbelleği/tek örnek, film-only bounded sample, saf native tekrar önbelleği, API auth=0'da yükseltmeme, CF'de duruş; aynı anda türetilen yeni kimliğin eski storage snapshot'ıyla ezilmemesi.
9. Önceki auth-only toplu test ve yeni adres otomatik auth testi, korumada duruş ve iptalden sonra gelen başarıyı yok sayma.

Birincil kaynaklar: kullanılan [Expo SDK54 Video API](https://docs.expo.dev/versions/v54.0.0/sdk/video/) (`onFirstFrameRender`, manuel oluşturulan player release sorumluluğu); [Android Media3 Player](https://developer.android.com/reference/androidx/media3/common/Player) (READY ile render kanıtının ayrımı); [Cloudflare challenge tespiti](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/) (`cf-mitigated: challenge`). Kurulu SDK ve mevcut kaynak kodu esas alındı; motor/dependency yükseltilmedi.

## 6. Cihaz kabul senaryoları

1. Sunucu kodlu bir Xtream ve elle girilmiş Xtream hesabında Ayarlar → Hesap Bilgileri → DNS adreslerini test et. Auth/katalog ve gerçek ilk kare sonucunun ayrı olduğunu kontrol et.
2. Birincil DNS'i erişilemez yap, diğer DNS sağlam olsun. Yenileme aynı panelin veya kullanıcının eklediği kapsamın adresine geçmeli; katalog Room'da korunmalı.
3. “En iyi çalışanı seç” yalnız kare verenlerden seçim yapmalı; hepsi başarısızsa aktif DNS değişmemeli. Aktif player açıkken test ayrı stream açmamalı.
4. Düzenleme ekranında DNS değiştirip Kaydet'e basmadan çık; aktif liste aynı kalmalı. Kaydet ile değiştir; eski Room kanal URL'sinden yeni birincil kullanılmalı.
5. MAG özel path/portlu alternatif ekle; hesap/görüntü test et ve aktif yap; yeniden açınca adres ve sonuç korunmalı. Strict modda seçilmemiş rehber adresi denenmemeli.
6. Xtream destekli MAG'da ilk ekleme, “tümünü güncelle”, yalnız film/dizi yenileme ve yeniden başlatma sonrası soğuk yenileme. Canlı önce görünmeli; film/dizi listesi tam kalmalı; film ve dizi bölümü gerçekten açılmalı.
7. Saf Stalker panel ve koruma cevabı: yedek sayfalama çalışmalı; CAPTCHA/429 sonrasında başka DNS'e saldırgan tekrar olmamalı.
8. İki profil, test sırasında sekmeden çıkma, iptal, yeni DNS testi ve kalıcı kayıt hatası. Eski callback yeni hesabın sonucunu/aktif DNS'ini değiştirmemeli.

## 7. Teslim kaydı ve PC DEV komutu

PC komutu:

```powershell
cd C:\Projeler\kizilkan-player-elite
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-dev.ps1 -Install
```

DEV ayrı paket `com.gpt.kizilkan.player.dev`; normal uygulamanın üstüne kurulmaz. JDK/SDK ortam ayarları yalnız build sürecinde uygulanır. Bağlı/yetkili tek telefon varsa `adb install -r -g`; yoksa APK PC'de bırakılır. Normal GitHub build ayrıca `build_type=release`, `make_release=true`, `new_architecture=true` ile manuel tetiklenir. Release-first kota düzeltmesi korunur; normal APK ve boyut raporu Release assets altında bulunur.

- Yeni v18.7.31 davranış testleri: **PASS**.
- TypeScript son kontrol: **PASS**, `.codex-v18731-tsc-final.log`.
- Tam denetim: **142 kontrol temiz**, `.codex-v18731-denetle-authorized.log`, exit 0. İlk sandbox koşusunda yalnız offline Git Bash yayınlama testi Windows nesne erişiminden çalıştırılamadı; izinli koşuda bu test ve bütün kapılar geçti. Kapı atlanmadı/gevşetilmedi. Son DNS seçim/player follow-up davranış testleri ayrıca PASS.
- DEV APK hash/kurulum, commit/push, manuel normal release ve indirme bağlantısı: yürütüm tamamlandığında aşağıya eklenir.

### Kaynak commit / manuel koşu

- Uygulama ve test/devir commit'i: `8b7f42f4ac70225a938740813d4df55c193b649e`, origin'de ayrı `codex/v18.7.31-dns-tests-fast-catalog` dalına push edildi. Ana dal değiştirilmedi.
- Manuel normal build: [38141649385 / build 154](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/38141649385). `headSha` commit ile doğrulandı; workflow_dispatch, release / make_release=true / new_architecture=true. Sonuç henüz bu satır yazılırken tamamlanmadı.
- Son küçük DNS/player takip değişikliklerinden sonra `test-v18731-dns-catalog.js`, 15 grupluk profil/katalog yarış testleri, 6 grupluk v18.7.30 sağlamlık testleri ve son TypeScript kontrolü ayrıca geçti. `git diff --check` temiz. Paket sürümü beş alanda yükseltildi; prebuild package.json betiklerini değiştirmedi.

### Yerel DEV / telefon teslimi

- `tools/build-dev.ps1 -SkipChecks -Install`, zorunlu kontroller ayrıca tamamlandıktan sonra yürütüldü. **BUILD SUCCESSFUL, 5 dakika 5 saniye**, 475 görev; `.codex-v18731-dev-build.log`.
- APK: `artifacts/KIZILKAN-18.7.31-RC1-DEV.apk`. SHA-256 **`d6f9e24ff544d8b473422d07f1b71029cb3230544b7e51e1085edd94b71ac9b9`**. AAPT: paket `com.gpt.kizilkan.player.dev`, versionCode=180731, versionName=18.7.31-dev, etiket KIZILKAN DEV.
- Son Metro sourcemap içinde bu commit'te değişen **14 çalıştırılabilir TS/TSX kaynak** mevcut proje dosyalarıyla birebir eşleşti. Type alanları tsc ile doğrulandı. APK'daki `assets/index.android.bundle` hash'i son Gradle bundle çıktısıyla aynı.
- İlk bağlantı kontrolünde telefon yoktu; derleme biterken telefon yetkili olarak bağlandı. Betik `adb install -r -g` ile **Success** döndürdü. Telefon dumpsys: 180731 / 18.7.31-dev, lastUpdateTime=11.10.2026 16:07:55. Telefondaki kurulu base.apk SHA-256 PC dosyasıyla birebir aynı. Normal paket/verileri kaldırılmadı. Kullanıcıya kurulumun tamamlandığı ve telefonu çıkarabileceği bildirildi.
- Kurulum ve dosya bütünlüğü doğrulandı; gerçek IPTV DNS/görüntü, film/dizi ve performans kabul senaryoları henüz yapılmış sayılmaz.

### Normal (release) APK telefon teslimi — Opus, 11.10.2026

- Manuel koşu [38141649385](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/38141649385) **tamamlandı: success, 47 dk 56 sn** (yukarıdaki "henüz tamamlanmadı" satırının gerçek sonucu).
- Release **build-154** assets: `KIZILKAN-PLAYER-ELITE-v18.7.31-build154.apk` (**385.415.447 bayt**) + `APK-BOYUT-RAPORU-v18.7.31.txt`. Actions artifacts yine BOŞ — release-first kota düzeltmesi beklendiği gibi çalışıyor; APK yalnız Releases altında.
- Telefon OnePlus 7 Pro (`c3a4097e`). Kurulum öncesi: normal paket **18.7.29**, DEV 18.7.31-dev.
- `adb install -r -d` → **Success**. Kurulum sonrası `com.gpt.kizilkan.player` **18.7.31**. Paket kaldırılmadı, liste/Room verisi korundu. DEV paketi dokunulmadı.
- Bütünlük: PC APK ile telefondaki `base.apk` SHA-256 **birebir aynı** —
  `724fc060803f51fc1dfaa79916438eeb90d55e1798077c29e47823b3a7a10e50`.
- Açılış kontrolü (CLAUDE.md §7 "derleme geçti ≠ çalışıyor"): uygulama LAUNCHER ile açıldı,
  `mResumedActivity = com.gpt.kizilkan.player/.MainActivity`, süreç pid 3039 ayakta,
  12 saniyelik logcat penceresinde **FATAL EXCEPTION / crash / ANR YOK**. Uygulama force-stop edilmedi.
- **Yapılmamış sayılan:** §6'daki 8 cihaz kabul senaryosunun hiçbiri. Açılış ≠ kabul; gerçek IPTV
  DNS/görüntü testi, film/dizi kataloğu ve performans ölçümleri kullanıcı tarafından yapılacak.

### Depo görünürlüğü / kimlik temizliği — Opus, 11.10.2026

- Depo public'e çevrilmek istendi. Tarama: keystore/`.env`/token geçmişte HİÇ commit edilmemiş;
  ama dokümanlarda + kod yorumlarında + test fixture'larında GERÇEK abonelik verisi vardı.
- Commit `d02cc131` (bu dalda, push edildi): 49 dosya / 222 değişim — kullanıcı adı, iki şifre,
  MAG MAC (+base64 yeniden hesaplandı) ve 5 panel alan adı yer tutucuya çevrildi
  (`panel-a.example`…`panel-e.example`). Gerçek→yer tutucu tablosu yalnız yerel, gitignore'lu
  `KIZILKAN-HESAP-ARSIVI-panel-eslesme.txt` dosyasında.
- Davranış değişikliği yok: tek işlevsel fark tanı etiketi `HKPREMIUM_PCAP_HANDSHAKE` →
  `PANEL_A_PCAP_HANDSHAKE`; bu değeri okuyan başka kod yok. Doğrulama: tsc temiz,
  `denetle.js` TÜM TEMİZ, MAG testleri + v18711/18713/18722 kapıları PASS.
- **Depo hâlâ PRIVATE.** Görünürlük değişikliği izin sınıflandırıcısı tarafından engellendi;
  kullanıcı kendi çalıştıracak: `gh repo edit mkizilkan/kizilkan-player-elite --visibility public
  --accept-visibility-change-consequences`.
- **Kullanıcının bilerek kabul ettiği kalan risk:** aynı değerler git geçmişinde, 22 uzak dalda ve
  17 etikette (`build-128`…`build-153`) okunabilir durumda. Yalnız tip temizlendi. Kalıcı çözüm ya
  geçmiş yeniden yazımı ya da sağlayıcıdan panel-a şifresinin sıfırlanmasıdır.
