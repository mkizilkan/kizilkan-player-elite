# KIZILKAN PLAYER — SÜRÜM NOTU v9.6.0

**Sürüm:** 9.5.0 → **9.6.0** (versionCode 90500 → 90600)
**Konu:** MAG/Stalker düzenle-yenile cihaz-içine taşındı + TV listesinde canlı önizleme

---

## 1) MAG / Stalker düzenle-yenile — emergent backend söküldü

**Sorun:** Ekleme cihaz-içiydi ama **düzenle** ve **yenile** hâlâ eski
emergent backend'ini (`api.stalkerLogin/Load`) çağırıyordu. Backend kapalı
olduğu için bu iki işlem çalışmıyordu.

**Çözüm:** Her ikisi de `src/utils/stalker.ts` (add-playlist ile aynı kanıtlanmış
cihaz-içi yol) üzerine bağlandı.

| Dosya | Eski | Yeni |
|-------|------|------|
| `app/edit-playlist.tsx` | `api.stalkerLogin` + `api.stalkerLoad` | `stalkerLogin` + `stalkerChannels` (cihaz-içi) |
| `src/utils/refreshPlaylist.ts` | "yenilenemiyor (yakında)" NO-OP | `stalkerLogin` + `stalkerChannels` (gerçek yenileme) |

Kullanılmayan `api` importu `edit-playlist.tsx`'ten kaldırıldı.

**Not (bu sürümde YOK):** `epg-timeline.tsx`'teki `api.catchupStream` hâlâ
backend'e gidiyor — ama o **Xtream catchup**, MAG değil. Catchup'ı bozmamak
için ayrı bir iş olarak bırakıldı.

---

## 2) TV listesinde canlı önizleme

**İstek:** TV listesinde gezerken, OK'a basmadan, odaklanan kanal önizleme
penceresinde izlensin. Eskiden sadece logo görünüyordu.

**Yapıldı:** Yeni `LivePreview` bileşeni (`app/tv-home.tsx`).

- Odaklanan kanal **600ms** durunca oynatılır (debounce — hızlı gezinirken
  her kanalı açıp TV box'ı boğmayı önler).
- **Stalker** kanallarında yayın adresi `create_link` ile çözülür.
- **Yüzey tipi** TV'de `textureView` (v9.5.0'daki "ses var/görüntü yok"
  düzeltmesiyle tutarlı).
- Yalnızca **canlı** sekmede. Film/dizide afiş/logo davranışı korunur.
- Çözülene kadar üstteki **logo + isim** fallback olarak görünür.

**Dürüst sınır:** Önizleme yalnızca **ExoPlayer** kullanır (hafif tutmak için).
ExoPlayer'ın açamadığı bazı `.ts` kanallar önizlemede boş kalabilir; OK'a
basınca açılan TAM oynatıcı VLC'ye düşerek yine de oynatır.

---

## Gerçek donanımda TEST edilecekler (Öğretmenim)

1. **MAG hesabı düzenle** → "İçeriği yeniden yükle" ile kaydet: kanallar
   güncelleniyor mu? (Artık cihaz-içi; backend'e gitmiyor.)
2. **MAG listesini yenile** (liste ekranındaki yenile): kanal sayısı
   güncelleniyor mu? (Eskiden "yakında" diyordu.)
3. **TV columns düzeni** (Ayarlar → TV düzeni = columns): kanal listesinde
   gezerken önizlemede **canlı görüntü** geliyor mu? Bir kanalda durunca
   ~0.6 sn sonra oynamalı.
4. Hızlı gezinince önizleme her kanalı açıp kapatmıyor, sadece durduğunda
   açıyor mu? (Debounce kontrolü.)

---

## Değişmeyen

Telefon davranışı ve v9.5.0'daki TV oynatıcı düzeltmeleri aynen korundu.
Hiçbir özellik çıkarılmadı.
