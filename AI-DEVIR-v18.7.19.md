# AI DEVİR — v18.7.19 RC1 (dal `v18.7.19-rc1-stream-creds-persist`)

**Tarih:** 2026-10-06 · **Taban:** v18.7.18 · **Yazan:** Claude Opus
**Kaynak:** Cihaz kartı (18.7.18-dev) + tanı logu `kizilkan-diagnostics-2026-10-06T12-21-43`.

## KÖK NEDEN (log'dan KANITLANDI)
Kullanıcı: "kanal açtım, yine kullanıcı adı gözükmüyor." Log:
- `STALKER_RESOLVE_DONE.data.streamCredsFound = **true**`, `streamShape = {segCount:3, tail:[8/alnum, 10/alnum, 4/num], xtreamShape:true}` → **U4 çıkarma ÇALIŞIYOR** (kullanıcı adı 8 karakter, şifre 10).
- `STALKER_PLAYBACK_CONTEXT`: targetHost `panel-a.example:8080` (yayın), portalHost `panel-a.example:2095` (portal) — hostname aynı (`panel-a.example`), key eşleşiyor.
- Yani çıkarma başarılı, harita doluyor; AMA **kart oynatmadan sonra yeniden okumuyordu**: `magDerived` bir `useMemo`'ydu, Ayarlar sekmesi mount kaldığından (deps değişmediği için) boş haritayla hesaplanan `null` değerinde KALIYORDU. Kullanıcı akışı: önce Ayarlar (boş) → kanal aç (harita doldu) → Ayarlar'a dön (useMemo yeniden hesaplamadı) → "Belirlenemedi".

## Yapılan (3 düzeltme)
| # | Düzeltme | Dosya |
|---|---|---|
| **1 (asıl)** | Kart `magDerived` artık `state + useFocusEffect` ile ekrana her dönüşte yeniden okunur → kanal açıldıktan sonra kullanıcı adı görünür. | `settings.tsx` |
| **2** | Türetilen kimlik STORAGE'da (`kizilkan.streamCreds`) saklanır + açılışta `hydrateStreamDerivedCredentials` yüklenir → yeniden açılış/yeni kurulumda da kalıcı (bellek-içi harita kayboluyordu). | `stalker.ts`, `_layout.tsx` |
| **3** | MAC-only yedek key (host uyuşmazlığına karşı; getter host-özel key'i bulamazsa MAC ile bulur). | `stalker.ts` |

Değerler LOGLANMAZ (yalnız `streamCredsFound`+uzunluk). Kullanıcının kendi hesabı; storage cihaz-yerel.

## Doğrulama (PC)
- `yarn tsc --noEmit` → exit 0 · `node tools/denetle.js` → ✅ TÜM DENETİMLER TEMİZ · `check-v18719` PASS. Native değişiklik YOK.

## Cihazda test
panel-a'da bir kanal aç → Ayarlar'a dön → Kullanıcı Adı `ab3C4dEf` görünmeli. Uygulamayı kapat/aç → yine görünmeli (kalıcı).

## Bekleyen
Arka planda çalışma (plan onayı bekliyor); APK imza/anahtar (release güncelleme); katalog/açılış hız.
