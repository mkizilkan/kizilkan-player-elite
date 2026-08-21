# GPT KIZILKAN PLAYER ELITE v14.2.0

## Sürüm
- version: `14.2.0`
- iOS buildNumber: `14.2.0`
- Android versionCode: `140200`
- Android package: `com.gpt.kizilkan.player`
- Taban: GPT KIZILKAN PLAYER ELITE v14.1.0

## 1. Player çalışma sırası performans / kilitlenme iyileştirmeleri

### Doğrulanan performans yükleri
- VLC `onTimeChanged` callback'i önceki yapıda her native zaman olayında `setVideoStats` çağırarak büyük `PlayerHost` bileşenini tekrar render edebiliyordu.
- Media3 konumu için native event'e ek olarak ayrı JS polling yaklaşımı geçmişten kalmıştı.
- VLC'ye verilen `extraOptions` ve seçili `tracks` değerleri parent renderlarında yeni array/object kimliği üretebiliyordu; native prop churn riski vardı.

### v14.2.0 düzeltmeleri
- Media3 `timeUpdateEventInterval` 1 saniyelik kontrollü native güncelleme olarak kullanılır.
- Eski ek 1 saniyelik Media3 JS currentTime polling kaldırılmıştır.
- VLC playback clock her native event'te yalnız `ref` üzerinden güncellenir; görünür kontrol/istatistik ekranı yoksa UI state tetiklenmez.
- VLC UI zaman bilgisi görünürken bile en fazla saniyede bir güncellenir.
- VLC `onBuffering`, `onPlaying`, `onPaused` aynı değeri tekrar tekrar state'e yazmaz.
- VLC `extraOptions` ve seçili track objesi memoize edilmiştir; native player'a gereksiz yeniden prop üretimi azaltılmıştır.
- VOD/Series 5 saniyelik ilerleme kaydı korunur fakat player kontrolleri/istatistik ekranı gizliyken gereksiz `videoStats` UI renderı yapılmaz.

## 2. Runtime Stall Health Monitor
İlk açılış watchdog'undan ayrıdır. Yayın başarıyla başladıktan sonra playback clock gerçekten ilerlemeyi bırakırsa çalışır.

Güvenlik kuralları:
- Uygulama arka plandaysa çalışmaz.
- Kullanıcı pause yaptıysa çalışmaz.
- Player buffering durumundaysa motor değiştirmez.
- Her session/profile için kontrollü iki aşama vardır.

Aşama 1 — Soft recovery:
- Live: yaklaşık 5.5 sn clock ilerlemezse.
- VOD/Series: yaklaşık 9 sn clock ilerlemezse.
- Kaynak/track yapısını yıkmadan kısa pause/play resync denenir.

Aşama 2 — Hard recovery:
- Live toplam yaklaşık 9.5 sn, VOD/Series yaklaşık 15 sn gerçek ilerleme oluşmazsa.
- AUTO + Media3: VLC HW profiline kontrollü geçiş.
- AUTO + VLC HW: VLC SW profile kontrollü geçiş.
- Manuel motor veya VLC SW: kullanıcı motor tercihini değiştirmeden temiz session restart.
- Soft recovery'nin kendi `pause` eventi hard recovery'yi yanlışlıkla devre dışı bırakamaz.
- Soft aşamadaki clock grace reset'i hard eşiği `soft+hard` toplamına uzatmaz; kalan eşik ayrı takip edilir.

### Önemli teknik sınır
Bu monitor playback clock stall'ını kesin olarak takip eder. Ses clock'u ilerlerken yalnız video decoder'ın tek karede kalması, mevcut Expo Video/libVLC wrapper API'lerinde sürekli gerçek frame counter olmadığı için her durumda deterministik olarak tespit edilemez. v14.1.0'daki VLC gerçek-snapshot başlangıç sağlık kontrolü korunmuştur.

## 3. Çoklu IPTV hesabı — tek işlem mimarisi
Yeni `Çoklu Hesap` yöntemi eklendi. Xtream hesapları için üç giriş kaynağı aynı doğrulama/yükleme motorunda birleşir:

1. Form ile manuel hesap satırları.
2. Hızlı CSV/TXT yapıştırma.
3. CSV / TXT / JSON dosyadan içe aktarma.

Bu üç kaynak aynı işlemde birlikte kullanılabilir.

### Form alanları
Her hesap için:
- Liste adı (isteğe bağlı)
- Kullanıcı adı
- Şifre
- Sunucu kodu / panel adı / DNS (isteğe bağlı)

Yeni hesap satırı eklenebilir ve istenmeyen satır silinebilir.

### Dosya / metin biçimleri
- JSON array veya `{ "accounts": [...] }`
- CSV / TSV / `;` / `|` ayrımlı TXT
- Türkçe/İngilizce başlık alias'ları
- Başlıksız `ad|kullanici|sifre|locator`
- Başlıksız `kullanici|sifre|locator`
- Yalnız `kullanici|sifre` -> panel otomatik keşfi

Locator otomatik ayrılır:
- URL/DNS -> doğrudan Xtream
- sayısal değer -> sunucu kodu
- diğer metin -> panel adı
- boş -> panel bilinmiyor, panel rehberi taranır

### Güvenlik ve doğruluk
- Ham kullanıcı adı/şifre Firebase'e gönderilmez.
- Aynı hesap/locator manuel + dosyada tekrarlanırsa tek kez işlenir ve uyarı gösterilir.
- Aynı kullanıcı/şifre birden fazla FARKLI panelde bulunursa uygulama güvenlik amacıyla rastgele panel seçmez; dosyada/formda panel adı veya sunucu kodu istenir.
- Aynı panelin birden fazla geçerli DNS'i varsa bir playlist oluşturulur ve tüm doğrulanmış DNS'ler `validatedHosts` olarak self-heal için saklanır.
- Panel adı rehberde birden fazla farklı kodla eşleşiyorsa otomatik seçim yapılmaz; sunucu kodu istenir.
- Çoklu ekleme tek kullanıcı işlemiyle başlar fakat sağlayıcıları aynı anda onlarca istekle boğmamak ve local playlist persist yarışması oluşturmamak için hesaplar kontrollü olarak sırayla tamamlanır. Her hesabın kendi Live/VOD/Series içeriği mevcut paralel yükleme motorunu kullanmaya devam eder.
- Paneli bilinmeyen çoklu hesaplarda panel rehberi bir kez alınır ve sonraki hesaplarda cache kullanılır.

## 4. Korunan v14.1.0 özellikleri
- Player V2 session/profile isolation.
- Media3 gerçek first-frame kontrolü.
- VLC snapshot tabanlı gerçek görüntü sağlık doğrulaması.
- MPEG-L2 / extractor / decoder sınıflandırmalı fallback.
- HTTP 401/403/407 ayrımı.
- Kanal Test Et medya olmayan JSON/HTML 200 cevabını yayın saymaz.
- Live buffer seçenekleri ve genel Ayarlar entegrasyonu.
- Server-code custom playlist adı, server code gösterimi, playlist tür renkleri.
- DNS self-heal: güncel Firebase DNS önce, eski DNS fallback.
- Tümünü Güncelle 2 kontrollü worker.
- Native Android arka plan panel/DNS taraması.
- Kalıcı PlayerHost / şerit-boyanma çözümü / gizli gesture izolasyonu.
