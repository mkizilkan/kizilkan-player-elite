# AI DEVİR — v18.7.3 RC1

Tarih: **2 Ekim 2026**, Europe/Istanbul. Taban `4240f6cc` / `v18.7.2-rc1-multimac-ux`. Dal `v18.7.3-rc1-gpt-audit`. Sürüm **18.7.3**, versionCode **180703**, buildNumber **18.7.3**, etiket **GPT ELITE v18.7.3 RC1**.

Kullanıcı önce bağlam/devir/kod incelemesi ve kaynakla doğrulanmış tablo istedi; sonra bulguların tamamını tek sürümde kodlama, MD raporları, her güncellemede Opus'a dosya bazlı devir, ayrı dal push ve manuel APK build onayı verdi. Son talimat: eksik/yanlış yer bırakmadan devam. Önceki salt okunur talimat yeni açık uygulama onayıyla değişti.

## Ayrıntılı kayıtlar

- [GPT tespitleri ve çözüm tablosu](GPT-TESPIT-VE-ONERILER.md): mevcut durum / yapılması gereken / yapılınca ne olacak, kök nedenler, kabul senaryoları ve sınırlar.
- [GPT → Opus dosya bazlı güncelleme devri](GPT-OPUS-GUNCELLEME-DEVRI.md): dosya/fonksiyon, gerekçe/bulgu eşlemesi, gerçek test/dağıtım kaydı.
- [Native tarama ayrıntılı devir](GPT-S01-NATIVE-TARAMA-DEVIR.md): Kotlin worker/checkpoint/probe/journal ve gerçek JVM/HTTP/SQLite fixture sonuçları.

## Son davranış

1. **MAG kapsamı:** `exact` varsayılandır; `fallback` veya `all` kullanıcı seçimidir. Hız ayrı ayarlanır. Kullanıcının açıkça yazdığı :80/:443 korunur. Kapsam, login veya yeniden giriş sırasında da genişlemez.
2. **Koruma gözlemi:** CAPTCHA/Cloudflare/WAF, rate-limit ve erişim reddi ayrı değerlendirilir. Koruma görüldü/görülmedi/belirsiz durumu ile endpoint, zaman ve kanıt saklanır. VOD sırasında challenge görülürse sıradaki Series işi başlamaz. Bu gözlem, koruma atlatma veya ban garantisi değildir.
3. **MAG sonuçları:** sabit endpoint+MAC kimliği kullanılır; bütün, seçilen, görünen veya koruma görülmeyen sonuçlar seçilebilir. Yalnız seçilenler playlist'e veya TXT'ye aktarılır. TXT; hesap, bitiş, canlı/VOD/dizi kategorileri ve uyarıları içerir. Dosya yazım sonucu denetlenir. MAC giriş alanı 128 px'tir ve kendi içinde kaydırılır. Önce canlı içerik yükleme ve arka planda zenginleştirme korunur.
4. **Yedek:** dosya önce önizlenir; bütün/seçilen listeler ve hedef profil belirlenir. Seçmeli birleştirme, seçilmeyenleri korur. Profil/ayar snapshot'ı ayrı ve açık bir seçenektir. JSON ve tam KZB yüklemesi staging+journal ile yapılır; bütün dosyanın bütünlüğü denetlenir. Açılış kurtarması, native `applied/finalized` durumuna göre işlemi tamamlar veya geri alır. Geçerli `false/0` snapshot değerleri kaybolmaz; journal kimlik/anahtar/stage/rollback biçimi ve gelen hassas iç şema yan etkiden önce doğrulanır.
5. **Katalog:** native tablolardaki gerçek sayım ile snapshot uzlaştırılır; gerçek sayı 0 ise kartta 0 görünür. `ready/empty/missing` ayrıdır; geçerli boş katalog onarım döngüsüne sokulmaz. JS dizilerinin boş olması, Room'un boş olduğunun kanıtı değildir.
6. **Metadata:** güncel ref üzerinde sıraya alınan patch uygulanır; kalıcı kayıt state güncellemesinden önce yapılır. Aktif seçim, bütün operasyonun tamamlanmasını bekler. Restore, eski metadata/active-key/PIN migration yazıcısını bekler veya durdurur. Bozuk mevcut metadata üzerine yazılmaz; eski kaynak, işlem başarıya ulaşmadan silinmez.
7. **Kişisel veri:** library/favorites/recent kayıtları profil/liste kapsamındadır. Eski verinin ilk sahibi kaydedilir; yazımlar sıraya alınır ve sonuçları denetlenir. Profil değişimi veya restore sonrası yeniden yükleme ve oturum sıfırlama yapılır. Paylaşılan Room kataloğu, başka profil silindiğinde korunur. Library dış haritası yanında null/yanlış biçimdeki iç progress/seriesLast/watched kayıtlarını da doğrular; bozuk kaynak korunur ve geçerli reload sonrası toparlanır.
8. **Player/TV:** await sonrası sahiplik kontrolü, yalnız header değişiminde kaynak kimliği/override aboneliği ve playlist bazlı motor memo kullanılır. Cast controller kalıcıdır; Media3 bağlantısı gerçekten ayrılır ve tek upstream korunur. Bekleyen REC ile native onaylı REC ayrıdır. SAF staging ve SHA/readback ile doğrulanan kopyalama; AES HLS IV, ortak OkHttp ve MPV yazılım çözme ayarının reload sırasında korunması uygulanır. TV reset generation, native EPG/multiview/favori/detail ve ortak kategori/PIN kapısı kullanılır.
9. **Native tarama:** claim/checkpoint atomiktir; işçi hatası `FAILED` üretir. Streaming producer kaynakları temizlenir. Geçici cache sonuçları yeniden denenir; auth açıkça doğrulanır ve Retry-After tam olarak uygulanır. `found` sayacı, UI'daki sonuç penceresinden bağımsızdır. Eski checkpoint'lerle uyum sağlanır.
10. **Güvenlik:** Android'de 600.000 iterasyonlu PBKDF2 ve salt ile PIN saklanır; `.kzbe` için AES-256-GCM ve 64 KB doğrulamalı kayıtlar kullanılır. Native I/O kuyruğu ve job iptali vardır. WebCrypto PIN uyumu ile eski JSON/KZB desteği korunur. Kullanıcının istediği master/recovery yolu korunur. Tüm yerel DB şifrelenmiş değildir; kurtarma ve abonelik kimlik bilgileri mevcut uygulamaya özel depoda kalır.
11. **Son inceleme:** kritik `getItemStrict` okumaları gerçek bulunmayan kayıt ile bozuk dış JSON/yanlış tip/platform I/O hatasını ayırır. İç JSON şeması ayrıca denetlenir. Bozuk Profile/Parental kaydı varsayılanlara dönüp erişimi açmaz; `loadError/readiness/retryLoad` ile kaynak korunur, mutation/verify engellenir ve kök hata ekranı gösterilir. Playlist metadata hazır olmadan ağır yazım başlamaz. Credential epoch, await sonrası eski PIN yetki sonucunu reddeder. `pin-entry` ortak 4–10 sayısal hane politikasını kullanır.
12. **Kısayol:** Android'deki eski `quickActions` yazıcısı, native bitmap/action kümesinin üzerine yazmaz. iOS davranışı korunur.

