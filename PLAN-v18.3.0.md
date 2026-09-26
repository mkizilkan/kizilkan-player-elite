# PLAN — v18.3.0 (TASLAK · kodlanmadı)

Durum: **Plan aşaması.** CLAUDE.md §2/8 gereği maddeler kullanıcıyla detaylandırılıp ONAYLANMADAN kodlanmaz.
Önce kullanıcı v18.0.0 / v18.1.0 / v18.2.0 APK'larını cihazda test edip gözlemlerini yazacak; gelen bulgular
(hata düzeltmeleri) bu sürüme öncelikli olarak eklenecek.

## 1. Kullanıcının plana aldığı maddeler

### 1.1 Taramaya özel proxy (kullanıcı: "sonrasında beraber detaylandırırız")
**Amaç:** Çoklu hesap/panel taramasını dış bir HTTP/SOCKS5 proxy üzerinden yapmak. Sağlayıcı tarama yüzünden
IP engellerse bu engel proxy'nin IP'sine düşer; kullanıcının kendi IP'siyle izleme etkilenmez.

**Kapsam (ilk sürüm):** yalnız tarama trafiği (`PanelScanService.kt` → `probePhysical` HttpURLConnection).
Oynatma, liste yenileme, EPG DEĞİŞMEZ.

**Birlikte netleştirilecek sorular:**
- Proxy türleri: HTTP, SOCKS5 veya ikisi. Kimlik doğrulama (kullanıcı adı/şifre) gerekli mi?
- Tek proxy mi, proxy listesi mi (sırayla/dönüşümlü kullanım; biri ölürse sıradakine geçiş)?
- Proxy başına eşzamanlılık sınırı ve "proxy engellendi" tespiti.
- Proxy'nin tarama başında test edilmesi (dış IP'yi gösterip "proxy çalışıyor" onayı).
- Ayarın yeri: tarama ekranı mı, Ayarlar mı?
- Güvenlik uyarısı: proxy sahibi Xtream kullanıcı adı/şifrelerini görebilir (HTTP), güvenilir proxy önerisi.
- Proxy şifresinin saklanması (cihazda şifreli depolama) ve tanı raporunda maskelenmesi.

**Teknik not (kodda doğrulandı):** Tarama isteği `java.net.HttpURLConnection` ile yapılıyor → `URL.openConnection(Proxy)`
ile HTTP/SOCKS proxy doğrudan eklenebilir; SOCKS5 kimlik doğrulaması için `Authenticator` gerekir.
**Dikkat:** Tek hesap/panel keşfinin bir kısmı JavaScript'te `fetch` ile yapılıyor (`src/utils/serverCode.ts`
`player_api.php` denemesi). JS `fetch` proxy desteklemez → detaylandırmada hangi tarama yollarının JS'te kaldığı
çıkarılacak; proxy açıkken bu denemeler native'e taşınmalı, yoksa trafik proxy'yi atlayıp kullanıcının IP'sinden gider.

### 1.2 DEV APK'nın tek başına çalışması
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
