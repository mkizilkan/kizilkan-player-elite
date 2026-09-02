import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Platform,
  Modal,
  ScrollView,
  Dimensions,
  TextInput,
  Alert,
  useWindowDimensions,
  KeyboardAvoidingView,
  AppState,
} from "react-native";
import { useRouter } from "expo-router";
import { usePlayer } from "@/src/player/PlayerContext";
import { loadPlayerNavigationScope } from "@/src/player/navigationScope";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  PlaybackSessionGate,
  buildPlaybackRequest,
  classifyPlaybackError,
  defaultProfile,
  alternateMedia3Surface,
  setMpvAvailable,   // v16.2.0: MPV kütüphanesi yoksa motoru zincirden çıkar
  fallbackFromError,
  loadEngineProfile,
  recordEngineSuccess,
  recordEngineFailure,
  LIVE_FAST_BUFFER_MS,
  FIRST_FRAME_TIMEOUT_LIVE_MS,
  FIRST_FRAME_TIMEOUT_VOD_MS,
  PLAYER_BUFFER_KEY,
  PLAYER_BUFFER_V2_MIGRATION_KEY,
  PLAYER_BUFFER_V15_MIGRATION_KEY,
  PLAYER_BUFFER_DEFAULT_MS,
  PLAYER_BUFFER_OPTIONS,
  bufferLabel,
  STALL_CHECK_INTERVAL_MS,
  LIVE_SOFT_STALL_MS,
  LIVE_HARD_STALL_MS,
  VOD_SOFT_STALL_MS,
  VOD_HARD_STALL_MS,
  PLAYER_UI_TIME_UPDATE_MS,
  PLAYER_BACKGROUND_TIME_UPDATE_MS,
  makePlaybackClock,
  notePlaybackPosition,
  type EngineProfile,
  type PlaybackPhase,
  type ClassifiedPlaybackError,
  classifyHttpRecovery, extractHttpStatus, fingerprintPlaybackUrl, shouldRenewResolvedSource,
} from "@/src/player/v2";
import * as ScreenOrientation from "expo-screen-orientation";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue } from "react-native-reanimated";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useLibrary } from "@/src/store/LibraryContext";
import { createFlightRecorderChildTrace, getCurrentFlightRecorderTrace, markTask, recordDiagnostic, recordBlackBox, recordFlightRecorderStage } from "@/src/utils/diagnostics";
import { storage } from "@/src/utils/storage";
import { haptic } from "@/src/utils/haptic";
import { CastButton } from "@/src/components/CastButton";
import { SeekBar, formatTime as fmtDur } from "@/src/components/SeekBar";
import { useTv } from "@/src/store/TvContext";
import { useTVFocus } from "@/src/hooks/useTVFocus";
import { FocusButton } from "@/src/components/FocusButton";
import { useRemoteKeys } from "@/src/hooks/useRemoteKeys";
import { TvFocusScope, useTvFocusMemory } from "@/src/store/TvFocusMemoryContext";
import { testStream, DEFAULT_USER_AGENT } from "@/src/utils/streamTest";
import { loadOverrides, type OverrideMap } from "@/src/utils/overrides";
import { BackHandler } from "react-native";
import { VLCPlayer as VLCPlayerLib, VLC_AVAILABLE } from "@/src/native/vlc";
import { KizilkanMpvView, KIZILKAN_MPV_AVAILABLE, getKizilkanMpvRuntimeStatus, type KizilkanMpvHandle } from "@/modules/mpv-player";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";

const EPISODE_URL_KEY = "kizilkan.episode.url.";
const PLAYER_NAV_KEY = "kizilkan.player.nav.";
const PLAYER_SERIES_NAV_KEY = "kizilkan.player.seriesNav.";
const FocusGuide: any = (require("react-native") as any).TVFocusGuideView || View;
type Fit = "contain" | "cover" | "fill";
// v15.0.1 BUILD FIX: kayıt hedefi UI zaten mevcut; union gerçek ekran durumunu eksiksiz kapsar.
type SheetType = "sleep" | "audio" | "subtitle" | "speed" | "stats" | "buffer" | "engine" | "audiodelay" | "jump" | "recordTarget" | null;

/** Ağ tamponu seçenekleri (ms). Yüksek = daha az takılma, daha geç açılış. */
/**
 * TAMPON SEÇENEKLERİ
 * v7.7.0: 0 ve 300 ms eklendi (kullanıcı isteği: "tampon yok").
 *
 * DÜRÜST NOT: libVLC'de tampon TAMAMEN sıfırlanamaz — 0 verildiğinde
 * kütüphane kendi asgari değerine (~100-200 ms) düşer. Bu yüzden seçeneğin
 * adı "Tampon yok" değil "En düşük"; abartılı bir vaat vermiyoruz.
 * Canlı/feed yayınlarda gecikmeyi en aza indirir ama takılma riski artar.
 */
const BUFFER_OPTIONS = PLAYER_BUFFER_OPTIONS;
const BUFFER_KEY = PLAYER_BUFFER_KEY;
const BUFFER_V2_MIGRATION_KEY = PLAYER_BUFFER_V2_MIGRATION_KEY;
const BUFFER_V15_MIGRATION_KEY = PLAYER_BUFFER_V15_MIGRATION_KEY;
const ENGINE_KEY = "kizilkan.player.engine";   // "auto" | "vlc" | "exo" | "mpv"

/**
 * MOTOR HAFIZASI (v7.3.0)
 * ---------------------------------------------------------------------------
 * SORUN: "Otomatik" modda her açılışta aynı deneme-yanılma yaşanıyordu:
 * ExoPlayer dene -> olmadı -> VLC'ye düş. Kullanıcı her seferinde 3-5 saniye
 * bekliyordu; oysa o kanalın hangi motorla açıldığı zaten biliniyordu.
 *
 * ÇÖZÜM: Bir kanal SORUNSUZ oynadığında, hangi motorla oynadığı kaydedilir.
 * Aynı kanal tekrar açıldığında doğrudan o motorla başlar — bekleme biter.
 * Kayıt kanal kimliğine göre tutulur ve hata olursa temizlenir.
 */
/**
 * TV mi? (senkron ilk tahmin)
 * useTv() bir hook olduğu için useState başlangıcında kullanılamaz.
 * Bu yüzden ilk değer için ekran oranına bakan hafif bir tahmin kullanılıyor;
 * yanlış tahmin en fazla panelin bir kez görünmesine yol açar, işlev bozulmaz.
 */
function isTvInitial(): boolean {
  try {
    const { width, height } = Dimensions.get("window");
    // TV ekranları geniş ve yataydır; telefonlar dikey veya dar.
    return width >= 960 && width / height >= 1.6;
  } catch { return false; }
}

const engineMemoKey = (channelId: string) => `kizilkan.engineMemo.${channelId}`;
const HWACCEL_KEY = "kizilkan.player.hwaccel"; // true | false
/**
 * YÜZEY TİPİ (v9.9.0) — "ses var/görüntü yok" ile "4K HEVC decoder patlaması"
 * arasındaki dengeyi kullanıcıya/otomatiğe bırakır.
 *  - "auto"    : TV'de TextureView; decoder hatası gelince otomatik SurfaceView
 *  - "texture" : her zaman TextureView (kompozisyon sorunsuz, ama bazı donanım
 *                çözücüleri devre dışı kalıp ağır formatlarda yazılıma düşebilir)
 *  - "surface" : her zaman SurfaceView (donanım çözücü çalışır; bazı kutularda
 *                delik-delme yüzünden görüntü gelmeyebilir)
 */
const SURFACE_KEY = "kizilkan.player.surface"; // "auto" | "texture" | "surface"
type SurfaceMode = "auto" | "texture" | "surface";

const AUDIO_DELAY_KEY = "kizilkan.player.audioDelay"; // ms

/** Ses gecikmesi seçenekleri (ms). Negatif = ses erken gelsin. */
const AUDIO_DELAY_OPTIONS = [-1000, -500, -250, 0, 250, 500, 1000];

/** "Süreye Git" hızlı atlama adımları (saniye). */
const JUMP_STEPS = [-600, -300, -60, 60, 300, 600];

/** Yüzdeye atlama noktaları. */
const JUMP_PERCENTS = [10, 25, 50, 75, 90];

/**
 * "1:23:45", "23:45" veya "45" biçimindeki metni saniyeye çevirir.
 * Geçersizse null döner.
 */
