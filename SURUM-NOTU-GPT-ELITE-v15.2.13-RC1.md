# KIZILKAN PLAYER ELITE v15.2.13-RC1 — MEDIA CATALOG + BACKUP HARDENING

**Sürüm:** 15.2.13
**Android versionCode:** 150213
**Temel:** v15.2.12-RC1 / be124f0

Bu sürüm gerçek cihazda v15.2.12-RC1 üzerinde gözlenen dört hata hattını düzeltmek için hazırlanmıştır. Çalışan v15.2.11/v15.2.12 scan runId/terminal lifecycle, round-robin, selection-before-import, DNS alias grouping ve profil session güvenliği kaldırılmamıştır.

## Düzeltmeler

### 1. Çoklu hesap analizinde Durdur / Duraklat / Devam
Butonlar kaynakta vardı ancak görünürlükleri genel `loading` state'ine bağlıydı. Aynı ekrandaki import snapshot senkronu da `loading` değerini değiştirebildiğinden devam eden scan sırasında kontroller kaybolabiliyordu. Kontrol görünürlüğü artık scan'e ait native/preparation/pause/stop lifecycle state'inden üretilir; generic import loading'e bağlı değildir.

### 2. MAG/Stalker Ayarlar → AccountInfoCard runtime crash
Gerçek cihaz stack'i `TypeError: undefined is not a function -> AccountInfoCard -> SettingsTab` gösterdi. MAG `get_profile` alanlarının string olduğu varsayımı kaldırıldı. `status` dahil hesap alanları boundary'de normalize edilir; AccountInfoCard status değerini güvenli string-normalized biçimde değerlendirir.

### 3. Live / VOD / Series ayrımı
- **Xtream:** Live/VOD/Series endpointleri ayrı sözleşme olarak korunur. Bir içerik endpointi hata verirse eksik kısmi playlist kaydedilmez/yenilenmez; istekler sınırlı retry alır. Native bulk import da aynı davranışı uygular.
- **MAG/Stalker:** yalnız ITV olan eski yol Live + VOD + Series katalog akışına genişletildi. Yaygın Stalker `get_categories/get_ordered_list/create_link` varyantları desteklenir; p=0/p=1 pagination farkı ele alınır; VOD altındaki açık Series kategorileri iki bölüme birden kopyalanmaz. Portal varyantları nedeniyle gerçek cihaz/provider kabul testi zorunludur.
- **M3U:** yalnız URL path/uzantısına dayanan sınıflandırma güçlendirildi; EXTINF group/name, episode/season desenleri ve güvenilir URL sinyalleri birlikte kullanılır. Android native M3U parser ile JS parser aynı mantığa getirildi. M3U series kaydı doğrudan URL/container bilgisini korur.

### 4. Büyük yedekleme
Cihazda görülen `String length exceeds limit` hatasının kaynak yolu, tüm ağır katalogların JS belleğinde birleştirilip tek dev `JSON.stringify` yapılmasıydı. Yeni tam yedek v3:
- katalogları Room `queryItems` üzerinden 200 kayıtlık parçalar halinde okur,
- NDJSON tabanlı `.kzb` dosyasına `FileHandle.writeBytes` ile akış halinde yazar,
- `.part` geçici dosyası kullanır ve tamamlandıktan sonra taşır,
- gerçek progress ve Durdur desteği sağlar,
- restore sırasında 256 KB bloklarla okur ve native chunked Room import kullanır,
- tamamlanmamış footer veya eksik playlist staging'i başarı kabul etmez,
- eski JSON v1/v2 restore desteğini korur.

Yedek ekranında **Hızlı / Kişisel / Tam** kapsamları vardır. Google Drive yolu ağır katalogları tekrar dev string'e çevirmemek için Hızlı (katalogsuz) metadata yedeği kullanır.

## Doğrulama sınırı
Bu paket üzerinde statik denetimler ve parser kontrolleri çalıştırılmıştır. Paketleme ortamında `node_modules` bulunmadığından tam `npx tsc --noEmit`, Expo prebuild/Kotlin/Gradle ve Android release APK build burada çalıştırılmamıştır. Bunların gerçek kanıtı GitHub Actions'tır. Gerçek cihazda düzeldi iddiası CI + acceptance testinden önce kurulamaz.
