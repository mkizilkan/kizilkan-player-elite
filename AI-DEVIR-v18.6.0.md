# AI DEVİR — v18.6.0 RC1

**Taban:** `v18.5.0-rc1-proxy-speed-media` (042b0662). **Dal:** `v18.6.0-rc1-record-download-cast`. Plan: `PLAN-v18.6.0.md`.
Kanıt: `kizilkan-diagnostics-2026-09-28T16-34-56-522Z.json` (v18.5.0; rapor artık tam: 4.069 olay).
Onaylar (28.09): parçalı indirme bağlantı sınırı uyarılı; kayıt 3 motorda (canlı + film/dizi); yerel videoda Cast; + izlendi işaretleri (29.09).

## 1. Kanıtlı düzeltmeler
| # | Sorun | Kök neden | Düzeltme |
|---|---|---|---|
| 1.1 | Combo tarama "etkin 1", 833 hesap ~15 dk | Parti sabit 5–15 hesap; combo'da hesap başına 1 aday → işçi sayısı parti işine (1–15) kırpılıyor, partiler sıralı | Parti, cihazın işçi kapasitesini (×3 iş) doyuracak kadar hesap kapsar (≤500 hesap uçuşta); `BATCH_PLAN` telemetrisi (iş, işçi) |
| 1.2 | Proxy'li/Normal anahtarı çoklu hesapta yok | Yalnız "Kodum var" bölümüne konmuştu | Çoklu hesap tarama ayarlarına da eklendi |
| 1.3 | TXT'ye kaydet hata | Android İndirilenler SAF sağlayıcısı dosya oluşturmaya izin vermiyor | Varsayılan `İndirilenler/KIZILKAN PLAYER ELITE/Hesap Arşivi/` (MediaStore; Android 10+ izinsiz); "Başka klasöre kaydet" + Paylaş korunur (`PublicStorage.kt`) |
| 1.4 | Medya Merkezi fotoğraf 25–77 sn (19.521) | Her 2.000'lik sayfada MediaStore sorgusu baştan | Native sayfa önbelleği (sorgu bir kez); ilk 1.500 hemen ekranda, kalanı aşamalı + "yükleniyor x / y"; sekme geçişine `computeMs` telemetrisi (video 1,9 sn'nin hesap mı çizim mi olduğu kanıtlanacak) |
| 1.5 | Kısayol simgeleri boş kutu | Sistem simgeleri (android.R.drawable) birçok başlatıcıda çizilmiyor | Kendi simgeler (`plugins/withShortcutIcons.js`, uyarlanabilir + Android 7.1 vektör) |
| 1.6 | Kısayol açıyor ama ekrana götürmüyor | Log: `APP_SHORTCUT_OPEN` 0. İstek normal açılışla aynıydı; Android ek veriye bakmadan isteği iletmiyor | Her kısayolun kendi eylemi (`<paket>.SHORTCUT_<AD>`); `APP_SHORTCUT_WAITING/UNKNOWN/OPEN` telemetrisi; profil/PIN kapısı korunur |

