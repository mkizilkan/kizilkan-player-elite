# GPT — Python kaynaklarından alınabilecek fikirler ve mevcut özelliklerin geliştirilmesi

Tarih: 08.10.2026. İncelenen proje: KIZILKAN PLAYER ELITE v18.7.27 RC1.

İnceleme tabanı: `v18.7.27-rc1-ci-disk-budget`, commit `43cc02c6c38b3e3e3b151eddc73994e4ef3e1cef`.

Bu rapor hem **yeni özellikleri** hem **bizde bulunan özelliklerin geliştirilebilecek kısımlarını** kapsar. İlk yedi dosyalık incelemede uygulama kodu değiştirilmedi; APK üretilmedi, commit/push yapılmadı. Yedi Python dosyası çalıştırılmadan, metin ve AST üzerinden incelendi. Toplam 28.687 satırın yapısı, ilgili işlevleri ve bizim kodla bağlantısı değerlendirildi. Yedi dosyanın Python sözdizimi ayrıştırması başarılıdır; bu, çalışma sırasında doğru sonuç verecekleri anlamına gelmez. Bu programlarla gerçek portal/hesap testi yapılmadı.

**08.10.2026 ek inceleme:** PY10'un mevcut durum değerlendirmesi düzeltildi. Genel ayrıştırıcı yanında `add-playlist.tsx:436` içindeki birleştirme akışı da tekrar ayıklıyor ve uyarı veriyor; ancak bütün hesap anahtarını küçük harfe dönüştürüyor. Bu, harf duyarlı kimlik bilgilerini yanlış birleştirebilir. Kullanıcının sonraki açık isteğiyle yalnız proxy kaynakları v18.7.28'de genişletildi. Ayrıntı: [iki dosyanın ek incelemesi ve MD doğrulaması](C:/Projeler/kizilkan-player-elite/GPT-ALPHA-TEAM-WOLFS-EK-INCELEME-2026-10-08.md).

En fazla faydayı sağlayacak işler: kalıcı kayıt/kurtarma akışını güvenilir hale getirmek; MAG hesabının doğrulanmış Xtream API'sini normal yenilemede de kullanmak; katalog ile gerçek görüntü kanıtını ayırmak; çalışan DNS'lerin geçmişini tutmak. QR ve Excel benzeri dışa aktarma bundan sonra gelir.

## 1. Kaynak dosyalar

| Kod | İncelenen dosya | Satır | İşimize yarayabilecek tarafı |
|---|---|---:|---|
| P1 | [ALPHA-PRO-SCAN-VPN V3.3.5](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py>) | 7.455 | Hesap/kategori raporu, dosyaya ekleyerek kayıt, dönüşüm araçları, bağlantı tanısı. |
| P2 | [ALPHA-TEAM BATTALION V3.3.8](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-TEAM_BATTALION_V3.3.8WAR_MACHINE.py>) | 7.935 | P1 ile ortak tarama çekirdeği, kayıtlı sunucular ve ek masaüstü arayüzü. |
| P3 | [ALPHA-WOLFS-TOOLS](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS.PY>) | 8.357 | Kategoriye göre M3U ayırma, QR üretimi, giriş dosyasındaki tekrarları raporlama, DNS tanısı. |
| P4 | [Hybrid-Omega V15](<C:/Users/KIZILKAN YOGA/Desktop/Hybrid-Omega-V15.py>) | 704 | Giriş, yayın bağlantısı ve kategorileri ayrı aşamalarda raporlama. |
| P5 | [B.Rokasi v4.0 ULTIMATE](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi v4.0 ULTIMATE 🏴‍☠️.py>) | 1.646 | Sunucu sağlık istatistiği, tekrar deneme, Excel/oturum raporu, içerik bölgesi etiketleri, MAG → Xtream doğrulama fikri. |
| P6 | [B.Rokasi Dual Scanner v3.0](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi Dual Scanner v3.0 🏴‍☠️.py>) | 1.340 | MAG yayın adresinden Xtream bilgisi çıkarma ve API ile kontrol etme. |
| P7 | [B.Rokasi Dual Scanner — sürüm numarasız](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi Dual Scanner 🏴‍☠️.py>) | 1.250 | Eski MAG/kategori raporu; daha yeni dosyalara göre ek değeri sınırlı. |

P1 ve P2'nin `check_mac`, `_mac_auto_portal_scan`, `convert_mac_to_m3u`, `test_image_stream`, `verify_playlist`, `is_hit_valid`, `fetch_categories_and_counts`, `_calculate_eta` işlevlerinin AST içerikleri aynıdır. İsim ve arayüz farkını farklı veya daha başarılı bir portal motoru olarak değerlendirmemek gerekir. Bu bulgu bu sekiz işlevle sınırlıdır; iki dosyanın tamamı aynı değildir.

## 2. Eklenebilecekler ve mevcut özelliklerde yapılabilecek geliştirmeler

“Mevcut durum” sütunundaki K numaralarının dosya/satır kanıtları bölüm 3'tedir. Kaynak programdaki bir fikrin bulunması, önerdiğim bütün uyarlamanın o programda hazır olduğu anlamına gelmez.

