# AI DEVİR — v18.7.41 RC1

- **Tarih:** 25.11.2026
- **Dal:** `v18.7.41-rc1-merge-dns-audio-freeze` (taban: `v18.7.40-rc1-link-test-tools`)
- **Kaynak:** 25.11.2026 canlı cihaz oturumu (DEV, telefon 86e8bc80) + kullanıcı ekran görüntüleri.
- **Kapsam:** Tümü TypeScript/JS. **Native (Kotlin) değişiklik YOK** → `assembleDebug` derleme için zorunlu değil,
  ama §7 "derleme geçti ≠ çalışıyor" gereği DEV cihazda açılış/işlev kabulü ayrı.

---

## Oturum teşhisi (kanıt)

Kullanıcı DEV sürümünü telefona kurdu, içeriğe baktık. Cihaz + DB kanıtı:

| Belirti | Kök neden (kanıt) | Sonuç |
|---|---|---|
| Butonlar yavaş / ANR | DB **~2.5 GB**, **1.83M** öğe, **33 hesap** — çoğu kopya (combo'dan aynı hesap defalarca, her biri tam katalog kopyası; birçok `pl-hit` aynı 71.962 sayısında) | #1 birleştirme |
| Görüntü açılmıyor (hem Media3 hem MPV) | HTTP **456** = sağlayıcı IP bloğu / bağlantı limiti (uygulama hatası değil) | Düzeltilmez (sağlayıcı) |
| Açılış yavaş (10–17 sn) | Ağ bağımlı: mobil veri **5.3 Mbps** → yavaş; WiFi **63.7 Mbps** → hızlı. `resolve` yalnız ~300 ms | Düzeltilmez (ağ) |
| Bazı dizilerde ses yok | Media3 yazılım kod çözücü **AC3/DTS** çözemiyor (AAC çalışıyor); MPV/ffmpeg çözer | #2 |
| Liste güncelleme çok uzun (Resim 1: 72.696 film, 43 sn, "Room kaydı 0/72696") | Çekme zaten tek Xtream çağrısı (hızlı). Darboğaz **native Room yazma**: `insertCollection` her öğeyi `rawJson=obj.toString()` (tam JSON) + 6× `normalizeSearch` searchText ile, üstelik şişkin DB'ye yazar | #1 (DB küçült); derin native ayrı build |
| Tanılama butonlarında yazı taşması (Resim 2) | 4 buton tek satırda `flex:1` (~90px) → "Flight Recorder Raporunu Paylaş" 4 satıra sarıp dışarı taşıyor | #5 |

---

## Bu sürümde yapılanlar

### #1 — Aynı hesapları birleştir (önizleme + onay, SEÇENEK A)
Combo'dan defalarca eklenen AYNI hesabın kopya listelerini tek hesapta toplar; **DB küçülür**.
- **Yeni `src/utils/playlistMerge.ts`** (saf util):
  - `accountMergeKey(pl)` — stalker: `mag|<mac>|<panelName>`; xtream: `xt|<user>|<pass>|<panelName>`.
    **KRİTİK (kullanıcı uyarısı):** anahtar **panel kimliğini içerir** → yalnız user:pass'e bakmaz; aynı
    kullanıcı adı/şifre farklı panelde ise **birleşmez**. Kimlik yoksa `null` (gruplanmaz).
  - `findDuplicateGroups(playlists)` — 2+ üyeli gruplar; birincil = en çok doğrulanmış host'u olan, eşitse en güncel.
  - `hostsOf(pl)` — tüm DNS (primary + yedek + validatedHosts / stalkerPortal + backupPortals), `normalizeHost` ile.
  - `mergedBackupHosts(group)` — tüm üyelerin DNS'leri eksi birincilin adresi → **sınırsız yedek**.
- **Yeni `src/utils/libraryMerge.ts`** — `mergeLibraryScopes(profileId, fromIds, toId)`:
  kopya listelerin favori/izlendi/kaldığın yer/izleme-listesi/gizli verisini `@list:encode(fromId):X` →
  `@list:encode(toId):X` olarak **silmeden önce** birincile taşır (hedefte varsa ezmez). Aynı hesap/panel
  olduğu için itemId'ler birebir eşleşir.
- **Yeni `src/components/DuplicateMergeModal.tsx`** — önizleme + onay. Gruplar listelenir; birincil yıldızlı
  ("korunacak", tiklenemez); kopyalar varsayılan seçili (tiki kaldırınca o üye birleşmeden çıkar — farklı panel
  olabilir). "N kopyayı birleştir" butonuna basınca: (1) yedek DNS'leri birincile yaz, (2) kütüphaneyi taşı,
  (3) kopya listeleri (katalog dahil) `removePlaylist` ile sil. Telemetri `DUPLICATE_MERGE_DONE/ERROR`.
  **Otomatik/sessiz silme YOK** (Seçenek A).
- **Bağlama `app/(tabs)/settings.tsx`** — `PlaylistDnsControls` altında `dupGroups.length>0` ise
  "Aynı hesapları birleştir (N kopya)" butonu (`merge-duplicates-btn`); modal mount edildi.

### #2 — Media3 sessiz → MPV (`src/player/PlayerHost.tsx`)
`emitMedia3Audio` içinde: `readyToPlay` aşamasında kullanılabilir ses parçası yoksa (`audioCount===0` ya da
`suspectSilent`) **yalnız Auto modda**, video beklenen içerikte, **kanal başına bir kez** (`audioFallbackTriedRef`),
MPV kullanılabilirse → `setEngine("mpv")` + retry. Telemetri `MEDIA3_AUDIO_FALLBACK_MPV`.
- **Sınır/dürüstlük:** oturum motorunu MPV'ye çevirir (storage'a yazılmaz → uygulama yeniden açılınca Auto'ya döner).
  Kullanıcı Media3'ü ELLE seçtiyse dokunmaz. Bu olay zaten yalnız Media3 aktifken fırlar → MPV'ye geçince döngü yok.

### #3 — Toplu/Link Test büyük dosya donması (`src/utils/linkTest.ts`, `app/link-test.tsx`)
`extractXtreamLinksAsync(text, {signal,onProgress,chunk})` — ~1500 eşleşmede bir event loop'a yield eden
(`setTimeout 0`), iptal edilebilir async ayıklama; `{links,totalUrls,duplicates,aborted}` döner. Eski senkron
`extractXtreamLinks` kapı uyumu için korundu. Ekranda metin ≤50000 ise senkron, değilse async + ilerleme
("Linkler ayıklanıyor… %X · N bulundu"); hiç bulunmazsa net mesaj. `extracting` durumu + `extractAbortRef`.

### #5 — Tanılama butonu yazı taşması (`app/stats.tsx`)
4 buton tek `flexDirection:"row"` + `flex:1` ile taşıyordu. Paylaş butonu **tam-genişlik tek satır**
(`numberOfLines={1}`), MD/CSV/Temizle **ikinci satır** (`numberOfLines={2}`). Mantık değişmedi.

### Player DNS failover — zaten mevcut
`PlayerHost` `playbackCandidates` + `alternateHostUrls` ile oynatmada bir DNS ölünce 2./3./4. yedeği
sırayla dener (`SOURCE_RETRY_KINDS`). Kullanıcı isteği zaten karşılanıyor → yeniden kodlanmadı.

---

## #4 — Liste güncelleme hızı: dürüst karar (bu sürüme KONMADI)
Resim 1 kanıtı: çekme zaten tek Xtream çağrısı (hızlı). Takılan şey **native Room yazma** (72.696 tam-JSON satır),
2.5 GB / 1.83M satırlık şişkin DB'de daha da yavaş. **İlk kaldıraç #1 dedup** (DB'yi küçültür). Derin native kazanç
(satırda `rawJson` saklamamak → şema değişikliği + migration; veya ilerleme sayacını native geri çağrı ile
artırmak) **ayrı, riskli bir build**. Kör düzeltme yok: önce cihazda #1 sonrası `saveElapsedMs`'i ölç, sonra karar ver.

