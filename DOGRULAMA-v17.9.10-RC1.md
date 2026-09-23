# v17.9.10 RC1 doğrulama kaydı

## Bu ortamda geçen kontroller
- `checkdefs.js`: TEMİZ
- `checkcalls.js`: TEMİZ
- `checkdeps.js`: BAYAT KAPANIŞ YOK
- `checkctx.js`: TEMİZ
- `checkhooksrc.js`: TEMİZ
- `checkimports.js`: TEMİZ
- `checkjsx.js`: TEMİZ
- `checkplayercore.js`: TEMİZ
- `checktdz.js`: TEMİZ
- `checktdzselftest.js`: TEMİZ
- `check-v17910-playlist-recovery.js`: PASS
- `check-v16143-regression-contract.js`: PASS
- `check-v17001-forward-semver-regression.js`: PASS
- Değişen TS/TSX dosyaları TypeScript `transpileModule` sözdizimi kontrolü: PASS

## Master `tools/denetle.js`
Master zincir çalıştırıldı. v17.9.10 hard-gate ve tarihsel regression kapıları ilerledi. Bu çalışma ortamında `frontend/node_modules` bulunmadığı için iki TypeScript proje kapısı gerçek bağımlılıkları çözümleyemedi (`expo/tsconfig.base`, React Native/Expo type paketleri yok). `npm install` denemesi ortam zaman sınırında tamamlanmadı. Bu nedenle tam `tsc --noEmit` sonucu **cihaz/CI buildinde ayrıca doğrulanmalıdır**; burada geçmiş gibi gösterilmemiştir.

## Cihaz kabul matrisi
1. Profil girişinden sonra Room'u boş Xtream playlist: global recovery overlay görünmeli ve liste otomatik açılmalı.
2. Ayarlar/Playlist Yönetimi içinden 0 kanal boş kabuk: `SEÇ` sonrası aynı overlay görünmeli.
3. Overlay: DNS → Hesap → Katalog → Cihaza kayıt → Room doğrulama → Hazır.
4. Katalog satırı gerçek durum göstermeli: `Canlı ⏳ · Film ⏳ · Dizi ⏳`, sonra tamamlananlar `✅` olmalı.
5. Uzun endpointte 15/30 sn bekleme mesajı görünmeli; kullanıcı uygulamayı donmuş sanmamalı.
6. Aynı `SEÇ` art arda basıldığında ikinci download başlamamalı (`PLAYLIST_SWITCH_SINGLEFLIGHT_JOIN`).
7. Süreç recovery ortasında öldürülüp yeniden açıldığında `catalogRecovery=running/failed` bariyeri yarım snapshot'ı hazır saymamalı.
8. Büyük Xtream listede live→vod→series sıralı recovery ve per-kind Room commit telemetrisi görülmeli.
9. Normal dolu playlist seçiminde recovery overlay çıkmamalı.
10. Manuel yenileme eski işlevini korumalı ve aynı Canlı/Film/Dizi formatter'ını kullanmalı.
