# GPT KIZILKAN Player — GPT v10.9.0

## Taban
GPT KIZILKAN Player v10.6.6 tabanı korunmuştur. PlayerHost, PlayerContext,
FocusButton ve GitHub signing/APK doğrulama workflow'u değiştirilmemiştir.

## Düzeltme / geliştirmeler
- Sunucu Kodu ekranındaki üç giriş yolunda CTA artık form ScrollView içinde ve
  klavye yüksekliğine göre erişilebilir konumda tutulur.
- Android global `softwareKeyboardLayoutMode=resize` aktif edildi.
- Edit Playlist, profil, welcome, settings provider modal ve GroupDialog
  Android KeyboardAvoidingView `height` davranışına geçirildi.
- Paneli bilmiyorum çoklu eşleşmesinde gerçek checkbox multi-select,
  Tümünü Seç / Seçimi Kaldır ve N Seçileni Ekle akışı eklendi.
- Toplu panel ekleme gerçek başarılı ekleme sayısını raporlar; her playlist ID'si
  zaman+random bileşeni ile benzersiz üretilir; aynı hesap/panel duplicate korunur.
- Ayarlar'a global `+18 içeriği gizle` eklendi. Gizleme tek tuş; tekrar açma PIN
  doğrulamalıdır. Ana liste, arama, favoriler/kütüphane ve TV Home filtrelenir.
- İstatistikleri sıfırla artık hem izleme progress'ini hem `recent` listesini temizler.
- Playlist seçim ekranına `Tümünü Güncelle` eklendi; listeleri sırayla günceller,
  başarı/başarısızlık özeti verir ve mevcut DNS self-healing yolunu kullanır.
- Özel grupların yatay şerit sayacı artık doğru `panelCategories` count haritasını
  kullanır; grupta içerik varken 0 görünmez.
- Açılış ambient yuvarlağı telefon/tablet/TV ekran ölçüsüne göre responsive ve
  scale animasyonu sonrası da güvenli sınırlar içinde kalacak şekilde boyutlanır.

## Sürüm
- version: 10.9.0
- buildNumber: 10.9.0
- versionCode: 100900
- package.json: 10.9.0
- Android package: com.kizilkan.player

## Kontroller
- KIZILKAN denetle.js: 8/8 temiz.
- TypeScript 5.8.3: 90 TS/TSX parse/transpile, hata 0.
- v10.6.6 tabanına göre dosya kaybı yok.
- Player/signing kritik dosyaları hash ile korunur.

## Dürüst sınır
Bu ortamda proje bağımlılıkları/Expo tsconfig tam kurulu olmadığı için `npx tsc --noEmit`
Expo/React-Native modül tiplerini çözemedi; bu proje kaynak hatasına özgü bir sonuç değildir.
GitHub Actions gerçek bağımlılık ve Android ortamında Gradle build'i doğrulayacaktır.
TV Box bu bulgular için henüz gerçek cihazda doğrulanmamıştır.
