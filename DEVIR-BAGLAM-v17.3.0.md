# v17.3.0 uygulama devri

Taban commit: 0cd7ba2d493198cc070255a4d634a36cc7fa33b0
Taban tree: 57d3308c157a4f7016dd81d2deac2b1d7d90eb5e
Planlanan dal: v17.3.0-rc1-smart-db-multisource
Uzak commit/dal/Actions run: oluşturulmadı. create-tree 403 Resource not accessible by integration.

Kod, API sınırları ve doğrulama kapsamı V17.3.0-DOGRULAMA.md içinde belgelenmiştir. Sonraki iş APK/Kotlin derlemesi ve gerçek Android/TV smoke testidir. Telefonda build yapılmayacak. main üzerine doğrudan yazılmayacak.

Yerel denetle çıktısı verification/denetle.log içinde: 84 kontrol geçti. TypeScript --noEmit exit 0. Son native cleanup preview kilidi ayrıca check-v1720-consolidated-core.js ile tekrar kontrol edildi. Son web sayaç fallback düzeltmesi sonrası TypeScript yeniden geçti. Android runtime/Room rollback enjeksiyonu henüz test edilmedi; statik gate runtime testi değildir.

Kalan doğrulamalar:
- Uzak CI ile Kotlin derleme, imzalı APK ve mevcut MPV APK paketleme kapısı.
- Gerçek Android/TV üzerinde seçili/tüm liste temizleme, UI sayaçları ve EPG yenilemesi.
- Profil/liste değişimi sırasında devam eden yenileme, çevrimdışı katalog koruma, scan stop/pause/resume ve process recovery.
- Native + JS normalizasyonunun sıra dışı IPv6/IDN biçimlerinde eşdeğerliği; temel alan adları ve varsayılan portlar test edildi.

Koruma: PIN, profile-select, MPV/player kaynakları değişmedi. Tarihî sürüm belgeleri güncellenmedi.
