# KIZILKAN PLAYER v9.20.0 — Player Controls v2 + TV Focus Stabilizasyonu

## Temel ilke
v9.19.0'da şerit/görüntü boyanmasını gideren YOL B kalıcı `PlayerHost` mimarisi korunmuştur. Player yüzeyi ekran dışına taşınmamış, `translateX` uygulanmamış ve kalıcı mount davranışı değiştirilmemiştir.

## Düzeltmeler
- Film/dizi `PosterGrid` içinde çok kolonlu grid ile çakışan `useFocusScroll` kaldırıldı. Android TV'nin doğal D-pad/FlatList focus-scroll davranışı kullanılıyor.
- TV poster render penceresi büyütüldü; `removeClippedSubviews` TV'de kapalı kalmaya devam ediyor.
- Poster focus ölçeği 1.18'den 1.07'ye indirildi; odak vurgusu korunurken komşu kart taşması azaltıldı.
- Film/dizi header'ı poster FlatList'inin dışına alındı; poster scroll'u üst sekme/kategori geometrisini artık taşımıyor.
- `FocusButton`, dışarıdan verilen `focusable` ve `hasTVPreferredFocus` değerlerini artık ezmiyor. `autoFocus` yalnız açıkça verildiğinde preferred-focus değerinin önüne geçiyor.
- Player ilk açılışında ve kanal değişiminde/zap'ta kontroller kapalı kalıyor.
- TV'de gizli kontroller OK/Enter ile açılıyor; yön tuşları gizli paneli otomatik açmıyor.
- TV kontrol auto-hide süresi 6 sn, telefon/tablet 4 sn.
- Telefonda tek dokunma kontrolleri açıp kapatmaya devam ediyor.
- Sheet açıkken auto-hide duruyor; `tv-focus-catcher` sheet açıkken render edilmiyor.
- Back sırası: açık sheet -> ana kontroller -> player/listeden çıkış.
- Sheet backdrop/container TV focus ağacından çıkarıldı (`focusable={false}`).
- Sheet'lerde ilk gerçek seçenek için deterministik `autoFocus` eklendi.

## Claude teşhisiyle ilgili karar
Claude'un "gizli kalıcı PlayerHost focus yoluna karışabilir" ihtimali not edildi; ancak bunu tek kök neden kabul edecek kod kanıtı bulunmadığından ve kalıcı player şerit çözümünün kritik parçası olduğundan `translateX: 100000` uygulanmadı. Önce kodda doğrudan görülen grid scroll/focus ve sheet timer/focus çatışmaları düzeltildi.

## Sürüm
- Expo version: 9.20.0
- iOS buildNumber: 9.20.0
- Android versionCode: 92000
- package.json: 9.20.0

## Denetim
- `cd frontend && node ../tools/denetle.js`: 8/8 temiz.
- TypeScript parser: 89 TS/TSX dosyası, 0 sözdizim hatası.
- Cihaz testi bu ortamda yapılamaz; TV Box üzerinde gerçek D-pad/focus ve şerit regresyon testi gereklidir.
