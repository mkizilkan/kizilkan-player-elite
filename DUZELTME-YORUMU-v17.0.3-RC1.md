# DÜZELTME YORUMU — v17.0.3 RC1

## P0 — Çoklu Hesap Tarama Terminal Sonuç Koruması
Mevcut akışta terminal native snapshot'ın otomatik temizlenmesi, process/UI yeniden oluşturma senaryosunda tamamlanmış veya bulunan sonuçların kullanıcıya sabit biçimde gösterilmeden kaybolmasına yol açabilecek bir yaşam döngüsü açığı oluşturuyordu.

Düzeltme:
- Terminal snapshot artık otomatik tüketilmiyor.
- Native `acknowledgeSnapshot(runId)` eklendi ve yalnız terminal state + eşleşen runId + aktif run yok şartlarında snapshot'ı temizliyor.
- UI restore akışı COMPLETED/CANCELLED/FAILED snapshot'ları tekrar açabiliyor ve matches/accountStatuses bilgilerini geri yüklüyor.
- Sıfır eşleşmeli terminal tarama da sonuç modalını koruyabiliyor.
- Process restart sonrasında persisted RUNNING/STARTING/PAUSED/CANCELLING snapshot varsa fakat gerçek native service activeRunId yoksa snapshot `FAILED / PROCESS_RESTARTED` olarak terminalize ediliyor; eşleşmeler korunuyor. Böylece kullanıcıya sahte RUNNING durumu gösterilmiyor.
- Kullanıcı sonucu kapattığında veya hesap ekleme başarıyla tamamlandığında acknowledgement yapılıyor.

## UI — Bulunan Sayısı
- Üst toplam `Bulunan` sayısı > 0 olduğunda aktif tema `brandPrimary` kullanır.
- Her hesap satırındaki `Bulunan` değeri > 0 olduğunda aynı aktif tema rengi kullanır.
- 0 değeri secondary renkte kalır.
- Sabit/hard-coded kırmızı kullanılmaz.

## P0 — MPV Runtime Forensics
- MPVLib class presence ve class initialization ayrı doğrulanır.
- Throwable cause chain korunur.
- APK native lib scan hataları sessizce yutulmaz.
- `nativeLibrariesVerified` class initialized + libmpv + libc++ + ABI doğrulamasını gerektirir.
- MPV create/init/surface/source/cleanup aşamalarında stage bazlı diagnostic eklendi.
- Cleanup aşamaları bağımsız çalışır; bir teardown hatası sonraki cleanup adımlarını engellemez.

## P0 — Room Snapshot Self-Repair
- Snapshot yok fakat canonical Room satırları varsa metadata snapshot gerçek Room count'larından yeniden kurulabilir.
- Boş store + tüm 3 kind payload tam bootstrap olarak kabul edilir.
- Boş store + partial payload fail-closed olur.
- Reconstructed snapshot gerçek live/vod/series satır count'larıyla doğrulanır.
- Sonuçta `snapshotRecovered` / `snapshotRecoveryState` kanıtı TS katmanına ve telemetry'ye taşınır.

## P1 — TV / Player
- TV layout ayar focus'u seçili layout'u takip eder.
- FocusButton native ref forward eder.
- Stable focusKey ile player kapanışında kesin restore yolu güçlendirildi.
- tv-home stable focus kimlikleri eklendi.
- Live preview stale async resolve ownership koruması eklendi.
- Player Quick Guide previous/current/next kanal ve bounded Now/Next EPG ile player içinde çalışır.
- Player kanal geçişleri Recent Channels'a yazılır.
- Numeric zap özel navigation scope varsa aynı exact scope sırasını kullanır.
