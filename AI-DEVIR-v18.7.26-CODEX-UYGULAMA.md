# v18.7.26 RC1 — Codex uygulama devri

**Bu dosya 7 Ekim ara çalışma kaydıdır. Güncel 8 Ekim uygulama, Opus teknik devri ve teslim bilgileri [GPT-v18.7.26-UYGULAMA-VE-OPUS-DEVIR-2026-10-08.md](GPT-v18.7.26-UYGULAMA-VE-OPUS-DEVIR-2026-10-08.md) içindedir. Aşağıdaki devam eden işler ve telefon bilgisi tarihsel ara durumdur.**

Tarih: 7 Ekim 2026. Dal: `v18.7.26-rc1-data-dns-player-corrective`. Temiz taban: `5cf9f999`. Kullanıcı 12 satırlık planı, commit/push, yerel DEV APK, bağlı telefona yükleme ve manuel GitHub derlemesini onayladı.

**Çalışma sürüyor. Bu belge tamamlanma iddiası değildir.** Depo PRIVATE kalmalı. Gerçek hesap arşivleri Git'e eklenmeyecek.

## Uygulanan ilk grup

- `ScanJournalStore.kt`: snapshot'taki 200 kayıt sınırından bağımsız, satır ID'si üzerinden cursor sayfalama. Sayfa hem kayıt hem UTF-8 boyutuyla sınırlı. Çözülemeyen şifreli satır sessiz atlanmıyor. Mevcut veritabanı ve journal silinmiyor.
- `PanelScanModule.kt`, panel-scan `index.ts`: hata yutmayan `getResultsPage` köprüsü.
- `scanResultReader.ts`, `add-playlist.tsx`: normal native, birleşik ve büyük dosya yollarında kalıcı sonuç teslimi; terminal durumda bütün sayfaların tamamlanması. Sayı native kalıcı toplamdan gelir. Sonuçlar mevcut Map birleştirmesiyle tekilleştirilir.
- `backupV3.ts`: kendi exporter'ımızın yazdığı `chunk-error` seçmeli ve bütün cihaz restore tarafından doğrulanarak okunur. Sağlam parçalar staging/rollback sözleşmesiyle korunur. Eksik türler uyarı olur; gerçek yerel sayılar ve tarihsel beklenen sayılar ayrılır. İptal hatası eksik katalog diye yutulmaz. Export uyarıları UI'a taşınır.
- `ForegroundKeepAliveService.kt`: iş sahibi token'ları, Android dataSync timeout temizliği, sınırlı CPU wake lock. JS çağrıları için ayrı iş token'ları bağlanıyor. Ağ/Doze muafiyeti veya süreç ölümünde otomatik sürdürme garantisi verilmez.
- `iptv.ts`: yalnız canlı katalog var/yok için kategori ve tüm Channel nesnelerini üretmeyen probe. Katalog sonucu ilk kare kanıtı sayılmayacak.
- `stalker.ts`: türetilmiş kimlik önbelleği v2 portal origin + port + path + profil anahtarı; eski MAC-only kayıtlar güvenli biçimde kullanılmaz, tekrar doğru portalda türetilir. Sınıflandırma sayacındaki boş dizi kontrolü gerçek sınıflandırmayla eşitlenir.

## Doğrulama — ara sonuç

- `node tools/test-backup-restore.js`: **54 grup geçti**, iki yeni seçmeli/tam eksik katalog senaryosu dahil. Test gerçek TypeScript restore fonksiyonlarını bellek adaptörleriyle çalıştırıyor; gerçek cihaz/Drive testi sayılmaz.
- İlk veri grubundan sonra `yarn tsc --noEmit`: geçti. Sonraki değişiklikler için tekrar koşulacak.
- ADB: OnePlus GM1910 `c3a4097e` bağlı/yetkili. Henüz .26 kurulmadı.

## Devam eden kapsam

1. MAC/Xtream adreslerinin Room, kart, TXT, yedek zinciri; adres başına doğrulama/ilk kare kanıtı.
2. Tek dosya ve kalıcı MAC journal; Xtream emniyet yedeği ve son yazım doğrulaması.
3. Geri yükleme sağlam parçalar test edildi; cihaz ve boş kabuk davranışı kontrol edilecek.
4–7. Portal kapsamı doğrulaması, profil/portal cache çağrı sahipliği, katalog/görüntü ayrımı, TXT ve seçim korunması.
8. İş sahibi token bağlama ve iptal/lifecycle kontrolleri.
9. Google Android AuthorizationClient; paket/imza yapılandırmasının cihazda görünmesi.
10–11. MAC/Xtream canlı önce teslim, VOD/dizi eşleşmesi, ilk kare fazları ve pause/timeshift/motor kontrolleri.
12. Son tsc, tam denetle, native DEV derleme, cihaz doğrulama, commit/push ve manuel Actions sonucu.

## Araştırma kaynakları

- Room manual migration: https://developer.android.com/training/data-storage/room/migrating-db-versions — mevcut sürüm 2.8.3; güncel belgedeki Room 3 örneklerini kör kopyalama yok.
- Foreground timeout: https://developer.android.com/develop/background-work/services/fgs/timeout
- Google Android authorization: https://developer.android.com/identity/authorization — AuthorizationClient; Android OAuth istemcisinde paket ve SHA-1 şartı.
