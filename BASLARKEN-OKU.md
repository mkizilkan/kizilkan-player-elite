# BAŞLARKEN OKU — KIZILKAN PLAYER ELITE v15.0.4

Yeni sohbet / yeni yapay zekâ / yeni geliştirme oturumunda önce şu sırayla oku:

1. `AI-PROJE-DEVIR-BAGLAM.md` — ana ve en ayrıntılı proje bağlamı
2. `DEVIR-NOTU.md` — kısa güncel durum
3. `SURUM-NOTU-GPT-ELITE-v15.0.4.md`
4. `REGRESYON-DENETIM-GPT-ELITE-v15.0.4.md`
5. `SURUM-NOTU-GPT-ELITE-v15.0.0.md` — v15 Playback Core ana mimarisi

## Değişmez çalışma ilkesi
- Özellik/regresyon kaybı yok.
- Yapılmayan test yapılmış gibi söylenmez.
- Büyük geliştirme öncesi plan/onay.
- Her paket sürüm yükseltir.
- Her paket `AI-PROJE-DEVIR-BAGLAM.md` belgesini günceller.
- Signing secret/private key repo ve dokümanlara yazılmaz.

## Güncel kritik hedef
v15.0.4 ile v15.0.3'te gerçekten üretilmiş APK'nın son certificate fingerprint gate'i düzeltilmektedir. `ANDROID_CERT_SHA256` GitHub Secret eklenip CI tamamen yeşil olana kadar build tamamlandı sayılmaz.

## Sonraki plan
v15.0.4 build + temel cihaz testi tamamlandıktan sonra ayrı plan/onay ile libmpv `1.0.0` instance API migration değerlendirilecektir.
