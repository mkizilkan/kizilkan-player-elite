# KIZILKAN PLAYER — DEVİR NOTU

> **Bu dosya yeni bir sohbete geçerken okutulmak içindir.**
> Yeni sohbetteki asistan bu konuşmayı hatırlamaz. Bu belgeyi ve
> `tools/` klasörünü göstermek, kaldığımız yerden devam etmeyi sağlar.

---

## PROJE

**KIZILKAN PLAYER** — Türkçe IPTV oynatıcı (telefon + Android TV Box)
Expo / React Native, **react-native-tvos** fork'u (TV odağı için zorunlu).

- Kaynak: `frontend/`
- GitHub: `mkizilkan/KIZILKAN-PLAYER-OPUS-4.8-PUBLIC`
- Derleme: GitHub Actions "Run workflow" (~45-50 dk)
- Güncel sürüm: **v9.4.0** (versionCode 90400)

**Kullanıcının cihazları:** Homatics Box R 4K+ (ana test), Chromecast HD,
Fire TV 4K Max, Wanbo projeksiyon. Ortak payda: D-pad + OK + Geri + Ana.
Chromecast ve Wanbo'da **CH+/− tuşu YOK** (sol/sağ kanal değiştirme bu yüzden var).

---

## ÇALIŞMA SÖZLEŞMESİ (kullanıcının koyduğu kurallar)

1. **Gerileme yok** — hiçbir özellik sessizce çıkarılmaz, azaltılmaz
2. **Simülasyon yok** — olmayan şey "oluyor" gibi gösterilmez
3. Kod **çalışır** durumda olacak
4. Sonradan konan özellikler **sorulmadan** kaldırılmaz
5. **Her pakette sürüm artar** (app.json: version + versionCode)
6. **Yalan söylenmez**, "token yetmez" diye baştan savma yapılmaz
7. Acele edilmez, sıkıştırılmaz
8. **Kod öncesi plan sunulur**, onay alınır
9. Bahane üretilmez
10. Sınırlar zorlanarak, mükemmel yapılır
11. "İncele" denince **satır satır** incelenir, tablo ile anlatılır

**Ek olarak asistanın kendine koyduğu kural:** "hatasız garanti" verilmez;
API imzaları **paket kaynağından doğrulanır**, tahmin edilmez.

---

## 🔧 8 DENETLEYİCİ — EN DEĞERLİ VARLIK

`tools/` klasöründe. **Her paketten önce çalıştır:**

```bash
cd frontend && node ../tools/denetle.js
```

Her biri, GERÇEKTEN YAŞANMIŞ bir çökmeden sonra yazıldı:

| # | Araç | Yakaladığı hata | Doğduğu olay |
|---|------|-----------------|--------------|
| 1 | checkdefs | Tanımsız hook/JSX bileşeni | "useTv doesn't exist" çökmesi |
| 2 | checkcalls | Tanımsız fonksiyon çağrısı | "isValidPinFormat" donması |
| 3 | checkctx | Tanımsız context value alanı | "verifyAdminPin doesn't exist" çökmesi |
| 4 | checkdeps | Bayat kapanış (stale closure) | Liste kaybolması, profil karışması |
| 5 | checkjsx | Tanımsız JSX prop değişkeni | "autoFocusOnTv doesn't exist" çökmesi |
| 6 | checktdz | Kullanım-önce-tanım (const hoisting) | CH+/− tuşlarının sessizce çalışmaması |
| 7 | checkhooksrc | Yanlış hook kaynağı | "includes of undefined" çökmesi |
| 8 | checkimports | Eksik nokta-import | Modal/Pressable/Image import unutulması |

**Not:** TypeScript parser yolu `/home/claude/verify/node_modules/typescript`.
Yeni ortamda yoksa: `mkdir -p ~/verify && cd ~/verify && npm i typescript`

**Denetleyicilerin göremediği:** "Bu ekrana gidilebiliyor mu?" sorusu.
v8.0.0'da sütunlu TV ekranı yazıldı ama ulaşılamıyordu — bu yüzden
**yeni ekran eklenince yönlendirmeyi elle doğrula.**

---

## 🔴 ÇÖZÜLMEMİŞ SORUNLAR — TV BOX (en kritik)

Telefon tarafı büyük ölçüde ÇALIŞIYOR. Sorunlar TV Box'ta yoğunlaşıyor.
Kullanıcı bunları gerçek cihazda test edip bildirdi:

