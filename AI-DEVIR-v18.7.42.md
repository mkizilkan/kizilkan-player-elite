# AI DEVİR — v18.7.42 RC1

- **Tarih:** 26.11.2026
- **Dal:** `v18.7.42-rc1-merge-servercodes-identity` (taban: `v18.7.41-rc1-merge-dns-audio-freeze`)
- **Kaynak:** 26.11.2026 canlı cihaz oturumu — DEV (`com.gpt.kizilkan.player.dev`) deposundan (RKStorage)
  22 liste satır satır incelendi; kullanıcı endişeleri + ekran görüntüsü.
- **Kapsam:** Tümü TypeScript/JS. **Native (Kotlin) değişiklik YOK.**

---

## Oturum teşhisi (DEV deposundan gerçek kanıt)

DEV'deki 22 Xtream listesi `accountInfo.exp_date + created_at` ile incelendi. Sonuç: **15 liste aslında yalnız 2 hesap.**

| Hesap | kaç liste | kanıt (hepsinde aynı) | durum |
|---|---|---|---|
| `drmtv43_418080` | **11** | exp_date=1805125263 (15.03.2027), created_at=1773589263 | 11 farklı mağaza adıyla (4K ULTRA, D Z D STORE, IMPAKT TV, dannly, …) aynı abonelik |
| `efebey1112` | **4** | exp_date=1798481579 (28.12.2026), created_at=1703695325 | 4 farklı panel adıyla aynı abonelik |

**Kök sorun:** v18.7.41 birleştirme anahtarı `xt|user|pass|panelName` → her panelin adı farklı olduğu için
11 liste = 11 ayrı anahtar → **hiçbiri birleşmiyordu.** panelName sadece mağaza etiketi; aynı abonelik 11 kez
relabel edilmiş. Gerçek kimlik `exp_date + created_at`'tir.

**Ekran görüntüsündeki birleşenler (Titan 2028, KIZILKAN-KURTARMA):** `serverCodeBinding=null` (urls.txt dosya
importu) → hiç sunucu kodu yoktu, kaybolan yok; statik DNS'leri yedek olarak korundu.

**Sunucu kodu olan listeler [6–21]:** `serverCodeBinding.sources[].realCode` içinde her panelin kodu var
(ör. dannly=006, IMPAKT=55880, Qruze=8811, Kalite=661), çoğu iki firebase kaynağında (splayer+masteriptv).

---

## Bu sürümde yapılanlar (hepsi kullanıcı onaylı, tek sürüm)

### #1 — Kimlik ölçütü yeniden tasarımı (`src/utils/playlistMerge.ts`)
- **`accountMergeKey`** artık panelName DEĞİL, gerçek kimlik: `credentialKey (user+pass / MAC)` + `accountIdentitySig
  (exp_date|created_at)`. Kimlik yoksa yalnız user+pass'e düşer (doğrulanmamış liste yedeği).
- **`findDuplicateGroups`** iki düzeyli: önce user+pass (veya MAC) kovası — **sunucu/DNS'e hiç bakılmaz**; kova
  içinde ≥2 **farklı** (exp_date,created_at) imzası varsa gerçekten farklı hesaplardır → imzaya göre bölünür;
  kimliği bilinmeyen üye kanıtsız birleştirilmez (tek kalır). Tek/boş imza → tek grup.
- **Birincil = en zengin katalog** (`catalogScore` = canlı+film+dizi) → en çok DNS → en güncel. (Dizi=0 kopya
  birincil kalıp seri kataloğunu kaybetmesin: DEV'de [13] IMPAKT dizi=37149 birincil olur, 108 DNS'li [21] yedek.)
- **Kullanıcı sorusu "farklı DNS'le eklenen Xtream hesaplar da girer mi?":** EVET — gruplama sunucu/DNS'e bakmaz,
  kimliğe bakar; farklı DNS yalnız yedek olur. accountInfo'su olan elle-eklenmiş hesaplar da (indis 2-5,10) girer.

### #1 — Sunucu kodlarını birleştir (asıl endişe: kod kaybı)
- **`mergedServerCodeSources(group)`** — gruptaki TÜM üyelerin `serverCodeBinding.sources`'larını tekilleştirip
  (baseUrl+panelName+realCode) birleştirir; sources yoksa codeSource+panelName'den origin türetir.
