# 🚀 YENİ SOHBETE BAŞLARKEN

> **Bu dosyayı asistana ilk olarak okut.**
> Yeni sohbetteki asistan önceki konuşmayı HATIRLAMAZ.

## İLK MESAJ OLARAK ŞUNU YAZ

```
KIZILKAN PLAYER projesine devam ediyoruz.

1. Önce DEVIR-NOTU.md dosyasını oku
2. Sonra tools/ klasöründeki 8 denetleyiciyi çalıştır:
   cd frontend && node ../tools/denetle.js
3. Durumu bana özetle, sonra ne yapacağımızı konuşalım
```

## ASİSTANIN BİLMESİ GEREKENLER

| Belge | İçerik |
|---|---|
| **DEVIR-NOTU.md** | Sözleşme, mimari, çözülmemiş sorunlar, hata desenleri |
| **tools/README.md** | 8 denetleyici, nasıl çalıştırılır |
| **SURUM-NOTU-v9.4.0.md** | Son paketin ayrıntısı |

## KURULUM (asistanın yapması gereken)

Denetleyiciler TypeScript ayrıştırıcısına ihtiyaç duyar:

```bash
mkdir -p ~/verify && cd ~/verify && npm i typescript
```

Yol farklıysa tools/*.js içindeki require satırını güncelle.

## KRİTİK UYARILAR (asistana)

1. **"Hatasız" garantisi verme.** API imzalarını paket kaynağından doğrula,
   tahmin etme. Bu projede tahmine dayalı düzeltmeler çok zarar verdi.

2. **Her paketten önce denetle.js çalıştır.** Temiz değilse paketleme.
   Bu araçlar onlarca gerçek hatayı derleme öncesi yakaladı.

3. **Kullanıcı her denemede ~45 dakika derleme bekliyor.** Bu yüzden
   "bir de şunu dene" demek pahalı. Emin olmadığın şeyi açıkça söyle.

4. **Regresyon en büyük risk.** Çalışan bir şeyi bozmak, yeni özellik
   eklememekten çok daha kötü. Şüpheliysen geri al.

5. **Aynı hatayı iki kez yapma.** DEVIR-NOTU'ndaki "tekrarlanan hata
   desenleri" bölümünü mutlaka oku — o hatalar zaten yaşandı.

## PROJE DURUMU ÖZET

- **Telefon:** büyük ölçüde çalışıyor, kullanılabilir durumda
- **TV Box:** ciddi sorunlar var (ses var/görüntü yok, çökme, odak)
- **Sıradaki öncelik:** TV Box sorunları — kullanıcı ayrıca başka bir
  yapay zekâdan da fikir alıyor, TV dosyaları ayrı pakette verildi
