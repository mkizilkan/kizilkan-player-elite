# GPT / Opus devir — v18.7.27 RC1, GitHub disk kaynaklı build düzeltmesi

Tarih: 8 Ekim 2026. Dal: `v18.7.27-rc1-ci-disk-budget`. Kullanıcı başarısız GitHub build'in kök nedeninin giderilmesini, commit/push ve manuel tetikleme yapılmasını; tekrar hata çıkarsa aynı çalışma içinde teşhis/düzeltme/tetiklemenin sürdürülmesini istedi.

## Kanıtlanan hata

- Başarısız çalışma: [build147 / run37751994761](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/37751994761).
- Kaynak: `eff555cde4175784778ca21d4e6f8d43f468af72`, v18.7.26. Girdiler: `new_architecture=true`, `build_type=debug`, `make_release=true`.
- Uzak tam denetim, semantik TypeScript ve Expo prebuild geçti. Gradle 22 dakika 19 saniye çalıştı; 633 görev yürütüldü.
- Hata görevi: `:react-native-reanimated:bundleDebugAar`. `libreanimated.so` (arm64-v8a) debug AAR ZIP'ine yazılırken `java.io.IOException: No space left on device` oluştu.
- Yerel tam hata kaydı: `.codex-ci147-failed.log` (ignored). Hata görevi/satırları: 1196, 1203–1204; disk istisnası 1465/1470; Gradle sonuç 1487. Bu bir TypeScript veya Kotlin derleme hatası olarak raporlanamaz.
- Sonradan alınan tam workflow logu `.codex-ci147-full.log`, cache adımında **hit** olduğunu ve **1.930.126.049 byte sıkıştırılmış** Gradle cache'in başarıyla geri yüklendiğini doğruladı (579, 596, 598–599). Açılmış cache'in diskteki gerçek toplam boyutu eski run'da raporlanmadı. Önbelleğin yüklenmiş olması kanıtlıdır; disk dolumundaki tek neden/sayısal payı olduğu iddia edilmez.
- v18.7.26 yerel APK başarıyla derlenmişti ve özel release'den indirilebilir. GitHub build147'nin başarısız olması yerel APK'yı başarısız yapmaz. Önceki .26 teslim belgesindeki bekleyen uzak sonuç bu hata ile güncellendi.

## Yapılan değişiklikler ve etkisi

| Dosya / yer | Önce | Yapılan | Beklenen sonuç |
| --- | --- | --- | --- |
| `.github/workflows/build-apk.yml`, runner | `ubuntu-latest` imajı | `ubuntu-24.04` ailesi seçildi | İmaj ailesi değişiminin teşhisi zorlaştırması önlenir; aile içindeki güncellemeler devam eder. |
| `tools/ci-android-disk.sh`, `prepare` | Önceden disk hazırlığı yoktu | Yalnız geçici GitHub-hosted Linux ortamında; sabit izinli listeden bu Android build'in kullanmadığı .NET/PowerShell/Haskell/Swift/Boost/Vcpkg/CodeQL/Azure CLI kurulumları temizlenir. Bilinen SDK kökünde kullanılmayan system-images ve farklı NDK sürümleri temizlenir. | Çalışma dizini için boş alan artar. Yerel PC ve self-hosted runner temizliği reddedilir. |
| Aynı betik, SDK | İmajda birden çok NDK kurulu | Projenin logda doğrulanmış NDK'sı `27.1.12297006` korunur; yoksa Gradle kurar. SDK manager, lisanslar, CMake, platform/build-tools ve platform-tools korunur. | Gerekli Android araçları ve dört ABI üretimi çalışmaya devam eder. |
| Workflow, Gradle cache | `~/.gradle/caches` tamamı + wrapper; geniş `gradle-Linux-` restore; build147'de 1.930.126.049 byte sıkıştırılmış cache gerçekten geri yüklendi | Yalnız `caches/modules-2` bağımlılıkları + wrapper; ayrı `android-deps-v2-` cache alanı | Eski geniş cache'deki transform/native çıktılar yeni çalışmaya geri yüklenmez. Açılmış eski cache'in gerçek disk boyutu ölçülmedi; disk hatasındaki tek neden olduğu iddia edilmez. |
| Betik + workflow, build öncesi | Disk tamamen dolana kadar geç hata | Hazırlık sonrası ve bağımlılık/cache/prebuild sonrası en az **24 GiB** boş alan kontrolü | Alan yetersizse uzun Gradle başlamadan açık hata çıkar. Eşik gerçek run disk raporuyla değerlendirilecek; kalıcı boş alan garantisi değildir. |
| Workflow, Gradle kaynak bütçesi | 5 GiB JVM, paralel görevler | 4 GiB JVM, 768 MiB metaspace, parallel=false, workers.max=2 | Standart özel repo makinesinde derleme yükü sınırlanır; disk hazırlığından ayrı kaynak iyileştirmesidir. Süre biraz uzayabilir. |
| Workflow, son adım | Disk boyutlarını gösteren kalıcı teşhis yoktu | `always()` ile `df` ve workspace/node_modules/android/Gradle/SDK `du` raporu | Hata veya başarı sonunda gerçek boş alan görünür. |
| `frontend/app.json`, `frontend/package.json` | 18.7.26 / 180726 | Beş sürüm alanı 18.7.27 / 180727 / `GPT ELITE v18.7.27 RC1` | Yeni deneme önceki sürümden ayrılır; DEV kurulum sürümü artar. Yeni paket bağımlılığı yoktur. |

