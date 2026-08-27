# KIZILKAN PLAYER ELITE v15.0.5 RC1

## Amaç
Bu paket, v15.0.4 üzerinde bildirilen kritik regresyonlar için test buildidir. Player Engine henüz 1.0.0 olarak etiketlenmemiştir.

## Uygulanan cerrahi düzeltmeler

### Çoklu Hesap
- Tarama sonucu bulunan hesaplar artık otomatik seçilip doğrudan eklenmez.
- Geçerli panel/DNS sonuçları ayrı seçim ekranında canlı birikir.
- Kullanıcı istediği kadar sonucu işaretleyebilir; yeni sonuç geldiğinde seçimler korunur.
- Seçilen sonuçlar yeniden doğrulanarak eklenir.
- Tarama ilerlemesi, bulunan/kalan bilgisi ve başarısız hesap özeti görünür tutulur.

### Panel / DNS bilmiyorum
- Sonuç penceresi açıldıktan sonra tarama ilerlemesi kaybolmaz.
- Native taramada yüzde, panel/adres sayacı, bulunan sayısı ve aktif panel görünür.
- Native tarama için Durdur düğmesi eklendi.
- Sonuç penceresini kapatmak mevcut bulunan sonuçları silmez.

### Hızlı Yapıştırma
- `kullanici:sifre` formatı desteklenir.
- Şifrede ek `:` karakterleri korunur.
- `http://` gibi URL satırları yanlışlıkla kullanıcı/şifre olarak ayrıştırılmaz.
- CSV/TXT/JSON ve mevcut pipe/noktalı virgül biçimleri korunur.
- Sunucu bilgisi olmayan kullanıcı:şifre kayıtları panel otomatik aramasına gider.

### Film / Dizi devam et
- Kayıtlı anlamlı izleme konumu varsa kullanıcıya `Baştan izle` veya `Kaldığın yerden devam et` sorulur.
- Resume konumu kalıcı PlayerContext üzerinden oynatıcıya taşınır.
- Resume seek, motor gerçekten PLAYING durumuna geldikten sonra bir kez uygulanır.

### MPV / Media3 seek
- Kullanıcı seek/resume yaptıktan sonra stall watchdog için grace period eklendi; seek işlemi yanlışlıkla stall/resync olarak değerlendirilmez.
- MPV absolute seek, `time-pos` property yazmak yerine mpv'nin belgelenmiş `seek absolute+keyframes` komutunu kullanır.
- MPV MediaCodec decode hatasında software fallback eşiği 1 ardışık decode hatasına çekildi.

### MAG / Stalker
- Kullanıcının verdiği gerçek `.php` endpoint ilk aday olarak korunur.
- `/portal.php`, `/load.php`, `/stalker_portal/server/load.php`, `/stalker_portal/server/portal.php`, `/server/load.php`, `/server/portal.php`, `/c/portal.php` adayları desteklenir.
- Alt dizine kurulmuş portallar için endpoint adayları üretilir.
- `X-User-Agent` MAG kimliği eklendi.
- MAC cookie klasik iki-noktalı biçimde gönderilir.
- Endpoint'e uygun Referer üretilir.
- BOM/debug prefix içeren fakat gerçek JSON nesnesi taşıyan eski Stalker yanıtları kontrollü biçimde ayrıştırılır; HTML hata sayfası JSON kabul edilmez.

## Test / Gate
- `node ../tools/denetle.js`: TÜM DENETİMLER TEMİZ.
- `bulkAccounts.ts` bağımsız TypeScript derlemesi başarılı.
- Parser testleri: tek `user:pass`, şifrede iki nokta, çok satır, CSV ve pipe biçimleri PASS.
- Tam Expo TypeScript/Gradle derlemesi bu çalışma ortamında bağımlılıklar kurulamadığı için burada koşturulamadı; GitHub build gate nihai doğrulamayı yapmalıdır.

## Player Engine sürümü
Player Engine 1.0.0 DEĞİL. Bu paket RC testidir. Gerçek cihazda VLC açıp MPV açmayan HLS kanalı, ses-var-görüntü-yok örneği, MPV/Media3 seek ve resume testleri geçtikten sonra 1.0.0 kararı verilecektir.
