# KIZILKAN PLAYER v16.14.4 RC1 — Düzeltme Yorumu

Bu sürüm v16.14.3 RC1 üzerinde CI/HARD-gate corrective sürümüdür. Uygulama özellikleri kaldırılmamış veya azaltılmamıştır.

## Düzeltilen gerçek CI sorunları
- `.github/workflows/build-apk.yml` kaynak paketine geri alındı ve workflow_dispatch korunarak paketleme sözleşmesine dahil edildi.
- CI bağımlılık kurulumu `yarn install --frozen-lockfile --production=false` ile fail-closed hale getirildi.
- TypeScript CLI preflight: `require.resolve('typescript/bin/tsc')` ve `yarn exec tsc --version` zorunlu.
- Master `tools/denetle.js`, v16.14.3 regression/corrective gate'leri ve v16.14.4 CI gate'ini de çalıştırıyor.
- Gradle APK build sonrasında `check-mpv-packaging-v16143.js --apk` zorunlu. MPV native paketleme doğrulanmadan artifact/release adımına geçilemez.

## Legacy gate forward-compat düzeltmeleri
- v16.14.2 integrated gate exact 16.14.2 yerine >=16.14.2 + senkron metadata kontrolü yapar.
- Flight Recorder V3/V4/V5/V6 legacy gate'leri V7 ve daha yeni sürümlerde önceki özellikleri koruyarak geçebilir.
- v16.13.0/1/7/9/10 gate'leri yalnız 16.13.x regex'ine kilitli değildir; minimum semver + feature preservation doğrular.
- v15.2.27 MAG playback gate'i eski `STALKER_PLAYBACK_HTTP_REFRESH` string'ini aramaz; yeni sourceRecovery davranışını fixture ile doğrular: 401/403/444/456/520 renew, 404 not_found, direct URL için Stalker renew yok.

## Sürüm
- package/app: 16.14.4
- Android versionCode: 161404
- iOS buildNumber: 16.14.4
- Release label: GPT ELITE v16.14.4 RC1
