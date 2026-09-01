# KIZILKAN PLAYER v16.12.2 RC1 — SÜRÜM NOTU

**Sürüm:** 16.12.2  
**Android versionCode:** 161202

## Ana hedef

v16.12.1 cihaz logunda görülen MAG handshake sıralama ve cooldown sınıflandırma hatalarını düzeltmek; PCAP MAG320 isteğini temiz ilk aday yapmak ve bir sonraki cihaz/PCAP karşılaştırması için ölçülebilir request fingerprint telemetrisi üretmek.

## Korunan özellikler

v16.12.1'in MAG320 PCAP profili, eski MAG250/MAG254 uyumluluk profilleri, session/token reuse, medya credential-boundary, farklı portta Bearer/MAC taşımama, Stalker resolved URL ownership, stale-frame surface gate ve player controls korumaları aynen korunur.

## Beklenen cihaz davranışı

İlk handshake planı `pcap-first...` stratejisini ve `preferredProfile=pcap320-minimal` göstermelidir. İlk `STALKER_HANDSHAKE_TRY` MAG320 / wire-nojs olmalıdır. `Authorization failed.` tekrarları aynı işlemde güvenli bütçeyi durdurabilir ancak 5 dakikalık persistent cooldown üretmemelidir. Gerçek 429/rate-limit cevabı ise 5 dakikalık cooldown üretmelidir.
