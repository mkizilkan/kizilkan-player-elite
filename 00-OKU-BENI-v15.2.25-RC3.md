# KIZILKAN PLAYER ELITE v15.2.25 RC3

RC3, RC2 MAG254-first / learned compatibility / storage düzeltmelerini aynen korur.

Bu sürüm TypeScript doğrulamasını proje `frontend/tsconfig.json` dosyasına açıkça bağlar. Tekil `.ts/.tsx` dosyasıyla `tsc` çağrısı yapılmaz; böylece tsconfig devre dışı kaldığında görülen sahte JSX, Promise, Set ve ES5 hata seli gerçek proje build sonucu sanılmaz.

Paketleme kuralı: gerçek proje bağımlılıkları kurulu ortamda `node tools/check-v15225-rc3-typescript-project.js` ve master `node tools/denetle.js` PASS olmadan release kabul edilmez.
