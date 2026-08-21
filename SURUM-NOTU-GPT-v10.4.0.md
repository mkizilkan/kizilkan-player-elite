# GPT KIZILKAN Player — GPT v10.4.0

## Hedef
GPT v10.2.0 gerçek telefon/TV testinde belirlenen playback-session, TV kumanda,
zap audio-track ve VOD/Series -> Live geçiş problemlerini düzeltir.

## Kritik düzeltmeler

1. **Playback session tipi açık hale getirildi**
   `live / vod / series / catchup / external` ayrımı PlayerContext'te tutulur.
   Zap her zaman temiz `live` session oluşturur; eski `ext` bayrağı taşınmaz.

2. **VOD/Series/External -> Live stale source düzeltmesi**
   `externalStream` artık yalnız synthetic session'da kullanılabilir.
   Live source geldiği anda eski film/dizi payload'u temizlenir ve canlı kanalın
   üstünü kapatamaz. Async storage okuması race-safe hale getirildi.

3. **Synthetic çıkışta gerçek medya temizliği**
   VOD/Series/Catch-up/External kapanınca Exo `pause + replace(null)` yapar,
   VLC `stop()` yapar. Canlı yayında source detach YAPILMAZ; Claude v9.19 YOL-B
   kalıcı PlayerHost/surface davranışı korunur.

4. **TV OK/ENTER kumanda köprüsü**
   Native `KEYCODE_DPAD_CENTER`, `KEYCODE_ENTER`, `KEYCODE_NUMPAD_ENTER`
   JS'e `select` olayı olarak gönderilir. Tuş native focus davranışından
   çalınmaz. Kontroller gizliyken `select` paneli açar; panel açıkken normal
   FocusButton onPress çalışır.

5. **Gizli PlayerHost artık global D-pad dinlemez**
   `useRemoteKeys` yalnız `visible && sheet === null` iken aktiftir.
   Film/dizi grid ekranında gizli player aynı kumanda olayını ikinci kez
   işlemez.

6. **Zap transaction / track reset**
   VLC zap öncesi `stop()`.
   Audio/subtitle/video track ID'leri ve seçim state'leri sıfırlanır.
   Auto engine önceki kanalın VLC fallback state'ini yeni kanala taşımaz.

7. **Exo sessiz-track kurtarma**
   `sourceLoad` ve `readyToPlay` sırasında gerçek audio track listesi okunur.
   Track mevcut fakat seçili `audioTrack` null ise ilk track seçilir.
   Mevcut Exo hata -> VLC fallback ve `VLC ile Dene` yolu korunur.

8. **EPG synthetic playback param düzeltmesi**
   EPG timeshift player çağrısına `ext: "true"` eklendi.

9. **CI fail-fast**
   Expo prebuild sonrasında MainActivity içinde TV remote native bridge,
   CENTER key ve `select` event'i gerçekten var mı doğrulanır.

## Şerit/tint regresyon koruması
- `PlayerHost` kalıcı mount mimarisi değişmedi.
- `playerHidden`: `opacity: 0`, `zIndex: -1` korunur.
- translate/offscreen/display-none yapılmadı.
- fullscreen `tv-focus-catcher` üzerinde `hasTVPreferredFocus` geri getirilmedi.
- Canlı playback kapanışında Exo source detach edilmez.

## Sürüm
- Görünen sürüm: GPT v10.4.0
- Expo version: 10.4.0
- iOS buildNumber: 10.4.0
- Android versionCode: 100400
- package.json: 10.4.0

## Gerçek olarak çalıştırılan kontroller
- KIZILKAN statik denetleyicileri: 8/8 temiz.
- TypeScript 5.8.3: 89 TS/TSX parse/transpile hata: 0.
- `withTvRemoteKeys.js` Node syntax: temiz.
- JSON/YAML parse: temiz.
- Session/remote/zap/audio/surface kritik invariant kontrolleri: temiz.
- v10.2 -> v10.4 dosya kaybı: 0.
- ZIP CRC ve `kizilkan-player/` kök yapısı: temiz.

## Dürüst sınır
Bu çalışma klasöründe `frontend/node_modules` bulunmadığı için gerçek
`npx tsc --noEmit`, Expo prebuild ve Gradle APK derlemesi yerelde çalıştırılmadı.
GitHub Actions bunları gerçek bağımlılık/Android ortamında çalıştıracaktır.
Homatics gerçek cihaz testi şerit/tint, remote latency, zap audio ve session
geçişleri için nihai doğrulamadır.