function parseTimeInput(text: string): number | null {
  const t = (text || "").trim();
  if (!t) return null;
  // Sadece rakam ve : kabul
  if (!/^[0-9:]+$/.test(t)) return null;
  const parts = t.split(":").map(p => p.trim());
  if (parts.some(p => p === "" || Number.isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  let sec = 0;
  if (nums.length === 1) sec = nums[0];                                  // saniye
  else if (nums.length === 2) sec = nums[0] * 60 + nums[1];              // dk:sn
  else if (nums.length === 3) sec = nums[0] * 3600 + nums[1] * 60 + nums[2]; // sa:dk:sn
  else return null;
  return Number.isFinite(sec) && sec >= 0 ? Math.floor(sec) : null;
}

type Engine = "auto" | "vlc" | "exo" | "mpv";

const SLEEP_OPTIONS = [
  { label: "15 dakika", minutes: 15 },
  { label: "30 dakika", minutes: 30 },
  { label: "45 dakika", minutes: 45 },
  { label: "1 saat", minutes: 60 },
  { label: "2 saat", minutes: 120 },
];

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export default function PlayerHost() {
  const router = useRouter();
  // Telefonun gezinme çubuğu/çentik alanı — kontroller altına gizlenmesin.
  const insets = useSafeAreaInsets();
  const { isTv, overscan } = useTv();
  const { width: screenW } = useWindowDimensions();
  const { colors } = useTheme();
  const { source, visible, closePlayer, switchChannel, switchContent } = usePlayer();
  const { requestRouteRestore } = useTvFocusMemory("player");
  const wasVisibleRef = useRef(false);
  const params = (source ?? { id: "", ext: undefined, kind: "live" }) as {
    id: string;
    ext?: string;
    kind?: "live" | "vod" | "series" | "catchup" | "external";
    resumeAt?: number;
  };
  const sessionKind = params.kind ?? (params.ext === "true" ? "external" : "live");
  const isSynthetic = sessionKind !== "live";

  // v17.0.0 TV focus restore: kalıcı PlayerHost kapandığında alttaki route
  // unmount edilmez; son stable focus key native TV focus engine'e yeniden istenir.
  useEffect(() => {
    const previous = wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (previous && !visible) {
      const timer = setTimeout(() => requestRouteRestore(), 40);
      return () => clearTimeout(timer);
    }
  }, [visible, requestRouteRestore]);
  const { activePlaylist, toggleFavorite, isFavorite, ensureHeavyLoaded } = usePlaylists();
  const [nativeLiveChannel, setNativeLiveChannel] = useState<any | null>(null);

  /**
   * v16.14.8 PERFORMANCE: Player hot-path artık Android Native Core'da bütün
   * playlisti JS/Hermes heap'ine hydrate etmez. Kanal tıklaması yalnız tek Room
   * satırını ID ile alır. 20K-100K kataloglarda kanal açılışından önceki büyük
   * JSON okuma/array üretme ve RAM sıçraması böylece kritik yoldan çıkar.
   * Web/legacy davranışı korunur.
   */
  useEffect(() => {
    let cancelled = false;
    if (isSynthetic || !activePlaylist?.id || !params.id) {
      setNativeLiveChannel(null);
      return () => { cancelled = true; };
    }
    if (!KizilkanNativeCore.available) {
      void ensureHeavyLoaded(activePlaylist.id);
      return () => { cancelled = true; };
    }
    const startedAt = Date.now();
    setNativeLiveChannel(null);
    void KizilkanNativeCore.getItemsByIds<any>(activePlaylist.id, "live", [String(params.id)])
      .then(async rows => {
        if (cancelled) return;
        let item = Array.isArray(rows) ? rows[0] || null : null;
        if (!item) {
          // Fail-safe regression path: Room satırı olağan dışı biçimde eksikse eski
          // katalog dosyasını yalnız BU hata durumunda yükle; normal hot-path'i ağırlaştırma.
          const hydrated = await ensureHeavyLoaded(activePlaylist.id);
          if (cancelled) return;
          item = hydrated?.channels?.find((c:any) => String(c.id) === String(params.id)) || null;
        }
        setNativeLiveChannel(item);
        const elapsedMs = Date.now() - startedAt;
        void recordDiagnostic("database", "PLAYER_CHANNEL_ROOM_LOOKUP", {
          playlistId: String(activePlaylist.id), channelId: String(params.id), found: !!item, elapsedMs,
        }, { stage: "playerChannelLookup", durationMs: elapsedMs, outcome: item ? "success" : "failed" });
      })
      .catch(error => {
        if (cancelled) return;
        void recordDiagnostic("database", "PLAYER_CHANNEL_ROOM_LOOKUP_FAILED", {
          playlistId: String(activePlaylist.id), channelId: String(params.id), elapsedMs: Date.now() - startedAt, error: String((error as any)?.message || error),
        }, { stage: "playerChannelLookup", durationMs: Date.now() - startedAt, outcome: "failed" });
      });
    return () => { cancelled = true; };
  }, [activePlaylist?.id, ensureHeavyLoaded, isSynthetic, params.id]);
  const { setProgress: setLibProgress } = useLibrary();

  const [externalStream, setExternalStream] = useState<{ url: string; name: string; group: string; container_ext: string; poster?: string | null; seriesNavKey?: string } | null>(null);
  const [seriesNavigationItems, setSeriesNavigationItems] = useState<any[]>([]);
  const [orderedNavigationScopeIds, setOrderedNavigationScopeIds] = useState<string[] | null>(null);
  const [playbackNeighbors, setPlaybackNeighbors] = useState<{ previous:any|null; next:any|null; position:number; total:number; source:"room"|"legacy"|"synthetic" } | null>(null);
  const [syntheticNav, setSyntheticNav] = useState<{ previousId?: string | null; nextId?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * KONTROL PANELİ BAŞLANGIÇ DURUMU (v8.6.0 — kullanıcı bildirimi)
   * SORUN: Her kanal açılışında ayar paneli (Exo/Ses/Altyazı/Tampon...)
   * ekranda beliriyordu. Hızlı kanal geçişinde bu çok rahatsız edici:
   * kullanıcı yayını değil menüyü görüyordu.
   * ÇÖZÜM: TV'de KAPALI başlar — kullanıcı OK tuşuna basınca açılır,
   * tekrar basınca kapanır. Telefonda dokunmatik olduğu için AÇIK başlar
   * (kullanıcı düğmelerin nerede olduğunu görsün).
   */
  /**
   * KONTROL PANELİ BAŞLANGIÇ (v9.1.0 — kullanıcı isteği)
   * Kanal açılışında ve zap sırasında ayar kutusu (Tampon/Kayıt/Altyazı...)
   * kendiliğinden çıkıyordu; kullanıcı yayını değil menüyü görüyordu.
   * ARTIK HER CİHAZDA KAPALI başlar. Kullanıcı ekrana dokununca
   * (TV'de OK'a basınca) açılır.
   */
  const [showControls, setShowControls] = useState(false);
  const [numericZapText, setNumericZapText] = useState("");
  const numericZapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fit, setFit] = useState<Fit>("contain");
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  // VLC medyası sarılabilir mi (canlı yayında false) — seek çökme koruması için.
  const [isSeekable, setIsSeekable] = useState(false);
  // Ağ tamponu (ms) — takılma yaşayan kullanıcı artırabilir.
  const [bufferMs, setBufferMs] = useState<number>(PLAYER_BUFFER_DEFAULT_MS);

  // Oynatıcı motoru ve donanım hızlandırma — kullanıcı ayarı.
  const [engine, setEngine] = useState<Engine>("auto");
  const [hwAccel, setHwAccel] = useState(true);
  /**
   * YÜZEY TİPİ (v9.9.0). surfaceMode kullanıcı ayarı; decoderRetrySurface ise
   * "auto" modda decoder hatası sonrası bu kanal için SurfaceView'a geçildiğini
   * işaretler (kanal değişince sıfırlanır).
   */
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("auto");
  const [decoderRetrySurface, setDecoderRetrySurface] = useState(false);
  const [audioDelay, setAudioDelay] = useState(0);
  const [jumpText, setJumpText] = useState("");
  const [testing, setTesting] = useState(false);
  // v15 — Xtream aynı stream için .ts/.m3u8 alternatif endpoint rotasyonu.
  const [playbackUrlIndex, setPlaybackUrlIndex] = useState(0);

  useEffect(() => {
    Promise.all([
      storage.getItem<number>(BUFFER_KEY, PLAYER_BUFFER_DEFAULT_MS),
      storage.getItem<boolean>(BUFFER_V2_MIGRATION_KEY, false),
      storage.getItem<boolean>(BUFFER_V15_MIGRATION_KEY, false),
    ]).then(async ([v, v2Migrated, v15Migrated]) => {
      if (typeof v !== "number") return;

      // v14'ün otomatik 450 ms varsayılanı bazı jitter'lı IPTV akışlarında
      // runtime stall riskini artırdı. v15 bir kez Dengeli 1500 ms'e taşır.
      // Kullanıcı isterse Ayarlar/Player panelinden tekrar Hızlı 450 ms seçebilir.
      if (!v15Migrated && v === LIVE_FAST_BUFFER_MS) {
        setBufferMs(PLAYER_BUFFER_DEFAULT_MS);
        await storage.setItem(BUFFER_KEY, PLAYER_BUFFER_DEFAULT_MS);
        await storage.setItem(BUFFER_V15_MIGRATION_KEY, true);
      } else {
        setBufferMs(v);
        if (!v15Migrated) await storage.setItem(BUFFER_V15_MIGRATION_KEY, true);
      }
      if (!v2Migrated) await storage.setItem(BUFFER_V2_MIGRATION_KEY, true);
    });
    storage.getItem<string>(ENGINE_KEY, "auto").then(v => {
      if (v === "auto" || v === "vlc" || v === "exo" || v === "mpv") setEngine(v);
    });
    storage.getItem<boolean>(HWACCEL_KEY, true).then(v => {
      if (typeof v === "boolean") setHwAccel(v);
    });
    storage.getItem<string>(SURFACE_KEY, "auto").then(v => {
      if (v === "auto" || v === "texture" || v === "surface") setSurfaceMode(v);
    });
    storage.getItem<number>(AUDIO_DELAY_KEY, 0).then(v => {
      if (typeof v === "number") setAudioDelay(v);
    });
  }, []);
  const [sheet, setSheet] = useState<SheetType>(null);
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<string>("");
  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<any[]>([]);
  // VLC parça seçimi: native taraf eksik alanları 0'a düşürdüğü için ÜÇÜ DE
  // gerçek id ile gönderilmeli (video id'si olmadan gönderirsek video kapanır).
  const [vlcVideoTrackId, setVlcVideoTrackId] = useState<number | undefined>(undefined);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | undefined>(undefined);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<number | undefined>(undefined);
  const [selectedAudio, setSelectedAudio] = useState<any | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<any | null>(null);
  const [recordFlash, setRecordFlash] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number>(1.0);
  const [gestureFlash, setGestureFlash] = useState<string | null>(null);
  const [videoStats, setVideoStats] = useState<{ width?: number; height?: number; duration?: number; currentTime?: number; position?: number; mpvCodec?: string; mpvFormat?: string; mpvHwdec?: string; mpvEvent?: string }>({});
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** v16.12.0: eski timer callback'i yeni kullanıcı etkileşimini kapatamaz. */
  // v16.12.1 recheck: stale-hide ve double-touch koruması ikinci doğrulamada tekrar onaylandı.
  const controlsHideGenerationRef = useRef(0);
  const lastControlsRevealAtRef = useRef(0);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reanimated shared values for gesture visual feedback (unused for now but reserved)
  const _seekPreview = useSharedValue(0);
  const _speedIndicator = useSharedValue(0);

  // Dual-engine state: switch to VLC on ExoPlayer error (native only)
  const [useVLC, setUseVLC] = useState(false);
  // GPT ELITE v13.0.0 — motor sağlığı gerçek video çıktısına göre izlenir.
  const [exoReady, setExoReady] = useState(false);
  const [exoFirstFrame, setExoFirstFrame] = useState(false);
  const [exoRecoveryStep, setExoRecoveryStep] = useState(0); // 0 normal, 1 alternatif surface denendi
  const [vlcVideoReady, setVlcVideoReady] = useState(false);
  const [vlcVideoMetaReady, setVlcVideoMetaReady] = useState(false);
  const [vlcRecoveryGeneration, setVlcRecoveryGeneration] = useState(0);
  const [vlcAutoSoftware, setVlcAutoSoftware] = useState(false);
  // GPT ELITE v15 — gerçek üçüncü motor: libmpv/FFmpeg (Android-only).
  const [mpvVideoReady, setMpvVideoReady] = useState(false);
  const [mpvVideoMetaReady, setMpvVideoMetaReady] = useState(false);
  const [mpvRecoveryGeneration, setMpvRecoveryGeneration] = useState(0);
  // v15.1 RC — 4K/HEVC first-frame recovery. MPV once hardware path
  // produces audio/clock but no verified video, a FRESH native instance is
  // remounted with software decoding. We never mutate a broken decoder in place.
  const [mpvForceSoftware, setMpvForceSoftware] = useState(false);
  const [memoSurfaceOverride, setMemoSurfaceOverride] = useState<"surfaceView" | "textureView" | null>(null);
  /**
   * KANAL BAŞINA AYARLAR (v7.3.0)
   * Kullanıcının bu kanal için tanımladığı özel User-Agent / Referer.
   * Bazı yayınlar bunlar olmadan açılmıyor.
   */
  const [overrides, setOverrides] = useState<OverrideMap>({});
  /**
   * STALKER YAYIN ADRESİ (v9.1.0)
   * MAG portallarında kanal listesindeki adres bir KOMUTTUR, doğrudan
   * oynatılamaz. Gerçek adres her açılışta create_link ile alınır ve
   * KISA SÜRELİDİR. Bu yüzden burada çözülüp oynatıcıya veriliyor.
   */
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  /** v16.12.0: resolved URL yalnız ait olduğu Stalker kanalında kullanılabilir. */
  const [resolvedStalkerKey, setResolvedStalkerKey] = useState<string>("");
  const stalkerResolveGenerationRef = useRef(0);
  const [resolvedHeaders, setResolvedHeaders] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState(false);
  const [stalkerFreshResolveNonce, setStalkerFreshResolveNonce] = useState(0);
  const stalkerPlaybackRefreshRef = useRef(0);
  const stalkerForceFreshRequestedRef = useRef(false);


  const [isRecording, setIsRecording] = useState(false);   // DVR kaydı (v7.3.0)
  const [recordStart, setRecordStart] = useState<number | null>(null);
  const [recordDirLabel, setRecordDirLabel] = useState("Uygulama klasörü");
  const [recordPath, setRecordPath] = useState<string | null>(null);   // onRecordChanged'dan
  const [customRecordDir, setCustomRecordDir] = useState<string | null>(null);
  const [recBlink, setRecBlink] = useState(true);  // kayıt başlangıcı (v7.5.0)
  /**
   * CANLI BİLGİ PANELİ (v7.5.0)
   * Bilgi paneli AÇIKKEN saniyede bir yenilenir; böylece süre, kayıt süresi
   * ve durum anlık görünür. Panel kapalıyken zamanlayıcı çalışmaz (pil dostu).
   */
  const [statsTick, setStatsTick] = useState(Date.now());
  /**
   * KAYDIRMA İLE SES KONTROLÜ (v7.7.0 — kullanıcı isteği)
   * Ekranın SAĞ yarısında parmağı yukarı/aşağı kaydırmak sesi ayarlar.
   * (Standart oynatıcı deseni: MX Player, VLC, YouTube hepsi böyle yapar.)
   *
   * PARLAKLIK NOTU: Sol yarıda parlaklık için expo-brightness paketi gerekir;
   * projede kurulu DEĞİL. Paket eklemek native derleme riskidir, bu yüzden
   * şimdilik SES uygulandı. Parlaklık istenirse ayrı bir adımda eklenebilir.
   */
  const [volume, setVolume] = useState(100);
  const [volumeHint, setVolumeHint] = useState<number | null>(null);
  const volumeStartRef = useRef(100);
  const volHintTimer = useRef<any>(null);
  /**
   * YAYIN (CAST) OTURUMU (v7.4.0)
   * TV'ye yayın yaparken telefondaki ileri/geri/duraklat düğmeleri LOKAL
   * oynatıcıyı kontrol ediyordu; TV'de hiçbir şey değişmiyordu.
   * Bağlıyken bu komutlar artık TV'deki oynatıcıya gönderiliyor.
   */
  const [castSession, setCastSession] = useState<any>(null);
  // v15.2.5 Cast authority state: remote receiver bağlıyken son gerçek remote
  // konum/capability burada tutulur. Session kapanınca local player bu konumdan
  // devralır; React render gecikmesine güvenilmez.
  const castRemotePositionRef = useRef(0);
  const castLiveSeekableRangeRef = useRef<{ startTime: number; endTime: number } | null>(null);
  const castRemotePlayerStateRef = useRef("");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const previous = appStateRef.current;
      appStateRef.current = state;
      const ctx = playerTelemetryContextRef.current;
      void recordBlackBox("APP_STATE", { previous, state, ...ctx, buffering: isBufferingRef.current });
      // Arka planda Android player/view lifecycle değişebilir. Geri dönüşte
      // stall kronometresini sıfırla; background süresini "donma" sanma.
      if (state === "active") {
        const now = Date.now();
        media3ClockRef.current = { ...media3ClockRef.current, lastEventAt: now, lastAdvanceAt: now };
        vlcClockRef.current = { ...vlcClockRef.current, lastEventAt: now, lastAdvanceAt: now };
        mpvClockRef.current = { ...mpvClockRef.current, lastEventAt: now, lastAdvanceAt: now };
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const status = getKizilkanMpvRuntimeStatus();
    void recordDiagnostic('player', 'MPV_RUNTIME_STATUS', status, { stage: 'enginePrepare', outcome: status?.nativeLibrariesVerified ? 'success' : 'failed' });
  }, []);

  useEffect(() => {
    if (!activePlaylist?.id) return;
    let alive = true;
    loadOverrides(activePlaylist.id)
      .then(m => { if (alive) setOverrides(m || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activePlaylist?.id]);
  const vlcRef = useRef<any>(null);
  const vlcPlayingRef = useRef(false);
  const mpvRef = useRef<KizilkanMpvHandle | null>(null);
  const mpvPlayingRef = useRef(false);
  // v14.2.0 — yüksek frekanslı native event'ler state'e değil önce ref'e akar.
  // Böylece VLC TimeChanged her event'te 80+ hook'lu PlayerHost'u yeniden render etmez.
  const vlcClockRef = useRef(makePlaybackClock());
  const mpvClockRef = useRef(makePlaybackClock());
  const media3ClockRef = useRef(makePlaybackClock());
  const playbackDurationRef = useRef(0);
  const lastVlcUiUpdateRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const playerTelemetryContextRef = useRef({ visible: false, channelId: "", phase: "idle", engine: "media3" });
  const isPlayingRef = useRef(isPlaying);
  const isBufferingRef = useRef(isBuffering);
  const showControlsRef = useRef(showControls);
  const sheetRef = useRef<SheetType>(sheet);
  // GPT ELITE v15.0.0 — v14.2 runtime crash fix: ref writes come after useRef declarations.
  isPlayingRef.current = isPlaying;
  isBufferingRef.current = isBuffering;
  showControlsRef.current = showControls;
  sheetRef.current = sheet;
  const stallRecoveryRef = useRef<{ sid: number; profileKey: string; softDone: boolean; hardDone: boolean; softAt?: number }>({ sid: 0, profileKey: "", softDone: false, hardDone: false });
  // Kullanıcı seek'i / resume seek'i sonrası watchdog'a kısa bir bağışıklık penceresi.
  // Seek sırasında clock'un doğal olarak durması "stall" sayılmamalı.
  const userSeekGraceUntilRef = useRef(0);
  const appliedResumeKeyRef = useRef("");
  const resumeAttemptRef = useRef<{ key: string; target: number; attempts: number; confirmed: boolean }>({ key: "", target: 0, attempts: 0, confirmed: false });
  // GPT ELITE v14.0.0 — Player V2 session/controller state.
  const sessionGateRef = useRef(new PlaybackSessionGate());
  const sessionStartedAtRef = useRef(Date.now());
  const playerSelectionStartedAtRef = useRef(Date.now());
  const playerDiagnosticSessionRef = useRef("");
  // v16.14.2 P0: render/native callback ownership. Playlist+channel+session+candidate+engine
  // birleşik tokenı uyuşmayan callback UI state'ini değiştiremez.
  const playbackOwnerRef = useRef("");
  const lifecycleTraceRef = useRef("");
  const sourceProvenanceRef = useRef<{ fingerprint: string; createdAt: number; origin: "stalker_create_link" | "xtream" | "m3u" | "external" | "unknown"; candidateIndex: number }>({ fingerprint: "", createdAt: 0, origin: "unknown", candidateIndex: 0 });
  const transitioningSessionRef = useRef<number | null>(null);
  // Aynı kanalın alternatif .ts/.m3u8 URL'sine geçerken aktif motoru koru.
  const nextSessionProfileRef = useRef<EngineProfile | null>(null);
  const successfulSessionRef = useRef<number | null>(null);
  const successfulSessionAtRef = useRef(0);
  const rebufferActiveRef = useRef<{ sid: number; startedAt: number; engine: string } | null>(null);
  const rebufferSequenceRef = useRef(0);
  const [activeSessionId, setActiveSessionId] = useState(0);
  const [profileReadySessionId, setProfileReadySessionId] = useState(0);
  const [v2Profile, setV2Profile] = useState<EngineProfile>({ engine: "media3", surface: "surfaceView" });
  const [v2Phase, setV2Phase] = useState<PlaybackPhase>("idle");
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [playbackRetryNonce, setPlaybackRetryNonce] = useState(0);
  const v2ProfileKey =
    v2Profile.engine === "media3"
      ? `media3:${v2Profile.surface}`
      : v2Profile.engine === "vlc"
        ? `vlc:${v2Profile.decoder}`
        : "mpv:auto";
  const useMPV = v2Profile.engine === "mpv";
  const activeProfileKeyRef = useRef(v2ProfileKey);
  activeProfileKeyRef.current = v2ProfileKey;

  // v15.2.19: v15.2.18 yalnız spinner renderını gizliyordu; isBuffering=true
  // state'i içeride yaşayabiliyordu. Aynı başarılı session gerçekten oynuyorsa
  // bu stale buffering state'idir ve state makinesinden temizlenir.
  useEffect(() => {
    if (!isBuffering || !isPlaying || activeSessionId <= 0) return;
    if (successfulSessionRef.current !== activeSessionId) return;
    setIsBuffering(false);
    isBufferingRef.current = false;
    void recordDiagnostic("player", "STALE_BUFFERING_CLEARED", {
      engine: v2Profile.engine,
      phase: v2Phase,
      activeSessionId,
    }, { sessionId: playerDiagnosticSessionRef.current });
  }, [isBuffering, isPlaying, activeSessionId, v2Profile.engine, v2Phase]);

  useEffect(() => {
    let alive = true;

    // GPT v10.4.0: LIVE session'a geçildiği anda eski VOD/Series/External
    // payload'unu render yolundan çıkar. Eski film state'i canlı kanalı
    // gölgeleyemez.
    if (!isSynthetic || !params.id) {
      setExternalStream(null);
      return () => { alive = false; };
    }

    // Yeni synthetic id yüklenirken bir önceki filmin karesi/URL'si kullanılmasın.
    setExternalStream(null);
    storage.getItem<string>(EPISODE_URL_KEY + params.id, "").then(raw => {
      if (!alive) return;
      if (!raw) {
        setError("Oynatma kaynağı bulunamadı.");
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (alive) setExternalStream(parsed);
      } catch {
        if (alive) setError("Oynatma kaynağı okunamadı.");
      }
    }).catch(() => {
      if (alive) setError("Oynatma kaynağı yüklenemedi.");
    });

    return () => { alive = false; };
  }, [params.id, isSynthetic]);

  // v17.0.0: Dizi bölüm gezinmesi için yalnız komşu synthetic ID'leri yüklenir.
  // Bu veri Detail ekranında hazırlanır; PlayerHost bütün sezonu taşımaz.
  useEffect(() => {
    let alive = true;
    if (sessionKind !== "series" || !params.id) { setSyntheticNav(null); return () => { alive = false; }; }
    setSyntheticNav(null);
    storage.getItem<string>(PLAYER_NAV_KEY + params.id, "").then(raw => {
      if (!alive || !raw) return;
      try { setSyntheticNav(JSON.parse(raw)); } catch { setSyntheticNav(null); }
    }).catch(() => { if (alive) setSyntheticNav(null); });
    return () => { alive = false; };
  }, [params.id, sessionKind]);

  useEffect(() => {
    let alive = true;
    const key = sessionKind === "series" ? externalStream?.seriesNavKey : undefined;
    if (!key) { setSeriesNavigationItems([]); return () => { alive = false; }; }
    storage.getItem<string>(PLAYER_SERIES_NAV_KEY + key, "").then(raw => {
      if (!alive || !raw) return;
      try {
        const parsed = JSON.parse(raw);
        setSeriesNavigationItems(Array.isArray(parsed?.items) ? parsed.items : []);
      } catch { setSeriesNavigationItems([]); }
    }).catch(() => { if (alive) setSeriesNavigationItems([]); });
    return () => { alive = false; };
  }, [sessionKind, externalStream?.seriesNavKey]);

  const channel = useMemo(() => {
    // externalStream yalnız synthetic session'da geçerlidir. Bu koşul,
    // VOD -> LIVE geçişinde bayat film state'inin canlı kanalı ezmesini
    // yapısal olarak imkânsız hale getirir.
    if (isSynthetic && externalStream) {
      return {
        id: params.id as string,
        name: externalStream.name,
        group: externalStream.group,
        url: externalStream.url,
        container_ext: externalStream.container_ext,
      } as any;
    }
    if (isSynthetic) return null;
    if (KizilkanNativeCore.available) return nativeLiveChannel;
    return activePlaylist?.channels.find(c => c.id === params.id) || null;
  }, [isSynthetic, externalStream, activePlaylist, params.id, nativeLiveChannel]);

  // v15.2.24-RC3: Flight Recorder aktif oynatma işini de bilir. Bu görev uzun
  // ömürlüdür; daha yeni refresh/MAG/scan görevleri token-seq modeliyle öncelik
  // kazanır, bittiğinde player görevi tekrar görünür.
  useEffect(() => {
    if (!visible || !channel?.id) return;
    return markTask(`player:${v2ProfileKey}`, { channelId: channel.id, sessionId: activeSessionId });
  }, [visible, channel?.id, v2ProfileKey, activeSessionId]);

  // v16.14.8 CRASH FORENSICS: Android process-state summary, native SIG/crash
  // sonrasında hangi kanal/motor/oturumun aktif olduğunu 128-byte sınırında taşır.
  useEffect(() => {
    if (!visible || !channel?.id || !KizilkanNativeCore.available) return;
    try {
      KizilkanNativeCore.setBlackBoxCheckpoint?.(`player;${v2ProfileKey};ch:${String(channel.id).slice(0,28)};sid:${String(activeSessionId || '').slice(-18)}`);
    } catch {}
  }, [visible, channel?.id, v2ProfileKey, activeSessionId]);

  /**
   * OYNATILACAK ADRES
   * Stalker'da create_link ile çözülmüş geçici adres; diğerlerinde
   * kanalın kendi adresi.
   */
  // v15.2.19: AppState listener tek kez kurulduğu için canlı player bağlamını
  // ref üzerinden güncel tut. v15.2.18 empty-deps listener eski değerleri kaydedebiliyordu.
  playerTelemetryContextRef.current = {
    visible,
    channelId: String(channel?.id || ""),
    phase: String(v2Phase),
    engine: String(v2Profile.engine),
  };

  /**
   * v16.12.0 — STALKER RAW URL / ESKİ KANAL SIZINTISI KAPISI.
   * Kanal değiştiği render'da resolvedUrl state'i bir önceki kanala ait olabilir.
   * Key eşleşmeden o URL kullanılmaz; Stalker'da raw `ffmpeg http://...` komutu
   * da native player'a fallback olarak verilmez.
   */
  const currentStalkerKey = activePlaylist?.source === "stalker" && channel?.url
    ? `${String(activePlaylist?.id || "")}|${String(channel.id || "")}|${String(channel.url)}`
    : "";
  const resolvedForCurrentStalker = !!currentStalkerKey && resolvedStalkerKey === currentStalkerKey;
  // v16.12.0 FIX: Stalker kanal değişiminde önceki native yüzey yeni resolve
  // tamamlanana kadar ekranda tutulmaz. Böylece eski kanalın son karesi fotoğraf
  // gibi görünmez; yeni URL hazır olana kadar nötr/loading katmanı görünür.
  const resolvedMediaReadyForCurrentChannel = activePlaylist?.source !== "stalker" || resolvedForCurrentStalker;
  const playUrl = activePlaylist?.source === "stalker"
    ? (resolvedForCurrentStalker ? resolvedUrl : null)
    : (channel?.url || null);
  const basePlaybackRequest = useMemo(() => {
    if (!playUrl || !channel) return null;
    return buildPlaybackRequest({
      url: playUrl,
      channel,
      override: overrides?.[channel.id || ""],
      playlist: activePlaylist,
      isLive: sessionKind === "live",
      runtimeHeaders: activePlaylist?.source === "stalker" && resolvedForCurrentStalker ? resolvedHeaders : undefined,
    });
  }, [playUrl, channel, overrides, activePlaylist, sessionKind, resolvedHeaders, resolvedForCurrentStalker]);

  const playbackCandidates = useMemo(() => {
    if (!basePlaybackRequest) return [] as string[];
    return [basePlaybackRequest.url, ...(basePlaybackRequest.fallbackUrls || [])]
      .filter((u, i, arr) => !!u && arr.indexOf(u) === i);
  }, [basePlaybackRequest]);

  useEffect(() => { setPlaybackUrlIndex(0); }, [channel?.id, playUrl]);

  const playbackRequest = useMemo(() => {
    if (!basePlaybackRequest) return null;
    const candidate = playbackCandidates[Math.min(playbackUrlIndex, Math.max(0, playbackCandidates.length - 1))] || basePlaybackRequest.url;
    const lower = candidate.toLowerCase();
    const contentType = lower.includes(".m3u8") ? "hls"
      : lower.includes(".mpd") ? "dash"
      : basePlaybackRequest.contentType;
    return { ...basePlaybackRequest, url: candidate, contentType } as typeof basePlaybackRequest;
  }, [basePlaybackRequest, playbackCandidates, playbackUrlIndex]);

  const renderOwnerToken = `${String(activePlaylist?.id || '')}|${String(channel?.id || '')}|${activeSessionId}|${playbackUrlIndex}|${v2ProfileKey}`;
  const ownsCurrentRender = () => playbackOwnerRef.current === renderOwnerToken;

  const requestStalkerSourceRenewal = React.useCallback((rawError: string, engineName: string): boolean => {
    if (activePlaylist?.source !== 'stalker') return false;
    const status = extractHttpStatus(rawError);
    if (!shouldRenewResolvedSource(status, sourceProvenanceRef.current.origin)) return false;
    if (stalkerPlaybackRefreshRef.current >= 1) return false;
    stalkerPlaybackRefreshRef.current += 1;
    const sourceAgeMs = sourceProvenanceRef.current.createdAt ? Math.max(0, Date.now() - sourceProvenanceRef.current.createdAt) : 0;
    const httpClass = status ? classifyHttpRecovery(status) : 'other';
    void recordDiagnostic('player', 'STALKER_PLAYBACK_SOURCE_RENEW', {
      channelId: String(channel?.id || ''), engine: engineName, status: status || 0, httpClass, sourceAgeMs,
      urlFingerprint: sourceProvenanceRef.current.fingerprint.slice(0, 16), attempt: stalkerPlaybackRefreshRef.current,
    }, { sessionId: playerDiagnosticSessionRef.current, traceId: lifecycleTraceRef.current, stage: 'fallback', outcome: 'started' });
    void recordFlightRecorderStage(lifecycleTraceRef.current || getCurrentFlightRecorderTrace(), 'httpResponse', { status: status || 0, httpClass, engine: engineName, sourceAgeMs }, 'failed');
    void recordFlightRecorderStage(lifecycleTraceRef.current || getCurrentFlightRecorderTrace(), 'fallback', { reason: 'source-renewal-before-engine-fallback', status: status || 0, engine: engineName }, 'started');
    setRecoveryMessage('MAG oturumu/yayın bağlantısı yenileniyor…');
    setError(null);
    setIsBuffering(true);
    stalkerForceFreshRequestedRef.current = true;
    setStalkerFreshResolveNonce(n => n + 1);
    return true;
  }, [activePlaylist?.source, channel?.id]);

  const media3Source = useMemo(() => playbackRequest ? {
    uri: playbackRequest.url,
    headers: playbackRequest.headers,
    contentType: playbackRequest.contentType || "auto",
  } : null, [playbackRequest]);

  useEffect(() => {
    if (!playbackRequest?.url || activePlaylist?.source !== "xtream" || !channel) return;
    let host="",pathShape=""; try{const u=new URL(playbackRequest.url);host=u.host;const parts=u.pathname.split('/').filter(Boolean);pathShape=parts.length>=4?`/${parts[0]}/<user>/<pass>/${parts[parts.length-1]}`:`/${parts.map((x,i)=>i===parts.length-1?x:'<segment>').join('/')}`;}catch{}
    void recordDiagnostic("player","XTREAM_PLAYBACK_PROVENANCE",{playlistId:String(activePlaylist.id||""),channelId:String(channel.id||""),streamId:String(channel.stream_id??""),container:String(channel.container_ext||""),host,pathShape,candidateIndex:playbackUrlIndex,candidateCount:playbackCandidates.length,lastRefreshedAt:String(activePlaylist.lastRefreshedAt||"")});
  },[playbackRequest?.url,activePlaylist?.id,activePlaylist?.source,activePlaylist?.lastRefreshedAt,channel?.id,channel?.stream_id,channel?.container_ext,playbackUrlIndex,playbackCandidates.length]);

  useEffect(() => {
    if (!playbackRequest?.url || !channel?.id) return;
    if (activePlaylist?.source === 'stalker') return;
    const origin = activePlaylist?.source === 'xtream' ? 'xtream' : activePlaylist?.source === 'm3u_url' || activePlaylist?.source === 'm3u_file' ? 'm3u' : isSynthetic ? 'external' : 'unknown';
    const createdAt = Date.now();
    fingerprintPlaybackUrl(playbackRequest.url).then(fingerprint => {
      if (playbackRequest?.url) sourceProvenanceRef.current = { fingerprint, createdAt, origin, candidateIndex: playbackUrlIndex };
    }).catch(() => {});
  }, [playbackRequest?.url, playbackUrlIndex, activePlaylist?.source, channel?.id, isSynthetic]);

  useEffect(() => {
    stalkerPlaybackRefreshRef.current = 0;
    stalkerForceFreshRequestedRef.current = false;
  }, [channel?.id, activePlaylist?.id]);

  useEffect(() => {
    if (!visible || !channel?.id) return;
    const started = Date.now();
    playerSelectionStartedAtRef.current = started;
    playerDiagnosticSessionRef.current = `${String(channel.id)}-${started}`;
    const parentTraceId = getCurrentFlightRecorderTrace();
    const traceId = createFlightRecorderChildTrace(parentTraceId, 'channel', `${String(activePlaylist?.id || '')}|${String(channel.id)}|${started}`);
    lifecycleTraceRef.current = traceId;
    void recordDiagnostic("player", "CHANNEL_SELECTED", { channelId: String(channel.id), source: activePlaylist?.source || "", contentType: channel?.stream_type || "live", parentTraceId }, { sessionId: playerDiagnosticSessionRef.current, traceId, stage: 'channelSelect', outcome: 'started' });
    void recordFlightRecorderStage(traceId, 'channelSelect', { playlistId: String(activePlaylist?.id || ''), channelId: String(channel.id), parentTraceId }, 'started');
  }, [visible, channel?.id, activePlaylist?.source]);

  useEffect(() => {
    const generation=++stalkerResolveGenerationRef.current;
    // Stalker değilse çözüme gerek yok
    if (!channel?.url || activePlaylist?.source !== "stalker") {
      setResolvedUrl(null); setResolvedHeaders({}); setResolvedStalkerKey(""); return;
    }
    const requestedKey=`${String(activePlaylist?.id || "")}|${String(channel.id || "")}|${String(channel.url)}`;
    let alive = true;
    // Kanal değişir değişmez eski resolve sonucu render yolundan çıkar.
    setResolvedUrl(null);
    setResolvedHeaders({});
    setResolvedStalkerKey("");
    setResolving(true);
    (async () => {
      try {
        const { stalkerResolveStream, normalizeMac, stripStreamPrefix } = await import("@/src/utils/stalker");
        const pl: any = activePlaylist;
        const cred = {
          portal: pl.stalkerPortal,
          mac: normalizeMac(pl.stalkerMac || ""),
          serial: pl.stalkerSerial,
        };
        const forceFresh = stalkerForceFreshRequestedRef.current;
        stalkerForceFreshRequestedRef.current = false;
        const traceId = lifecycleTraceRef.current || getCurrentFlightRecorderTrace();
        void recordFlightRecorderStage(traceId, 'urlResolve', { playlistId: String(activePlaylist?.id || ''), channelId: String(channel.id), forceFresh, origin: 'stalker_create_link' }, 'started');
        const { url, headers } = await stalkerResolveStream(cred, null, String(channel.url), { forceFresh });
        if (alive && generation===stalkerResolveGenerationRef.current) {
          setResolvedHeaders(headers);
          /**
           * v16.1.0 — SON SAVUNMA.
           * Adres başka bir yoldan (eski kayıt, önbellek, farklı çözümleyici)
           * "ffmpeg http://..." önekiyle gelirse Media3 MalformedURLException
           * fırlatıyordu. Oynatıcıya HER ZAMAN temiz adres verilir.
           */
          const cleanUrl=stripStreamPrefix(String(url));
          const fingerprint = await fingerprintPlaybackUrl(cleanUrl).catch(() => "");
          sourceProvenanceRef.current = { fingerprint, createdAt: Date.now(), origin: 'stalker_create_link', candidateIndex: 0 };
          setResolvedUrl(cleanUrl);
          setResolvedStalkerKey(requestedKey);
          void recordFlightRecorderStage(traceId, 'urlResolve', { playlistId: String(activePlaylist?.id || ''), channelId: String(channel.id), urlFingerprint: fingerprint.slice(0, 16), forceFresh }, 'success');
          if (forceFresh) setPlaybackRetryNonce(n => n + 1);
        }
      } catch (e: any) {
        if (alive && generation===stalkerResolveGenerationRef.current) {
          void recordFlightRecorderStage(lifecycleTraceRef.current || getCurrentFlightRecorderTrace(), 'urlResolve', { channelId: String(channel?.id || ''), error: String(e?.message || e).slice(0, 180) }, 'failed');
          setResolvedUrl(null);
          setResolvedHeaders({});
          setResolvedStalkerKey("");
          setError("Portal yayın adresi vermedi: " + String(e?.message || e));
        }
      } finally {
        if (alive && generation===stalkerResolveGenerationRef.current) setResolving(false);
      }
    })();
    return () => { alive = false; };
  }, [channel?.url, activePlaylist?.id, activePlaylist?.source, stalkerFreshResolveNonce]);


  /**
   * PLAYER V2 SESSION BAŞLATMA
   * Her kanal/source değişiminde yeni session oluşur. Eski session'dan gelen
   * Exo/VLC callback'leri UI state'ini değiştiremez.
   */
  useEffect(() => {
    // Kalıcı PlayerHost gizliyken yeni native session başlatma. Aynı kanal
    // kapatılıp tekrar açıldığında `visible` false->true değişimi yeni session
    // üretir; böylece durmuş VLC/MPV ve pause edilmiş Media3 kesin yeniden başlar.
    if (!visible || !channel?.id || !playbackRequest?.url) return;
    const sid = sessionGateRef.current.begin();
    const ownerToken = `${String(activePlaylist?.id || '')}|${String(channel.id)}|${sid}|${playbackUrlIndex}|${v2ProfileKey}`;
    playbackOwnerRef.current = ownerToken;
    setActiveSessionId(sid);
    setProfileReadySessionId(0);
    transitioningSessionRef.current = null;
    successfulSessionRef.current = null;
    successfulSessionAtRef.current = 0;
    resumeAttemptRef.current = { key: "", target: 0, attempts: 0, confirmed: false };
    vlcPlayingRef.current = false;
    mpvPlayingRef.current = false;
    sessionStartedAtRef.current = Date.now();
    const traceId = lifecycleTraceRef.current || getCurrentFlightRecorderTrace();
    void recordDiagnostic("player", "PLAYER_SESSION_START", { channelId: String(channel.id), engine: v2Profile.engine, ownerTokenHash: ownerToken.length, fromSelectionMs: Math.max(0, Date.now() - playerSelectionStartedAtRef.current) }, { sessionId: playerDiagnosticSessionRef.current, traceId, stage: 'enginePrepare', outcome: 'started' });
    void recordFlightRecorderStage(traceId, 'enginePrepare', { channelId: String(channel.id), engine: v2Profile.engine, candidateIndex: playbackUrlIndex }, 'started');
    const sessionNow = Date.now();
    media3ClockRef.current = makePlaybackClock(sessionNow);
    vlcClockRef.current = makePlaybackClock(sessionNow);
    mpvClockRef.current = makePlaybackClock(sessionNow);
    playbackDurationRef.current = 0;
    stallRecoveryRef.current = { sid, profileKey: "", softDone: false, hardDone: false };
    lastVlcUiUpdateRef.current = 0;
    setError(null);
    setTechnicalError(null);
    setRecoveryMessage(null);
    setV2Phase("preparing");
    setExoReady(false);
    setExoFirstFrame(false);
    setVlcVideoReady(false);
    setVlcVideoMetaReady(false);
    setMpvVideoReady(false);
    setMpvVideoMetaReady(false);
    setMpvForceSoftware(false);

    let alive = true;
    (async () => {
      let profile: EngineProfile;
      const forcedProfile = nextSessionProfileRef.current;
      nextSessionProfileRef.current = null;

      if (forcedProfile) {
        profile = forcedProfile.engine === "mpv" && !KIZILKAN_MPV_AVAILABLE
          ? { engine: "vlc", decoder: "hw" }
          : forcedProfile;
      } else if (engine === "exo") {
        profile = {
          engine: "media3",
          surface: surfaceMode === "texture" ? "textureView" : "surfaceView",
        };
      } else if (engine === "vlc") {
        profile = { engine: "vlc", decoder: hwAccel ? "hw" : "sw" };
      } else if (engine === "mpv") {
        profile = KIZILKAN_MPV_AVAILABLE
          ? { engine: "mpv", decoder: "auto" }
          : { engine: "vlc", decoder: hwAccel ? "hw" : "sw" };
      } else {
        const memo = await loadEngineProfile(String(channel.id)).catch(() => null);
        profile = memo && memo.confidence > 0 ? memo.profile : defaultProfile(isTv);
        if (profile.engine === "mpv" && !KIZILKAN_MPV_AVAILABLE) {
          profile = { engine: "vlc", decoder: "hw" };
        }
      }
      if (!alive || !sessionGateRef.current.isActive(sid)) return;
      const selectedProfileKey = profile.engine === 'media3' ? `media3:${profile.surface}` : profile.engine === 'vlc' ? `vlc:${profile.decoder}` : 'mpv:auto';
      playbackOwnerRef.current = `${String(activePlaylist?.id || '')}|${String(channel.id)}|${sid}|${playbackUrlIndex}|${selectedProfileKey}`;
      setV2Profile(profile);
      setUseVLC(profile.engine === "vlc");
      if (profile.engine === "media3") lastExoUrlRef.current = null;
      if (profile.engine === "vlc") setVlcRecoveryGeneration(g => g + 1);
      if (profile.engine === "mpv") setMpvRecoveryGeneration(g => g + 1);
      setProfileReadySessionId(sid);
      setVlcAutoSoftware(profile.engine === "vlc" && profile.decoder === "sw");
      setIsBuffering(true);
    })();

    return () => { alive = false; };
  }, [visible, channel?.id, playbackRequest?.url, engine, surfaceMode, hwAccel, isTv, playbackRetryNonce]);

  const supportsCatchup = !isSynthetic && channel?.tv_archive === 1 && activePlaylist?.source === "xtream";

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    /**
     * EXOPLAYER TAMPON AYARI (v7.8.0)
     * SORUN: Tampon ayarı yalnızca VLC'ye uygulanıyordu. ExoPlayer
     * VARSAYILAN 20 SANİYE tamponluyordu -> canlı yayında ciddi gecikme.
     * ÇÖZÜM: Kullanıcının seçtiği değer ExoPlayer'a da uygulanıyor.
     * (Alanlar expo-video paket tipinden doğrulandı.)
     */
    try {
      p.timeUpdateEventInterval = PLAYER_BACKGROUND_TIME_UPDATE_MS / 1000;
      const sec = Math.max(0.25, bufferMs / 1000);
      p.bufferOptions = {
        preferredForwardBufferDuration: sec,
        minBufferForPlayback: Math.max(0.2, sec / 2),
        maxBufferBytes: 0,
        prioritizeTimeOverSizeThreshold: true,
      };
    } catch { /* eski sürümlerde bu alan olmayabilir */ }
    p.play();
  });

  /**
   * v15.2.24 — ADAPTIVE MEDIA3 TIME UPDATE.
   * Flight Recorder telemetrisinde uzun main-thread stall stack'leri
   * expo-video IntervalUpdateClock -> emitTimeUpdate hattında görüldü.
   * Kontroller kapalı normal TV izleme sırasında native timeUpdate sıklığını
   * 1 sn -> 5 sn düşürürüz; kontrol/yayın bilgi paneli açıkken 1 sn hassasiyet
   * geri gelir. Playback clock/stall watchdog seçilen event cadence ile çalışmayı sürdürür.
   */
  const media3TimeUpdateIntervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!player) return;
    const intervalMs = (showControls || sheet === "stats" || isSynthetic)
      ? PLAYER_UI_TIME_UPDATE_MS
      : PLAYER_BACKGROUND_TIME_UPDATE_MS;
    // v17.0.0: aynı değeri her render/sheet churn'ünde native IntervalUpdateClock'a
    // tekrar yazma. Son logdaki emitTimeUpdate/IntervalUpdateClock stall hattında
    // gereksiz scheduler yeniden kurulumunu azaltır; gerçek event cadence korunur.
    if (media3TimeUpdateIntervalRef.current === intervalMs) return;
    try {
      (player as any).timeUpdateEventInterval = intervalMs / 1000;
      media3TimeUpdateIntervalRef.current = intervalMs;
      void recordDiagnostic("player", "MEDIA3_TIMEUPDATE_INTERVAL", {
        intervalMs, controls: showControls, sheet: sheet || "", synthetic: isSynthetic, deduped: true,
      }, { sessionId: playerDiagnosticSessionRef.current });
    } catch {}
  }, [player, showControls, sheet, isSynthetic]);
  useEffect(() => { media3TimeUpdateIntervalRef.current = null; }, [player]);

  /**
   * TAMPON AYARINI SONRADAN DA UYGULA (v9.5.0)
   * Yukarıdaki config geri-çağrımı player OLUŞURKEN yalnızca BİR KEZ çalışır.
   * Kayıtlı tampon değeri ise async yükleniyor (üstteki storage.getItem); bu
   * yüzden ilk açılışta config değeri kaçırıp varsayılanla başlıyordu.
   * Burada bufferMs değiştikçe ExoPlayer tamponunu tazeliyoruz.
   */
  useEffect(() => {
    if (!player) return;
    try {
      const sec = Math.max(0.25, bufferMs / 1000);
      (player as any).bufferOptions = {
        preferredForwardBufferDuration: sec,
        minBufferForPlayback: Math.max(0.2, sec / 2),
        maxBufferBytes: 0,
        prioritizeTimeOverSizeThreshold: true,
      };
    } catch { /* alan yoksa sessizce geç */ }
  }, [player, bufferMs]);

  // Player V2 — Media3 event'leri session ve aktif motor ile izole edilir.
  useEffect(() => {
    if (!player) return;
    const sid = activeSessionId;
    const listenerProfileKey = v2ProfileKey;
    const listenerOwnerToken = playbackOwnerRef.current;
    const stillMine = () =>
      sid > 0 &&
      playbackOwnerRef.current === listenerOwnerToken &&
      sessionGateRef.current.isActive(sid) &&
      activeProfileKeyRef.current === listenerProfileKey &&
      v2Profile.engine === "media3" &&
      !useVLC;

    const switchProfile = async (next: EngineProfile, reason?: ClassifiedPlaybackError) => {
      if (!stillMine()) return;
      if (transitioningSessionRef.current === sid) return;
      transitioningSessionRef.current = sid;

      // Android-only MPV modülü herhangi bir nedenle autolink edilmemişse
      // fallback zinciri bozulmaz; aynı karar VLC'ye güvenli biçimde normalize edilir.
      const effectiveNext: EngineProfile =
        next.engine === "mpv" && !KIZILKAN_MPV_AVAILABLE
          ? { engine: "vlc", decoder: "hw" }
          : next;

      if (reason && channel?.id) {
        await recordEngineFailure(String(channel.id), v2Profile, reason.kind, reason.technical).catch(() => {});
      }
      setRecoveryMessage(
        effectiveNext.engine === "mpv"
          ? "Media3 bu yayını çözemedi; MPV/FFmpeg motoru deneniyor…"
          : reason?.userMessage || "Alternatif oynatma profili deneniyor…"
      );
      setError(null);
      setTechnicalError(reason?.technical || null);
      setV2Phase(effectiveNext.engine === "media3" ? "recover_surface" : "switch_engine");
      setIsBuffering(true);

      // Eski Media3 session'ı yeni native motor başlamadan kaynak/ses odağını bırakır.
      if (effectiveNext.engine !== "media3") {
        try { player.pause(); } catch {}
        try { (player as any).replace?.(null); } catch {}
        lastExoUrlRef.current = null;
      }
      const effectiveKey = effectiveNext.engine === 'media3' ? `media3:${effectiveNext.surface}` : effectiveNext.engine === 'vlc' ? `vlc:${effectiveNext.decoder}` : 'mpv:auto';
      playbackOwnerRef.current = `${String(activePlaylist?.id || '')}|${String(channel?.id || '')}|${sid}|${playbackUrlIndex}|${effectiveKey}`;
      void recordFlightRecorderStage(lifecycleTraceRef.current || getCurrentFlightRecorderTrace(), 'fallback', { fromEngine: v2Profile.engine, toEngine: effectiveNext.engine, reason: reason?.kind || 'manual' }, 'started');
      setV2Profile(effectiveNext);
      setUseVLC(effectiveNext.engine === "vlc");
      setVlcAutoSoftware(effectiveNext.engine === "vlc" && effectiveNext.decoder === "sw");
      setVlcVideoMetaReady(false);
      setVlcVideoReady(false);
      setMpvVideoMetaReady(false);
      setMpvVideoReady(false);
      if (effectiveNext.engine === "vlc") setVlcRecoveryGeneration(g => g + 1);
      if (effectiveNext.engine === "mpv") setMpvRecoveryGeneration(g => g + 1);
      setTimeout(() => {
        if (sessionGateRef.current.isActive(sid)) transitioningSessionRef.current = null;
      }, 80);
    };

    const statusSub = player.addListener("statusChange", (event: any) => {
      if (!stillMine()) return;
      if (event?.status) {
        void recordDiagnostic("player", "MEDIA3_STATUS", {
          status: String(event.status),
          fromSessionMs: Math.max(0, Date.now() - sessionStartedAtRef.current),
          fromSelectionMs: Math.max(0, Date.now() - playerSelectionStartedAtRef.current),
          rebuffer: successfulSessionRef.current === sid && (event.status === "loading" || event.status === "buffering"),
        }, { sessionId: playerDiagnosticSessionRef.current });
      }

      if (event?.status === "loading" || event?.status === "buffering") {
        setV2Phase("preparing");
        setIsBuffering(true);
      }

      if (event?.error) {
        void recordDiagnostic("player", "MEDIA3_ERROR", {
          status: String(event?.status || ""),
          error: String(event?.error?.message || event?.error || "Media3 error"),
          phase: v2Phase,
          engine: v2Profile.engine,
          decoder: v2Profile.engine === "media3" ? undefined : v2Profile.decoder,
          surface: v2Profile.engine === "media3" ? v2Profile.surface : undefined,
          fromSessionMs: Math.max(0, Date.now() - sessionStartedAtRef.current),
          fromSelectionMs: Math.max(0, Date.now() - playerSelectionStartedAtRef.current),
        }, { sessionId: playerDiagnosticSessionRef.current });
        // v15.2.3: first-frame/playing başarı callback'inden hemen sonra gelen
        // bayat source error çalışan görüntüyü alternatif URL'ye sürüklemesin.
        if (successfulSessionRef.current === sid && Date.now() - successfulSessionAtRef.current < 1800) {
          setRecoveryMessage(null);
          return;
        }
        const classified = classifyPlaybackError(event.error);
        const mediaErrorText = String(event?.error?.message || event?.error || "");
        const httpStatus = extractHttpStatus(mediaErrorText);
        const httpClass = httpStatus ? classifyHttpRecovery(httpStatus) : 'other';
        const sourceAgeMs = sourceProvenanceRef.current.createdAt ? Math.max(0, Date.now() - sourceProvenanceRef.current.createdAt) : 0;
        if (httpStatus) {
          void recordFlightRecorderStage(lifecycleTraceRef.current || getCurrentFlightRecorderTrace(), 'httpResponse', {
            status: httpStatus, httpClass, sourceAgeMs, sourceOrigin: sourceProvenanceRef.current.origin, urlFingerprint: sourceProvenanceRef.current.fingerprint.slice(0, 16), engine: 'media3'
          }, httpStatus >= 400 ? 'failed' : 'success');
        }
        const renewResolvedSource = activePlaylist?.source === "stalker" && shouldRenewResolvedSource(httpStatus, sourceProvenanceRef.current.origin);
        if (renewResolvedSource && stalkerPlaybackRefreshRef.current < 1) {
          stalkerPlaybackRefreshRef.current += 1;
          void recordDiagnostic("player", "STALKER_PLAYBACK_SOURCE_RENEW", {
            channelId: String(channel?.id || ""), status: httpStatus || 0, httpClass, sourceAgeMs,
            urlFingerprint: sourceProvenanceRef.current.fingerprint.slice(0, 16), attempt: stalkerPlaybackRefreshRef.current,
          }, { sessionId: playerDiagnosticSessionRef.current, traceId: lifecycleTraceRef.current, stage: 'fallback', outcome: 'started' });
          void recordFlightRecorderStage(lifecycleTraceRef.current || getCurrentFlightRecorderTrace(), 'fallback', { reason: 'source-renewal-before-engine-fallback', status: httpStatus || 0, httpClass }, 'started');
          setRecoveryMessage("MAG oturumu yenileniyor ve yayın bağlantısı tekrar alınıyor…");
          setError(null);
          setTechnicalError(classified.technical);
          setIsBuffering(true);
          stalkerForceFreshRequestedRef.current = true;
          setStalkerFreshResolveNonce(n => n + 1);
          return;
        }

        // Xtream bazı panellerde aynı stream'i yalnız .ts veya yalnız .m3u8
        // endpoint'inde düzgün döndürür. Extractor/source/404 hatasında motoru
        // değiştirmeden önce bir sonraki doğrulanmış URL biçimini dene.
        const canTryNextUrl = playbackUrlIndex + 1 < playbackCandidates.length;
        if (canTryNextUrl && ["extractor", "source", "http_not_found"].includes(classified.kind)) {
          recordEngineFailure(String(channel?.id || ""), v2Profile, classified.kind, classified.technical).catch(() => {});
          setRecoveryMessage(`Alternatif yayın yolu deneniyor (${playbackUrlIndex + 2}/${playbackCandidates.length})…`);
          setError(null);
          setTechnicalError(classified.technical);
          nextSessionProfileRef.current = v2Profile;
          setPlaybackUrlIndex(i => Math.min(i + 1, playbackCandidates.length - 1));
          return;
        }

        const decision = fallbackFromError(v2Profile, classified);
        if (classified.immediateFallback || classified.kind === "unsupported_codec" || classified.kind === "decoder") {
          void recordDiagnostic("player", "MEDIA3_FATAL_FALLBACK", {
            errorKind: classified.kind, technical: classified.technical,
            fromProfile: v2ProfileKey,
            toProfile: decision.next ? (decision.next.engine === "media3" ? `media3:${decision.next.surface}` : `${decision.next.engine}:${decision.next.decoder}`) : "none",
            phase: decision.phase,
          }, { sessionId: playerDiagnosticSessionRef.current });
          setExoReady(false);
          setExoFirstFrame(false);
        }

        // 401/403/407/timeout ağ katmanıdır; surface/decoder zinciriyle
        // karıştırılmaz. Teknik hata saklanır, kullanıcıya sade hata gösterilir.
        if (decision.phase === "network_recovery" && !decision.next) {
          setV2Phase("final_error");
          setTechnicalError(classified.technical);
          setRecoveryMessage(null);
          setError(classified.userMessage);
          setIsBuffering(false);
          recordEngineFailure(String(channel?.id || ""), v2Profile, classified.kind, classified.technical).catch(() => {});
          return;
        }

        if (decision.next) {
          switchProfile(decision.next, classified);
          return;
        }

        setV2Phase("final_error");
        setTechnicalError(classified.technical);
        setRecoveryMessage(null);
        setError(classified.userMessage);
        setIsBuffering(false);
        recordEngineFailure(String(channel?.id || ""), v2Profile, classified.kind, classified.technical).catch(() => {});
        return;
      }

      if (event?.status === "readyToPlay") {
        setError(null);
        setTechnicalError(null);
        setExoReady(true);
        setV2Phase("waiting_first_frame");
        try {
          const at = (player as any).availableAudioTracks || [];
          const st = (player as any).availableSubtitleTracks || [];
          if (Array.isArray(at)) {
            setAudioTracks(at);
            if (at.length > 0 && !(player as any).audioTrack) {
              try { (player as any).audioTrack = at[0]; setSelectedAudio(at[0]); } catch {}
            }
          }
          if (Array.isArray(st)) setSubtitleTracks(st);
          const vs = (player as any).videoSize || (player as any).naturalSize || {};
          const duration = Number((player as any).duration || 0);
          if (duration > 0) playbackDurationRef.current = duration;
          setVideoStats(prev => ({ ...prev, width: vs?.width, height: vs?.height, duration }));
        } catch {}
      }
    });

    const loadSub = player.addListener("sourceLoad", (e: any) => {
      if (!stillMine()) return;
      try {
        const at = Array.isArray(e?.availableAudioTracks) ? e.availableAudioTracks : [];
        const st = Array.isArray(e?.availableSubtitleTracks) ? e.availableSubtitleTracks : [];
        setAudioTracks(at); setSubtitleTracks(st);
        if (at.length > 0 && !(player as any).audioTrack) {
          try { (player as any).audioTrack = at[0]; setSelectedAudio(at[0]); } catch {}
        }
      } catch {}
    });

    const playingSub = player.addListener("playingChange", (e: any) => {
      if (!stillMine()) return;
      const playing = !!e?.isPlaying;
      isPlayingRef.current = playing;
      setIsPlaying(prev => prev === playing ? prev : playing);
      if (playing && playbackRequest && !playbackRequest.expectsVideo) {
        const firstFrameMs = Math.max(0, Date.now() - sessionStartedAtRef.current);
        setV2Phase("playing");
        setRecoveryMessage(null);
        setIsBuffering(false);
        if (successfulSessionRef.current !== sid) {
          successfulSessionRef.current = sid;
          successfulSessionAtRef.current = Date.now();
          firstFrameSeenRef.current = true;   // v16.2.0
          recordEngineSuccess(String(channel?.id || ""), v2Profile, firstFrameMs).catch(() => {});
          recordFirstFrameDiagnostic(v2Profile, firstFrameMs);
        }
      }
    });

    const timeSub = player.addListener("timeUpdate", (e: any) => {
      if (!stillMine()) return;
      const now = Date.now();
      const before = media3ClockRef.current;
      const next = notePlaybackPosition(before, Number(e?.currentTime ?? (player as any).currentTime ?? 0), now);
      media3ClockRef.current = next;
      if (next.lastAdvanceAt !== before.lastAdvanceAt) {
        const rec = stallRecoveryRef.current;
        if (rec.sid === sid && rec.profileKey === listenerProfileKey && (rec.softDone || rec.hardDone)) {
          stallRecoveryRef.current = { sid, profileKey: listenerProfileKey, softDone: false, hardDone: false };
          if (v2Phase === "playing") setRecoveryMessage(null);
        }
      }
      const media3Duration =
        typeof (player as any).duration === "number" && (player as any).duration > 0
          ? Number((player as any).duration)
          : playbackDurationRef.current;
      if (media3Duration > 0) playbackDurationRef.current = media3Duration;

      if (showControlsRef.current || sheetRef.current === "stats") {
        setVideoStats(prev => ({
          ...prev,
          position: Math.floor(next.positionSeconds),
          currentTime: next.positionSeconds,
          duration: media3Duration > 0 ? Math.floor(media3Duration) : prev.duration,
        }));
      }
    });

    return () => { statusSub.remove(); loadSub.remove(); playingSub.remove(); timeSub.remove(); };
  }, [
    player, activeSessionId, useVLC, v2Profile, v2ProfileKey, channel?.id, playbackRequest,
    playbackUrlIndex, playbackCandidates,
  ]);

  // GPT v10.4.0: Kaynak/session değişiminde eski track/state yeni medyaya
  // sızmasın. Özellikle VLC zap sonrası eski audio/video track ID'leri yeni
  // kanala taşındığında ses çatallanması/yanlış track görülebiliyordu.
  useEffect(() => {
    setAudioTracks([]);
    setSubtitleTracks([]);
    setVlcVideoTrackId(undefined);
    setSelectedAudioTrack(undefined);
    setSelectedSubtitleTrack(undefined);
    setSelectedAudio(null);
    setSelectedSubtitle(null);
    setIsSeekable(false);
    setVideoStats({});
    setError(null);
    setIsBuffering(!!channel);
    setDecoderRetrySurface(false);
    setExoReady(false);
    setExoFirstFrame(false);
    setExoRecoveryStep(0);
    setVlcVideoReady(false);
    setVlcVideoMetaReady(false);
    setVlcRecoveryGeneration(0);
    setVlcAutoSoftware(false);
    setMpvVideoReady(false);
    setMpvVideoMetaReady(false);
    setMpvRecoveryGeneration(0);
    setMemoSurfaceOverride(null);
    if (engine === "exo" || engine === "mpv") setUseVLC(false);
    if (engine === "vlc") setUseVLC(true);
  }, [params.id, sessionKind, engine]);

  // v9.9.0: Kanal değişince decoder-hata yedeğini sıfırla (yeni kanal önce
  // normal TextureView yoluyla denensin).
  useEffect(() => { setDecoderRetrySurface(false); }, [channel?.id]);

  // GPT ELITE v15.0.0 — VOD/SERIES ORTAK İLERLEME KAYDI
  // Media3/VLC/MPV'nin her biri kendi native playback clock'unu günceller.
  // Library progress artık Media3 player nesnesine bağımlı değildir.
  const persistSyntheticProgress = React.useCallback(() => {
    if (!channel || !isSynthetic) return;

    const clock =
      v2Profile.engine === "vlc" ? vlcClockRef.current
        : v2Profile.engine === "mpv" ? mpvClockRef.current
        : media3ClockRef.current;

    const cur = Math.max(0, Number(clock.positionSeconds || 0));
    const dur = Math.max(0, Number(playbackDurationRef.current || 0));
    if (cur <= 3 || dur <= 0) return;

    const realId = String(params.id || "").replace(/^(vodplay-|epplay-)/, "");
    const kind: "vod" | "series" = String(params.id || "").startsWith("epplay-") ? "series" : "vod";

    setLibProgress(realId, {
      current: cur,
      duration: dur,
      kind,
      name: channel.name,
      poster: externalStream?.poster,
    }).catch(() => {});

    if (showControlsRef.current || sheetRef.current === "stats") {
      setVideoStats(prev => ({
        ...prev,
        position: Math.floor(cur),
        currentTime: cur,
        duration: dur,
      }));
    }
  }, [
    channel?.id,
    channel?.name,
    isSynthetic,
    params.id,
    externalStream?.poster,
    setLibProgress,
    v2Profile.engine,
  ]);

  useEffect(() => {
    if (!visible || !channel || !isSynthetic) return;
    const interval = setInterval(persistSyntheticProgress, 5000);
    return () => {
      clearInterval(interval);
      // Route/player kapanırken son birkaç saniyeyi de kaybetme.
      persistSyntheticProgress();
    };
  }, [visible, channel?.id, isSynthetic, persistSyntheticProgress]);

  /**
   * v14.2.0: Eski 1 saniyelik JS polling kaldırıldı. Media3 kendi native
   * timeUpdate event'ini 1 sn aralıkla üretir; çift zamanlayıcı yoktur.
   */

  /** Belirli bir saniyeye atlar (her iki motorda da çalışır). */
  const seekTo = (seconds: number) => {
    const target = Math.max(0, Math.floor(seconds));
    void recordDiagnostic("player", "SEEK_REQUEST", { target, engine: v2Profile.engine, phase: v2Phase, buffering: isBufferingRef.current }, { sessionId: playerDiagnosticSessionRef.current });
    if (v2Profile.engine === "mpv") {
      if (!isSeekable && !isSynthetic) { flashMessage("Bu yayında ileri/geri alınamaz"); return; }
      void mpvRef.current?.seekTo(target);
    } else if (v2Profile.engine === "vlc") {
      if (!isSeekable) { flashMessage("Bu yayında ileri/geri alınamaz"); return; }
      try { vlcRef.current?.seek(target * 1000, "time"); } catch {}
    } else {
      try { (player as any).currentTime = target; } catch {}
    }
    const now = Date.now();
    userSeekGraceUntilRef.current = now + (isSynthetic ? 8000 : 5000);
    const resetClock = (clock: any) => ({ ...clock, positionSeconds: target, lastEventAt: now, lastAdvanceAt: now });
    if (v2Profile.engine === "vlc") vlcClockRef.current = resetClock(vlcClockRef.current);
    else if (v2Profile.engine === "mpv") mpvClockRef.current = resetClock(mpvClockRef.current);
    else media3ClockRef.current = resetClock(media3ClockRef.current);
    stallRecoveryRef.current = { sid: activeSessionId, profileKey: v2ProfileKey, softDone: false, hardDone: false };
    setVideoStats(prev => ({ ...prev, position: target }));
    revealControls();
  };

  // v15.1.0-RC1 — Resume artık "seek komutunu gönderdim = başarı" saymaz.
  // Hedef pozisyon playback clock üzerinden doğrulanır; source/player geç hazırlandıysa
  // aynı session içinde kontrollü olarak yeniden denenir.
  useEffect(() => {
    const resumeAt = Math.max(0, Number(params.resumeAt || 0));
    if (!visible || !isSynthetic || !channel || resumeAt < 10 || v2Phase !== "playing" || activeSessionId <= 0) return;
    const key = `${activeSessionId}:${String(channel.id)}:${Math.floor(resumeAt)}`;
    if (appliedResumeKeyRef.current === key) return;

    const readPosition = () => {
      if (v2Profile.engine === "vlc") return Number(vlcClockRef.current.positionSeconds || 0);
      if (v2Profile.engine === "mpv") return Number(mpvClockRef.current.positionSeconds || 0);
      return Number(media3ClockRef.current.positionSeconds || (player as any)?.currentTime || 0);
    };
    const sendResumeSeek = () => {
      if (!ownsCurrentRender() || !sessionGateRef.current.isActive(activeSessionId)) return;
      if (v2Profile.engine === "mpv") void mpvRef.current?.seekTo(resumeAt);
      else if (v2Profile.engine === "vlc") {
        try { vlcRef.current?.seek(resumeAt * 1000, "time"); } catch {}
      } else {
        // expo-video public API currentTime setter Android'de Media3 seek'e gider.
        // Public JS API Media3 availableCommands'ı expose etmediği için başarı
        // aşağıdaki gerçek position callback'i ile doğrulanır; sessiz başarı varsayılmaz.
        try { (player as any).currentTime = resumeAt; } catch {}
      }
      const now = Date.now();
      userSeekGraceUntilRef.current = now + 10000;
      resumeAttemptRef.current = { key, target: resumeAt, attempts: resumeAttemptRef.current.attempts + 1, confirmed: false };
    };

    const timers: ReturnType<typeof setTimeout>[] = [];
    const checkpoints = [120, 900, 1900, 3300];
    checkpoints.forEach((delay, index) => {
      timers.push(setTimeout(() => {
        if (!ownsCurrentRender() || !sessionGateRef.current.isActive(activeSessionId) || appliedResumeKeyRef.current === key) return;
        const pos = readPosition();
        const tolerance = Math.max(4, Math.min(12, resumeAt * 0.02));
        if (Math.abs(pos - resumeAt) <= tolerance || pos >= resumeAt - tolerance) {
          appliedResumeKeyRef.current = key;
          resumeAttemptRef.current = { key, target: resumeAt, attempts: resumeAttemptRef.current.attempts, confirmed: true };
          return;
        }
        if (index < 3) sendResumeSeek();
        else {
          setTechnicalError(`Resume seek doğrulanamadı · motor=${v2Profile.engine} · hedef=${Math.floor(resumeAt)}s · gerçek=${Math.floor(pos)}s`);
        }
      }, delay));
    });
    // İlk komutu source PLAYING olduktan hemen sonra gönder.
    sendResumeSeek();
    return () => timers.forEach(clearTimeout);
  }, [visible, isSynthetic, channel?.id, params.resumeAt, v2Phase, activeSessionId, v2ProfileKey, v2Profile.engine, player]);

  const lastExoUrlRef = useRef<string | null>(null);

  /**
   * GPT v10.2.0 — VOD/SERIES EXIT LIFECYCLE
   *
   * Kalıcı PlayerHost canlı yayınlarda yüzeyi bağlı tutmalı (şerit çözümü).
   * Ancak film/dizi (isSynthetic) kapanırken yalnız pause() etmek bazı cihazlarda
   * native audio session/source'u canlı bırakıyor ve kullanıcı listeye dönse bile
   * ses devam ediyor.
   */
  const haltPlaybackForExit = () => {
    try {
      // Cast bağlıyken Player'daki "geri/çıkış" local stop ile aynı semantiğe
      // sahip olmalı: remote media durur fakat Cast session zorla kapatılmaz.
      // Böylece kullanıcı isterse yeni içeriği aynı cihaza gönderebilir.
      if (castSession) {
        try {
          const remote = castSession.client || castSession.getClient?.();
          remote?.stop?.();
        } catch {}
      }
      if (v2Profile.engine === "mpv") {
        void mpvRef.current?.stop?.();
      } else if (v2Profile.engine === "vlc") {
        vlcRef.current?.stop?.();
      } else {
        player?.pause?.();
        if (isSynthetic) {
          try { (player as any)?.replace?.(null); } catch {}
          lastExoUrlRef.current = null;
        }
      }
    } catch {}
    mpvPlayingRef.current = false;
    vlcPlayingRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
  };

  /**
   * v17.0.0 — FAVORİ/ÖZEL GRUP NAVIGATION SCOPE
   * Provider groupName ile ifade edilemeyen kullanıcı sıralarında yalnız ID dizisi
   * okunur. Medya nesneleri JS'e hydrate edilmez; hedef komşular Room'dan iki ID
   * ile çekilir. Scope yoksa normal indexed Room neighbor sorgusu kullanılır.
   */
  useEffect(() => {
    let cancelled = false;
    const scopeKey = source?.nav?.scopeKey;
    if (!visible || !scopeKey || !activePlaylist?.id || (sessionKind !== "live" && sessionKind !== "vod")) {
      setOrderedNavigationScopeIds(null);
      return () => { cancelled = true; };
    }
    void loadPlayerNavigationScope(scopeKey, { playlistId: String(activePlaylist.id), kind: sessionKind })
      .then(ids => { if (!cancelled) setOrderedNavigationScopeIds(ids); })
      .catch(() => { if (!cancelled) setOrderedNavigationScopeIds(null); });
    return () => { cancelled = true; };
  }, [visible, source?.nav?.scopeKey, activePlaylist?.id, sessionKind]);

  /**
   * v17.0.0 — NATIVE NEIGHBOR NAVIGATION + CAPABILITY-DRIVEN PREV/NEXT
   * ----------------------------------------------------------------------
   * v16.14.8 full catalog hydrate'ı doğru biçimde kaldırdı fakat eski zap()
   * activePlaylist.channels[] dizisine bağlı kaldı. Bu blok o regresyonu
   * full hydrate'ı geri getirmeden düzeltir. Live/VOD komşuları Room'dan,
   * Series bölümleri Detail ekranının küçük synthetic komşu sözleşmesinden gelir.
   */
  useEffect(() => {
    let cancelled = false;
    if (!visible || !activePlaylist?.id || !params.id) { setPlaybackNeighbors(null); return () => { cancelled = true; }; }

    if (sessionKind === "series") {
      const idx = seriesNavigationItems.findIndex((it:any) => String(it?.id) === String(params.id));
      if (idx >= 0) {
        setPlaybackNeighbors({
          previous: idx > 0 ? seriesNavigationItems[idx - 1] : null,
          next: idx + 1 < seriesNavigationItems.length ? seriesNavigationItems[idx + 1] : null,
          position: idx + 1, total: seriesNavigationItems.length, source: "synthetic",
        });
      } else {
        setPlaybackNeighbors({
          previous: syntheticNav?.previousId ? { id: syntheticNav.previousId } : null,
          next: syntheticNav?.nextId ? { id: syntheticNav.nextId } : null,
          position: 0, total: 0, source: "synthetic",
        });
      }
      return () => { cancelled = true; };
    }

    if (sessionKind !== "live" && sessionKind !== "vod") { setPlaybackNeighbors(null); return () => { cancelled = true; }; }
    const realId = sessionKind === "vod" ? String(params.id).replace(/^vodplay-/, "") : String(params.id);
    const nav = source?.nav;
    const group = nav?.group || "__all__";
    const search = nav?.search || "";
    const wrap = sessionKind === "live";

    if (KizilkanNativeCore.available && source?.nav?.scopeKey && orderedNavigationScopeIds) {
      const idx = orderedNavigationScopeIds.findIndex(id => String(id) === realId);
      if (idx < 0 || orderedNavigationScopeIds.length < 2) {
        setPlaybackNeighbors(null);
        return () => { cancelled = true; };
      }
      const previousId = idx > 0 ? orderedNavigationScopeIds[idx - 1] : (wrap ? orderedNavigationScopeIds[orderedNavigationScopeIds.length - 1] : null);
      const nextId = idx + 1 < orderedNavigationScopeIds.length ? orderedNavigationScopeIds[idx + 1] : (wrap ? orderedNavigationScopeIds[0] : null);
      const ids = Array.from(new Set([previousId, nextId].filter(Boolean) as string[]));
      const startedAt = Date.now();
      void KizilkanNativeCore.getItemsByIds<any>(activePlaylist.id, sessionKind, ids)
        .then(rows => {
          if (cancelled) return;
          const byId = new Map((rows || []).map((row:any) => [String(row?.id || row?.stream_id || ""), row]));
          setPlaybackNeighbors({
            previous: previousId ? (byId.get(String(previousId)) || null) : null,
            next: nextId ? (byId.get(String(nextId)) || null) : null,
            position: idx + 1, total: orderedNavigationScopeIds.length, source: "room",
          });
          const elapsedMs = Date.now() - startedAt;
          void recordDiagnostic("database", "PLAYER_SCOPED_NEIGHBOR_LOOKUP", {
            playlistId: activePlaylist.id, kind: sessionKind, itemId: realId, scopeKey: "<runtime>",
            previous: !!previousId, next: !!nextId, position: idx + 1, total: orderedNavigationScopeIds.length, elapsedMs,
          }, { stage: "playerNeighborLookup", durationMs: elapsedMs, outcome: "success" });
        })
        .catch(error => {
          if (cancelled) return;
          setPlaybackNeighbors(null);
          void recordDiagnostic("database", "PLAYER_SCOPED_NEIGHBOR_LOOKUP_FAILED", {
            playlistId: activePlaylist.id, kind: sessionKind, itemId: realId, error: String((error as any)?.message || error),
          }, { stage: "playerNeighborLookup", outcome: "failed" });
        });
      return () => { cancelled = true; };
    }

    if (KizilkanNativeCore.available) {
      const startedAt = Date.now();
      void KizilkanNativeCore.getPlaybackNeighbors<any>(activePlaylist.id, sessionKind, realId, { group, search, wrap })
        .then(result => {
          if (cancelled) return;
          setPlaybackNeighbors({ previous: result.previous || null, next: result.next || null, position: Number(result.position || 0), total: Number(result.total || 0), source: "room" });
          const elapsedMs = Date.now() - startedAt;
          void recordDiagnostic("database", "PLAYER_NEIGHBOR_ROOM_LOOKUP", {
            playlistId: activePlaylist.id, kind: sessionKind, itemId: realId, group, search: search ? "<set>" : "",
            previous: !!result.previous, next: !!result.next, position: result.position, total: result.total, nativeElapsedMs: result.elapsedMs, elapsedMs,
          }, { stage: "playerNeighborLookup", durationMs: elapsedMs, outcome: result.found ? "success" : "not_found" });
        })
        .catch(error => {
          if (cancelled) return;
          setPlaybackNeighbors(null);
          void recordDiagnostic("database", "PLAYER_NEIGHBOR_ROOM_LOOKUP_FAILED", { playlistId: activePlaylist.id, kind: sessionKind, itemId: realId, error: String((error as any)?.message || error) }, { stage: "playerNeighborLookup", outcome: "failed" });
        });
      return () => { cancelled = true; };
    }

    // Web/legacy fail-safe: yalnız Native Core olmayan platformlarda mevcut JS
    // listesi kullanılır. Android Native hot-path'te bu yol çalışmaz.
    const list:any[] = sessionKind === "live" ? (activePlaylist.channels || []) : (activePlaylist.vod || []);
    const idx = list.findIndex((it:any) => String(it.id) === realId);
    if (idx < 0 || list.length < 2) setPlaybackNeighbors(null);
    else {
      const previous = idx > 0 ? list[idx - 1] : (wrap ? list[list.length - 1] : null);
      const next = idx + 1 < list.length ? list[idx + 1] : (wrap ? list[0] : null);
      setPlaybackNeighbors({ previous, next, position: idx + 1, total: list.length, source: "legacy" });
    }
    return () => { cancelled = true; };
  }, [visible, activePlaylist?.id, params.id, sessionKind, source?.nav?.group, source?.nav?.search, source?.nav?.scopeKey, orderedNavigationScopeIds, syntheticNav?.previousId, syntheticNav?.nextId, seriesNavigationItems]);

  const canPrevious = !!playbackNeighbors?.previous;
  const canNext = !!playbackNeighbors?.next;
  const canZap = canPrevious || canNext; // geriye dönük UI/test sözleşmesi; artık content-aware capability'dir.

  const resetTracksForNavigation = () => {
    if (v2Profile.engine === "vlc") { try { vlcRef.current?.stop?.(); } catch {} }
    else if (v2Profile.engine === "mpv") { try { void mpvRef.current?.stop?.(); } catch {} }
    setAudioTracks([]); setSubtitleTracks([]); setVlcVideoTrackId(undefined);
    setSelectedAudioTrack(undefined); setSelectedSubtitleTrack(undefined); setSelectedAudio(null); setSelectedSubtitle(null);
    setIsSeekable(false); setError(null); setIsBuffering(true);
    if (engine === "vlc") setUseVLC(true); else setUseVLC(false);
  };

  const navigateRelative = async (delta: 1 | -1) => {
    const target:any = delta > 0 ? playbackNeighbors?.next : playbackNeighbors?.previous;
    if (!target) { flashMessage(delta > 0 ? "Sonraki içerik yok" : "Önceki içerik yok"); return; }
    haptic.medium();
    resetTracksForNavigation();

    if (sessionKind === "live") {
      flashMessage(`${delta > 0 ? "⏭" : "⏮"} ${target.name || "Kanal"}`);
      switchChannel(String(target.id), source?.nav);
      return;
    }

    if (sessionKind === "vod") {
      const targetId = String(target.id || target.stream_id || "");
      if (!targetId || !target.url) { flashMessage("Komşu filmin oynatma kaynağı yok"); return; }
      const syntheticId = `vodplay-${targetId}`;
      await storage.setItem(EPISODE_URL_KEY + syntheticId, JSON.stringify({
        url: target.url, name: target.name || "Film", group: target.group || "Film",
        container_ext: target.container_ext || "mp4", poster: target.poster || null,
      }));
      flashMessage(`${delta > 0 ? "⏭" : "⏮"} ${target.name || "Film"}`);
      switchContent({ id: syntheticId, ext: "true", kind: "vod", nav: source?.nav });
      return;
    }

    if (sessionKind === "series") {
      const syntheticId = String(target.id || "");
      if (!syntheticId) return;
      let payload = await storage.getItem<string>(EPISODE_URL_KEY + syntheticId, "");
      if (!payload && target.url) {
        const seriesNavKey = externalStream?.seriesNavKey;
        payload = JSON.stringify({
          url: target.url, name: target.name || "Bölüm", group: target.group || "Dizi",
          container_ext: target.container_ext || "mp4", poster: target.poster || null, seriesNavKey,
        });
        await storage.setItem(EPISODE_URL_KEY + syntheticId, payload);
      }
      if (!payload) { flashMessage("Komşu bölümün oynatma kaynağı bulunamadı"); return; }
      flashMessage(`${delta > 0 ? "⏭" : "⏮"} ${target.name || "Bölüm"}`);
      switchContent({ id: syntheticId, ext: "true", kind: "series", nav: source?.nav });
      return;
    }
  };

  const zap = (delta: 1 | -1) => { void navigateRelative(delta); };

  /** Oynatmayı durdurup geri döner. */
  const stopPlayback = () => {
    haptic.medium();
    haltPlaybackForExit();
    closePlayer();
  };

  useEffect(() => {
    if (sheet !== "stats") return;
    const t = setInterval(() => setStatsTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sheet]);

  /**
   * TV -> TELEFON SENKRONU (v8.2.0)
   * ===========================================================================
   * SORUN: Telefondan TV'ye komut gidiyordu ama TV'nin DURUMU telefona hiç
   * dönmüyordu. Kullanıcı TV kumandasıyla duraklatınca telefon hâlâ
   * "oynatılıyor" gösteriyordu; ilerleyen konum da telefona yansımıyordu.
   * "Televizyonda kafasına göre gidiyor" şikâyetinin ikinci yarısı buydu.
   *
   * ÇÖZÜM: onMediaStatusUpdated ile TV'nin oynatma durumu ve konumu dinleniyor.
   * (Alanlar paket tipinden doğrulandı: playerState, streamPosition)
   * ===========================================================================
   */
  useEffect(() => {
    if (!castSession) return;
    let sub: any = null;
    try {
      const client = castSession.client || castSession.getClient?.();
      if (!client?.onMediaStatusUpdated) return;

      const applyRemoteStatus = (st: any) => {
        if (!st) return;
        // Remote receiver playback authority'dir. Telefon UI'sı optimistic toggle
        // yerine bu doğrulanmış state'i izler.
        const ps = String(st.playerState || "").toLowerCase();
        castRemotePlayerStateRef.current = ps;
        if (ps === "playing") { setIsPlaying(true); setIsBuffering(false); }
        else if (ps === "paused" || ps === "idle") { setIsPlaying(false); setIsBuffering(false); }
        else if (ps === "buffering" || ps === "loading") { setIsBuffering(true); }

        if (typeof st.streamPosition === "number" && st.streamPosition >= 0) {
          castRemotePositionRef.current = st.streamPosition;
          setVideoStats(prev => ({ ...prev, currentTime: st.streamPosition }));
        }
        const range = st.liveSeekableRange;
        castLiveSeekableRangeRef.current = range && Number.isFinite(range.startTime) && Number.isFinite(range.endTime)
          ? { startTime: Number(range.startTime), endTime: Number(range.endTime) }
          : null;
        if (typeof st.volume === "number" && Number.isFinite(st.volume)) {
          setVolume(st.isMuted ? 0 : Math.round(Math.max(0, Math.min(1, st.volume)) * 100));
        }
      };

      sub = client.onMediaStatusUpdated(applyRemoteStatus);
      // Rebind edilen mevcut session'da yeni event gelmesini bekleme; mevcut
      // receiver state'ini hemen çek. API yoksa listener tek başına çalışır.
      try {
        const currentStatus = client.getMediaStatus?.();
        if (currentStatus?.then) currentStatus.then(applyRemoteStatus).catch(() => {});
      } catch {}
    } catch { /* dinleyici kurulamazsa tek yönlü çalışmaya devam eder */ }

    return () => { try { sub?.remove?.(); } catch {} };
  }, [castSession]);

  /**
   * KAYIT GÖSTERGESİ (v7.8.0)
   * Kayıt sürerken kırmızı nokta yanıp söner ve süre sayar.
   * Kayıt yokken zamanlayıcı çalışmaz (pil dostu).
   */
  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => {
      setRecBlink(b => !b);
      setStatsTick(Date.now());   // süre sayacı da ilerlesin
    }, 600);
    return () => clearInterval(t);
  }, [isRecording]);


  /**
   * TV KUMANDA — GERİ TUŞU (v5.2.0)
   * TV'de "Geri" iki aşamalı olmalı: kontroller açıksa önce onları kapat,
   * kapalıysa oynatıcıdan çık. Böylece yanlışlıkla yayından düşmek zorlaşır.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!visible) return false; // katman gizli → geri tuşu tabs'a ait
      // v9.20.0: En iç katmandan dışarı doğru kapanış.
      if (sheet !== null) {
        setSheet(null);
        return true;
      }
      if (showControls) {
        setShowControls(false);
        return true; // önce ana kontrolleri kapat
      }
      stopPlayback(); // Panel kapalıysa playback'i doğru lifecycle ile kapat.
      return true;
    });
    return () => sub.remove();
  }, [sheet, showControls, visible]);

  // Orientation handling: allow both portrait & landscape, user controls
  const [locked, setLocked] = useState<"landscape" | "portrait" | "auto">("auto");

  /**
   * TV YÖN KİLİDİ (v9.5.0 — portre sorunu kök çözümü)
   * ---------------------------------------------------------------------------
   * TV box'ları kilit AÇILINCA kendi doğal yönlerine döner; birçok box'ın
   * doğal yönü PORTRE olduğu için görüntü dikey hale geliyordu ("görüntü
   * portre" şikâyeti). TV'de her zaman YATAY kilitliyoruz; telefonda serbest.
   *
   * ÖNEMLİ: isTv bağlamda ASENKRON çözülür (ilk render'da false, sonra true).
   * Bu yüzden kilit/aç işlemi isTv değişimine TEPKİ verir. Portreye geri dönüş
   * ise SADECE gerçek çıkışta (unmount) ve ref'teki GÜNCEL isTv'ye göre yapılır;
   * böylece isTv false→true olurken araya portre sıçraması girmez.
   */
  const isTvRef = useRef(isTv);
  isTvRef.current = isTv;

  useEffect(() => {
    (async () => {
      try {
        if (!visible) { await ScreenOrientation.unlockAsync(); return; }
        if (isTv) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else {
          await ScreenOrientation.unlockAsync();
        }
      } catch {}
    })();
  }, [isTv, visible]);

  const lastSessionKindRef = useRef(sessionKind);
  if (visible) lastSessionKindRef.current = sessionKind;

  useEffect(() => {
    if (visible) return;

    const previousKind = lastSessionKindRef.current;
    if (previousKind !== "live") persistSyntheticProgress();
    const releaseStartedAt = Date.now();
    const memoryBefore = KizilkanNativeCore.available ? KizilkanNativeCore.getRuntimeMemory() : {};
    let sourceDetached = false;

    try {
      if (v2Profile.engine === "mpv") {
        void mpvRef.current?.stop?.();
      } else if (v2Profile.engine === "vlc") {
        vlcRef.current?.stop?.();
      } else {
        player?.pause?.();
        /**
         * v17.0.0 RESOURCE LIFECYCLE: PlayerHost/View kalıcı mount kalır fakat
         * playback source/codec kalmak zorunda değildir. v16.14.8'de live source
         * close sonrası bağlı tutulabiliyordu; bu native decoder/buffer belleğini
         * gereksiz yaşatabilir. replace(null) yalnız media source'u detach eder,
         * kalıcı surface/view mimarisini bozmaz.
         */
        try { (player as any)?.replace?.(null); sourceDetached = true; } catch {}
        lastExoUrlRef.current = null;
      }
    } catch {}

    if (previousKind !== "live") setExternalStream(null);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setSelectedAudio(null);
    setSelectedSubtitle(null);
    setSelectedAudioTrack(undefined);
    setSelectedSubtitleTrack(undefined);
    setVlcVideoTrackId(undefined);
    setIsPlaying(false);
    setIsBuffering(false);
    rebufferActiveRef.current = null;

    const memoryAfter = KizilkanNativeCore.available ? KizilkanNativeCore.getRuntimeMemory() : {};
    void recordDiagnostic("player", "PLAYER_RESOURCE_RELEASE", {
      previousKind, engine: v2Profile.engine, sourceDetached,
      releaseMs: Date.now() - releaseStartedAt, memoryBefore, memoryAfter,
    }, { sessionId: playerDiagnosticSessionRef.current, stage: "playerResourceRelease", durationMs: Date.now() - releaseStartedAt, outcome: "success" });
  }, [visible, useVLC, player, v2Profile.engine, persistSyntheticProgress]);

  useEffect(() => {
    const profileReady = activeSessionId > 0 && profileReadySessionId === activeSessionId;
    if (!profileReady || useVLC || v2Profile.engine !== "media3") return;
    const url = playbackRequest?.url ?? null;
    if (url && url !== lastExoUrlRef.current) {
      lastExoUrlRef.current = url;
      try { player?.replace?.(media3Source as any); player?.play?.(); } catch {}
    }
  }, [activeSessionId, profileReadySessionId, playbackRequest?.url, media3Source, useVLC, v2Profile.engine, player]);

  useEffect(() => {
    // Yalnızca gerçek unmount'ta çalışır. TV'de portre kilitlemek zararlı
    // olduğu için ref'teki güncel isTv'ye bakılır.
    return () => {
      if (!isTvRef.current) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
      }
    };
  }, []);

  const applyLock = async (mode: "landscape" | "portrait" | "auto") => {
    setLocked(mode);
    try {
      if (mode === "landscape") await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      else if (mode === "portrait") await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      else await ScreenOrientation.unlockAsync();
    } catch {}
    revealControls();
  };

  // Sleep timer tick
  useEffect(() => {
    if (!sleepAt) { setSleepRemaining(""); return; }
    const tick = () => {
      const ms = sleepAt - Date.now();
      if (ms <= 0) {
        // fire
        try { player?.pause(); } catch {}
        setSleepAt(null);
        setSleepRemaining("");
        goBack();
        return;
      }
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      setSleepRemaining(`${mins}:${String(secs).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepAt]);

  /**
   * PLAYER CONTROLS v2 (v9.20.0)
   * - Kanal ilk açıldığında ve zap sonrası panel KAPALI kalır.
   * - TV: kullanıcı OK ile açar; Back ile kapatır; görüntü varken 12 sn hareketsizlikte kapanır.
   * - Telefon/tablet: tek dokunuş aç/kapat; görüntü varken 10 sn hareketsizlikte kapanır.
   * - Bir alt sheet açıkken auto-hide TAMAMEN durur; kullanıcı seçim yaparken
   *   görünmez focus catcher'ın geri gelmesine izin verilmez.
   */
  const cancelHide = () => {
    controlsHideGenerationRef.current += 1;
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    // showControls mevcut render'da false olsa bile revealControls ile aynı
    // anda çağrılabilsin; yalnız görünür player ve kapalı alt-sheet şarttır.
    if (sheet !== null || !visible) return;
    /**
     * v16.2.0: Görüntü YOKKEN kullanıcı motor değiştirmek/yeniden denemek
     * ister; 4 saniye buna yetmiyordu. İlk kare gelmemişse süre uzatılır.
     */
    /**
     * v16.5.0 — PANEL ÇOK ÇABUK KAYBOLUYORDU.
     * Kullanıcı: "kanal açıkken ekrana tıklayınca açılan panel çok kısa
     * zamanda kayboluyor." Görüntü varken süre 4 sn idi; kullanıcı menüyü
     * okuyup bir seçim yapmaya fırsat bulamıyordu. Süre iki katına çıkarıldı.
     * Görüntü YOKKEN (motor değiştirme/yeniden deneme gerekir) daha da uzun.
     */
    const noPicture = !firstFrameSeenRef.current;
    const generation=++controlsHideGenerationRef.current;
    hideTimer.current = setTimeout(() => {
      if (generation !== controlsHideGenerationRef.current) return;
      if (sheetRef.current !== null || !showControlsRef.current) return;
      setShowControls(false);
    }, noPicture ? (isTv ? 20000 : 15000) : (isTv ? 12000 : 10000));
  };

  const revealControls = () => {
    lastControlsRevealAtRef.current = Date.now();
    setShowControls(true);
    scheduleHide(); // her gerçek kullanıcı etkileşiminde süre baştan başlar
  };

  // Kontrol görünürlüğü/sheet durumu değişince timer tek merkezden yönetilir.
  useEffect(() => {
    if (!visible || !channel) {
      cancelHide();
      return;
    }
    if (sheet !== null) {
      cancelHide();
      if (!showControls) setShowControls(true);
      return;
    }
    if (showControls) scheduleHide();
    else cancelHide();
    return cancelHide;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, channel?.id, showControls, sheet, isTv]);

  // İlk kanal, her zap/yeni kanal ve PlayerHost yeniden görünür olduğunda:
  // kullanıcı istemedikçe panel açılmaz. Aynı kanalı listeden tekrar açma da dahil.
  /**
   * v16.2.0 — PANEL "AÇILIR AÇILMAZ KAPANIYOR" DÜZELTMESİ
   * -------------------------------------------------------------------------
   * KULLANICI BİLDİRİMİ: "görüntü yok iken ekrana dokununca player ayar paneli
   * geliyor hemencecik gidiyor."
   * SEBEP: bu effect `visible` VEYA `channel?.id` her değiştiğinde KOŞULSUZ
   * paneli kapatıyordu. Görüntü gelmeyen kanalda motor geri düşme zinciri
   * (media3 -> mpv -> vlc) çalışırken effect yeniden tetikleniyor ve kullanıcı
   * paneli açar açmaz kapanıyordu.
   * ÇÖZÜM: yalnızca kanal GERÇEKTEN değiştiğinde sıfırla. Aynı kanal içinde
   * motor/yeniden deneme olurken panele dokunulmaz.
   */
  const lastResetChannelRef = useRef<string>("");
  /** v16.2.0: bu oturumda ilk video karesi geldi mi? (panel gizleme süresi için) */
  const firstFrameSeenRef = useRef(false);
  useEffect(() => {
    const id = channel ? `${String(activePlaylist?.id || "")}|${String(channel.url || channel.id || "")}` : "";
    if (!visible) { lastResetChannelRef.current = ""; return; }
    if (lastResetChannelRef.current === id) return;   // aynı gerçek kaynak -> dokunma
    lastResetChannelRef.current = id;
    firstFrameSeenRef.current = false;   // v16.2.0: yeni kanal -> ilk kare beklentisi sıfırlanır
    cancelHide();
    setSheet(null);
    setShowControls(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, channel?.id, channel?.url, activePlaylist?.id]);

  /**
   * v17.0.0 — Engine-bağımsız rebuffer süre telemetrisi. Startup buffering
   * sayılmaz; yalnız ilk başarılı frame/oynatım sonrasındaki buffering ölçülür.
   */
  useEffect(() => {
    const afterFirstFrame = firstFrameSeenRef.current || successfulSessionRef.current === activeSessionId;
    const active = rebufferActiveRef.current;
    if (!visible || activeSessionId <= 0 || !afterFirstFrame) {
      if (!visible) rebufferActiveRef.current = null;
      return;
    }
    if (isBuffering && !active) {
      const startedAt = Date.now();
      rebufferActiveRef.current = { sid: activeSessionId, startedAt, engine: v2ProfileKey };
      const sequence = ++rebufferSequenceRef.current;
      void recordDiagnostic("player", "REBUFFER_START", {
        sequence, engine: v2ProfileKey, phase: v2Phase, channelId: String(channel?.id || ""),
        afterSeek: Date.now() < userSeekGraceUntilRef.current, sourceCandidate: playbackUrlIndex,
      }, { sessionId: playerDiagnosticSessionRef.current, stage: "rebuffer", outcome: "started" });
      return;
    }
    if (!isBuffering && active && active.sid === activeSessionId) {
      const durationMs = Math.max(0, Date.now() - active.startedAt);
      rebufferActiveRef.current = null;
      void recordDiagnostic("player", "REBUFFER_END", {
        engine: active.engine, durationMs, phase: v2Phase, channelId: String(channel?.id || ""), sourceCandidate: playbackUrlIndex,
      }, { sessionId: playerDiagnosticSessionRef.current, stage: "rebuffer", durationMs, outcome: "ended" });
    }
  }, [visible, activeSessionId, isBuffering, v2ProfileKey, v2Phase, channel?.id, playbackUrlIndex]);

  const togglePlay = () => {
    // YAYIN AKTİFSE komutu TV'deki oynatıcıya gönder (v7.4.0).
    if (castSession) {
      try {
        const client = castSession.client || castSession.getClient?.();
        if (client) {
          if (isPlaying) client.pause?.(); else client.play?.();
          // Cast receiver authoritative: isPlaying yalnız MEDIA_STATUS_UPDATED
          // ile değişir. Komut reddedilirse telefon sahte state göstermez.
          revealControls();
          return;
        }
      } catch { /* başarısızsa yerel oynatıcıya düş */ }
    }
    if (v2Profile.engine === "mpv") {
      if (isPlaying) void mpvRef.current?.pause(); else void mpvRef.current?.play();
      setIsPlaying(!isPlaying);
      revealControls();
      return;
    }
    if (v2Profile.engine === "vlc") {
      if (isPlaying) vlcRef.current?.pause(); else vlcRef.current?.play();
      setIsPlaying(!isPlaying);
      revealControls();
      return;
    }
    if (!player) return;
    if (isPlaying) player.pause(); else player.play();
    revealControls();
  };

  const seekBy = (delta: number) => {
    void recordDiagnostic("player", "SEEK_RELATIVE_REQUEST", { delta, engine: v2Profile.engine, phase: v2Phase, buffering: isBufferingRef.current }, { sessionId: playerDiagnosticSessionRef.current });
    /**
     * YAYIN SIRASINDA SARMA (v7.4.0, v8.1.0'da iyileştirildi)
     * CANLI yayında sarma yapılamaz (kayıtlı içerik değil) — kullanıcıya
     * sessizce hiçbir şey olmuyormuş gibi görünmesin diye açıkça söylüyoruz.
     */
    if (castSession) {
      try {
        const client = castSession.client || castSession.getClient?.();
        if (client) {
          if (!isSynthetic) {
            // Cast live stream DVR destekliyorsa MediaStatus.liveSeekableRange
            // gerçek capability'dir. Yoksa seek kapalı kalır.
            const range = castLiveSeekableRangeRef.current;
            if (!range) {
              flashMessage("Bu canlı yayında ileri/geri alınamaz");
              return;
            }
            const current = castRemotePositionRef.current || range.endTime;
            const target = Math.max(range.startTime, Math.min(range.endTime, current + delta));
            client.seek?.({ position: target, relative: false });
          } else {
            client.seek?.({ position: delta, relative: true });
          }
          revealControls();
          return;
        }
      } catch { /* başarısızsa yerel oynatıcıya düş */ }
    }
    if (v2Profile.engine === "mpv") {
      if (!isSeekable && !isSynthetic) {
        flashMessage("Bu yayında ileri/geri alınamaz");
        return;
      }
      void mpvRef.current?.seekBy(delta);
      revealControls();
      return;
    }
    if (v2Profile.engine === "vlc") {
      if (!isSeekable) {
        flashMessage("Bu yayında ileri/geri alınamaz");
        return;
      }
      try {
        const curSec = videoStats.position || 0;
        const targetMs = Math.max(0, (curSec + delta) * 1000);
        vlcRef.current?.seek(targetMs, "time");
      } catch {}
      revealControls();
      return;
    }
    if (!player) return;
    try {
      const cur = (player as any).currentTime || 0;
      (player as any).currentTime = Math.max(0, cur + delta);
    } catch {}
    revealControls();
  };

  const cycleFit = () => {
    setFit(prev => prev === "contain" ? "cover" : prev === "cover" ? "fill" : "contain");
    revealControls();
  };

  const setSleep = (minutes: number | null) => {
    if (sleepTimer.current) { clearTimeout(sleepTimer.current); sleepTimer.current = null; }
    if (minutes === null) {
      setSleepAt(null);
      setSleepRemaining("");
    } else {
      setSleepAt(Date.now() + minutes * 60 * 1000);
    }
    setSheet(null);
  };

  const selectAudio = (t: any) => {
    if (v2Profile.engine === "mpv") {
      if (typeof t?.id === "number") {
        void mpvRef.current?.setAudioTrack(t.id);
        setSelectedAudioTrack(t.id);
        setSelectedAudio(t);
        flashMessage(`Ses: ${t.name || t.label || "Parça"}`);
      }
    } else if (v2Profile.engine === "vlc") {
      if (typeof t?.id === "number") {
        setSelectedAudioTrack(t.id);
        setSelectedAudio(t);
        flashMessage(`Ses: ${t.name || t.label || "Parça"}`);
      }
    } else {
      try { (player as any).audioTrack = t; setSelectedAudio(t); } catch {}
    }
    setSheet(null);
  };

  const selectSubtitle = (t: any) => {
    if (v2Profile.engine === "mpv") {
      const id = t === null ? -1 : (typeof t?.id === "number" ? t.id : undefined);
      if (id !== undefined) {
        void mpvRef.current?.setSubtitleTrack(id);
        setSelectedSubtitleTrack(id);
        setSelectedSubtitle(t);
        flashMessage(t === null ? "Altyazı kapatıldı" : `Altyazı: ${t.name || t.label || "Parça"}`);
      }
    } else if (v2Profile.engine === "vlc") {
      const id = t === null ? -1 : (typeof t?.id === "number" ? t.id : undefined);
      if (id !== undefined) {
        setSelectedSubtitleTrack(id);
        setSelectedSubtitle(t);
        flashMessage(t === null ? "Altyazı kapatıldı" : `Altyazı: ${t.name || t.label || "Parça"}`);
      }
    } else {
      try { (player as any).subtitleTrack = t; setSelectedSubtitle(t); } catch {}
    }
    setSheet(null);
  };

  const setPlaybackSpeed = (rate: number) => {
    setSpeed(rate);
    if (v2Profile.engine === "media3") {
      try { (player as any).playbackRate = rate; } catch {}
    }
    // VLC ve MPV hız değeri prop üzerinden native view'e uygulanır.
    haptic.soft();
    setSheet(null);
  };

  const flashMessage = (msg: string) => {
    setGestureFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setGestureFlash(null), 800);
  };

  // Double-tap gestures: left = -10s, right = +10s
  // Only enable seek for VOD (synthetic ids)
  const canSeek = isSynthetic;
  const doubleTapSkip = (dir: "back" | "fwd") => {
    if (!canSeek) {
      flashMessage("Canlı yayında ileri/geri alınamaz");
      return;
    }
    haptic.medium();
    seekBy(dir === "fwd" ? 10 : -10);
    flashMessage(dir === "fwd" ? "⏭ +10s" : "⏮ -10s");
  };

  const emergencyTouchActive = !!(visible && channel && !isTv && !showControls && sheet === null && !error && (resolving || isBuffering || v2Phase !== "playing"));

  // Single tap: toggle controls
  /**
   * DOKUNMA = AÇ/KAPAT (v9.3.0 — kullanıcı isteği)
   * Eskiden dokunma yalnızca AÇIYORDU; panel kendiliğinden kaybolana kadar
   * beklemek gerekiyordu. Artık aynı dokunuş kapatıyor da.
   */
  const toggleControls = () => {
    // v16.12.0: emergency Pressable ile ana GestureDetector aynı fiziksel
    // dokunmayı art arda raporlarsa ikinci callback paneli anında kapatmasın.
    if (showControls && Date.now() - lastControlsRevealAtRef.current < 500) {
      scheduleHide();
      return;
    }
    if (showControls) { cancelHide(); setShowControls(false); }
    else revealControls();
  };

  // v15.2.23-RC2: Gesture Handler callback'leri Reanimated kurulu olduğunda
  // varsayılan olarak UI worklet runtime'ında çalışır. Bu player'daki callback'ler
  // React state/ref, Dimensions, haptic ve native session API'lerine eriştiği için
  // JS thread authority altında çalıştırılır. Böylece orientation/gesture sırasında
  // `CppException: TypeError: undefined is not a function` worklet crash yolu kapanır.
  const tapGesture = Gesture.Tap()
    .enabled(visible && !isTv && !emergencyTouchActive)
    .maxDuration(200)
    .runOnJS(true)
    .onEnd(() => {
      toggleControls();
    });

  // ÇİFT DOKUNUŞ DÜZELTMESİ (P0-5):
  // ESKİ: iki ayrı jest (left/right) ikisi de TÜM ekranı kaplıyordu; Exclusive
  // hep ilkine (back) öncelik veriyordu -> her çift dokunuş -10s oluyordu.
  // YENİ: TEK jest, dokunma X konumuna göre yön belirler:
  //   ekranın sol yarısı -> geri (-10s), sağ yarısı -> ileri (+10s).
  const doubleTapGesture = Gesture.Tap()
    .enabled(visible && !isTv && !emergencyTouchActive)
    .numberOfTaps(2)
    .maxDuration(300)
    .runOnJS(true)
    .onEnd((e) => {
      // JS thread üzerinde useWindowDimensions değeri kullanılır; UI worklet
      // runtime'ından React Native Dimensions modülüne doğrudan çağrı yapılmaz.
      const isLeft = e.x < screenW / 2;
      doubleTapSkip(isLeft ? "back" : "fwd");
    });

  /**
   * DİKEY KAYDIRMA = SES (v7.7.0)
   * Ekranın SAĞ yarısında yukarı/aşağı kaydırma sesi değiştirir.
   * Yukarı = artır, aşağı = azalt. Ekran yüksekliğinin tamamı 0-100 aralığı.
   * TV'de anlamsız olduğu için yalnızca dokunmatik cihazlarda etkin.
   */
  const applyVolume = (v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    setVolume(clamped);

    /**
     * YAYIN SIRASINDA SES (v8.1.0)
     * Yayın aktifken ses telefonun değil TV'nin sesidir. Kaydırma artık
     * cihazdaki sesi ayarlıyor.
     * NOT: Paket belgesi setStreamVolume için client'ı öneriyor
     * ("session.setVolume promise döndürmez, client.setStreamVolume kullanın").
     * Değer 0-1 aralığındadır, bizim ölçeğimiz 0-100.
     */
    if (castSession) {
      try {
        const client = castSession.client || castSession.getClient?.();
        client?.setStreamVolume?.(clamped / 100);
      } catch { /* başarısızsa yerel ses zaten ayarlandı */ }
    }
    setVolumeHint(clamped);
    if (volHintTimer.current) clearTimeout(volHintTimer.current);
    volHintTimer.current = setTimeout(() => setVolumeHint(null), 900);
  };

  const volumeGesture = Gesture.Pan()
    .enabled(visible && !isTv && !emergencyTouchActive)
    .activeOffsetY([-12, 12])       // yatay kaydırmayla çakışmasın
    .runOnJS(true)
    .onBegin(() => { volumeStartRef.current = volume; })
    .onUpdate((e) => {
      // Yalnızca SAĞ yarıda çalışsın (sol yarı ileride parlaklık için ayrılmıştır)
      if (e.x < screenW / 2) return;
      const delta = -(e.translationY / 300) * 100;   // 300px = tam aralık
      applyVolume(volumeStartRef.current + delta);
    });

  const longPressGesture = Gesture.LongPress()
    .enabled(visible && !isTv && !emergencyTouchActive)
    .minDuration(500)
    .runOnJS(true)
    .onStart(() => {
      setPlaybackSpeed(2.0);
      flashMessage("⏩ 2x hız");
    })
    .onEnd(() => {
      setPlaybackSpeed(1.0);
    });

  const goBack = async () => {
    // TV'de portre kilidi anlamsız/zararlı; sadece telefonda portreye dön.
    if (!isTv) {
      try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT); } catch {}
    }
    haltPlaybackForExit();
    closePlayer();
  };

  const openCatchup = () => {
    if (!channel) return;
    haltPlaybackForExit();
    closePlayer();
    router.push({ pathname: "/catchup", params: { channel: channel.id } });
  };

  /**
   * TV KUMANDA — MEDYA TUŞLARI (v6.4.0, v7.6.0'da KONUMU DÜZELTİLDİ)
   *
   * ÖNEMLİ DÜZELTME: Bu çağrı eskiden dosyanın ÜST kısmındaydı; oysa
   * kullandığı fonksiyonların bir kısmı (togglePlay, seekBy, openCatchup)
   * DAHA AŞAĞIDA tanımlanıyordu. JavaScript'te `const` yukarı taşınmaz
   * (hoisting yok), bu yüzden bu isimler çağrı anında UNDEFINED oluyordu.
   * Hook içindeki try/catch sayesinde uygulama ÇÖKMÜYOR ama tuşlar
   * SESSİZCE ÇALIŞMIYORDU — CH+/- dahil.
   * Artık tüm bağımlılıklar tanımlandıktan SONRA çağrılıyor.
   */
  /**
   * KAYIT SİSTEMİ (v7.8.0) — KÖK SEBEP DÜZELTİLDİ
   * ===========================================================================
   * NEDEN HİÇ KAYIT OLMUYORDU?
   * expo-file-system'in documentDirectory değeri bir URI'dir:
   *     file:///data/user/0/com.kizilkan.player/files/
   * libVLC ise DÜZ DOSYA YOLU bekler:
   *     /data/user/0/com.kizilkan.player/files/
   * "file://" öneki yüzünden libVLC yolu geçersiz sayıyor ve kayıt hiç
   * başlamıyordu. Hata da onEncounteredError ile geliyor, "yayın hatası"
   * gibi görünüyordu.
   * ÇÖZÜM: Yol libVLC'ye verilmeden önce "file://" öneki temizleniyor.
   * ===========================================================================
   */
  const toNativePath = (uri: string) => uri.replace(/^file:\/\//, "");

  /** Kayıt klasörünü hazırlar ve DÜZ yolu döndürür. */
  const prepareRecordDir = async (target: "app" | "download" | "custom"): Promise<string | null> => {
    try {
      const FS = await import("expo-file-system/legacy");
      let uri: string;

      if (target === "download") {
        // Genel İndirilenler klasörü — dosya yöneticisinden erişilebilir.
        uri = `file:///storage/emulated/0/Download/KIZILKAN PLAYER ELITE/Record/`;
      } else if (target === "custom" && customRecordDir) {
        uri = customRecordDir;
      } else {
        // Uygulama klasörü — izin gerektirmez, her zaman çalışır.
        uri = `${FS.documentDirectory}recordings/`;
      }

      try { await FS.makeDirectoryAsync(uri, { intermediates: true }); } catch { /* zaten varsa sorun değil */ }
      return toNativePath(uri);
    } catch (e: any) {
      Alert.alert("Klasör hazırlanamadı", String(e?.message || e));
      return null;
    }
  };

  const startRecording = async (target: "app" | "download" | "custom") => {
    const dir = await prepareRecordDir(target);
    if (!dir) return;
    try {
      await vlcRef.current?.record(dir);
      setIsRecording(true);
      setRecordStart(Date.now());
      setRecordDirLabel(
        target === "download" ? "İndirilenler / KIZILKAN PLAYER ELITE / Record" : "Uygulama klasörü"
      );
      setSheet(null);
      flashMessage("● KAYIT BAŞLADI");
    } catch (e: any) {
      setIsRecording(false);
      Alert.alert("Kayıt başlatılamadı", String(e?.message || e));
    }
  };

  const stopRecording = async () => {
    try {
      await vlcRef.current?.record();   // parametresiz = durdur
    } catch { /* yine de durumu temizle */ }
    setIsRecording(false);
    setRecordStart(null);

    /**
     * KAYIT DOĞRULAMASI (v8.3.0) — "kaydetti" deyip dosya olmaması bitti
     * Kullanıcı bildirimi: üç seçenekte de "kaydedildi" yazıyordu ama dosya
     * hiçbir yerde yoktu. Artık dosyanın GERÇEKTEN var olduğu ve boyutu
     * kontrol ediliyor; yoksa sebebi açıkça söyleniyor.
     */
    try {
      const FS: any = await import("expo-file-system/legacy");
      const path = recordPath;
      if (!path) {
        Alert.alert(
          "Kayıt doğrulanamadı",
          "Oynatıcı kayıt dosyasının yerini bildirmedi.\n\n" +
            "Bu genellikle kaydın HİÇ BAŞLAMADIĞI anlamına gelir.\n\n" +
            "Olası sebepler:\n" +
            "• Yayın kopyalamaya kapalı olabilir\n" +
            "• Motor VLC değil (ExoPlayer kayıt yapamaz)\n\n" +
            "Motoru VLC'ye alıp tekrar deneyin."
        );
        return;
      }
      const uri = path.startsWith("file://") ? path : `file://${path}`;
      const info = await FS.getInfoAsync(uri);
      if (info?.exists && (info.size ?? 0) > 0) {
        const mb = ((info.size ?? 0) / 1048576).toFixed(1);
        Alert.alert("Kayıt tamamlandı ✓", `Dosya (${mb} MB):\n${path}`);
      } else {
        Alert.alert(
          "Kayıt dosyası oluşmadı",
          `Beklenen yer:\n${path}\n\n` +
            "Dosya yok veya boş. Yayın kaydedilemiyor olabilir."
        );
      }
    } catch (e: any) {
      Alert.alert("Kayıt durumu bilinmiyor", String(e?.message || e));
    }
  };

  const commitNumericZap = React.useCallback(async (digits: string) => {
    if (!isTv || sessionKind !== "live" || !activePlaylist?.id || !digits) return;
    const displayPosition = Number(digits);
    if (!Number.isInteger(displayPosition) || displayPosition <= 0) { setNumericZapText(""); return; }
    const nav = source?.nav;
    const group = nav?.group || "__all__";
    const search = nav?.search || "";
    try {
      let target:any = null;
      if (KizilkanNativeCore.available) {
        const page = await KizilkanNativeCore.queryItems<any>(activePlaylist.id, "live", { group, search, offset: displayPosition - 1, limit: 1 });
        target = page.items?.[0] || null;
      } else {
        const list = activePlaylist.channels || [];
        target = list[displayPosition - 1] || null;
      }
      if (!target?.id) { flashMessage(`Kanal ${displayPosition} bulunamadı`); return; }
      resetTracksForNavigation();
      flashMessage(`#${displayPosition} • ${target.name || "Kanal"}`);
      switchChannel(String(target.id), source?.nav);
      void recordDiagnostic("player", "TV_NUMERIC_ZAP", { displayPosition, channelId: String(target.id), group, search: search ? "<set>" : "" }, { sessionId: playerDiagnosticSessionRef.current, stage: "numericZap", outcome: "success" });
    } catch (error) {
      flashMessage("Numaralı kanal geçişi başarısız");
      void recordDiagnostic("player", "TV_NUMERIC_ZAP_FAILED", { displayPosition, error: String((error as any)?.message || error) }, { sessionId: playerDiagnosticSessionRef.current, stage: "numericZap", outcome: "failed" });
    } finally { setNumericZapText(""); }
  }, [isTv, sessionKind, activePlaylist?.id, activePlaylist?.channels, source?.nav?.group, source?.nav?.search, switchChannel]);

  const pushNumericZapDigit = React.useCallback((digit: string) => {
    if (!isTv || sessionKind !== "live" || showControls || sheet !== null) return;
    setNumericZapText(prev => {
      const next = (prev + digit).replace(/^0+(?=\d)/, "").slice(-4);
      if (numericZapTimerRef.current) clearTimeout(numericZapTimerRef.current);
      numericZapTimerRef.current = setTimeout(() => { void commitNumericZap(next); }, 1100);
      return next;
    });
  }, [isTv, sessionKind, showControls, sheet, commitNumericZap]);

  useEffect(() => () => { if (numericZapTimerRef.current) clearTimeout(numericZapTimerRef.current); }, []);

  useRemoteKeys({
    // Fiziksel CH+/- yalnız canlı kanal zapping semantiğidir.
    channelUp: () => { if (sessionKind === "live") zap(1); },
    channelDown: () => { if (sessionKind === "live") zap(-1); },
    // MEDIA_NEXT/PREVIOUS içerik bağlamını izler: live kanal, VOD film, series bölüm.
    contentNext: () => zap(1),
    contentPrevious: () => zap(-1),
    digit0: () => pushNumericZapDigit("0"), digit1: () => pushNumericZapDigit("1"),
    digit2: () => pushNumericZapDigit("2"), digit3: () => pushNumericZapDigit("3"),
    digit4: () => pushNumericZapDigit("4"), digit5: () => pushNumericZapDigit("5"),
    digit6: () => pushNumericZapDigit("6"), digit7: () => pushNumericZapDigit("7"),
    digit8: () => pushNumericZapDigit("8"), digit9: () => pushNumericZapDigit("9"),
    /**
     * GPT v10.4.0: OK/ENTER artık native plugin'den "select" olarak gelir.
     * Kontroller gizliyken panel açılır. Kontroller görünürken select handler
     * hiçbir şey yapmaz; seçili FocusButton'ın normal onPress'i çalışır.
     */
    select: () => { if (!showControls && sheet === null) revealControls(); },
    playPause: togglePlay,
    play: () => { if (!isPlaying) togglePlay(); },
    pause: () => { if (isPlaying) togglePlay(); },
    stop: stopPlayback,
    forward: () => seekBy(30),
    rewind: () => seekBy(-30),
    info: () => setSheet("stats"),
    guide: () => { if (supportsCatchup) openCatchup(); },

    /**
     * SOL/SAĞ İLE KANAL DEĞİŞTİRME (v7.6.0) — TiviMate'in en çok kullanılan
     * kısayolu, bizde eksikti.
     *
     * NEDEN KRİTİK: Chromecast ve Wanbo kumandalarında CH+/- TUŞU YOK.
     * O cihazlarda kanal değiştirmenin BAŞKA YOLU YOKTU.
     *
     * KURAL: Yalnızca kontroller GİZLİYKEN çalışır. Kontroller açıkken
     * sol/sağ normal odak gezinmesi olarak kalır (düğmeler arasında gezinme
     * bozulmasın). Bu, TiviMate'in de uyguladığı davranıştır.
     */
    dpadLeft: () => { if (!showControls && sessionKind === "live") zap(-1); else if (showControls) scheduleHide(); },
    dpadRight: () => { if (!showControls && sessionKind === "live") zap(1); else if (showControls) scheduleHide(); },

    /**
     * YUKARI/AŞAĞI: kontroller gizliyken kanal bilgisini gösterir.
     * (Yayın izlerken "bu ne kanalı" sorusunun hızlı cevabı.)
     */
    // v9.20.0: Yön tuşları artık gizli paneli otomatik açmaz. Panel TV'de
    // yalnız OK/Enter ile açılır. Panel açıkken D-pad hareketi timeout'u yeniler.
    dpadUp: () => { if (showControls) scheduleHide(); },
    dpadDown: () => { if (showControls) scheduleHide(); },

    /**
     * UZUN-BAS GERİ -> KANAL LİSTESİNE DÖN (v7.6.0)
     * TiviMate deseni: her yerden tek hamlede listeye çıkış.
     * Kısa basış normal geri davranışını korur (kontrolleri kapat / çık).
     */
    /**
     * v7.8.0 DÜZELTME: Kullanıcı bildirimi — kısa geri basışı da doğrudan
     * kanal listesine atıyordu. Sebep: native tarafta repeatCount==1 kontrolü
     * bazı kumandalarda KISA basışta da tetikleniyor.
     * ÇÖZÜM: Eşik yükseltildi (aşağıda, plugin içinde) ve burada onay yok;
     * kısa basış BackHandler ile normal davranışını (kontrolleri kapat/çık)
     * sürdürüyor.
     */
    backLongPress: () => {
      haptic.medium();
      haltPlaybackForExit();
      closePlayer();
    },
  },
  /**
   * v9.7.0: Bir alt-sayfa (motor/hız/ses… sheet) AÇIKKEN kumanda yakalayıcı
   * DEVRE DIŞI. Aksi halde D-pad/OK player kontrollerine gidiyor, odak Modal
   * içindeki seçeneklere giremiyor ("kumanda çalışmıyor, seçim yapılamıyor").
   * Kapalıyken native odak Modal'ı yönetir.
   */
  visible && sheet === null);

  /**
   * ETKİN YÜZEY TİPİ (v9.9.0)
   * "surface"/"texture" → sabit. "auto" → TV'de TextureView; ama bu kanalda
   * decoder hatası olduysa (decoderRetrySurface) donanım çözücü için SurfaceView.
   * Telefonda her zaman SurfaceView (davranış değişmez).
   */
  const effectiveSurface: "surfaceView" | "textureView" =
    v2Profile.engine === "media3"
      ? v2Profile.surface
      : (surfaceMode === "texture" ? "textureView" : "surfaceView");

  const effectiveVlcHwAccel =
    v2Profile.engine === "vlc" ? v2Profile.decoder === "hw" : hwAccel;

  // v14.2.0 — Native VLC prop kimlikleri renderlar arasında sabit tutulur.
  // Aksi halde inline array/object her PlayerHost renderında yeni referans üretip
  // native view'e gereksiz option/track prop güncellemesi gönderebilir.
  const vlcExtraOptions = useMemo(() => {
    const referer = playbackRequest?.headers?.Referer;
    return referer ? [`--http-referrer=${referer}`] : undefined;
  }, [playbackRequest?.headers?.Referer]);

  const vlcSelectedTracks = useMemo(() => {
    if (vlcVideoTrackId === undefined || (selectedAudioTrack === undefined && selectedSubtitleTrack === undefined)) return undefined;
    return {
      audio: selectedAudioTrack ?? (audioTracks[0]?.id ?? -1),
      video: vlcVideoTrackId,
      subtitle: selectedSubtitleTrack ?? -1,
    };
  }, [vlcVideoTrackId, selectedAudioTrack, selectedSubtitleTrack, audioTracks]);


  const mpvSource = useMemo(() => playbackRequest ? {
    url: playbackRequest.url,
    headers: playbackRequest.headers,
    bufferMs,
    softwareDecode: mpvForceSoftware,
  } : null, [playbackRequest, bufferMs, mpvRecoveryGeneration, mpvForceSoftware]);

  const activeEngineLabel =
    v2Profile.engine === "media3" ? "Media3"
      : v2Profile.engine === "vlc" ? `VLC ${v2Profile.decoder.toUpperCase()}`
      : "MPV / FFmpeg";


  /**
   * GPT ELITE v15.0.0 — VLC NON-DESTRUCTIVE HEALTH
   *
   * Snapshot / zaman aşımı artık AUTO fallback kararı vermez. Çalışan VLC
   * yayınını probe yüzünden durdurmak yasaktır. Başarı; VLC Playing + video
   * metadata/track + ilerleyen playback clock olaylarının birleşiminden türetilir.
   * HW -> SW geçişi yalnız gerçek native onError olayında yapılır.
   */
  const recordFirstFrameDiagnostic = React.useCallback((profile: EngineProfile, firstFrameMs: number) => {
    void recordFlightRecorderStage(lifecycleTraceRef.current || getCurrentFlightRecorderTrace(), 'firstFrame', { engine: profile.engine, firstFrameMs, channelId: String(channel?.id || '') }, 'success');
    void recordDiagnostic("player", "FIRST_FRAME", {
      channelId: String(channel?.id || ""),
      source: activePlaylist?.source || "",
      engine: profile.engine,
      firstFrameMs,
      totalFromSelectionMs: Math.max(0, Date.now() - playerSelectionStartedAtRef.current),
    }, { sessionId: playerDiagnosticSessionRef.current });
  }, [channel?.id, activePlaylist?.source]);

  const markVlcHealthy = React.useCallback((
    sid: number,
    profile: EngineProfile,
    profileKey: string,
    firstFrameMsOverride?: number,
  ) => {
    if (
      !sessionGateRef.current.isActive(sid) ||
      activeProfileKeyRef.current !== profileKey ||
      profile.engine !== "vlc"
    ) return false;

    const firstFrameMs = firstFrameMsOverride ?? Math.max(0, Date.now() - sessionStartedAtRef.current);
    transitioningSessionRef.current = null;
    setVlcVideoReady(true);
    setV2Phase("playing");
    setRecoveryMessage(null);
    setError(null);
    setTechnicalError(null);
    setIsBuffering(false);
    if (successfulSessionRef.current !== sid) {
      successfulSessionRef.current = sid;
          successfulSessionAtRef.current = Date.now();
      recordEngineSuccess(String(channel?.id || ""), profile, firstFrameMs).catch(() => {});
      recordFirstFrameDiagnostic(profile, firstFrameMs);
    }
    return true;
  }, [channel?.id]);

  /**
   * libVLC tarafında "rendered first frame" callback'i yok. Bu yüzden bir
   * EncounteredError olayı geldiğinde çalışan yayını korumak için en güvenli
   * sinyal native playback clock'un gerçekten ilerlemesidir. Video metadata
   * geç/eksik gelse bile clock ilerliyorsa AUTO çalışan player'ı ASLA öldürmez.
   *
   * NOT: Bu fonksiyon motor hafızasına "video başarılı" yazmaz; yalnız
   * DESTRUCTIVE fallback'i engeller. Başarı kaydı hâlâ video metadata/track ile
   * markVlcHealthy() üzerinden yapılır.
   */
  const vlcPlaybackIsAlive = React.useCallback((sid: number, profileKey: string) => {
    if (
      !sessionGateRef.current.isActive(sid) ||
      activeProfileKeyRef.current !== profileKey ||
      !vlcPlayingRef.current
    ) return false;
    return Date.now() - vlcClockRef.current.lastAdvanceAt <= 3500;
  }, []);

  /**
   * PLAYER V2 FIRST-FRAME WATCHDOG
   * Sayaç yalnız Media3 "readyToPlay" olduktan sonra başlar; ağ bağlantı süresi
   * bu süreye dahil edilmez. Live ve VOD için ayrı kısa eşikler kullanılır.
   */
  useEffect(() => {
    if (!visible || !channel || playbackRequest?.expectsVideo === false || useVLC || v2Profile.engine !== "media3" || !exoReady || exoFirstFrame) return;
    const sid = activeSessionId;
    const timeoutMs = sessionKind === "live" ? FIRST_FRAME_TIMEOUT_LIVE_MS : FIRST_FRAME_TIMEOUT_VOD_MS;
    const t = setTimeout(() => {
      if (!sessionGateRef.current.isActive(sid) || useVLC || exoFirstFrame) return;

      if (transitioningSessionRef.current === sid) return;
      transitioningSessionRef.current = sid;
      const alt = alternateMedia3Surface(v2Profile);
      if (alt && exoRecoveryStep === 0 && surfaceMode === "auto") {
        recordEngineFailure(String(channel.id), v2Profile, "surface", "Media3 readyToPlay sonrası first-frame zaman aşımı").catch(() => {});
        setRecoveryMessage("Görüntü yüzeyi yanıt vermedi; alternatif Media3 yüzeyi deneniyor…");
        setV2Phase("recover_surface");
        setExoRecoveryStep(1);
        setExoFirstFrame(false);
        setV2Profile(alt);
        setIsBuffering(true);
        setTimeout(() => { if (sessionGateRef.current.isActive(sid)) transitioningSessionRef.current = null; }, 80);
        return;
      }

      recordEngineFailure(String(channel.id), v2Profile, "surface", "Media3 profili first-frame üretemedi").catch(() => {});
      try { player?.pause?.(); } catch {}
      try { (player as any)?.replace?.(null); } catch {}
      lastExoUrlRef.current = null;

      if (engine === "auto" && KIZILKAN_MPV_AVAILABLE) {
        setRecoveryMessage("Media3 görüntü üretmedi; MPV / FFmpeg motoru deneniyor…");
        setV2Phase("switch_engine");
        setV2Profile({ engine: "mpv", decoder: "auto" });
        setUseVLC(false);
        setMpvVideoMetaReady(false);
        setMpvVideoReady(false);
        setMpvForceSoftware(false);
        setMpvRecoveryGeneration(g => g + 1);
      } else if (engine === "auto" && VLC_AVAILABLE && Platform.OS !== "web") {
        setRecoveryMessage("Media3 görüntü üretmedi; VLC donanım motoru deneniyor…");
        setV2Phase("switch_engine");
        setV2Profile({ engine: "vlc", decoder: "hw" });
        setUseVLC(true);
        setVlcAutoSoftware(false);
        setVlcVideoMetaReady(false);
        setVlcVideoReady(false);
        setVlcRecoveryGeneration(g => g + 1);
      } else {
        setRecoveryMessage(null);
        setV2Phase("final_error");
        setTechnicalError("Media3 readyToPlay sonrasında doğrulanmış video karesi üretmedi.");
        setError("Media3 görüntü oluşturamadı.");
      }
      setIsBuffering(engine === "auto");
      setTimeout(() => { if (sessionGateRef.current.isActive(sid)) transitioningSessionRef.current = null; }, 80);
    }, timeoutMs);
    return () => clearTimeout(t);
  }, [visible, channel?.id, activeSessionId, sessionKind, playbackRequest?.expectsVideo, useVLC, v2Profile, exoReady, exoFirstFrame, exoRecoveryStep, engine, surfaceMode, player]);

  /**
   * v15.1 RC — MPV FIRST-FRAME / 4K RECOVERY
   *
   * Gerçek cihazda 4K yayında ses/clock ilerlerken görüntünün hiç gelmediği veya
   * kısa süre sonra kaybolduğu görüldü. mpv-android tarafında MediaCodec geçiş ve
   * cihaz-spesifik hwdec sorunları bilinen bir sınıftır. İlk frame doğrulanmazsa
   * aynı bozuk decoder üzerinde option değiştirmek yerine yeni native MPV instance
   * software decode ile remount edilir. Software denemesi de frame üretmezse AUTO
   * zinciri VLC'ye devam eder.
   */
  useEffect(() => {
    if (
      !visible || !channel || playbackRequest?.expectsVideo === false ||
      v2Profile.engine !== "mpv" || !useMPV || mpvVideoReady ||
      v2Phase !== "waiting_first_frame"
    ) return;

    const sid = activeSessionId;
    const timeoutMs = (sessionKind === "live" ? FIRST_FRAME_TIMEOUT_LIVE_MS : FIRST_FRAME_TIMEOUT_VOD_MS) + 1800;
    const t = setTimeout(() => {
      if (
        !sessionGateRef.current.isActive(sid) ||
        activeProfileKeyRef.current !== v2ProfileKey ||
        v2Profile.engine !== "mpv" || mpvVideoReady
      ) return;
      if (transitioningSessionRef.current === sid) return;
      transitioningSessionRef.current = sid;

      if (!mpvForceSoftware) {
        recordEngineFailure(
          String(channel.id), v2Profile, "decoder",
          "MPV hardware decode profili doğrulanmış first-frame üretmedi; temiz software instance deneniyor",
        ).catch(() => {});
        try { void mpvRef.current?.stop?.(); } catch {}
        setRecoveryMessage("MPV donanım decode görüntü üretmedi; temiz FFmpeg yazılım decoder deneniyor…");
        setTechnicalError("MPV HW first-frame timeout → fresh software instance");
        setMpvForceSoftware(true);
        setMpvVideoMetaReady(false);
        setMpvVideoReady(false);
        setV2Phase("preparing");
        setIsBuffering(true);
        setMpvRecoveryGeneration(g => g + 1);
        setTimeout(() => { if (sessionGateRef.current.isActive(sid)) transitioningSessionRef.current = null; }, 100);
        return;
      }

      recordEngineFailure(
        String(channel.id), v2Profile, "decoder",
        "MPV software decode profili de doğrulanmış first-frame üretmedi",
      ).catch(() => {});
      try { void mpvRef.current?.stop?.(); } catch {}

      if (engine === "auto" && VLC_AVAILABLE && Platform.OS !== "web") {
        setRecoveryMessage("MPV donanım ve yazılım görüntü üretmedi; VLC motoru deneniyor…");
        setTechnicalError("MPV HW+SW first-frame timeout");
        setV2Phase("switch_engine");
        setV2Profile({ engine: "vlc", decoder: "hw" });
        setUseVLC(true);
        setVlcAutoSoftware(false);
        setVlcVideoMetaReady(false);
        setVlcVideoReady(false);
        setVlcRecoveryGeneration(g => g + 1);
        setIsBuffering(true);
      } else {
        setRecoveryMessage(null);
        setTechnicalError("MPV HW ve software decoder first-frame üretmedi.");
        setError("MPV görüntü oluşturamadı.");
        setV2Phase("final_error");
        setIsBuffering(false);
      }
      setTimeout(() => { if (sessionGateRef.current.isActive(sid)) transitioningSessionRef.current = null; }, 100);
    }, timeoutMs);

    return () => clearTimeout(t);
  }, [
    visible, channel?.id, activeSessionId, sessionKind, playbackRequest?.expectsVideo,
    v2Profile, v2ProfileKey, useMPV, mpvVideoReady, mpvForceSoftware, v2Phase, engine,
  ]);

  /**
   * v15.2.23-RC2 — VLC VIDEO OUTPUT WATCHDOG
   * Media3 fatal codec fallback'inden sonra libVLC yalnız ses üretebilir. Eski
   * davranışta gerçek native error gelmezse spinner sonsuza kadar kalabiliyordu.
   * Video beklenen oturumda VLC Playing/Buffering sinyali olsa bile doğrulanmış
   * video-output (track/meta + ilerleyen clock) gelmezse HW -> SW bir kez denenir;
   * SW de video üretmezse terminal hata verilir. Böylece ses var/siyah ekran
   * durumunda sonsuz recovery döngüsü oluşmaz.
   */
  const v2ProfileReady = activeSessionId > 0 && profileReadySessionId === activeSessionId;
  useEffect(() => {
    if (!visible || !channel || !v2ProfileReady || !playbackRequest?.expectsVideo) return;
    if (v2Profile.engine !== "vlc" || !useVLC || vlcVideoReady) return;
    const sid = activeSessionId;
    const profileKey = v2ProfileKey;
    const timeoutMs = sessionKind === "live" ? FIRST_FRAME_TIMEOUT_LIVE_MS + 3500 : FIRST_FRAME_TIMEOUT_VOD_MS + 4500;
    const timer = setTimeout(() => {
      if (!sessionGateRef.current.isActive(sid) || activeProfileKeyRef.current !== profileKey) return;
      if (v2Profile.engine !== "vlc" || vlcVideoReady) return;
      const clock = vlcClockRef.current;
      void recordDiagnostic("player", "VLC_VIDEO_OUTPUT_TIMEOUT", {
        decoder: v2Profile.decoder,
        playing: vlcPlayingRef.current,
        buffering: isBufferingRef.current,
        videoMetaReady: vlcVideoMetaReady,
        lastClockEventAgeMs: Math.max(0, Date.now() - clock.lastEventAt),
        lastClockAdvanceAgeMs: Math.max(0, Date.now() - clock.lastAdvanceAt),
        timeoutMs,
      }, { sessionId: playerDiagnosticSessionRef.current });
      try { void vlcRef.current?.stop?.(); } catch {}
      if (v2Profile.decoder === "hw") {
        setRecoveryMessage("VLC görüntü üretmedi; yazılım decoder deneniyor…");
        setError(null);
        setTechnicalError("VLC HW video-output timeout");
        setV2Phase("switch_engine");
        setV2Profile({ engine: "vlc", decoder: "sw" });
        setVlcAutoSoftware(true);
        setVlcVideoMetaReady(false);
        setVlcVideoReady(false);
        setVlcRecoveryGeneration(g => g + 1);
        setIsBuffering(true);
      } else {
        setV2Phase("final_error");
        setRecoveryMessage(null);
        setTechnicalError("VLC HW+SW video-output timeout");
        setError("Yayın sesi alınsa da video görüntüsü oluşturulamadı.");
        setIsBuffering(false);
      }
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [visible, channel?.id, v2ProfileReady, playbackRequest?.expectsVideo, v2Profile, v2ProfileKey, useVLC, vlcVideoReady, vlcVideoMetaReady, activeSessionId, sessionKind]);

  /**
   * GPT ELITE v15.0.0 — RUNTIME STALL MONITOR
   *
   * Donma = playback başarıyla başlamış, uygulama foreground'da, kullanıcı pause
   * etmemiş, buffering yok ve playback clock ilerlemiyor. Clock stall tek başına
   * motor/decoder değiştirmez. Önce soft resync, sonra AYNI profil temiz restart.
   */
  useEffect(() => {
    if (!visible || !channel || !v2ProfileReady) return;

    const sid = activeSessionId;
    const profileKey = v2ProfileKey;

    const interval = setInterval(() => {
      if (!sessionGateRef.current.isActive(sid) || activeProfileKeyRef.current !== profileKey) return;

      let rec = stallRecoveryRef.current;
      if (rec.sid !== sid || rec.profileKey !== profileKey) {
        rec = { sid, profileKey, softDone: false, hardDone: false };
        stallRecoveryRef.current = rec;
      }

      const softRecoveryInFlight = rec.softDone && !rec.hardDone;
      if (appStateRef.current !== "active" || isBufferingRef.current) return;
      if (!isPlayingRef.current && !softRecoveryInFlight) return;
      if (successfulSessionRef.current !== sid || error || v2Phase !== "playing") return;
      if (transitioningSessionRef.current === sid) return;

      const clock =
        v2Profile.engine === "vlc" ? vlcClockRef.current
          : v2Profile.engine === "mpv" ? mpvClockRef.current
          : media3ClockRef.current;
      const now = Date.now();
      if (now < userSeekGraceUntilRef.current) return;
      // v15.2.8: canlı VLC'de media-time her streamde düzenli ilerlemez.
      // Native time eventleri gelmeye devam ediyorsa yayın sağlığı var kabul edilir;
      // yalnız playback position'a bakmak false-stall üretip sağlıklı yayını
      // pause/play ile bizzat bozuyordu. VOD ve diğer motorlarda advance esas kalır.
      const healthAt = sessionKind === "live" && v2Profile.engine === "vlc"
        ? Math.max(clock.lastAdvanceAt, clock.lastEventAt)
        : clock.lastAdvanceAt;
      const stalledFor = now - healthAt;
      const softMs = sessionKind === "live" ? LIVE_SOFT_STALL_MS : VOD_SOFT_STALL_MS;
      const hardMs = sessionKind === "live" ? LIVE_HARD_STALL_MS : VOD_HARD_STALL_MS;

      if (!rec.softDone && stalledFor >= softMs) {
        rec.softDone = true;
        rec.softAt = now;
        stallRecoveryRef.current = rec;
        // Soft eşik artık gözlem-only. Decoder'a pause/play enjekte edilmez.
        // Kullanıcıya da false-positive recovery mesajı gösterilmez.
        return;
      }

      const hardAfterSoftMs = Math.max(STALL_CHECK_INTERVAL_MS, hardMs - softMs);
      const hardDue = rec.softDone && !!rec.softAt && now - rec.softAt >= hardAfterSoftMs;

      if (rec.softDone && !rec.hardDone && hardDue) {
        rec.hardDone = true;
        stallRecoveryRef.current = rec;
        transitioningSessionRef.current = sid;

        recordEngineFailure(
          String(channel.id),
          v2Profile,
          "timeout",
          `Runtime stall: ${profileKey} playback clock ilerlemedi; aynı profil restart`,
        ).catch(() => {});

        setRecoveryMessage("Yayın akışı kilitlendi; aynı oynatma motoru temiz oturumla yeniden başlatılıyor…");
        try {
          if (v2Profile.engine === "vlc") {
            void vlcRef.current?.stop?.();
          } else if (v2Profile.engine === "mpv") {
            void mpvRef.current?.stop?.();
          } else {
            player?.pause?.();
            try { (player as any)?.replace?.(null); } catch {}
            lastExoUrlRef.current = null;
          }
        } catch {}

        sessionGateRef.current.invalidate(sid);
        setError(null);
        setTechnicalError(null);
        setIsBuffering(true);
        setPlaybackRetryNonce(n => n + 1);

        setTimeout(() => {
          if (transitioningSessionRef.current === sid) transitioningSessionRef.current = null;
        }, 180);
      }
    }, STALL_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [
    visible, channel?.id, activeSessionId, v2ProfileReady, v2Profile, v2ProfileKey,
    v2Phase, sessionKind, error, player,
  ]);


  return (
    <View style={[styles.playerRoot, !visible && styles.playerHidden]} pointerEvents={visible ? "auto" : "none"} collapsable={false} testID="player-screen">
      {/**
        * TEMİZ OPAK SİYAH KÖK (v15.0.0 — TV Surface kompozisyon sertleştirmesi)
        * Kök artık düz opak siyah (flex:1, MERKEZLEME YOK). Tek siyah taban
        * katmanı + video onun üstünde. Fazla/çakışan katman yok. Stack geçiş
        * animasyonu da "none" (bkz. _layout) → altındaki temalı ekran sızamaz.
        */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none" />
      <StatusBar hidden />

      {/* TV KUMANDA (v5.2.0): video alanı odaklanabilir. Kumandada OK'a basınca
          kontroller açılır; D-pad ile alttaki transport düğmeleri gezilir.
          Bu, react-native-tvos fork'una gerek kalmadan çalışan standart yoldur. */}
      {/**
        * v8.9.0 REGRESYON GERİ ALMA — KRİTİK
        * v8.8.0'da bu katmanı "her zaman render" yaptım. Katman tüm ekranı
        * kaplıyor ve hasTVPreferredFocus taşıyor; kontroller AÇIKKEN de var
        * olunca ODAĞI SÜREKLİ KENDİNE ÇEKİYORDU. Kullanıcı D-pad ile
        * düğmelere gidemiyor, tuşlar "çok geç tepki veriyor" gibi
        * hissettiriyordu.
        * GERİ ALINDI: yalnızca kontroller kapalıyken var.
        * Panelin OK ile kapanması, panelin KENDİ üzerindeki kapatma
        * davranışıyla sağlanıyor (aşağıda).
        */}
      {/**
        * GPT v10.2.0:
        * v9.19'da fullscreen catcher zorunlu preferred-focus davranışında
        * değildi. v10.1'de FocusButton düzeltmesi bu zorlamayı gerçekten aktif
        * hale getirince aynı Homatics cihazında şerit/tint ve gecikmeli focus
        * regresyonu görüldü. Genel FocusButton düzeltmesi korunuyor; yalnız bu
        * fullscreen catcher artık preferred-focus zorlamıyor.
        */}
      {visible && channel && isTv && !showControls && sheet === null && (
        <FocusButton
          testID="tv-focus-catcher"
          focusable
          activeOpacity={1}
          onPress={revealControls}
          style={StyleSheet.absoluteFill}
        />
      )}
      {emergencyTouchActive && (
        <Pressable
          testID="player-emergency-touch-catcher"
          style={[StyleSheet.absoluteFill, { zIndex: 6 }]}
          onPress={() => {
            void recordDiagnostic("player", "PLAYER_EMERGENCY_CONTROLS_OPEN", { phase: v2Phase, engine: v2Profile.engine, buffering: isBuffering, resolving });
            revealControls();
          }}
          accessibilityRole="button"
          accessibilityLabel="Oynatma kontrollerini aç"
        />
      )}
      <GestureDetector gesture={Gesture.Exclusive(doubleTapGesture, longPressGesture, volumeGesture, tapGesture)}>
        <Animated.View style={StyleSheet.absoluteFill}>
          {v2ProfileReady && resolvedMediaReadyForCurrentChannel && !!playbackRequest?.url && v2Profile.engine === "media3" && (
            <VideoView
              /**
               * v16.9.0 — ESKİ YAYININ SON KARESİ EKRANDA KALIYORDU.
               * KULLANICI: "kanaldan çıkıp başka içerik açınca son izlediğim
               * içeriğin son ekranı fotoğraf gibi duruyor."
               * SEBEP: VLC ve MPV bileşenlerinin key'inde kanal/oturum kimliği
               * varken (remount olup yüzeyi temizliyorlar), Media3 VideoView'ın
               * key'i yalnız yüzey türüne bağlıydı; kanal değişse de aynı view
               * kalıyor ve SurfaceView son kareyi tutuyordu.
               * Artık oturum kimliği key'e dahil: her yeni oynatmada yüzey
               * sıfırdan oluşturulur, önceki kare taşınmaz.
               */
              key={`vv-${effectiveSurface}-${activeSessionId}`}
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit={fit}
              nativeControls={false}
              allowsFullscreen={false}
              allowsPictureInPicture={Platform.OS === "ios"}
              /**
               * YÜZEY TİPİ (v9.5.0 → v9.9.0)
               * ---------------------------------------------------------------------
               * SurfaceView videoyu pencere ARKASINDA ayrı katmana ("delik-delme")
               * çizer → bazı TV kutularında "ses var/görüntü yok". TextureView ise
               * normal hiyerarşide çizer (kompozisyon sorunsuz) AMA bazı donanım
               * çözücülerini devre dışı bırakıp ağır formatlarda (4K 10-bit HEVC)
               * yazılım çözücüye düşürüp patlatabiliyor.
               *
               * Bu yüzden yüzey tipi artık AYARLANABİLİR (surfaceMode) ve "auto"da
               * decoder hatası olunca otomatik SurfaceView'a geçer (effectiveSurface).
               * `key` yüzey değişince VideoView'ı yeniden kurar (prop çalışma anında
               * değişemediği için). Telefonda daima SurfaceView (davranış değişmez).
               */
              surfaceType={effectiveSurface}
              onFirstFrameRender={() => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "media3" ||
                  useVLC
                ) return;
                const firstFrameMs = Math.max(0, Date.now() - sessionStartedAtRef.current);
                transitioningSessionRef.current = null;
                setExoFirstFrame(true);
                setV2Phase("playing");
                setRecoveryMessage(null);
                setError(null);
                setTechnicalError(null);
                setIsBuffering(false);
                if (successfulSessionRef.current !== activeSessionId) {
                  successfulSessionRef.current = activeSessionId;
                  successfulSessionAtRef.current = Date.now();
                  recordEngineSuccess(String(channel?.id || ""), v2Profile, firstFrameMs).catch(() => {});
                  recordFirstFrameDiagnostic(v2Profile, firstFrameMs);
                }
              }}
            />
          )}
          {v2ProfileReady && resolvedMediaReadyForCurrentChannel && !!playbackRequest?.url && useVLC && VLC_AVAILABLE && channel && (
            <VLCPlayerLib
              key={`vlc-${channel.id}-${effectiveVlcHwAccel ? "hw" : "sw"}-${vlcRecoveryGeneration}`}
              ref={vlcRef}
              uri={playbackRequest?.url || playUrl || ""}
              bufferMs={bufferMs}
              volume={volume}
              /**
               * GERÇEK KAYIT YOLU (v7.8.0)
               * Paket kaydın gerçek dosya yolunu bu olayla bildiriyor
               * ({ path, isRecording }). Böylece kullanıcıya tam yeri
               * söyleyebiliyoruz — "bir yere kaydedildi" demek yerine.
               */
              onRecordChanged={(e: any) => {
                if (e?.path) setRecordPath(String(e.path));
                if (typeof e?.isRecording === "boolean") setIsRecording(e.isRecording);
              }}
              hardwareAccel={effectiveVlcHwAccel}
              audioDelayMs={audioDelay}
              /* KANAL BAŞINA UA (v7.3.0): kullanıcı bu kanal için özel bir
                 User-Agent tanımladıysa onu kullan, yoksa varsayılan. */
              userAgent={playbackRequest?.headers?.["User-Agent"] || DEFAULT_USER_AGENT}
              extraOptions={vlcExtraOptions}
              tracks={vlcSelectedTracks}
              contentFit={fit}
              rate={speed}
              onPlaying={() => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "vlc" ||
                  !useVLC
                ) return;
                vlcPlayingRef.current = true;
                isPlayingRef.current = true;
                setIsPlaying(prev => prev ? prev : true);
                if (playbackRequest && !playbackRequest.expectsVideo) {
                  const firstFrameMs = Math.max(0, Date.now() - sessionStartedAtRef.current);
                  setV2Phase("playing");
                  setRecoveryMessage(null);
                  setIsBuffering(false);
                  if (successfulSessionRef.current !== activeSessionId) {
                    successfulSessionRef.current = activeSessionId;
                  successfulSessionAtRef.current = Date.now();
                    recordEngineSuccess(String(channel?.id || ""), v2Profile, firstFrameMs).catch(() => {});
                    recordFirstFrameDiagnostic(v2Profile, firstFrameMs);
                  }
                }
              }}
              onPaused={() => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "vlc" ||
                  !useVLC
                ) return;
                vlcPlayingRef.current = false;
                isPlayingRef.current = false;
                setIsPlaying(prev => prev ? false : prev);
              }}
              onBuffering={(progress: number) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "vlc" ||
                  !useVLC
                ) return;
                const buffering = progress < 100;
                const wasBuffering = isBufferingRef.current;
                isBufferingRef.current = buffering;
                if (wasBuffering !== buffering) void recordDiagnostic("player", buffering ? "VLC_BUFFERING_START" : "VLC_BUFFERING_END", { progress, afterFirstFrame: successfulSessionRef.current === activeSessionId }, { sessionId: playerDiagnosticSessionRef.current });
                setIsBuffering(prev => prev === buffering ? prev : buffering);
                if (buffering && v2Phase !== "preparing") setV2Phase("preparing");
                else if (!buffering && !vlcVideoReady && v2Phase !== "waiting_first_frame") setV2Phase("waiting_first_frame");
              }}
              onError={(message: string) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "vlc" ||
                  !useVLC
                ) return;

                const sid = activeSessionId;
                const profile = v2Profile;
                const profileKey = v2ProfileKey;
                void recordDiagnostic("player", "VLC_ERROR_SIGNAL", {
                  message: String(message || "VLC error"),
                  phase: v2Phase,
                  hardwareAccel: effectiveVlcHwAccel,
                  videoReady: vlcVideoReady,
                  videoMetaReady: vlcVideoMetaReady,
                  playing: vlcPlayingRef.current,
                  fromSessionMs: Math.max(0, Date.now() - sessionStartedAtRef.current),
                }, { sessionId: playerDiagnosticSessionRef.current });

                void (async () => {
                  if (successfulSessionRef.current === sid && Date.now() - successfulSessionAtRef.current < 1800) {
                    setRecoveryMessage(null);
                    return;
                  }
                  // Playing geldiği halde Vout/track/time eventleri birkaç yüz ms sonra
                  // gelebilir. Bu kısa pencere spurious EncounteredError olayının çalışan
                  // görüntüyü kapatmasını engeller; snapshot/probe kullanılmaz.
                  if (vlcPlayingRef.current && playbackRequest?.expectsVideo && !vlcPlaybackIsAlive(sid, profileKey)) {
                    await new Promise(resolve => setTimeout(resolve, 650));
                  }

                  if (!sessionGateRef.current.isActive(sid) || activeProfileKeyRef.current !== profileKey) return;

                  if (
                    vlcPlayingRef.current &&
                    (vlcVideoReady || vlcVideoMetaReady || vlcPlaybackIsAlive(sid, profileKey))
                  ) {
                    // Çalışan/metadata üretmiş bir VLC oturumunu EncounteredError
                    // yüzünden DESTRUCTIVE fallback ile kesme. Gerçek kilitlenme
                    // olursa v15 stall monitor aynı profili temiz restart eder.
                    if (vlcVideoReady || (vlcVideoMetaReady && vlcPlaybackIsAlive(sid, profileKey))) {
                      markVlcHealthy(sid, profile, profileKey);
                    }
                    return;
                  }

                  vlcPlayingRef.current = false;
                  if (requestStalkerSourceRenewal(String(message || ''), 'vlc')) { try { void vlcRef.current?.stop?.(); } catch {} return; }
                  const classified = classifyPlaybackError(message);
                  recordEngineFailure(String(channel?.id || ""), profile, classified.kind, classified.technical).catch(() => {});

                  const canTryNextUrl = playbackUrlIndex + 1 < playbackCandidates.length;
                  if (canTryNextUrl && ["source", "network", "http_not_found"].includes(classified.kind)) {
                    try { void vlcRef.current?.stop?.(); } catch {}
                    setRecoveryMessage(`Alternatif yayın yolu deneniyor (${playbackUrlIndex + 2}/${playbackCandidates.length})…`);
                    setError(null);
                    setTechnicalError(classified.technical);
                    nextSessionProfileRef.current = profile;
                    setPlaybackUrlIndex(i => Math.min(i + 1, playbackCandidates.length - 1));
                    return;
                  }

                  if (classified.retryNetwork) {
                    try { void vlcRef.current?.stop?.(); } catch {}
                    setV2Phase("final_error");
                    setRecoveryMessage(null);
                    setTechnicalError(classified.technical);
                    setError(classified.userMessage);
                    setIsBuffering(false);
                    return;
                  }

                  // HW -> SW yalnız gerçek native error geldiğinde.
                  if (profile.decoder === "hw") {
                    try { void vlcRef.current?.stop?.(); } catch {}
                    setRecoveryMessage("VLC donanım decoder hata verdi; yazılım decoder deneniyor…");
                    setError(null);
                    setTechnicalError(classified.technical);
                    setV2Phase("switch_engine");
                    setV2Profile({ engine: "vlc", decoder: "sw" });
                    setVlcAutoSoftware(true);
                    setVlcVideoMetaReady(false);
                    setVlcVideoReady(false);
                    setVlcRecoveryGeneration(g => g + 1);
                    setIsBuffering(true);
                    return;
                  }

                  try { void vlcRef.current?.stop?.(); } catch {}
                  setV2Phase("final_error");
                  setRecoveryMessage(null);
                  setTechnicalError(classified.technical);
                  setError(classified.userMessage === "Yayın açılamadı."
                    ? "Yayın mevcut oynatma motorlarıyla açılamadı."
                    : classified.userMessage);
                  setIsBuffering(false);
                })();
              }}
              onTimeChanged={(ms: number) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "vlc" ||
                  !useVLC
                ) return;
                const now = Date.now();
                const seconds = Math.max(0, Number(ms) / 1000);
                const before = vlcClockRef.current;
                const next = notePlaybackPosition(before, seconds, now);
                vlcClockRef.current = next;
                if (next.lastAdvanceAt !== before.lastAdvanceAt) {
                  const rec = stallRecoveryRef.current;
                  if (rec.sid === activeSessionId && rec.profileKey === v2ProfileKey && (rec.softDone || rec.hardDone)) {
                    stallRecoveryRef.current = { sid: activeSessionId, profileKey: v2ProfileKey, softDone: false, hardDone: false };
                    if (v2Phase === "playing") setRecoveryMessage(null);
                  }
                }
                // UI yalnız görünür kontrol/stat ekranında ve en fazla saniyede bir güncellenir.
                if ((showControlsRef.current || sheetRef.current === "stats") && now - lastVlcUiUpdateRef.current >= PLAYER_UI_TIME_UPDATE_MS) {
                  lastVlcUiUpdateRef.current = now;
                  setVideoStats(prev => ({ ...prev, position: Math.floor(seconds) }));
                }
                if (vlcVideoMetaReady && Number(ms) > 0 && !vlcVideoReady && vlcPlayingRef.current) {
                  markVlcHealthy(activeSessionId, v2Profile, v2ProfileKey);
                }
              }}
              onTracks={(t: any) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "vlc" ||
                  !useVLC
                ) return;
                if (Array.isArray(t.audio)) setAudioTracks(t.audio);
                if (Array.isArray(t.subtitle)) setSubtitleTracks(t.subtitle);
                // Video parçası id'si: seçim yaparken bunu da göndermek ZORUNLU.
                if (Array.isArray(t.video) && t.video.length > 0) {
                  setVlcVideoTrackId(t.video[0]?.id);
                  setVlcVideoMetaReady(true);
                }
              }}
              onSnapshotTaken={(e: any) => {
                // v15: snapshot only user/manual diagnostic; never AUTO health.
                const path = String(e?.path || "");
                if (path && sheetRef.current !== "stats") flashMessage("Görüntü alındı");
              }}
              onFirstPlay={(info: any) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "vlc" ||
                  !useVLC
                ) return;
                setIsSeekable(!!info.seekable);
                // expo-libvlc-player gerçek rendered-frame olayı sunmuyor; width/height
                // video-output hazır olduğuna dair en güçlü native sinyalimizdir.
                if (Number(info?.width) > 0 && Number(info?.height) > 0) {
                  setVlcVideoMetaReady(true);
                }
                const duration = Math.floor((info.length || 0) / 1000);
                if (duration > 0) playbackDurationRef.current = duration;
                setVideoStats(prev => ({
                  ...prev, width: info.width, height: info.height, duration,
                }));
              }}
            />
          )}

          {v2ProfileReady && resolvedMediaReadyForCurrentChannel && !!playbackRequest?.url && useMPV && KIZILKAN_MPV_AVAILABLE && channel && mpvSource && (
            <KizilkanMpvView
              key={`kizilkan-mpv-core-${activeSessionId}-${mpvRecoveryGeneration}`}
              ref={mpvRef}
              style={StyleSheet.absoluteFill}
              source={mpvSource}
              volume={volume}
              rate={speed}
              fit={fit}
              audioDelayMs={audioDelay}
              onLoad={() => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "mpv"
                ) return;
                setV2Phase("preparing");
                setIsBuffering(true);
              }}
              onPlayingChange={(e: any) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "mpv"
                ) return;
                const playing = !!e?.nativeEvent?.isPlaying || !!e?.isPlaying;
                mpvPlayingRef.current = playing;
                isPlayingRef.current = playing;
                setIsPlaying(prev => prev === playing ? prev : playing);

                if (playing && playbackRequest?.expectsVideo !== false && !mpvVideoReady) {
                  setV2Phase("waiting_first_frame");
                }

                if (playing && playbackRequest && !playbackRequest.expectsVideo) {
                  const firstFrameMs = Math.max(0, Date.now() - sessionStartedAtRef.current);
                  setV2Phase("playing");
                  setRecoveryMessage(null);
                  setError(null);
                  setTechnicalError(null);
                  setIsBuffering(false);
                  if (successfulSessionRef.current !== activeSessionId) {
                    successfulSessionRef.current = activeSessionId;
                  successfulSessionAtRef.current = Date.now();
                    recordEngineSuccess(String(channel?.id || ""), v2Profile, firstFrameMs).catch(() => {});
                    recordFirstFrameDiagnostic(v2Profile, firstFrameMs);
                  }
                }
              }}
              onBufferingChange={(e: any) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "mpv"
                ) return;
                const buffering = !!e?.nativeEvent?.isBuffering || !!e?.isBuffering;
                const wasBuffering = isBufferingRef.current;
                isBufferingRef.current = buffering;
                if (wasBuffering !== buffering) void recordDiagnostic("player", buffering ? "MPV_BUFFERING_START" : "MPV_BUFFERING_END", { afterFirstFrame: successfulSessionRef.current === activeSessionId }, { sessionId: playerDiagnosticSessionRef.current });
                setIsBuffering(prev => prev === buffering ? prev : buffering);
                if (buffering) setV2Phase("preparing");
                else if (!mpvVideoReady) setV2Phase("waiting_first_frame");
              }}
              onProgress={(e: any) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "mpv"
                ) return;
                const ev = e?.nativeEvent || e || {};
                const position = Math.max(0, Number(ev.position || 0));
                const duration = Math.max(0, Number(ev.duration || 0));
                if (duration > 0) playbackDurationRef.current = duration;
                const now = Date.now();
                const before = mpvClockRef.current;
                const next = notePlaybackPosition(before, position, now);
                mpvClockRef.current = next;

                if (next.lastAdvanceAt !== before.lastAdvanceAt) {
                  const rec = stallRecoveryRef.current;
                  if (rec.sid === activeSessionId && rec.profileKey === v2ProfileKey && (rec.softDone || rec.hardDone)) {
                    stallRecoveryRef.current = { sid: activeSessionId, profileKey: v2ProfileKey, softDone: false, hardDone: false };
                    if (v2Phase === "playing") setRecoveryMessage(null);
                  }
                }

                if (showControlsRef.current || sheetRef.current === "stats") {
                  setVideoStats(prev => ({
                    ...prev,
                    position: Math.floor(position),
                    currentTime: position,
                    duration: duration > 0 ? duration : prev.duration,
                  }));
                }

                if (position > 0 && mpvPlayingRef.current && (mpvVideoMetaReady || playbackRequest?.expectsVideo === false) && !mpvVideoReady) {
                  const firstFrameMs = Math.max(0, Date.now() - sessionStartedAtRef.current);
                  setMpvVideoReady(true);
                  setV2Phase("playing");
                  setRecoveryMessage(null);
                  setError(null);
                  setTechnicalError(null);
                  setIsBuffering(false);
                  if (successfulSessionRef.current !== activeSessionId) {
                    successfulSessionRef.current = activeSessionId;
                  successfulSessionAtRef.current = Date.now();
                    recordEngineSuccess(String(channel?.id || ""), v2Profile, firstFrameMs).catch(() => {});
                    recordFirstFrameDiagnostic(v2Profile, firstFrameMs);
                  }
                }
              }}
              onVideoReady={(e: any) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "mpv"
                ) return;
                const ev = e?.nativeEvent || e || {};
                const width = Number(ev.width || 0);
                const height = Number(ev.height || 0);
                setMpvVideoMetaReady(width > 0 && height > 0);
                setVideoStats(prev => ({ ...prev, width: width || prev.width, height: height || prev.height }));
              }}
              onTracks={(e: any) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "mpv"
                ) return;
                const ev = e?.nativeEvent || e || {};
                if (Array.isArray(ev.audio)) setAudioTracks(ev.audio);
                if (Array.isArray(ev.subtitle)) setSubtitleTracks(ev.subtitle);
                const selectedA = Array.isArray(ev.audio) ? ev.audio.find((x: any) => x?.selected) : null;
                const selectedS = Array.isArray(ev.subtitle) ? ev.subtitle.find((x: any) => x?.selected) : null;
                if (selectedA) {
                  setSelectedAudio(selectedA);
                  setSelectedAudioTrack(selectedA.id);
                }
                if (selectedS) {
                  setSelectedSubtitle(selectedS);
                  setSelectedSubtitleTrack(selectedS.id);
                }
              }}
              onDiagnostic={(e: any) => {
                if (!ownsCurrentRender() || !sessionGateRef.current.isActive(activeSessionId) || v2Profile.engine !== "mpv") return;
                const ev = e?.nativeEvent || e || {};
                if (ev?.event) {
                  void recordDiagnostic("player", "MPV_NATIVE_DIAGNOSTIC", {
                    nativeEvent: String(ev.event),
                    width: Number(ev.width || 0),
                    height: Number(ev.height || 0),
                    codec: ev.codec || "",
                    format: ev.format || "",
                    hwdec: ev.hwdec || "",
                    phase: v2Phase,
                    fromSessionMs: Math.max(0, Date.now() - sessionStartedAtRef.current),
                  }, { sessionId: playerDiagnosticSessionRef.current });
                }
                if (sheetRef.current === "stats" && ev?.event) {
                  setVideoStats(prev => ({
                    ...prev,
                    width: Number(ev.width || 0) || prev.width,
                    height: Number(ev.height || 0) || prev.height,
                    mpvCodec: ev.codec || (prev as any).mpvCodec,
                    mpvFormat: ev.format || (prev as any).mpvFormat,
                    mpvHwdec: ev.hwdec || (prev as any).mpvHwdec,
                    mpvEvent: ev.event,
                  }));
                }
              }}
              onError={(e: any) => {
                if (
                  !ownsCurrentRender() ||
                  !sessionGateRef.current.isActive(activeSessionId) ||
                  activeProfileKeyRef.current !== v2ProfileKey ||
                  v2Profile.engine !== "mpv"
                ) return;

                const raw = String(e?.nativeEvent?.message || e?.message || e || "MPV oynatma hatası");
                if (requestStalkerSourceRenewal(raw, 'mpv')) { try { void mpvRef.current?.stop?.(); } catch {} return; }
                /**
                 * v16.2.0 — MPV KÜTÜPHANESİ YOKSA MOTORU KALICI DEVRE DIŞI BIRAK.
                 * Cihaz kaydında 20 kez "MPV başlatılamadı: dev.jdtech.mpv.MPVLib"
                 * görüldü: native sınıf yüklenemiyor, yani motor hiç çalışmıyor.
                 * Buna rağmen her kanalda geri düşme zincirinde deneniyor ve
                 * saniyeler kaybediliyordu. İlk bu hatada bayrağı kapatıyoruz;
                 * zincir bundan sonra doğrudan VLC'ye gider.
                 */
                if (/MPVLib|başlatılamadı|ClassNotFound|UnsatisfiedLink|NoClassDefFound/i.test(raw)) {
                  setMpvAvailable(false);
                  void recordDiagnostic("player", "MPV_ENGINE_DISABLED", { reason: raw.slice(0, 160) });
                }
                const classified = classifyPlaybackError(raw);
                recordEngineFailure(String(channel?.id || ""), v2Profile, classified.kind, classified.technical).catch(() => {});

                const canTryNextUrl = playbackUrlIndex + 1 < playbackCandidates.length;
                if (canTryNextUrl && ["extractor", "source", "network", "http_not_found"].includes(classified.kind)) {
                  setRecoveryMessage(`MPV alternatif yayın yolunu deniyor (${playbackUrlIndex + 2}/${playbackCandidates.length})…`);
                  setError(null);
                  setTechnicalError(classified.technical);
                  nextSessionProfileRef.current = v2Profile;
                  setPlaybackUrlIndex(i => Math.min(i + 1, playbackCandidates.length - 1));
                  return;
                }

                try { void mpvRef.current?.stop?.(); } catch {}
                mpvPlayingRef.current = false;

                // AUTO modunda MPV gerçekten fatal hata verdiyse VLC hâlâ
                // farklı HTTP/surface/decoder stack'i olarak denenir.
                if (engine === "auto" && VLC_AVAILABLE && Platform.OS !== "web") {
                  setRecoveryMessage("MPV/FFmpeg yayını açamadı; VLC donanım motoru deneniyor…");
                  setError(null);
                  setTechnicalError(classified.technical);
                  setV2Phase("switch_engine");
                  setV2Profile({ engine: "vlc", decoder: "hw" });
                  setUseVLC(true);
                  setVlcAutoSoftware(false);
                  setVlcVideoMetaReady(false);
                  setVlcVideoReady(false);
                  setVlcRecoveryGeneration(g => g + 1);
                  setIsBuffering(true);
                  return;
                }

                setV2Phase("final_error");
                setRecoveryMessage(null);
                setTechnicalError(classified.technical);
                setError(classified.userMessage === "Yayın açılamadı."
                  ? "Yayın MPV/FFmpeg motoruyla açılamadı."
                  : classified.userMessage);
                setIsBuffering(false);
              }}
            />
          )}
        </Animated.View>
      </GestureDetector>

      {channel && gestureFlash && (
        <View style={styles.gestureFlash} pointerEvents="none">
          <Text style={styles.gestureFlashText}>{gestureFlash}</Text>
        </View>
      )}

      {channel && recordFlash && (
        <View style={styles.recordFlash} pointerEvents="none">
          <Ionicons name="recording" size={16} color="#fff" />
          <Text style={styles.recordFlashText}>{recordFlash}</Text>
        </View>
      )}

      {channel && recoveryMessage && !error && (
        <View style={styles.recoveryBanner} pointerEvents="none">
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.recoveryText}>{recoveryMessage}</Text>
        </View>
      )}

      {channel && error && (
        <View style={styles.overlayCenter} pointerEvents="box-none">
          <Ionicons name="warning" size={40} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          {technicalError && (
            <Text style={styles.technicalHint}>Teknik ayrıntı cihaz günlüğüne kaydedildi.</Text>
          )}
          <FocusButton
            testID="player-retry-btn"
            onPress={() => {
              try { vlcRef.current?.stop?.(); } catch {}
              try { void mpvRef.current?.stop?.(); } catch {}
              try { player?.pause?.(); } catch {}
              try { (player as any)?.replace?.(null); } catch {}
              lastExoUrlRef.current = null;
              sessionGateRef.current.invalidate(activeSessionId);
              setError(null);
              setTechnicalError(null);
              setRecoveryMessage(null);
              setIsBuffering(true);
              setPlaybackRetryNonce(n => n + 1);
            }}
            style={[styles.retryBtn, { backgroundColor: colors.brandPrimary }]}
          >
            <Text style={styles.retryText}>Tekrar Dene</Text>
          </FocusButton>

          {/**
            * GPT v10.2.0 — EXO SOURCE/EXTRACTOR YEDEĞİ
            * Bazı sağlayıcı yayınlarında Media3 "none of the available
            * extractors could read the stream" hatası verebiliyor; aynı URL
            * VLC'de çalışabiliyor. Normal statusChange yolu zaten otomatik VLC
            * fallback dener. Buna rağmen hata ekranına düşülmüşse kullanıcıya
            * aynı ekrandan gerçek ikinci motoru deneme olanağı ver.
            */}
          <FocusButton
            testID="player-select-engine-on-error-btn"
            focusable
            onPress={() => {
              setError(null);
              setTechnicalError(null);
              setRecoveryMessage("Manuel motor seçimi açıldı…");
              setShowControls(true);
              setSheet("engine");
            }}
            style={[styles.retryBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.brandPrimary }]}
          >
            <Text style={[styles.retryText, { color: colors.brandPrimary }]}>Oynatıcı Motorunu Seç</Text>
          </FocusButton>

          {v2Profile.engine !== "vlc" && VLC_AVAILABLE && Platform.OS !== "web" && (
            <FocusButton
              testID="player-try-vlc-btn"
              focusable
              onPress={() => {
                try { player?.pause?.(); } catch {}
                try { (player as any)?.replace?.(null); } catch {}
                lastExoUrlRef.current = null;
                transitioningSessionRef.current = null;
                setError(null);
                setTechnicalError(null);
                setRecoveryMessage("VLC donanım motoru deneniyor…");
                setV2Phase("switch_engine");
                setV2Profile({ engine: "vlc", decoder: "hw" });
                setUseVLC(true);
                setVlcAutoSoftware(false);
                setVlcVideoMetaReady(false);
                setVlcVideoReady(false);
                setVlcRecoveryGeneration(g => g + 1);
                setIsBuffering(true);
              }}
              style={[styles.retryBtn, {
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.brandPrimary,
                marginTop: SPACING.sm,
              }]}
            >
              <Text style={[styles.retryText, { color: colors.onSurface }]}>
                VLC ile Dene
              </Text>
            </FocusButton>
          )}

          {/* SORUN KİMDE? (v5.4.0)
              Kullanıcı "uygulama mı, sağlayıcı mı" diye tahmin etmek zorunda
              kalmasın: yayın adresine doğrudan istek atıp sunucunun ne dediğini
              raporluyoruz. */}
          <FocusButton
            testID="player-test-stream-btn"
            focusable
            disabled={testing}
            onPress={async () => {
              if (!channel?.url) return;
              setTesting(true);
              try {
                const primaryUrl = playbackRequest?.url || (activePlaylist?.source === "stalker" ? "" : channel.url);
                if (!primaryUrl) {
                  Alert.alert("MAG yayın adresi hazır değil", "Kanal testi ham Stalker komutunu oynatıcıya göndermez. create_link çözümünün tamamlanmasını bekleyip tekrar deneyin.");
                  return;
                }
                let r = await testStream(
                  primaryUrl,
                  playbackRequest?.headers?.["User-Agent"] || DEFAULT_USER_AGENT,
                  12000,
                  playbackRequest?.headers || {},
                );

                if (!r.ok && playbackRequest?.fallbackUrls?.length) {
                  for (const candidate of playbackRequest.fallbackUrls) {
                    const alt = await testStream(
                      candidate,
                      playbackRequest?.headers?.["User-Agent"] || DEFAULT_USER_AGENT,
                      8000,
                      playbackRequest?.headers || {},
                    );
                    if (alt.ok) {
                      const safeCandidate = candidate.replace(/\/live\/[^/]+\/[^/]+\//, "/live/***/***/");
                      r = {
                        ...alt,
                        title: "Alternatif Xtream yayın yolu çalışıyor",
                        detail:
                          `${alt.detail}\n\nAna URL medya olarak doğrulanamadı; alternatif yayın biçimi çalıştı:\n${safeCandidate}`,
                      };
                      break;
                    }
                  }
                }

                Alert.alert(
                  r.title,
                  r.detail +
                    `\n\nSorumlu taraf: ${
                      r.blame === "sunucu" ? "SAĞLAYICI (sunucu)"
                        : r.blame === "oynatici" ? "OYNATICI / CODEC / YÜZEY"
                        : r.blame === "ag" ? "AĞ / İNTERNET"
                        : "BELİRSİZ — daha fazla tanılama gerekli"
                    }`
                );
              } finally {
                setTesting(false);
              }
            }}
            style={[styles.retryBtn, {
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              marginTop: SPACING.sm,
              opacity: testing ? 0.5 : 1,
            }]}
          >
            <Text style={[styles.retryText, { color: colors.onSurface }]}>
              {testing ? "Test ediliyor..." : "Kanalı Test Et (sorun kimde?)"}
            </Text>
          </FocusButton>
        </View>
      )}

      {channel && showControls && (
        <>
          <View
            style={[
              styles.topBar,
              {
                // Çentik/durum çubuğu ile çakışmayı önle (yatay modda sol/sağ da).
                paddingTop: Math.max(insets.top, SPACING.md),
                paddingLeft: SPACING.lg + insets.left,
                paddingRight: SPACING.lg + insets.right,
              },
            ]}
            pointerEvents="box-none"
          >
            <FocusButton testID="player-back-btn" onPress={goBack} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </FocusButton>
            <View style={{ flex: 1 }}>
              <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
              <Text style={styles.channelMeta} numberOfLines={1}>
                {channel.group || "Live"} • {channel.container_ext?.toUpperCase() || "STREAM"}
                {` • ${activeEngineLabel}`}
                {sleepRemaining ? ` • 🌙 ${sleepRemaining}` : ""}
              </Text>
            </View>
            <View style={styles.iconBtn}>
              <CastButton
                testID="player-cast-btn"
                onConnectionChange={(conn, session) => {
                  /**
                   * YEREL OYNATICIYI DURDUR (v8.2.0) — KRİTİK
                   * SORUN: Yayın başlayınca telefondaki oynatıcı ÇALIŞMAYA DEVAM
                   * ediyordu. İki bağımsız oynatma birden sürüyor, hiçbir
                   * senkron olmuyordu ("TV kafasına göre gidiyor").
                   * ÇÖZÜM: Yayın açılınca yerel oynatma duraklatılır; yayın
                   * kapanınca kaldığı yerden devam eder.
                   */
                  setCastSession(conn ? session : null);
                  try {
                    if (conn) {
                      // REMOTE authority: local decoder yalnız duraklatılır; Cast
                      // receiver tek playback otoritesi olur.
                      if (v2Profile.engine === "mpv") void mpvRef.current?.pause();
                      else if (v2Profile.engine === "vlc") vlcRef.current?.pause();
                      else player?.pause();
                    } else {
                      // Player görünür değilse Cast session kapanışı local sesi
                      // gizlice yeniden başlatmamalı.
                      if (!visible) {
                        castLiveSeekableRangeRef.current = null;
                        return;
                      }
                      // REMOTE -> LOCAL handoff: film/dizide TV'nin son gerçek
                      // konumunu local player'a taşı, sonra oynat. Canlıda seek yok.
                      const remotePos = castRemotePositionRef.current;
                      if (isSynthetic && remotePos > 1) seekTo(remotePos);
                      setTimeout(() => {
                        try {
                          if (v2Profile.engine === "mpv") void mpvRef.current?.play();
                          else if (v2Profile.engine === "vlc") vlcRef.current?.play();
                          else player?.play();
                        } catch {}
                      }, isSynthetic && remotePos > 1 ? 160 : 0);
                      castLiveSeekableRangeRef.current = null;
                    }
                  } catch { /* oynatıcı hazır değilse sorun değil */ }
                }}
                source={{
                  // v16.12.0: Cast'e de raw Stalker komutu değil çözülmüş medya URL'si gider.
                  url: playbackRequest?.url || (activePlaylist?.source === "stalker" ? "" : channel.url),
                  name: channel.name,
                  poster: (channel as any).logo,
                  /**
                   * CANLI/KAYITLI AYRIMI (v8.1.0)
                   * isSynthetic = film/dizi (kayıtlı), değilse canlı yayın.
                   * Chromecast bu bilgi olmadan canlı akışı oynatamıyordu.
                   */
                  isLive: !isSynthetic,
                  // Film/dizide telefondaki konumdan devam (v8.2.0)
                  startTimeSec: isSynthetic ? (videoStats.currentTime || 0) : undefined,
                  /**
                   * CHROMECAST FORMAT DÜZELTMESİ (v7.4.0)
                   * ESKİ MANTIK TERSTİ: container_ext varsa (yani .ts canlı
                   * kanallar) contentType undefined gönderiliyordu; CastButton
                   * da adresi .m3u8'e çevirdikten sonra MIME'ı "video/mp4"
                   * tahmin ediyordu. Chromecast HLS akışını mp4 sanıp
                   * REDDEDİYORDU -> "Medya seçilmedi".
                   * ARTIK: contentType'ı hiç göndermiyoruz; CastButton
                   * ÇEVRİLMİŞ adrese göre doğru MIME'ı kendisi belirliyor
                   * (.m3u8 -> application/x-mpegURL).
                   */
                }}
                size={22}
                color="#fff"
              />
            </View>
            {/* Döndürme düğmesi yalnızca telefonda anlamlı. TV yatay kilitli
                olduğu (v9.5.0) için TV'de gizlenir — kullanıcı kumandayla
                yanlışlıkla portreye alıp görüntüyü bozmasın. */}
            {!isTv && (
              <FocusButton
                testID="player-rotate-btn"
                onPress={() => applyLock(locked === "landscape" ? "portrait" : locked === "portrait" ? "auto" : "landscape")}
                style={styles.iconBtn}
                hitSlop={8}
              >
                <Ionicons
                  name={locked === "landscape" ? "phone-landscape" : locked === "portrait" ? "phone-portrait" : "sync"}
                  size={22}
                  color="#fff"
                />
              </FocusButton>
            )}
            {!isSynthetic && (
              <FocusButton
                testID="player-fav-btn"
                onPress={() => toggleFavorite(channel.id)}
                style={styles.iconBtn}
                hitSlop={10}
              >
                <Ionicons
                  name={isFavorite(channel.id) ? "heart" : "heart-outline"}
                  size={24}
                  color={isFavorite(channel.id) ? colors.brandPrimary : "#fff"}
                />
              </FocusButton>
            )}
          </View>

          <View style={styles.centerCtrl} pointerEvents="box-none">
            <FocusButton testID="player-seek-back-btn" onPress={() => seekBy(-10)} style={styles.seekBtn}>
              <Ionicons name="play-back" size={26} color="#fff" />
              <Text style={styles.seekLabel}>10s</Text>
            </FocusButton>
            <FocusButton testID="player-playpause-btn" onPress={togglePlay} style={styles.playBtn} activeOpacity={0.7}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={38} color="#fff" />
            </FocusButton>
            <FocusButton testID="player-seek-fwd-btn" onPress={() => seekBy(10)} style={styles.seekBtn}>
              <Ionicons name="play-forward" size={26} color="#fff" />
              <Text style={styles.seekLabel}>10s</Text>
            </FocusButton>
          </View>

          <View
            style={[
              styles.bottomBar,
              {
                // ANDROID GEZİNME ÇUBUĞU ÇAKIŞMASI DÜZELTMESİ (v4.9.1):
                // Kontroller ekranın en altına sabitleniyordu; telefonun geri/
                // ana sayfa tuşlarıyla üst üste biniyordu. Güvenli alan kadar
                // boşluk bırakıyoruz (yatay modda çentik için sol/sağ da).
                paddingBottom: Math.max(insets.bottom, SPACING.sm),
                paddingLeft: insets.left,
                paddingRight: insets.right,
              },
            ]}
            pointerEvents="box-none"
          >
            {/* ZAMAN ÇUBUĞU (v5.0.0) — filmde istediğin dakikaya atla */}
            <SeekBar
              position={videoStats.position || 0}
              duration={videoStats.duration || 0}
              isLive={!isSynthetic}
              onSeek={seekTo}
            />

            {/* TRANSPORT KONTROLLERİ (v5.0.0) — IPTV Extreme'deki gibi */}
            <View style={styles.transportRow}>
              <FocusButton testID="player-prev-btn" onPress={() => zap(-1)} hitSlop={8} disabled={!canPrevious} focusable={canPrevious} style={styles.transportBtn}>
                <Ionicons name="play-skip-back" size={26} color={canPrevious ? "#fff" : "rgba(255,255,255,0.3)"} />
              </FocusButton>
              <FocusButton testID="player-rew-btn" onPress={() => seekBy(-10)} hitSlop={8} focusable style={styles.transportBtn}>
                <Ionicons name="play-back" size={26} color="#fff" />
              </FocusButton>
              <FocusButton testID="player-toggle-btn" onPress={togglePlay} hitSlop={8} focusable style={styles.transportBtn}>
                <Ionicons name={isPlaying ? "pause" : "play"} size={34} color="#fff" />
              </FocusButton>
              <FocusButton testID="player-stop-btn" onPress={stopPlayback} hitSlop={8} focusable style={styles.transportBtn}>
                <Ionicons name="stop" size={26} color="#fff" />
              </FocusButton>
              <FocusButton testID="player-ff-btn" onPress={() => seekBy(10)} hitSlop={8} focusable style={styles.transportBtn}>
                <Ionicons name="play-forward" size={26} color="#fff" />
              </FocusButton>
              <FocusButton testID="player-next-btn" onPress={() => zap(1)} hitSlop={8} disabled={!canNext} focusable={canNext} style={styles.transportBtn}>
                <Ionicons name="play-skip-forward" size={26} color={canNext ? "#fff" : "rgba(255,255,255,0.3)"} />
              </FocusButton>
            </View>
            {/* ORTA IZGARA MENÜ (v5.6.0 — IPTV Extreme Pro yerleşimi)
                ESKİ: 12 seçenek yatay şeritte sıralıydı; sağdakiler ekran
                dışında kalıyor, kullanıcı bulamıyordu.
                YENİ: ekranın ORTASINDA ızgara — hepsi tek bakışta görünür,
                TV'de kumandayla yukarı/aşağı/sağa/sola gezilebilir. */}
          </View>
            <View style={styles.gridWrap} pointerEvents="box-none">
              <View style={[styles.grid, { backgroundColor: "rgba(0,0,0,0.72)", borderColor: colors.border }]}>
                <GridBtn testID="player-engine-btn" icon="hardware-chip" label={v2Profile.engine === "media3" ? "Media3" : v2Profile.engine === "vlc" ? "VLC" : "MPV"} onPress={() => setSheet("engine")} />
                <GridBtn testID="player-audio-btn" icon="musical-notes" label={audioTracks.length > 0 ? `Ses (${audioTracks.length})` : "Ses"} onPress={() => setSheet("audio")} />
                <GridBtn testID="player-subtitle-btn" icon="text" label={subtitleTracks.length > 0 ? `Altyazı (${subtitleTracks.length})` : "Altyazı"} onPress={() => setSheet("subtitle")} />
                <GridBtn testID="player-fit-btn" icon="resize" label={fit === "contain" ? "Sığdır" : fit === "cover" ? "Doldur" : "Uzat"} onPress={cycleFit} />
                <GridBtn testID="player-speed-btn" icon="speedometer" label={`${speed.toFixed(2)}x`} onPress={() => setSheet("speed")} highlighted={speed !== 1.0} />

                <GridBtn testID="player-audiodelay-btn" icon="git-compare" label="Senkron" onPress={() => setSheet("audiodelay")} />
                {(isSynthetic || isSeekable) && (
                  <GridBtn testID="player-jump-btn" icon="timer" label="Süreye Git" onPress={() => { setJumpText(""); setSheet("jump"); }} />
                )}
                <GridBtn testID="player-buffer-btn" icon="cellular" label="Tampon" onPress={() => setSheet("buffer")} />
                <GridBtn testID="player-sleep-btn" icon="moon" label={sleepAt ? "Uyku Açık" : "Uyku"} onPress={() => setSheet("sleep")} highlighted={!!sleepAt} />
                <GridBtn testID="player-stats-btn" icon="analytics" label="Bilgi" onPress={() => setSheet("stats")} />
                {supportsCatchup && (
                  <GridBtn testID="player-catchup-btn" icon="play-back-circle" label="Catch-up" onPress={openCatchup} />
                )}
                {/* DVR KAYDI (v7.3.0) — altyapı hazırdı, arayüzü yoktu.
                    Yalnızca VLC motorunda çalışır (ExoPlayer kayıt desteklemez). */}
                {/**
                  * v8.8.0: Kayıt düğmesi ARTIK HER ZAMAN GÖRÜNÜR.
                  * Eskiden yalnızca VLC motorundayken gösteriliyordu; kullanıcı
                  * ExoPlayer'dayken düğmeyi bulamıyor, "kayboldu" sanıyordu.
                  * Artık görünür; ExoPlayer'daysa sebebi açıklanıp VLC'ye
                  * geçmesi öneriliyor.
                  */}
                <GridBtn
                  testID="player-record-btn"
                  icon={isRecording ? "stop-circle" : "radio-button-on"}
                  label={isRecording ? "Kaydı Bitir" : "Kaydet"}
                  highlighted={isRecording}
                  onPress={() => {
                    if (v2Profile.engine !== "vlc") {
                      Alert.alert(
                        "Kayıt için VLC gerekiyor",
                        `Şu an ${activeEngineLabel} motoru kullanılıyor ve mevcut kayıt altyapısı VLC'ye bağlı.\n\n` +
                          "Izgaradaki ilk düğmeden motoru VLC'ye alıp tekrar deneyin."
                      );
                      return;
                    }
                    if (isRecording) { stopRecording(); } else { setSheet("recordTarget"); }
                  }}
                />

                {/* EKRAN GÖRÜNTÜSÜ (v7.3.0) */}
                {v2Profile.engine === "vlc" && (
                  <GridBtn
                    testID="player-snapshot-btn"
                    icon="camera"
                    label="Görüntü Al"
                    onPress={() => {
                      try {
                        const name = `kizilkan-${Date.now()}.png`;
                        vlcRef.current?.snapshot(name);
                        Alert.alert("Ekran görüntüsü alındı", name);
                      } catch (e: any) {
                        Alert.alert("Görüntü alınamadı", String(e?.message || e));
                      }
                    }}
                  />
                )}

                <GridBtn testID="player-reload-btn" icon="refresh" label="Yenile" onPress={() => {
                  setIsBuffering(true);
                  setError(null);
                  setTechnicalError(null);
                  if (v2Profile.engine === "mpv") {
                    void mpvRef.current?.reload?.();
                  } else if (v2Profile.engine === "vlc") {
                    try { vlcRef.current?.stop(); } catch {}
                    setTimeout(() => { try { vlcRef.current?.play(); } catch {} }, 250);
                  } else {
                    try { (player as any)?.replay?.(); } catch {}
                  }
                }} />
              </View>
            </View>
        </>
      )}

      {/* KAYIT GÖSTERGESİ (v7.8.0) — sağ üstte yanıp sönen kırmızı nokta.
          Kontroller gizliyken de görünür; kullanıcı kayıtta olduğunu bilir. */}
      {isRecording && (
        <View style={styles.recBadge} pointerEvents="none">
          <View style={[styles.recDot, { opacity: recBlink ? 1 : 0.15 }]} />
          <Text style={styles.recText}>
            REC {recordStart ? fmtDur(Math.floor((statsTick - recordStart) / 1000)) : ""}
          </Text>
        </View>
      )}

      {/* SES GÖSTERGESİ (v7.7.0) — kaydırırken anlık seviye */}
      {!!numericZapText && isTv && sessionKind === "live" && (
        <View style={styles.numericZapOverlay} pointerEvents="none">
          <Text style={styles.numericZapText}>{numericZapText}</Text>
          <Text style={styles.numericZapHint}>Kanal sırası</Text>
        </View>
      )}

      {volumeHint !== null && (
        <View style={styles.volumeHint} pointerEvents="none">
          <Ionicons
            name={volumeHint === 0 ? "volume-mute" : volumeHint < 40 ? "volume-low" : "volume-high"}
            size={30}
            color="#fff"
          />
          <View style={styles.volumeBarBg}>
            <View style={[styles.volumeBarFill, { width: `${volumeHint}%`, backgroundColor: colors.brandPrimary }]} />
          </View>
          <Text style={styles.volumeText}>{volumeHint}</Text>
        </View>
      )}

      {channel && !error && (
        <View style={styles.spinnerOverlay} pointerEvents="none">
          {isBuffering && !(successfulSessionRef.current === activeSessionId && isPlaying) && <ActivityIndicator size="large" color={colors.brandPrimary} />}
        </View>
      )}

      {/* Bottom Sheet */}
      <Modal visible={!!channel && sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        {/* KLAVYE DÜZELTMESİ (v5.5.0): Dikey modda telefon klavyesi açılınca
            "Süreye Git" giriş kutusu klavyenin altında kalıyordu. Panel artık
            klavyenin üstüne kayıyor. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setSheet(null)}
          focusable={false}
          accessible={false}
        >
          <TvFocusScope scope={`player-sheet:${sheet || "none"}`}>
          <FocusGuide
            autoFocus
            {...(isTv ? { trapFocusUp: true, trapFocusDown: true, trapFocusLeft: true, trapFocusRight: true } : {})}
            style={{ width: "100%", alignItems: "center", justifyContent: "flex-end" }}
          >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={e => e.stopPropagation()}
            focusable={false}
            accessible={false}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.onSurfaceTertiary }]} />
            <Text style={[styles.sheetTitle, { color: colors.onSurface }]}>
              {sheet === "sleep" ? "Uyku Zamanlayıcısı"
                : sheet === "audio" ? "Ses Parçası"
                : sheet === "speed" ? "Oynatma Hızı"
                : sheet === "stats" ? "Yayın Bilgisi"
                : sheet === "buffer" ? "Ağ Tamponu (takılma)"
                : sheet === "engine" ? "Oynatıcı Motoru"
                : sheet === "audiodelay" ? "Ses Senkronu (A/V)"
                : sheet === "jump" ? "Süreye Git / Atla"
                : "Altyazı"}
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {sheet === "speed" && SPEED_OPTIONS.map((rate, i) => (
                <SheetItem
                  key={rate}
                  testID={`speed-${rate}-btn`}
                  label={rate === 1.0 ? "Normal (1.0x)" : `${rate.toFixed(rate < 1 ? 2 : 1)}x${rate === 2.0 ? " ⏩" : ""}`}
                  icon="speedometer"
                  onPress={() => setPlaybackSpeed(rate)}
                  active={speed === rate}
                  autoFocus={i === 0}
                />
              ))}
              {sheet === "engine" && (
                <>
                  <SheetItem
                    testID="engine-auto-btn"
                    label="Otomatik (önerilen)"
                    icon="flash"
                    onPress={async () => { setEngine("auto"); await storage.setItem(ENGINE_KEY, "auto"); setSheet(null); setPlaybackRetryNonce(n => n + 1); flashMessage("Motor: Otomatik"); }}
                    active={engine === "auto"}
                    autoFocus
                  />
                  <SheetItem
                    testID="engine-vlc-btn"
                    label="VLC / libVLC (uyumluluk motoru)"
                    icon="shield-checkmark"
                    onPress={async () => { setEngine("vlc"); await storage.setItem(ENGINE_KEY, "vlc"); setSheet(null); setPlaybackRetryNonce(n => n + 1); flashMessage("Motor: VLC"); }}
                    active={engine === "vlc"}
                  />
                  {KIZILKAN_MPV_AVAILABLE && (
                    <SheetItem
                      testID="engine-mpv-btn"
                      label="MPV / FFmpeg (geniş codec desteği)"
                      icon="layers"
                      onPress={async () => { setEngine("mpv"); await storage.setItem(ENGINE_KEY, "mpv"); setSheet(null); setPlaybackRetryNonce(n => n + 1); flashMessage("Motor: MPV / FFmpeg"); }}
                      active={engine === "mpv"}
                    />
                  )}
                  <SheetItem
                    testID="engine-exo-btn"
                    label="Media3 (hızlı — önerilen)"
                    icon="speedometer"
                    onPress={async () => { setEngine("exo"); await storage.setItem(ENGINE_KEY, "exo"); setSheet(null); setPlaybackRetryNonce(n => n + 1); flashMessage("Motor: Media3"); }}
                    active={engine === "exo"}
                  />
                  <SheetItem
                    testID="engine-hw-btn"
                    label={hwAccel ? "Donanım hızlandırma: AÇIK" : "Donanım hızlandırma: KAPALI (yazılım)"}
                    icon="hardware-chip"
                    onPress={async () => {
                      const next = !hwAccel;
                      setHwAccel(next);
                      await storage.setItem(HWACCEL_KEY, next);
                      setSheet(null);
                      flashMessage(next ? "Donanım hızlandırma açıldı" : "Yazılım çözücüye geçildi");
                    }}
                    active={hwAccel}
                  />
                  {/* YÜZEY TİPİ (v9.9.0) — TV'de "görüntü yok" ↔ "4K decoder patlaması"
                      dengesi. Tek düğme üç modu döndürür (kumandayla erişilir). */}
                  {isTv && (
                    <SheetItem
                      testID="engine-surface-btn"
                      icon="tv"
                      label={
                        surfaceMode === "auto" ? "Video yüzeyi: Otomatik (önerilen)"
                          : surfaceMode === "texture" ? "Video yüzeyi: TextureView (kompozisyon)"
                          : "Video yüzeyi: SurfaceView (donanım çözücü)"
                      }
                      onPress={async () => {
                        const next: SurfaceMode =
                          surfaceMode === "auto" ? "surface"
                          : surfaceMode === "surface" ? "texture"
                          : "auto";
                        setSurfaceMode(next);
                        setDecoderRetrySurface(false);
                        await storage.setItem(SURFACE_KEY, next);
                        setSheet(null);
                        flashMessage(
                          next === "auto" ? "Yüzey: Otomatik"
                            : next === "surface" ? "Yüzey: SurfaceView (donanım) — kanalı yeniden açın"
                            : "Yüzey: TextureView — kanalı yeniden açın"
                        );
                      }}
                      active={surfaceMode !== "auto"}
                    />
                  )}
                </>
              )}
              {sheet === "jump" && (
                <View style={{ gap: SPACING.md }}>
                  {/* Mevcut konum / süre bilgisi */}
                  <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm, textAlign: "center" }}>
                    Şu an: {fmtDur(videoStats.position || 0)}
                    {videoStats.duration ? `  /  Toplam: ${fmtDur(videoStats.duration)}` : ""}
                  </Text>

                  {/* Tam zaman girişi */}
                  <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
                    <TextInput
                      testID="jump-time-input"
                      value={jumpText}
                      onChangeText={(t) => setJumpText(t.replace(/[^0-9:]/g, ""))}
                      placeholder="1:23:45  veya  23:45"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      keyboardType="numbers-and-punctuation"
                      style={{
                        flex: 1, height: 50, borderRadius: RADIUS.md, borderWidth: 1,
                        borderColor: colors.border, backgroundColor: colors.surface,
                        color: colors.onSurface, paddingHorizontal: SPACING.md,
                        fontSize: FONT.size.lg, textAlign: "center",
                      }}
                    />
                    <FocusButton
                      testID="jump-go-btn"
                      focusable
                      autoFocus={isTv}
                      onPress={() => {
                        const sec = parseTimeInput(jumpText);
                        if (sec === null) { flashMessage("Geçersiz süre"); return; }
                        const max = videoStats.duration || 0;
                        if (max > 0 && sec > max) { flashMessage("Süre videodan uzun"); return; }
                        seekTo(sec);
                        flashMessage(`⏱ ${fmtDur(sec)}`);
                        setSheet(null);
                      }}
                      style={{
                        height: 50, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.md,
                        backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>Git</Text>
                    </FocusButton>
                  </View>

                  {/* Hızlı atlama */}
                  <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1 }}>
                    HIZLI ATLA
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
                    {JUMP_STEPS.map(step => (
                      <FocusButton
                        key={step}
                        testID={`jump-step-${step}`}
                        focusable
                        onPress={() => {
                          seekBy(step);
                          flashMessage(`${step > 0 ? "⏭ +" : "⏮ "}${Math.abs(step) >= 60 ? `${Math.abs(step) / 60} dk` : `${Math.abs(step)} sn`}`);
                        }}
                        style={{
                          paddingHorizontal: SPACING.md, paddingVertical: 12,
                          borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.border,
                          backgroundColor: colors.surfaceTertiary,
                        }}
                      >
                        <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.semibold }}>
                          {step > 0 ? "+" : "−"}{Math.abs(step) / 60} dk
                        </Text>
                      </FocusButton>
                    ))}
                  </View>

                  {/* Yüzdeye atla (süre biliniyorsa) */}
                  {(videoStats.duration || 0) > 0 && (
                    <>
                      <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1 }}>
                        FİLMİN NERESİ
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
                        {JUMP_PERCENTS.map(pct => (
                          <FocusButton
                            key={pct}
                            testID={`jump-pct-${pct}`}
                            focusable
                            onPress={() => {
                              const target = Math.floor(((videoStats.duration || 0) * pct) / 100);
                              seekTo(target);
                              flashMessage(`⏱ %${pct} — ${fmtDur(target)}`);
                              setSheet(null);
                            }}
                            style={{
                              paddingHorizontal: SPACING.md, paddingVertical: 12,
                              borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.border,
                              backgroundColor: colors.surfaceTertiary,
                            }}
                          >
                            <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.semibold }}>%{pct}</Text>
                          </FocusButton>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              )}
              {sheet === "audiodelay" && AUDIO_DELAY_OPTIONS.map((ms, i) => (
                <SheetItem
                  key={ms}
                  testID={`audiodelay-${ms}-btn`}
                  label={
                    ms === 0 ? "Normal (senkron)"
                      : ms < 0 ? `Ses ${Math.abs(ms)} ms ERKEN`
                      : `Ses ${ms} ms GEÇ`
                  }
                  icon="git-compare"
                  onPress={async () => {
                    setAudioDelay(ms);
                    await storage.setItem(AUDIO_DELAY_KEY, ms);
                    setSheet(null);
                    flashMessage("Senkron değişti — kanalı yeniden açın");
                  }}
                  active={audioDelay === ms}
                  autoFocus={i === 0}
                />
              ))}
              {/* KAYIT HEDEFİ SEÇİMİ (v7.8.0 — kullanıcı isteği) */}
              {sheet === "recordTarget" && (
                <>
                  <SheetItem
                    testID="rec-target-app"
                    icon="phone-portrait"
                    label="Uygulama klasörü (izin gerekmez)"
                    onPress={() => startRecording("app")}
                    autoFocus
                  />
                  <SheetItem
                    testID="rec-target-download"
                    icon="download"
                    label="İndirilenler / KIZILKAN PLAYER ELITE / Record"
                    onPress={() => startRecording("download")}
                  />
                  <SheetItem
                    testID="rec-target-custom"
                    icon="folder-open"
                    label={customRecordDir ? "Seçtiğim klasör" : "Klasör seç…"}
                    onPress={async () => {
                      try {
                        const FS: any = await import("expo-file-system/legacy");
                        const perm = await FS.StorageAccessFramework?.requestDirectoryPermissionsAsync?.();
                        if (perm?.granted && perm.directoryUri) {
                          setCustomRecordDir(perm.directoryUri);
                          await startRecording("custom");
                        } else {
                          Alert.alert("Klasör seçilmedi", "Kayıt için bir klasör seçmelisiniz.");
                        }
                      } catch (e: any) {
                        Alert.alert(
                          "Klasör seçilemedi",
                          "Bu cihazda klasör seçimi desteklenmiyor olabilir.\n\n" +
                            "Diğer iki seçenekten birini kullanabilirsiniz."
                        );
                      }
                    }}
                  />
                </>
              )}

              {sheet === "buffer" && BUFFER_OPTIONS.map((ms, i) => (
                <SheetItem
                  key={ms}
                  testID={`buffer-${ms}-btn`}
                  label={
                    bufferLabel(ms)
                  }
                  icon="cellular"
                  onPress={async () => {
                    setBufferMs(ms);
                    await storage.setItem(BUFFER_KEY, ms);
                    setSheet(null);
                    flashMessage("Tampon değişti — kanalı yeniden açın");
                  }}
                  active={bufferMs === ms}
                  autoFocus={i === 0}
                />
              ))}
              {sheet === "stats" && (
                <View style={styles.statsCard}>
                  {/* CANLI GÖSTERGE (v7.5.0): panel açıkken saniyede bir
                      yenilenir; konum/tampon/geçen süre anlık görünür. */}
                  <StatsRow
                    label="Durum"
                    value={
                      isBuffering ? "Tamponlanıyor…"
                      : isPlaying ? "Oynatılıyor"
                      : "Duraklatıldı"
                    }
                  />
                  <StatsRow label="Motor" value={activeEngineLabel} />
                  <StatsRow label="Player V2" value={v2Phase} />
                  <StatsRow label="Ad" value={channel.name} />
                  <StatsRow label="Grup" value={channel.group || "-"} />
                  <StatsRow label="Format" value={(channel.container_ext || "?").toUpperCase()} />
                  {videoStats.width && videoStats.height ? (
                    <StatsRow label="Çözünürlük" value={`${videoStats.width} × ${videoStats.height}`} />
                  ) : null}
                  {videoStats.duration ? (
                    <StatsRow
                      label="Süre"
                      value={
                        videoStats.currentTime && videoStats.duration
                          ? `${fmtTime(videoStats.currentTime)} / ${fmtTime(videoStats.duration)}`
                          : fmtTime(videoStats.duration)
                      }
                    />
                  ) : null}
                  <StatsRow label="Hız" value={`${speed.toFixed(2)}x`} />
                  <StatsRow label="Ses Parçası" value={selectedAudio?.label || selectedAudio?.language || "Varsayılan"} />
                  <StatsRow label="Altyazı" value={selectedSubtitle?.label || selectedSubtitle?.language || "Kapalı"} />
                  {isRecording && recordStart ? (
                    <StatsRow
                      label="Kayıt süresi"
                      value={fmtDur(Math.floor((statsTick - recordStart) / 1000))}
                    />
                  ) : null}
                  <StatsRow label="URL" value={channel.url?.slice(0, 60) + "..."} mono />
                  {/*
                    DÜRÜST NOT (v7.5.0): Bit hızı (bitrate) ve FPS burada
                    gösterilmiyor çünkü kullandığımız oynatıcı kütüphanesi bu
                    değerleri uygulamaya BİLDİRMİYOR. Uydurma sayı göstermek
                    yerine, sağladığı gerçek bilgileri gösteriyoruz.
                  */}
                  <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: SPACING.sm, lineHeight: 16 }}>
                    Bit hızı ve FPS, kullanılan oynatıcı kütüphanesi tarafından
                    bildirilmediği için gösterilemiyor. Çözünürlük, format ve
                    durum bilgileri gerçek zamanlıdır.
                  </Text>
                </View>
              )}
              {sheet === "sleep" && (
                <>
                  {SLEEP_OPTIONS.map((opt, i) => (
                    <SheetItem
                      key={opt.minutes}
                      testID={`sleep-${opt.minutes}-btn`}
                      label={opt.label}
                      icon="moon"
                      onPress={() => setSleep(opt.minutes)}
                      autoFocus={i === 0}
                    />
                  ))}
                  {sleepAt && (
                    <SheetItem
                      testID="sleep-cancel-btn"
                      label="Zamanlayıcıyı İptal Et"
                      icon="close-circle"
                      onPress={() => setSleep(null)}
                      danger
                    />
                  )}
                </>
              )}
              {sheet === "audio" && (
                audioTracks.length === 0 ? (
                  <Text style={[styles.emptySheet, { color: colors.onSurfaceSecondary }]}>Bu yayında ek ses parçası yok</Text>
                ) : (
                  audioTracks.map((t, i) => (
                    <SheetItem
                      key={i}
                      testID={`audio-track-${i}-btn`}
                      label={t.label || t.language || `Parça ${i + 1}`}
                      icon="musical-notes"
                      onPress={() => selectAudio(t)}
                      active={selectedAudio === t}
                      autoFocus={i === 0}
                    />
                  ))
                )
              )}
              {sheet === "subtitle" && (
                <>
                  <SheetItem
                    testID="subtitle-off-btn"
                    label="Kapat"
                    icon="close-circle"
                    onPress={() => selectSubtitle(null)}
                    active={selectedSubtitle === null}
                    autoFocus
                  />
                  {subtitleTracks.length === 0 ? (
                    <Text style={[styles.emptySheet, { color: colors.onSurfaceSecondary }]}>Bu yayında altyazı yok</Text>
                  ) : (
                    subtitleTracks.map((t, i) => (
                      <SheetItem
                        key={i}
                        testID={`subtitle-track-${i}-btn`}
                        label={t.label || t.language || `Altyazı ${i + 1}`}
                        icon="text"
                        onPress={() => selectSubtitle(t)}
                        active={selectedSubtitle === t}
                      />
                    ))
                  )}
                </>
              )}
            </ScrollView>
          </Pressable>
          </FocusGuide>
          </TvFocusScope>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      {visible && !channel && (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: "#000" }]} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      )}
    </View>
  );
}

