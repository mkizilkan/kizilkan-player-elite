# KIZILKAN PLAYER v17.0.2 RC1

Release: **PIN/Input Safety + Account Header Profile + MAG Timezone Corrective**

Bu sürüm v17.0.1 üzerine kuruludur; v17 TV navigation/focus/player özellikleri korunur.

## Kritik P0
- Android native remote bridge 0-9 / numpad olaylarını JS numeric-zap için yaymaya devam eder.
- Rakam tuşları artık global `return true` ile tüketilmez; Android TextInput/IME zinciri `super.dispatchKeyEvent` üzerinden devam eder.
- Profil PIN ve diğer sayısal PIN TextInput sözleşmeleri hard-gate ile korunur.

## Yeni hesap/playlist oynatma başlıkları
- User-Agent
- Referer
- Origin
- Öncelik: item override > playlist/account default > provider/protocol > engine default.

## MAG/Stalker timezone
- Otomatik: kanıtlanmış mevcut profil varsayımlarını birebir korur.
- Portal: doğrulanmış get_profile timezone değeri varsa kullanır; ilk temas için cihaz timezone fallback.
- Cihaz: cihazın IANA timezone değerini kullanır.
- Manuel: IANA biçimi (örn. Europe/Istanbul) doğrulanır.

## Doğrulama dürüstlük notu
Kaynak hard-gate, JS syntax ve seçili TS/TSX transpile kontrolleri çalıştırıldı. Android APK/Gradle build bu ortamda çalıştırılmadı; gerçek PIN/TV numeric-zap davranışı cihaz APK testiyle doğrulanmalıdır.
