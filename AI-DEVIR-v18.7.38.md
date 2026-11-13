# KIZILKAN PLAYER ELITE v18.7.38 RC1 — Düzenleme ekranı klavye kaydırması (#2b)

Tarih: 13 Kasım 2026. Dal: `v18.7.37-rc1-add-account-ux-speed` üstüne (aynı dal, yeni patch).
Taban: `bdc8666c` (v18.7.37). Kaynak: **13.11.2026 cihaz oturumu** — kullanıcı v18.7.37-dev'i
kurup "Oynatma listesini düzenle → Kullanıcı adı"na dokununca klavye alanı örttü (şifre/MAC/seri de aynı).

## 1. Kök neden (koddan kanıtlandı)
v18.7.37 #2 yalnız **add-playlist.tsx**'teki alanlara `onFocus` kaydırması ekledi; **edit-playlist.tsx**
("Hesabı Düzenle") atlanmıştı. Orada:
- `KeyboardAvoidingView` Android'de `behavior={undefined}` → **no-op** (klavyeyi hiç hesaba katmıyor).
- Alanlarda (`xt-user`, `xt-pass`, `st-mac`, `st-serial`, `xt-server`, `st-portal`, `server-code`) odak kaydırması yok.
→ SUNUCU altındaki kullanıcı adı/şifre/MAC alanları klavyenin altında kalıyordu.

## 2. Düzeltme — KAV'dan BAĞIMSIZ, yalnız odak kaydırmasıyla
**Önemli karar:** İlk denemede KAV behavior'ı Android'de `"height"` yaptım ama `check-v1711`
kapısı düştü — o kapı `behavior=undefined`'ı **bilerek** kilitliyor ("height" bu ekranda daha
önce layout sorunu yapmış). Körce "height"e dönmek regresyon olurdu (§7) → **GERİ ALINDI**.
- KAV behavior'ına DOKUNULMADI (`undefined` kaldı, check-v1711 korunur).
- `formScrollRef` + `revealField` (`scrollResponderScrollNativeHandleToKeyboard` — odaklanan alanı
  klavyenin 48 px üstüne kaydırır; KAV'dan BAĞIMSIZ, klavye yüksekliğini kendi hesaplar).
- `ScrollView ref={formScrollRef}`.
- 7 kritik alana `onFocus={revealField}` (xt-server/user/pass, st-portal/mac/serial, server-code).
Yalnız `edit-playlist.tsx`. **Native değişiklik YOK.**

## 3. Doğrulama (PC)
- `yarn tsc --noEmit`: **PASS**.
- `node tools/check-v18738-release.js`: **PASS** · `check-v18737`: PASS · `check-v1711`: PASS (geri geldi).
- `node tools/denetle.js`: **TÜM DENETİMLER TEMİZ** (exit 0). (İlk turda check-v1711 "height" yüzünden
  düştü; KAV geri alınınca temizlendi.)
- PC DEV `assembleDebug`: **BUILD SUCCESSFUL** (incremental 2m35s, reverted JS). `app-debug.apk` (487 MB),
  **18.7.38-dev** cihaza `install -r` **Success** (veri korundu). Önceki build "height" JS'i bundle etmişti;
  revert sonrası incremental rebuild ile doğru sürüm kuruldu.

## 4. Cihaz kabulü
- Düzenleme ekranında kullanıcı adı / şifre / MAC / seri alanına dokununca alan klavyenin ÜSTÜNE kaymalı.
  (Kurulum yapıldı; kullanıcı dokunma testini yapacak.)

## 5. Gerçek teslim kaydı — Opus, 13.11.2026
- Commit **`3791514b`** → dal `v18.7.37-rc1-add-account-ux-speed` (aynı dal, v18.7.38 patch) push.
- CI manuel release: [run 43392876063](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/43392876063) (teslim anında in_progress).
- **18.7.38-dev** cihaza kuruldu (`install -r` Success, veri korundu); kullanıcı düzenleme ekranı dokunma testini yapacak.
- v18.7.37 cihazda: release (CI [run 43368305677](https://github.com/mkizilkan/kizilkan-player-elite/actions/runs/43368305677) **success**) + DEV çökmeden açıldı, 13 kurtarılan hesap tam katalogla duruyor (doğrulandı).
