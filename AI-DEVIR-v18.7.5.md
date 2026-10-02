# AI DEVİR — v18.7.5 RC1 (Media3 ses + ilk-kare telemetrisi — kanıt toplama)

**Taban:** `v18.7.4-rc1-mac-discovery` (5c632025). **Dal:** `v18.7.5-rc1-media3-audio-telemetry`.
Yalnız telemetri; davranış/mimari değişmedi. Kök neden KANITLANMADAN düzeltme yok (CLAUDE.md "kör düzeltme yapma").

## Neden
1. Cihaz: "bazen Media3'te ses gelmiyor". Kodda ses parçası yalnız `readyToPlay`/`sourceLoad` anında (liste doluysa, `audioTrack` boşsa) seçiliyor; parça listesi GEÇ dolarsa açık seçim yapılmayabilir. Hipotez; kanıt yok çünkü **ses için hiç telemetri yoktu.**
2. Cihaz: "Her zaman" vs "Kapalı" ilk-kare farkı sorusu. Mevcut `FIRST_FRAME` olayı timeshift modunu ETİKETLEMİYORDU → loglardan net kıyas çıkmıyordu (18:xx TRT1 verisi gürültülü, eşleşmedi).

## Yapılan (telemetri)
- `PlayerHost.tsx` Media3 dinleyicilerine `emitMedia3Audio(stage)` eklendi → `MEDIA3_AUDIO_STATE` olayı: `audioCount`, `activeAudioId/Label`, `hasActiveAudio`, **`suspectSilent`** (parça var ama hiçbiri aktif değil = sessizlik adayı). Üç aşama: `readyToPlay`, `sourceLoad`, **ilk-kareden ~1,2 sn sonra** (`post-first-frame`).
- `recordFirstFrameDiagnostic` → `FIRST_FRAME` olayına `timeshiftMode: liveTimeshiftModeRef.current` eklendi → ilk-kare artık moduyla etiketli.
- Kapı: `tools/check-v18705-release.js`; `denetle.js`'e eklendi.

## Doğrulama
`yarn tsc --noEmit` temiz · `node tools/denetle.js` TÜM DENETİMLER TEMİZ · `check-v18705-release.js` PASS · `assembleDebug`: sohbet özeti.

## Cihaz adımları (kanıt yakalama)
1. **Ses:** birkaç Media3 kanalı aç; ses gelmeyen bir kanalda tanı raporunu paylaş → `MEDIA3_AUDIO_STATE` `suspectSilent:true` veya `hasActiveAudio:false` görülürse hipotez doğrulanır; sonra DÜZELTME (v18.7.6): geç dolan parça listesini yeniden seç / ExoPlayer varsayılanını koru.
2. **İlk-kare:** aynı kanalı "Kapalı" ve "Her zaman" modunda aç → iki `FIRST_FRAME` olayındaki `timeshiftMode` + `firstFrameMs` doğrudan kıyaslanır.

## Not — mevcut (etiketsiz) ölçümler
media3 ilk-kare örnekleri: 1414 / 1857 / 2269 ms; mpv: 2269 / 3976 ms (MPV belirgin daha yavaş). Uygulama soğuk açılış ~2,5 sn, sıcak ~0,04–0,25 sn (`am start -W`). "Her zaman" modunda PREPARE kayıtları var; mod-etiketli temiz kıyas v18.7.5 ile yapılacak.
