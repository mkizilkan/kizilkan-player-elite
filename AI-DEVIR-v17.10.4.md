# AI DEVİR — v17.10.4 RC1

**Taban:** GitHub `v17.10.3-rc1-timeshift-modes-profile-autoplay` (49c0504). Patch: `17103-to-17104.patch`.

## Yapılanlar
1. **Açılışta son kanal — profil + LİSTE başına.** 25.09 kaydı: profil girişinden sonra
   başka liste seçilince (431bb9db → 0f51aa0e) profil başına tek kayıt uyuşmuyor, kapı
   sessizce vazgeçiyordu. Artık `kizilkan.player.lastLive.<profil>.<liste>` yazılır
   (eski `lastLive.<profil>` geriye uyum için sürer). Kapı seçilen listenin kaydını okur;
   yoksa eski kayıt yalnız aynı listeye aitse kullanılır. **Listede hiç kanal
   izlenmediyse hiçbir şey açılmaz** (kullanıcı kararı).
2. **`STARTUP_LAST_CHANNEL_SKIP` reason:** `disabled`, `no-saved-channel-for-playlist`,
   `channel-not-in-playlist` (+ hata). Kapı artık hiçbir çıkışta sessiz değil.
3. **`tools/denetle.js` Windows uyumu** (17.10.3'te 2. pakette vardı, GitHub'a girmemişti):
   joker/`find` yerine Node dosya listesi + kabuksuz `execFileSync`. Linux çıktısı aynı.

## 25.09 kaydından notlar
- "Kendi kendine kapanma": Android, WebView güncellerken (`installPackageLI`) uygulamayı
  kapattı — uygulama hatası değil.
- Timeshift modları kullanıcı tarafından çalışır olarak doğrulandı.

## Doğrulama (sandbox)
denetle.js 88 ✓ · 6 özel kapı ✓ · karşılaştırmalı TS: gerçek yeni hata 0 · Kotlin değişikliği yok.
PC'de `yarn tsc --noEmit` + `node tools/denetle.js` ile doğrulanmalı.

## Test
PIN'li profil, son kanal AÇIK: A listesinde kanal izle → kapat → aç → profil+PIN → A seç →
A'nın son kanalı açılmalı. Tekrar: B seç (hiç izlenmemiş) → hiçbir şey açılmamalı; log'da
`STARTUP_LAST_CHANNEL_SKIP reason: no-saved-channel-for-playlist`.
