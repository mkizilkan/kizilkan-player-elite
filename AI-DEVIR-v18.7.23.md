# AI-DEVIR — v18.7.23 RC1

**Dal:** `v18.7.23-rc1-card-autoprime-autotest` (taban v18.7.22 `2c6fbb7e`)
**Konu:** Hesap kartında kullanıcı adının OYNATMASIZ otomatik türetilmesi + görüntü var/yok testinin otomatik çalışması.

## Kaynak / kanıt
Cihaz (OnePlus 7 Pro, v18.7.22-dev):
- **panel-a** hesabını **manuel güncelledim** → kullanıcı adı yine "Belirlenemedi". Kök neden: v18.7.21 **A** (`stalkerPrimeStreamCredentials`) yalnız **yeni ekleme** akışında çağrılıyordu; mevcut veya manuel güncellenen hesapta kart açıldığında türetme hiç tetiklenmiyordu. Kullanıcı adı yalnızca bir kanal elle oynatılınca geliyordu.
- Görüntü var/yok (M3U testi) **butona basınca** geliyordu, otomatik değildi.

## Değişiklikler (yalnız `frontend/app/(tabs)/settings.tsx` — TS, native YOK)

### 1) Kart oto-prime (kullanıcı adı, oynatmasız)
`AccountInfoCard` içindeki `useFocusEffect`:
- Ekrana her dönüşte `magDerived` yeniden okunur.
- MAG hesabı + kullanıcı adı yoksa + `primeTriedRef` henüz denemediyse (hesap başına bir kez):
  - `KizilkanNativeCore.queryItems(playlist.id, "live", { limit: 1 })` ile Room'dan **bir** canlı kanal alınır.
  - `stalker.stalkerResolveStream({portal, mac, serial, deviceModel:"MAG320"}, null, ch.url)` ile o kanalın `create_link`'i çözülür → `extractStreamCredentials` yayın URL'inden kullanıcı adı/şifre/sunucu türetir ve `kizilkan.streamCreds`'e kalıcılaştırır (v18.7.19 altyapısı).
  - `setMagDerived(readDerived())` ile kart yenilenir.
- En-iyi-çaba: hata/boş kanal sessizce yutulur (try/catch), kart eski davranışa düşer. Değerler loglanmaz.
- **Sonuç:** mevcut/manuel güncellenen MAG hesabının kartı açıldığında kullanıcı adı oynatmaya gerek kalmadan görünür.

### 2) Görüntü var/yok oto-testi
- `m3uLink` (sunucu + kullanıcı adı + şifre hazır) oluşur oluşmaz, `autoTestedRef` ile link başına bir kez `testM3u()` otomatik çalışır (`player_api.php?action=get_live_streams` → kanal sayısı). Kullanıcı butona basmak zorunda değil; "✓ Görüntü var · N kanal" / "✗ Görüntü yok" otomatik görünür. Manuel "Görüntü testi" butonu da durur.

## Doğrulama (PC)
- `yarn tsc --noEmit`: (bu devirde çalıştırıldı — sonuç commit öncesi doğrulandı)
- `node tools/denetle.js`: TEMİZ (kapı `check-v18723-release.js` PASS)
- Native değişiklik YOK → assembleDebug zorunlu değil (yine DEV APK üretilecek).

## Cihazda doğrulanacak
- panel-a kartı açılınca kullanıcı adının **oynatmadan** gelmesi (`ab3C4dEf`).
- Görüntü testinin otomatik "✓ Görüntü var · N kanal" göstermesi.

## Bekleyen (sıradaki)
- **YENİ ÖZELLİK (plan onayı bekliyor):** Xtream + MAC çoklu ekleme **seçim ekranında** her hesabın kartında "görüntü var/yok" göstergesi + süzme bölümünde "sadece görüntü olanları seç".
  - MAG tarafı: `MagScanResult.liveCount` zaten doğrulama anında hesaplanıyor → ücretsiz/dürüst ("görüntü var" = liveCount>0).
  - Xtream tarafı: tarama yalnız login (`player_api.php`) çekiyor, içerik çekmiyor → gerçek "görüntü var" için `get_live_streams` probe'u gerekir (ban/hız dengesi kullanıcıyla netleştirilecek).
- GPT G07-G10.
