# SÜRÜM NOTU — KIZILKAN PLAYER ELITE v15.2.24 RC1

- MAG katalog indirmelerinde single-flight deduplication eklendi.
- Başarılı MAG katalogları için 3 dakikalık RAM cache eklendi; manuel refresh cache'i bilinçli atlar.
- MAG Live/VOD/Series aşama süreleri ve VOD/Series sayfa ilerlemesi Flight Recorder/UI'ye eklendi.
- Playlist aktivasyonu Room index doğrulamasından sonraya taşındı; doğrulanamayan playlist aktif listeyi artık ezmez.
- Media3 time-update interval normal izleme sırasında 5 saniye, kontrol/stats görünümünde 1 saniye olacak şekilde adaptif hale getirildi.
- `check-v15224-mag-room-stall.js` kaynak + davranışsal single-flight/cache regresyon kapısı eklendi.
- v15.2.23 RC2 ve önceki özellikler/gate'ler korunmuştur.
