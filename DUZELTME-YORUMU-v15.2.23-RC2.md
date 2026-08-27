# DÜZELTME YORUMU — v15.2.23 RC2

RC1 yalnız Flight Recorder V5 + MAG telemetrisi + kısmi scan temizleme ile kalmıştı. Kullanıcının onayıyla aynı v15.2.23 içinde kalan dört P0 alanı tamamlandı.

1. **Gesture crash:** React Native Gesture Handler belgelerinde Reanimated kuruluysa gesture callback'lerinin varsayılan olarak UI worklet runtime'ında çalıştığı doğrulanmıştır. PlayerHost callback'leri React state/ref, haptic, player session ve Dimensions gibi JS-side değerler kullandığı için gesture'lar `.runOnJS(true)` ile JS thread'e alınmıştır. Bu, crash journal'da görülen `CppException: TypeError: undefined is not a function` worklet yolunu doğrudan kaldırır.
2. **Codec/siyah ekran:** Media3 fatal codec/decoder hatası ayrı `MEDIA3_FATAL_FALLBACK` olayıyla işaretlenir. VLC fallback'te video beklenirken yalnız ses/clock üretimi olursa `VLC_VIDEO_OUTPUT_TIMEOUT` watchdog HW -> SW decoder'a geçer; SW de video üretmezse `final_error` ile spinner kapanır.
3. **Xtream/Room:** `updatePlaylist` artık önce React state, sonra disk yazmaz. bigStore/Room commit -> `getPlaylistSummary(roomIndexed)` doğrulaması -> metadata/state publish sırası uygulanır. Liste seçimi summary hatasında bir kez `warmPlaylist` index recovery dener.
4. **Main-thread stall:** Flight Recorder'ın 50K diziyi her olayda AsyncStorage'dan okuyup JSON.stringify etmesi kaldırıldı. Tam geçmiş native Room'da tutulur, JS yalnız bounded fallback cache ve batched flush kullanır.
5. **Tam temizleme:** PanelScan snapshot da aktif scan yokken temizlenir; iki farklı “temizle” UI yolu aynı kapsamlı temizliği uygular.

Hiçbir player motoru, MAG özelliği, backup/scan davranışı veya önceki hard-gate kaldırılmamıştır.

## RC2 tamamlayıcı stall düzeltmesi
- Xtream Live/VOD/Series büyük katalog normalizasyonu artık yaklaşık her 400 kayıtta JS event-loop'a cooperative yield verir; 8K/35K/10K sınıfı katalogların tek uzun senkron map ile JS thread'i kilitlemesi azaltıldı.
- MAG/Stalker ordered-list sayfalama, satır işleme, VOD partition ve Series normalizasyonu yaklaşık her 300 kayıtta cooperative yield verir.
- Bu düzeltme Flight Recorder V5'in batched AsyncStorage/native Room öncelikli persistence değişikliğiyle birlikte çalışır; amaç yalnız stall kaydetmek değil, uygulamanın kendi tanılama/katalog işlerinden kaynaklanan uzun JS bloklarını da azaltmaktır.
