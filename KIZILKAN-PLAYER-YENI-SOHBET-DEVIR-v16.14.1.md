# KIZILKAN PLAYER ELITE — YENİ SOHBET BAĞLAM DEVİRİ
Tarih: 2026-09-01
Geçiş checkpoint'i: v16.14.1 RC1 Recovery Checkpoint

## 1. ÇALIŞMA SÖZLEŞMESİ
- Regresyon, özellik çıkarma/azaltma yok.
- Olmayan bir şey yapılmış gibi söylenmeyecek.
- Her kod değişikliğinden önce plan + kullanıcı onayı; mevcut v16.14.1 kombine plan daha önce onaylandı.
- Kod incelemesi gerçek ve satır/satır kanıta dayalı yapılacak.
- Versiyon ve dosya adı her yeni gerçek sürümde yükseltilecek.
- Ağır doğrulama asistan tarafında; telefon final doğrulama cihazı, build çiftliği değil.
- Her düzeltmede düzeltme yorumu + GitHub'a hazır ZIP + Termux komutları verilecek.
- Telefon klasörü: /sdcard/Download/kizilkan-player
- GitHub repo: https://github.com/mkizilkan/kizilkan-player-elite.git

## 2. SON SAĞLAM TAM TABAN
KIZILKAN-PLAYER-v16.13.10-RC1-CATALOG-MAG-PLAYLIST-CORRECTIVE.zip
Bilinen SHA-256: 05cf032c3ff1aa9c5e5885584c596f3e180ffc2f7abd1b2d520d11ad0372a874

## 3. BU DEVİRLE VERİLEN CHECKPOINT ZIP
KIZILKAN-PLAYER-v16.14.1-RC1-RECOVERY-CHECKPOINT.zip

Bu ZIP, v16.13.10 tam kaynağından yeniden oluşturuldu. Sohbet içinde daha önce kullanılan v16.14.1 çalışma klasörü düzleşip yalnız dokümanlara dönüştüğü için önceki tüm patch'ler fiziksel olarak kurtarılamadı. Bu gerçek gizlenmemelidir.

## 4. CHECKPOINT'TE GERÇEKTEN BULUNAN v16.14.1 DEĞİŞİKLİKLERİ
- frontend/package.json: 16.14.1
- frontend/app.json: version 16.14.1 / Android versionCode 161401
- frontend/src/types/index.ts:
  - catalogCapabilities genişletildi: live/vod supported|empty|unsupported_404|error; series ayrıca vod_fallback
  - catalogSync eklendi
  - magCapabilities eklendi
- frontend/src/utils/diagnostics.ts:
  - export format KIZILKAN_FLIGHT_RECORDER_V7
  - NOT: bu yalnız format etiketi; tam V7 lifecycle correlation değildir.
- KizilkanNativeCoreModule.kt:
  - java.net.InetAddress importu
  - MAG native response metadata: wireHeaderSequence, httpProtocol, tlsVersion, cipherSuite, addressFamilies (yalnız IPv4/IPv6 etiketi), contentEncoding, bodyBytes, connectionHeader, acceptHeader, acceptEncodingHeader, cookieLength, cookieTrailingSemicolon, cookieHasEncodedMac
  - plaintext IP hostAddress loglanmıyor
- stalker.ts:
  - MAG_NATIVE_WIRE olayı yukarıdaki güvenli telemetry alanlarını taşıyor
- tools/check-v16141-recovery-checkpoint.js

## 5. CHECKPOINT GATE GERÇEK SONUCU
PASS:
- version 16.14.1
- versionCode 161401
- catalog sync schema
- MAG capability schema
- Flight Recorder export V7
- native safe wire metadata
- no plaintext resolved IP telemetry
- JS wire telemetry forwarding

