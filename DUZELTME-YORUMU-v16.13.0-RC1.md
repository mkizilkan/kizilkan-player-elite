# KIZILKAN PLAYER v16.13.0 RC1 — Düzeltme / Geliştirme Yorumu

## Kapsam
Bu RC1, onaylanan v16.13.0 büyük altyapı planının **Database Health Center + güvenli Room bakım + Flight Recorder V6 telemetri omurgası** fazıdır. v16.12.2 PCAP-first MAG, rate-limit ayrımı, credential-boundary, stale-player ownership ve player kontrol düzeltmeleri korunmuştur.

## Database Health Center
Native Room/SQLite katmanına salt-okuma sağlık ölçümü eklendi:
- ana DB, WAL, SHM ve toplam fiziksel boyut,
- `page_count`, `page_size`, `freelist_count`, geri kazanılabilir byte/% ölçümü,
- medya, EPG, diagnostic event ve kritik event kayıt sayıları,
- snapshot'ı olmayan medya/EPG orphan sayıları,
- retention süresi geçmiş EPG ve normal/kritik telemetri adayları,
- istek üzerine `PRAGMA quick_check` ve `PRAGMA foreign_key_check`,
- playlist bazında live/VOD/series/EPG gerçek kayıt sayıları,
- playlist bazında `rawJson` alanlarının gerçek SQLite BLOB byte toplamı (`logicalMediaPayloadBytes`). Bu değer fiziksel disk kullanımı diye sunulmaz; indeks/page overhead içermez.

Sağlık raporu ölçülen nedenleri `healthReasons` ile açıklar ve otomatik veri silmeden en düşük gerekli bakım seviyesini `recommendedMaintenance` ile önerir.

## Bakım modları
- `diagnose`: salt-okuma sağlık/integrity taraması.
- `quick`: `PRAGMA optimize` + PASSIVE WAL checkpoint.
- `normal`: orphan medya/EPG + retention süresi geçmiş EPG/telemetri temizliği, optimize ve PASSIVE checkpoint.
- `deep`: normal bakım + TRUNCATE checkpoint + transaction dışında `VACUUM`; UI'da açık kullanıcı onayı zorunludur.

Normal telemetri retention: 7 gün. Kritik telemetri: 30 gün. EPG retention: 14 gün. Bu RC1 otomatik destructive bakım çalıştırmaz.

Bakım sonucu gerçek silinen satır adetlerini, before/after health snapshot'larını, checkpoint sonucunu, süreyi ve fiziksel boyut değişimini döndürür. WAL davranışı nedeniyle toplam boyut geçici büyüyebileceğinden `reclaimedTotalBytes` negatif olamaz; signed değişim ayrıca `totalBytesDelta` alanında tutulur.

## Room migration
Room şeması v3 -> v4 yükseltildi. `diagnostic_events` tablosuna şu yapılandırılmış alanlar eklendi:
- traceId
- operationId
- stage
- durationMs
- outcome
- errorClass

`MIGRATION_3_4` açık ve non-destructive'tir. `fallbackToDestructiveMigration` eklenmemiştir.

## Flight Recorder V6
Tanı sistemi event yığını yerine korelasyonlu trace modeline genişletildi:
- `beginDiagnosticTrace()`
- `measureDiagnosticStage()`
- trace/operation korelasyonu
- stage süreleri
- outcome/errorClass
- performance p50/p95/max özetleri
- trace summary
- DB Health snapshot'ının export içine eklenmesi

Native Black Box da aynı structured alanları Room'a yazar ve export eder.

## Telemetri güvenliği
Redaction katmanı iki aşamalıdır. Ham credential değerleri engellenirken `tokenPresent`, header shape/count gibi hassas olmayan yapısal fingerprint metadata'sı korunabilir. Export öncesi son serialized tarama MAC, Bearer ve credential benzeri query değerlerini yeniden redact eder. `$1` capture replacement davranışı da düzeltilerek anahtar adları bozulmadan `[REDACTED]` yazılır.

## UI
`diagnostic.tsx` içine Database Health Center eklendi. Toplam/DB/WAL/reclaimable alan, kayıt/orphan/retention sayıları, quick_check/FK durumu, ölçülen sağlık nedenleri ve önerilen bakım seviyesi gösterilir. Tanıla/Hızlı/Normal/Derin bakım seçenekleri vardır; Derin bakım açık onay ister.

## Korunan v16.12.2 sözleşmeleri
- PCAP MAG320 profile-first
- AUTH_REJECT != RATE_LIMIT
- yalnız gerçek rate-limit persistent cooldown
- sanitized MAG request fingerprint telemetry
- portal/media credential boundary
- different-port credential isolation
- resolved Stalker ownership ve raw-command player yasağı
- stale-frame ve controls hardening

## Bu RC1'de henüz tamamlanmayan daha geniş v16.13 fazları
Kategori-seçmeli import, incremental sync, stream URL cache, fallback-source, connection profile, duplicate detection ve MPV native build/runtime düzeltmesi bu RC1'in DB/telemetri fazına dahil edilmemiştir. Bunlar onaylanan v16.13 yol haritasının sonraki aşamalarıdır; tamamlanmış gibi gösterilmemektedir.
