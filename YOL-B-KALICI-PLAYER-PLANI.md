> **DURUM (v9.19.0):** FAZ 1 KODLANDI (test yapısı). Kalıcı player katmanı + PlayerContext + /player yönlendirmesi uygulandı. Cihaz testi bekliyor. Bozulursa v9.18.1 tabanına dönülür.

# YOL B — KALICI PLAYER (Persistent Player Overlay) UYGULAMA PLANI

> Bu belge, "şerit/görüntü boyanması" sorununun KÖK çözümü olan kalıcı-player
> mimarisinin dosya-dosya uygulama planıdır. Token'ı dolu bir oturumda,
> **Faz 1 sonrası cihaz testiyle** uygulanmalıdır. Kör (test etmeden) tek
> seferde uygulama, VOD/dizi/catchup/indirilenler/geri-tuş/TV-odak akışlarında
> regresyon riski taşır; bu yüzden fazlı ve testli yapılmalıdır.

## KÖK NEDEN (kanıtlanmış)
- Zap (`router.replace("/player")`) **TEMİZ**: player ekranı yeniden mount
  edilmez, VideoView yüzeyi zaten bağlıdır → attach-deliği açılmaz → sızma yok.
- Listeden açma (`router.push("/player")`) **KİRLİ**: player taze mount olur,
  yüzey yeniden-attach olurken (~1 sn) arkadaki temalı (tabs) ekran delikten
  görünür → tema renginde şerit + boyanma.
- Panel (bir `Modal`) aç/kapa bunu geçici temizler çünkü Modal ayrı bir Android
  penceresidir ve kapanışı ana pencereyi yeniden kompoze eder.

**Sonuç:** Kalıcı çözüm = player yüzeyini HİÇ yeniden-attach etmemek =
player'ı kalıcı, her zaman mount edilen bir kök katman yapmak. Kanal açmak
"yeni ekran mount" değil, "durum değişimi" (zap gibi) olur.

## MİMARİ
`app/player.tsx` (route ekranı) → `src/player/PlayerOverlay.tsx` (kök katman).
Kanalı artık `useLocalSearchParams` yerine global `PlayerContext`'ten okur.

---

## ⚠️ EN KRİTİK ENGEL — ÖNCE BUNU ÇÖZ (boşta-çökme)

Kalıcı katman KÖKTE her zaman mount olur; kullanıcı tabs'tayken (kanal YOK,
`channel = null`) de render edilir. Mevcut `player.tsx` render'ında **15+
`channel.` referansı** var. Bunlardan biri null-korumasız kalırsa katman
BOŞTAYKEN çöker ve katman her zaman mount olduğu için **TÜM UYGULAMA çöker**
(tabs dahil). Denetleyiciler bunu YAKALAMAZ (runtime null hatası).

