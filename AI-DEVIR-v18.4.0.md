# AI DEVİR — v18.4.0 RC1

**Taban:** `v18.3.0-rc1-scan-proxy` (b3bb771c). **Dal:** `v18.4.0-rc1-media-proxy-fix`. Plan: `PLAN-v18.4.0.md`.
Kanıt: `kizilkan-diagnostics-2026-09-27T17-26-23-204Z.json` (v18.3.0, cihaz).

## 1. KRİTİK — Yerel medya MAG listesi aktifken 404
**Log:** `LOCAL_MEDIA_OPEN` → `CHANNEL_SELECTED {channelId: local-…, source: stalker}` → `create_link` (MAG portalı) → `MEDIA3_ERROR 404`.
**Kök neden:** `PlayerHost` Stalker çözümüne yalnız `activePlaylist.source`'a bakarak karar veriyordu.
**Düzeltme:** `directFileSession` (local- kimliği veya `content://`/`file://`) → `playlistSource = "local"`, `playbackPlaylist = undefined`
(MAG başlıkları dosyaya taşınmaz). Oynatma yolundaki TÜM kararlar `playlistSource`'a bağlandı. MAG film/catch-up `ext=true`
ile açıldığından ayrım "external" üzerinden DEĞİL dosya kimliği/şeması üzerinden yapılır (onlar create_link'e gitmeye devam eder).
Aynı hata MAG aktifken İndirilenler/Kayıtlar dosyalarında da vardı; o da kapsandı. Telemetri `LOCAL_MEDIA_SOURCE_ROUTED`.
Kapı: `tools/check-v18400-local-source.js` (korumasız `activePlaylist?.source` kalmamalı). Eski iki kapı (v17.10.2, v16.12.1)
iki yazımı da kabul edecek şekilde güncellendi.

## 2. Taramaya özel proxy — test motoru
v18.3.0 cihaz gözlemi "400 indirdi, 21 çalışıyor"un sebepleri (kanıtlı): (a) 400 tavanı ilk kaynakta (Proxifly, 31 bin) doluyordu,
seçili diğer 5 kaynak HİÇ indirilmiyordu; (b) tür yazmayan listeler (Proxio "tümü" 20 bin satır, ProxyScrape SOCKS5) HTTP sanılıyordu.
| # | Yapılan |
|---|---|
| 2.1 | Tam indirme (güvenlik tavanı 200 bin). |
| 2.2 | Kaynak × tür seçimi; her kaynağın sağladığı tür görünür. Satırlar kaynağın türüyle etiketlenir (`defaultScheme`). |
| 2.3 | Katalog 27.09.2026'da canlı doğrulandı: Proxifly, Monosans, Proxio, IPLocate, Proxmint, ProxyScrape, TheSpeedX (SOCKS4/5), mmpx12, Vakhov, Roosterkid, Hookzof. Çıkarılanlar: jetkai, ShiftyTR (2023'ten beri güncellenmiyor), TheSpeedX HTTP (HTML dönüyor). |
| 2.4 | Test modu: Sistem (4 IP-yankı adresi sırayla + şeffaf proxy eleme: yanıttaki IP = kendi IP'miz) veya kullanıcının sitesi (2xx/3xx + isteğe bağlı metin). |
| 2.5 | Native arka plan test motoru: eşzamanlılık 64 (4–160), Duraklat / Devam / "Yeter, kullan" / İptal; "Test etmeden kullan" (ödemeli gateway). |
| 2.6 | Canlı ilerleme (500 ms): test i/toplam, çalışan/ölü/şeffaf, tür bazında çalışan, hız, kalan süre, en hızlı 10. İndirme ilerlemesi kaynak kaynak. |
| 2.7 | Havuz (gecikmeye göre sıralı) cihazda şifreli kalıcı (Keystore AES-GCM, biçim v2; v18.3.0 biçimi okunur). |
| 2.8 | Taramada proxy hatası ≠ sunucu hatası: aynı deneme sıradaki proxy ile en çok 3 kez tekrarlanır (yanlış negatif önlenir). Havuz tükenirse tarama kullanıcının IP'sine düşmez, **duraklar** (`pauseReason=SCAN_PROXY_EXHAUSTED`, bildirim). Tarama ekranında uyarı: "Proxy'leri yeniden test et" / "Kendi bağlantımla devam" (onaylı). |
Telemetri: `SCAN_PROXY_CANDIDATES_LOADED`, `SCAN_PROXY_POOL_BUILT`, `SCAN_PROXY_ROTATE`, `SCAN_PROXY_EXHAUSTED(_PAUSE)`, `SCAN_PROXY_TEST_OK/FAILED`.
Test: `tools/test-scan-proxy.js` 20 grup.

## 3. Medya Merkezi (`app/media-center.tsx`, `app/photo-viewer.tsx`)
- Sekmeler Müzik · Video · Fotoğraf · Klasörler (klasör gezgini = eski `local-media` ekranı, korunur).
- Cihazın tamamı native MediaStore sorgusuyla (`queryDeviceMediaJson`, sayfalı); küçük resim `getDeviceMediaThumbnail` (≤256 px, önbellekli).
- İzin `PermissionsAndroid` (Android 13+ READ_MEDIA_VIDEO/AUDIO/IMAGES; 14+ kısmi erişim). `READ_MEDIA_IMAGES` + `READ_MEDIA_VISUAL_USER_SELECTED` eklendi.
- Türkçe duyarsız arama (ad + sanatçı + albüm + klasör), sıralama (tarih/ad/boyut/süre/tür, ↑↓), gruplama (albüm/sanatçı/klasör/ay),
  akıllı filtreler (kısa/uzun video, ekran kaydı, kısa sesleri gizle, ekran görüntüleri), HD/FHD/4K rozeti, ilerleme çubuğu, "Devam et" şeridi,
  Tümünü oynat / Karıştır, uzun basış → Bilgi / Paylaş / Sıraya ekle. Oynatma yerel medya ile AYNI akış (kuyruk ±1000).
- Fotoğraf görüntüleyici: kaydırma, iki parmak yakınlaştırma 1–5×, çift dokunma, slayt 3/5/10 sn (ekran açık: native `setKeepScreenOn`),
  döndürme, bilgi, paylaş; TV: kontroller gizliyken ◀ ▶, ⏯ slayt.
- TV odak dönüşü: `navOrigin: "media-center"` PlayerHost/PlayerContext eşlemesine eklendi. Yeni npm paketi YOK.
Test: `tools/test-device-media.js` 7 grup.

## 4. Ayarlar denetimi
| Öğe | Önce | Şimdi |
|---|---|---|
| Kayıt Alma (DVR) | "YAKINDA", "Publish edin" | Kayıt ZATEN çalışıyor (VLC). Etiket "VLC", nasıl yapılır + "Kayıtlarım" |
| Ana ekran kısayolları | "Publish sonrası aktif"; kodda yoktu | Native dinamik kısayollar (Ara/Favoriler/TV Rehberi/Çoklu Ekran). URL değil açılış işareti → profil/PIN kapısı atlanmaz |
| Bildirim paneli | "Publish sonrası aktif"; yalnız yerel ses | "Arka planda oynatmaya devam et (Media3)" anahtarı; canlı/film/dizi de. VLC/MPV'de yok (yazıyor) |
| Chromecast | satır "AKTİF", pencere "Publish edin" (çelişki) | Pencere gerçeğe uyduruldu |
| Siri / Google Assistant | "Publish sonrası otomatik"; kodda HİÇBİR şey yok | Etiket "YOK", dürüst açıklama (App Actions Play yayını gerektirir). Özellik kaldırılmadı (hiç yoktu) |
| Sütunlu (DENEYSEL) | — | Aynen |

## 5. EPG — seçili kategorinin rehberi (kullanıcı isteği, 27.09.2026)
Kütüphane sağ üst EPG düğmesi ve TV ana ekranı (kumanda Rehber tuşu + YENİ görünür Rehber düğmesi) seçili canlı kategoriyi
`/epg-timeline?group=` ile açar; rehber o grupla açılır, grup şeridi ona kayar (TV'de odak orada). Özel kategoriler (Tümü/Favoriler/
Son izlenenler) ve listede olmayan grup → "Tümü". Diğer gruplara şeritten geçilir.

## 6. DEV APK
v18.3.0'daki gibi PC'siz çalışır (`debuggableVariants = []`, JS paketi gömülü).

## 7. Doğrulama
`yarn tsc --noEmit` temiz · `node tools/denetle.js` TÜM DENETİMLER TEMİZ · yeni kapılar/testler (local-source, scan-proxy 20, device-media 7) ·
`assembleDebug`: sohbet özetinde.

## 8. Cihaz testi
1. **MAG listesi aktifken** Medya Merkezi → video ve müzik açılıyor mu (404 bitmeli). İndirilenler/Kayıtlar dosyası da.
2. MAG film ve catch-up hâlâ açılıyor mu (regresyon yok).
3. Proxy: Otomatik liste → birkaç kaynaktan SOCKS5 seç → İndir → sayılar tür bazında doğru mu → Testi Başlat → Duraklat/Devam → "Yeter, kullan".
4. Proxy açıkken tarama; havuz biterse duraklama + uyarı + iki seçenek.
5. Medya Merkezi: izin kartı, üç sekme, arama (ı/i, ş/s), sıralama/gruplama/filtre, Devam et, fotoğraf yakınlaştırma/slayt, TV'de odak dönüşü.
6. Ayarlar: DVR penceresi, uygulama simgesine uzun basma kısayolları (profil/PIN'den sonra ilgili ekran), arka planda oynatma anahtarı (Media3).
7. EPG: "Ulusal" kategorisi seçiliyken EPG düğmesi → rehber "Ulusal" ile açılıyor mu; diğer gruplara geçilebiliyor mu. TV'de Rehber düğmesi/tuşu.

## 9. Bilinen sınırlar
- Ücretsiz proxy'lerin çoğu ölü/datacenter; asıl fayda ödemeli rotating proxy'de. `https://` proxy (proxy'ye TLS) desteklenmez.
- Test motoru uygulama kapanırsa kaldığı yerden sürmez (havuz önceki hâliyle kalır).
- Logdaki 81 `ANR_WATCHDOG_STALL` (MAG kökenli, bilinen #4/#5) bu sürüme alınmadı.
