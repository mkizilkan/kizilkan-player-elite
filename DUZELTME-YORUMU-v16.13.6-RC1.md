# KIZILKAN PLAYER v16.13.6 RC1 — Düzeltme/Geliştirme Yorumu

v16.13.5 üzerine gerileme yapmadan playlist yönetimi genişletildi.

- Playlist sıralama: özel sıra, A→Z/Z→A, eklenme, son kullanım, son yenileme, toplam/Live/VOD/Series sayıları, gerçek expiry varsa kalan gün.
- Manuel sıra kalıcıdır; otomatik moda geçmek manuel sırayı silmez.
- Playlist sabitleme ve “sabitlenenler üstte” tercihi eklendi.
- Playlist arama eklendi.
- Yenileme sırasında ayrıntılı kategori seçim ekranı yeniden açılabilir; yeni seçim kalıcı kaydedilir ve filtrelenmiş katalog Room/kalıcı depoya yazılır.
- Duplicate kimliği kaynak türüne göre normalize edilir. Credential/token loglanmaz. Uygun akışta mevcut kaydı açma, ayrı ekleme ve mevcut kaydı güncelleme seçenekleri sunulur.
- Xtream/MAG gerçekten expiry veriyorsa kalan gün hesaplanır; bilgi yoksa “Bilinmiyor” gösterilir.
- Toplu seçim ile yenileme, sabitleme/sabitlemeyi kaldırma ve silme eklendi.
- Son yenilemenin gerçek başarılı/başarısız durumu metadata olarak tutulur; sahte sağlık puanı üretilmez.
- v16.13.5 MAG anti-self-ban politikası, PCAP-first, credential boundary, DB Health ve Flight Recorder korunmuştur.
