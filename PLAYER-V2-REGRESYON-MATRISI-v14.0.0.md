# GPT KIZILKAN PLAYER ELITE v14.0.0 — Player V2 Regresyon Matrisi

## Statik/kod doğrulaması
- Session gate mevcut.
- Profile-generation gate mevcut.
- Transition lock mevcut.
- Media3 source headers mevcut.
- `onFirstFrameRender` gerçek Media3 başarı kriteri.
- Raw Media3 error overlay yolu kaldırıldı.
- MPEG-L2 / extractor / decoder sınıflandırması mevcut.
- HTTP 401/403/407 network sınıfı ayrı.
- Media3 -> VLC geçişinde pause + replace(null).
- VLC HW -> SW native view key ile rebuild.
- Live buffer v2 migration 450 ms.
- Engine profile confidence + local telemetry mevcut.
- Audio-only watchdog bypass mevcut.
- Kanal Test Et Player V2 request header'larını kullanır.

## Cihaz testinde özellikle doğrulanacak
1. Aynı çalışan canlı kanala 10 kez gir/çık: her seferinde ses+görüntü.
2. MPEG-L2 kanal: Media3 teknik hata overlay'i göstermeden VLC'ye hızlı geçiş.
3. Extractor error kanal: surface beklemeden VLC.
4. Media3 görüntü yok senaryosu: yalnız bir kez alternatif surface, sonra VLC.
5. VLC HW siyah görüntü: SW profile recovery.
6. Video oynarken eski motor hata overlay'i çıkmamalı.
7. 401/403/407: ham Java hata metni yerine sade Türkçe hata.
8. Başka player'da hızlı açılan kanal: first-frame süresi karşılaştır.
9. Tampon 450 ms varsayılan; kullanıcı 1500 ms seçerse seçim gerçekten uygulanır.
10. Radyo/audio-only: görüntü beklediği için hataya düşmemeli.
11. Zap: eski ses/track yeni kanala taşınmamalı.
12. VOD/Series -> Live ve Live -> VOD geçişleri.
13. Kayıt/screenshot/altyazı/ses track/senkron paneli.
14. Telefon touch ve panel gizli gesture davranışı.
15. TV Box geldiğinde SurfaceView/TextureView + D-pad + şerit/boyanma ayrı test.

## Bilinen açık teknik sınır
VLC wrapper gerçek first-rendered-frame callback sağlamıyor; v14 video metadata + playback clock proxy'si kullanır.
