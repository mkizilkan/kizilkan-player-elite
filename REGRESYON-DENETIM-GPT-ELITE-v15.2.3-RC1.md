# REGRESYON DENETİMİ — v15.2.3-RC1

## P0 kabul matrisi
1. Uygulamayı Canlı/Ayarlar/Add Playlist ekranında arka plana al, 1-5 dk sonra dön: profil seçimine cold-start gibi düşmemeli; son güvenli ekran restore edilmeli.
2. 5+ büyük playlist ekle/seç: ana UI native scroll kadar Pressable/navigation da cevap vermeli; aktif olmayan playlist heavy dizileri JS heap'te tutulmamalı.
3. Aynı Xtream hesabının ekleme düğmesine gecikme sırasında tekrar dokun: ikinci iş başlamamalı; aynı server+username deterministic playlist id nedeniyle çoğalmamalı.
4. Çoklu hesap karışık veri: direct server + serverCode + panelName + yalnız username/password aynı çalışmada native foreground discovery kullanmalı.
5. Discovery sırasında başka uygulamaya geç: foreground service sürmeli; geri dönünce progress/results snapshot restore edilmeli.
6. Native bulk import sırasında Activity yeniden yaratılırsa tamamlanan playlist metadata'sı snapshot + SecureStore eşlemesiyle benimsenmeli.
7. EPG yüklenirken kanal listesi ve navigation anında kullanılabilir kalmalı; ilk EPG işi 16 kanal ile sınırlı olmalı.
8. Görüntü geldikten hemen sonra bayat source error `Alternatif yayın yolu deneniyor` durumuna geçmemeli.

## Build gate
- `node ../tools/denetle.js`
- `node ../tools/checkplayercore.js`
- `npx tsc --noEmit` — GitHub/dependency ortamında
- Expo prebuild
- `:panel-scan:compileReleaseKotlin`
- `:kizilkan-native-core:kspReleaseKotlin` / Kotlin compile
- `:mpv-player:compileReleaseKotlin`
- release APK + signing fingerprint
