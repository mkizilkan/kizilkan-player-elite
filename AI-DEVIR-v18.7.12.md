# AI DEVİR — v18.7.12 RC1 (MAG çoklu-IP DNS failover)

**Taban:** `v18.7.11-rc1-mag-profile-variants` (1efefcfc). **Dal:** `v18.7.12-rc1-mag-ip-failover`.
**Native/Kotlin değişikliği YOK (TS + test + gate + doküman).**

## Kök neden kanıtı (cihaz 04.10.2026, adb + PC karşılaştırması)
- weko-azure.xyz ve goldensm32.xyz **ayakta**: PC'den TCP :80 bağlantısı başarılı (weko `/c/` HTTP 200).
- Telefondan hostname ile: `nc` timeout, `ping` %100 kayıp; uygulama logu: tüm handshake'ler `STALKER_HTTP_TRANSPORT_ERROR TIMEOUT 6000ms`.
- goldensm32.xyz'in **5 A kaydı**; telefondan her biri tek tek test edildi: **yalnız 172.110.220.225 CANLI**, `.69/.249/.250/.251` ÖLÜ.
  Telefonun DNS'i (önce .251, DNS.google ile .249) **ölü IP** döndürüyor → istek 6 sn timeout, OkHttp diğer IP'leri aynı istek
  bütçesi içinde denemiyor → canlı IP'ye hiç ulaşılmıyor. DNS değiştirmek tek başına yetmedi (yetkili DNS ölü IP'leri döndürüyor).
- `hostFailover` (Yedek DNS) **oynatıcı/iptv/refresh'te vardı, MAG ekleme/tarama yolunda (stalker.ts, magPortalDiscovery, magBulkScan) YOKTU.**
  IPTV Extreme çalışıyor çünkü tüm IP'leri deniyor.

## Yapılan
- **Yeni `frontend/src/utils/magHostFailover.ts`:** DoH (`dns.google/resolve` → `cloudflare-dns.com` yedek) ile hostun TÜM IPv4 A kayıtları;
  her IP'ye kısa HTTP yoklaması (2,5 sn, paralel, ilk canlıda erken dönüş); canlı IP host:port için **sabitlenir** (5 dk TTL; host başına tek uçuş;
  başarısızlık 60 sn negatif önbellek). `connectInfo(url)` bağlantıyı canlı IP'ye çevirir + `Host` başlığı hostname; `logicalUrl(url)` yanıt
  URL'ini hostname'e geri çevirir → **IP yalnız fetch sınırında**; origin/redirect güvenlik kontrolleri ve saklanan endpoint hostname kalır.
  Yalnız **HTTP** (HTTPS/SNI dokunulmaz), literal IP girişi ve tek A kaydında devreye girmez.
  Telemetri: `MAG_HOST_IP_FAILOVER` / `MAG_HOST_IP_FAILOVER_NONE` (host + A kaydı sayısı; IP değeri loglanmaz).
- **Yalnız gerçek RN ortamında aktif** (`navigator.product === "ReactNative"`); Node/VM test koşumlarında kapalı → mevcut fixture
  fetch sayımları değişmez. Testler `_setHostFailoverEnabled(true)` ile açar.
- **Bağlama (tembel import — CLAUDE §7 tuzağı):** `stalker.ts` ve `magPortalDiscovery.ts`'te üst düzey import YOK; `loadHostFailover()`
  (`await import` + try/catch; yüklenemezse null → eski davranış). İlk denemede üst düzey import 10 kapıyı kırmıştı (sahte-require VM'leri).
  - `stalker.ts req()`: düz fetch (bulk handshake yolu — `STALKER_HTTP_TRANSPORT_ERROR`'ın geldiği yer) + `exactFetch` (hesap doğrulama)
    → `connectInfo`; `finalUrl` ve `sameApi` kontrolü `logicalUrl` ile.
  - Proaktif pin: `discoverMagPortal` başlangıcı + `stalkerHandshakeInternal` (fire-and-forget).
  - `magPortalDiscovery raw()`: expo/fetch → `connectInfo`; `finalUrl` → `logicalUrl`. Proaktif pin scan başında (proxy kapalıyken).

## Doğrulama (PC)
- `yarn tsc --noEmit` temiz · `node tools/denetle.js` → **✅ TÜM DENETİMLER TEMİZ** (exit 0)
- `check-v18712-release.js` PASS (üst düzey import YASAĞI dahil) · `test-mag-host-failover.js` **7 grup**
  (çoklu IP→canlı pin, tek IP, https, canlı yok, IP girişi, DoH hatası, RN-dışı kapalı/sıfır istek).

## Cihazda doğrulanacak
1. goldensm32 çoklu/tekli: `MAG_HOST_IP_FAILOVER` (aRecords:5) → ardından `STALKER_HANDSHAKE_OK` / `MAG_BULK_HANDSHAKE_FALLBACK_OK`, `valid` ≥ 1.
2. weko aynı şekilde. 3. hkpremium (tek IP / :2095) davranışı değişmemeli.
4. Risk: RN `fetch` `Host` başlığını göndermezse sunucu IP ile karşılanır (tek-kiracılı IPTV sunucularında sorun beklenmez); cihazda gözlenecek.

## Sonraki
Kullanıcı adı zenginleştirme (hkpremium minimal profilde `login` boş → dolu-parametre `get_profile`), player açılış ölçümü, GPT backlog.
