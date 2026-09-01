# KIZILKAN PLAYER ELITE v15.2.19-RC1
Tarih: 2026-08-26
Sürüm: 15.2.19
Android versionCode: 150219

Odak: v15.2.18 HARD-gate düzeltmesi + v15.2.18 satır-satır runtime review + state consistency hardening.

Önemli: v15.2.18 CI ilk statik kapıda patladı. Kök neden üç eski gate'in sürüm/string hard-code'ları ve v15.2.18 gate'inin ana zincire bağlanmamasıydı. Düzeltmeler gerçek Node çalıştırmalarıyla doğrulandı.

Runtime ek sertleştirmeler:
- player AppState telemetry stale closure yok,
- stale buffering sadece gizlenmez, state'ten temizlenir,
- playlist switch generation/serialized persist,
- home native page playlist ownership + UI invalidation,
- persistent JSONL black-box journal (8 MiB + 1 archive segment).

Bu sürümün APK build ve fiziksel cihaz acceptance sonucu henüz yoktur.
