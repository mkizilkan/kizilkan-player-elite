# KIZILKAN PLAYER ELITE v18.7.35 RC1 — GPT → Opus devir dosyası

Tarih: 14.10.2026. Dal: `codex/v18.7.35-host-integration`.

Kullanıcı HOST V38.20 analizindeki 12 maddelik paketi tek build için onayladı. Commit, push, manuel NORMAL GitHub derlemesi ve PC'de ayrı DEV APK üretimi yetkisi var. Telefonun çıkarıldığı bildirildi. Depo public; bu çalışmada görünürlük değiştirilmedi.

## Kaynak ve kapsam

- Başlangıç: v18.7.34, `a0bfbecf`.
- Plan: `GPT-HOST-V38_20-GUNCEL-PLAYER-ANALIZ-VE-GUNCELLEME-PLANI-2026-10-14.md`.
- Kaynak Python: `KIZILKAN_HOST_V38_20.py`, SHA256 `be17f18c980c00e8e5604104dc54638a49057c2d684ee63bff3118786a806d8d`. Yalnız statik incelendi, çalıştırılmadı/import edilmedi. Dosya adı ve özellikleri V38.20; eski başlık/metadata sürümlerine dayanılmadı.
- Python'un exploit, rastgele MAC, varsayılan kimlik bilgisi, WAF aşma ve TLS doğrulamasını kapatma yolları taşınmadı. Doğruluk/kalıcılık/makul kaynak kullanımı yaklaşımı PLAYER'ın mevcut mimarisine uygulandı.
- Yeni npm bağımlılığı yok. Room kanonik depo, PlayerHost kalıcı katman, live-first, tek upstream ve metadata sıralama korunuyor. Eski playlist/Room/favori kimlikleri yeniden adlandırılmıyor.

## Onaylı 12 maddenin karşılığı