1. **Kanal açılınca SES VAR, GÖRÜNTÜ YOK** (telefonda aynı kanal sorunsuz)
2. **Üstte tema renginde şerit** — zap/panel açılınca geçiyor
   Denenen ve YETMEYEN: Stack contentStyle siyah, absoluteFill siyah taban
3. **Görüntü dikey (portre) hale geliyor** — TV modunu elle seçmek düzeltmiyor
4. **Bir süre sonra uygulamadan atıyor**
5. **Odak kayması + "ağır çekim"** — kısmen düzeltildi
   Sebep: react-native-tvos #296 (Android'in kendi kaydırması ile
   bizim scrollToIndex çakışıyor)
6. **Ekrana 4-5 kanal sığıyor** (1080p TV = 960x540 **dp**, alan kısıtlı)
7. **Sütunlu arayüzde sol sütuna girilemiyor** (tv-home.tsx, DENEYSEL)

**ÖNEMLİ:** TV Box'ta test edilemiyor. Kullanıcı her denemede ~45 dk derleme
bekliyor. Bu döngüyü kırmanın yolu: **development build + geliştirme sunucusu**
(Expo Go DEĞİL — native modüller: VLC, Chromecast, tvos fork).

## 🟠 DİĞER AÇIK KONULAR

8. **Chromecast canlı yayın** — streamType "live" eklendi, senkron kuruldu,
   ama kullanıcıda hâlâ görüntü gelmiyor
9. **PIN'ler ve Xtream şifresi DÜZ METİN** (SecureStore altyapısı var, kullanılmıyor)
10. **Uygulama simgesi (app icon)** — assets/icon.png hâlâ eski;
    asistan görsel üretemiyor, kullanıcının PNG hazırlaması gerekiyor
11. **VPN/ülke uyarısı** — kullanıcı kararı bekliyor:
    IP servisine sorulsun mu (IP üçüncü tarafa gider) yoksa elle mi seçilsin?

## 🟢 BÜYÜK İŞLER (ayrı paket)

12. Yerel medya oynatma (video + müzik)
13. Toplu kanal sağlık taraması (ölü kanal tespiti)
14. Zamanlı + EPG kayıt
    (sınır: kayıt oynatıcı çalışırken yapılır, uygulama açık kalmalı)

## ✅ TAMAMLANANLAR (son turlarda)

• **MAC/Stalker CİHAZ İÇİ** (v9.1.0) — son backend bağımlılığı kalktı
  handshake -> get_profile -> get_genres -> get_all_channels -> create_link
  Kullanıcı doğruladı: "MAG portal yükleniyor çalışıyor"
• Arama performansı (debounce 220ms + ön eleme + Set) — v9.2.0
• Liste kilidi (profil PIN'inden bağımsız), alan arası geçiş,
  liste yanında hesap özeti — v9.3.0
• Şifreyi göster, hilal logosu — v9.4.0

## ⚠️ TEKRARLANAN HATA DESENLERİ (aynı tuzağa düşme)

1. **Bayat kapanış:** `useCallback` bağımlılığına `activeProfile` eklemeyi
   unutma → yanlış profile yazar
2. **Tek seferlik taşıma:** eski (ortak) anahtardan devralırken **bayrak koy
   ve eski anahtarı sil**, yoksa HER profil aynı değeri devralır
   (bu hata liste taşımasında ve TV ayarında İKİ KEZ yapıldı)
3. **const hoisting yok:** hook'u, kullandığı fonksiyonlardan SONRA çağır
4. **Yeni ekran = yönlendirme kontrolü:** ekranı yazmak yetmez, ulaşılabilir mi?
5. **API tahmin etme:** paket kaynağından (`node_modules/.../*.d.ts`) doğrula

---

## PROFİLE ÖZEL OLANLAR (hepsi profil kimliğine göre saklanır)

- Oynatma listeleri: `kizilkan.playlists.meta.<pid>`
- Tema: `kizilkan.theme.<pid>`
- TV arayüzü: `kizilkan.tv.layout.<pid>`, `kizilkan.tv.preview.<pid>`
- Favoriler, son izlenenler, izleme geçmişi

**Sağlayıcı sırası (önemli):** `ProfileProvider > TvProvider > ThemeProvider > ...`
Tema ve TV ayarı aktif profili bilmek zorunda.

---

## PIN SİSTEMİ

- 4-10 rakam
- **Ana anahtar (maymuncuk):** `4224422442` — tüm PIN'leri açar, ekranda GÖSTERİLMEZ
- **Kurtarma kodu:** PIN kurulunca üretilen 10 haneli cihaza özel kod
- **Yönetici profili:** ilk profil; profil ekleme/silme onun PIN'iyle
