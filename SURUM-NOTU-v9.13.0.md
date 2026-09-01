# KIZILKAN PLAYER — SÜRÜM NOTU v9.13.0

**Sürüm:** 9.12.1 → **9.13.0** (versionCode 91201 → 91300)
**Konu:** Şerit tanı katmanı + arama alaka düzeltmesi + Sunucu Kodu ile giriş

---

## 1) ŞERİT TANI KATMANI (geçici)

4 denemem tutmadığı için artık kör tahmin yok — ÖLÇÜYORUZ. Player'a geçici bir
renkli tanı katmanı eklendi (`DEBUG_STRIP = true`):
- **Magenta çizgi:** ekranın en tepesi (y=0)
- **Cyan band + yeşil alt çizgi:** güvenli-alan (status bar) inset'i, px değeriyle
- **Sarı kenarlık:** kök View sınırı
- **Metin kutusu:** inset değerleri, motor (Exo/VLC), yüzey tipi, kontrol durumu

**YAPMANI istediğim:** Bir kanal aç, şerit göründüğünde **fotoğraf çek**. Şerit
hangi banda denk geliyor (cyan safe-top? sarı kök kenarı? başka yer?) — bana
gönder, kaynağı KESİN bulup kalıcı çözerim. Sonra bu tanı katmanı kaldırılacak.

## 2) ARAMA ALAKA DÜZELTMESİ

v9.12'de prefilter'ı subsequence yapmıştım; çok gevşekti ("sakin" → "Şaka Bi'
Yana" gibi çöp). Normalize'lı **substring**'e döndürüldü: Türkçe toleransı korunur
(türkiye↔turkiye), alaka geri gelir, çöp gider.
*(Eksik-harf fuzzy'si ileride ön-normalize indeksiyle güvenle eklenecek.)*

## 3) SUNUCU KODU İLE GİRİŞ (yeni, ekstra seçenek)

Oynatma listesi ekle → yeni **"Sunucu Kodu"** kaynağı. Kullanıcı sadece:
**Panel Kodu + Kullanıcı Adı + Şifre** girer.
- Yeni çözücü `src/utils/serverCode.ts`:
  `{kaynak}/Master/zeroWebServers/{KOD}.json` → panel adı →
  `{kaynak}/Master/Servers/{panel}.json` → Hosts → **ilk çalışan DNS** seçilir
  (xtreamLogin ile denenir) → standart Xtream listesi oluşturulur.
- **Kaynak URL varsayılanı SENİN adresin** (gömülü, hazır) ama "Kod kaynağı
  (gelişmiş)" ile değiştirilebilir; girilen değer hatırlanır.
- Hata mesajları: kod bulunamadı / DNS yok / hiçbiri çalışmadı / bağlantı.

**Yaşlı kullanıcı senaryosu:** APK'da kaynak zaten dolu gelir. Kullanıcı bir kez
kod+kullanıcı+şifre girer, liste kaydolur. DNS değişse bile sen kendi kaynağını
güncellersin; onların telefonunda hiçbir şey değişmez. Eve gitmek/APK derlemek yok.

> Not: Kaynak sabit gömülü DEĞİL — senin varsayılanınla gelir, değiştirilebilir.
> Böylece belirli bir üçüncü-taraf adresine kilitli olmayan, senin kontrolünde
> genel bir çözücü olur.

---

## TEST (Öğretmenim)
1. **Şerit fotoğrafı:** hangi banda denk geliyor? (asıl amaç)
2. Arama: "sakin" artık alakalı sonuç veriyor mu? (çöp gitti mi?)
3. Sunucu Kodu: kod+kullanıcı+şifre ile liste ekleniyor mu? Yanlış kodda uygun
   uyarı geliyor mu?

## Değişmeyen
Telefon davranışı ve önceki düzeltmeler korundu. Tanı katmanı GEÇİCİ; kaldırılacak.
