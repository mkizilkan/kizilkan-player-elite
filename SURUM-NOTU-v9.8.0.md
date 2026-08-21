# KIZILKAN PLAYER — SÜRÜM NOTU v9.8.0

**Sürüm:** 9.7.0 → **9.8.0** (versionCode 90700 → 90800)
**Konu:** Şeridin GERÇEK kök nedeni bulundu (çift Stack kaydı) + önizleme ses örtüşmesi

---

## Test geri bildirimin (v9.7.0)

- ❌ Şerit **aynı** (önizleme durdurma çözmedi → teşhisim yanlıştı)
- ⚠️ Çift ses artık **kalıcı değil**: yeni kanal yüklenene kadar önizleme sesi
  devam ediyor, kanal gelince kesiliyor
- ✅ Motorda kumandayla **seçim çalışıyor**
- ⚠️ Otomatik→VLC'de "ses var görüntü yok" (VLC'nin TextureView'ı yok — bilinen sınır)
- ⚠️ Sütunlu arayüzde sütunlar arası kumanda gezinme sıkıntılı
- ✅ Listeye dönünce önizleme yeniden başlıyor

---

## Şeridin GERÇEK kök nedeni (kesin, tahmin değil)

`app/_layout.tsx` içinde **`player` ekranı İKİ KEZ kayıtlıydı:**

```
1) name="player"  options={ contentStyle: {backgroundColor:"#000"}, animation:"none" }   ← şerit düzeltmesi
2) name="player"  options={ animation:"fade", orientation:"default" }                     ← contentStyle YOK
```

React-navigation aynı isimde **son kaydı** kullanır → siyah arka plan SESSİZCE
eziliyor, Stack'in tema renkli varsayılan arka planı tepeden sızıyor = **şerit**.
player.tsx'teki siyah katman bunu örtemiyordu çünkü sorun ekranın DIŞINDA,
navigatör seviyesindeydi.

**Çözüm:** İki kayıt **tek kayıtta** birleştirildi (contentStyle siyah + fade +
orientation korunarak). Çift kayıt silindi.

> Bu tam da 11 maddelik anlaşmanın önlemeye çalıştığı **sessiz regresyon**:
> önceki düzeltme, sonradan eklenen ikinci kayıtla iptal olmuş.

---

## Önizleme ses örtüşmesi

OK'a basıldığı **an** önizleme durduruluyor (`openItem`'de), navigasyondan ve
yeni kanalın yüklenmesinden önce. Böylece örtüşme süresi kısalıyor.
(Önceki `useFocusEffect` blur'u iç içe navigatörlerde biraz gecikebiliyordu.)

---

## Bu sürümde YAPILMAYANLAR (dürüstçe)

- **VLC'de TV görüntüsü:** `expo-libvlc-player` TextureView sunmadığı için
  VLC'de "ses var görüntü yok" devam ediyor. TV'de otomatik motor zaten
  ExoPlayer+TextureView seçiyor; VLC'yi elle seçmeni önermiyorum. Kalıcı çözüm
  ayrı bir iş (yüzey tipi seçilebilen VLC entegrasyonu).
- **Sütunlar arası gezinme:** TV odak yönlendirmesi (TVFocusGuideView / nextFocus)
  iteratif, gerçek-cihaz testli bir iş. Kör dokunup bozmamak için ayrı, planlı
  bir tura bıraktım. Hangi geçişin zor olduğunu (kategoriye mi giremiyorsun,
  kanaldan EPG'ye mi geçemiyorsun?) yazarsan hedefli çözerim.

---

## Gerçek donanımda TEST (Öğretmenim)

1. Kanal aç → üstte tema renkli **şerit KALKTI mı**? (asıl beklenen bu)
2. Önizlemeden OK → yeni kanala geçerken ses örtüşmesi **kısaldı mı**?
3. Telefonda her şey normal mi? (regresyon kontrolü)