| # | Yapılan / sonuç | Dosyalar ve sınırlar |
|---|---|---|
| 1 | Paylaşılan IP'nin yanlış mantıksal portala çevrilmesi düzeltildi. Yanıt, kendi isteğinin özgün ve transport origin'iyle geri çevrilir. Gerçek yabancı redirect yabancı kalır. Bağlamsız ters eşleme birden fazla portal varsa tahmin yapmaz. | `magHostFailover.ts`, `magPortalDiscovery.ts`, `stalker.ts`. HTTP/HTTPS origin ve port ayrımı korunur. |
| 2 | Kullanıcı adı/parola büyük-küçük harfi ve yol/scheme ayrımı aday kimliğinde korunur. Exact mevcut Xtream hesabının eski ID'si kullanılır. Yeni Xtream, tekli/çoklu MAG ve M3U URL kayıtları UUID alır; native import ID'si bekleyen güvenli kayda yazılır. Yeni dosya importer'ında tam aday kimliğinin SHA256 özeti kullanılır. | `accountIdentity.ts`, `add-playlist.tsx`, `mag-bulk.tsx`, `hitFileImporter.ts`, `importHitRecord.ts`. Mevcut ID'ler değişmez. Dosya tabanlı mevcut M3U dedupe yolu korunur. Bulk'ta zaten ekli exact hesaplar tekrar Room'a yazılmaz. Parola farklıysa ayrı adaydır; var olan hesapla aynı endpoint/kullanıcı çakışması ekleme seçiminde görünür. |
| 3 | v34 çıkış/ANR telemetrisi ve gerçek bekleyen işe bağlı bantlar korunuyor. | **Kullanıcı v34'ü henüz test etmedi. Ekrandan çıkamama/4346 ms donma düzeldi hükmü verilmedi. Fiziksel kabul bekliyor.** |
| 4 | Mevcut `beginDiagnosticTrace` kullanıldı. Ekleme, keşif bütçesi, MAG/Xtream API yanıtı/hatası, katalog refresh, Room tür commit'i ve player MAG resolver'ında işlem ilişkisi var. | `diagnostics.ts`, `magDiscoveryBudget.ts`, `magResolveInput.ts`, `stalker.ts`, `iptv.ts`, `refreshPlaylist.ts`, `PlaylistContext.tsx`, `PlayerHost.tsx`, `importHitRecord.ts`. İstek zamanı/bütçe/sonuç ölçülür; kimlik bilgisi loglanmaz. Native import runId ile JS trace ilişkisi mevcut iş sınırında kalır; tüm tarihsel olaylar tek yeni ID'ye yeniden yazılmaz. |
| 5 | JS tanı yazıcısının biriken işi sınırlı kuyruğa taşındı, native Room'a 25 olaylık transaction partileri gider. Parti byte sınırı var. Normal taşma sayılır; önemli olayın senkron kritik/journal yolu var. | `diagnosticWriter.ts`, `diagnostics.ts`, Native Core TS/Kotlin köprüleri. 2048 bekleyen satır/4 MiB, parti 25/480 KiB. Writer sağlık: pending byte/satır, en eski bekleme, peak, dropped, önemli taşma, parti sayısı, yazma süresi/hatası. Native 512 KiB kabul sınırı. Eski 100k normal/10k kritik ve journal retention sınırları değiştirilmedi. |
| 6 | DoH A/AAAA cevapları TTL ve 512 host sınırıyla tutulur. Ağ/DNS bağlamı değişince JS cache/uçuşlar geçersizleşir. Paylaşılan DNS işindeki bir çağıranın iptali diğerini iptal etmez; bütçe sahibi ayrı uçuş alır. HTTPS URL'ini IP'ye dönüştürmeden native DNS resolver kullanılır. | `magHostFailover.ts`, `DnsRouteRequest.kt`, PanelScan köprüleri, `NativeDnsRoutes.kt`, Native Core `magExactRequest`. Host/SNI/sertifika doğrulaması varsayılan kalır. HTTP durum alınması yalnız transport canlılığıdır, hesap veya ilk kare kanıtı değildir. Bounded native yanıt taşımacılığı 1 MiB; büyük exact MAG kataloglarında mevcut native tam katalog yolu aynı resolver'ı kullanır. Proxy istekleri bu doğrudan yola geçirilmez. |
| 7 | Host/aşama/transport bazlı gerçek API yanıt süreleri öğrenilir; başlangıçta eski muhafazakâr timeout korunur. En az dört başarılı örnekten sonra küçük hesap/API istekleri uyarlanır. Timeout cezalandırır; 429/koruma başarı örneği sayılmaz. | `adaptiveNetworkPolicy.ts`, MAG/Xtream/discovery JS transport sınırları. 512 kayıt/32 örnek/5 dakika. Host discovery bütçesi büyütülmez. **Büyük katalogların süre limiti küçük bir eski katalogdan dolayı azaltılmaz.** Native tarama servisinin eski sabit timeout ayarları değiştirilmedi. |
| 8 | Ortak portal sağlık kartı ve doğrulama modeli eklendi. Hesap/katalog/gerçek kare, testte kare yok, koruma, iptal, geçici hata, auth reddi ve desteklenmeyen yöntem ayrıdır. Daha yeni başarısızlık eski kareyi güncel başarı gibi göstermez. | `verificationState.ts`, `PortalHealthCard.tsx`, `PlaylistDnsControls.tsx`, `DnsManager.tsx`. “Belirsiz adresleri yeniden test et” gerçek sıralı görüntü kuyruğunu kullanır. Boş ve unsupported katalog hesabı süresi dolmuş/yetkisiz yapmaz. Xtream capability'de gerçek boş içerik `empty` olur. |
| 9 | Çoklu HOST/KIZILKAN/MAG/M3U dosya önizlemesi, kaynak dosya/satır, yinelenenlerin birleştirilmesi, mevcut/parola çakışması gösterimi ve seçimli yeniden API doğrulaması eklendi. | `hitFileImporter.ts`, `HitFileImport.tsx`, `importHitRecord.ts`, `add-playlist.tsx`. 32 dosya, dosya başına 2 MiB/toplam 8 MiB/2000 preview kaydı; büyük mevcut native combo dosya yolu korunur. DNS'siz combo'da hedef kullanıcıdan gelir; dosya adına bakıp port/DNS uydurulmaz. Native Xtream live-ready kaydı hemen benimsenir; tamamlanınca yalnız metadata güncellenir, boş kabuk dizileriyle Room silinmez. MAG canlı önce, film/dizi sonra. Dosyadaki HIT/Active iddiası yeterli değildir. |
| 10 | Ordinary refresh için profil/playlist/generation ve hesap/filtre bağlamına bağlı kalıcı tür devam kaydı eklendi. Sonraki güncellemede yalnız Room sayı/fingerprint kanıtıyla tamamlanmış türler atlanır. | `catalogRefreshJournal.ts`, `PlaylistContext.tsx`, `refreshPlaylist.ts`. Kayıt 24 saatlik resume penceresinde; parola/DNS/filtre/kapsam değişirse yeni iş. Native Xtream normal üç paralel fetch davranışı korunur, hazır türler sıralı Room commit'i ile teslim edilir; MAG tür teslimi incremental. Eski %50 shrink guard yazımdan önce uygulanır. Tamamlandı yalnız kalıcı commit + doğrulamadan sonra. Ayarlar, ana ekran, playlist tekli/tüm/toplu ordinary refresh aynı merkeze bağlandı. Kullanıcının henüz onaylamadığı kategori preview'sı katalog yazmaz ve ayrı kalır. Otomatik boş-kabuk onarımında geçmiş completedKinds Room kanıtıyla geri yüklenir. |
| 11 | Bilinen toplam ve gerçekten artan iki ilerleme örneği varsa katalog ETA hesaplanır; bilinmeyen toplam/durma halinde süre uydurulmaz. Room kayıt aşaması, kayıt toplamı/tamamlanan ve commit süresi ortak kartta görünür. | `catalogProgress.ts`, `refreshPlaylist.ts`, `CatalogProgressCards.tsx`, `PlaylistContext.tsx`. Tür callback'i kayıt bitene kadar bekler; paralel fetch'lerin kayıtları `saveTail` ile sıralanır. Sayaçlar indirilen ve Room'a kaydedilen diye karıştırılmaz. |
| 12 | Aynı son redakte edilmiş V7 rapordan JSON, MD ve CSV üretilir. Ana JSON düğmesi korunur, MD/CSV düğmeleri eklenir. Kritik olaylar da özet biçimlere alınır, CSV hücreleri formula-injection için korunur. | `diagnosticReport.ts`, `diagnostics.ts`, `stats.tsx`. Farklı biçimde iki eşzamanlı export yanlış dosya döndürmez; öncekinin bitmesi istenir. Tam hesap arşivi güvenli tanı raporundan ayrı kalır. |

