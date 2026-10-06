# AI DEVİR — v18.7.17 RC1 (dal `v18.7.17-rc1-discovery-copy-update`)

**Tarih:** 2026-10-06 · **Taban:** v18.7.16 `1629a8ae` · **Yazan:** Claude Opus
**Kaynak:** Cihaz DEV logu (v18.7.16-dev; goldensm32 4 keşif testi + hkpremium kanal açma) + kullanıcı istekleri.

## Cihaz kanıtı (v18.7.16-dev logundan)
- **U4 ÇALIŞTI:** hkpremium kanal açınca `STALKER_RESOLVE_DONE streamShape: segCount=3, tail=[8/alnum, 10/alnum, num], xtreamShape:true, credsFound:true`. Kullanıcı adı 8 karakter (=`ud3B3yRH`), şifre 10 karakter yayın adresinde. `STALKER_ACCOUNT_SNAPSHOT`: `login` alanı boş, hiçbir alan base64-metin değil → kullanıcı adı YALNIZ yayın adresinde.
- **Portal keşfi:** 4 test. (1) çoklu+sadece DNS → version.js portalı buldu ama API yollarına deadline'dan önce sıra gelmedi (`budget exhausted reason:deadline 6619ms`) → not-found. (2) çoklu+DNS:port → şans eseri yetişti (ready, valid:30) ama 4 dk. (3) çoklu+exact+`/c` → exact kati, `/c` API'ye çözülmedi (state:error). (4) tekli → çalıştı.
- **Güncelleme:** `PLAYLIST_REFRESH_DIFF` dizi 16800→6776 (10024 **silindi**, added:0) — yavaş sunucuda eksik çekim. `avgPageMs` 53↔10547ms (sunucu kaynaklı).

## Yapılanlar (Grup 1-6)
| Kod | Değişiklik | Dosya |
|---|---|---|
| **P1** | Portal version.js/xpcom ile doğrulanınca `MagDiscoveryBudget.grant(6000)` → bulunan API yolları deadline'dan önce denenir (garanti). grant paylaşılan host bütçesini de uzatır; iptal (cancelled) etkilenmez; yalnız HENÜZ durmamış bütçe uzatılır. | `magDiscoveryBudget.ts`, `magPortalDiscovery.ts` |
| **P2** | "Yalnız girilen" (exact) + ARAYÜZ yolu (`/c`, `/stalker_portal/c`, `/portal`, `/ministra/c`) → AYNI KURULUM içinde API çözülür (version.js/xpcom). Literal `.php` yol hâlâ kati; başka port/host/kuruluma taşmaz. | `magPortalDiscovery.ts` |
| **P3** | Paralellik 1–100 (`MAG_MAX_PARALLEL` 16→100). Girilen=çalışan (40→40, 70→70, 5→5, 100 tavan, 0/boş→mod varsayılanı). Giriş 3 haneli. Hem keşif hem hesap doğrulamada uygulanır (turbo 12 kırpması kalktı). | `magBulk.ts`, `mag-bulk.tsx` |
| **K1** | MAG kartında kullanıcı adı ÖNCE U4 stream değeri (`ud3B3yRH`). Eski sürümden kalan bayat `username`=name(`1787`) = display_name ise gösterilmez. | `settings.tsx` |
| **K2** | Hesap kartı (Sunucu/Kullanıcı Adı/Şifre/MAC) + düzenleme ekranı (Sunucu/Kullanıcı Adı/Şifre/MAC/Portal) **kopyala butonu** (expo-clipboard, kurulu). | `settings.tsx`, `edit-playlist.tsx` |
| **E1** | Tekli MAG eklemede görsel `CatalogPreparationModal` (Canlı/Film/Dizi kartları + süre + iptal). onProgress artık yapılandırılmış ilerleme de besler. Düz spinner modal kaldırıldı (iptal/geri tuşu korundu). | `add-playlist.tsx` |
| **G1** | **YIKICI DİFF KORUMASI:** otomatik yenilemede (forceUnconditional DEĞİL) bir tür mevcut Room sayısının yarısından aza düşüyorsa o türü patch'ten çıkar → Room'daki dolu katalog korunur (`MAG_REFRESH_SHRINK_GUARD`). Manuel tam yenileme guard'ı atlar. | `PlaylistContext.tsx` |
| **S1** | Flight Recorder geçmişi silinince "Tanılama geçmişi silindi" onay bildirimi. | `stats.tsx` |
| **M1** | Soğuk açılış ölçümü `APP_COLD_START` (modül yüklemeden splash gizlenmeye). Kanal ilk-kare zaten `FIRST_FRAME` ile ölçülü. | `_layout.tsx` |

## Kör düzeltme yapılmayanlar (dürüstlük)
- **G2 (süre):** Katalog sayfalama zaten paralel (PAGE_CONCURRENCY=6). Ölçüm (D, v18.7.16) `avgPageMs` 53↔10547ms gösterdi → yavaşlık SUNUCU kaynaklı. Kör concurrency artışı "1 kullanıcı" hesaplarda ban riski (§5) → YAPILMADI. G1 kaybı önler.
- **M1:** "İlk açılma hızlansın" için önce ölçüm (soğuk açılış + ilk kare); iyileştirme kanıttan sonra.

## Güvenlik
- U4 değerleri (kullanıcı adı/şifre) yalnız kartta gösterilir; loga/telemetriye YAZILMAZ (yalnız `streamCredsFound`+uzunluk). Kullanıcının KENDİ hesabı.
- TLS doğrulaması kapatılmadı. `stalker.ts`/`magPortalDiscovery.ts`'e üst düzey platform importu eklenmedi.

## Doğrulama (PC)
- `yarn tsc --noEmit` → exit 0 · `node tools/denetle.js` → ✅ TÜM DENETİMLER TEMİZ
- Yeni kapı `check-v18717` PASS. Kırılan kapılar düzeltildi: `check-v18714` (stalker-add-cancel→CatalogPreparationModal onCancel), `check-v18713` (P2 exact version.js), `check-v16146`/`check-v16147` (E1 onProgress), `test-mag-portal-discovery` (P2 yeni test).
- MAG testleri (discovery 21 grup/dev1/bulk/account/runtime/ownership) PASS. **Native değişiklik YOK.**

## Cihazda test edilecekler
1. **Portal keşfi:** goldensm32 → çoklu + sadece DNS + "Tüm adaylarda keşif" + otomatik → bulmalı (P1). Exact + `/c` → API çözmeli (P2). 100 paralel gir → 100 çalışmalı (P3, log `concurrency`).
2. **Kart kullanıcı adı:** hkpremium'da bir kanal aç → kart Kullanıcı Adı `ud3B3yRH` (1787 değil, K1). Kopyala butonları (K2).
3. **Tekli MAG ekleme:** görsel modal (Canlı/Film/Dizi + iptal, E1).
4. **Güncelleme:** yavaş sunucuda yenileme içeriği SİLMEMELİ (log `MAG_REFRESH_SHRINK_GUARD`, G1).
5. **Flight Recorder sil** → "silindi" bildirimi (S1). Soğuk açılış: log `APP_COLD_START.sinceModuleLoadMs` (M1).

## Bekleyen
U4 kalıcılaştırma (accountInfo'ya yazma, oturumlar arası); katalog hız iyileştirmesi (ölçümden sonra); ilk-açılış iyileştirmesi (M1 ölçümünden sonra); GPT G07-G10.
