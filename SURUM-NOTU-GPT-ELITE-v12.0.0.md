# KIZILKAN PLAYER ELITE v12.0.0

## Kimlik
- Android package: `com.gpt.kizilkan.player`
- iOS bundle: `com.gpt.kizilkan.player`
- Cihaz adı: `KIZILKAN PLAYER ELITE`
- version/buildNumber: `12.0.0`
- versionCode: `120000`

Claude sürümü `com.kizilkan.player` ile yan yana kurulabilir.

## Giriş / siyah ekran düzeltmesi
- ProfileSelect Android'de çift keyboard resize kaldırıldı.
- Profil yönlendirmesi activeProfile + o profile ait PlaylistContext yüklemesi tamamlanmadan çalışmaz.
- Yanlış PIN pending navigation state'ini kesin temizler.
- PlaylistContext async profil yüklemeleri generation token ile korunur; eski profil yüklemesi yeni state'i ezemez.
- Favori/recent async yüklemeleri de aynı stale-load korumasına sahiptir.
- PlaylistSelect otomatik route yalnız doğru profil verisi hazırken ve tek kez çalışır.

## Splash
Ambient daire ve KIZILKAN PLAYER ELITE logo aynı mutlak ekran merkezine bağlandı. Loading bar layout grubundan çıkarıldı.
