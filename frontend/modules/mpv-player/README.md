# KIZILKAN MPV Android Module — v15.1.0-RC1

Android-only playback engine built on `dev.jdtech.mpv:libmpv:1.0.0`.

v15.1.0-RC1 migrates from the old global/static 0.5.1 usage to libmpv-android 1.0.0's breaking **multiple-instance** API. Each `KizilkanMpvView` owns its own `MPVLib` instance, observers and Surface lifecycle; cleanup stops playback, detaches the Surface, removes observers and destroys only that instance.

The module remains a separate engine behind PlayerHost. AUTO orchestration keeps the project contract **Media3 → MPV/FFmpeg → VLC** and does not treat a timer-only stall as automatic destructive engine fallback.

Native diagnostics expose session-relevant Surface, codec/format/hwdec and MPV event information so 4K black-video and ZAP/session leakage can be diagnosed on real devices instead of hidden by blind fallback.