| ID / tür / öncelik | Kaynak fikir | Bizde mevcut durum | Yapılması gereken | Yapılınca kullanıcıya faydası |
|---|---|---|---|---|
| **PY01 — Geliştirme — Yüksek** | P5 `mac_extract_xtream:690`, `mac_xtream_verify:707`; P6 `494/517`. | MAG yayınından kullanıcı adı/şifre çıkarma ve doğrulanmış Xtream ile Film/Dizi çekme zaten var. Hızlı yol `stalkerEnrichment` içinde; normal yenileme `stalkerCatalog` üzerinden sayfalamaya gidiyor. **K01–K02.** | Hesap+portal+profil kapsamındaki doğrulanmış köprüyü normal Film/Dizi yenilemesine de taşı. API doğrulaması başarılıysa tür başına toplu katalog; başarısızsa Stalker yedeği. Canlı katalog ve oynatma eşlemelerini koru. | Xtream altyapılı MAG panellerinde çok sayıda sayfa isteği azalabilir. Normal güncelleme de ekleme sırasında kullanılan hızlı yoldan yararlanır. Saf Stalker paneller çalışmaya devam eder. |
| **PY02 — Geliştirme — Yüksek** | P4 `full_check:332`; P1 giriş/kategori/yayın raporu. | Hesap, katalog ve ilk kare kanıt alanları var. Çoklu “Canlı Katalog Test Et” yalnız katalog döndüğünü ölçüyor; hata nedeni `catch` içinde kayboluyor. Gerçek ilk kare testi ayrı bileşende mevcut. **K03–K05.** | Sonucu “Hesap doğrulandı / Katalog alındı / Yayın yanıtı alındı / İlk kare görüldü” olarak aşamalı göster. Zaman aşımı, 401, 429, HTML/challenge, boş katalog ve iptali ayır. Kullanıcının seçtiği hesaplarda gerçek ilk kare testi yap. | “Bulundu ama açılmıyor” sorununun hangi aşamada olduğu anlaşılır. Bir katalog yanıtı yanlışlıkla görüntü başarısı sayılmaz. |
| **PY03 — Geliştirme — Yüksek** | P5 `health_record:252`, `health_score:261`, `pick_best_panel:267`. | Yedek DNS ve son ilk kare alınan adresi hatırlama var; uzun dönem başarı/gecikme geçmişi aynı kapsamda tutulmuyor. **K06.** | Kullanıcının hesabı için doğrulanmış adreslerde son başarı, ilk kare süresi, geçici ağ hatası ve kontrol zamanı tut. Seçimi taze ölçümlere göre yap; hatalı şifreyi sunucu arızası sayma. | Canlı kanal için daha hızlı ve yakın zamanda çalışmış adres öne çıkar. Bozuk DNS'te tekrar tekrar bekleme azalabilir. |
| **PY04 — Geliştirme — Yüksek** | P5 `make_session:92` içindeki sınırlı retry/backoff. | MAG ve native taramada host bekletme ve `Retry-After` var. MAG TS ve native kod, saniye ve HTTP-tarih biçimini zaten ele alıyor. Ortak Xtream `xtGet` ise ilk hatadan sonra sabit 350 ms ile tekrar deniyor. **K07–K08.** | Xtream katalog/test akışına da durum koduna göre sınırlı tekrar, host bekletme ve iptal edilebilir bekleme uygula. 401/403 gibi kalıcı hesap retlerini otomatik tekrar etme. | Geçici yoğunlukta yanlış “çalışmıyor” sonucu azalır; aynı sunucuya gereksiz yük bindirilmez. Ban bağışıklığı sağlamaz. |
| **PY05 — Geliştirme — Kritik** | P1 `_mac_save_hit:2349`; P2 `2415`: append, flush, fsync fikri. | Şifreli kalıcı tarama günlüğü, TXT kopyası ve yazım hash kontrolü zaten var. TXT için bütün sonuçlar yeniden okunup dosya yeniden üretiliyor; önceki raporda kurtarma/geri yükleme uyumsuzluğu ve görünür durum hataları doğrulandı. **K09–K10.** | Kalıcı DB'yi ana kayıt olarak koru; dosya çıktısını iş kuyruğuyla, artan kayıt imleci ve toparlanabilir yazım yöntemiyle güncelle. “DB'de kayıtlı / TXT'ye yazıldı / playlist'e eklendi” sayılarını ayrı göster. Kendi çıktısını kendi içe aktarıcısı okuyabilsin. | Şarj bitmesi/kapanma sonrasında bulunan hesaplar anlaşılır biçimde geri gelir. TXT yazımı taramanın her adımında tüm geçmişi işlemeyi gerektirmez. |
| **PY06 — Geliştirme — Orta** | P1 `fetch_categories_and_counts:3983`; P5 `mac_scan_one:720` ve raporu. | MAG TXT'de Canlı/Film/Dizi kategori adları ve uyarılar zaten var. Ortak Xtream arşiv kaydı aynı kategori alanlarını taşımıyor. DNS kanıtları iki tarafta da mevcut. **K11–K12.** | MAG ve Xtream için ortak rapor alanlarını tamamla: kategori adları, gerçekten alınan benzersiz içerik sayıları, doğrulanmış DNS'ler, bitiş ve kontrol zamanı. Kategori/öğe alınamadıysa “boş” yerine alınamadığını yaz. | İki hesap türünün TXT çıktısı benzer ayrıntıda olur; hangi DNS'in ve kategorinin gerçekten doğrulandığı anlaşılır. |
| **PY07 — Yeni — Orta** | P3 `_do_split:5612`; P1 M3U yazma fikri. | Kategori seçimi ve M3U içe alma var; seçili Room içeriklerini kullanıcıya M3U olarak dışa aktaran genel akış bulunamadı. **K13.** | Seçili kanalları/kategorileri Room'dan sayfalı oku; ad, logo, grup, EPG ve gerekli desteklenen başlık bilgisini koruyarak M3U dışa aktar. Yalnız doğrulanmış oynatma adresleri kullan. | Kullanıcı tüm katalog yerine istediği içerikleri başka cihaz/oynatıcıya aktarabilir. |
| **PY08 — Yeni — Orta** | P5 `export_excel:485`. | TXT/JSON ve CSV içe alma var; bulunan hesapların kullanıcıya CSV/XLSX tablo dışa aktarımı bulunamadı. **K12–K14.** | Önce seçili veya tüm kayıtları CSV olarak dışa aktar; veriyi bellek penceresinden değil kalıcı günlükten oku. İstenirse daha sonra XLSX ekle. Güvenli rapor ve tam arşiv ayrımını koru. | Excel'de bitiş, katalog, DNS ve sonuç durumunu filtreleme/sıralama kolaylaşır. Ek paket gerektiren XLSX ikinci aşama olabilir. |
| **PY09 — Geliştirme / yeni filtre — Orta** | P5 `detect_regions:451`, `write_regional_hits:463`; P1 kategori gruplama. | Kategori seçimi var; bu kaynaklardaki gibi ortak ülke/dil etiketiyle hesap sonucu filtreleme bulunamadı. | Kategori adlarından önerilen ülke/dil etiketleri çıkar; kullanıcı düzeltmesine izin ver. Aynı hesap birden fazla etiket alabilsin, hesap sayısı çoğalmasın. | Örneğin Türkçe ağırlıklı içerik veren hesapları bulmak kolaylaşır. Sunucunun bulunduğu ülke, içerik dili yerine kullanılmaz. |
| **PY10 — Geliştirme — Yüksek** | P3 `_do_combo_dedup:7373`. | Genel hesap ayrıştırıcısının üstündeki UI birleştirme akışında tekrar ayıklama ve uyarı zaten var. Ancak kullanıcı adı+şifre+konum anahtarının tamamı `toLocaleLowerCase("tr")` ile değiştiriliyor. **K11, K14.** | Mevcut tekrar ayıklamayı koru; yalnız sunucu adresi gibi harf duyarsız alanları normalleştir. Kullanıcı adı/şifre harf büyüklüğünü değiştirme. Boş/geçersiz/tekrar kayıtlar için sayısal özeti geliştir. | Farklı parola veya kullanıcı adı taşıyan hesaplar yanlışlıkla aynı sayılmaz. Kullanıcı mevcut temizleme uyarılarını daha anlaşılır görür. |
| **PY11 — Geliştirme — Orta** | P5 `generate_daily_report:535`; P1 `_calculate_eta:1002`. | Geçen/kalan süre, native oturum günlüğü ve ayrıntılı tanı raporu zaten var. **K09, K15.** | Teknik raporun yanına anlaşılır oturum özeti koy: girişte kaç hesap, kaç benzersiz abonelik, kaç DNS sonucu, kaç DB/TXT/playlist kaydı; hata sebepleri ve süreler. | Kullanıcı “678 bulundu ama 239 görünüyor” gibi farkların sebebini takip edebilir. Mevcut ETA yeniden yazılmak zorunda değildir. |
| **PY12 — Yeni — İsteğe bağlı** | P3 `_do_qr:7018`: yerel QR PNG üretimi. | Uygulama kaynaklarında QR üretme/okuma akışı bulunamadı. | Kullanıcının seçtiği hesap veya liste bilgisini yerel QR ile aktarma tasarla. Telefon → TV için eşleştirme/süre sınırı seçilecekse bu ek tasarım işidir; kaynak dosyada bunlar yok. | TV kumandasıyla uzun adres, kullanıcı adı ve şifre yazma ihtiyacı azalır. |
| **PY13 — Geliştirme — Düşük/Orta** | P1 DNS/TLS yardımcıları; P3 `_do_dns_lookup:3875`. | Tanı raporu, DNS yönetimi ve MAG challenge/rate-limit gözlemi zaten var. **K06–K08, K15.** | Kullanıcının verdiği portal için anlaşılır bağlantı kartı: DNS çözüldü mü, HTTPS doğrulandı mı, API JSON mu HTML mi, challenge mı istek sınırı mı, hangi bağlantı üzerinden ve ne zaman gözlendi? | Kullanıcı “portal bulunamadı” sonucunun ağ, sertifika, yol, hesap veya koruma kaynaklı olduğunu ayırt edebilir. |