İzinli temizlik yalnız disposable GitHub VM içindir. `prepare` hiçbir zaman PC'de GitHub değişkenleri taklit edilerek çalıştırılmadı. Testler yalnız `check/report` için sahte `df` çıktısını kullandı; gerçek GitHub build ayrıca ölçülür.

Uygulama TS/Kotlin/player/MAC/Room davranışına bu düzeltmede müdahale edilmedi. 18.7.26'nın bütün özellikleri korunur. Dört ABI (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) azaltılmadı, MPV/DEX/C++ sembol kontrolü ve imza doğrulaması kaldırılmadı. Debug/release ayrımı korunur; bu çalışma DEV/debug derlemeyi manuel tetikler.

## Doğrulama kaydı

- YAML js-yaml ile parse edildi; workflow_dispatch ve 24 adım mevcut. Beş sürüm alanı eşleşiyor.
- Bash syntax `bash -n`: PASS; betikte CR byte yok. GitHub dışında `prepare`: exit 2, temizliğe başlamadan reddedildi.
- Okuma modunda davranış testi: 20 GiB → exit 1; tam 24 GiB ve 32 GiB → exit 0; düşük alanda `report` exit 0; self-hosted → exit 2. Kayıt `.codex-ci-disk-tests-v18727.log`. Geçici fixture yalnız ignored `frontend/android/.codex-ci-disk-tests/` içinde; depoya alınmaz.
- `yarn tsc --noEmit`: **PASS / exit 0, 24.92 saniye**; `.codex-tsc-v18727.log`.
- Tam `node tools/denetle.js`: **PASS / exit 0**, son satır `TÜM DENETİMLER TEMİZ — paketlenebilir`; `.codex-denetle-v18727.log`. Hiçbir denetim atlanmadı.
- Yeni uzak build manuel tetiklendi: **build148**, [run37762527676](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/37762527676). Kaynak SHA **`f05187bcee3e6a3f37841fadf7ccd087828efb0a`**; API headSha eşleşti, event `workflow_dispatch`, dal doğru. **Nihai durum completed / conclusion success**; APK/disk/imza/asset kontrolleri ve post-cache kapanışı geçti. Tam log `.codex-ci148-full.log` (ignored).

## Uzak derleme ve nihai teslim

Kaynak commit **`f05187bc`**: 6 dosya, 138 ekleme / 13 silme. Origin'e yeni dal push başarılı. Manuel girdiler `new_architecture=true`, `build_type=debug`, `make_release=true`; UTC 10:17:52 / Türkiye 13:17:52 başlangıcı. İş UTC **10:59:53 / Türkiye 13:59:53**'te başarıyla tamamlandı; toplam **42 dakika 1 saniye**. .27 ilk build'de başarılı oldu; ikinci düzeltme/dispatch gerekmedi. Son teslim belgesini ekleyen commit yalnız MD dosyalarını değiştirir; APK'nın kaynak ağacı `f05187bc` olarak kalır.

İlk uzak kilometre taşı: disk hazırlığı (`prepare`) **success**, dolayısıyla o adımın sonundaki en az 24 GiB kontrolü de geçti. JDK/Node/bağımlılık kurulumu geçti. ADB 8 Ekim son kontrolde de boş; bağlı telefon yok. APK indirme bağlantısı aşağıda; telefona kurulum yapılmadı ve hiçbir normal/DEV uygulama kaldırılmadı.

İkinci uzak kilometre taşı: tam `denetle.js`, semantik TypeScript, temiz Expo prebuild ve http/TV/uzaktan kumanda manifest kontrolleri **success**. Daraltılmış Gradle cache adımı ve bağımlılık/prebuild/cache sonrası ikinci **24 GiB** kontrolü de **success**. `APK derle` UTC **10:23:56**'da başladı. Arada `gh run watch` ağ bağlantısı hatasıyla kapandı; ayrı `gh run view` run'ın hâlâ `in_progress` olduğunu doğruladı. Yalnız izleyici yeniden bağlandı; yeni workflow tetiklenmedi ve bu ağ olayı build hatası sayılmadı.

