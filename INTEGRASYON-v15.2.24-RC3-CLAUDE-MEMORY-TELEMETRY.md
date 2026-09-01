# KIZILKAN PLAYER ELITE v15.2.24 RC3 — Claude Memory/Telemetry Entegrasyonu

Kaynaklar: bizim v15.2.24 RC3 + kullanıcının yüklediği `KIZILKAN-PLAYER-v16.0.0-CLAUDE-MEMORY-TELEMETRY.zip`.

## Alınan ve geliştirilenler
1. TV Home Native Core heavy-hydrate guard.
2. TV Home gerçek Room paging + native kategori sorgusu (Claude sürümündeki yalnız guard yaklaşımından ileri).
3. Canonical Room/meta sayaçları.
4. Her diagnostic event'te foreground/app-state ve active-task bağlamı.
5. Token/sequence tabanlı concurrency-safe görev registry.
6. Refresh, MAG aşamaları, Room commit/switch, native panel scan ve player session görev etiketleri.
7. 30 saniye / 240 örnek bounded memorySeries; Java/PSS/system RAM ayrıntıları.
8. Export ve total reset entegrasyonu.
9. Background/doze stall ayrımı.

## Bilinçli olarak alınmayan Claude gerilemeleri
- `index.tsx` Room query hata -> `ensureHeavyLoaded()` full catalog fallback.
- PanelScan dev `ArrayList<Work>` matrisi ve tüm matches'i periodic snapshot'a serialize etme.
- Media3 adaptive timeUpdate azaltımının kaldırılması.
- MAG single-flight/cache/progress/compatibility mekanizmasının geriye alınması.

## Doğrulama
Yeni hard gate `tools/check-v15224-rc3-claude-memory-telemetry.js` hem yeni telemetri özelliklerini hem de eski düzeltmelerin geri dönmediğini kontrol eder.
