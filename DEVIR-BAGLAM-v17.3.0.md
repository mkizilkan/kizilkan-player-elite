# 17.3.1 RC1 uygulama devri

17.3.0 RC1 uzak dalı: `v17.3.0-rc1-smart-db-multisource`; mevcut beklenen HEAD: `0aea0c4081a034dd072a1c4cfbbb8cfc5916ad41`. Actions #83 başarılı, APK indirilebilir; bu sonuç yalnız RC1 kaynaklarına aittir. 17.3.1 RC1 kodu aynı geliştirme dalında ileriye dönük bir commit olarak gönderilecek. Eski commit değişmişse script hiçbir şey uygulamadan durur.

14 Eylül 2026 tanı dosyasında aynı çalıştırmanın 0 adres denemesi ve 0 bulunmuş hesabı raporlandı; taranan geçerli hesap sayısı kaydedilmemişti. Cihaz ekranı taramanın durdurulurken sonuç penceresini kilitlediğini gösterdi. Kaynakta uyarlanan pasif worker'ların bitişte uyanamaması, hedefsiz satırların sessizce atlanması, streaming kipinin UI recovery'de ele alınmaması ve modaldan geri çıkışın kapatılması giderildi. Dosyanın gerçekten kaç geçerli combo içerdiği eldeki tanıdan bilinmiyor. Yeni tanı hesabı/uyuşmayan hedef sayısını ayrı saklar; kullanıcı adı ve şifrelerini günlüğe yazmaz.

Film ve dizi için profil bazlı otomatik sonraki içerik ayarı eklendi. Katalog ekranında çoklu panel seçimi, gerçek kod/kaynak görünümü ve doğrudan DNS vardır. M3U kaynağı ETag/Last-Modified sunarsa koşullu GET yapılır; Xtream sağlayıcılarında sunucu delta API'si olduğu varsayılmaz. Güncellik denetimi seçili liste açık kaldıkça aralıklarla yapılır. Backup meta bilgileri ve otomatik sonraki ayarı korunur.

Kaynak Android build ve fiziksel test geçmeden sürüm tamamlanmış kabul edilmez. GitHub yazma erişimi bu çalışma ortamında bulunmadığı için kullanıcı TERMUX-GONDER-1731.sh ile gönderir. Kullanıcı GitHub tokenını sohbete yapıştırmamalıdır. PIN/profil seçimi modülleri değiştirilmedi; MPV ve gerçek PlayerHost dosyaları otomatik sonraki içerik için kontrollü olarak değişti.