## 2. Yeni özellikler
| # | Özellik |
|---|---|
| 2.1 | **Kayıt 3 motorda.** VLC: eski. MPV: `stream-record` (aynı bağlantı). Media3 canlı: zaman kaydırma kaydedicisinin akışı dosyaya da yazılır ("tee", aynı bağlantı); kaydedici kapalıysa kayıt süresince zorunlu açılır (oynatma kaydediciye geçer). Film/dizi (Media3/MPV): dosyanın tamamı indirme motoruyla (1 bağlantılı hesapta uyarı). HLS şifreli/fMP4 akış tee ile kaydedilemez → açık hata. Telemetri `RECORD_START/STOP/START_FAILED` |
| 2.2 | **Parçalı indirme** (`DownloadEngine.kt`): 1/2/4/8/16 parça (HTTP Range), duraklat/devam (parça bazında kaldığı yerden, kalıcı), hız + kalan süre, sunucu Range vermezse tek parça, çok parça reddedilirse (403/429/456/503) tek parçaya düşer |
| 2.3 | İndirme diyaloğu: boyut + Range desteği (native ön sorgu), hesabın bağlantı sınırı (`max_connections`); sınır aşılırsa uyarı |
| 2.4 | Varsayılan görünür klasör `İndirilenler/KIZILKAN PLAYER ELITE/Filmler` · `/Diziler/<dizi>`; "Başka klasör seç" (SAF); eski "Uygulama içi" korunur. Bölüm satırlarında indirme düğmesi. İndirilenler ekranında native indirmeler (ilerleme, hız, kalan, parça, duraklat/devam/iptal, oynat, dosya yolu) |
| 2.5 | **Sürekli çal/oynat** (yerel müzik/video kuyruğu): Tekrar Kapalı/Tümü/Tek + Karıştır (kalıcı). Slayt: "Sürekli" / "Sonda dur" |
| 2.6 | **Chromecast:** fotoğraf + slayt (görüntüleyicide yayın düğmesi; slayt ilerledikçe alıcıya yeni fotoğraf). Yerel video/müzik: oynatıcıdaki düğme v18.2.0'dan beri köprüyle gönderiyor (cihazda test edilecek) |
| 2.7 | **Simge:** ay-yıldız Türk Bayrağı Kanunu oranlarıyla (`tools/make-icons.py`; hilal uçları–yıldız taşması 0,0154 G, kaynakla aynı); renkler korunur |
| 2.8 | **İzlendi işaretleri:** %90'ı geçen film/bölüm kalıcı "izlendi" (profil başına; eskiden %95'te ilerleme silinip bilgi kayboluyordu). Bölümde ✓ veya "Kaldığın yer · N dk kaldı" çubuğu; sezon sekmesinde "✓" / "3/10" / "●"; filmde izlendi düğmesi (dokun → işaretle/kaldır) ve "Tekrar İzle"; bölüme uzun bas → işaretle/kaldır; afişlerde ✓, yarım çubuğu, dizide "S2·B5" (son açılan bölüm) |

Kapı: `tools/check-v18600-release.js`.

## 3. Doğrulama
`yarn tsc --noEmit` temiz · `node tools/denetle.js` TÜM DENETİMLER TEMİZ · `assembleDebug`: sohbet özetinde.

## 4. Cihaz testi
1. Kısayol: simgeler görünüyor mu; Ara/Favoriler/TV Rehberi/Çoklu Ekran doğru ekrana götürüyor mu (uygulama açıkken ve kapalıyken).
2. Combo tarama: "etkin" sayısı 1'e düşmüyor mu, tarama hızlandı mı.
3. TXT kaydı: dosya yöneticisinde `İndirilenler/KIZILKAN PLAYER ELITE/Hesap Arşivi/`.
4. Kayıt: MPV ve Media3 motorunda canlı kanal kaydı; dosya boyutu > 0 ve oynatılabiliyor mu. Media3/MPV'de filmde "Kaydet" → İndirilenler'de indirme.
5. İndirme: film ve bölüm; parça sayısı; duraklat/devam; uygulamayı kapatıp açınca devam.
6. Medya Merkezi: fotoğraflar hemen görünmeye başlıyor mu; "yükleniyor x / y".
7. Tekrar/karıştır (müzik), slayt "Sonda dur", fotoğraf/slayt Chromecast.
8. İzlendi: bölüm bitince ✓, sezon sayacı, afişlerde ✓/çubuk/S·B.
9. Yeni ay-yıldız simgesi ve açılış ekranı.

## 5. Bilinen sınırlar
- Media3 canlı kayıtta, zaman kaydırma kapalıysa kayıt başlarken yayın kaydediciye geçer (kısa bir yeniden bağlanma).
- Tee kaydı yalnız MPEG-TS akışlarda; şifreli HLS / fMP4 akışta açık hata verir (VLC/MPV ile kaydedilebilir).
- Film/dizi kaydı ve paralel parçalar hesabın bağlantı sınırına takılabilir (uyarı + otomatik tek parça).
