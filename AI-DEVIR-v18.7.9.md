# AI DEVİR — v18.7.9 RC1 (iki aşamalı portal keşfi + keşif/profil telemetrisi)

**Taban:** `v18.7.8-rc1-catalog-speed-discovery` (5dd8bd23). **Dal:** `v18.7.9-rc1-twophase-discovery`.

## Kanıt (cihaz DEV 18.7.8, weko-azure.xyz)
- Çoklu MAC "all" taraması: `MAG_DISCOVERY_PORT_SCAN scanned:54 open:3 unknown:51`, sonra yol denemesi **54 portun hepsinde** (~757), **8,8 dk**, `valid:0`. Arada yol/handshake kaydı YOK → neden bulunamadığı görünmüyordu.
- `STALKER_ACCOUNT_SNAPSHOT.mainInfoFields:["mac","phone"]` → kullanıcı adı get_main_info'da yok; get_profile'da olabilir (IPTV Extreme "bilgi"de gösteriyor).

## Yapılan
- **İki aşamalı keşif (`magPortalDiscovery.ts`):** `classifyPorts` → `{open, unknown}`. `twoPhaseExpand`: Aşama 2a **yalnız AÇIK portlarda** yollar (seçilebilir bulununca DUR); Aşama 2b bulunamazsa **bilinmeyen portlar fallback**. 757 yerine ~(açıkPort×14); yanlış-negatif korunur. `scope all` ve `fallback` genişlemesi bu akışı kullanır.
- **Keşif telemetrisi:** `MAG_DISCOVERY_RESULT` (açık portlar, bulunan aday endpoint'ler + confidence/HTTP/kanıt, state, probes) → portalın neden bulunamadığı kanıtla görülür. `MAG_DISCOVERY_PORT_SCAN` artık açık port LİSTESİ taşır.
- **Kullanıcı adı:** `STALKER_ACCOUNT_SNAPSHOT.profileFields` (get_profile alan adları, değer yok).

## Doğrulama (PC)
tsc temiz · denetle TEMİZ (exit 0) · `check-v18709-release.js` PASS · keşif testi 15 grup. Native değişiklik YOK.
v18706 kapısı `reachableOpenPorts→classifyPorts` güncellendi.

## Cihazda doğrulanacak
1. weko-azure taraması: **hızlı** mı (iki aşama), `MAG_DISCOVERY_RESULT`'ta açık portlarda hangi adaylar/HTTP durumları görülüyor → portal gerçekten var mı, hesap ne diyor.
2. HKPREMIUM `profileFields` → kullanıcı adının hangi alanda olduğunu gör, gerekiyorsa normalize'a ekle.
