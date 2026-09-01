# KIZILKAN PLAYER — SÜRÜM NOTU v9.12.1

**Sürüm:** 9.11.0 → **9.12.1** (versionCode 91100 → 91201)
**Konu:** GPT'nin doğrulanan v9.11 listesinin tamamı + player şerit rebuild

Bu sürüm GPT'nin ikinci incelemesinde işaret ettiği (ve koddan doğruladığım)
TÜM açık maddeleri kapsıyor.

---

## 1) Zemin sağlamlaştırıldı (en kritik — bug'lar bu yüzden kaçıyordu)

- **Denetleyiciler taşınabilir:** 8 checker'ın hepsi `/home/claude/verify/...`
  sabit yolunu kullanıyordu → başka makinede çalışmıyordu. Artık `tools/_ts.js`
  ile projenin kendi `node_modules`'ından TypeScript'i çözüyor (sabit yol yok).
- **CI kapısı:** GitHub Actions'a APK'dan ÖNCE `node ../tools/denetle.js`
  (HARD gate) + `tsc --noEmit` (raporlayıcı) eklendi. `storage is not defined`
  gibi hatalar artık build'den kaçamaz. *(TvContext hatamın gemiye binme sebebi
  buydu.)*

## 2) Player şerit/tint — rebuild (4. deneme, dürüstçe)

- **Stack animasyonu `fade` → `none`:** fade sırasında altındaki temalı sekme
  navigatörü sızıp şerit bırakıyordu; anında opak geçiş bunu keser. *(Asıl
  şüphem bu.)*
- **Render kökü temizlendi:** düz opak siyah kök (`playerRoot`), merkezleme yok,
  tek taban, video `collapsable={false}`.
- **Dürüst not:** Bu 4. denemem; mantıklı ama **gerçek TV'de doğrulanmalı.**

## 3) Arama + catch-up

- **Gerçek fuzzy geri geldi:** prefilter substring yerine **subsequence** —
  "brking bad" → "breaking bad", "trtck" → "TRT Çocuk" artık fuzzy'ye ULAŞIR.
- **catch-up tek merkez:** `iptv.ts → buildXtreamTimeshiftUrl` (URL-encode dahil).
  Hem `catchup.tsx` hem `epg-timeline.tsx` aynı kaynağı kullanıyor (kopya kalktı).
- **M3U/isim OK→sonraki alan:** isim alanı ilgili ilk alana (link/server/portal)
  geçiyor. *(TV kumanda OK'unun IME davranışı cihaza bağlı — gerçek TV'de test.)*

## 4) TV odak

- **TVFocusGuideView:** sütun satırı sarıldı (fork'ta var, yoksa View). Sütunlar
  arası odak kaybını azaltır. *Additive güvenlik ağı; tam deterministik grafik
  gerçek cihaz iterasyonu ister.*
- **useFocusScroll:** artık HER odakta re-center yapmıyor; son ortalanan indeksin
  görünür penceresi (±4) içindeyse kaydırmıyor (çift hareketi keser).
  Failure yolu da animasyonsuz.

## 5) Emergent + belge temizliği

- **backend/requirements.txt:** `emergentintegrations` + Emergent-hosted `litellm`
  kaldırıldı (kodda import yok — doğrulandı).
- **tv.ts yorumu:** "fork'u KULLANMIYORUZ" yanlış açıklaması, gerçek mimariyle
  (fork KULLANILIYOR) düzeltildi.

---

## Gerçek donanımda TEST (Öğretmenim)
1. **Şerit/tint kalktı mı?** (animation none + temiz kök — asıl merak)
2. Arama: eksik harfli sorgu ("brking bad") sonuç veriyor mu?
3. Sütunlar arası sol/sağ geçiş iyileşti mi? Odak kayboluyor mu hâlâ?
4. Kanal listesinde gezinirken "ağır çekim" azaldı mı?
5. Telefon: her şey normal mi? (regresyon)

## Dürüst sınırlar
- Şerit (#2) ve TV odak (#4) donanım-bağımlı; doğrulaman şart.
- `tsc --noEmit` CI'da şimdilik raporlayıcı (eski tip gürültüsü build'i kırmasın);
  proje tsc-temiz olunca HARD gate'e çevrilebilir.