- **`buildMergedServerCodeBinding(group)`** — birincilin binding'i tohum, `sources` = tüm panellerin birleşimi,
  `validatedHosts` = tüm doğrulanmış hostların birleşimi, `autoResolve=true`, `allowDirectoryAlternatives=true`.
- **Sonuç:** birleşik tek liste, DNS ölünce `resolveBoundPanel` (serverCode.ts) **11 panelin hepsini paralel**
  sorar → hangisi önce taze DNS yayınlarsa oradan çeker. Tek panel yerine tüm panel kodları arkada çalışır.
- **Ölü DNS politikası:** silinmez, yedekte kalır; oynatıcı failover (playbackCandidates) biri patlayınca sona
  atar; canlı havuz her zaman kaynak kodların getirdiği taze listeyle tazelenir (kendi kendini onarma).

### #2 — Modal UI (`src/components/DuplicateMergeModal.tsx`)
- `buildMergedServerCodeBinding` birleştirmede birincile yazılır (kod korunur).
- **Safe-area alt boşluk + sabit alt bar** → "Birleştir" butonu navigasyon çubuğunun altında kalmaz, hep görünür.
- **Net istatistik:** "X hesap birleştirildi · Y kopya silindi · Z kaldı" (`merge-stats`) + **ilerleme çubuğu** (%).
- Üye kartında içerik sayısı da gösterilir.

### #3 — "Aynı Hesap Analizi" butonu + öneri şeridi (`app/(tabs)/settings.tsx`)
- Buton **her zaman görünür** (başlık altında, aktif listeden bağımsız) → kullanıcı istediği an analiz eder.
- Kopya varsa **kapatılabilir uyarı şeridi** (`merge-banner`): "N kopya liste bulundu · İncele". `dupGroups`
  playlists'e bağlı → **yedekten yükleme / çoklu ekleme / tekli ekleme sonrası** otomatik yeniden hesaplanır
  (kullanıcının istediği tetikleme noktaları). Kapatılınca, yeni kopya eklenip sayı artınca tekrar görünür.
- Otomatik/sessiz birleştirme YOK (Seçenek A korunur).

---

## Doğrulama (PC)
- `yarn tsc --noEmit` → **PASS** (21,8 sn).
- `node tools/check-v18742-release.js` → **PASS**.
- `node tools/check-v18741-release.js` → **PASS** (regresyon: v41 birleştirme/#2/#3/#5 korundu).
- `node tools/denetle.js` → **✅ TÜM DENETİMLER TEMİZ**.
- PC DEV `assembleDebug` → **BUILD SUCCESSFUL in 4m 25s** (26.11.2026 10:27). `app-debug.apk` 460.2 MB.

## Cihaz kabulü
- **Kurulum YAPILDI (26.11.2026):** Poco X3 NFC (`86e8bc80`), `adb install -r` (veri korundu) → **Success**.
  versionName **18.7.42-dev**. Soğuk açılış: süreç ayakta (PID alındı), logcat'te **FATAL/crash YOK** → açılış sağlam.
- **Kalan (işlev kabulü — kullanıcı yapacak):** #1 birleştirmeyi DEV'de kopya hesapta dene → favori/izlendi korunuyor
  mu, sunucu kodları yedeğe taşındı mı, DNS ölünce tazeleme çalışıyor mu, birincil en zengin katalog mu seçildi.

## Teslim
- Commit: <doldurulacak>
- CI: <doldurulacak>
- DEV APK: cihazda kurulu (18.7.42-dev)

## Açık / riskli
- #1 birleştirme geri alınamaz (kopya listeler silinir); Seçenek A önizlemesi kullanıcı onayına bağlar.
- Birincil seçimi en zengin katalogu tutar; yine de kullanıcı önizlemede yanlış görürse tiki kaldırabilir.
- Öneri şeridi yalnız Ayarlar ekranında görünür (ana ekran/home'a eklenmedi — riski sınırlı tutmak için).

## 🔴 Kalıcı tuzak (bu oturumda doğrulandı)
- **Birleştirme ölçütü panelName OLMAZ.** Aynı abonelik farklı mağaza adıyla (farklı panelName) N kez gelebilir.
  Gerçek kimlik `accountInfo.exp_date + created_at`. panelName yalnız gösterim/sources etiketi.
- **Birleştirmede `serverCodeBinding.sources`'ı birleştir** — yoksa diğer panellerin otomatik DNS tazelemesi kaybolur.
