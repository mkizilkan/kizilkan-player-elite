# AI DEVİR — KIZILKAN PLAYER v17.9.10 RC1

## Güncel P0
23.09.2026 logunda playlist seçimi UI tarafından alınmış, `playlistSelect` ve `roomVerify` başlamış; `getPlaylistSummary/warmPlaylist` hedef playlist için "Room indeksi ve legacy veri dosyası bulunamadı" hatası vermiştir. Self-repair başlamış ancak `refresh:xtream:Dolby` 54+ saniye açık kalmıştır. Bu, SEÇ butonunun ölü olmadığını; boş-kabuk recovery'nin kullanıcıya görünmeden uzun sürdüğünü kanıtlamıştır.

## v17.9.10 mimari kararları
- Tek recovery motoru: `PlaylistContext.repairMissingPlaylist()`.
- Tek progress sözleşmesi: `RefreshProgress` + `formatRefreshProgress()`.
- Global görünürlük: `PlaylistRepairOverlay` `_layout.tsx` içinde PlayerHost gibi kalıcı üst katmandadır.
- Xtream empty-shell recovery: live→vod→series sıralı fetch/parse, her kind hazır olur olmaz Room commit. Normal manuel refresh paralel kalır.
- Kalıcı recovery bariyeri: `Playlist.catalogRecovery`. `running` veya `failed` snapshot aktif liste olarak kabul edilmez; yeniden recovery gerekir. `partial` kullanılabilir katalog bulunduğunu, `ready` tam recovery'yi gösterir.
- Verified activation korunur: son `warmPlaylist` Room doğrulamasından önce `activeId` yayınlanmaz.
- Same-target singleflight korunur. Repair storm guard 2,5 sn'dir; eski 30 sn kör bekleme yoktur.

## Kullanıcı deneyimi sözleşmesi
Recovery sırasında kullanıcı yalnız spinner görmeyecek. Liste adı, aşama, gerçek katalog durumları, açıklama ve geçen süre gösterilecek. Örnek: `Canlı ✅13114 · Film ⏳ · Dizi ⏳`. Sessizlik uzarsa "Sunucudan yanıt bekleniyor" ve sonra "Yanıt normalden uzun sürüyor; işlem devam ediyor" görünür.

## Telemetri
`PLAYLIST_REPAIR_PROGRESS`, `PLAYLIST_REPAIR_KIND_COMMITTED`, `PLAYLIST_RECOVERY_BARRIER_HIT`, `PLAYLIST_SELF_REPAIR_START`, `PLAYLIST_SELF_REPAIR_PARTIAL`, `PLAYLIST_SELF_REPAIR_OK`, `PLAYLIST_SELF_REPAIR_ERROR` olayları kök neden ayrıştırması için kullanılmalıdır.

## Test durumu
Statik/hard-gate kontrolleri `DOGRULAMA-v17.9.10-RC1.md` dosyasındadır. Bu çalışma ortamında npm bağımlılıkları bulunmadığı için tam tsconfig-bound tsc kapıları çalıştırılamadı. Cihaz/CI testi yapılmadan "cihazda doğrulandı" denmemelidir.

## Sonraki cihaz logunda bakılacaklar
- Her boş kabuk için `PLAYLIST_SELF_REPAIR_START` sonrası progress olayları.
- Hangi katalogun kaç ms sürdüğü.
- `PLAYLIST_REPAIR_KIND_COMMITTED` sırası ve Room sayaçları.
- `PLAYLIST_SELF_REPAIR_OK/PARTIAL/ERROR` finali.
- Aynı hedefe tekrar basmada yalnız `PLAYLIST_SWITCH_SINGLEFLIGHT_JOIN`.
