# DÜZELTME YORUMU — v17.0.8 RC1

## Kök neden
Paralel workerlarda global cursor yalnız sıradaki atanacak işi gösterir; tamamlanmış contiguous prefixi göstermez. `cursor - workerCount` yaklaşık hesabı, tek bir yavaş worker eski bir indekste kalırken diğer workerlar çok ileri gittiyse güvenli olmayan bir checkpoint üretebilirdi.

## Düzeltme
`ConservativeCursorTracker` her workerın o anda yürüttüğü indeksi `AtomicLongArray` ile izler. Kalıcı checkpoint `min(nextAssigned, tüm inFlight indexleri)` olarak hesaplanır. Böylece checkpoint hiçbir tamamlanmamış indeksin ötesine geçmez. Process restart sonrası bazı işler yeniden denenebilir ancak denenmemiş iş atlanmaz. Sonuç journalı idempotent olduğu için tekrarlar sonuç çoğaltmaz.

Bulk/unified hesap ilerlemesi ve single panel ilerlemesi checkpoint prefixinden yeniden hesaplanır.
