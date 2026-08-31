# KIZILKAN PLAYER v16.13.5 RC1 — Düzeltme Yorumu

- v16.13.1 tabanı eksiltilmeden korunmuştur.
- Playlist eklemede isteğe bağlı gerçek kategori/group seçimi eklendi. Seçim açılırsa native doğrudan import yerine seçim yapılmadan Room yazımı başlatılmayan kontrollü yol kullanılır.
- Seçim `Playlist.contentSelection` içinde kalıcıdır; normal yenileme aynı kapsamı uygular.
- Playlist seçim ekranında yenile düğmesine uzun basıldığında kayıtlı kapsamla yenileme veya filtreyi kaldırıp tüm kategorilere dönme seçeneği vardır.
- MAG self-ban politikası gevşetildi: ağ bütçesi 12, auth-reject bütçesi 8, taban pacing 650 ms ve kademesi sınırlandı. AUTH_REJECT kalıcı cooldown üretmez; kalıcı cooldown yalnız `MAG_RATE_LIMIT` (gerçek 429/açık rate-limit sinyali) için korunur.
- PCAP-first MAG320, credential boundary, DB Health Center, Flight Recorder V6 ve v16.13.1 NativeBlackBox Kotlin düzeltmesi korunmuştur.

## Dürüst kapsam notu
Bu RC1, KIZILKAN Android wire paketinin referans PCAP ile byte-for-byte aynı olduğunu kanıtlamaz. Gerçek cihaz PCAP/portal testi nihai doğrulamadır. Kategori seçimi için Android native importer'ın seçici filtre API'si henüz yoktur; kullanıcı seçim özelliğini açtığında JS kontrollü katalog yolu kullanılır. Bu, gereksiz seçilmemiş içeriğin Room'a yazılmasını önler ancak çok büyük Xtream listelerinde native importer kadar bellek-verimli değildir.
