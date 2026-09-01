# KIZILKAN PLAYER — SÜRÜM NOTU v9.10.0

**Sürüm:** 9.9.0 → **9.10.0** (versionCode 90900 → 91000)
**Konu:** EPG sütun hizası + strip için yeni (dürüst) deneme

---

## Test geri bildirimin (v9.9.0)

- ✅ 4K açıldı (otomatik SurfaceView tuttu)
- ✅ Diğer kanallar normal, ✅ çökme yok
- ❌ Şerit + görüntü renklenmesi **DEVAM** (zap/panel açınca geçiyor)
- ⚠️ Sütunlar arası kumanda geçişi bazen olmuyor; bir kez odak tamamen kayboldu
- ⚠️ EPG sütunu kanallarla hizasız (bir satır yukarıda) + EPG bilgisi yok

---

## 1) EPG sütun hizası (kesin, koddan)

**Neden:** Kanal sütununda listenin üstünde **önizleme + arama kutusu** var.
- EPG başlığı yalnızca önizlemeyi telafi ediyordu, arama kutusunu (52px) değil
  → EPG bir satır yukarıda.
- Kanal satırı 52px, EPG satırı `minHeight:44` → aşağı indikçe kayıyordu.

**Çözüm:** EPG başlığı artık önizleme + arama kutusunu birlikte telafi ediyor;
EPG satırı kanal satırıyla aynı yükseklikte (52px).

> "EPG bilgisi yok" muhtemelen **veri**: bu liste (Dert/Xtream) için EPG kaynağı
> (XMLTV/Xtream EPG) yoksa "—" görünür. Hiza düzeldi; veri gelirse dolacak.

## 2) Strip / görüntü renklenmesi — YENİ teori (dürüstçe: önceki denemelerim tutmadı)

4K kanal artık **SurfaceView** kullanıyor (otomatik geçiş). SurfaceView pencerede
"delik" açar; **deliğin altındaki pencere/kök arka planı tema renkliyse** video
o renge boyanır ve tepede şerit olur. Zap/panel bir yeniden-kompozisyon tetikleyip
geçici olarak temizliyor — gözlemlerinle tutarlı.

**Deneme:** Kök/pencere arka planı **siyaha** sabitlendi (`expo-system-ui` +
`backgroundColor:#000000` + kök view siyah). Delik açılsa bile altından siyah
görünür, tema rengi değil.

**Dürüst not:** Bu, şerit için ÜÇÜNCÜ denemem. Öncekiler (siyah taban katmanı,
çift Stack kaydı) tutmadı. Bu teori SurfaceView delik-delme mekaniğiyle mantıklı
ama **yine gerçek cihazda doğrulanmalı.** Tutmazsa, artık kör deneme yapmayı
bırakıp ekrana canlı bir "tanı katmanı" (hangi View nerede) koyup kökü birlikte
bulmayı öneriyorum.

---

## Bu turda YAPILMAYAN (dürüstçe)

**Sütunlar arası gezinme / odak kaybı:** Bu, react-native-tvos'ta TVFocusGuideView
ile çözülen, gerçek-cihaz testli iteratif bir iş. Kör dokunmak "odak tamamen
kayboldu" durumunu kötüleştirebilir. Ayrı, odaklı bir tur olarak ele almak
istiyorum. Yardımcı olacak tek bilgi: **hangi geçiş** en çok sorunlu —
- kanal listesinden SOL sütunlara (kategoriler) mı,
- yoksa kanal ↔ EPG arası mı,
- yoksa üstteki bölümler (CANLI/FİLM/DİZİ) arası mı?

Bunu bilirsem TVFocusGuideView'ı doğru yere koyarım.

---

## TEST (Öğretmenim)
1. EPG sütunu artık kanallarla **aynı hizada** mı?
2. Şerit/renklenme **kalktı mı**? (SurfaceView kanalında özellikle)
3. Telefon + diğer kanallar normal mi?
