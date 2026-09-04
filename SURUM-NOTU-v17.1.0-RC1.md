# KIZILKAN PLAYER ELITE v17.1.0 RC1

**Sürüm:** 17.1.0
**Android versionCode:** 170100
**Etiket:** GPT ELITE v17.1.0 RC1

Bu sürüm çoklu hesap taramasını "tek dev çalışma uzayı" modelinden bounded batch modeline geçirir. Aynı DNS/panel candidate listeleri JS tarafında hesap başına çoğaltılmaz. Native service 5–15 hesaplık partiler işler; varsayılan 15'tir. Kullanıcı 1–250 istenen paralellik seçebilir; gerçek etkin worker sayısı cihaz memory class, batch boyutu ve mevcut PSS baskısına göre güvenli şekilde sınırlandırılır.

Her tamamlanan batch şifreli scan journal'a atomik checkpoint olur. Bulunan hesaplar batch sonunu beklemeden anında journal'a yazılır. Process yeniden başlarsa son tamamlanmış batch'ten devam edilir; yarım batch güvenli biçimde yeniden taranır.

DocumentPicker single-flight koruması eklenmiştir. Aynı anda iki picker açma hatası engellenir.

**MPV player bu sürümün kapsamı dışındadır ve MPV kaynak dosyalarında değişiklik yapılmamıştır.**
