# DÜZELTME YORUMU — v17.0.0 RC1

## Kök neden
v16.14.8 player performans düzeltmesi Android Native Core hot-path'te tüm katalogun `activePlaylist.channels[]` olarak JS'e hydrate edilmesini kaldırdı. Eski Previous/Next/zap yolu ise hâlâ tam JS kanal dizisine bağımlıydı. Sonuç: Live Prev/Next ve TV CH+/- davranışı devre dışı kalabiliyordu; VOD/Series ise `!isSynthetic` koşulu nedeniyle Prev/Next'i zaten kapatıyordu.

## Düzeltme
Native Room DAO'ya `getSortOrder`, `previousRaw`, `nextRaw`, `firstRaw`, `lastRaw`, scoped count/position sorguları ve Native Core'a `getPlaybackNeighbors` eklendi. PlayerHost artık Live/VOD için Room komşularını kullanıyor. Favori/özel grup gibi provider groupName ile ifade edilemeyen listelerde yalnız ID dizisi saklanan bounded navigation scope kullanılıyor. Series için yalnız ilgili dizinin episode navigation bundle'ı taşınıyor; bütün Series/VOD kataloğu Player'a yüklenmiyor.

TV remote semantic katmanında CH+/- yalnız Live kanal gezinmesi; MEDIA_NEXT/PREVIOUS ise content-aware next/previous olarak ayrıldı. Numeric live zap, merkezi TV focus memory/restore ve player sheet focus trap eklendi. Media3 timeUpdate interval tekrar yazımları deduplicate edildi; PlayerHost kapanışında Media3 source detach ve resource-release telemetry eklendi. Rebuffer START/END süre telemetrisi eklendi.

## Regresyon koruması
v16.14.8 one-row Room hot-path ve yalnız fail-safe durumunda legacy heavy hydrate korunmuştur. MAG persistence/catalog/gzip, Room Incremental Sync V2, source recovery, owner-token stale-frame protection, Flight Recorder V7 ve MPV release-chain gate'leri korunmuştur.
