# KIZILKAN PLAYER — SÜRÜM NOTU v9.7.0

**Sürüm:** 9.6.0 → **9.7.0** (versionCode 90600 → 90700)
**Konu:** Önizleme/ana oynatıcı çift ses + şerit/tint düzeltmesi, motor sheet kumanda odağı

---

## Test geri bildirimin (v9.6.0)

✅ İyi: ses+görüntü var, MAG düzenle/yenile çalışıyor, canlı önizleme geliyor.
❌ Sorun: OK'a basıp izlemeye geçince (1) üstte tema renkli şerit + görüntü o
renge boyanıyor, (2) **iki kanal sesi** aynı anda geliyor (önizleme + ana),
(3) motor seçim (VLC/Exo/Oto) sheet'inde kumanda çalışmıyor, seçilemiyor.

---

## Kök neden

**(1)+(2):** OK'a basınca /player açılıyor ama TV ana ekranı ARKADA kalıyor,
unmount olmuyordu → önizleme oynatıcısı çalmaya devam ediyordu. İki oynatıcı =
iki ses + iki TextureView yüzey çakışması (şerit/tint). "Zap'te şerit gidiyor
ama ses çift kalıyor" gözlemin tam bunu doğruluyordu (zap ana yüzeyi tazeliyor,
önizlemeye dokunmuyor).

**(3):** Alt-sayfa (sheet) bir RN Modal; açılınca içindeki hiçbir öğeye TV
odağı verilmiyordu + player'ın kumanda yakalayıcısı D-pad/OK'u kendine
çekiyordu → odak Modal'a giremiyor.

---

## Düzeltmeler

| # | Ne | Nasıl |
|---|----|-------|
| 1 | Çift ses / şerit / tint | `useFocusEffect` ile TV ekranı odaktan çıkınca (player üstte) önizleme **durur**; geri dönünce başlar. Tek oynatıcı kalır. |
| 2 | Sheet kumanda | Sheet açıkken `useRemoteKeys` **devre dışı** (`enabled = sheet===null`) → D-pad/OK Modal'a gider |
| 3 | Sheet odağı | Modal açılınca ilk öğe **otomatik odakta** (`autoFocus` → `hasTVPreferredFocus`): motor, hız, ses gecikmesi, tampon sheet'leri |

---

## Gerçek donanımda TEST (Öğretmenim)

1. Önizlemeden OK'a bas → izlemeye geç: **tek ses** geliyor mu? Şerit/tint
   gitti mi?
2. Zap yap → hâlâ tek ses, tek görüntü mü?
3. İzlerken menü aç → **Motor** → kumandayla Oto/VLC/Exo arasında gezip
   **seçebiliyor musun**?
4. Geri dönünce (kanal listesi) önizleme yeniden başlıyor mu?

**Dürüst not:** Şerit/tint'in kökü olarak "çift yüzey çakışması"nı işaret
ettim; önizlemeyi durdurmak bunu çözmeli — ama gerçek TV'de doğrulanmalı.
Eğer geçiş anında (OK'a basıp açılırken) çok kısa bir şerit hâlâ görünürse,
bir sonraki turda OK anında önizlemeyi anında kapatan ek bir önlem koyarız.

---

## Değişmeyen

Telefon davranışı ve önceki tüm düzeltmeler korundu. Hiçbir özellik çıkarılmadı.
