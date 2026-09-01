# GPT KIZILKAN Player — GPT v10.6.5

## Referans
Bu paket GPT KIZILKAN Player v10.5.3 kaynak ZIP'ini temel alır.

## Kapsam
Uygulama/player/playlist/Firebase/yedekleme/focus kodları değiştirilmemiştir. Yalnız GitHub Actions APK doğrulama altyapısı sağlamlaştırılmıştır.

## Düzeltme
- `find ... | head -n 1` kaldırıldı.
- `aapt dump badging ... | head -n 1` kaldırıldı.
- Sertifika `grep | sed | tr` zinciri güvenli ayrıştırmaya çevrildi.
- Her doğrulama aşaması açık `✅` / `::error::` logu üretir.
- APK adlandırma adımındaki aynı `find|head` kırılganlığı kaldırıldı.

## Sürüm
- GPT v10.6.5
- Expo version: 10.6.5
- iOS buildNumber: 10.6.5
- Android versionCode: 100605
- package.json: 10.6.5
- package ID: com.kizilkan.player

## Doğrulamalar
- KIZILKAN denetleyici: 8/8 temiz.
- TypeScript 5.8.3: 89 TS/TSX parse/transpile hata 0.
- JSON/YAML parse temiz.
- APK doğrulama Bash bloğu `bash -n` temiz.
- v10.5.3 -> v10.6.5 silinen dosya: 0.
- Beklenmeyen uygulama kaynak değişikliği: 0.

## Dürüst sınır
Bu ortamda gerçek GitHub Actions Android runner/Gradle APK build'i çalıştırılmadı.
Yeni doğrulama kapısının gerçek APK üzerinde sonucu GitHub Actions run'ı ile nihai olarak doğrulanacaktır.
