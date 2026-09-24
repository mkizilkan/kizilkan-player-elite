# KIZILKAN PLAYER v17.10.0 RC1

Bu sürüm v17.9.10 üzerindeki P0/P1/P2 platform sağlamlaştırma paketidir.

## Ana değişiklikler
- Boş-kabuk recovery AppState-aware: background olduğunda aktif HTTP zinciri AbortController ile kesilir, tamamlanan katalog türleri korunur, foreground dönüşünde kalan aşamadan devam edilir. Overlay aktif süre ve arka-plan süresini ayrı gösterir.
- Player dönüş konumu telefon/tablet/TV için stable-key tabanlıdır. Library/TV Home büyük Room listelerinde native item position ile doğru pencere tekrar yüklenir ve hedef öğe `viewPosition: 0.5` ile ortalanır. Player içi zap sonrası dönüş anahtarı son kanala güncellenir.
- MAG katalogta raw series array tutulmadan satır-satır normalize edilir; event-loop yield sıklaştırıldı, kind-ready progressive delivery eklendi. Bu, eski dev raw-array + mapped-array çift kopyasını kaldırır.
- M3U `catchup-source`, `catchup-days`, `catchup-correction` metadata parse edilir ve fail-closed URL template resolver vardır.
- MAG/Ministra archive EPG ve archive `create_link` yolu eklendi. Portal archive komutu vermiyorsa sahte archive URL üretilmez.
- Otomatik liste yenileme aktif playlist için kullanıcı ayarlı aralıkla, uygulama açıkken ve foreground dönüşünde singleflight refresh kullanır.
- Kurtarılabilir Room snapshot ekranı eklendi. Kimlik bilgisi uydurulmaz; orphan snapshot otomatik silinmez.
- Yerel Medya ekranı eklendi: DocumentPicker + Android SAF klasör/USB/SD gezinme, mevcut persistent PlayerHost ile oynatma.
- Renkli TV tuşları native key mapping + profil bazlı atanabilir eylemler ile eklendi.
- DVR/local recording playback mevcut synthetic/external PlayerHost yoluna bağlandı.
- Download hedef terminolojisi gerçek davranışla eşleştirildi; private offline saklama ve dışa aktarma ayrıldı.
- Chromecast: generic `.ts -> .m3u8` kaldırıldı; dönüşüm yalnız Xtream live için. Remote authority yalnız `loadMedia` başarıyla bittikten sonra alınır. Header-required doğrudan Cast fail-closed, telemetry genişletildi, en güncel resume konumu kullanılır.
- Oynatıcı fallback attempt ledger aynı URL+engine+profil kombinasyonunun kör tekrarını engeller; farklı Surface/decoder profilleri gerçek ayrı deneme sayılır.

## Canlı timeshift kapsamı
Bu RC1 gerçek seekable/DVR live range'i olan yayınlarda pause/seek/canlıya dönüş davranışını motor capability'sine göre kullanır (Cast `liveSeekableRange`, MPV/VLC seekable live). Sunucunun DVR penceresi vermediği saf linear HLS/TS için uygulama-sahipli disk rolling-buffer bu sürümde etkin değildir. Destek yoksa UI bunu sessizce taklit etmez.

## Donanım kabul testi gerekenler
Chromecast receiver, USB/SD SAF davranışı, renkli fiziksel TV kumandası ve farklı MAG portal archive varyantları cihazda doğrulanmalıdır.