/**
 * Orta ızgara düğmesi (v5.6.0 — IPTV Extreme Pro tarzı).
 * Büyük ikon + altında etiket. TV'de odaklanınca belirginleşir.
 */
function GridBtn({
  testID, icon, label, onPress, highlighted,
}: {
  testID: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  highlighted?: boolean;
}) {
  const { colors } = useTheme();
  const { isFocused, onFocus, onBlur } = useTVFocus();
  const tint = highlighted ? colors.brandPrimary : "#fff";
  return (
    <FocusButton
      testID={testID}
      onPress={onPress}
      activeOpacity={0.75}
      focusable
      onFocus={onFocus}
      onBlur={onBlur}
      style={[
        gridStyles.item,
        isFocused && {
          borderColor: colors.brandPrimary,
          backgroundColor: colors.brandPrimary + "22",
          transform: [{ scale: 1.08 }],
        },
      ]}
    >
      <Ionicons name={icon} size={26} color={tint} />
      <Text style={[gridStyles.label, { color: tint }]} numberOfLines={1}>{label}</Text>
    </FocusButton>
  );
}

const gridStyles = StyleSheet.create({
  item: {
    width: 78, height: 66, borderRadius: 12, borderWidth: 1, borderColor: "transparent",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  label: { fontSize: 10, fontWeight: "600" },
});

function ActionBtn({ testID, icon, label, onPress, highlighted }: { testID: string; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; highlighted?: boolean }) {
  return (
    <FocusButton testID={testID} onPress={onPress} focusable style={styles.actionBtn}>
      <Ionicons name={icon} size={20} color={highlighted ? "#FFCA28" : "#fff"} />
      <Text style={[styles.actionText, highlighted && { color: "#FFCA28" }]}>{label}</Text>
    </FocusButton>
  );
}

function SheetItem({ testID, label, icon, onPress, active, danger, autoFocus }: { testID: string; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; active?: boolean; danger?: boolean; autoFocus?: boolean }) {
  const { colors } = useTheme();
  return (
    <FocusButton testID={testID} onPress={onPress} activeOpacity={0.7} focusable autoFocus={autoFocus}
      style={[styles.sheetItem, { borderColor: colors.border }, active && { backgroundColor: colors.surfaceSecondary }]}>
      <Ionicons name={icon} size={20} color={danger ? colors.error : active ? colors.brandPrimary : colors.onSurface} />
      <Text style={[styles.sheetItemText, { color: danger ? colors.error : active ? colors.brandPrimary : colors.onSurface }]}>{label}</Text>
      {active && <Ionicons name="checkmark" size={20} color={colors.brandPrimary} />}
    </FocusButton>
  );
}

function StatsRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.statsRow}>
      <Text style={[styles.statsLabel, { color: colors.onSurfaceSecondary }]}>{label}</Text>
      <Text
        style={[styles.statsValue, { color: colors.onSurface, fontFamily: mono ? Platform.select({ ios: "Courier", android: "monospace" }) : undefined }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  // v9.12.0: Oynatıcı kökü — düz OPAK SİYAH, merkezleme YOK. Şerit/tint rebuild.
  playerRoot: {
    flex: 1,
    backgroundColor: "#000",
    // TV/Android SurfaceView katmanı için alpha kullanılmaz. SurfaceView normal
    // React Native View gibi alpha/zIndex kompozisyonu yapmaz; parent opacity
    // hole-punch/overlay artefaktlarına (şerit/tint) yol açabilir.
    overflow: "hidden",
  },
  playerHidden: {
    // Surface'i detach/GONE yapmak yerine ekran dışına taşı. Media3'in Surface
    // rehberi Android 14 öncesinde yüzey ömrünü korumak için bu yaklaşımı önerir.
    // Alpha/zIndex yok: TV compositor'a yarı saydam/negatif Z surface bırakılmaz.
    transform: [{ translateX: -20000 }, { translateY: -20000 }],
  },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.md,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  channelName: { color: "#fff", fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  channelMeta: { color: "#B3B3B3", fontSize: FONT.size.xs, marginTop: 2 },
  iconBtn: { padding: SPACING.xs },
  centerCtrl: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.xl,
  },
  playBtn: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.35)",
  },
  seekBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  seekLabel: { color: "#fff", fontSize: 9, fontWeight: FONT.weight.bold, marginTop: -2 },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: SPACING.sm,
  },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingHorizontal: SPACING.lg },
  transportRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-evenly",
    paddingVertical: SPACING.xs, paddingHorizontal: SPACING.lg,
  },
  transportBtn: { padding: SPACING.sm },
  /**
   * ORTA IZGARA KONUMU (v5.7.0 düzeltmesi)
   * ESKİ: tam ekran ortasına hizalanıyordu; zaman çubuğu ve transport
   *       düğmeleriyle ÜST ÜSTE biniyordu (ekran görüntüsündeki sorun).
   * YENİ: IPTV Extreme Pro'daki gibi ÜST-ORTA bölgede duruyor; alt kontroller
   *       serbest kalıyor. Yükseklik ekranın %55'i ile sınırlı.
   */
  recBadge: {
    position: "absolute", top: 16, right: 16, flexDirection: "row", alignItems: "center",
    gap: 8, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, zIndex: 95,
  },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#FF2D2D" },
  recText: { color: "#fff", fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  numericZapOverlay: {
    position: "absolute", top: 48, right: 48, zIndex: 220, minWidth: 112,
    alignItems: "center", paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 12, backgroundColor: "rgba(0,0,0,0.82)",
  },
  numericZapText: { color: "#fff", fontSize: 34, fontWeight: "800", letterSpacing: 2 },
  numericZapHint: { color: "rgba(255,255,255,0.72)", fontSize: 11, marginTop: 2 },
  volumeHint: {
    position: "absolute", alignSelf: "center", top: "40%",
    backgroundColor: "rgba(0,0,0,0.82)", paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 16, alignItems: "center", gap: 10, minWidth: 180, zIndex: 90,
  },
  volumeBarBg: { width: 140, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  volumeBarFill: { height: "100%", borderRadius: 3 },
  volumeText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  gridWrap: {
    position: "absolute", top: 0, left: 0, right: 0,
    height: "55%",
    alignItems: "center", justifyContent: "center",
  },
  grid: {
    flexDirection: "row", flexWrap: "wrap", justifyContent: "center",
    gap: 6, padding: SPACING.md, borderRadius: 16, borderWidth: 1,
    maxWidth: 430,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  actionText: { color: "#fff", fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  overlayCenter: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
    padding: SPACING.xl, gap: SPACING.md,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  errorText: { color: "#fff", fontSize: FONT.size.base, textAlign: "center" },
  recoveryBanner: {
    position: "absolute", top: "46%", alignSelf: "center", maxWidth: "86%",
    flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16,
    paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.78)", zIndex: 20,
  },
  recoveryText: { color: "#fff", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  technicalHint: { color: "#888", fontSize: 12, marginTop: 8, textAlign: "center" },
    retryBtn: { paddingHorizontal: SPACING.xl, height: 44, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  retryText: { color: "#fff", fontWeight: FONT.weight.bold, fontSize: FONT.size.base },
  spinnerOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { padding: SPACING.lg, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, borderWidth: 1, gap: SPACING.md },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: SPACING.sm },
  sheetTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold, marginBottom: SPACING.sm },
  sheetItem: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.xs,
  },
  sheetItemText: { flex: 1, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  emptySheet: { textAlign: "center", fontSize: FONT.size.base, padding: SPACING.lg },
  recordFlash: {
    position: "absolute", top: 70, alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(229,9,20,0.95)",
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
  },
  recordFlashText: { color: "#fff", fontWeight: FONT.weight.bold, fontSize: FONT.size.sm },
  gestureFlash: {
    position: "absolute", top: "45%", alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  gestureFlashText: { color: "#fff", fontWeight: FONT.weight.black, fontSize: FONT.size.xl },
  statsCard: { paddingVertical: SPACING.sm },
  statsRow: {
    flexDirection: "row", alignItems: "flex-start", gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
  },
  statsLabel: { flex: 0.4, fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  statsValue: { flex: 0.6, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
});
