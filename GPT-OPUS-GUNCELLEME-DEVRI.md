# GPT DEVİR — KIZILKAN PLAYER ELITE (güncel durum ve talimatlar)

**Son güncelleme:** 2026-10-04, Claude (Opus) oturumu. Bu dosya, token/bağlam azaldığında başka bir yapay zekânın
(GPT) işi kaldığı yerden sürdürmesi için yazıldı. Önce `CLAUDE.md`'yi (özellikle §2 çalışma sözleşmesi, §3 doğrulama,
§4 sürüm/dal, §5 mimari, §7 tuzaklar, §8 log analizi) oku; aşağıdakiler ona EKtir.

## 1. Çalışma kuralları (harfiyen)
- **Önce PLAN sun, kullanıcı onaylayınca kodla.** Kör düzeltme yok: her sorunu önce log + kod ile KANITLA.
- **Doğrulama (PC, her değişiklikten sonra):** `cd frontend && yarn tsc --noEmit` (çıktı yok) → `cd .. && node tools/denetle.js` (✅ TÜM DENETİMLER TEMİZ / exit 0). Geçmeden commit/push YOK.
- **Sürüm:** beş alan birlikte (`frontend/app.json`: version, ios.buildNumber, android.versionCode=major*10000+minor*100+patch, extra.kizilkanReleaseLabel="GPT ELITE v<sürüm> RC1"; `frontend/package.json`: version). Etiket soneki DAİMA **RC1**. Her sürüm yeni dal: `v<sürüm>-rc1-<konu>`.
- Her sürüme `tools/check-v<kod>-release.js` gate + `tools/denetle.js` kaydı + `AI-DEVIR-v<sürüm>.md` + `CLAUDE.md §9` güncellemesi.
- **CLAUDE §7 TUZAĞI (bu oturumda tekrar yaşandı):** `stalker.ts` ve `magPortalDiscovery.ts` sahte-`require` VM testleriyle koşuyor → bu dosyalara **üst düzey import EKLEME**. Yeni modülleri `await import` ile **tembel** yükle (örnek: v18.7.12 `loadHostFailover()`).
- **Native (Kotlin) değişmedi** (v18.7.9–v18.7.12 tümü TS). Native'e dokunursan `expo prebuild` + `gradlew assembleDebug` şart.
- Commit attribution satırı oturuma göre değişiyor; kullanıcının verdiği EN SON reminder'daki `Co-Authored-By` satırını kullan.

## 2. Mevcut durum
- **Dal:** `v18.7.12-rc1-mag-ip-failover`. **Son commit:** `5d9e3b2f` (v18.7.12). Taban zinciri: v18.7.10 `6910a934` → v18.7.11 `1efefcfc` → v18.7.12.
- **Cihaz:** OnePlus 7 Pro, `c3a4097e`. DEV paket `com.gpt.kizilkan.player.dev` ("KIZILKAN DEV"), debuggable. Release paket `com.gpt.kizilkan.player` (debuggable DEĞİL).
- Telefonda kurulu: **18.7.12-dev**. Cihazda Özel DNS `DNS.google` yapıldı (kullanıcı ayarladı).

## 3. Bu oturumda tamamlananlar (PC doğrulandı + kısmen cihaz)
- **v18.7.11 — MAG profil-uyumluluk:** MAG320 `get_profile` minimal BOŞ dönerse dolu-parametreli MAG254/MAG250 varyantlarına düşer; `stalkerVerifyAccount` kimlik yoksa canlı erişimle "verified" (boş profil ama 21266 kanal). Kullanıcı adı telemetrisi (`usernamePresent/usernameFieldKind`, redaksiyona takılmaz). Keşif duvar-saati bütçesi (19 dk → ≤4 dk, `DISCOVERY_BUDGET_STOP`). Ayrıntı `AI-DEVIR-v18.7.11.md`.
- **v18.7.12 — MAG çoklu-IP DNS failover (`frontend/src/utils/magHostFailover.ts`):** Cihaz kanıtı: goldensm32.xyz 5 A kaydı, yalnız `172.110.220.225` canlı; sistem DNS ölü IP veriyor → 6 sn timeout. DoH (dns.google→cloudflare) ile tüm A kayıtları → canlı IP yoklanıp **pin** → bağlantı IP'ye (Host=hostname), finalUrl `logicalUrl` ile hostname'e çevrilir. Yalnız http, yalnız RN ortamında aktif. `stalker.ts req()` (düz fetch + exactFetch) ve `magPortalDiscovery raw()` TEMBEL importla bağlı. **CİHAZDA KANITLANDI:** `MAG_HOST_IP_FAILOVER goldensm32 A=5` sonrası handshake'ler artık BAŞARILI (önce hepsi timeout). Ayrıntı `AI-DEVIR-v18.7.12.md`.