## 3. Bizim koddan doğrulama bağlantıları

| Kanıt | Dosya/satır | Doğrulanan mevcut davranış |
|---|---|---|
| K01 | [stalker.ts:3042](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:3042), [stalker.ts:3353](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:3353) | `stalkerEnrichment`, hesap/profil/portal kapsamındaki türetilmiş kimlikle API canlı katalog kontrolü yaptıktan sonra `xtreamVod` ve `xtreamSeries` çağırıyor. URL şekli tek başına yeterli görülmüyor. |
| K02 | [refreshPlaylist.ts:360](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/refreshPlaylist.ts:360), [stalker.ts:2925](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2925), [stalker.ts:2564](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:2564) | Normal MAG yenileme `stalkerCatalog` → `runStalkerCatalog` → sayfalı VOD/Series yolunu kullanıyor. Hızlı köprü bu ortak yola taşınmamış. |
| K03 | [add-playlist.tsx:321](/C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:321), [iptv.ts:456](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:456) | “Canlı Katalog Test Et” `get_live_streams` yanıtının dizi olduğunu ve sayısal stream ID'lerini ölçüyor. `catch` hata nedenini saklamadan `err` durumuna indiriyor. |
| K04 | [playlistEndpoints.ts:26](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/playlistEndpoints.ts:26), [EndpointPlaybackTest.tsx:64](/C:/Projeler/kizilkan-player-elite/frontend/src/components/EndpointPlaybackTest.tsx:64) | Hesap/katalog/oynatma/ilk kare kanıtı ayrı. Test bileşeni ilk kareyi `onFirstFrameRender` ile doğruluyor. |
| K05 | [PlayerHost.tsx:4075](/C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:4075), [PlayerHost.tsx:4101](/C:/Projeler/kizilkan-player-elite/frontend/src/player/PlayerHost.tsx:4101), [streamTest.ts:83](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/streamTest.ts:83) | Asıl oynatıcıda çalışan host ve `FIRST_FRAME` ölçümü mevcut. Bağlantı testi HTML/JSON ve HLS imzasını ayrıca ayırıyor. Bu kontrol yine dekoderin kare üretmesiyle aynı kanıt değildir. |
| K06 | [hostFailover.ts:65](/C:/Projeler/kizilkan-player-elite/frontend/src/player/hostFailover.ts:65), [types/index.ts:168](/C:/Projeler/kizilkan-player-elite/frontend/src/types/index.ts:168), [DnsManager.tsx](/C:/Projeler/kizilkan-player-elite/frontend/src/components/DnsManager.tsx) | Yedek adresler ve adres kanıtları mevcut. `rememberWorkingHost` son çalışan origin'i saklıyor; ayrıntılı geçmiş/ölçüm puanlaması bu işlevin davranışı değil. |
| K07 | [magBulkScan.ts:64](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:64), [stalker.ts:1150](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:1150), [ScanWorkCoordinator.kt:135](/C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanWorkCoordinator.kt:135) | MAG host istek kapısı ve `Retry-After` desteği zaten var. Hem süre hem HTTP-tarih ayrıştırılıyor. Bunlar yeni özellik olarak sayılmamalı. |
| K08 | [iptv.ts:352](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:352), [stalker.ts:159](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:159), [magResponseFingerprint.ts:9](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/magResponseFingerprint.ts:9) | Ortak Xtream isteği iki deneme ve 350 ms sabit bekleme kullanıyor. MAG tarafında `cf-mitigated: challenge` gözlemi ve güvenli yanıt başlığı kaydı zaten var. |
| K09 | [ScanJournalStore.kt:144](/C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanJournalStore.kt:144), [ScanJournalStore.kt:173](/C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanJournalStore.kt:173) | Kalıcı sonuç yazımı ve imleçle sonuç okuma mevcut. Yeni öneri “DB eklemek” değil; mevcut kaydı, ekranı ve dosya çıktısını tutarlı hale getirmek. |
| K10 | [ScanSafetyBackup.kt:16](/C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanSafetyBackup.kt:16), [önceki cihaz/kurtarma raporu](/C:/Projeler/kizilkan-player-elite/GPT-v18.7.27-CIHAZ-KURTARMA-KATALOG-MIMARI-2026-10-08.md) | TXT projeksiyonu günlükteki bütün sayfaları tekrar okuyup dosyayı yeniden yazıyor, sonra hash ile doğruluyor. Önceki rapor gerçek cihazdaki kurtarma ve okuyucu uyumluluğu sorunlarını kapsıyor. |
| K11 | [magBulk.ts:137](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulk.ts:137), [mag-bulk.tsx:490](/C:/Projeler/kizilkan-player-elite/frontend/app/mag-bulk.tsx:490), [magBulk.ts:164](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulk.ts:164) | MAG kategori önizlemesi, kategorili TXT ve portal+MAC kimliği mevcut. Bunları yok kabul edip yeniden eklememek gerekiyor. |
| K12 | [accountArchive.ts:7](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/accountArchive.ts:7), [accountArchive.ts:30](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/accountArchive.ts:30) | Ortak Xtream arşivinde giriş/hesap/DNS bilgisi var; kayıt tipinde Canlı/Film/Dizi kategori özetleri bulunmuyor. Maskeli rapor ve tam arşiv ayrımı mevcut. |
| K13 | [iptv.ts:154](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/iptv.ts:154), [add-playlist.tsx:370](/C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:370) | M3U ayrıştırma ve içerik/kategori seçimi mevcut. `frontend/app`, `frontend/src` ve uygulama modüllerindeki incelemede kullanıcıya yönelik seçili içerik M3U dışa aktarma akışı bulunamadı. |
| K14 | [bulkAccounts.ts:175](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/bulkAccounts.ts:175), [bulkAccounts.ts:234](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/bulkAccounts.ts:234), [add-playlist.tsx:436](C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:436) | URL/TXT/CSV/JSON girişi mevcut. Genel ayrıştırıcı geçerli satırları döndürüyor; UI birleştirmesi tekrar ayıklıyor. UI anahtarı `username + password + locator` bütününü küçük harfe çevirdiğinden farklı kimlik bilgileri birleşebilir. |
| K15 | [add-playlist.tsx:162](/C:/Projeler/kizilkan-player-elite/frontend/app/add-playlist.tsx:162), [diagnostics.ts:943](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/diagnostics.ts:943) | ETA ve ayrıntılı tanı raporu mevcut. Öneri bunların yanına DB/TXT/playlist durumunu açıklayan kullanıcı özeti eklemek. |

