# MAG / STALKER UYUMLULUK ARAŞTIRMASI — v15.2.22

Karşılaştırılan davranışlar:
- StalkerTalker: handshake -> Bearer token -> get_profile; MAG250 profil alanları.
- Kodi plugin.video.stalker: MAG254 profil varyantı ve get_ordered_list sayfalaması.
- OpenDreambox stalker client: get_all_channels, get_ordered_list, create_link ve get_genres aksiyonları.
- Eski Stalker portal server kaynakları: ITV getOrderedList/getGenres davranışı.

Uygulanan sonuçlar:
1. Mevcut MAG250 davranışı korunmuştur.
2. MAG254 legacy profile fallback eklenmiştir.
3. Handshake `random` değeri profile metrics zincirine taşınır.
4. Live `get_all_channels` başarısız/boşsa `get_ordered_list` sayfalaması denenir.
5. Live/VOD/Series bağımsız hata alanlarıdır; partial success korunur.
6. Flight Recorder her fallback ve partial failure için ayrı olay üretir.

Kaynak URL'leri bu belgeye düz metin olarak gömülmemiştir; araştırma ChatGPT oturumunda GitHub/Infomir web kaynakları üzerinden yapılmıştır. Kod, tek bir üçüncü parti projeyi kopyalamak yerine ortak protokol davranışlarına göre geliştirilmiştir.
