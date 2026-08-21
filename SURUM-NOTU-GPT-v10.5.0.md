# GPT KIZILKAN Player — GPT v10.5.0

## Yeni: Kolay Panel Bulma / Sunucu Rehberi

Bu sürüm mevcut Sunucu Kodu girişini kaldırmadan üç kullanıcı yoluna ayırır:

1. **Kodum var** — mevcut panel kodu + kullanıcı adı + şifre akışı aynen korunur.
2. **Paneli biliyorum** — Firebase panel kataloğu isim/kod rehberi olarak gösterilir; panel adı veya kodla arama ve tek tuşla seçim yapılır.
3. **Paneli bilmiyorum** — kullanıcı yalnız kullanıcı adı ve şifre girer; uygulama Firebase'den sadece panel/host kataloğunu indirir, aday Xtream hostlarını cihazdan doğrudan sınar ve ilk doğrulanan hesabı standart Xtream listesi olarak ekler.

## Güvenlik / gizlilik
- Kullanıcı adı ve şifre Firebase'e gönderilmez.
- Firebase yalnız panel adı, sunucu kodu ve host kataloğu olarak kullanılır.
- Otomatik keşifte kimlik bilgileri aday IPTV sunucularının `player_api.php` uçlarına cihazdan doğrudan gönderilir.
- Arama aynı anda en fazla 5 aday hostu dener; her hızlı keşif isteğinin zaman aşımı 12 saniyedir.
- Şifre/kullanıcı adı loglanmaz.

## Kullanıcı arayüzü
`Oynatma Listesi Ekle > Sunucu Kodu` altında:
- Kodum var
- Paneli biliyorum
- Paneli bilmiyorum

Panel rehberi panel adına veya sunucu koduna göre aranabilir. Panel seçildiğinde kod otomatik doldurulur. Otomatik bulmada ilerleme yüzdesi ve o anda sınanan panel adı gösterilir.

## Firebase katalog yapısı
Mevcut yapı korunur:
- `Master/zeroWebServers/{KOD}.json` -> panel adı
- `Master/Servers/{panelAdı}.json` -> `Hosts` nesnesi

Yeni özellik için ayrı şifre veritabanı veya kullanıcı hesabı veritabanı oluşturulmaz.

## Sürüm
- Görünen sürüm: GPT v10.5.0
- Expo version: 10.5.0
- iOS buildNumber: 10.5.0
- Android versionCode: 100500
- package.json: 10.5.0

## Doğrulamalar
- KIZILKAN 8/8 statik denetleyici temiz.
- TypeScript 5.8.3: 89 TS/TSX parse/transpile hata 0.
- `serverCode.ts` bağımsız strict TypeScript tip kontrolü temiz.
- JSON/YAML parse temiz.
- v10.4.0 -> v10.5.0 dosya kaybı yok.
- ZIP CRC ve `kizilkan-player/` kök yapısı temiz.

## Dürüst sınır
Bu ortamda tam Expo/Android node_modules kurulumu olmadığı için gerçek `expo prebuild` ve Gradle APK derlemesi burada çalıştırılmadı. GitHub Actions gerçek build ortamında doğrulayacaktır. Otomatik panel keşfi ayrıca gerçek Firebase kataloğu ve gerçek kullanıcı hesabıyla cihaz testine ihtiyaç duyar.