Android şifreli export varsayılan, en az 8 karakterli parola ister. Şifreli veri panoya veya doğrudan düz Drive upload'a verilmez; `.kzbe` sistem paylaşımıyla Drive'a gönderilebilir. Uygulamadaki doğrudan Drive yolu için kullanıcı düz export'u açıkça seçer; binary Drive upload eklenmedi. İşlem tokeni/mount/AbortSignal, geç async sonucun state/share/restore başlatmasını önler. Tek PBKDF2 çağrısının ortası kesilemez; öncesi/sonrası ve dosya parçalarında iptal denetlenir.

Şifreleme öncesi düz kaynak ve import için çözülmüş geçici dosya uygun sahiplikte hata/iptal, değiştirme, kapatma/unmount ve uygulama sonrasında temizlenir. Paylaşılmış ciphertext veya açıkça seçilmiş düz export hedefi alıcının sonradan okuyabilmesi için hemen silinmez. Yalnız yönetilen export dosyaları, sonraki export başlangıcında 24 saatlik eşikle temizlenir; başka cache dosyaları silinmez ve bu bir arka plan zamanlayıcısı değildir. Başarısız paylaşım hedefi temizlenir.

## Regresyon yasakları

Kalıcı PlayerHost/YOLB, Room'un kanonik kaynak olması, MAG live-first, sınırlı bridge yükleri, tek upstream, release imzası, şema alt sınırı ve bütün eski özellikler korunur. Yeni bağımlılık eklenmedi. Gerçek hesaplara izinsiz toplu ağ denemesi yapılmadı. Cihazdaki uygulamayı kaldırma; keystore veya gizli değerleri belgelere yazma.

## Doğrulama ve dağıtım

Gerçek komut ve sonuçlar [Opus devrinin](GPT-OPUS-GUNCELLEME-DEVRI.md) son kaydında tutulur. Son kaynakla **TypeScript exit 0**, **E13 araç düzeltmesi sonrası denetle 111 kapı PASS / exit 0**. Önceki yerel DEV `assembleDebug` 6m17s'de, son kaynakla standalone DEV `assembleDebug` ve üç modül `compileReleaseKotlin` kontrolü 2m22s'de başarılı. Son DEV APK'da MPV'nin dört ABI/native DEX paketlemesi PASS. Bu yerel sonuçlar final release APK değildir; release paket aşağıdaki manuel CI ile başarıyla üretildi.

