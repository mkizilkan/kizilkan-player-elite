# AI DEVİR — KIZILKAN PLAYER v17.10.0 RC1

Taban: v17.9.10 RC1. Yeni sürüm kodu P0/P1/P2 platform sağlamlaştırması, return-position/focus ve Chromecast hardening içerir.

## Kritik sözleşmeler
1. Room canonical store korunur; büyük kataloglar JS state'e kalıcı taşınmaz.
2. Playlist activation verified Room state olmadan publish edilmez.
3. Recovery background'da aktif request'i abort eder; foreground kalan kind'lardan devam eder.
4. Return-position stable item ID/key kullanır. TV focus restore yalnız TV native preferred-focus'a gider; scroll restore tüm platformlarda çalışır.
5. Cast local player'ı yalnız remote `loadMedia` başarılı olduktan sonra bırakır. Header-required stream Default Media Receiver'a sahte başarılı gönderilmez.
6. Generic M3U/Stalker `.ts` adresi otomatik `.m3u8` yapılmaz.
7. MAG archive komutu portal EPG verisinden gelmelidir; canlı cmd'den uydurulmaz.
8. Auto-refresh manual/self-repair ile aynı playlist singleflight mimarisini paylaşır.
9. Orphan Room snapshot otomatik silinmez ve credential içerdiği varsayılmaz.
10. App-owned disk rolling live buffer henüz yok; yalnız gerçek engine/server DVR seekability kullanılır.

## Yeni ana dosyalar
- `frontend/app/local-media.tsx`
- `frontend/app/recoverable-playlists.tsx`
- `frontend/src/player/v2/attemptLedger.ts`
- `frontend/src/utils/coloredRemote.ts`
- `tools/check-v17100-platform-hardening.js`

## Öncelikli cihaz testleri
- Kuzey benzeri boş playlist: recovery başladıktan 5 sn sonra background, 1-2 dk sonra foreground. Aktif süre arka planı saymamalı; request resume etmeli.
- 50k+ live listede ortalardan bir kanal aç, player içinde 10+ zap yap, geri çık. Son kanal ortada görünmeli. Aynı test telefon/tablet/TV.
- Chromecast: Xtream live .ts, generic M3U .ts, VOD resume, `playbackHeaders` gerektiren stream.
- MAG: büyük series katalog, archive EPG destekleyen/desteklemeyen portal.
- Yerel medya: internal, USB, SD SAF klasörü.
