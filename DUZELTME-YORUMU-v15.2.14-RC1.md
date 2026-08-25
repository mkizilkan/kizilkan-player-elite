# DÜZELTME YORUMU — v15.2.14-RC1

v15.2.13 yeniden kaynak + internet denetiminde iki kritik açık bulundu ve v15.2.14-RC1 bunlara odaklandı.

**MAG/Stalker:** v15.2.13'te VOD/Series desteği eklenmiş olsa da transient katalog hataları retry sonunda boş listeye dönüşebiliyordu. Bu, portal gerçekte üç medya türü barındırırken KIZILKAN'ın bir veya iki bölüm göstermesi semptomunu yeniden üretebilirdi. v15.2.14 transient hata ile gerçekten unsupported endpointi ayırır; hatayı sessiz başarılı katalog olarak kaydetmez. Ayrı `/series` endpointi olmayan veya boş dönen portal varyasyonları için VOD `is_series`/kategori fallback'i ve VOD-backed season/episode çözümü güçlendirildi.

**Tam Yedek:** v15.2.13 streaming export dev JS string problemini giderdi fakat restore, tüm dosya doğrulanmadan playlist bazında canlı Room'a commit edebiliyordu. v15.2.14 restore'u session staging + bütün-dosya doğrulama + Room transaction swap + rollback alanı modeline geçirir. Metadata da exact-snapshot uygulanır; metadata hatasında eski Room/EPG ve eski metadata geri getirilir.

Çalışan önceki özellikler kaldırılmadı. Bu kaynak paketinde tam dependency build yapılmadığı için build veya cihaz başarısı iddia edilmez; GitHub Actions ve gerçek cihaz kabulü zorunludur.
