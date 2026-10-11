# AI DEVİR — v18.7.13 RC1 (manuel portal seçimi + kullanıcı adı + A01 base64 MAC + exact kati kapsam)

**Taban:** `v18.7.12-rc1-mag-ip-failover` (5d9e3b2f). **Dal:** `v18.7.13-rc1-exact-scope-username-mac`.
**Native/Kotlin değişikliği YOK (TS + test + gate + doküman).**

## Kök neden kanıtları (cihaz 04.10.2026)
- **"Ben seçeyim" seçilemiyor:** `mag-bulk.tsx:589` aday butonu `!candidate.selectable` → devre dışı; panel-b adayları "portal izi" (M05 non-selectable). Ayrıca `magBulkScan` seçim fazına yalnız seçilebilir aday varsa giriyordu → yalnız iz bulunan hostta picker hiç açılmıyordu.
- **panel-a kullanıcı adı:** IPTV Extreme Pro ekranı → gerçek login **`ab3C4dEf`** (şifre `pw1SAMPLE2`). Bizde "1787" = portalın `name` alanı. Telemetri: minimal `get_profile`'da `login` BOŞ (`loginValuePresent=false`).
- **panel-b "mac-mismatch":** failover sonrası handshake OK ama tüm MAC `profile-mac-mismatch` → `accountMatchesMac` base64 MAC'i çözmüyordu (A01; normalizer çözüyor, eşleştirici çözmüyor — tutarsızlık, kullanıcı birçok kez belirtti).
- **"Yalnız girilen" kapsam:** kullanıcı bu kapsamı seçince bile family (/portal.php vb.) deneniyordu; kullanıcı KATİ istiyor (yalnız girilen port+yol).

## Yapılan
- **#1 Manuel portal seçimi (`mag-bulk.tsx`, `magBulkScan.ts`):** Manuel ("ben seçeyim") modda "portal izi" (non-selectable) adaylar da SEÇİLEBİLİR (UI disabled koşulundan `!selectable` yalnız otomatik modda). Seçim fazı, seçilebilir aday olmasa da **iz içeren terminal-olmayan** rapor varsa açılır (`pickableReport`). Terminal (error/protected/429) raporlar seçime GİRMEZ (koruma korunur). Seçilen aday hesap fazında gerçek handshake ile doğrulanır (seçim ≠ doğrulama).
- **#2 Kullanıcı adı zenginleştirme (`stalker.ts stalkerProfile`):** profil kabul edilse bile GERÇEK login (login/username/user_name/user/account/subscriber; name/fname/sname DEĞİL) yoksa dolu-parametreli `get_profile` varyantları da denenir; login getiren tercih edilir. `hasRealLogin` + **login arama bütçesi 2** (login'siz hesapta sonsuz istek yok; ~3 istekle sınırlı). Login hiç gelmezse eski davranış (ilk dolu profil) korunur. Hedef: panel-a → `ab3C4dEf`.
- **#3 A01 base64 MAC (`stalker.ts accountMatchesMac`):** MAC alanı `decodeMacIfBase64` ile çözülüp karşılaştırılır. Base64-of-supplied-MAC artık eşleşir; gerçekten FARKLI MAC hâlâ reddedilir.
- **#4 "Yalnız girilen" (exact) KATİ kapsam (`magPortalDiscovery.ts`, `magBulkScan.ts`):** exact → yalnız girilen endpoint (`sweep([entered])`); family/version.js genişletme ve iki-aşamalı port keşfi YOK. Bulk handshake yedeği de exact'te yalnız girilen endpoint'i dener. UI "Yalnız girilen" bu kapsama bağlı.

## Doğrulama (PC)
- `yarn tsc --noEmit` temiz · `node tools/denetle.js` → **✅ TÜM DENETİMLER TEMİZ** (exit 0)
- `check-v18713-release.js` PASS · hesap testi **14 grup** (A01 base64 + kullanıcı adı zenginleştirme dahil) · keşif testi **18 grup** (exact-strict dahil).
- Enrichment istek artışı için düzeltilen fixture'lar (gerçekçi login eklendi, 1 istek): check-v15216 (session cache), check-v16121 (PCAP wire). Discovery testi: exact=strict olunca family bekleyen gruplar açıkça `fallback`'a alındı. Bulk-runtime: terminal rapor seçime girmiyor (korundu).

## Cihazda doğrulanacak (DEV 18.7.13)
1. **Çoklu MAC + "ben seçeyim":** bulunan portal/izler artık TIKLANIP seçilebiliyor mu; seçince handshake ile doğrulanıyor mu.
2. **panel-a kullanıcı adı:** yenile → kart `ab3C4dEf` gösteriyor mu (1787 değil). Log: `STALKER_PROFILE_VARIANT_OK hasRealLogin:true`, `usernameFieldKind=login`.
3. **panel-b:** A01 ile `profile-mac-mismatch` düzeldi mi (base64 MAC ise verified olur; MAC kayıtlı değilse hâlâ mismatch — doğru).
4. **"Yalnız girilen":** yalnız girilen port+yol deneniyor mu (log: tek endpoint, family yok).

## Sonraki
Player açılış ölçümü (TS ilk-kare), GPT backlog (M10/M11/A05–A08/C01–C04/D01/P01–P05/N01–N03). Devir: `GPT-OPUS-GUNCELLEME-DEVRI.md` güncel tutulmalı.
