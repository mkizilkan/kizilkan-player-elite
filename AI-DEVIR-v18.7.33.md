# KIZILKAN PLAYER ELITE v18.7.33 RC1 — Proxy doğrulama hızları / GPT–Opus devir

12 Ekim 2026. Dal: `codex/v18.7.33-proxy-validation-speed`. Taban: `436f6db1` (v18.7.32). Kullanıcı ikinci aşamanın çok yavaş olduğunu ekran görüntüsüyle bildirdi; beş hız seçeneği ve butonlarda gerçek paralellik istedi. Commit/push, manuel normal APK, gerektiğinde düzeltip yeniden derleme ve PC DEV için açık yetki verdi. Telefonu çıkardı; bu sürümün cihaz kurulumu/kabul testi yapılmış sayılmayacak.

## 1. Sorun ve koddan kanıt

Ekran görüntüsünde 57 bin adaydan yaklaşık 8,7 bin TCP açık port kalmış; doğrulama yaklaşık 1,4 bin/8,7 bin, 2,9 sonuç/sn ve 2.479 sn tahmini kalan süre gösteriyor. Bunlar o ekranın ölçümleridir; bütün ağlar için hız ölçütü değildir.

v18.7.32 `ProxyTestEngine.run()` ikinci aşamaya `concurrency.coerceAtMost(16)` veriyordu. Dolayısıyla UI'daki 32/64/128 seçimi ikinci aşamayı 16 üzerinde hızlandıramıyordu. İlk aşama ayrıca `(concurrency*2).coerceAtMost(128)` kullanıyordu; UI sayısı ile TCP işçi sayısı birebir aynı değildi.

Sistem testinde aday başına HTTP IP, HTTPS IP ve koşulları uygunsa anonimlik yargıcı sırayla çalışır. Bu kontroller kaldırılmadı; aday başına aynı anda bir istek yürütülür. Kontrol başına zaman aşımı korunur. Bu nedenle toplam süreyi yalnız proxy sayısı veya TCP paralelliğiyle hesaplamak doğru değildir.

## 2. Kullanıcıya sunulan seçenekler

| Seçenek | Aynı anda ikinci aşamada doğrulanabilecek aday | Davranış |
|---|---:|---|
| Yavaş | 16 | Önceki ikinci aşama hız sınırı; mevcut kullanıcı varsayılanı korunur. |
| Güvenli | 32 | İşçi sınırı 32; isim bir anonimlik, ban veya bağlantı güvencesi değildir. |
| Hızlı | 64 | İşçi sınırı 64. |
| Ultra | 128 | İşçi sınırı 128; gerçek hız telefon/ağ/proxy/kontrol adresine bağlıdır. |
| Manuel | 1–128 | Kullanıcının uyguladığı tam sayı; butonda kayıtlı sayı gösterilir. |

Butonlarda isim ve `N paralel` birlikte görünür. Manuel seçilince sayı alanı + Uygula açılır. Boş, sıfır, negatif, ondalık, bilimsel gösterim veya 128 üzerinde giriş uygulanmaz; hata gösterilir. Geçerli ama henüz uygulanmamış bir manuel sayı varken Testi Başlat, Uygula yapılmasını ister. Preset değişimi manuel sayıyı silmez.

İlk aşama ayrı `1. aşama · TCP paralellik` satırıdır; 32/64/128 artık gerçek TCP sınırıdır. Eski tercihlerde 32→64, 64→128, 128→128 dönüşümü yapılarak eski fiilî yük korunur. Yeni config/journal `verifyConcurrency` alanı sayesinde dönüşüm ikinci kez yapılmaz. Aktif testte TCP sınırı değiştirilmez; ikinci aşama hız seçimi aktif testte değişebilir.

## 3. Çalışan testte hız değişimi ve kalıcılık

- UI tercihleri önce kaydeder, sonra `runId` ile native motorun hızını günceller. Eski ekran/run veya bitmiş test yeni bir testi değiştiremez. Güncelleme hatası görünür; UI'da native gerçek sınır ayrıca gösterilir.
- Native `updateConcurrency` 1–128 aralığını doğrular. Yeni config kopyası input journal'a başarıyla yazılmadan çalışan hız değişmez. Giriş kaydı yazma hatasında eski native hız korunur.
- Çok büyük input journal yazımı sonuç/ilerleme kilidi dışında yapılır; ilerleme sorgusu disk yazımı boyunca bu kilitte beklemez. Config mutasyonu yerine config kopyası atanır.
- Yeni scheduler yalnız sınırlı sayıda aday işi sıraya alır. `ExecutorCompletionService` ile bitenleri toplar; `ThreadPoolExecutor` çekirdek sınırı seçilen hızla değişir. Bütün liste için on binlerce Future oluşturmaz. Üst işçi sınırı 128'dir.
- Hız azalınca devam eden istekler kesilmez; mevcut adaylar sonuçlanır ve yeni işler yeni sınırla başlar. Hız artışı bir sonraki scheduler çevriminde uygulanır; çevrim beklemesi en çok yaklaşık 100 ms'dir, disk kayıt süresi ayrıca vardır.
- Duraklatma yeni aday başlatmayı durdurur; uçuşta olanlar sonuçlanabilir. Duraklatılmış veya kesilmiş testin hızı değiştirilebilir. Process sonrası kalanlar seçilen yeni hızla devam edebilir; tamamlanmış bitler ve sonuçlar korunur.
- İlerleme ekranı TCP sınırı, ikinci aşama sınırı ve işlemdeki iş sayısını ayrı gösterir. Bildirimde aşamaya ait paralellik de görünür.