## 6. KAYBOLAN / YENİ SOHBETTE YENİDEN UYGULANACAK ONAYLI v16.14.1 BLOKLARI
Aşağıdaki maddeler önceki konuşmada uygulanmış olduğu raporlandı fakat mevcut fiziksel kaynak ağacı kaybolduğu için bu recovery ZIP'inde doğrulanamadı. Yeni sohbette bunlar baştan, gerçek diff ve gate ile uygulanmalı:
1. MAG Capability Discovery gerçek derivation + playlist metadata persistence. Profil varsayımıyla değil gerçek katalog/session kanıtıyla.
2. Incremental Sync V2: Live/VOD/Series SHA-256 snapshot fingerprints; değişmeyen kategori skip; changed kinds tek native Room transaction; metadata commit yalnız Room doğrulaması sonrası. Server delta diye adlandırma; bu client snapshot diff.
3. Playlist activation P0: same-target Map<string, Promise<void>> single-flight; Room verify before active publish; generation stale discard; repair throttle; serialized active key write.
4. Player stale-frame ownership: playlist/channel/session/candidate/profile ownership token; Media3/VLC/MPV native callbacks stale token reddi; view key izolasyonu.
5. HTTP source recovery: 404 not_found, 444/456 session/link renewal, 520 upstream sınıfı; URL fingerprint/age/provenance; aynı stale URL ile kör engine fallback yok.
6. MPV runtime: dev.jdtech.mpv:libmpv:1.0.0 AAR/JNI/ABI/libc++_shared doğrulaması; releaseRuntimeClasspath ve mergeReleaseNativeLibs gerçek build çıktı kontrolü; dependency var diye “fixed” denmeyecek.
7. Tam Flight Recorder V7 correlation: playlistSelect → roomVerify → catalogRecovery → channelSelect → urlResolve → enginePrepare → httpResponse → fallback → firstFrame. Credential redaction korunacak.
8. Startup/ANR: legacy JS hydrate azaltma; Room canonical activation; deferred controlled repair; main-thread stall telemetry.
9. MAG Exact Wire V2: PCAP ile Native OkHttp karşılaştırması; HTTP/1.1, header shape/order sinyali, cookie trailing semicolon, Connection Keep-Alive, Accept application/json, gzip, DNS/IP-family, connection reuse/session binding. Raw wire byte order olduğu iddia edilmeyecek.

## 7. HKPREMIUM PCAP GERÇEĞİ
Çalışan handshake:
GET /portal.php?action=handshake&type=stb
UA: MAG320 stbapp ver:2 rev:250
Cookie: encoded MAC; stb_lang=en; timezone=Europe%2FParis;
Referer: /c/
X-User-Agent: Model: MAG320; Link: Ethernet
Accept: application/json
Connection: Keep-Alive
Accept-Encoding: gzip
Handshake'te token/prehash/JsHttpRequest yok.
Profile/account Bearer token kullanıyor.
Create-link sonucu medya URL'sine portal auth/cookie sızdırılmamalı.
HKPREMIUM daha önce 200 + 21 byte "Authorization failed." döndürüyordu; portal erişilebilir, auth kabul etmiyor. Cihaz testi olmadan fixed denmeyecek.

## 8. SON CİHAZ BULGULARI
v16.13.10 sonrası:
- ilk açılış "Liste içeriği hazırlanıyor..." uzun bekleme
- server-added listelerde seçim sorunu/yavaşlık
- HK premium eklenemiyor
- birçok stream açılmıyor
- eski panel frame'i yeni kanalda kalabiliyor
- OS ANR: input dispatch timed out 5001ms MainActivity
- Flight Recorder örneklerinde PLAYLIST_SWITCH_VERIFY_FAILED / warmPlaylist Room index + legacy yok
- Media3 HTTP 444 ve fallback
- eski logda malformed "ffmpeg http://..." player'a sızmış
- Native MAG wire diğer portallarda çalışıyor; HKPREMIUM portal-specific/session/wire sorunu

## 9. DOĞRULAMA SINIRLARI
Bu recovery checkpoint için Android release APK build YAPILMADI.
Dependency-resolved full TypeScript build YAPILMADI.
Gerçek cihaz HKPREMIUM/MPV testi YAPILMADI.
Eski v16.13.10 gate, literal 16.13.10 metadata kontrol ettiği için 16.14.1'de FAIL verdi; özellik regresyonu diye yorumlanmamalı fakat gate de bu recovery paketinde gevşetilmedi.

## 10. YENİ SOHBETTE İLK İŞ
Kullanıcı ZIP'i yükledikten sonra önce bu devir dosyasını ve `DUZELTME-YORUMU-v16.14.1-RC1.md` oku. Ardından kaynak ağacını gerçekten aç ve yukarıdaki eksik 1–9 bloklarını sırayla yeniden uygula. Her blok sonrası gerçek hard-gate ve diff oluştur. Finalde dependency-resolved TS + Android release build mümkünse çalıştır; mümkün değilse nedenini net sınır olarak yaz.
