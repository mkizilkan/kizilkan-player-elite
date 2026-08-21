# KIZILKAN MPV Android Module — v15.0.1 BUILD FIX

Android-only third playback engine built on `dev.jdtech.mpv:libmpv:0.5.1` (MIT).
It is not the default engine. Player V2 invokes it only for explicit MPV selection or
real fatal codec/extractor/decoder failures when AUTO recovery needs a genuinely
different FFmpeg/libmpv stack.

The module deliberately has no timer-based "black screen" destructive watchdog.
Surface lifecycle is owned by a single native `SurfaceView`; runtime stalls restart
the same profile before any engine fallback.
