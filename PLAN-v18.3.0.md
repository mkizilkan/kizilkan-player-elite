# PLAN — v18.3.0

Durum: **§1.1 ve §1.2 KODLANDI** (dal `v18.3.0-rc1-scan-proxy`; ayrıntı `AI-DEVIR-v18.3.0.md`).
§2 maddeleri hâlâ kullanıcı kararı bekliyor; §3'e cihaz gözlemleri işlenecek.

## 1. Kullanıcının plana aldığı maddeler

### 1.1 Taramaya özel proxy — ONAYLANDI (27.09.2026), kodlanmadı
**Amaç:** Çoklu hesap/panel taramasını dış bir proxy üzerinden yapmak. Sağlayıcı tarama yüzünden IP engellerse
bu engel proxy'nin IP'sine düşer; kullanıcının kendi IP'siyle izleme etkilenmez.

**Kullanıcı kararları:** (1) hem otomatik liste hem elle giriş · (2) SOCKS5 öncelikli, HTTP de kabul ·
(3) hedef panel `http://` ise uyar · (4) proxy tamamen isteğe bağlı, **varsayılan KAPALI** · (5) tüm ücretli/rotating
(backconnect gateway) link formatları desteklensin.

**Güvenlik gerçeği (netleşti):** Şifreyi açığa çıkaran proxy türü değil, **hedef panelin şeması**. Hedef `https://`
ise proxy yalnız `host:443` görür (CONNECT), kullanıcı adı/şifre şifrelidir — HTTP proxy bile olsa güvenli. Hedef
`http://` ise istek düz metindir (`...player_api.php?username=X&password=Y`), proxy sahibi her şeyi görür — SOCKS5
bile olsa. Uyarı bu şart üzerine kurulur.

**Rotating (backconnect gateway) proxy:** Sağlayıcı tek kapı adresi verir (`gateway.saglayici.com:7777` + kullanıcı/şifre),
rotasyon sunucu tarafındadır → bizim kod tek proxy satırı gibi görür. Gerekli: domain uç nokta + auth + (bazı
sağlayıcılarda) port aralığı. "Sticky session" kullanıcı adına gömülüyse olduğu gibi geçirilir.

