# Düzeltme Yorumu — v17.0.6 RC1

## Kanıtlanan kök neden
v17.0.3 tanısında native tarama 20097/20097 tamamlanmış, daha sonra APP_ROOT_READY sonrası `/profile-select` yönlendirmesi oluşmuştur. `frontend/app/index.tsx` çoklu profil/PIN dalında recent resume kontrolünden önce profil seçimine gidiyordu. v17.0.5'te bu dosya aynı olduğundan hata korunuyordu.

## Düzeltme
1. Native scan snapshot bootstrap recovery sinyali haline getirildi.
2. PIN güvenliği korunarak scan recovery intent profile bağlı hale getirildi.
3. Profil doğrulamasından sonra aynı profile ait tarama `/add-playlist` ekranına döner.
4. Native servis başlamadan önceki kısa panel-rehberi hazırlığında Activity recreation olursa aynı aktif profil için recent `/add-playlist` rotası korunur.
5. Single scan snapshot UI restore eklendi; bulk/unified restore korunur.
6. Android pil optimizasyonu durum sorgusu ve kullanıcı kontrollü ayar geçişi eklendi.
7. v17.0.5 gate'i forward-semver hale getirildi; 17.0.6'yı yanlış negatif vermesi engellendi.
