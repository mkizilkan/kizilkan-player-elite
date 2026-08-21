# GPT KIZILKAN PLAYER ELITE v12.6.0 — Regresyon Denetimi

## v12.5.0'dan korunan
- `com.gpt.kizilkan.player` package kimliği ve ELITE adı.
- Tüm DNS hesaplarını üç sunucu giriş yönteminde tarama/seçme.
- Preferred/validated DNS self-healing.
- Gizli PlayerHost gesture izolasyonu ve kalıcı player mimarisi.
- 4 saniye son playlist auto-continue.
- ELITE özel kayıt/yedek isimleri.
- Çoklu playlist ekleme state/persist düzeltmeleri.

## v12.6.0 kritik düzeltmeleri
- Açılışta aktif playlist yüklenirken senkron `prepareAdultFlags` çağrıları kaldırıldı.
- Playlist ekleme/güncelleme kritik yolunda senkron +18 taraması kaldırıldı.
- +18 cache'i `prepareAdultFlagsAsync` ile 300 öğelik batch'lerde ve 750 ms gecikmeli arka plan ön-ısıtmasıyla hazırlanır.
- DNS/Xtream ekleme sırasında canlı/film/dizi sonuçları ayrı aşama olarak görünür.
- Playlist disk kaydı ayrı ilerleme aşaması olarak görünür.
- `Tümünü Güncelle` 2 kontrollü worker ile çalışır.
- İki worker'ın eşzamanlı `updatePlaylist` çağrılarında metadata stale snapshot ile ezilmez; persist en güncel `playlistsRef.current` üzerinden yapılır.
- Tek liste ve tüm listeler yenilemede DNS/login/canlı/film/dizi/kaydetme ilerlemesi kullanıcıya gösterilir.

## Cihazda yeniden test edilecek
- Güncelleme sonrası splash'ın takılmadan geçmesi.
- Yeni Xtream/DNS playlist eklemesinin içerik indirme ve kayıt sonunda tamamlanması.
- 9 playlist `Tümünü Güncelle` toplam süresi ve iki worker davranışı.
- +18 gizle/aç ilk ve sonraki kullanım gecikmesi.
- Telefon canlı ekran dokunmatik.
- TV Box D-pad/focus, zap sesi, VOD/Series->Live, player paneli ve şerit/boyanma regresyonu.
