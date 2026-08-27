# KIZILKAN PLAYER ELITE v15.2.14-RC1 — REGRESYON DENETİMİ

**Tarih:** 2026-08-25
**Sürüm/versionCode:** 15.2.14 / 150214

## Zorunlu kaynak sözleşmeleri

1. `stalkerCatalog()` transient VOD/Series hatasını sessiz `[]` fallback ile yutmamalı.
2. Native Series endpointi boş/unsupported olduğunda VOD `is_series`/series-category fallback korunmalı.
3. `stalkerSeriesInfo()` ayrı Series ve VOD-backed season/episode varyasyonlarını desteklemeli.
4. Full backup restore dosya tamamen doğrulanmadan gerçek playlist ID'lerine final swap yapmamalı.
5. Atomik swap Media + EPG + PlaylistSnapshot tablolarını aynı Room transaction içinde taşımalı.
6. Metadata apply başarısızsa Room swap ve backup-managed metadata eski snapshot'a dönebilmeli.
7. v15.2.13 scan control görünürlüğü generic `loading` state'ine geri bağlanmamalı.
8. MAG `AccountInfoCard` provider status tipini doğrudan `.toLowerCase()` varsayımıyla çağırmamalı.
9. Xtream add/refresh/native yollarında Live/VOD/Series content endpointlerinden biri gerçek hata verirse kısmi playlist commit edilmemeli.
10. M3U JS/native classifier parity korunmalı.
11. v15.2.11 scan terminal state, quick parser, selection-before-import, round-robin, DNS alias grouping ve profile session güvenliği korunmalı.

## Otomatik gate

GitHub Actions statik adımında `node ../tools/denetle.js` çalıştığında `tools/check-v15214-hardening.js` de otomatik çalışır. Ayrıca `tools/checkplayercore.js` v15.2.14 sözleşmelerini HARD gate olarak denetler.

Yerel son sonuç:
- `denetle.js`: TEMİZ
- `checkplayercore.js`: TEMİZ
- v15.2.14 Stalker/Backup fonksiyonel fixture: TEMİZ
- TS/TSX parser: 108 dosya / 0 parse hatası
- `package.json` ve `app.json`: JSON temiz

## CI kabul kapıları

GitHub Actions'ta sırayla:
- statik denetim/HARD gates
- `npx tsc --noEmit`
- Expo/native hazırlık
- `kizilkan-native-core` KSP/Kotlin/Gradle
- Android release APK

CI'da ilk hata çıkarsa yalnız ilk gerçek compiler/build hatası kök neden kabul edilir.

## Gerçek cihaz kabul matrisi

- Bulk analiz: Durdur görünür, hazırlıkta Durdur terminal CANCELLED, native scan Durdur worker/socket bırakmaz.
- Duraklat/Devam: aynı runId ile progress gerçekten durur/devam eder.
- Round-robin: birden fazla hesap aynı dönemde ilerler.
- MAG Ayarlar: `AccountInfoCard` crash tekrarlanmaz.
- MAG: Live/VOD/Series sayıları aynı kaynakla güvenilir referans istemciye karşı karşılaştırılır; transient katalog hatası eksik başarılı playlist üretmemeli.
- MAG Series: en az bir native Series portalı ve mümkünse bir VOD-is_series portalında sezon/bölüm oynatma sınanır.
- Xtream: Live/VOD/Series ilk import + restart + refresh sonrası ayrım korunur.
- M3U: bilinen Live/VOD/Series fixture ve gerçek sağlayıcı dosyaları karşılaştırılır.
- Tam Yedek: önce `String length exceeds limit` oluşturan büyük veriyle export tamamlanır.
- Tam Restore: başarılı restore, bozuk/truncated dosya, metadata hatası/iptal senaryolarında eski snapshot güvenliği kontrol edilir.
- Profil PIN, selection-before-import ve DNS alias grouping regresyon testleri korunur.
