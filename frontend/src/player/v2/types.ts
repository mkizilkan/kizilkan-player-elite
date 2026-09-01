export type PlaybackEngine = "media3" | "vlc" | "mpv";
export type PlaybackSurface = "surfaceView" | "textureView";
export type VlcDecoder = "hw" | "sw";

export type PlaybackPhase =
  | "idle"
  | "resolving"
  | "connecting"
  | "preparing"
  | "waiting_first_frame"
  | "playing"
  | "recover_surface"
  | "switch_engine"
  | "network_recovery"
  | "final_error";

export type PlaybackErrorKind =
  | "unsupported_codec"
  | "extractor"
  | "decoder"
  | "surface"
  | "http_auth"
  | "http_proxy"
  | "http_forbidden"
  | "http_not_found"
  | "timeout"
  | "network"
  | "source"
  | "unknown";

export type PlaybackRequest = {
  url: string;
  headers: Record<string, string>;
  contentType?: "auto" | "hls" | "dash" | "smoothStreaming" | "progressive";
  channelId: string;
  channelName: string;
  container?: string;
  isLive: boolean;
  expectsVideo: boolean;
  /** Aynı Xtream live stream için güvenli alternatif endpoint adayları. */
  fallbackUrls?: string[];
};

export type ClassifiedPlaybackError = {
  kind: PlaybackErrorKind;
  technical: string;
  userMessage: string;
  httpCode?: number;
  immediateFallback: boolean;
  trySurfaceRecovery: boolean;
  retryNetwork: boolean;
};

export type EngineProfile =
  | { engine: "media3"; surface: PlaybackSurface }
  | { engine: "vlc"; decoder: VlcDecoder }
  | { engine: "mpv"; decoder: "auto" };

export type PlaybackTelemetry = {
  channelId: string;
  profile: EngineProfile;
  firstFrameMs?: number;
  success: boolean;
  errorKind?: PlaybackErrorKind;
  technical?: string;
  at: number;
};
