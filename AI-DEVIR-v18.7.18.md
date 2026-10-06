# AI DEVİR — v18.7.18 RC1 (dal `v18.7.18-rc1-backup-drive`)

**Tarih:** 2026-10-06 · **Taban:** v18.7.17 `<hash>` · **Yazan:** Claude Opus
**Kaynak:** Cihaz (v18.7.13) tam yedekleme hatası ekran görüntüsü + kullanıcı Google Drive isteği.

## Cihaz kanıtı
Tam yedekleme hatası: `Yedek oluşturulamadı: Call to function 'KizilkanNativeCore.queryItems' has been rejected. → Caused by: java.lang.IllegalStateException: Playlist Room indeksi ve legacy veri dosyası bulunamadı: pl-xt-2b68a0d1`.
Kök neden: `backupV3.ts` tam yedekte her playlist'in her türünü `queryItems` ile okuyor; YETİM/BOŞ-KABUK bir playlist (Room indeksi + legacy dosya ikisi de yok) için native `queryItems` IllegalStateException fırlatıyor ve TÜM yedeği düşürüyordu. **Bu hata mevcut tüm sürümlerde vardı** (backup kodu değişmemişti).

## Yapılanlar
| Kod | Değişiklik | Dosya |
|---|---|---|
| **B1** | Tam yedekte `queryItems` döngüsü try/catch'e alındı. Yetim playlist türünde hata → o tür ATLANIR (`chunk-error` satırı yazılır, `BACKUP_KIND_SKIPPED` telemetrisi), yedeğe DEVAM edilir. İptal (abort) hariç (yedeği durdurur). Restore tarafı bilinmeyen `chunk-error` tipini görmezden gelir (güvenli). | `backupV3.ts` |
| **G1** | **Google Drive OAuth Client ID artık uygulama içinde girilir** (env/Secrets zorunlu değil). Kullanıcı kendi Google Cloud projesinden Web OAuth Client ID oluşturur, gösterilen yönlendirme URI'sini Console'a ekler, Drive API'yi açar, ID'yi Yedekleme ekranına yapıştırır → "Giriş yap ve Yükle" tarayıcıda Google oturumu açar (`authenticateGoogleDrive`, expo-auth-session). Client ID storage'da (`kizilkan.googleDrive.clientId`), açılışta `hydrateGoogleDriveConfig` ile belleğe yüklenir. Redirect scheme artık hardcode değil (uygulama scheme'i `kizilkan-gpt`; eski yanlış `'frontend'` kaldırıldı). Env (`EXPO_PUBLIC_GOOGLE_CLIENT_ID`) hâlâ yedek. | `googleDrive.ts`, `backup.tsx`, `_layout.tsx` |

**Google Drive UI (Yedekleme ekranı):** kart genişletildi — yönlendirme URI'si (kopyala), Client ID girişi, "Client ID Kaydet" + "Giriş yap ve Yükle" butonları, "Yapılandırıldı" rozeti.

## APK güncelleme notu (#1 — kullanıcı "güncelleyerek yükleyemedim")
Telefondaki 18.7.13 RELEASE paketi (`com.gpt.kizilkan.player`, GitHub Secrets anahtarıyla imzalı). Üstüne ancak AYNI anahtarla imzalı `assembleRelease` kurulabilir (Actions Release APK). DEV APK (`com.gpt.kizilkan.player.dev`) AYRI pakettir, YANINA kurulur (adb ile kuruldu). Farklı kaynaktan/anahtardan APK "güncelleme" olarak kurulamaz — bu imza kuralı (§7), kod hatası değil.

## Arka planda çalışma (kullanıcı yeni isteği — v18.7.19'a bırakıldı)
Kullanıcı: çoklu arama/güncelleme/Xtream+MAC ekleme uygulama arka plandayken ve bir şey izlerken de çalışsın.
Bu **native ön plan servisi** (foreground service) işi; CLAUDE §9'da "MAG taramasını PanelScanService'e bağlamak" olarak zaten işaretli. Büyük ve native olduğu için v18.7.18'e sıkıştırılmadı — ayrı sürümde planlanıp kodlanacak.

## Doğrulama (PC)
- `yarn tsc --noEmit` → exit 0 · `node tools/denetle.js` → ✅ TÜM DENETİMLER TEMİZ
- Yeni kapı `check-v18718` PASS. Kırılan harness'ler düzeltildi (backupV3 yeni `diagnostics` import'u → test-backup-restore + check-v15214 mock; googleDrive yeni fonksiyonlar → test-encrypted-backup-ui mock). **Native değişiklik YOK.**

## Cihazda test edilecekler
1. **Tam yedekleme:** yetim playlist olsa bile yedek TAMAMLANMALI (hata vermeden; atlanan tür log `BACKUP_KIND_SKIPPED`).
2. **Google Drive:** Yedekleme ekranı → yönlendirme URI'sini kopyala → Google Console'a ekle → Client ID yapıştır → Kaydet → "Giriş yap ve Yükle" → tarayıcıda Google oturumu → Drive'a yükleme.

## Bekleyen
Arka planda çalışma (v18.7.19, native foreground service); U4 kalıcılaştırma; katalog/açılış hız (ölçümden sonra); GPT G07-G10.
