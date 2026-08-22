# KIZILKAN PLAYER ELITE v15.2.0-RC1 — Native Core Phase 1

## Amaç
React Native UI korunurken ağır playlist parse ve uzun süreli sunucu taraması JS thread'den native Kotlin katmanına taşınmaya başlandı.

## Yapılanlar
- Yeni `frontend/modules/kizilkan-native-core` Expo/Kotlin modülü.
- Büyük playlist JSON parse işlemi Android native AsyncFunction queue'suna taşındı; sonuç native cache'te tutuluyor.
- Native playlist summary/category/query/getItem API temeli eklendi.
- Playlist seçimi artık Android'de otomatik tam JS hydrate yapmıyor; Native Core warm-up yapıyor. Legacy tam koleksiyon isteyen ekranlar açıkça hydrate ediyor.
- Ayarlar ekranı playlist sayaçlarını metadata'dan, kategori listesini Native Core'dan okuyabiliyor; playlist seçmek JS `JSON.parse` kilidi üretmiyor.
- Çoklu `kullanıcı:şifre` / panel bilinmiyor taraması Android foreground service'e taşındı. Global bounded worker pool, Pause/Resume/Stop ve kalıcı snapshot var.
- Native scan snapshot'ına parola/token yazılmaması için sanitizasyon eklendi.
- 5 tarama profili korunuyor; Native bulk worker limiti 32.
- Native parse telemetrisi (`parseMs`, bytes, cacheHit) eklendi.

## Bilerek korunmuş fallback
Native modül bulunmayan platformlarda eski JS/dosya yolu korunur. Doğrudan sunucu/kod/panel verilen karma çoklu hesap kayıtları kanıtlanmış eski resolver yolunu kullanmaya devam eder.

## Henüz tamamlanmış sayılmayanlar
- Live/Search/Favorites koleksiyonlarının tamamının paged native query'ye taşınması Phase 2 işidir.
- Native EPG/Search index ve tam Native Player Session Manager sonraki fazlardır.
- APK boyutu ve RAM optimizasyonu ayrı ölçüm/optimizasyon turudur.