## 4. En önemli geliştirmelerin uygulanma şartları

### PY01 — MAG yenileme hızının artırılması

Kaynak programların katkısı, yayın adresinden gerçek Xtream kimliği çıkarıp API ile sınama fikridir. Normal yenileme mimarisi bizim kodda ayrıca düzenlenmelidir. P1'in `convert_mac_to_m3u` işlevi hızlı Xtream katalog yenilemesi değildir; kanal listesi alıp tahmini `play/live.php` adresleri yazar. Bu işlevi doğrudan geçirmek hkpremium sorununu çözmez.

Bizdeki doğru başlangıç noktası `stalkerEnrichment` içindeki mevcut doğrulanmış köprüdür. Normal yenilemeye taşınırken:

- Türetilmiş bilgiyi başka MAC, portal veya kullanıcı profiline taşıma.
- Hesap ve canlı katalog doğrulamasını koru; HTTP 200'ü yeterli sayma.
- Kullanıcının seçtiği Canlı/Film/Dizi kapsamına uy. Canlı ilk görüntüyü bekleyen kullanıcıyı Film/Dizi'nin bitmesine bağlama.
- Xtream stream ID'sini MAG `cmd` alanı gibi yorumlama. `catalogBackend`/`catalogApiServer` ve oynatma/bölüm çözümlemesini koru.
- Büyük Film/Dizi listelerini benzersiz kimliğe göre say; ham satır sayısını toplam içerik diye yazma.
- Başarısız veya eksik alınmış bir tür için mevcut sağlam Room kataloğunu silme.
- Saf Stalker panelde kontrollü sayfalama yedeğini koru.
- Yalnız Film ve Dizi toplu liste çağrıları iki istektir. Giriş doğrulaması, canlı örnek, kategori ve bölüm ayrıntıları ayrıca istek gerektirebilir. “Tüm işlem daima iki istek/saniyeler” garantisi verme.

