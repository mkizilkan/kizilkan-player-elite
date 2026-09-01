# DÜZELTME YORUMU — v15.2.24 RC1

Gerçek cihaz Flight Recorder verisi, MAG tarafında tek bir `get_all_channels` yanıtının yaklaşık 29 MB'a ulaşabildiğini ve aynı oturumda tekrar indirilmesinin toplam yenileme süresini katladığını gösterdi. Bu sürüm timeout yükseltmek yerine tekrar istek üretimini kaynakta keser.

1. `stalkerCatalogInFlight`: aynı MAG katalog işi eşzamanlı ikinci kez başlatılmaz; ikinci çağrı mevcut Promise'e bağlanır. `STALKER_CATALOG_SINGLEFLIGHT_JOIN` olayı bunu görünür yapar.
2. `stalkerCatalogCache`: başarılı katalog 3 dakika tutulur. Ekleme/düzenleme gibi art arda gelen tüketiciler aynı 29 MB live payload'ı tekrar indirmez. Manuel refresh `forceFresh:true` ile güncel veri ister.
3. `STALKER_CATALOG_STAGE_DONE`: live/vod/series süreleri ve sonuç sayıları ayrı ayrı yazılır. VOD/Series sayfalarında kullanıcı gerçek ilerleme mesajını görür.
4. Playlist switching: v15.2.23 RC2'de `setActiveId` doğrulama öncesinde çalışıyordu. v15.2.24'te Room summary/recovery önce tamamlanır; ancak `roomIndexed=true` sonrası active playlist publish/persist edilir.
5. Media3: Flight Recorder stack'lerinde `expo.modules.video.player.VideoPlayer.emitTimeUpdate` ve `IntervalUpdateClock` görüldüğü için UI kapalı TV izleme modunda `timeUpdateEventInterval` 1s -> 5s yapılmıştır; detay paneli/kontroller açılınca 1s hassasiyet geri gelir.

Mevcut codec fallback, gesture crash hardening, Flight Recorder V5, Panel Scan tam temizleme, Xtream atomic commit, MAG legacy compatibility ve önceki hard-gate zinciri korunmuştur.
