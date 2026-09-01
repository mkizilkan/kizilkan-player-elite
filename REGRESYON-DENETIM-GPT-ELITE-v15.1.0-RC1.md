# KIZILKAN PLAYER ELITE v15.1.0-RC1 — Regresyon / Kabul Matrisi

## Kaynak HARD gate

- [ ] `node ../tools/denetle.js` temiz
- [ ] `npx tsc --noEmit` 0 hata — yalnız gerçek dependency graph ile
- [ ] Expo clean prebuild başarılı
- [ ] `:mpv-player:compileReleaseKotlin` libmpv 1.0.0 ile başarılı
- [ ] Release Gradle başarılı
- [ ] APK package/version/signature/SHA gate başarılı
- [ ] Artifact + GitHub Release oluştu

## Player P0

- [ ] 4K/UHD MPV: ses + görüntü stabil, first-frame ve reconfigure logları doğru
- [ ] 20 hızlı ZAP: eski kanal sesi kalmıyor
- [ ] 20 hızlı ZAP: yeni kanal görüntüsü geliyor
- [ ] ZAP sonrası UI/haptic/dokunma donmuyor
- [ ] MPV cleanup: eski instance observer/surface callback'i yeni session'a sızmıyor
- [ ] Media3 “Kaldığın yerden devam” gerçek pozisyonla doğrulandı
- [ ] MPV “Kaldığın yerden devam” gerçek pozisyonla doğrulandı
- [ ] MPV VOD seek çalışıyor
- [ ] Media3 VOD seek çalışıyor veya unsupported durumu doğru teşhis ediliyor
- [ ] VLC VOD açılıyor; açmıyorsa URL/header/container kök nedeni kanıtlandı
- [ ] Media3 → MPV/FFmpeg → VLC fallback sözleşmesi regresyonsuz

## libmpv 1.0.0

- [ ] Dependency tam olarak `dev.jdtech.mpv:libmpv:1.0.0`
- [ ] Global 0.5.1 MPV runtime kullanımı kalmadı
- [ ] `MPVLib.create(context)` instance lifecycle kullanılıyor
- [ ] `MpvFormat`, `MpvEvent`, `MpvLogLevel` 1.0.0 API ile derleniyor
- [ ] Surface attach/detach aynı instance'a ait
- [ ] destroy sonrası instance null
- [ ] codec/format/hwdec diagnostics gerçek cihazda geliyor
- [ ] HW first-frame yoksa fresh software MPV instance remount ediliyor
- [ ] Software attempt da görüntü üretmezse AUTO kontrollü VLC’ye geçiyor

## Scan Engine v2

- [ ] Çok Güvenli / Güvenli / Dengeli / Hızlı / Turbo beş profil görünür
- [ ] Profil seçimi gerçek concurrency/timeout davranışını değiştiriyor
- [ ] Çoklu hesaplar bounded account worker pool ile paralel
- [ ] Bulunan hesap ilk bulunduğu anda UI listesinde görünür
- [ ] Yeni sonuç geldikçe kullanıcının seçimi kaybolmaz
- [ ] Pause yeni işi başlatmaz, queue korunur
- [ ] Resume kaldığı queue'dan devam eder
- [ ] Stop sonucu koruyarak taramayı keser
- [ ] Native panel scan pause/resume/stop çalışır
- [ ] Background/lifecycle davranışı gerçek cihazda test edildi; simüle edilmedi

## Telefon UI

- [ ] Settings: Canlı Yayın Tamponu overlap yok
- [ ] Hızlı/Dengeli/Stabil playback buffer kontrolleri overlap yok
- [ ] Tümünü Güncelle overlap yok
- [ ] Playlist kartları birbirine girmiyor
- [ ] Küçük ekran / büyük font testinde touch-target çakışması yok
- [ ] TV layout/focus regresyonu yok

## MAG/Stalker

- [ ] RC1 endpoint/header/cookie geliştirmeleri korunuyor
- [ ] Eski çalışan MAG örneği test edildi
- [ ] Regresyon varsa eski çalışan request ile yeni request karşılaştırıldı

## Devir sözleşmesi

- [ ] `AI-PROJE-DEVIR-BAGLAM.md` v15.1.0-RC1 güncel
- [ ] Yapılmayan test yapılmış gibi yazılmadı
- [ ] KALAN / SONRAKI ISLER gerçek durumu içeriyor
- [ ] Signing secret/private material ZIP/repo belgelerine yazılmadı

## Paketleme öncesi bu çalışma ortamında GERÇEKTEN çalıştırılanlar

- ✅ `node ../tools/denetle.js` — **3 ayrı tur temiz**
- ✅ `tools/checkplayercore.js` — Player Core sözleşmesi temiz
- ✅ `frontend/package.json` / `frontend/app.json` JSON parse
- ✅ `.github/workflows/build-apk.yml` YAML parse
- ✅ `tools/checkplayercore.js` Node syntax
- ✅ aktif MPV modülünde eski `libmpv:0.5.1` dependency yok
- ✅ aktif MPV native kodunda eski static runtime `MPVLib.command/init/destroy` kullanımı yok
- ✅ AI devir belgesi zorunlu sürüm/CI/signing/kalan işler anahtarlarını içeriyor

**Çalıştırılmamış / bu ortamda güvenilir biçimde çalıştırılamayan:** gerçek dependency graph olmadığı için `npx tsc --noEmit`; Android Gradle/Kotlin/libmpv 1.0.0 native compile; APK. Bunların doğrulama yeri temiz GitHub Actions'tır.
