# KIZILKAN PLAYER — SÜRÜM NOTU v9.5.0

**Sürüm:** 9.4.0 → **9.5.0** (versionCode 90400 → 90500)
**Konu:** TV oynatıcı kök düzeltmeleri — "ses var/görüntü yok", "şerit", "portre"
**Değişen dosya:** `frontend/app/player.tsx` (+ `app.json` sürüm)

---

## Neden bu sürüm?

Çalışan **v7.7.0** ile bozuk **v9.x** (bizim + GPT + Grok) karşılaştırıldı.
Kök sebep bulundu: v7.7.0'da **video yüzey tipi (surfaceType)** kontrolü vardı;
9.x hattında bu kayboldu. TV box'larda SurfaceView "delik-delme" yaptığı için
ses geliyor ama görüntü siyah kalıyor ve kenardan tema rengi şerit sızıyordu.

Ayrıca orientation TV-farkında değildi: TV'de kilit açılınca box kendi doğal
(çoğu zaman portre) yönüne dönüyordu.

---

## Yapılan düzeltmeler

| # | Sorun | Çözüm | Dosya/yer |
|---|-------|-------|-----------|
| 1 | Görüntü portre oluyor | TV'de mount'ta **LANDSCAPE kilidi** (unlock değil); isTv async çözüldüğü için iki-efekt + ref deseniyle portre sıçraması önlendi | orientation useEffect |
| 2 | Çıkışta yön sıçraması | `goBack` + cleanup TV'de portre kilitlemiyor | goBack / cleanup |
| 3 | Ses var / görüntü yok + şerit | **`surfaceType={isTv ? "textureView" : "surfaceView"}`** — TV'de TextureView delik-delme yapmaz, görüntü kompoze olur, şerit kaybolur (Expo resmi belgesiyle doğrulandı) | `<VideoView>` |
| 3b | .ts kanallar TV'de VLC'ye zorlanıyordu (VLC=görüntü yok) | TV'de **önce ExoPlayer+TextureView**; ExoPlayer açamazsa zaten otomatik VLC'ye düşülüyor. Bayat "vlc" hafızası TV'de yok sayılıyor | auto-motor + memo useEffect |
| 4 | statusChange bayat closure | Deps'e `useVLC` + `channel?.id` eklendi (zap'te doğru motor/hata yolu) | statusChange useEffect |
| 5 | ExoPlayer tamponu ilk açılışta uygulanmıyordu | `bufferMs` değişince tamponu tazeleyen ayrı efekt | yeni useEffect |
| 6 | TV'de döndürme düğmesi yönü bozabiliyordu | Düğme TV'de gizlendi (yatay kilitli) | üst kontrol satırı |

**Doğrulandı, hata bulunmadı:** `useRemoteKeys` zaten ref deseni kullanıyor;
kumanda bayat closure sorunu YOK.

---

## Telefon davranışı

**Bire bir korundu.** Tüm değişiklikler `isTv` korumalı; telefonda
`surfaceType="surfaceView"` (mevcut varsayılan) ve serbest yön aynen sürüyor.
Hiçbir özellik çıkarılmadı/azaltılmadı.

---

## Gerçek donanımda TEST edilecekler (Öğretmenim)

1. **Homatics / Fire TV / Chromecast HD / Wanbo** — bir .ts canlı kanal aç:
   - Görüntü geliyor mu? (beklenen: EVET, ExoPlayer+TextureView ile)
   - Üstte tema renginde şerit var mı? (beklenen: YOK)
   - Görüntü yatay mı? (beklenen: EVET, portre değil)
2. ExoPlayer açamayan bir kanal olursa otomatik VLC'ye düşüyor mu?
   (VLC'de TV'de görüntü hâlâ gelmeyebilir — bu paketin bilinen sınırı;
   VLC paketi TextureView sunmuyor.)
3. Telefonda hiçbir şey değişmedi mi? (regresyon kontrolü)

---

## Sonraki adım (bu sürümde YOK, ayrı iş)

- VLC tarafına da TextureView kazandırmak için `expo-libvlc-player` yerine
  yüzey tipi seçilebilen bir VLC entegrasyonu araştırması.
- Development build (45 dk derleme döngüsünü kırmak).
