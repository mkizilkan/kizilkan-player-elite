# GPT KIZILKAN PLAYER ELITE v14.1.0

## Player V2 Reliability
- VLC görüntü sağlığı artık yalnız width/height + zaman proxy'sine bağlı değildir. `expo-libvlc-player` snapshot callback yolu kullanılarak gerçek render edilmiş kare doğrulaması eklenmiştir.
- VLC snapshot doğrulaması için cache altında geçici klasör kullanılır; alınan sağlık snapshot dosyası callback sonrası silinir.
- Snapshot API kullanılamazsa compatibility fallback olarak playing + video metadata proxy'si korunur.
- VLC HW watchdog live 3000 ms, VOD 4500 ms; doğrulanmış görüntü varsa çalışan motor artık yanlışlıkla HW->SW'ye geçirilmez.
- VLC SW final failure öncesi ikinci snapshot doğrulaması yapılır. Gerçek final failure durumunda VLC durdurulur; hata overlay'inin arkasında yayın oynamaya devam etmez.
- Stale/transient VLC error event'i geldiğinde render edilmiş kare doğrulanıyorsa hata göz ardı edilir.
- Kanal Test Et, HTTP 200/206 cevabını yalnız medya içerik türündeyse oynatılabilir kabul eder. `application/json` / HTML gibi cevaplar artık 'player hatası' sayılmaz.
- HTTP 407 ayrı tanı sınıfıdır.
- Xtream canlı kanalda birincil yol başarısızsa tanılama amacıyla `.ts` / `.m3u8` alternatifleri test edilebilir.

## Playlist / Sunucu UX
- Kodum var / Paneli biliyorum / Paneli bilmiyorum yöntemlerinin üçünde de kullanıcı isteğe bağlı görünür playlist adı verebilir.
- Görünür ad teknik panel kimliğinden ayrıdır; isim değiştirmek DNS self-heal eşlemesini bozmaz.
- Sunucu ile eklenen playlistlerde panel adı + sunucu kodu listelerde gösterilir.
- Playlist türleri renk kimliği kazandı:
  - MAG: #A855F7
  - Xtream: #3B82F6
  - M3U: #22C55E
  - Sunucu/Firebase rehberi: #F59E0B
  Aktif playlist seçimi KIZILKAN kırmızısı olarak kalır.
- Ayarlar > Oynatma Listeleri bölümüne `Tümünü Güncelle` geri getirildi; iki kontrollü worker ile günceller ve ilerleme gösterir.
- Ayarlar'a genel `Canlı Yayın Tamponu` seçimi eklendi; player panelindeki aynı storage ayarıyla senkron çalışır.

## DNS self-heal
- Firebase/directory'deki güncel DNS listesi eski preferred DNS'ten önce değerlendirilir.
- Eski preferred/validated DNS yalnız fallback olarak tutulur.
- Başarıyla çözülen güncel DNS `preferredServer` olarak persist edilir ve validatedHosts güncellenir.

## Sürüm
- version: 14.1.0
- buildNumber: 14.1.0
- Android versionCode: 140100
- package: com.gpt.kizilkan.player