Önceki cihaz/API ölçümleri [katalog mimarisi raporunda](/C:/Projeler/kizilkan-player-elite/GPT-v18.7.27-CIHAZ-KURTARMA-KATALOG-MIMARI-2026-10-08.md) bulunuyor. Buradaki hız önerisi o kanıtla ve mevcut kod yoluyla bağlantılıdır; Python dosyalarını bu turda çalıştırarak elde edilmiş yeni bir süre ölçümü değildir.

### PY02 — Gerçek görüntü ile katalog kontrolünün ayrılması

P4'te kullanıcı adının yanıt içinde bulunması giriş başarısı sayılıyor; yayın URL'sindeki 200/302 de “Stream OK” oluyor. P1 testi ilk veri parçasını okuyup durum kodundan etiket üretiyor. İkisinde de gerçek görüntü karesi çözümlenmiyor. Alınabilecek fikir **aşamaları ayrı raporlama**, alınmaması gereken bölüm ise başarı kararının zayıflığıdır.

Bizim asıl oynatıcının ilk kare ölçümü korunmalı. İstenirse seçili hesaplar için gerçek test kuyruğu eklenmeli; hesap başına eşzamanlı ikinci yayın açılmamalı. Kaynak/oturum değişince eski kare olayı yeni hesaba başarı yazmamalı. Test sonucu kullanılan adresi, motoru, zamanı ve ilk kare süresini taşımalı. Bir örnek kanalın başarısızlığı bütün hesabın hiçbir içeriğinin çalışmadığını kanıtlamaz; kullanıcı başka bir kanal seçebilmelidir.

