# DÜZELTME YORUMU — v15.2.27-RC1

## P0-1 — MAG yayın açılmıyor / Media3 HTTP 456
Kök akış: portal handshake/profile/catalog/create_link başarılıyken çözülen medya URL'si PlayerHost'a yalnız URL olarak aktarılıyordu. MAG API isteklerinde bulunan cihaz/session header bağlamı gerçek medya isteğinde kaybolabiliyordu.

Düzeltme:
- stalkerResolveStream artık URL yanında playback headers ve session metadata döndürür.
- PlayerHost bu runtime headers'ı buildPlaybackRequest'e taşır.
- 401/403/456 gerçek medya hatasında tek sefer session invalidate + fresh login + fresh create_link recovery yapılır.
- Credential aktarımı host güvenlik filtresine bağlanmıştır.

## P0-2 — VOD/Series 14 öğede kesiliyor
Kök akış: bazı Ministra portalları p=0 isteğini p=1 ile aynı sayfa olarak döndürür. Eski duplicate-page koruması p=1'de erken durup p=2'yi hiç denemiyordu.

Düzeltme:
- p0 == p1 ise portal 1-based alias olarak öğrenilir ve p=2 denenir.
- p0 != p1 ise 0-based davranış korunur.
- max_page_items varsa sayfa governor hesabında kullanılır.
- Gerçek tekrar eden portalda duplicate/no-new governor devam eder; sonsuz döngü yaratılmaz.

## P0-3 — Kaydet ve Ekle arasında kullanıcı bilgisi yok
Kök akış: setProgress sonrası router.replace hemen çalıştığı için görünür durum mesajı kullanıcı tarafından görülemiyordu.

Düzeltme:
- MAG başlamasında görünür progress modalı eklendi.
- Live kayıt sonrası kanal sayısı ile gerçek başarı Alert'i gösterilir.
- Kullanıcı Listeye Git dedikten sonra route değiştirilir; VOD/Series enrichment arka planda devam eder.

## P0-4 — Siyah spinner sırasında dokunma tepki vermiyor
Kök akış: spinner pointerEvents='none' olsa da single-tap erişimi Gesture.Exclusive zincirine bağlıydı; native video surface/buffering kombinasyonunda kontrol açma jesti kaybolabiliyordu.

Düzeltme:
- preparing/buffering/switch_engine/non-playing fazlarında ayrı emergency touch catcher eklendi.
- Tek dokunuş revealControls çağırır ve telemetri kaydı üretir.
- Hata ekranındaki Oynatıcı Motorunu Seç yolu korunmuştur.

Bu sürümde önceki özellikler kaldırılmamıştır.
