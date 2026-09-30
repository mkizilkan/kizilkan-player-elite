# AI DEVİR — v18.7.0 RC1

**Taban:** `v18.6.0-rc1-record-download-cast` (24b087e8). **Dal:** `v18.7.0-rc1-repeat-shortcut-multimac`.
Kanıt: `kizilkan-diagnostics-2026-09-29T17-49-12-989Z.json` (v18.6.0, 450 olay) + `…T18-08-50-636Z.json` (v18.6.0, 95 olay, 3 soğuk açılış).
Onaylar (29–30.09): tüm düzeltmeler + çoklu-MAC bu build'de; öneriler (A–J) sonraki build'lerde.

## 1. Kanıtlı düzeltmeler
| # | Sorun | Kök neden (kanıt) | Düzeltme |
|---|---|---|---|
| P1 | Yerel medya "Tek Tekrarla" başa dönmüyor | Log: `LOCAL_REPEAT_ONE` 3 kez tetiklendi (mantık çalışıyor). MPV `idle=yes`: dosya bitince END_FILE → dosya bellekten boşalır → `seekTo(0)` yapacak dosya yok | `restartCurrentPlayback`: MPV'de `reload()` (loadfile replace + oynat), VLC'de başa sar + oynat, Media3'te currentTime=0 + play |
| P2 | "Tümünü Tekrarla" tek dosyada tekrar etmiyor | Tek öğeli kuyrukta `naturalEnd` erken dönüyordu (sonraki = kendisi) ve komşu üretimi `localRepeat !== "one"` ile kesiliyordu | Tek öğede "tümü" de başa döner (`LOCAL_REPEAT_RESTART`); kuyruk yalnız tekrar KAPALIYKEN atlanır |
| P3 | Kısayollar (Ara/Favoriler…) ekrana götürmüyor | İki log: `APP_SHORTCUT_*` 0 — "bekliyor" bile yazılmadı → kısayol kimliği JS'e HİÇ ulaşmadı. Soğuk açılışta modül `OnNewIntent`'i çalışmaz; yedek `currentActivity.intent` okuma anında kimliği taşımıyordu | `ShortcutInbox` + `KizilkanShortcutPackage` (ReactActivityLifecycleListener): kimlik Activity OLUŞTURULURKEN ve her yeni istekte yakalanır; ek veriden ya da eylem sonekinden çözülür; döndürmede tekrar yönlendirmez. Native `SHORTCUT_INTENT_RECEIVED` (via cold/warm/late) + JS `SHORTCUTS_INSTALLED` (eski sessiz `catch` kaldırıldı) |
| P4 | Kısayol simgeleri boş kutu | Kaynak (uyarlanabilir XML) simgeler başlatıcıda çizilmiyordu | Simgeler bitmap olarak çizilir (`createWithAdaptiveBitmap`, 7.1'de `createWithBitmap`); sabitlenmiş kısayollar `updateShortcuts` ile yenilenir; telemetride simge türü |
| P5 | Medya Merkezi yavaş | Log: 19.536 fotoğraf yüklemesi 80 sn; 9.500 öğede hesap 9,9 sn, video 1.104'te 1,7 sn. `localeCompare(…,"tr",{numeric})` Hermes'te her çağrıda yeni karşılaştırıcı kurar; aynı tarihli fotoğraflarda her karşılaştırma ada düşer; aşamalı yüklemenin her sayfasında tüm liste yeniden sıralanıyordu | Tek `Intl.Collator` (`trCompare`), `normalizeTr` ASCII hızlı yolu (çıktı birebir aynı — test), gruplamada başlık/15 dk dilim önbelleği, sekme başına görünüm önbelleği (geri dönüş anında) |

## 2. Yeni: Çoklu MAC (MAG) ekleme
- **Ekran:** `app/mag-bulk.tsx` (MAG bölümünde "Çoklu MAC" düğmesi).
- **Portal kaynağı:** adres gir (http/https'siz; virgül/boşluk/alt alta; port opsiyonel) · rehber (kod / panel adı / tümü).
- **MAC:** serbest liste (her biçim) ve/veya aralık (başlangıç + adet; üst sınır 1024). Tekilleştirme, geçersiz sayısı.
- **Port/portal otomatik keşfi:** port yoksa `host × {80, 8080, 8000, 2052, 2082, 2086, 2095, 25461, 8880, 443} × {/c/, /portal.php, /stalker_portal/server/load.php, /server/load.php, /c/portal.php, /stalker_portal/, /load.php}` adaylarından her birine TEK hafif handshake; token dönen ilk aday = doğru portal (host başına bir kez, önbellek). Ban-güvenli bütçe ve aralık korunur.
- **Proxy:** `ScanProxyPool.proxiedRequest` (özel başlık + POST gövdesi, rotasyon). `setMagProxyRouting` yalnız taranan hostları proxy'ye yönlendirir; oynatma/normal ekleme etkilenmez. Proxy başarısızsa doğrudan bağlantıya sessizce düşülmez ve "MAC geçersiz" sayılmaz (`kind=PROXY`).
- **Sonuç:** Geçerli / Süresi dolmuş / Yetkisiz-bloke / Portal yok / Hata; "Geçerli N hesabı ekle" (tekrar eklenenler atlanır, canlı katalog arka planda — live-first).
- Duraklat / Devam / İptal. Telemetri: `MAG_BULK_SCAN_START/DONE`, `STALKER_PORTAL_DISCOVERY_*`, `MAG_PROXY_WIRE(_FAILED)`, `MAG_BULK_ADDED`.

Dosyalar: `src/utils/magBulk.ts` (saf, test: `tools/test-mag-bulk.js`), `src/utils/magBulkScan.ts`, `src/utils/stalker.ts` (`discoverMagPortal`, `setMagProxyRouting`, req() proxy dalı — panel-scan tembel import: VM kapıları kırılmasın), `modules/panel-scan` (`proxiedRequest`).

## 3. Doğrulama
`yarn tsc --noEmit` temiz · `node tools/denetle.js` TÜM DENETİMLER TEMİZ (yeni: `test-mag-bulk.js`, `check-v18700-release.js`) · `test-device-media.js` 8 grup TEMİZ · `assembleDebug`: sohbet özetinde.

## 4. Cihaz testi
1. Yerel müzik ve video: Tekrar "Tek parça" → sona gelince baştan başlıyor mu (MPV/VLC/Media3). Tek dosyalık klasörde "Tümü".
2. Kısayollar: uygulama KAPALIYKEN ve AÇIKKEN Ara/Favoriler/TV Rehberi/Çoklu Ekran. Simgeler görünüyor mu. Sonra log gönder: `SHORTCUT_INTENT_RECEIVED` (via) ve `SHORTCUTS_INSTALLED` (icons) görünmeli.
3. Medya Merkezi: fotoğraf sekmesi açılışı ve sekme geçişleri; `MEDIA_CENTER_TAB_SWITCH.computeMs` düşmeli.
4. Çoklu MAC: kendi MAC'lerinle, önce portu verilmiş adresle, sonra portsuz adresle (keşif). Proxy'li ve proxy'siz.

## 5. Bilinen sınırlar
- Keşif aday sayısı host başına 24 ile sınırlı (ban riski); sıra dışı port/yol kullanan portalda adresi portuyla ve `/c/` ile girin.
- Rehber hostları Xtream panel hostlarıdır; MAG portalı aynı hostta farklı port/yolda olabilir → keşif dener, yoksa "Portal yok".
- Proxy'li MAG isteklerinde yönlendirme izlenmez (stalker kendi yönetir).
