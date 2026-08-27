# v15.2.19-RC1 DÜZELTME YORUMU

- Eski regresyon gate'lerindeki sürüm numarası/string hard-code yanlış alarmları kaldırıldı; davranış sözleşmeleri korunuyor.
- v15.2.18 gate'i `denetle.js` ana HARD zincirine bağlandı ve cwd bağımsız yapıldı.
- `denetle.js`, `checkplayercore.js`, v15.2.14 ve v15.2.15 fixture'ları repo kökü/frontend farkından etkilenmeyecek şekilde sertleştirildi.
- v15.2.18 AppState black-box kaydındaki stale closure düzeltildi.
- v15.2.18 spinner guard yalnız UI'ı saklamak yerine stale buffering state'ini de temizleyecek şekilde tamamlandı.
- Playlist switch'e generation + serialized storage write eklendi; geç eski summary yeni playlisti ezemez.
- Ana Live/VOD/Series ekranında native page owner + atomik UI invalidation eklendi; eski playlist item/kategori/EPG state'i yeni playlist altında gösterilmez.
- BLACK BOX V2'ye `Paths.document` altında bounded append-only JSONL persistent journal + kritik event export özeti eklendi. AsyncStorage ring hızlı UI için korunur.

Yapılmamış iddialar: Tam native Room black-box, global ANR tombstone, tam tsc, Gradle release ve cihaz acceptance henüz yapılmış sayılmaz.