| Gerçek regresyon komutu | Sonuç |
|---|---|
| `test-backup-restore.js` | 52 grup PASS |
| `test-storage-strict-runtime.js` | 8 grup PASS |
| `test-pin-entry-runtime.js` | 4 grup PASS |
| `test-library-runtime.js` | 8 grup PASS; son iç-kayıt validator dahil |
| `test-profile-catalog-regressions.js` | 15 grup PASS |
| `test-mag-bulk-runtime.js` | 8 grup PASS |
| `test-encrypted-backup-ui.js` | 6 grup PASS |
| `test-player-regressions.js` | 13 grup PASS |
| `test-backup-security-runtime.js --native` | 9 native grup PASS; iki yönlü PIN uyumu |
| `test-backup-selection.js` | 7 grup PASS |

Komutlar `node tools/<dosya>` biçimindedir. Ayrı dal workflow push filtresinde değildir; release yalnız manuel `workflow_dispatch` ile başlatılır. Kaynak commit **`096fddfeccb7a9dd1b6e46cfceec30a408653926`** ayrı dala push edildi. [İlk manuel CI 36983481175](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/36983481175), 2 Ekim 11:20:33'te başladı; new_architecture=true/build_type=release/make_release=true. Eski semantik fixture eksik closure değişkenleriyle başarısız oldu; APK derlemesi başlamadı. Windows diagnostic yol filtresi hatayı ilk yerel testte gizliyordu. Ayrıntı Opus devrinin E13 bölümünde; araç düzeltmesi sonrası release ayrıca manuel başlatıldı ve aşağıdaki kayıtla tamamlandı. Uygulama kodu ve kurulu DEV aynı kalır.

ADB cihazı `c3a4097e`, **OnePlus 7 Pro / GM1910**. Mevcut 18.7.2-dev kaldırılmadan/veri silinmeden `install -r` ile **18.7.3-dev / 180703** olarak güncellendi. PID 27529 canlı kaldı, ilgili PID logunda crash/JS error eşleşmesi 0. Telefon kilitli/dozing olduğundan görünür uygulama ekranı kabulü yapılamadı.

E13 araç düzeltmesi **`5757920a5a2430c77a9316d8b02f7efb945bb99f`** commit'iyle aynı dala push edildi; uygulama kodu 096fddfe ile aynı. [Son manuel CI 36984915544](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/36984915544), 2 Ekim **11:35:36–11:54:46**: **SUCCESS**. Linux denetle, tam TypeScript, release Gradle, final MPV ve paket/sürüm/kalıcı imza kapıları geçti. [Release build-123](https://github.com/mkizilkan/kizilkan-player-elite/releases/tag/build-123) / [İmzalı 18.7.3 APK](https://github.com/mkizilkan/kizilkan-player-elite/releases/download/build-123/KIZILKAN-PLAYER-ELITE-v18.7.3-build123.apk) yayınlandı. Gerçek tag SHA ve release hedefi **5757920a**; asset SHA-256 **fbbd12c37c03efcf15fbf11509af06a0ac21264a2bc6594eb03d399108773494**.

E14 gelecekteki workflow/gate düzeltmesi **a7bbfdd83d5a072b56cc9b623406d812ef976cad** ile aynı dala push edildi; app/native kaynak değişmedi ve yeni APK tetiklenmedi. Son dokümantasyon commit'i APK kaynağı değildir. Kullanıcıya DEV kurulumunun tamamlandığı ve telefonu çıkarabileceği bildirildi. Sürümlü yerel DEV dosyası: `frontend/android/app/build/outputs/apk/debug/KIZILKAN-PLAYER-ELITE-DEV-v18.7.3.apk`.

Runtime fixture'ları gerçek kaynakları Android/I/O sınırları taklit edilerek veya JVM/localhost/SQLite ile çalıştırır; TV/Cast/SAF/codec/Android JSI için gerçek cihaz kanıtı değildir. Derleme ve süreç başlangıcı bütün ürün akışlarının cihaz kabulü değildir. Tarihî timeshift donmasının bittiği kanıtlanmadı.

## Sonraki Opus oturumu

Önce CLAUDE, bu dosya, GPT raporu ve ayrıntılı devri oku. Dal/commit/CI kaydını doğrula. Aynı sürümde uygulama kaynağına yeni düzeltme yaparsan sürüm kuralını uygula; yalnız dokümantasyon içeren commit, APK'nın kaynak commit'ini değiştirmez. Her güncellemede tarih, dosya, fonksiyon, bulgu, gerçek test, sınırlar, manuel run ve APK kaydını ayrıntılı yaz. Eski testteki PASS sonucunu yeni değişimin kanıtı sayma.
