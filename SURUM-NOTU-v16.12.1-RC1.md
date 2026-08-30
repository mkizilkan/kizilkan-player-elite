# KIZILKAN PLAYER ELITE v16.12.1 RC1

## Ana hedef
v16.11.0 CLAUDE tabanını koruyarak PCAP ile kanıtlanan MAG320 minimal uyumluluğu, daha güçlü ban/rate-limit koruması ve player kanal/panel geçiş düzeltmelerini birlikte teslim eder.

## MAG
- İlk genel uyumluluk yolu: MAG320 + Ethernet + encoded MAC + Europe/Paris + `/portal.php?action=handshake&type=stb`, `JsHttpRequest` olmadan.
- Başarılı token aynı oturumda minimal `get_profile` ve sonraki portal çağrılarında yeniden kullanılır.
- Learned profile/endpoint/handshake variant korunur.
- Aynı portal+MAC handshake çağrıları single-flight yapılır.
- Toplam handshake ağ bütçesi 8, auth-red bütçesi 4.
- v16.12.1: minimum pacing 1.25 sn; auth reddi arttıkça adaptif bekleme büyür.
- Güvenli durma cooldown'u 5 dakikadır ve kalıcı storage ile korunur.
- Farklı protocol/port/host medya hedeflerine Authorization/Cookie/X-User-Agent/Referer gibi portal kimliği taşınmaz.

## Player
- Stalker kanal değişiminde eski resolved URL yeni kanala sahiplenemez.
- Async resolve generation guard stale sonucu reddeder.
- Raw `ffmpeg ...` Stalker komutu Media3/VLC/MPV/Cast/test fallback'ına verilmez.
- Yeni medya URL'si hazır olana kadar eski native video surface render edilmez.
- Claude'un Media3 session-key remount koruması korunur.
- Emergency touch catcher aktifken ana gesture katmanı kapatılır.
- Panel açıldıktan sonraki çift callback 500 ms koruma ile yeniden kapatma yapamaz.
- Stale auto-hide timer callback'leri generation guard ile etkisizdir.

## Sürüm
- App version: 16.12.1
- Android versionCode: 161201
- Önerilen Git branch: `v16.12.1-rc1`
