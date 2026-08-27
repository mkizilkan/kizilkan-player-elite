# KIZILKAN PLAYER ELITE v15.2.25 RC1

MAG Portal mimari düzeltmesi. v15.2.24 RC3 üzerine geliştirilmiştir; önceki bellek, Room, Flight Recorder, Media3 ve PanelScan düzeltmeleri korunmuştur.

Ana değişiklikler:
- Varsayılan MAG cihaz profili MAG254; MAG250 kontrollü fallback.
- Öğrenilmiş endpoint/profile + bounded handshake + 401/403/429/512 governor.
- Non-2xx gövde sınıflandırma/redaksiyon; hata JSON'u otomatik başarı sayılmaz.
- Live-first durable commit: Canlı katalog -> addPlaylist -> Room verify -> enrichment.
- VOD/Series enrichment LIVE'ı yeniden indirmez.
- Native Room kind-replace ile VOD/Series eklenirken 20k+ LIVE JS'e geri hydrate edilmez.
- Adaptive pagination governor: duplicate, boş sayfa, no-new-ID, total ve hard-cap.
- Harici AbortSignal desteği.
- Yeni MAG commit/enrichment telemetry ve v15.2.25 hard-gate fixture'ları.