## Son kontrol sırasında bulunan ve giderilen ek hatalar

1. Native dosya import'u live-ready aşamasında eklenmiş hesabı tamamlandığında tüm Playlist nesnesiyle update ederse `channels:[] / vod:[] / series:[]` Room'u silebiliyordu. Tamamlanma update'i yalnız metadata verir. Üretim helper'ını kullanan test bunu açıkça denetliyor.
2. Cancel listener ve catch aynı native işe iki iptal gönderebiliyordu. Sahip runId denetlenir ve iptal bir kez gönderilir; başka iş iptal edilmez.
3. Tek satır `User:Pass`, HOST label parser'ında “User etiketi” sanılabiliyordu. Tek satır combo parser'ına geri dönüş düzeltildi.
4. Aynı çoklu dosya import'unda daha önce eklenen adaylar yeni kayıtlar için `known` listesine alınır. Başlangıçtaki eski React playlist görüntüsüne dayanarak yinelenen kayıt hazırlanmaz.
5. MAG film/dizi enrichment `ERROR` döndürürse `ready` etiketi verilmez; kaydedilmiş canlı içerik korunur ve partial_error kalır.
6. Yeni UUID tasarımına rağmen eski Player Core kapısı yalnız `stableXtreamPlaylistId` metnini arıyordu. İdempotency kontrolü kaldırılmadı: mevcut ID reuse, işlem içi aday→ID map'i ve kalıcı preparedPlaylistId ayrı ayrı aranır.
7. Pasif keşif bütçesi ve ana bütçe aynı operationId taşısa da iptal sahipleri farklıdır. DNS uçuş anahtarı WeakMap ile bütçe nesnesine bağlandı; bir pasif fazın bitişi ana fazın aynı-host DNS işini kesmez. Üretim modül testi bunu ayrı grup olarak doğrular.
8. VM'de yeni modül transpilation'u 80 ms transport bütçesinin içine giriyordu. Eski deadline testinde yeni RTT modülü timer başlamadan yüklenir; request/deadline/iptal iddiaları korunur. Sağlık kartı UI testi mevcut DNS kontrolü testinde yalnız görsel child olarak tanıtıldı. MAG callback kapsamına yeni UUID üreticisi gerçek Node UUID fonksiyonu ile verildi; ABA/sahiplik/assertionlar kaldırılmadı.

## Doğrulama ve üretim

