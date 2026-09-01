# KIZILKAN PLAYER — SÜRÜM NOTU v9.11.0

**Sürüm:** 9.10.0 → **9.11.0** (versionCode 91000 → 91100)
**Konu:** GPT'nin doğrulanan tespitleri + senin bildirdiğin regresyonların düzeltilmesi

---

## GPT analizi — koddan doğrulandı (büyük ölçüde DOĞRU)

| Tespit | Doğrulama | Düzeltildi mi |
|---|---|---|
| TvContext `storage` import edilmiyor | ✅ Doğru | ✅ Import eklendi |
| TvContext `TvLayout` tipi tanımsız | ✅ Doğru | ✅ `export type TvLayout` eklendi |
| splash-image.png = Emergent görseli | ✅ Doğru (SHA256 eşit) | ✅ KIZILKAN logosuyla değiştirildi |
| search prefilter Türkçe/fuzzy'yi öldürüyor | ✅ Doğru | ✅ normalize() ile düzeltildi |
| search 400 aday limiti | ✅ Doğru | ✅ 1500'e yükseltildi |
| tv-home araması literal includes | ✅ Doğru | ✅ normalize() eklendi |
| api.ts emergent FALLBACK_URLs | ✅ Doğru | ✅ Söküldü |
| api.catchupStream yok | ✅ Doğru | ✅ Cihaz-içi Xtream timeshift URL'i |

---

## Senin bildirdiğin sorunlar → çözüm

1. **TV columns → classic'e dönüyor:** TvContext `storage` importsuzdu; kaydetme
   patlıyordu. Düzeltildi → düzen artık kalıcı.
2. **Arama içerik bulamıyor:** prefilter "türkiye"yi "turkiye"ye çeviremiyordu;
   fuzzy'ye hiç ulaşmıyordu. normalize() iki tarafa da uygulandı.
3. **Açılışta Emergent logosu:** splash görseli Emergent'in kendisiydi; KIZILKAN
   ay-yıldız logosuyla değiştirildi (splash-image.png + app-image.png).
4. **Input OK→sonraki alan:** Xtream/Stalker alanları zaten zincirliydi; M3U URL
   alanına da eklendi. (TV kumanda OK'unun IME davranışı cihaza bağlı — gerçek
   TV'de test edilmeli.)
5. **catch-up:** olmayan api metodu yerine cihaz-içi timeshift URL'i.

---

## HÂLÂ AÇIK — dürüstçe (bir sonraki tur, planlı)

- **Şerit + görüntü renklenmesi:** 3 denemem tutmadı (siyah taban, çift Stack
  kaydı, kök arka plan). Artık kör deneme yapmayacağım. Öneri: player ekranına
  geçici bir **tanı katmanı** koyup (hangi View, hangi renk, hangi sınır) tek
  fotoğrafla kesin kaynağı bulmak; ya da senin dediğin gibi **player ekranını
  sıfırdan** temiz bir opak siyah kök üzerine kurmak.
- **Sütunlar arası kumanda geçişi (sol/sağ):** react-native-tvos
  `TVFocusGuideView` ile deterministik odak köprüsü gerekiyor; gerçek-cihaz
  testli iteratif iş.

Bu ikisi için bir sonraki turda net plan sunacağım.

## Not: denetleyici boşluğu
`storage is not defined` gibi "tanımsız modül değişkeni" hataları 8 denetleyiciden
kaçtı. Bir sonraki turda denetleyiciye bu sınıfı ekleyeceğim.
