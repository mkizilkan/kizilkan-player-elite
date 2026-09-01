# GPT KIZILKAN PLAYER ELITE v12.5.0

## Temel
Bu sürüm GPT KIZILKAN PLAYER ELITE v12.0.0 tabanından geliştirilmiştir.
Package ID korunur: `com.gpt.kizilkan.player`.

## Telefon testleriyle doğrulanmış ve korunanlar
- Splash/ambient logo merkezleme.
- Panel tarama yüzde + panel/adres sayaçları.
- Çoklu panel ekleme ve birden fazla playlistin kalıcı kalması.
- Active/Expired ayrımı.
- Panel ekleme klavye davranışındaki büyük yukarı sıçrama düzeltmesi.

## v12.5.0 değişiklikleri
- Gizli kalıcı PlayerHost içindeki RNGH gesture recognizer'ları `visible` ile kapatıldı.
- TV focus catcher gizliyken render edilmez.
- Son kullanılan playlist için profile-ready olduktan sonra deterministik 4 saniyelik auto-continue ve kullanıcı etkileşiminde kalıcı iptal.
- +18 içerik tespiti playlist yükleme/güncelleme sırasında cache edilir; toggle pahalı tekrar regex taramasına bağımlı değildir.
- Ayarlar'da +18 gizleme satırının sağında AÇIK/KAPALI switch göstergesi.
- Kodum var / Paneli biliyorum / Paneli bilmiyorum akışlarında tüm DNS adresleri taranır.
- Başarılı DNS hesapları seçim modalında ayrı ayrı listelenir ve çoklu seçilebilir.
- Seçilen her DNS ayrı playlist olarak eklenebilir; aynı panel içindeki doğrulanmış DNS'ler fallback listesinde korunur.
- Exact kullanıcı+server duplicate koruması.
- DNS self-heal seçilen preferred DNS'i önceliklendirir, gerekirse aynı panelin diğer doğrulanmış/Firebase DNS'lerine geçer.
- Klavye aktif input için küçük güvenli boşluk artırıldı; scrollToEnd yok.
- ELITE ortak kayıt yolu: `/Download/KIZILKAN PLAYER ELITE/Record/`.
- ELITE backup export adı: `kizilkan-player-elite-backup-YYYY-MM-DD.json`.
- PlaylistContext update/remove stale closure düzeltildi.
- ProfileContext update/PIN doğrulamaları güncel profile ref üzerinden sertleştirildi.
- Settings TV Mode düğmesindeki eski tanımsız `next` hatası düzeltildi.
- serverCode yardımcı fonksiyonundaki eski çift `onProgress` parametresi düzeltildi.
- Normal Xtream submit yolundaki eski tanımsız `displayName` referansı düzeltildi.

## Sürüm
- version: 12.5.0
- buildNumber: 12.5.0
- Android versionCode: 120500
- package.json: 12.5.0
- package ID: com.gpt.kizilkan.player