**Bu yüzden Faz 1'in İLK ADIMI ve İLK CİHAZ TESTİ şu olmalı:**
- Katmanı boş kaynak (`source=null`) ile mount et, `visible=false` iken sadece
  kalıcı `<VideoView player={player}/>` (Exo, `useVideoPlayer(null)` → kaynaksız)
  render et; `channel`'a bağımlı HER ŞEYİ `{visible && channel && (...)}` ile
  koşulla (VLC bloğu dahil — `uri={playUrl || channel.url}` null'da patlar).
- **CİHAZ TESTİ (devam etmeden ÖNCE):** uygulama tabs ekranında, katman boştayken
  ÇÖKMEDEN açılıyor mu? Bu geçmeden hiçbir kanal-açma adımına geçme.
- `if (!channel) return <Kanal bulunamadı>` erken-dönüşünü KALDIR; onun yerine
  `{visible && !channel && <NotFoundOverlay/>}` yap (VideoView unmount olmasın).

`src/player/PlayerContext.tsx` ZATEN OLUŞTURULDU (bu paket içinde) — kalıcı
durum temeli hazır; kullanan kod (`PlayerHost`, `_layout`) yazılmadı.

## FAZ 1 — Altyapı + tek giriş (DOĞRULAMA FAZI)

1. **`src/player/PlayerContext.tsx`** (HAZIR) — bkz. dosya. İçerik:
   - Durum: `{ visible, id, ext, localUri, title }`.
   - Aksiyonlar: `openPlayer({id,ext?,localUri?,title?})`, `closePlayer()`,
     `switchChannel(id)` (zap için — sadece id değiştirir, katman kalıcı).
   - `PlayerProvider` + `usePlayer()` hook.

2. **`src/player/PlayerOverlay.tsx`** oluştur:
   - Mevcut `app/player.tsx` GÖVDESİNİ buraya taşı (kopya), TEK fark:
     `const params = useLocalSearchParams(...)` satırını
     `const { id, ext, localUri, title, closePlayer, switchChannel } = usePlayer()`
     ile değiştir. `params.id → id`, `params.ext → ext` vb. tüm referansları
     context'e bağla (yaklaşık: satır 150, 309–329, 366, 583).
   - Kök sarmalayıcı: `visible` false iken `return null` (mount kalır ama
     görünmez; expo-video player'ı `pause/release` ile boşa çalışmasın).
   - `visible` true iken: absolute, tam ekran, opak, en üstte.
   - **ZAP:** iç `router.replace("/player",{id})` (satır 654) →
     `switchChannel(target.id)` (katmanı yeniden mount ETME, sadece id değiştir).
     Not: id değişince mevcut kanal-yükleme effect'leri zaten çalışır.
   - **GERİ/ÇIKIŞ:** `router.back()`/`router.replace("/(tabs)")` (satır 661,
     1049, 1219) → `closePlayer()` (katmanı gizle). Uzun-bas geri → `closePlayer()`.
   - **catchup geçişi** (satır 1054, `router.replace("/catchup")`): şimdilik
     KORU (catchup ayrı ekran kalır); `closePlayer()` sonrası push.

3. **`app/_layout.tsx`**:
   - En dış sarmalayıcıya `<PlayerProvider>` ekle (ThemeProvider içinde).
   - Navigasyon ağacının EN ÜSTÜNE (Stack'ten sonra, kardeş olarak)
     `<PlayerOverlay />` ekle — böylece her zaman mount, görünürken her şeyin
     üstünde.
   - `<Stack.Screen name="player" ... />` (satır 146) şimdilik KALSIN (Faz 2'de
     kaldırılacak) — ama artık kullanılmayacak.

4. **SADECE canlı listeyi bağla** — `app/(tabs)/index.tsx` satır 153:
   ```ts
   // ESKİ: router.push({ pathname: "/player", params: { id: item.id } });
   openPlayer({ id: item.id });
   ```
   (Diğer TÜM giriş noktaları Faz 1'de ESKİ `router.push("/player")` yolunda
   kalır — dokunma. Onlar hâlâ eski route ekranını kullanır; bu fazda onların
   bozulmaması esas.)
   > DİKKAT: Faz 1'de hem eski route-player (`app/player.tsx`) hem yeni
   > PlayerOverlay AYNI ANDA var. İkisi de expo-video kullandığı için, aynı anda
   > İKİSİNİN birden aktif olmadığından emin ol (canlı liste overlay'i açar,
   > route-player VOD için). Test sırasında canlı↔VOD geçişlerinde çakışma var mı
   > bak.

5. **TV ODAK:** PlayerOverlay görünür olunca kök View'e `hasTVPreferredFocus`
   ver; `closePlayer()` sonrası odağın listeye döndüğünü doğrula.

### FAZ 1 TESTİ (cihazda — devam etmeden ÖNCE)
- [ ] Canlı listeden kanal aç → şerit/boyanma GİTTİ mi? (Exo + VLC)
- [ ] Zap (kanal ileri/geri) hâlâ temiz + çalışıyor mu?
- [ ] Geri tuşu → listeye dönüyor mu? Odak listede mi?
- [ ] VOD/dizi (detail'den) hâlâ AÇILIYOR mu? (eski yol, bozulmamalı)
- [ ] Canlı aç → geri → VOD aç → geri: çakışma/siyah ekran var mı?
> Faz 1 temizse Faz 2'ye geç. Değilse burada düzelt.

---

## FAZ 2 — Diğer girişleri taşı
6. Şu satırları `openPlayer({...})`'a çevir (paramları koru):
   - `app/(tabs)/search.tsx:130`, `app/(tabs)/favorites.tsx:111,232,266,361`
   - `app/tv-home.tsx:255`, `app/detail.tsx:112,124,342`
   - `app/epg-timeline.tsx:191,217`, `app/downloads.tsx:82,121`
   - `app/catchup.tsx:68`, `app/_layout.tsx:76`
   - (VOD/dizi için `ext:"true"`, indirilenler için `localUri`/`title` paramları
     `openPlayer`'a olduğu gibi geçir.)
7. `app/_layout.tsx` — `<Stack.Screen name="player" />` KALDIR.
   `app/player.tsx` route dosyasını sil (veya ince redirect bırak:
   mount olunca `openPlayer(params)` çağırıp `router.back()` yapan bir kabuk).

### FAZ 2 TESTİ
- [ ] TÜM giriş noktaları (arama, favoriler, tv-home, detail/VOD, epg, catchup,
      indirilenler) açılıyor + temiz mi?
- [ ] Her yerden geri-tuş doğru yere dönüyor mu?

---

## FAZ 3 — Temizlik
8. Kullanılmayan importları temizle (`useLocalSearchParams` PlayerOverlay'de
   gitti). Ölü kod yok.
9. `tools/denetle.js` (8 denetleyici) + tsc parse + tam cihaz testi.
10. Sürümü üç alanda artır (`version`+`buildNumber`+`versionCode`).

## RİSK NOTLARI
- **İki-player çakışması (Faz 1):** en büyük risk. Aynı anda iki expo-video
  aktif olursa ses/görüntü çakışır. Faz 1 testinde canlı↔VOD geçişine özellikle bak.
- **Geri-tuş/odak:** TV'de en kırılgan yer; her fazda test et.
- **expo-video yaşam döngüsü:** overlay `visible=false` iken player'ı
  `pause()`/`release()` et; `true` iken yeniden hazırla — boşa decode + pil.
- Bu plan sırayla ve TESTLE uygulanırsa regresyon riski minimuma iner.