Üçüncü uzak kilometre taşı: APK derlemesi UTC **10:57:17**'de **success** (33 dakika 21 saniye adım süresi; Gradle komutu **BUILD SUCCESSFUL in 33m 13s**, 640 görev / 640 yürütüldü). Final APK MPV/DEX/C++/dört ABI kontrolü, paket/sürüm/imza, ABI boyut raporu, artifact upload, GitHub Release ve son disk raporu **success**. Gradle/Yarn cache kaydetme ve job kapanışı da geçti; API run ve job conclusion **success** doğrulandı.

Yeni özel release: [build-148](https://github.com/mkizilkan/kizilkan-player-elite/releases/tag/build-148), id **406726595**, `draft=false`, target kaynak `f05187bc`. [DEV APK indir](https://github.com/mkizilkan/kizilkan-player-elite/releases/download/build-148/KIZILKAN-PLAYER-ELITE-v18.7.27-DEV-build148.apk): asset `uploaded`, **482.288.759 byte**, API digest **`sha256:67ad9e1f773c5d9779c0d5a0a98ba9c631494a8b6f6444a5957d30c6a6df63ee`**. APK yerelde `frontend/android/ci-build148/KIZILKAN-PLAYER-ELITE-v18.7.27-DEV-build148.apk` dosyasına indirildi; **hash ve byte boyutu API ile birebir eşleşti**. Ayrıca indirilen dosyada `aapt` ve kriptografik `apksigner verify` exit 0 geçti.

Gerçek APK: paket **`com.gpt.kizilkan.player.dev`**, versionCode **180727**, versionName **18.7.27-dev**. APK Signature Scheme v2 doğrulandı. Sertifika SHA-256 **`FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C`**; SHA-1 **`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`**. .26 DEV ile aynı imza/paket; Google Cloud DEV Android istemcisinin paket/SHA-1 kimliği değişmez. Parola veya özel anahtar kaydedilmedi.

### Logdan doğrulanan gerçek disk ölçümleri

| Ölçüm zamanı / log satırı | Sonuç | Anlamı |
| --- | --- | --- |
| Hazırlık öncesi, 133 | `/dev/root` 72G toplam, 59G kullanım, **14G boş** | Eski imajın Android native build için dar olan başlangıç alanı doğrudan görüldü. |
| Hazırlık sonrası, 143–145 | **37G boş**; 37.910.052 KiB | Kullanılmayan araç/NDK temizliği alanı artırdı; 24 GiB kapısı geçti. |
| Cache/prebuild sonrası Gradle öncesi, 636–640 | **35G boş**; 36.564.912 KiB | İkinci 24 GiB kapısı gerçek build bütçesini doğruladı. Yeni `android-deps-v2` cache ilk run'da miss (618) oldu. |
| APK + release sonrası, cache kaydetmeden önce, 2099 | **22G boş** | Tam APK üretimi disk dolmadan tamamlandı. Eşik yalnız build öncesi uygulanır; son rapor 24 GiB altında kaldığı için başarılı build'i bozmaz. |
| Son `du`, 2100–2103 | node_modules **5,2G**, frontend/android **3,7G**, ~/.gradle **4,6G**, SDK **6,6G** | Aynı dosya sistemi içindeki alt dizinlerdir; ayrı kapasiteler olarak toplanıp disk garantisi çıkarılmaz. |

Final native logu 1858–1865: **arm64-v8a, armeabi-v7a, x86_64, x86** mevcut; MPVLib `classes11.dex` içinde; dört ABI'nin her birinde gerekli 4 `__ndk1` sembolü, `from_chars` dahil karşılanıyor. Yalnız AAR dosyasına bakılarak başarı verilmedi; final APK açılıp denetlendi. Devir belgesi [release asset olarak indirilebilir](https://github.com/mkizilkan/kizilkan-player-elite/releases/download/build-148/AI-DEVIR-v18.7.27-CI-DISK-DUZELTMESI.md).

Depo **PRIVATE** kalır. Kişisel 579 hesap arşivi ignored kalır, hiçbir commit veya release asset içine konulmaz. Yeni APK linki GitHub oturumu ister. Telefonda sağlayıcı/görüntü/Drive çalışma testi, yalnız CI'nin başarıyla derlenmesinden çıkarılamaz.

## Birincil kaynaklar

- [GitHub runner özellikleri](https://docs.github.com/en/actions/reference/runners/github-hosted-runners): özel depolarda standart Linux makine kaynakları ve geçici VM davranışı.
- [Ubuntu 24.04 imaj envanteri](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md): ANDROID_HOME yolu ve yüklü araç/NDK envanteri; projenin gereken NDK sürümü build147 logundan doğrulandı.
- [GitHub varsayılan değişkenleri](https://docs.github.com/en/actions/reference/workflows-and-actions/variables): `RUNNER_ENVIRONMENT=github-hosted/self-hosted` ayrımı.
- [Dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching): path/cache anahtarı ve restore-prefix davranışı.
- [Gradle build environment](https://docs.gradle.org/current/userguide/build_environment.html): JVM ve parallel/workers seçenekleri.
