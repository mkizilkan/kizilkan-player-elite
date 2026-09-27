# AI DEVİR — v18.3.0 RC1

**Taban:** `v18.2.0-rc1-epg-combo-cast-dev` (cd12176a). **Dal:** `v18.3.0-rc1-scan-proxy`.
Kullanıcı onayı (27.09.2026): PLAN-v18.3.0 §1.1 (taramaya özel proxy, 13 madde) + §1.2 (tek başına çalışan DEV APK).

## A. Taramaya özel proxy (yalnız tarama trafiği)

**KAPSAM:** Oynatma, liste yenileme, EPG, timeshift DEĞİŞMEZ. Yalnız çoklu hesap/panel taraması etkilenir.
Varsayılan **KAPALI** (isteğe bağlı). Ayar: **Ayarlar → Tarama Proxy'si** ve tarama ekranındaki bağlantı.

| # | Ne yapıldı |
|---|---|
| P1 | Aç/kapa anahtarı; kapalıyken tarama bugünküyle birebir aynı (`select()` null → doğrudan bağlanır). |
| P2 | İki kaynak: **Elle** (satır yapıştır) ve **Otomatik liste** (kaynak URL indir → ayrıştır → birleştir → test). |
| P3 | Ayrıştırıcı (`src/utils/scanProxyParse.ts`, SAF): `ip:port`, `http(s)://`, `socks4/5://`, `socks://`→socks5, `user:pass@host:port`, domain uç nokta, **port aralığı**; şema yoksa http; yorum/fazla sütun atılır. |
| P4 | Protokoller: HTTP + SOCKS4/5 native (`java.net.Proxy` + `Authenticator`). Sıra SOCKS5>SOCKS4>HTTP. `https://` proxy native desteklenmez → HTTP gibi denenir (rehber §2: "HTTPS" satırlarının çoğu HTTP+CONNECT). |
| P5 | Havuz + rotasyon (`ScanProxyPool.kt`): run başında `warmPool` testUrl'e karşı test eder, gecikmeye göre sıralar (bütçe 20 sn, ≤12 iş parçacığı). `select()` round-robin; 429/503 veya bağlantı hatasında `reportResult` → 3 hata / ban'da ölü. `Semaphore(4)` korunur. |
| P6 | Rotating (backconnect gateway): domain + kimlik + port aralığı ile tek girişte çalışır. |
| P7 | **JS keşfi native'e taşındı:** `serverCode.ts` `probeXtreamHost` proxy AÇIKKEN `PanelScan.proxiedProbe` (native) kullanır → trafik proxy'yi ATLAMAZ. Kapalıyken doğrudan `fetch` (davranış değişmez). Native tarama zaten `probePhysical`'da proxy kullanır. |
| P8 | Güvenlik uyarısı ekranda: hedef `http://` ise kimlik proxy'ye görünür; ücretsiz public proxy trafiği kaydedebilir. |
| P9 | Proxy adres/şifre cihazda **şifreli** (`ScanProxyPool` Android Keystore AES-GCM, ek bağımlılık yok). Tanı olaylarında yalnız maskeli host (`socks5://***:***@host:port`); kimlik LOG'a yazılmaz. |
| P10 | "Test et": `warmPool` + proxy üzerinden dış IP (`testExternalIp`, kullanıcı tetikler). Ülke bilgisi (GeoIP) eklenmedi — izin gerektirdiği için ayrı bırakıldı. |
| P11 | Ayar yeri: `app/scan-proxy.tsx` ekranı; **Ayarlar** ve **tarama (add-playlist)** ekranından bağlantı. |
| P12 | Telemetri: `SCAN_PROXY_ENABLED/DISABLED` (JS), `SCAN_PROXY_POOL_BUILT`, `SCAN_PROXY_TEST_OK/FAILED`, `SCAN_PROXY_ROTATE`, `SCAN_PROXY_BANNED_HOST` (native, kimlik maskeli). |
| P13 | `tools/test-scan-proxy.js` (18 test grubu; rehberdeki her biçim + aralık + tekilleştirme + maskeleme); `denetle.js`'e eklendi. |

**Dosyalar:**
- Native: `modules/panel-scan/.../ScanProxyPool.kt` (yeni), `PanelScanModule.kt` (configureScanProxy/warmScanProxyPool/testScanProxy/getScanProxyStatus/proxiedProbe), `PanelScanService.kt` (probePhysical proxy + `ensureScanProxyReady`).
- JS: `modules/panel-scan/index.ts` (köprü + tipler), `src/utils/scanProxyParse.ts` (yeni, saf), `src/utils/scanProxy.ts` (yeni, yapılandırma/indirme/uygula/test), `src/utils/serverCode.ts` (keşif proxy yönlendirme).
- UI: `app/scan-proxy.tsx` (yeni), `app/(tabs)/settings.tsx` (bağlantı), `app/add-playlist.tsx` (bağlantı).

## B. DEV APK tek başına çalışır (§1.2)

`plugins/withDevVariant.js` → debug derlemesine `react { debuggableVariants = [] }` eklendi → `index.android.bundle`
gömülür. **Metro (npx expo start) KAPALIYKEN** DEV APK gömülü kodla açılır (release gibi). **Metro AÇIKKEN**
developer support etkin olduğu için önce sunucudan yüklenir (canlı güncelleme); erişilemezse gömülü pakete düşer.
Maliyet: debug derlemesine ~1 dk. Yeni mimari/bridgeless geri dönüşü CİHAZDA doğrulanacak.

## C. Doğrulama (PC)
`yarn tsc --noEmit` temiz (14 sn) · `node tools/denetle.js` **TÜM DENETİMLER TEMİZ** · parser 18 test grubu TEMİZ ·
Kotlin native derlemesi: (aşağıda / sohbet özetinde). Kotlin değişti → `assembleDebug` çalıştırıldı.

## D. Cihaz testi
1. **DEV APK PC'siz:** Metro kapalıyken KIZILKAN DEV açılıyor mu (gömülü kod)? Metro açıkken canlı güncelleme sürüyor mu?
2. **Proxy kapalı:** Ayarlar → Tarama Proxy'si KAPALI iken tarama eskisi gibi çalışıyor (regresyon yok).
3. **Elle proxy:** bir `socks5://...` veya `http://...` gir → Kaydet & Uygula → **Test et** → dış IP proxy'nin IP'si mi?
4. **Otomatik liste:** bir kaynak seç (ör. ProxyScrape SOCKS5) → Kaydet → kaç proxy yüklendi; Test et.
5. **Tarama proxy'li:** proxy açıkken çoklu hesap/panel taraması sonuç buluyor mu; log'da `SCAN_PROXY_*`.
6. **Güvenlik:** `http://` panelde uyarı görünüyor. Tanı raporunda proxy şifresi maskeli.
7. **Rotating gateway (ödemeli):** tek `host:port` + kullanıcı/şifre girişi çalışıyor mu.

## E. Bilinen sınırlar (dürüst)
- Ücretsiz public proxy'lerin çoğu ölü/yavaş; paneller datacenter IP'yi sık engeller → asıl fayda ödemeli rotating proxy'de.
- `https://` proxy (proxy'ye TLS) native desteklenmez (ilk sürüm); gerekirse sonraki sürümde SSLSocket ile.
- Ülke/GeoIP teşhisi (PLAN §2.1) bu sürüme alınmadı — dış servis izni gerektiriyor.
