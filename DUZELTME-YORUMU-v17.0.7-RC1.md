# Düzeltme Yorumu — v17.0.7 RC1

Kök problem v17.0.6'da Activity/React-root yeniden kurulumu için çözülmüş olsa da gerçek Android process ölümü halinde native worker belleği de kaybolduğu için tarama devam edemiyordu. v17.0.7 bu sınırı kalıcı, şifreli scan journal ile kapatır.

Credential/payload düz metin olarak bırakılmaz; Android Keystore AES-GCM kullanılır. Her bulunan sonuç SQLite'a UNIQUE(run_id,result_key) ile yazılır. Cursor, tamamlanmış işten daha geride konservatif biçimde checkpoint edilir; yeniden başlatmada bazı denemelerin tekrar edilmesi veri kaybına tercih edilir ve idempotent sonuç anahtarı tekrarları engeller.

Güvenlik sözleşmesi gevşetilmemiştir: process restart sonrası PIN/çoklu profil kapısı korunur. `/add-playlist` yalnız profil bağlı scan recovery kanıtıyla açılır.
