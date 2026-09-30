# AI DEVİR — v18.7.1 RC1 (açılış çöküşü düzeltmesi)

**Taban:** `v18.7.0-rc1-repeat-shortcut-multimac` (c1686ec9). **Dal:** `v18.7.1-rc1-startup-crash`.
Cihaz bildirimi (30.09): v18.7.0 release (asıl uygulama) ve DEV, açılırken bir pencere görünüp kapanıyor; uygulama açılmıyor.
Tanı raporu alınamadı (uygulama açılmıyor), telefon PC'ye bağlı değildi → kök neden koddan kanıtlandı.

## Kök neden
| Adım | Kanıt |
|---|---|
| React Native, Activity'nin YAPICISINDA delegeyi kurar | `node_modules/react-native/.../ReactActivity.java:41-42` (`mDelegate = createReactActivityDelegate()`) |
| Expo sarmalayıcısı dinleyicileri alan başlatıcısında oluşturur | `node_modules/expo/.../ReactActivityDelegateWrapper.kt:53-54` |
| v18.7.0 `KizilkanShortcutPackage` burada `activityContext.applicationContext` çağırıyordu | Activity henüz sisteme bağlı değil (attachBaseContext yok) → `ContextWrapper` temel bağlam boş → NullPointerException → Activity oluşturulamıyor → her açılışta kapanma (normal açılış dahil) |

Neden yakalanmadı: `tsc`, denetimler ve `assembleDebug` derleme düzeyinde; bu hata yalnız ÇALIŞMA ANINDA oluşur. APK cihazda açılmadan "doğrulandı" denmişti.

## Düzeltme
1. `KizilkanShortcutPackage.kt`: oluşturulurken bağlama dokunulmaz; bağlam yalnız `onCreate`/`onNewIntent` içinde alınır, yakalama try/catch içinde (kısayol özelliği uygulamayı çökertemez).
2. `magBulkScan.ts`: `stalker.ts` artık tembel yüklenir (projenin geri kalanıyla aynı; `mag-bulk` rotası açılışta yüklenir).
3. Kapı `check-v18700-release.js`: `createReactActivityLifecycleListeners`/dinleyici yapıcısında bağlam kullanımı YASAK; yakalama try/catch zorunlu; magBulkScan'de statik stalker içe aktarımı yasak. Eski (v18.7.0) dosyayla kapı BAŞARISIZ, düzeltmeyle GEÇER (kanıtlandı).
4. Kapının sabit sürüm kontrolleri (`=== '18.7.0'`) ileri uyumlu yapıldı (§4): beş alanın tutarlılığı + ≥ 18.7.0.
5. Sürüm 18.7.1 (versionCode 180701).

## Doğrulama (30.09, OnePlus 7 Pro GM1910, Android 12, USB/adb)
- `tsc` temiz · `denetle.js` TÜM DENETİMLER TEMİZ · `assembleDebug` BUILD SUCCESSFUL (DEV 18.7.1, versionCode 180701).
- Cihaz çöküş kaydı (v18.7.0 asıl uygulama): `NullPointerException … getApplicationContext() at KizilkanShortcutPackage.createReactActivityLifecycleListeners(KizilkanShortcutPackage.kt:18) ← ReactActivityDelegateWrapper.<init>:54 ← MainActivity.<init>` — kök neden birebir.
- v18.7.1 DEV normal açılış: ana ekran (172 kanal), çöküş kaydı BOŞ. Kısayol isteğiyle (`<paket>.SHORTCUT_SEARCH`) soğuk açılış: doğrudan Ara ekranı, çöküş yok.

## AÇIK — v18.7.2: kısayolların ASIL sorunu (cihazda kanıtlandı, KODLANMADI)
`adb shell dumpsys shortcut`: iki uygulamada da kayıtlı 4 kısayol (`search`, `favorites`, `epg`, `multi-view`) **eski sistemin**:
`act=expo.modules.quickactions.SHORTCUT`, `icon=null`. Kodda İKİ kısayol sistemi var ve her açılışta ikisi de
`setDynamicShortcuts` ile listeyi baştan yazıyor; eski olan (`src/utils/quickActions.ts` → `expo-quick-actions`,
`app/_layout.tsx` `registerQuickActions()`) kazanıyor:
- Simge `icon=null` → boş kutular (aradığı `search/heart/calendar/grid` kaynakları uygulamada yok).
- Yönlendirme doğrudan `router.push` → profil/PIN açılış akışında kayboluyor.
- v18.4–v18.7 kısayol düzeltmeleri doğru çalışıyordu (cihazda kanıtlandı) ama eski sistem her açılışta siliyordu → logda `APP_SHORTCUT_*` = 0.
v18.4.0'da "kısayollar hiç kurulmamıştı" denmesi YANLIŞTI (`quickActions.ts` vardı).

**Onaylı plan (kullanıcı 30.09 onayladı, v18.7.2):**
1. Android'de `registerQuickActions` kısayol kurmasın (yalnız iOS'ta çalışsın — özellik korunur); paket ve `package.json` değişmez.
2. `ShortcutInbox.idFrom` eski isteği de tanısın: `expo.modules.quickactions.SHORTCUT` + `shortcut_data` (PersistableBundle) `id`:
   `search`→search, `favorites`→favorites, `epg`→guide, `multi-view`→multiview (ana ekrana sabitlenmiş eski kısayollar çalışsın).
3. Kapı: Android'de `QuickActions.setItems` yasak; eski istek eşlemesi zorunlu.
4. Cihazda doğrula: `dumpsys shortcut` → 4 kısayol `act=<paket>.SHORTCUT_*` ve simgeli; eski+yeni istekle açılış.

## Cihaz testi
1. DEV ve asıl uygulama açılıyor mu (normal açılış).
2. Kısayoldan açılış (kapalıyken/açıkken) — v18.7.0 test listesi (`AI-DEVIR-v18.7.0.md` §4) geçerli.
3. Uygulamayı KALDIRMA; v18.7.1'i mevcut uygulamanın üstüne kur.
