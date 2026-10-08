# Devam eden çalışma — v18.7.29 RC1

08.10.2026. Kullanıcı 14 maddelik planın tamamını tek buildde uygulamayı, kontrollerden sonra commit/push yapmayı onayladı. Dal: `codex/v18.7.29-rc1-recovery-catalog-player`. İş tamamlanmadı; commit/push/APK henüz yok. Sürüm alanları henüz 18.7.28; yayın hazırlığında beşi birlikte 18.7.29 yapılacak.

Şimdiye kadar yapılan kaynak değişiklikleri:

- `ScanSafetyBackup.kt`: tek çalışanlı gecikmeli TXT kuyruğu; ilk sonuçta yazım isteği; yazım sonrası SHA-256 geri okuma; doğrulamadan URI'yi kaydetmeme; her yazımda yeni nesil, önceki sağlam nesli koruma; boş sonuç için waiting; başarısız yazımda önceki başarılı dosya bilgilerini tutma. Tarama işçileri artık dosya yeniden yazımını doğrudan beklemiyor. Gerçek telefon yazım/güç kesintisi kabul testi henüz yapılmadı.
- `PanelScanService.kt`: recovery foreground bildirimi Keystore/DB okumasından önce; hazırlık ayrı Thread; gerçek found değeri persistentFound, 200'lük snapshot penceresi sayısı değil. `persistScanResult` queued backup kullanıyor.
- `ScanJournalStore.kt`: SecretKey süreç önbelleği; her şifreleme/çözme için Cipher yine ayrı. `PanelScanModule.kt`: MAG append queued backup kullanıyor.
- `add-playlist.tsx`: harf duyarlı hesap anahtarı; sayfa kabulünde doğrudan UI merge; recovery effect sıradan playlist/bulkAdding değişimlerinde tekrar başlamıyor; 3 durumlu TXT bildirimi; otomatik recovery yerine kullanıcı seçenekleri. Zorla çık, native işleri duraklatma, test/ön hazırlık iptali ve güvenli kök dönüşü. Donanım geri aynı akışa bağlı. Katalog testi seçili/tümü; hata türü görünür; 30s dış bütçe; gerçek ilk kare kuyruğu Xtream tarafına eklendi.
- `accountArchive.ts`: native JSON-lines TXT tanıma ve parse; bozuk satır uyarıları; ortak kategori raporu alanları. **MAG JSON-lines geri içe alma ayrı olarak hâlâ tamamlanmalı.**
- `hostRequestPolicy.ts` yeni: iptal edilebilir host kuyruğu (4), Retry-After saniye/tarih, bekleme. `iptv.ts`: ortak Xtream çağrıları bu politikayı kullanıyor, 401/403/HTML/JSON hataları tekrar edilmiyor.
- `AccountPlaybackTestQueue.tsx` yeni: sırayla tek renderer/probe lease. `EndpointPlaybackTest.tsx` ve `types/index.ts`: ilk kare süresi alanı.
- `CatalogPreparationModal.tsx`: isteğe bağlı onExit ve Zorla çık; add-playlist bağlandı.
- `stalker.ts`: mevcut verified Xtream enrichment kararını ortak helper'a taşıdı; normal katalog canlıdan sonra aynı helper'ı kullanıyor. İstenen türler korunuyor. Stalker sayfa istek süresi kalan bütçeyle sınırlı; eksik katalog CATALOG_INCOMPLETE hatası taşıyor, tam başarı sayılmıyor.

Kontroller:

- İlk kayıt/kurtarma TS değişiklikleri `yarn tsc --noEmit` PASS (16,21 sn).
- Sonraki TS'de queue key spread TS2783 bulundu ve düzeltildi; tekrar tam tsc yapılmalı.
- Native `:panel-scan:compileReleaseKotlin` **PASS**, 3m03s, 41 task. İlk iki Gradle denemesi koddan önce JDK UnixDomainSockets loopback hatası verdi. Sandbox TEMP yolu çok uzundu. Çözüm **yalnız komut oturumunda** `TEMP` ve `TMP` = projenin git dışı `.codex-device-backups/build-tmp` klasörü; JDK17, SDK `C:\Android\Sdk`, `--no-daemon`. Bu biçimle Kotlin derlemesi geçti. Sistem env değişmedi.
- ADB escalated erişim: `c3a4097e device`. GitHub mkizilkan oturumu aktif. Telefon verileri silinmedi, uygulama kaldırılmadı.
- `git diff --check` son çalıştırmada PASS. Genel denetim/nihai APK henüz yapılmadı.

