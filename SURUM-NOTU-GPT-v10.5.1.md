# GPT KIZILKAN Player — GPT v10.5.1

## Çoklu eşleşme güvenliği
- `Paneli bilmiyorum` artık ilk başarılı hostta durmaz; tüm adayları tarar.
- 0 eşleşme: hesap bulunamadı.
- 1 panel eşleşmesi: doğrudan eklenir.
- 2+ farklı panel eşleşmesi: kullanıcı doğru paneli seçmeden playlist oluşturulmaz.
- Aynı panelin birden fazla yedek DNS'i başarılıysa tek panel seçeneğinde birleştirilir.
- Seçim ekranında panel adı, sunucu kodu, hesap durumu, bitiş tarihi,
  aktif/maksimum bağlantı ve çalışan DNS gösterilir.
- Kullanıcı adı/şifre Firebase'e gönderilmez.

## Kalıcı panel kimliği
Sunucu Kodu / Panel Rehberi / Otomatik Bul yollarıyla eklenen Xtream listesine
panel kodu, panel adı, Firebase kaynak adresi, autoResolve, son çalışan DNS ve
son çözümleme zamanı kaydedilir.

## DNS self-healing
Playlist yenilenirken yalnız kullanıcının seçip kaydettiği panelin güncel Hosts
listesi çözülür. DNS değişmişse içerik yeni DNS'ten alınır ve `xtreamServer`
otomatik güncellenir.

Güvenlik: kayıtlı kod bugün farklı bir panel adına dönüyorsa otomatik geçiş
yapılmaz. Aynı kullanıcı adı/şifre başka panelde çalışsa bile yanlış panele
kayma engellenir.

Kullanıcı DNS'i elle değiştirirse `autoResolve` kapatılır; manuel seçim sonraki
yenilemede Firebase tarafından ezilmez.

## Sürüm
- GPT v10.5.1
- Expo version: 10.5.1
- iOS buildNumber: 10.5.1
- Android versionCode: 100501
- package.json: 10.5.1

## Kontroller
- KIZILKAN 8/8 denetleyici temiz.
- TypeScript 5.8.3: 89 TS/TSX parse/transpile hata 0.
- JSON/YAML temiz.
- v10.5.0 -> v10.5.1 silinen dosya: 0.
- ZIP CRC ve `kizilkan-player/` kök yapısı temiz.

## Dürüst sınır
Bu ortamda proje `node_modules` dizini olmadığı için gerçek Expo
`tsc --noEmit`, prebuild ve Gradle APK build burada çalıştırılmadı.
GitHub Actions gerçek Android ortamında bunları doğrulayacaktır.
