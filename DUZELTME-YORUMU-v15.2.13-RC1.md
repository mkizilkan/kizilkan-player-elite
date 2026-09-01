# DÜZELTME YORUMU — v15.2.13-RC1

v15.2.13-RC1, v15.2.12 gerçek cihaz testlerinde ölçülen hataları kök kod yollarında ele alır:

- Scan kontrol butonları yeniden eklenmedi; zaten mevcut oldukları kanıtlandı. Görünürlüklerinin yanlış generic `loading` state'ine bağlı olması düzeltildi.
- MAG `AccountInfoCard` hatası ErrorBoundary stack'i ile eşleştirilerek provider `status` tipinin string varsayılmasından çıkarıldı ve provider boundary normalizasyonu eklendi.
- Xtream'de kısmi endpoint başarısının eksik playlist olarak commit edilmesine izin veren add/refresh/native bulk yolları sertleştirildi.
- MAG/Stalker katalog desteği yalnız ITV'den VOD/Series'e genişletildi; yaygın portal pagination/API varyantlarına kontrollü uyumluluk eklendi.
- M3U sınıflandırması metadata + URL sinyalleriyle güçlendirildi ve native/JS parity kuruldu.
- `String length exceeds limit` üreten monolitik tam backup yolu, Room paging + streaming `.kzb` backup/restore ile değiştirildi. Eski JSON restore kaldırılmadı.

Bu paket için build/device başarısı iddia edilmez; GitHub Actions ve cihaz acceptance sonucu beklenmelidir.
