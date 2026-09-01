# KIZILKAN PLAYER — SÜRÜM NOTU v9.9.0

**Sürüm:** 9.8.0 → **9.9.0** (versionCode 90800 → 90900)
**Konu:** 4K 10-bit HEVC "decoder failed" + yüzey tipi dengesi

---

## Fotoğraftaki hata

```
video/mp2t + video/hevc (H.265) + 3840×2160 + 10bit
Decoder failed: c2.android.hevc.decoder
```

Kanal **4K, 10-bit HEVC**. `c2.android.hevc.decoder` = **YAZILIM** çözücü.
Cihaz bu ağır formatı yazılımla çözemeyip patlıyor (muhtemel çökmelerin de
bir sebebi bu).

## Kök neden (benim v9.5.0 değişikliğimin bedeli)

TextureView'a geçince "ses var/görüntü yok" düzelmişti — ama **bazı donanım
video çözücüleri yalnızca SurfaceView ile çalışır.** TextureView'da donanım
HEVC çözücüsü devre dışı kalıp yazılıma düşüyor → 4K 10-bit'te patlıyor.

Gerçek bir denge:
- **SurfaceView:** donanım çözücü çalışır (4K HEVC olur) ↔ bazı kutularda "görüntü yok"
- **TextureView:** kompozisyon sorunsuz ↔ ağır formatlarda yazılıma düşüp patlar

## Çözüm (çalışan v7.7.0'ın yaptığı: yüzey tipi kontrolü + akıllı otomatik)

| Ne | Nasıl |
|----|-------|
| **Akıllı otomatik** | Decoder hatası (c2.android/MediaCodec) gelince, VLC'ye düşmeden ÖNCE otomatik **SurfaceView**'a geçip ExoPlayer'ı donanım çözücüyle yeniden dener. Olmazsa VLC'ye düşer. |
| **Yüzey tipi ayarı** | Motor menüsüne eklendi (kumandayla erişilir): **Otomatik / TextureView / SurfaceView**. Kalıcı. |
| **Remount** | Yüzey değişince VideoView `key` ile yeniden kurulur (prop çalışma anında değişemez). |

Böylece çalışan kutularda TextureView korunur; bu Philips gibi 4K HEVC
kanallarında otomatik donanım çözücüye geçilir. İstersen elle de sabitleyebilirsin.

---

## Gerçek donanımda TEST (Öğretmenim)

1. Fotoğraftaki 4K HEVC kanalını aç → artık **açılıyor mu**? (otomatik SurfaceView
   devreye girmeli)
2. Açılmazsa: menü → Motor → **Video yüzeyi: SurfaceView** seç, kanalı yeniden aç.
3. Diğer kanallar (çalışan kutularda) hâlâ normal mi? (TextureView regresyon kontrolü)
4. Çökme ("kendini atma") azaldı mı? (yazılım 4K çözme çökmenin sebebi olabilir)

**Dürüst not:** "TextureView donanım çözücüyü devre dışı bırakıyor" teşhisi
hatanın kendisiyle (`c2.android` yazılım çözücü + format_supported=YES) birebir
tutarlı; ama SurfaceView'ın bu Philips'te 4K HEVC'yi açacağı **gerçek cihazda
doğrulanmalı**. Açmazsa sorun donanım çözücünün de bu formatı reddetmesi olabilir;
o zaman VLC yolunu ayrıca ele alırız.

---

## Bekleyen (ayrı, planlı işler)
- Sütunlar arası kumanda gezinme (TVFocusGuideView) — hangi geçişin zor olduğunu
  bildirmeni bekliyorum.
- VLC'de TV görüntüsü (yüzey seçilebilen VLC entegrasyonu).

## Değişmeyen
Telefon davranışı ve tüm önceki düzeltmeler korundu. Hiçbir özellik çıkarılmadı.