## 4. Dosya bazında değişiklik

| Dosya | Yapılan |
|---|---|
| `frontend/src/utils/scanProxySpeed.ts` | Beş preset, manuel tam sayı doğrulama, bounded preference restore, eski TCP tercih dönüşümü. |
| `frontend/src/utils/scanProxy.ts` | Hız/manüel alanlarının yüklenmesi ve saklanması; ayrı TCP/verify config; native canlı hız köprüsü. Manuel/custom kaynak/test sırları önceki şifreli akışta kalır. |
| `frontend/app/scan-proxy.tsx` | Beş odaklanabilir buton, her butonda sayı, manuel alan/Uygula, aktif testte hız değiştirme ve hata bildirimi, gerçek sınır/işlemde sayısı. |
| `frontend/modules/panel-scan/index.ts` | `verifyConcurrency` config ve progress alanları, `updateScanProxyTestConcurrency(runId, parallel)` typed API. |
| `.../panelscan/PanelScanModule.kt` | Background coroutine queue'da canlı hız güncelleme köprüsü. |
| `.../panelscan/ProxyTestEngine.kt` | Ayrı TCP/verify sınırları, eski journal uyumu, değişken paralellik scheduler'ı, native aralık/run guard, şifreli hız kaydı ve restore/resume. |
| `.../panelscan/ProxyTestService.kt` | Bildirimde gerçek aşama paralellik sınırı. |
| `frontend/app.json`, `frontend/package.json` | Beş alan 18.7.33 / 180733 / RC1. NPM bağımlılığı eklenmedi. |
| `tools/test-proxy-speed.js`, `tools/denetle.js` | Preset/manuel/migration/UI-native bağlantı testi master'a eklendi. |
| `tools/test-proxy-engine-runtime.js` | Gerçek üretim Kotlin motorunda paralellik/hız değişimi/kayıt hatası/resume/no-repeat ölçümleri. |
| `tools/test-v18732-background.js` | Yeni helper import çözümlemesi ve gerçek legacy/manuel preference round-trip testleri; önceki testler korunur. |
| `.gitignore` | Kullanıcı ekran görüntüsü eklerinin git'e girmemesi için `.codex-remote-attachments/`. |

`.../panelscan/`: `frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/`.

## 5. Doğrulama ve sınırlar

- TypeScript `yarn tsc --noEmit`: PASS.
- Master `node tools/denetle.js`: **145/145 PASS**; önceki 144 kapı korunur, bir hız kapısı eklenir.
- Üretim Kotlin motoru (PC fixture): **1, 7, 16, 32, 64, 128** seçimlerinde ölçülen eşzamanlı istek tepeleri aynı sayılara ulaştı ve aşmadı. HTTP/HTTPS/anonimlik kontrollerinin tamamı yapıldı.
- Canlı 2→64→3, duraklatma, 7'ye değiştirme/devam, eski run reddi, 129 reddi, input yazma hatasında hız koruma, process journal restore ve yeni hızla tamamlanmışları tekrarlamadan devam PASS.
- Yerel TCP fixture bağlantı kuyruğu bazı adayları ilk aşamada reddedebilir. Canlı değişim testi ikinci aşamaya gerçekten alınmış bütün adayların sayısını, her birinin üç kontrolünü ve tam bir kez sonuçlanmasını doğrular; TCP portu açık olmadığı ölçülen adayları hız değişimi kaybı diye saymaz. Gerçek public proxy hızı veya çalışma yüzdesi bu fixture'dan çıkarılmaz.
- Journal fixture şifreleme/depolama arayüzünü taklit eder; gerçek Android Keystore donanım kabulü değildir. Gerçek protokol/auth/IP/anonimlik kontrolleri önceki motorla korunur.
- Ultra en iyi gerçek hızı her ağda garanti etmez; yüksek paralellik ağ/CPU/bellek yükü ve kontrol adresinin hız sınırlamasından etkilenir. 429/503 sayaçları korunur; koruma aşma, yeni proxy üzerinden hız sınırı atlatma veya hesap taraması hız değişikliği eklenmez.
- Telefon çıkarıldığı için v18.7.33 fiziksel ekran/gerçek proxy/background kabulü henüz yapılmadı. Force-stop/telefon kapanması/OEM/Android servis süresi sınırları için önceki v18.7.32 sınırları geçerlidir.

## 6. Teslim

PC DEV ve manuel NORMAL GitHub release build sonuçları, commit/run/APK bağlantısı ve SHA256 değerleri derlemeler tamamlandığında buraya yazılacak. Başlatılmış bir derleme tamamlanmış sayılmaz.

Tekrar DEV üretme komutu (repo kökünde):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-dev.ps1
```

Telefon sonradan bağlı ve yetkiliyse veriyi silmeden kurulum için aynı komuta `-Install` eklenebilir. Bu oturumda kullanıcı telefonu çıkardı; otomatik uninstall yok.

## 7. Araştırma kaynakları

- [Oracle ExecutorCompletionService](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ExecutorCompletionService.html): tamamlanan işleri toplama API'si. Scheduler uygulaması proje kararıdır.
- [Android threading](https://developer.android.com/topic/performance/threads): ağır/ağ işlerini UI thread dışında yürütme ve UI tepkiselliği.
- [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585): 429 Too Many Requests anlamı; yüksek paralellik hız garantisi değildir.
