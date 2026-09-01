# GPT KIZILKAN Player — GPT v10.5.2

## Kapsam
Bu sürüm yalnız yedekleme/geri yükleme, telefon klavye ergonomisi ve Android paket/imza zincirini geliştirir. PlayerHost, şerit/tint, zap ve TV focus oynatma mimarisine değişiklik yapılmadı.

## Yedekleme v2
- Eski backup v1 yalnız `kizilkan.playlists` anahtarını arıyordu; modern PlaylistContext ise profile özel `kizilkan.playlists.meta.<profileId>` + bigStore dosyaları kullanıyor. Bu nedenle modern playlistler eski yedeğe girmiyordu.
- Backup formatı `2.0` oldu.
- Profil bazlı playlist metadata, aktif playlist kimliği ve her playlist'in channels/vod/series bigStore verisi yedeklenir.
- Playlist metadata varsa ama ağır dosyalardan biri okunamıyorsa yedekleme başarısız sayılır; eksik yedeğe başarı mesajı verilmez.
- Geri yüklemede mevcut playlist snapshot'ı temizlenir, metadata ve ağır dosyalar yeniden yazılır ve adet doğrulaması yapılır.
- Eski `1.0` yedekleri açılmaya devam eder. Playlist taşımıyorsa kullanıcıya açık uyarı gösterilir; profil/favori/ayarlar yine geri yüklenir.
- Geri yükleme sonucu playlist, profil, ayar ve ağır playlist dosya adetlerini ayrı gösterir.

## Telefon klavyesi
- Android `softwareKeyboardLayoutMode=resize`.
- KeyboardAvoidingView Android'de `height` davranışı kullanır.
- Gerçek klavye yüksekliği ScrollView alt boşluğuna eklenir.
- Kullanıcı adı/şifre alanı odaklandığında form aşağı kaydırılır; alanlar ve alt Kaydet/Bul butonu klavyenin arkasında kalmaz.

## Android paket / güncelleme zinciri
- Görünen uygulama adı: `GPT KIZILKAN Player`.
- Package ID DEĞİŞMEDİ: `com.kizilkan.player`.
- Sürüm: 10.5.2 / buildNumber 10.5.2 / versionCode 100502 / package.json 10.5.2.
- Release build artık kalıcı GitHub Secrets keystore olmadan üretilmez.
- Workflow APK sonrası `aapt` ile package/versionCode ve `apksigner` ile imza doğrular.
- Sertifika SHA-256 Actions özetine ve Release notuna yazılır.
- Kalıcı imza kurulum yönergesi: `SIGNING-SETUP-v10.5.2.md`.

## İlk kalıcı imza geçişi
v10.5.1 ve daha eski APK farklı/geçici anahtarla imzalanmışsa v10.5.2 onların üzerine kurulamayabilir. Bu kriptografik olarak düzeltilemez; eski özel anahtar elimizde değildir. v10.5.2 kalıcı anahtarla bir kez temiz kurulduktan sonra aynı GitHub Secrets korunduğu sürece sonraki sürümler normal Android güncellemesi olarak kurulabilir.

## Kontroller
- KIZILKAN denetleyicileri 8/8.
- TypeScript 5.8.3 parse/transpile.
- JSON/YAML parse.
- Backup v2 / keyboard / package-signing kritik invariant kontrolleri.
- v10.5.1 referansına göre dosya silme yok.
- ZIP CRC ve `kizilkan-player/` kök yapısı doğrulanır.
