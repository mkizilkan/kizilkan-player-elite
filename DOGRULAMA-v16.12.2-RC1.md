# KIZILKAN PLAYER v16.12.2 RC1 — DOĞRULAMA

## Gerçekten çalıştırılan kontroller

- `frontend/src/utils/stalker.ts` TypeScript `transpileModule`: PASS, 0 error.
- `frontend/src/player/PlayerHost.tsx` TypeScript `transpileModule`: PASS, 0 error.
- `tools/*.js` Node syntax kontrolü: 41/41 PASS.
- `tools/check-v16122-pcap-first-rate-limit-telemetry.js`: PASS.
- `tools/check-v16121-pcap-mag-player-controls.js`: PASS.
- `tools/check-v15225-mag-architecture.js`: PASS.
- v16.12.2 hard-gate fixture'ları:
  - Eski learned `golden` kaydı varken ilk handshake'in yine `pcap320-minimal/MAG320/wire-nojs` olması: PASS.
  - HTTP 200 + `Authorization failed.` sonrasında yeni manuel çağrının persistent cooldown tarafından engellenmemesi: PASS.
  - Gerçek HTTP 429 sonrasında 5 dakikalık persistent cooldown ve ikinci çağrının network'e çıkmaması: PASS.
  - Hassas değer yazmadan request fingerprint telemetrisi üretilmesi: PASS.
- v16.12.1 kaynak ZIP'i ile dosya koruma karşılaştırması: 479 eski dosyanın 479'u da mevcut; eksik dosya 0.

## Geliştirme sırasında gate'in yakaladığı gerçek hata

İlk v16.12.2 gate çalıştırmasında `Authorization failed.` sonrasında manuel retry hâlâ persistent cooldown'a takıldı. Kök neden, `MAG_AUTH_GOVERNOR` hata mesajındaki `ban/rate-limit` ifadesinin genel rate-limit regex'ine eşleşmesiydi. Kalıcı cooldown kararı yalnız `e.kind === "MAG_RATE_LIMIT"` olacak şekilde düzeltildi. Sonraki gate PASS verdi.

## Full-project TypeScript durumu

`tools/denetle.js` çalıştırıldı. Dependency-less kaynak ortamında 32 gate PASS verdi; 2 TypeScript project gate'i kaynak ZIP'te `node_modules`, `expo/tsconfig.base` ve React Native/Expo type bağımlılıkları bulunmadığı için çalıştırılamadı. Bu iki gate PASS olarak raporlanmamıştır.

Başarısız/çalıştırılamayan dependency-bound gate'ler:

1. `v15.2.25 RC2 full TypeScript --noEmit build gate`
2. `v15.2.25 RC3 tsconfig-bound TypeScript project gate`

Bu nedenle full dependency-installed TypeScript build doğrulaması GitHub Actions/bağımlılık kurulmuş build ortamında ayrıca yapılmalıdır. Telefon build çiftliği olarak kullanılmamalıdır; telefon son APK fiziksel kabul testi içindir.
