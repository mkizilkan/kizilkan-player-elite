# v15.2.19-RC1 REGRESYON DENETİMİ

Korunacak:
- v15.2.17 unified scan app-private staging / candidateSets / pause-resume-cancel / runId.
- v15.2.16 MAG session cache + fresh auth retry + diagnostics.
- v15.2.14 Stalker/Backup fixture ve atomic restore.
- Player Media3 -> MPV/FFmpeg -> VLC fallback.
- Profil session/PIN güvenliği.

Yeni kapılar:
- tüm önceki gate'ler current sürümde ileri uyumlu çalışmalı.
- v15.2.18 gate ana denetle zincirinde olmalı.
- playlist switch stale generation sonucu uygulanmamalı.
- native page owner active playlist ile eşleşmeden eski item render edilmemeli.
- successful+playing session'da stale buffering state temizlenmeli.
- BLACK BOX V2 persistent journal bounded olmalı ve credential redaction korunmalı.

Gerçek cihaz acceptance:
1. A->B playlist switch x20, manuel refresh olmadan doğru katalog.
2. hızlı A->B->C switch, eski kategori/item sızıntısı yok.
3. VOD seek x30, görüntü oynarken spinner kalmıyor.
4. tanılama exportunda APP_STATE/SEEK/PLAYLIST olayları ve journal metadata var.
5. unified scan 7360+ test tekrarları önceki davranışı koruyor.
