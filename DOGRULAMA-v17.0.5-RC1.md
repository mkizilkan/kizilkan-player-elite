# DOGRULAMA — KIZILKAN PLAYER ELITE v17.0.5 RC1

## Kök neden
CI çıktısındaki iki hata aynı kökten geliyordu: `tools/check-v15224-rc2-memory-native.js` eski `fun resolveWork(index: Int)` imzasını zorunlu tutuyordu. v17.0.4 ultra-scale tarama motoru ise 64-bit kapasite için doğru olarak `fun resolveWork(index: Long)` kullanıyor. Bu nedenle kaynak regresyonu değil, legacy hard-gate yanlış-negatif veriyordu. RC3 CWD self-test de aynı RC2 gate'i üç çalışma dizininde çağırdığı için ikinci hata olarak görünüyordu.

## Yapılan düzeltme
- `resolveWork(index: Long)` korunmuştur; 64-bit kapasite geri alınmamıştır.
- v15.2.24 RC2 gate'i hem legacy `Int` hem ultra-scale `Long` resolver'ı kabul edecek biçimde forward-compatible yapılmıştır.
- v17.0.4 preservation gate'i v17.0.4+ patch sürümlerini kabul edecek biçimde forward-compatible yapılmıştır.
- Yeni `check-v17005-build-gate-corrective.js` master `tools/denetle.js` zincirine eklenmiştir.
- Sürüm 17.0.5 / versionCode 170005 / release label v17.0.5 RC1 olarak yükseltilmiştir.

## Gerçek çalıştırılan kontroller
PASS — `node tools/check-v15224-rc2-memory-native.js`
PASS — `node tools/check-v15224-rc3-gate-cwd.js` (repo/frontend/tools CWD self-test)
PASS — `node tools/check-v17004-ultra-scale-account-archive.js`
PASS — `node tools/check-v17005-build-gate-corrective.js`
PASS — `node --check` değiştirilen dört JS denetim dosyası
PASS — `accountArchive.ts` TypeScript transpile/parse kontrolü
PASS — v17.0.4 baseline envanter karşılaştırması: eksik dosya 0
PASS — denetle zincirinde RC2 ve RC3 dahil, dependency-bound TypeScript gate'lerine kadar tüm kontroller
PASS — dependency-bound TypeScript gate'lerinden sonraki preservation kontrolleri ayrı ayrı

## Ortam sınırı
Bu çalışma ortamında `frontend/node_modules` bulunmadığı için tam `tsc --noEmit` proje kontrolü React/React Native/Expo tiplerini çözemedi. Bu, kaynakta yeni TypeScript hatası kanıtı değildir; bağımlılıkların kurulu olmadığı doğrulama ortamı sınırıdır. Android/Gradle APK build ve fiziksel cihaz runtime testi burada yapılmamıştır. Bunlar yapılmış gibi raporlanmamıştır.