- TypeScript `--noEmit`: birden fazla tur PASS. Son `--noEmit` turu PASS, 16.23 saniye.
- Master denetim: 148 kapı tam teslim turunda PASS. Son DNS bütçesi sahiplik düzeltmesinden sonra 11 yeni grup, mevcut 7 host-failover ve 13 DEV1 bütçe/transport grubu ayrıca PASS.
- Yeni üretim TS testleri: `tools/test-v18735-host-integration.js`, **11 davranış grubu PASS**. Ortak IP/origin, case/password/ID, parser/provenance, bounded writer, RTT ve büyük katalog timeout koruması, cache TTL/ağ, ortak çağıran iptali, doğrulama/rapor, kalıcı resume/storage failure, ETA ve native import metadata sahipliği.
- Yeni native test: `tools/test-dns-route-runtime.js`, gerçek `DnsRouteRequest.kt` ve `NativeDnsRoutes.kt` derlenip çalıştırıldı. Yerel HTTP/TLS sunucularında **4 test grubu PASS**: virtual Host/ortak IP/body cap, ön/aktif iptal ve timeout, gerçek SNI + yanlış hostname sertifika reddi, 512 kayıt/ağ bağlamı sınırı. Android Context/Connectivity sınırı PC testinde stub; gerçek TLS/OkHttp/DNS request kodu üretim kodudur.
- Native değişiklik sonrası temiz Expo prebuild + `assembleDebug`: **BUILD SUCCESSFUL, 18m 7s, 475 task**. Windows/JDK geçici soket yolu proje içi `.jdk-sockets` ile verildi; ilk loopback hatası bu ortam ayarıyla giderildi.
- Son DEV APK için son JS bundle yeniden üretilecek. Normal GitHub release derlemesi manuel tetiklenecek. Bu dosyanın teslim bölümü gerçek SHA/run/link ile güncellenecek.
- Yeni DNS ve importer fonksiyonları Activity yapıcısında servis/bağlam açmıyor. ADB ile son kontrolde bağlı cihaz yok; hazır AVD bulunmadı. Telefon/emülatör açılış ve gerçek hesap ilk kare kabulü bu PC doğrulamasının yerine geçmez.

## Opus / cihaz kabul kontrolü

1. Önce JSON V7 raporda uygulama sürümünün 18.7.35 olduğuna bak.
2. Playlist Ekle aç/kapat, cihaz geri tuşu ve Zorla çık: `ADD_PLAYLIST_EXIT_IGNORED` varsa reason/age/teardown alanları ile incele. v34 test edilmediği için kök neden hâlâ kanıt bekliyor.
3. Bir Xtream hesabını tekli, bir MAG hesabını tekli/çoklu ekle; mevcut ID ve favoriler korunmalı. `User`/`user` ve iki farklı parola sessizce aynı Room ID'sine yazılmamalı.
4. Aynı IP üzerinde iki portal ve HTTPS portal kullan; saklanan endpoint IP değil özgün hostname olmalı. Wi-Fi/mobil değişiminde eski pin kullanılmamalı. Koruma varsa geri çekilme davranışı sürmeli.
5. Liste güncellemesi canlı türünün Room commit'i sonrası kesilirse, aynı hesap/filtre/kapsamla tekrar güncellemede tamamlanmış canlı türü atlanmalı; eksikler alınmalı. Tür temizleme veya fingerprint değişimi varsa yeniden alınmalı.
6. HOST labels, KIZILKAN TXT, MAG TXT/JSON ve M3U dosyalarını birlikte seç; preview seçim/provenance/duplicate/parola çakışması ve yeniden doğrulama akışını kontrol et. DNS'siz combo'da hedef gir. Büyük dosya için eski streaming yolunu kullan.
7. Native dosya import'unda live-ready sonrası tamamlanmada içerik sıfırlanmamalı. İptal/profil değişikliği eski UI callback'ini engellemeli; hata alan media `ready` görünmemeli.
8. Sağlık kartında “katalog var” gerçek görüntü yerine geçmez. Belirsizleri yeniden test et yalnız seçilen belirsiz adreslerde sıralı gerçek Media3 first-frame testini çalıştırmalı.
9. JSON/MD/CSV raporda sırlar maskeli, operationId ilişkisi ve writerHealth okunabilir olmalı. Ana oynatma/timeshift/motor zincirinde davranış değişikliği yapılmadı; canlı ilk kare cihazda karşılaştırılmalı.

## Güncel birincil kaynaklar

- Android ağ değişikliği ve DNS link properties: https://developer.android.com/develop/connectivity/network-ops/reading-network-state
- Kullanılan OkHttp 4.12.0 DNS sözleşmesi: https://raw.githubusercontent.com/square/okhttp/parent-4.12.0/okhttp/src/main/kotlin/okhttp3/Dns.kt
- HEAD gövde/oynatma kanıtı değildir: https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.2
- Gerçek first-frame callback'i: https://developer.android.com/reference/androidx/media3/exoplayer/video/VideoRendererEventListener#onRenderedFirstFrame(java.lang.Object,long)

## Teslim durumu

Commit/push, manuel NORMAL GitHub run ve son PC DEV APK bilgileri henüz bu bölüme yazılmadı; tamamlandıkça gerçek sonuçlar eklenecek. Kod ve testler dışındaki hesap arşivleri, ham loglar, Python kaynakları, APK'lar ve signing sırları git'e eklenmeyecek.
