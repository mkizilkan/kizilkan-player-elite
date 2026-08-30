# KIZILKAN PLAYER ELITE v16.12.0 RC1 — DÜZELTME YORUMU

Taban: `KIZILKAN-PLAYER-v16.11.0-CLAUDE-MAG-NOJSHTTP.zip`

Bu sürüm, v16.11.0 üzerindeki özellikleri koruyarak gerçek PCAP kaydında çalışan MAG akışını genel bir uyumluluk profiline dönüştürür ve üç kullanıcı gözlemini düzeltir: MAG portalda aşırı deneme/ban riski, kanal değişiminde önceki kanalın son karesinin görünmesi, mobil oynatma panelinin aynı dokunuşun çift işlenmesi nedeniyle erken kapanabilmesi.

## Uygulanan düzeltmeler

- `pcap320-minimal` genel MAG uyumluluk profili eklendi. İlk handshake: `/portal.php?action=handshake&type=stb`, `JsHttpRequest/token/prehash` olmadan; MAG320/Ethernet/Europe%2FParis başlık sözleşmesi kullanılır.
- MAG320 profil doğrulaması minimal `get_profile&type=stb` ve aynı Bearer token ile yapılır.
- Var olan tüm MAG profilleri ve endpoint fallback'leri korunmuştur; tek sağlayıcı adına özel hard-code eklenmemiştir.
- Handshake ağı için 8 global network denemesi, 4 auth-red sınırı, 450 ms pacing, duplicate-response governor, portal+MAC single-flight ve 45 saniyelik kalıcı cooldown eklendi.
- Learned compatibility anahtarı eski `kizilkan.mag.compat.v15225` olarak korunarak mevcut kullanıcıların öğrenilmiş portal profilleri kaybedilmedi.
- PCAP güvenlik sınırı doğrultusunda farklı port/origin medya hedeflerine Bearer ve MAC Cookie taşınmaz. `pcap320-minimal` farklı-origin medya isteğinde MAG API User-Agent/X-User-Agent/Referer da zorlanmaz; native player kendi medya UA'sını kullanır.
- Stalker kanal değişiminde eski `resolvedUrl` yalnız doğru playlist+channel+URL ownership key eşleşirse kullanılabilir. Stale async resolve generation guard ile eski kanal sonucu yeni kanala yazılamaz.
- Stalker raw `ffmpeg ...` kanal komutu Media3/VLC/Cast/test fallback yoluna verilmez.
- Yeni Stalker URL çözülene kadar Media3/VLC/MPV native video yüzeyi render edilmez; böylece önceki kanalın son karesi yeni kanal açılana kadar ekranda kalmaz.
- Claude v16.9.0 Media3 `VideoView` session-key remount düzeltmesi korunmuştur.
- Mobil emergency touch catcher aktifken alttaki tap/double-tap/long-press/volume gesture'ları devre dışı bırakılır. Aynı fiziksel dokunuşun paneli açıp hemen kapatmasına karşı 500 ms anti-double-toggle ve stale hide-generation guard vardır.

## Regresyon koruması

Yeni `tools/check-v16120-pcap-mag-player-controls.js` HARD gate'i gerçek davranış fixture'larıyla şu sözleşmeleri doğrular:

1. İlk MAG320 PCAP handshake/query/header sözleşmesi.
2. Minimal `get_profile` + Bearer token reuse.
3. Farklı port medya hedefinde portal credential/header sızıntısının olmaması.
4. Dört ardışık auth reddinden sonra ağın durması ve ikinci çağrının cooldown sırasında sıfır network isteği üretmesi.
5. Stalker resolved URL ownership/stale generation/raw-url gate.
6. Media3/VLC/MPV eski yüzey kapısı.
7. Mobil control duplicate-touch ve stale timer koruması.

Eski `check-v15225-mag-architecture.js` v16.12.0 profiliyle güncellendi; önceki MAG live-first, learned compatibility, Room-safe enrichment ve adaptive pagination fixture'ları korunarak PASS vermektedir.
