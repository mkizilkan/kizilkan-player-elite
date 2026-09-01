# GPT KIZILKAN Player — GPT v11.5.0

## Kök düzeltmeler
- Profil/PIN sonrası karanlık ekran için profil state commit bariyeri eklendi.
- Yeni profil oluşturma sonrası yönlendirme de aynı bariyere bağlandı.
- PlaylistProvider profil değişiminde eski profile ait veriyi hazır göstermeyen yükleme bariyeri kullanır.
- Yanlış PIN hiçbir route değişikliği yapmaz; hata ekranda kalır. PIN doğrulama exception'ı kullanıcıya gösterilir.
- Açılış ambient dairesi logo ile aynı %50/%50 merkezini kullanır ve animasyon büyümesi hesaba katılarak safe alana clamp edilir.

## Sürüm
- version: 11.5.0
- buildNumber: 11.5.0
- versionCode: 110500
- package.json: 11.5.0
- package: com.kizilkan.player