---

## Doğrulama (PC)
- `yarn tsc --noEmit` → **PASS** (21–30 sn).
- `node tools/check-v18741-release.js` → **PASS**.
- `node tools/check-v18705-release.js` → **PASS** (#2 refaktörü shorthand yapmış, `audioCount:`/`suspectSilent:`
  açık biçime çevrildi; **tuzak:** mevcut gate'ler alanları `ad:` biçimiyle arar, obje shorthand'e çevirince kırılır).
- `node tools/denetle.js` → **✅ TÜM TEMİZ** (139 kapı).

## Cihaz kabulü
**YAPILMADI** (bu notta). Native değişiklik yok ama JS davranışları (birleştirme gerçek silme + kütüphane taşıma,
MPV geçişi, async ayıklama) cihazda test edilmeli. Özellikle **#1 birleştirme gerçek listeleri siler** → DEV
verisiyle önce birkaç kopya hesapta denenmeli; birleştirme sonrası favori/izlendi korunuyor mu, yedek DNS'ler
oynatmada devreye giriyor mu doğrulanmalı.

## Teslim (doldurulacak)
- Commit: `<doldurulacak>`
- Push: dal `v18.7.41-rc1-merge-dns-audio-freeze`
- CI (manuel, tip release): `<run doldurulacak>`
- DEV APK / kurulum (86e8bc80): `<doldurulacak>`

## Açık / riskli
- #1 birleştirme geri alınamaz (kopya listeler silinir). Seçenek A önizlemesi bunu kullanıcı onayına bağlar;
  yine de yanlış grup birleşirse o hesabın ayrı katalogları gider (kimlikler aynı olduğu için içerik aynıdır).
- #2 oturum-global MPV: bir "ses yok" içerikten sonra oturum boyunca MPV'de kalır (kanal başına guard var ama
  motor oturum-global). Yeniden açılışta Auto'ya döner.
- #4 asıl native yazma optimizasyonu ertelendi.
