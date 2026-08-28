import type { EngineProfile, PlaybackPhase, ClassifiedPlaybackError } from "./types";

export const LIVE_FAST_BUFFER_MS = 450;
export const FIRST_FRAME_TIMEOUT_LIVE_MS = 3200;
export const FIRST_FRAME_TIMEOUT_VOD_MS = 5000;

export function defaultProfile(isTv: boolean): EngineProfile {
  return { engine: "media3", surface: "surfaceView" };
}

export function alternateMedia3Surface(profile: EngineProfile): EngineProfile | null {
  if (profile.engine !== "media3") return null;
  return { engine: "media3", surface: profile.surface === "surfaceView" ? "textureView" : "surfaceView" };
}

/**
 * v16.2.0 — MPV YETENEK BAYRAĞI (kritik performans düzeltmesi)
 * ---------------------------------------------------------------------------
 * CİHAZ KANITI (28.08.2026 tanı kaydı): 38 motor hatasının 20'si aynı satır —
 *   "MPV başlatılamadı: dev.jdtech.mpv.MPVLib"
 * Yani MPV native sınıfı APK'da yüklenemiyor ve motor HİÇBİR ZAMAN çalışmıyor.
 * Buna rağmen geri düşme zincirinde duruyordu:
 *     Media3 (hata) -> MPV (kütüphane yok) -> VLC
 * Her kanal açılışında MPV adımı boşuna deneniyor; bu hem süreyi uzatıyor
 * (kullanıcı: "kanallar yavaş açılıyor") hem de kayıtları gereksiz hatayla
 * dolduruyordu.
 *
 * Artık MPV bir kez başarısız olduğunda kalıcı olarak devre dışı kalır ve
 * zincir doğrudan VLC'ye geçer. Kütüphane ileride pakete girerse bayrak
 * yeniden açılabilir (setMpvAvailable).
 */
let mpvAvailable = true;

/** MPV kullanılabilirliğini ayarlar (başarısızlıkta false yapılır). */
export function setMpvAvailable(v: boolean): void { mpvAvailable = !!v; }
export function isMpvAvailable(): boolean { return mpvAvailable; }

/** MPV kullanılamıyorsa hedefi VLC'ye çevirir. */
function normalizeEngine(next: EngineProfile | null): EngineProfile | null {
  if (next && next.engine === "mpv" && !mpvAvailable) {
    return { engine: "vlc", decoder: "hw" };
  }
  return next;
}

export function fallbackFromError(
  profile: EngineProfile,
  err: ClassifiedPlaybackError,
): { next: EngineProfile | null; phase: PlaybackPhase } {
  if (profile.engine === "media3") {
    if (err.trySurfaceRecovery) {
      return { next: alternateMedia3Surface(profile), phase: "recover_surface" };
    }
    if (err.immediateFallback || ["unsupported_codec","extractor","decoder","source"].includes(err.kind)) {
      // v15: gerçek fatal codec/extractor/decoder hatasında farklı FFmpeg/libmpv
      // stack'i denenir. MPV native modül yoksa PlayerHost bunu VLC'ye normalize eder.
      return { next: normalizeEngine({ engine: "mpv", decoder: "auto" }), phase: "switch_engine" };
    }
    if (err.retryNetwork) {
      // HTTP/transport farkını bir kez libVLC ile doğrula; Surface/codec zincirine girme.
      return { next: { engine: "vlc", decoder: "hw" }, phase: "network_recovery" };
    }
    return { next: { engine: "vlc", decoder: "hw" }, phase: "switch_engine" };
  }
  if (profile.engine === "mpv") {
    // MPV/FFmpeg farklı codec/demux stack'idir; fatal hata sonrası libVLC
    // hâlâ farklı bir transport/surface yolu olarak denenebilir.
    return { next: { engine: "vlc", decoder: "hw" }, phase: "switch_engine" };
  }
  if (profile.engine === "vlc" && profile.decoder === "hw") {
    return { next: { engine: "vlc", decoder: "sw" }, phase: "switch_engine" };
  }
  // VLC SW son otomatik recovery profilidir.
  return { next: null, phase: "final_error" };
}
