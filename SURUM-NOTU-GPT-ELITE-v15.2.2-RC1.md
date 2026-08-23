# KIZILKAN PLAYER ELITE v15.2.2-RC1

## Amaç
Bu sürüm iki kanıtlanmış P0 problemi birlikte düzeltir:

1. v15.2.1-RC1 GitHub build'i `kizilkan-native-core/android/build.gradle` satır 4'te Groovy/KSP kaçış karakteri yüzünden daha Room/KSP derlemesine gelmeden kırılıyordu.
2. Gerçek cihaz testinde 8 seçili Xtream/panel hesabı 7-8 saat `Cihaza kaydediliyor...` aşamasında kalabiliyordu. Eski akış hesapları seri işliyor, her hesapta Live/VOD/Series dev koleksiyonlarını JS'e indirip normalize ediyor ve tekrar dosyaya yazıyordu.

## Gradle/KSP düzeltmesi
Yanlış literal kaçış:
`rootProject[\"kspVersion\"]`

Expo'nun kendi Android modüllerinde kullandığı Groovy sözleşmesine düzeltildi:
`rootProject["kspVersion"]`

Room 2.8.3 ve Expo'nun root `kspVersion` zinciri korunur.

## Çoklu hesap ekleme Native Foreground Pipeline
Android'de kullanıcı bulunan hesaplardan seçim yaptıktan sonra katalog indirme/kaydetme artık JS Promise döngüsünde değil `BulkPlaylistImportService` foreground service içinde yürür.

- Hesap bazlı bounded worker pool (varsayılan en fazla 2 eşzamanlı hesap).
- Her hesap Live/VOD/Series ve kategori çağrılarını kendi içinde paralel indirir.
- Ağır normalize işi Kotlin tarafındadır.
- Sonuç doğrudan legacy heavy dosyaya ve Room/SQLite indeksine yazılır.
- React Native'e on binlerce item geri taşınıp yeniden stringify edilmez.
- Başarılı hesap diğer hesapları beklemeden kalıcı metadata olarak benimsenir.
- Tek hesap hatası diğer hesapları durdurmaz.
- Duraklat / Devam / Durdur gerçek native foreground job durumuna bağlıdır.
- Uygulama başka ekrana/arka plana alınsa da Android process çalıştığı sürece foreground service devam eder.
- Snapshot'a parola/token yazılmaz.

## Kullanıcıya gösterilen hesap durumları
`Bekliyor -> Kimlik doğrulanıyor -> Kataloglar indiriliyor -> Normalize -> Room/SQLite indeksleniyor -> Kaydedildi / Hata`

## Sürüm
- App: 15.2.2
- versionCode: 150202
- libmpv: 1.0.0
- Room: 2.8.3

## Henüz kanıtlanmamış
Bu kaynak pakette statik kapılar çalıştırılır; gerçek KSP/Room/Kotlin/Gradle/APK başarısı GitHub Actions build ile kanıtlanacaktır.
