# Düzeltme Yorumu — v15.2.21 RC1

GitHub Actions v15.2.20 verify build'inde `PlayerHost.tsx` satırındaki `v2Profile.decoder` erişimi TS2339 ile durdu. `EngineProfile` içinde Media3 varyantında decoder yoktur. Düzeltme `as any` veya tip bastırma ile yapılmadı; ayrık union `engine` alanı üzerinden güvenli narrowing kullanıldı. Media3 profil bilgisinin tanılamada kaybolmaması için `surface` alanı ayrıca kaydedildi.

Ayrıca bu hata sınıfının tekrar kaçmaması için v15.2.21 semantik gate eklendi ve genel `denetle.js` zincirine bağlandı. v15.2.20 Flight Recorder gate'i sonraki sürümlerde eski sabit sürüm numarasına takılmayacak şekilde ileri uyumlu hale getirildi.
