# GPT / Opus devir — v18.7.27 RC1, GitHub disk kaynaklı build düzeltmesi

Tarih: 8 Ekim 2026. Dal: `v18.7.27-rc1-ci-disk-budget`. Kullanıcı başarısız GitHub build'in kök nedeninin giderilmesini, commit/push ve manuel tetikleme yapılmasını; tekrar hata çıkarsa aynı çalışma içinde teşhis/düzeltme/tetiklemenin sürdürülmesini istedi.

## Kanıtlanan hata

- Başarısız çalışma: [build147 / run37751994761](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/37751994761).
- Kaynak: `eff555cde4175784778ca21d4e6f8d43f468af72`, v18.7.26. Girdiler: `new_architecture=true`, `build_type=debug`, `make_release=true`.
- Uzak tam denetim, semantik TypeScript ve Expo prebuild geçti. Gradle 22 dakika 19 saniye çalıştı; 633 görev yürütüldü.
- Hata görevi: `:react-native-reanimated:bundleDebugAar`. `libreanimated.so` (arm64-v8a) debug AAR ZIP'ine yazılırken `java.io.IOException: No space left on device` oluştu.
- Yerel tam hata kaydı: `.codex-ci147-failed.log` (ignored). Hata görevi/satırları: 1196, 1203–1204; disk istisnası 1465/1470; Gradle sonuç 1487. Bu bir TypeScript veya Kotlin derleme hatası olarak raporlanamaz.
- v18.7.26 yerel APK başarıyla derlenmişti ve özel release'den indirilebilir. GitHub build147'nin başarısız olması yerel APK'yı başarısız yapmaz. Önceki .26 teslim belgesindeki bekleyen uzak sonuç bu hata ile güncellendi.

## Yapılan değişiklikler ve etkisi

| Dosya / yer | Önce | Yapılan | Beklenen sonuç |
| --- | --- | --- | --- |
| `.github/workflows/build-apk.yml`, runner | `ubuntu-latest` imajı | `ubuntu-24.04` ailesi seçildi | İmaj ailesi değişiminin teşhisi zorlaştırması önlenir; aile içindeki güncellemeler devam eder. |
| `tools/ci-android-disk.sh`, `prepare` | Önceden disk hazırlığı yoktu | Yalnız geçici GitHub-hosted Linux ortamında; sabit izinli listeden bu Android build'in kullanmadığı .NET/PowerShell/Haskell/Swift/Boost/Vcpkg/CodeQL/Azure CLI kurulumları temizlenir. Bilinen SDK kökünde kullanılmayan system-images ve farklı NDK sürümleri temizlenir. | Çalışma dizini için boş alan artar. Yerel PC ve self-hosted runner temizliği reddedilir. |
| Aynı betik, SDK | İmajda birden çok NDK kurulu | Projenin logda doğrulanmış NDK'sı `27.1.12297006` korunur; yoksa Gradle kurar. SDK manager, lisanslar, CMake, platform/build-tools ve platform-tools korunur. | Gerekli Android araçları ve dört ABI üretimi çalışmaya devam eder. |
| Workflow, Gradle cache | `~/.gradle/caches` tamamı + wrapper; geniş `gradle-Linux-` restore | Yalnız `caches/modules-2` bağımlılıkları + wrapper; ayrı `android-deps-v2-` cache alanı | Eski geniş cache'deki transform/native çıktılar yeni çalışmaya geri yüklenmez. Bu katkı nedenidir; eski cache'in gerçek boyutu ölçülmediği için disk hatasının tek sebebi olduğu iddia edilmez. |
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
- Yeni uzak build: henüz tetiklenmedi. Run/source SHA, başlangıç/son disk alanı, APK paket/ABI/imza ve özel release asset sonuçları tamamlanınca aşağıya eklenecek.

## Uzak derleme ve teslim (tamamlanınca güncellenecek)

Kaynak commit/push ve manuel çalıştırma zorunlu denetimlerden sonra yapılır. Yeni run başarısızsa gerçek hata logu okunup yeni neden giderilir; kör yeniden deneme yapılmaz. Uzak APK başarı göstermeden tamamlandı sayılmaz.

Depo **PRIVATE** kalır. Kişisel 579 hesap arşivi ignored kalır, hiçbir commit veya release asset içine konulmaz. Yeni APK linki GitHub oturumu ister. Telefonda sağlayıcı/görüntü/Drive çalışma testi, yalnız CI'nin başarıyla derlenmesinden çıkarılamaz.

## Birincil kaynaklar

- [GitHub runner özellikleri](https://docs.github.com/en/actions/reference/runners/github-hosted-runners): özel depolarda standart Linux makine kaynakları ve geçici VM davranışı.
- [Ubuntu 24.04 imaj envanteri](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md): ANDROID_HOME yolu ve yüklü araç/NDK envanteri; projenin gereken NDK sürümü build147 logundan doğrulandı.
- [GitHub varsayılan değişkenleri](https://docs.github.com/en/actions/reference/workflows-and-actions/variables): `RUNNER_ENVIRONMENT=github-hosted/self-hosted` ayrımı.
- [Dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching): path/cache anahtarı ve restore-prefix davranışı.
- [Gradle build environment](https://docs.gradle.org/current/userguide/build_environment.html): JVM ve parallel/workers seçenekleri.