Gerçek render olayı, HTTP yanıtından ayrı bir ölçüttür; Media3 bunu `onRenderedFirstFrame` ile bildirir. [Android Media3 resmi API belgesi](https://developer.android.com/reference/androidx/media3/exoplayer/analytics/AnalyticsListener#onRenderedFirstFrame(androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime,java.lang.Object,long)).

Bu Python dosyalarında Media3/VLC/MPV motorlarının tamponlama, dekoder veya timeshift mimarisini geliştirecek bir Android oynatıcı uygulaması bulunmadı. Canlı açılışta fayda, doğru DNS seçimi ve gereksiz ön doğrulama/yenileme işini azaltmaktan gelebilir; motor ayarları mevcut `FIRST_FRAME` ölçümlerine göre ayrıca incelenmelidir.

### PY03 — DNS sağlık geçmişi

P5'in “test edilmemiş sunucuya %100 sağlık”, “en iyi üçten rastgele seç” ve bütün başarısızlıkları aynı sayaca yazma davranışı aynen alınmamalı. Bizdeki adres kapsamı ve kanıt seviyesi daha ayrıntılıdır.

Öneri: Her hesap/profil için doğrulanmış adresin yakın zamandaki ağ ve ilk kare ölçümlerini sakla. Kötü şifre, iptal, boş kategori ve challenge ayrı sebeplerdir. Eski başarılar zamanla etkisini kaybetsin; test edilmemiş adres “bilinmiyor” kalsın. Sıralama yalnız kullanıcının hesabı için doğrulanmış alternatiflerle sınırlı olsun. Aynı IP'de bulunmak başka bir domain'in hesap için çalışan yedek DNS olduğunu göstermez.

### PY04 — Ağ tekrarlarının uyumlu olması

Mevcut `xtGet`, HTTP 401 dahil ilk hatadan sonra tekrar deneyebiliyor; hata kodu/başlığının kaybolması `Retry-After` kararını da zorlaştırıyor. Burada geliştirilecek şey P5'teki Python Session'ı uygulamaya koymak değil, mevcut TS/native katmanlarında ortak ve sınırlı bir hata sözleşmesi kullanmaktır.

GET katalog çağrılarında geçici ağ/5xx sorunları ile 429 bekletmesi ayrı ele alınmalı. Son tarih ve kullanıcı iptali tüm tekrarları sınırlamalı. Oturum açma veya `create_link` gibi yan etkisi olabilecek çağrılara kör retry eklenmemeli. Resmi retry davranışı bekleme, `Retry-After` ve tekrar edilecek yöntemleri ayrı seçenekler olarak tanımlar. [urllib3 Retry resmi belgesi](https://urllib3.readthedocs.io/en/stable/reference/urllib3.util.html#urllib3.util.Retry).

### PY05–PY06 — Kayıt ve dışa aktarma güvenilirliği

ALPHA append/flush/fsync fikri, artan kayıt çıktısı için yararlıdır. Fakat bu programda kayıt başarısızlığının çağıran tarafından doğru işlendiği garanti değildir. Android MediaStore/SAF davranışı da masaüstü dosya açmakla aynı değildir.

Kalıcı DB → dosya çıktısı → playlist ekleme üç ayrı aşama olarak izlenmeli. Her aşamanın sayısı ve tamamlanma durumu görünür olmalı. Artan yazım tasarımında yarım kalmış son kayıt, yeniden üretim, dosyanın kullanıcı tarafından silinmesi ve aynı hesabın tekrar dışa aktarılması ele alınmalı. Bir dosya yazımı başarısızsa “DB'de korunuyor” bilgisi yalnız gerçekten kalıcı kayıt varsa gösterilmeli.

MAG kategorili TXT'si korunmalı; Xtream kategorileri de ortak yapıya eklenmeli. Yüzlerce hesabın bütün Film/Dizi listesini sırf TXT için tekrar indirmek doğru olmaz: mümkünse mevcut Room bilgisi, yoksa küçük kategori çağrıları kullanılmalı. “Alınmadı / hata / kısmi / gerçekten boş” durumları ayrılmalı. TXT okuyucu-yazıcı uyumluluğu ve seçili/tümü davranışı birlikte doğrulanmalı.

### PY07–PY12 — Yeni kullanıcı araçları

- **Kategori/kanal M3U:** P3'teki grup seçme yaklaşımı yararlı. Bizde başlıklar, logo, EPG ve gerekli oynatma seçenekleri korunarak uyarlanmalı. Saf MAG'ın süreli `create_link` tokenlarını kalıcı, her oynatıcıda çalışacak M3U bağlantısı gibi sunmamak gerekir. Desteklenmeyen portalda neden taşınabilir M3U üretilemediği açıklanmalı.
- **CSV/XLSX:** İlk aşama CSV için Python/OpenPyXL motorunu Android'e taşımaya gerek yoktur. Hesap alanları CSV biçimine uygun kaçırılmalı; tablo hücresi olarak formül çalıştırabilecek metinler güvenli biçimde yazılmalı. Seçili/tümü ve maskeli/tam rapor seçenekleri mevcut arşiv yaklaşımıyla uyumlu olmalı.
- **Ülke/dil etiketleri:** Kategori adı anahtar kelimeleri bir tahmindir. Aynı aboneliği TR ve DE raporunda iki abonelik olarak sayma; kullanıcı etiketleri düzeltebilsin.
- **Giriş temizleme:** Host büyük/küçük harf normalleştirmesi ile kullanıcı adı/şifre aynı şey değildir. P3'ün `line.lower()` seçeneği aynen alınırsa farklı parolalı kayıtlar yanlışlıkla birleşebilir.
- **Oturum özeti:** P5'teki “günlük” rapor, oturum istatistiklerinden üretiliyor; kendiliğinden zamanlanmış bir günlük izleme servisi olarak değerlendirilmemeli. Bizde rapor düğmesi ve oturum geçmişi yeterli bir başlangıçtır.
- **QR:** P3 yalnız QR üretir; QR okuma, TV eşleştirme, süreli kod veya şifreli aktarım hazır değildir. Bunlar istenirse ayrıca tasarlanmalıdır. Hesap içeren QR üçüncü taraf çevrimiçi QR hizmetine gönderilmemeli.

## 5. Aynen alınmaması gereken mantık ve hatalar

| Kaynak / kanıt | Mevcut Python davranışı | Alınırsa etkisi / doğru yaklaşım |
|---|---|---|
| [P4:271](<C:/Users/KIZILKAN YOGA/Desktop/Hybrid-Omega-V15.py:271>) | `user_info.username` varlığıyla giriş başarılı sayılıyor. | `auth` ve hesap durumu doğrulanmadan sahte başarı üretilebilir. Bizdeki API doğrulaması korunmalı. |
| [P4:296](<C:/Users/KIZILKAN YOGA/Desktop/Hybrid-Omega-V15.py:296>), [P1:3861](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:3861>) | 200/302 veya HTTP etiketi üzerinden yayın başarısı; P1 varsayılan örnek stream ID'si `5972`. | HTML, yönlendirme veya hesaba ait olmayan kanal gerçek görüntü sayılabilir. Gerçek katalogdan örnek seçilmeli; ilk kare ayrı kanıtlanmalı. |
| [P1:1820](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:1820>), [P5:621](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi v4.0 ULTIMATE 🏴‍☠️.py:621>) | MAC doğrulama akışında tekrar yol denemeleri. | Önce portal, sonra seçilmiş API'de hesap kontrolü şeklindeki bizim iki aşamalı akışa geri dönüş yaptırabilir. [magBulkScan.ts:153](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:153) korunmalı. |
| [P5:720](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi v4.0 ULTIMATE 🏴‍☠️.py:720>), P6:531, P7:470 | Profil JSON'unu sabit metin dizilişiyle parçalama; `phone` alanını zorunlu başarı sinyali kabul etme. | JSON alan sırası/boşluk değişince veya `phone` yokken çalışan hesap elenebilir. JSON nesnesi olarak ayrıştırma ve kapsamlı hesap kanıtı gerekir. |
| [P1:1731](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:1731>), P5:441 | Eksik veya çözülemeyen bitişi `LIFETIME/Sınırsız` sayma. | Bilinmeyen hesap sınırsızmış gibi görünür. Bizde [accountExpiry.ts:4](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/accountExpiry.ts:4) bilinmeyeni ayırır; korunmalı. |
| [P3:5748](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS.PY:5748>) | HTTP `Expires` başlığını abonelik bitişi alanına yazma. | Önbellek tarihini hesap bitişi sanabilir. Hesap API tarihi kullanılmalı. HTTP `Expires` önbellekle ilgilidir. [RFC 9111 §5.3](https://www.rfc-editor.org/rfc/rfc9111#section-5.3). |
| [P7:504](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi Dual Scanner 🏴‍☠️.py:504>) | Biçimli `Tarih (0 Gün)` sonucu yalnız tam `0 Gün` metniyle karşılaştırılıyor. | Bazı süresi bitmiş kayıtlar geçebilir. Bitiş kontrolü biçimli metin yerine doğrulanmış zaman değeriyle yapılmalı. |
| [P5:690](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi v4.0 ULTIMATE 🏴‍☠️.py:690>), [P5:707](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi v4.0 ULTIMATE 🏴‍☠️.py:707>) | URL'den host çıkarıp HTTP'yi sabitleme; alternatif ayrıştırmada port kaybı; yalnız sayısal `auth == 1` kabulü. | HTTPS/özel portlu portal veya `auth: "1"` yanıtı yanlış elenebilir. URL şeması/port/encoding korunmalı, doğrulama biçimleri normalize edilmeli. |
| [P5:766](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi v4.0 ULTIMATE 🏴‍☠️.py:766>), [P1:2265](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:2265>) | Kimlik türetilemezse credential içermeyen M3U benzeri metin; P1'de portal desteği doğrulanmadan `play/live.php` üretimi. | Dosya/link oluşturulmuş olması çalışacağını göstermez. Destek yoksa bağlantı uydurulmamalı. |
| [P5:261](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi v4.0 ULTIMATE 🏴‍☠️.py:261>) | Ölçülmeyen panel %100 sağlıklı; en iyi üçten rastgele seçim. | Yeni veya bozuk adres gereksiz öne çıkabilir. Ölçüm yoksa bilinmiyor; seçim gerçek hesap/ağ/ilk kare kanıtına dayanmalı. |
| [P3:7809](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS.PY:7809>) | `get_all_channels` için koşulsuz sayfalama varsayımı, 100 sayfaya kadar deneme. | Tam liste döndüren portalda aynı cevap tekrar alınabilir. API'nin gerçek sayfalama davranışı ve benzersiz ID'ler kontrol edilmeli; bildirilen toplam ile alınan toplam ayrılmalı. |
| [P1:3944](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:3944>) | Boyutu sınırlanmış M3U içeriğinden kanal sayısı çıkarma. | Büyük katalog eksik sayılıp tam liste sanılabilir. Kısmi okuma açıkça etiketlenmeli. |
| [P3:7392](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS.PY:7392>) | İsteğe bağlı bütün satırı küçük harfe çevirerek tekrar ayıklama. | Harf duyarlı şifre veya kullanıcı adları yanlış birleştirilebilir. Hesap kimliği alan bazında oluşturulmalı. |
| [P5:233](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi v4.0 ULTIMATE 🏴‍☠️.py:233>) | Telegram bildirimi M3U adresi ve hedef hesabı içerebiliyor. | Hesap bilgisi uygulama dışına gider. Oturum özetinin yerel bildirimi yeterli; dış servise paylaşım ayrı ve açık kullanıcı isteği olmalı. |
| [P1:2784](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:2784>), [P1:2852](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:2852>), [P5:92](<C:/Users/KIZILKAN YOGA/Downloads/Telegram Desktop/🏴‍☠️ B.Rokasi v4.0 ULTIMATE 🏴‍☠️.py:92>) | “VPN” requests proxy seçimi; P5 “Cloudflare destekli” yorumu yalnız Session/retry kurulumunu tarif ediyor. | Gerçek cihaz VPN'i veya korumayı aşma garantisi değildir. Bizdeki proxy havuzu tekrar yazılmamalı; bağlantı türü ve gözlenen koruma doğru adlandırılmalı. |
| [P1:2207](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-PRO-SCAN-VPN- V.3.3.5.py:2207>), [P4:280](<C:/Users/KIZILKAN YOGA/Desktop/Hybrid-Omega-V15.py:280>) | HTTPS doğrulamasını `verify=False` ile kapatma. | Başarılı bağlantı sertifikanın doğru olduğunu göstermez. Varsayılan sertifika doğrulaması korunmalı. Requests bu seçeneğin sertifika/host doğrulamasını devre dışı bıraktığını açıklar. [Requests resmi belgesi](https://requests.readthedocs.io/en/latest/user/advanced/#ssl-cert-verification). |
| [P3:7585](<C:/Users/KIZILKAN YOGA/Desktop/ALPHA-WOLFS-TOOLS.PY:7585>) | Kayıt için ayrı FFmpeg işlemi ve yayın bağlantısı açma. | Canlı oynatma sırasında ikinci upstream oluşturabilir. Bizdeki native kayıt/timeshift ve tek yayın bağlantısı mimarisi korunmalı. |

Cloudflare kullanılan her yanıt challenge değildir. Resmi belgede challenge yanıtı `cf-mitigated: challenge` ile tanımlanır; bu yanıtın içerik türü HTML'dir. Bizde bu başlık gözlemi zaten vardır. Geliştirme, gözlemi anlaşılır biçimde göstermek ve doğru hata sınıfına aktarmaktır. [Cloudflare resmi belgesi](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/).

P1'in `_detect_vpn_need:3883` işlevi gerçek ihtiyaç testi yapmıyor; çoğu alan için `-` döndürüyor. `_detect_player_compat:3888` da oyuncuları açıp test etmiyor, API/M3U mevcudiyetinden etiket çıkarıyor. “VPN gerekir” veya “bütün oynatıcılarda çalışır” özelliği olarak alınmamalı.

## 6. Zaten bulunan ve yeniden eklenmemesi gerekenler

- MAC/portal keşfi ile hesap doğrulamasını ayırma; otomatik veya kullanıcı seçimi. [magBulkScan.ts:120](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/magBulkScan.ts:120).
- MAG kullanıcı adı/şifre türetme ve kalıcı kapsamlı saklama. [stalker.ts:3353](/C:/Projeler/kizilkan-player-elite/frontend/src/utils/stalker.ts:3353).
- Proxy kaynakları, HTTP/SOCKS testi, gecikme ve anonimlik ölçümü, başarılı proxy havuzu ve rotasyon. [ScanProxyPool.kt:59](/C:/Projeler/kizilkan-player-elite/frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt:59), [scan-proxy.tsx](/C:/Projeler/kizilkan-player-elite/frontend/app/scan-proxy.tsx).
- Tarama duraklat/devam/iptal, kalıcı sonuç günlüğü ve dosya yedeği. Bunların cihazdaki kusurları ayrıca düzeltilmeli; “yok” değiller.
- Geçen süre ve tahmini kalan süre; kategori seçimi; MAG kategorili TXT; seçili hesap dışa aktarımı.
- Yedek DNS ve ilk kare alınan adresi hatırlama; gerçek ilk kare olayı; ayrıntılı tanı raporu.
- EPG, indirme/kayıt ve native timeshift. P3'ün masaüstü FFmpeg kayıt/EPG araçları bizim Android mimarisinin yerine geçirilmemeli.
- Tema, favoriler ve liste yönetimi. Masaüstü araçların GUI/derleyici/editör bölümleri oynatıcıya ek kullanıcı faydası sağlamıyor.

Kullanıcının kendi verdiği hesapları doğrulama, düzenleme ve oynatma kapsamı için bu öneriler yeterlidir. Rastgele MAC üretimi, internetten hesap listesi toplama ve koruma aşma amaçlı bölümler öneri kapsamına alınmadı.

## 7. Önerilen uygulama sırası ve kabul testleri

| Sıra | İş | Tamamlandı diyebilmek için gerekli doğrulama |
|---|---|---|
| 1 | Önceki rapordaki servis başlangıcı, kurtarma ekranından çıkış, sonuçların tam okunması ve PY05. | Kapanma/yeniden açılışta DB sonucu korunmalı; sonuç ekranı kapatılabilmeli; TXT kayıt sayısı ve okuyucunun geri aldığı sayısı tutmalı; sahte “yedek başarısız” mesajı olmamalı. |
| 2 | PY01 normal MAG yenileme hızlı yolu. | Aynı hesabın eski/yeni süreleri ve benzersiz içerik sayıları karşılaştırılmalı; Film ve Dizi bölüm oynatımı açılmalı; saf Stalker yedeği, iptal ve profil ayrımı geçmeli; eksik yanıt Room'u küçültmemeli. |
| 3 | PY02 ve PY04: katalog/görüntü sonucu ile ağ hata sözleşmesi. | 200+HTML, 302, auth ret, boş katalog, 429, timeout, iptal ayrı sonuç vermeli; gerçek ilk kare yalnız güncel test kaynağı için yazılmalı; test sonrası ağ ve oynatıcı işi kapanmalı. |
| 4 | PY03 DNS sağlık geçmişi. | Çalışan iki doğrulanmış adreste ilk kare süreleri ölçülmeli; bozulan adrese geçişte son çalışan tercih korunmalı; hatalı şifre ve kullanıcı iptali host sağlığını yanlış düşürmemeli. |
| 5 | PY06/PY10/PY11: ortak kategorili TXT, giriş önizlemesi ve kullanıcı özeti. | MAG ve Xtream seçili/tümü çıktıları; kategori hata/boş ayrımı; büyük-küçük harfli iki farklı parola; tam arşiv geri içe aktarma; abonelik ve DNS sayısının ayrı tutulması doğrulanmalı. |
| 6 | PY07/PY08/PY09/PY12/PY13: M3U/CSV, dil filtresi, QR ve tanı kartı. | Aktarılan içerik seçili kapsamla aynı olmalı; M3U başlık bilgileri korunmalı; CSV'de alan kaçırma ve maskeli/tam ayrımı geçmeli; QR yerelde üretilmeli; tahminler kesin sonuç gibi etiketlenmemeli. |

Uygulama yapıldığında mevcut proje kapıları, TypeScript kontrolü ve değişen native bölümün derlemesi çalıştırılmalı. Build geçmesi, cihazda geri yükleme veya ilk görüntünün doğru çalıştığı kabulü değildir. Başlangıç/servis/oynatıcı değişiklikleri ayrıca telefonda denenmelidir. Bu rapor aşamasında uygulama kaynağı değişmediği için build/test koşulmadı.

Dosyalarda açık SPDX/lisans/copyright metni taramasında sonuç bulunmadı. Bu yüzden kaynak kodunu büyük bloklar halinde taşımak yerine fikirleri mevcut TypeScript/Kotlin arayüzlerine uygun biçimde yeniden uygulamak öneriliyor. Bu inceleme bir lisans hakları değerlendirmesi değildir. APK içine Python çalışma ortamı veya masaüstü GUI paketlerini eklemek gerekmiyor.

## 8. Opus'a iletilecek devir notu

Bu turda yalnız bu rapor eklendi. Kaynak programlar çalıştırılmadı ve uygulama dosyaları değiştirilmedi. P1/P2 çekirdek benzerliği AST ile kontrol edildi; yedi dosyanın sözdizimi ayrıştırıldı. Öneriler mevcut kod yollarıyla karşılaştırıldı. Özellikle MAG kategorili TXT, proxy, ETA, kalıcı günlük, DNS failover ve gerçek ilk kare ölçümünün zaten mevcut olduğu doğrulandı.

Kodlamada öncelik yeni araçlardan önce mevcut cihaz/kurtarma sorunları, normal MAG yenilemesinin doğrulanmış Xtream yolu ve katalog/görüntü hata ayrımı olmalı. P1/P4'ün HTTP durum kodundan görüntü başarısı çıkaran yaklaşımı; P5/P6'nın URL kapsamını kaybeden ayrıştırması; bilinmeyen bitişi sınırsız sayma ve P3'ün varsayımsal kanal sayfalaması kopyalanmamalı. Her gerçek kod güncellemesinde değişen dosya/işlev, ilgili PY numarası, gerçek test sonucu ve kalan cihaz senaryosu devir dosyasına eklenmeli.

### İncelenen dosyaların SHA-256 değerleri

```text
P1 65c5f098e0c527d004fb7e927f732ad065a2f19c55d38a000899dc8eccadec78
P2 5a9796a228c7ca0f57f7c28354f2f32b7969f6e7ede8adc0f10f681bd223d32f
P3 558e32954d6f494b595ac3efd3b5e6566af8171d34fa2df1ad83644ff1325a6c
P4 71664179e647cc09d6ce6f4b002fe109de2783b336ba133c07d4b59c1ba5c54a
P5 868861e1c57ce02f090170bd1d4d3fefc19fdc4173511e652ea810dfcf6cba2d
P6 e721bd1545aada4594330279173913d643a0508968e7be869a918e95ba5f5224
P7 4c8d43ee726c5fad9a8d231a24447fea1aa59bd8a73167f22a0971d33414c553
```
