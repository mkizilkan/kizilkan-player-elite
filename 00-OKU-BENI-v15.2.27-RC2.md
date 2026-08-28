# KIZILKAN PLAYER ELITE v15.2.27-RC2 — CI TSC FIX

Bu paket v15.2.27-RC1 MAG P0 dört düzeltmesini aynen korur ve GitHub Actions'ta `denetle.js` içinde çalışan iki TypeScript HARD gate'in CI ortamında TypeScript CLI bulamaması/kurulum varyasyonu sorununu sağlamlaştırır.

## Düzeltme
- `yarn install` artık `--frozen-lockfile --production=false` ile çalışır; TypeScript devDependency'nin CI'da atlanmasına izin verilmez.
- CI, `denetle.js` öncesinde `require.resolve('typescript/bin/tsc')` ve `yarn exec tsc --version` ile TypeScript kurulumunu kanıtlar.
- RC2/RC3 TypeScript gate'leri sabit tek bir `frontend/node_modules/.../tsc` yoluna bağlı değildir; ortak `tools/_tsc.js` resolver kullanır.
- HARD gate kaldırılmadı/yumuşatılmadı: gerçek `--project frontend/tsconfig.json --noEmit` zorunlu kalır.
- `denetle.js`, child gate başarısız olduğunda gerçek stdout/stderr'i artık gizlemez.

## Korunan v15.2.27-RC1 P0 kapsamı
MAG playback context ve HTTP 456 fresh-session recovery, adaptif VOD/Series pagination, MAG ekleme progress UX ve buffering/error sırasında emergency player controls korunmuştur.
