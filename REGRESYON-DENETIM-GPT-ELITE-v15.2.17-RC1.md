# REGRESYON DENETİMİ — v15.2.17-RC1

## HARD gates
- Büyük unified payload için `putExtra("jobsJson", jobsJson)` yasak.
- `candidateSets`/`candidateSet` dedupe sözleşmesi zorunlu.
- App-private panel scan staging zorunlu.
- `setProcessStateSummary` + chained default uncaught handler zorunlu.
- Worker failure recorder/propagation zorunlu.
- Native exit history `processStateSummary` bridge zorunlu.
- Stats ekranında son Java crash + ölüm öncesi durum görünürlüğü zorunlu.
- MAG endpoint diagnostics: attempt/error/contentType/redirect/non-JSON sınıflandırması zorunlu.

## Fonksiyonel fixture
`check-v15217-scan-transport.js` iki hesabın aynı candidate listesiyle tek `candidateSets[0]` üretildiğini ve job objelerinde duplicate `candidates` kalmadığını gerçek transpile edilmiş `panel-scan/index.ts` üzerinden doğrular.

## Korunan önceki gates
v15.2.14 Stalker/Backup fixture, v15.2.15 TypeScript control contract, v15.2.16 diagnostics/session-cache ve Player Core gate'leri yeniden çalıştırılır.

## Cihaz acceptance
- 2/3/5 hesap × geniş panel rehberi ile scan 5+ kez tekrarlanmalı; process CRASH olmamalı.
- Scan ekranında Durdur/Duraklat/Devam ve round-robin korunmalı.
- Crash olursa `Son Java crash`, `Ölüm öncesi durum` ve scan checkpoint zinciri dolu olmalı.
- MAG JSON olmayan response'da content-type/redirect sınıfı; network failure'da NETWORK/TIMEOUT sınıfı raporda görünmeli.