**Kesinleşmiş maddeler:**
| # | Madde | Ne yapılacak |
|---|---|---|
| P1 | Aç/kapa | Ayar "Taramada proxy kullan" — varsayılan KAPALI. Kapalıyken tarama bugünküyle birebir aynı. |
| P2 | İki kaynak | (a) Elle: proxy satır(lar)ı yapıştır. (b) Otomatik liste: kaynak URL (Proxifly/Monosans/ProxyScrape/IPLocate… veya elle URL) → indir, ayrıştır, tekilleştir, test et, çalışan havuz. |
| P3 | Format ayrıştırıcı | `ip:port`, `http://`, `https://`, `socks4://`, `socks5://`, `user:pass@host:port`, domain uç nokta, port aralığı. Şema yoksa varsayılan HTTP. |
| P4 | Protokoller | HTTP + SOCKS4/SOCKS5 native (`java.net.Proxy` + `Authenticator`). Sıra SOCKS5 > SOCKS4 > HTTP. Sınır: gerçek `https://` proxy (proxy'ye TLS) `HttpURLConnection` ile native desteklenmez → ilk sürümde HTTP gibi denenir/atlanır (listelerdeki "HTTPS" satırlarının çoğu HTTP+CONNECT, onlar çalışır). |
| P5 | Havuz + rotasyon | İndir→normalize→tekilleştir→kısa timeout test→gecikmeye göre sırala. 403/ban/timeout'ta proxy'yi kötü işaretle, sıradakine geç. Mevcut `Semaphore(4)` korunur. Havuz boyutu/test süresi sınırlı. |
| P6 | Rotating gateway | Domain + auth + port aralığıyla tek girişte çalışır (yukarıda). |
| P7 | Kapsam | Yalnız tarama trafiği. Oynatma/yenileme/EPG/timeshift DEĞİŞMEZ. `PanelScanService.kt`→`probePhysical` + `serverCode.ts` JS `player_api.php` denemeleri proxy AÇIKKEN native köprüye (`proxiedProbe`) yönlendirilir (yoksa trafik proxy'yi atlar). **İşin en ağır parçası.** |
| P8 | Uyarı | Hedef `http://` ise: "kullanıcı adı/şifre proxy sahibine görünür." + genel: "ücretsiz public proxy trafiği kaydedebilir; güvenilir/ödemeli önerilir." |
| P9 | Depolama + gizlilik | Proxy adres/şifresi cihazda şifreli (EncryptedSharedPreferences), tanı raporunda maskeli (`socks5://***:***@host:port`), depoya asla girmez. |
| P10 | Proxy testi | "Test et" → proxy üzerinden dış IP. Ülke için dış GeoIP → ayrı izin (§2.1 kuralı). IP-echo isteğe bağlı. |
| P11 | Ayar yeri | Liste/hesap ekleme (tarama) ekranında "Tarama proxy'si" bölümü + Ayarlar girişi. |
| P12 | Telemetri | `SCAN_PROXY_ENABLED/DISABLED`, `SCAN_PROXY_POOL_BUILT(total,working)`, `SCAN_PROXY_TEST_OK/FAILED`, `SCAN_PROXY_ROTATE(reason)`, `SCAN_PROXY_BANNED_HOST` — kimlik maskeli. |
| P13 | Denetim + test | `denetle.js` kapıları güncel; parser için Node birim testleri (her format örneği); cihaz testi AI-DEVIR'e. |

**Dürüst uyarılar (kodlama onayından önce kayıtta):**
1. P7 (JS keşfini native'e taşıma) bu sürümün ağırlığı; olmazsa trafiğin bir kısmı proxy'yi atlar.
2. Ücretsiz public proxy: çoğu ölü/yavaş, paneller datacenter IP'yi sık engeller, ömür kısa → asıl fayda ödemeli
   rotating proxy'de. Kod ikisini de kabul eder.
3. P4 https-proxy sınırı: nadir, ilk sürümde tam desteklenmez; gerekirse sonraki sürümde SSLSocket ile eklenir.

### 1.2 DEV APK'nın tek başına çalışması — KODLANDI (27.09.2026)
**Sorun (doğrulandı):** Debug APK içinde JS paketi yok (`index.android.bundle` yok); PC'de Metro açık
değilse "Unable to load script" hatası verir.
**Plan:** `plugins/withDevVariant.js` → debug derlemesinde de JS paketini göm (`debuggableVariants = []`).
- PC kapalıyken: gömülü kodla açılır (release gibi).
- Metro açıkken: React Native önce sunucuyu dener (canlı güncelleme). Yeni mimaride (bridgeless) bu geri
  dönüş davranışı CİHAZDA DOĞRULANACAK.
- Maliyet: debug derlemesine ~1 dk.

## 2. Önerildi, kullanıcı kararı bekliyor
| # | Öneri | Not |
|---|---|---|
| 2.1 | Erişim teşhisi (giriş OK mi, kanal 403 mü, sunucu ülkesi, bağlanılan ülke) | Ülke bilgisi için dış GeoIP servisi → kullanıcı izni gerekir |
| 2.2 | Oynatma sırasında taramada "nazik mod" (eşzamanlılık düşer, izlenen sunucu sona) | Tarama zaten ön plan servisi olarak arka planda çalışıyor |
| 2.3 | Taramada akıllı yavaşlatma | Kodda doğrulanan eksikler: Retry-After 5 sn'ye kırpılıyor; 403/zaman aşımında bekleme yok; üstel bekleme ve jitter yok; host soğutma yok |
| 2.4 | Liste bazında oynatma proxy'si (taramaya özel proxy'den sonra) | Media3 için yerel proxy köprüsü gerekir |

## 3. Kullanıcı test geri bildirimi
(v18.0.0–v18.2.0 cihaz gözlemleri buraya işlenecek; kanıt = Flight Recorder raporu.)
