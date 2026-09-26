# AI DEVİR — v18.1.0 RC1

**Taban:** `v18.0.0-rc1-focus-restore-center` (fd6ca2d1). **Dal:** `v18.1.0-rc1-local-media`.
Kullanıcı onayı: yerel medya geliştirme + ses dosyası çalma + arka planda müzik (bildirimli).

## Yapılanlar
| Alan | Önce | Şimdi |
|---|---|---|
| Klasör listeleme | Her alt öğe için ayrı `SAF.readDirectoryAsync` (N IPC) | Native `LocalMediaLibrary.listChildrenJson`: tek `DocumentsContract` sorgusu (ad, MIME, boyut, tarih). Native yoksa eski SAF yolu; yalnız uzantısız öğeler klasör diye yoklanır |
| Dosya türleri | Yalnız video | Video + ses (mp3, flac, aac, m4a, ogg, oga, opus, wav, wma, amr, mka, alac, aiff) |
| Liste | ScrollView (sanal değil), düz düğmeler | FlatList (sanal), FocusButton (TV odak çerçevesi) |
| Görsel | Yalnız ikon | Kapak (ses: gömülü kapak, video: %10'daki kare), süre, çözünürlük, sanatçı/albüm, boyut, tarih, ilerleme çubuğu. Bilgi görünen satırlar için 2 eşzamanlı alınır, önbelleğe yazılır (`kizilkan-local-art/`, en fazla 1500 kayıt) |
| Düzen | Yok | Tümü/Video/Müzik filtresi, Ad/Tarih/Boyut sıralama (artan/azalan), klasörde arama; tercihler hatırlanır |
| Oynatma | Tek dosya | Klasör sırası kuyruk olarak gider: oynatıcıda önceki/sonraki, otomatik geçiş (müzik her zaman, video "Sonrakini otomatik" ayarıyla), "Tümünü çal", "Karışık çal", çoklu dosya seçimi |
| Kaldığın yer | Kütüphanenin "Devam Et" listesine film gibi yazılıyordu. Oradan açılınca detay ekranı dosyayı bulamıyordu | Ayrı depo `kizilkan.localmedia.progress.v1`: otomatik devam, uzun basışla "Baştan oynat" ve "Kaldığın yeri sil" |
| Son açılanlar | Yok | 30 dosya, ilerleme çubuklu; listeyi temizle |
| Ses ekranı | Siyah ekran | Ses modu: kapak / ikon, ad, sıra (3/12), çalıyor/duraklatıldı, sıradaki |
| Arka planda | Uygulama arka plana geçince durur | Yalnız YEREL SES oturumunda (Media3 motoru): `staysActiveInBackground` + `showNowPlayingNotification` (başlık + kapak). `app.json`: `expo-video` → `supportsBackgroundPlayback: true` (manifest'e `ExpoVideoPlaybackService` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` eklendiği prebuild ile doğrulandı). Canlı TV, film ve dizi eski davranışta |
| Geri tuşu | — | Önce arama, sonra üst klasör, sonra çıkış |
| Dönüş | — | Oynatıcıdan dönüşte son dosya ortada ve (TV) odaklı (v18.0.0 altyapısı; `local-media` kapsamı) |
| Önbellek | — | Başlıktaki çöp kutusu: kapak/süre önbelleğini temizler (dosyalara dokunmaz) |

## Dosyalar
- `modules/kizilkan-native-core/.../LocalMediaLibrary.kt` (yeni), `KizilkanNativeCoreModule.kt` (3 AsyncFunction), `index.ts` (sarmalayıcı + tipler)
- `src/utils/localMedia.ts` (yeni: kuyruk, son açılanlar, ilerleme, bilgi önbelleği, biçimleyiciler)
- `app/local-media.tsx` (yeniden yazıldı; eski özellikler korundu)
- `src/player/PlayerHost.tsx`: yerel ilerleme, kuyruk komşuları, önceki/sonraki, otomatik geçiş, ses modu, arka plan, `local-media` dönüş kapsamı, bildirim metadatası
- `src/player/PlayerContext.tsx`: `local-media` kökeni, zap sonrası odak anahtarı
- `src/player/v2/request.ts`: ses uzantıları genişletildi
- `app.json`: sürüm + `expo-video` arka plan seçeneği · `app/(tabs)/settings.tsx`: giriş metni

## Telemetri
`LOCAL_MEDIA_LIST` (source native/saf, sayılar, elapsedMs), `LOCAL_MEDIA_LIST_FAILED`, `LOCAL_MEDIA_OPEN`,
`LOCAL_MEDIA_QUEUE_MISS`, `LOCAL_AUDIO_BACKGROUND` (enabled / engine-unsupported),
`LOCAL_MEDIA_CACHE_CLEARED`, `FOCUS_RESTORE_*` (surface: local-media).

## Bilinen sınırlar
- Arka planda çalma yalnız Media3 motorunda; VLC/MPV seçiliyse `LOCAL_AUDIO_BACKGROUND outcome: engine-unsupported` yazılır.
- Kapak/süre çıkarımı büyük MKV'lerde USB üzerinden yavaş olabilir (satır başına 0,1–0,5 sn, arka planda).
- Eski sürümün "Devam Et" listesine yazılmış yerel kayıtlar orada kalır (silinmedi; kullanıcı kaldırabilir).

## Cihaz testi
1. Ayarlar → Yerel Medya → Klasör / USB / SD: büyük bir klasör (500+ dosya) hızlı açılmalı; kapaklar kaydırdıkça gelmeli.
2. Müzik klasörü: "Tümünü çal" → ses modu ekranı, sıradaki; şarkı bitince sıradakine geçmeli.
3. Telefonda müzik çalarken ana ekrana dön / ekranı kilitle → çalmaya devam etmeli, bildirimde ad + kapak görünmeli.
4. Video: yarısında çık → listede ilerleme çubuğu; tekrar aç → kaldığı yerden. Uzun bas → "Baştan oynat".
5. TV box: kumandayla tüm düğmeler odaklanıyor mu; oynatıcıdan dönüşte son dosya ortada mı.
6. Canlı TV / film arka plana alınınca eskisi gibi durmalı (değişmemeli).

## Doğrulama (PC)
`yarn tsc --noEmit` temiz · `node tools/denetle.js` "TÜM DENETİMLER TEMİZ" ·
`:kizilkan-native-core:compileDebugKotlin` BUILD SUCCESSFUL · `expo prebuild` manifest'te
`ExpoVideoPlaybackService` doğrulandı. Tam `assembleDebug` PC'de NDK/libc++ bağlama sorunu
nedeniyle çalıştırılamıyor (bkz. AI-DEVIR-v18.0.0.md); APK GitHub Actions'ta derlenir.