## 3b. v18.7.13'te YAPILANLAR (dal `v18.7.13-rc1-exact-scope-username-mac`, PC doğrulandı, cihaz bekliyor)
Aşağıdaki P1/P2'lerin KODU YAZILDI (ayrıntı `AI-DEVIR-v18.7.13.md`):
- **#1 Manuel portal seçimi:** "ben seçeyim"de iz adaylar seçilebilir; seçim fazı terminal-olmayan iz raporunda açılır; seçim handshake ile doğrulanır.
- **#2 Kullanıcı adı:** gerçek login yoksa dolu-parametre get_profile (bütçe 2), login tercih edilir. Hedef hkpremium `ud3B3yRH`.
- **#3 A01:** `accountMatchesMac` base64 MAC çözer.
- **#4 "Yalnız girilen" (exact) KATİ:** yalnız girilen port+yol; family/version.js/iki-aşama yok.
Cihazda doğrulanacak: hkpremium kullanıcı adı `ud3B3yRH` mı; "ben seçeyim" seçim çalışıyor mu; goldensm32 base64 mismatch düzeldi mi; exact tek endpoint mi deniyor.

## 3c. v18.7.14'te YAPILANLAR (dal `v18.7.14-rc1-verify-username-scope`, PC doğrulandı, cihaz bekliyor)
GPT v18.7.13 incelemesi (G01-G06) + back-trap kodlandı (ayrıntı `AI-DEVIR-v18.7.14.md`):
- **A** MAG ekleme modalı iptal edilebilir (abort + İptal butonu). **G01** çoklu doğrulama get_all_channels yedeği.
- **G02** gerçek login main-info görünen-adıyla ezilmez. **G03** base64-MAC decode'dan önce elenir.
- **G04** enrichment gerçek bütçe (her deneme + deadline). **G05** exact portsuz da kati + HTML-link/soft-404 kapalı. **G06** snapshot main-info MAC/boş otorite.
Kalan GPT maddeleri: **G07** (keşif handshake yalnız ilk profil), **G08** (fazlar arası ortak deadline/sayaç; M09 kısmi), **G09** (oynatma gecikmesi ölçümü), **G10** ("katalog erişimi ≠ ilk kare" etiket ayrımı). GPT K07-K10 fixture'ları eklenecek.

## 4. BEKLEYEN İŞLER (öncelik sırası — hiçbiri onaysız kodlanmaz)

### P1 — "Ben seçeyim" (manuel portal) seçimi çalışmıyor  [cihaz kanıtı: kullanıcı ekran görüntüsü 2026-10-04]
Kullanıcı "ben seçeyim" seçse de bulunan portal/API yolları **tıklanınca seçilmiyor**.
- **Kök:** `frontend/app/mag-bulk.tsx:589` aday butonu `disabled = report.state !== "ready" || !candidate.selectable || scanPhase !== "selection" ...`. goldensm32'de bulunan adaylar "portal izi" = **`selectable:false`** (v18.7.10 M05: marka-izi/version.js non-selectable yapıldı) → hepsi devre dışı.
- **Ayrıca** `runMagBulkScan` (`frontend/src/utils/magBulkScan.ts`) seçim fazına yalnız `reports.some(selectablePortalCandidates>0)` ise giriyor; yalnız non-selectable iz varsa `selectPortals` HİÇ çağrılmıyor → picker açılmaz.
- **Çözüm önerisi:** Manuel modda kullanıcı NON-selectable izleri de seçebilsin; seçtiği endpoint'te handshake doğrulaması yapılsın (seçim = aday, doğrulama handshake'le). UI disabled koşulundan `!candidate.selectable`'ı manuel modda kaldır; selection fazını manuel modda her zaman tetikle. GPT A02/M05 güvenliğini koru: seçim ≠ doğrulama; gerçek handshake/hesap kanıtı şart.

### P1 — hkpremium kullanıcı adı yanlış (gerçek login gelmiyor)  [cihaz kanıtı: IPTV Extreme Pro ekran görüntüsü]
Kart "1787" gösteriyor; **gerçek kullanıcı adı `ud3B3yRH`** (şifre `fcTwy5ykkP` — IPTV Extreme Pro Xtream kartı; aynı abonelik).
- **Kök:** hkpremium `get_profile` MINIMAL yanıtında `login` BOŞ, yalnız `name=1787`. Telemetri: `usernameFieldKind=name, loginValuePresent=false`. v18.7.11 dolu-parametre varyantı yalnız profil TAMAMEN boşsa deneniyor; hkpremium'da profil boş değil (name var) → gerçek login hiç istenmiyor.
- **Çözüm önerisi (`frontend/src/utils/stalker.ts` `stalkerProfile`/`initialProfileVariants`):** Profil kabul edilse bile `login`/kullanıcı adı eksikse dolu-parametreli (`sn/stb_type/image_version/ver`) `get_profile`'ı DA dene ve `login` dolu gelirse onu kullan. Hedef: `ud3B3yRH` gelmeli. Normalizer `login`'i zaten önceliyor (`pickUsernameField`), sorun login'in minimal yanıtta boş gelmesi.

