# KIZILKAN PLAYER v16.13.8 RC1 — Düzeltme Yorumu

## Ana düzeltme
MAG PCAP/Loader MAG320 profili Android'de React Native fetch yerine native OkHttp exact transport üzerinden gönderilir. Cookie, User-Agent, X-User-Agent, Referer ve Bearer'ın native request üzerinde gerçekten bulunup bulunmadığı hassas değerleri açığa çıkarmayan SHA-256 kısa fingerprint telemetrisiyle ölçülür.

## Güvenlik
Handshake'te Bearer yoktur; token sonrası isteklerde Bearer korunur. Redirect otomatik takip edilmez; farklı origin'e yönlendirmede Cookie ve Authorization silinir. MAC/token değerleri telemetriye açık yazılmaz.

## Korunan davranışlar
PCAP320 minimal ilk profil, mevcut MAG250/MAG254/golden/full-device fallback'leri, yalnız gerçek 429 için kalıcı cooldown, auth-reject sonrası manuel tekrar özgürlüğü, create_link tek sefer session recovery, Series varyasyonları ve mevcut catch-up/archive alanları korunmuştur.

## Loader analiziyle ilişkili kapsam
Bu RC, Loader kodunu kopyalamaz. Loader + çalışan PCAP'in ortak wire davranışını temiz native implementasyonla yeniden üretir. Mevcut projede zaten bulunan create_link auth recovery, Series multi-varyant çözümleme, catch-up/archive UI/veri alanları ve içerik sıralama altyapısı korunmuştur. Radio'nun birinci sınıf ayrı Room/UI içerik türüne dönüştürülmesi bu RC'de tamamlanmamıştır; şema/UI regresyon riski nedeniyle yapılmış gibi gösterilmez.
