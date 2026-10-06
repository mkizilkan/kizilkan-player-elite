# AI DEVİR — v18.7.19 RC1 (dal `v18.7.19-rc1-stream-creds-persist`)

**Tarih:** 2026-10-06 · **Taban:** v18.7.18 · **Yazan:** Claude Opus
**Kaynak:** Cihaz (v18.7.18-dev) hesap kartı ekran görüntüsü — Şifre görünüyor, Kullanıcı Adı "Belirlenemedi".

## Kanıt / kök neden
hkpremium kartı (v18.7.18-dev, kopyala butonları çalışıyor = K2 tamam):
- Şifre: `vtRSvSDdnl` (GÖRÜNÜYOR) · Kullanıcı Adı: **Belirlenemedi** · Görünen Ad: 1787 · MAC: 00:1A:79:30:3A:A7
İkisi aynı kaynaktan gelseydi ikisi de görünürdü. Çıkarım (kod + U2 kanıtı):
- **Şifre `accountInfo`'dan** geliyor (portal `get_profile.password` = vtRSvSDdnl; U2 fieldShapes'te `password` alanı var). Kalıcı.
- **Kullanıcı adı yalnız oynatma URL'inden** (U4) gelebiliyor çünkü portal `login` alanı BOŞ. Eski U4 haritası BELLEK-İÇİ idi → yeni kurulumda/yeniden açılışta kayboluyordu → "Belirlenemedi".

## Yapılan
| Değişiklik | Dosya |
|---|---|
| **U4 kalıcılaştırma:** türetilen kullanıcı adı/şifre storage'da (`kizilkan.streamCreds`) saklanır; açılışta `hydrateStreamDerivedCredentials` ile belleğe yüklenir; türetme anında (`stalkerResolveStream`) `persistStreamDerivedCreds` yazar. Bir kez kanal açınca kart her açılışta gösterir. Değerler LOGLANMAZ (yalnız `streamCredsFound`+uzunluk telemetrisi). Kullanıcının kendi hesabı; storage cihaz-yerel. | `stalker.ts`, `_layout.tsx` |

## Davranış
Bu sürümde **hkpremium'da bir kanal açılınca** kullanıcı adı (`ud3B3yRH`) türetilir, KAYDEDİLİR ve sonraki açılışlarda da görünür. Yeni kurulumda storage boş olduğundan ilk görüntüleme için bir kez kanal açmak gerekir; sonrası kalıcı.

## Doğrulama (PC)
- `yarn tsc --noEmit` → exit 0 · `node tools/denetle.js` → ✅ TÜM DENETİMLER TEMİZ · `check-v18719` PASS. Native değişiklik YOK.

## Cihazda test
hkpremium'da bir kanal aç → Ayarlar → kart: Kullanıcı Adı `ud3B3yRH`. Uygulamayı kapat/aç → yine `ud3B3yRH` görünmeli (kalıcı).

## Bekleyen
Arka planda çalışma (plan onayı bekliyor, native foreground service); APK imza/anahtar eşitleme (release güncelleme sorunu); katalog/açılış hız (ölçümden sonra).