Önemli açık işler — devam et:

1. TXT writer kuyruk/yeniden deneme yarışları ve gerçek cihaz dosya doğrulaması; boş TXT'nin ilgili oturum/URI kökünü cihazdan kontrol et. Recovery init Thread'de cancel/pause ownership erken penceresi denetlensin.
2. Xtream arşivlerine profil sahipliği, eski oturum arşivi görünürlüğü, journal evidence güncellemesi; single modalının kapatıldıktan sonra tekrar açılması kontrolü. Zorla çık sırasında JS işlem sahipliği/unmount sonrası geç commit engeli ayrıca denetlensin.
3. Gerçek test kuyruğunu MAG'a bağla, kanıtları kalıcı arşiv/Room/TXT'ye taşı; toplu katalog hatası ayrımlarını native/TS test et. EndpointPlaybackTest kapanışında yayın/lease yarışları doğrulansın.
4. Fast MAG normal yenilemesinde eski `st-vod/st-series` içerik kimliklerini koru; körce xt→st numeric prefix çevirmeyi yapma. API ve Stalker ID eşleşmesi kanıt gerektirir. Room'dan sınırlı sayfalarda eski katalog okuyup güvenli eşleme/alias/legacy koruması tasarlanmalı. Favori/izlendi/progress kaybolmamalı.
5. Xtream serilerde tekrar ve kategori üyelikleri: native `MediaItemEntity.rowKey` sıra içeriyor; aynı itemId birden fazla kategoride saklanabiliyor. DAO count ve queryRaw şu anda COUNT(*) / tüm satırlar. Kör ID dedup kategori üyeliklerini kaybettirir. Benzersiz sayı vs ham satır ve yedek bütünlük karşılaştırmalarını birlikte ele al.
6. Normal MAG yenilemesinin native iş sahipliği/checkpoint, provider completeness, per-kind progress ve eski katalog korumasını tamamla. Mevcut normal refresh hâlâ JS yaşam döngüsüne bağlı.
7. Player ilk kare/DNS/resolve/engine ölçümleri, onPause arming guard ve motorlar gerçek cihazda; DNS kanıt süreleri/başarı sıralaması ve tüm çalışan adreslerin kart/TXT kaydı.
8. Plan 11–14 mevcut davranışları yeniden doğrula: kullanıcı port/path, seçili yedek restore, metadata-only sıfır sayım/boş kabuk, MAC iç kaydırma, minimum kalan gün isteğe bağlı değildir ana 14 dışında kalmış opsiyonlar kodlanmayacak.
9. Ortak Xtream kategori raporu alanları eklendi fakat dışa aktarım çağıranlarının kategorileri gerçek API ile doldurması gerekiyor.
10. Anlamlı regression testleri; tüm tsc/denetle; Kotlin sonrası prebuild ve normal release APK (mevcut signing). Telefona verileri kaldırmadan yükle ve senaryoları test et. Testler geçmeden commit/push yok. Ayrı dal, manuel Actions release ve sonucunu takip. Hesap dosyaları/anahtarlar depoya girmeyecek.

Önceki proxy değişiklikleri (19 kaynak/47 URL) bu çalışma ağacında korunuyor. Önceki untracked güvenlik/inceleme raporlarını silme. Şu raporlar bağlamı korur: `GPT-BIRLIKTE-GELISTIRME-PLANI-2026-10-08.md`, `GPT-v18.7.27-CIHAZ-KURTARMA-KATALOG-MIMARI-2026-10-08.md`, `GPT-ALPHA-TEAM-WOLFS-EK-INCELEME-2026-10-08.md`.