### P2 — goldensm32 "profile-mac-mismatch" (A01)  [cihaz: handshake OK ama tüm MAC'ler unverified]
Failover sonrası handshake başarılı ama doğrulama `profile-mac-mismatch` → unverified.
- **Kök adayı (A01):** `frontend/src/utils/stalker.ts:2054` `accountMatchesMac` base64 MAC'i ÇÖZMÜYOR (normalizer `decodeMacIfBase64` kullanıyor, eşleştirici kullanmıyor → tutarsızlık). Portal MAC'i base64 döndürüyorsa geçerli hesap yanlışlıkla reddedilir.
- **Alternatif:** Girilen MAC'ler goldensm32'de kayıtlı abone değilse mismatch DOĞRU olabilir. Log MAC değerini (gizlilik) yazmıyor; ayrım için ya değeri güvenli sınıflandır ya kullanıcıya sor (goldensm32 kendi aboneliği mi).
- **Çözüm:** `accountMatchesMac`'e `decodeMacIfBase64` ekle (düşük risk, normalizer ile tutarlı). Gerçekten farklı MAC ise mismatch korunur.

### P3 — Player ilk-kare ~2 sn (Xtream TS açılışı)
Kanıt: `FIRST_FRAME srcSet ~1.5–2.7 sn` = Media3'ün canlı MPEG-TS ilk keyframe'ini açması (buffer başlatma zaten ~200 ms). Kör buffer dokunuşu YAPILMADI (stutter riski). Önce connect/TTFB/keyframe aşama ölçümü gerekir. Uzun (28–132 sn) gecikmeler Stalker kanalında HTTP 444 + boş oturumdandı → v18.7.11 M08 ile düzelmesi beklenir.

### Diğer (GPT backlog, daha önce iletildi): M09-tam, M10 (tekli ekran gelip gidiyor), M11 (:80/:443 portsuz sayılıyor), A02/A05/A06/A07/A08, C01–C04, D01, P01–P05, N01–N03, T02. Özellik eksikleri: EPG zamanlı kayıt, "devam et" şeridi, hız testi, yazı boyutu, yedek şifreleme.

## 5. Cihaz / DEV iş akışı (bu oturumda kullanıldı)
- **ADB:** `C:\Android\Sdk\platform-tools\adb.exe`. Ortam: `$env:ANDROID_HOME="C:\Android\Sdk"`, `$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"`. Gradle PowerShell'de çalıştır (Git Bash'te loopback hatası).
- **DEV derleme:** `cd frontend; npx expo prebuild --platform android --clean --no-install; cd android; .\gradlew.bat assembleDebug` (~15–18 dk). APK: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Kur: `adb install -r <apk>`. **Tuzak:** önceki Gradle daemon dosya kilitlerse `.\gradlew.bat --stop` sonra tekrar.
- **Tanı DB çekme (DEV debuggable):** `adb exec-out "run-as com.gpt.kizilkan.player.dev cat databases/kizilkan-native-core.db" > k.db` (+ `-wal`). `run-as ... cp /data/local/tmp/` ÇALIŞMAZ (izin). Node `node:sqlite DatabaseSync` ile oku; tablo `diagnostic_events`, kolonlar `atEpochMs,event,payloadJson,...`. Olaylar en-yeniden-eskiye değil `atEpochMs ASC` ile sırala. MAC/şifre/token değerleri `payloadJson`'da REDAKTE (yalnız `*Present/*Kind/*Fields` metadata açık).
- **Cihazda ağ teşhisi:** `adb shell "nc -w 6 host port < /dev/null; echo EXIT=$?"` ("nc: Timeout" = ölü). `ping -c N host`. DNS çözümleme round-robin ölü IP verebilir (goldensm32 kanıtı). **Sistem ayarını (DNS vb.) sen DEĞİŞTİRME** — kullanıcıya söyle.

## 6. Güvenlik / kapsam sınırları (DEĞİŞMEZ)
Bu, kullanıcının KENDİ aboneliği/MAC cihazları için standart bir Stalker/Ministra IPTV istemcisidir (TiviMate/IPTV Smarters gibi). TLS doğrulamasını KAPATMA. Düz kimlik bilgisi (şifre/kullanıcı adı/MAC/token) loglama — yalnız var/yok + biçim. Kullanıcı verisini/listesini silme; DEV verisini koru. HTTP 200/token tek başına geçerli hesap DEĞİL; gerçek profil/katalog erişimi kanıtı şart.

## 7. Son cihaz kanıtı özeti (18.7.12-dev, 2026-10-04 akşam)
- `MAG_HOST_IP_FAILOVER goldensm32 A=5` → handshake'ler başarılı (failover çalışıyor). ✅
- goldensm32 tüm MAC'ler `STALKER_ACCOUNT_VERIFIED state=unverified ev=["profile-mac-mismatch"]` (P2/A01).
- hkpremium `STALKER_ACCOUNT_SNAPSHOT uField=name uPres=true login=false name=true` → 1787 (P1 username).
- weko-azure.xyz host aralıklı/ulaşılamaz olabiliyor (ISP/round-robin); PC'den erişilebilir.
