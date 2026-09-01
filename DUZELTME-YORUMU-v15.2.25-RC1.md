# DÜZELTME YORUMU — v15.2.25 RC1

27 Ağustos 2026 MAG Flight Recorder kayıtlarında aynı portalın bazı oturumlarda 21.324 canlı kanal / yaklaşık 29 MB cevap verdiği, buna rağmen ekleme akışının VOD/Series tamamlanmasını beklediği ve geniş endpoint/profile taramasının 512/403 sınıfı retlerde gereksiz istek üretebildiği görüldü.

Bu sürümde Grok yamasındaki bounded handshake, live-first ve pagination fikrinin faydalı kısımları alındı; `updatePlaylist`'in `addPlaylist` öncesinde çalışabilmesi ve her non-2xx JSON'u başarı sayma riskleri alınmadı.

MAG254 varsayılan cihaz oldu. Header User-Agent, X-User-Agent ve get_profile `stb_type` aynı compat profile göre tutarlı üretilir. Başarılı endpoint/profile yerel olarak öğrenilir; başarısız learned endpoint bounded discovery'e düşer.

Canlı katalog Room'a doğrulanmadan enrichment başlamaz. Native Core'da VOD/Series yalnız hedef kind transaction'ıyla değiştirilir; LIVE katalog ikinci kez JS'e hydrate/stringify edilmez.
