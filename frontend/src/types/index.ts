export interface Channel {
  id: string;
  name: string;
  logo?: string | null;
  group?: string | null;
  url: string;
  tvg_id?: string | null;
  tvg_name?: string | null;
  epg_channel_id?: string | null;
  stream_type?: string;
  container_ext?: string | null;
  tv_archive?: number; // 1 if catch-up available
  tv_archive_duration?: number; // days
  num?: number;                 // sağlayıcının kanal numarası
  stream_id?: number | string; // for catch-up URL builder
  /** GPT ELITE v12.5.0: +18 filtresi için önceden hesaplanan hızlı bayrak. */
  isAdult?: boolean;
}

// v15.0.1 BUILD FIX: M3U kaynaklarında sağlayıcı stream/series ID doğal olarak null olabilir; model gerçek veriyi kapsar.
export interface VodItem {
  id: string;
  stream_id: number | string | null;
  name: string;
  poster?: string | null;
  rating?: string | number | null;
  rating_5based?: number | null;
  year?: string | number | null;
  group?: string | null;
  url: string;
  container_ext?: string | null;
  /** İçerik zenginleştirme (v7.3.0) — sunucudan gelen ek alanlar */
  youtube_trailer?: string | null;   // fragman
  backdrop_path?: string | null;     // geniş arka plan görseli
  duration?: string | number | null; // süre
  age?: string | number | null;      // yaş sınırı
  added?: string | null;             // eklenme zamanı
  release_date?: string | null;
  country?: string | null;
  /** GPT ELITE v12.5.0: +18 filtresi için önceden hesaplanan hızlı bayrak. */
  isAdult?: boolean;
}

export interface SeriesItem {
  id: string;
  series_id: number | string | null;
  name: string;
  poster?: string | null;
  plot?: string | null;
  cast?: string | null;
  director?: string | null;
  genre?: string | null;
  release_date?: string | null;
  rating?: string | number | null;
  rating_5based?: number | null;
  group?: string | null;
  /** İçerik zenginleştirme (v7.3.0) — sunucudan gelen ek alanlar */
  youtube_trailer?: string | null;   // fragman
  backdrop_path?: string | null;     // geniş arka plan görseli
  duration?: string | number | null; // süre
  age?: string | number | null;      // yaş sınırı
  added?: string | null;             // eklenme zamanı
  country?: string | null;
  /** GPT ELITE v12.5.0: +18 filtresi için önceden hesaplanan hızlı bayrak. */
  isAdult?: boolean;
}

export interface AccountInfo {
  username?: string;
  status?: string;
  exp_date?: string | null;
  is_trial?: string;
  active_cons?: string | number;
  max_connections?: string | number;
  created_at?: string;
  mac?: string;
  phone?: string;
  tariff_plan?: string;
  tariff_expired_date?: string | null;
  /** Sunucunun desteklediği yayın formatları (Xtream standardı). */
  allowed_output_formats?: string[];
  /** Panelin gönderdiği mesaj/duyuru (Xtream standardı). */
  message?: string;
  /** Panelin gönderdiği DİĞER tüm alanlar burada saklanır ve gösterilir.
   *  Bazı paneller APK linki, destek bağlantısı gibi özel alanlar gönderir. */
  extra?: Record<string, any>;
}

/**
 * Kullanıcının kendi girdiği sağlayıcı bilgileri (v5.6.0).
 * Xtream standardında APK linki / Telegram / oynatıcı listesi YOKTUR; bunları
 * sağlayıcı ayrıca bildirir. Kullanıcı buraya kaydeder, elinin altında olur.
 */
export interface ProviderInfo {
  apkUrl?: string;
  telegram?: string;
  whatsapp?: string;
  website?: string;
  /** İzin verilen oynatıcılar (sağlayıcının bildirdiği). */
  allowedPlayers?: string;
  /** Yasaklı oynatıcılar. */
  bannedPlayers?: string;
  /** Duyurular / notlar. */
  notes?: string;
}

/** Xtream server_info yanıtı — sunucu bilgileri (kullanıcı isteği: görünür olsun). */
export interface ServerInfo {
  url?: string;
  port?: string | number;
  https_port?: string | number;
  server_protocol?: string;
  rtmp_port?: string | number;
  timezone?: string;
  timestamp_now?: number;
  time_now?: string;
  version?: string;
  revision?: string | number;
}

export type PlaylistSource = 'm3u_url' | 'm3u_file' | 'xtream' | 'stalker';

export interface ServerCodeBinding {
  /** Firebase/uzak rehberdeki kısa panel kodu. */
  code: string;
  /** Kullanıcının doğrulayıp seçtiği panel kimliği. */
  panelName: string;
  /** Rehberin kaynak adresi. Kimlik bilgileri bu adrese gönderilmez. */
  codeSource: string;
  /** DNS değişiminde aynı panelin güncel hostlarını otomatik dene. */
  autoResolve: boolean;
  /** Son doğrulanan/çalışan DNS — yalnız teşhis ve hızlı karşılaştırma için. */
  lastResolvedServer?: string;
  /** Son başarılı çözümleme zamanı. */
  lastResolvedAt?: string;
  /** Kullanıcının özellikle seçtiği DNS; çalıştığı sürece önce bu denenir. */
  preferredServer?: string;
  /** Bu hesapla doğrulanmış panel DNS adresleri. */
  validatedHosts?: string[];
}

export interface PlaylistContentSelection {
  live: boolean;
  vod: boolean;
  series: boolean;
  /** null=tümü, []=hiçbiri; değerler sağlayıcının gerçek kategori/group adlarıdır. */
  liveCategories: string[] | null;
  vodCategories: string[] | null;
  seriesCategories: string[] | null;
  /** true ise kullanıcı bir sonraki elle yenilemede tercihleri yeniden düzenlemek istiyor. */
  askOnManualRefresh?: boolean;
  updatedAt?: string;
}

export interface Playlist {
  id: string;
  name: string;
  source: PlaylistSource;
  m3uUrl?: string;
  xtreamServer?: string;
  xtreamUsername?: string;
  xtreamPassword?: string;
  /** Sunucu Kodu/Panel Rehberi ile eklenen Xtream listelerinde kalıcı panel bağı. */
  serverCodeBinding?: ServerCodeBinding;
  stalkerPortal?: string;
  stalkerMac?: string;
  stalkerSerial?: string;
  accountInfo?: AccountInfo | null;
  serverInfo?: ServerInfo | null;
  /** Kullanıcının girdiği sağlayıcı bilgileri (APK, destek, oynatıcı listesi). */
  providerInfo?: ProviderInfo | null;
  /** v16.13.5: ilk eklemede seçilen içerik/kategori kapsamı; yenilemede varsayılan olarak korunur. */
  contentSelection?: PlaylistContentSelection | null;
  /** v16.13.6: playlist yönetimi metadata'sı. */
  pinned?: boolean;
  manualOrder?: number;
  lastUsedAt?: string;
  lastRefreshedAt?: string;
  lastRefreshOk?: boolean;
  /**
   * LİSTE KİLİDİ (v9.3.0 — kullanıcı isteği)
   * Bu listeye geçmek için PIN gerekir. Profil PIN'inden BAĞIMSIZDIR:
   * aynı profildeki bazı listeler korumalı, bazıları serbest olabilir.
   */
  hasPin?: boolean;
  pin?: string;
  channels: Channel[];
  vod?: VodItem[];
  series?: SeriesItem[];
  /** v15.2 Native Core: tam dizi JS'e alınmadan metadata sayaçları. */
  channelsCount?: number;
  vodCount?: number;
  seriesCount?: number;
  epgUrl?: string;
  createdAt: string;
}

export interface EPGProgram {
  channel: string;
  start: string;
  stop: string;
  title: string;
  desc?: string;
}

export interface NowNext {
  now: EPGProgram | null;
  next: EPGProgram | null;
}

// --- Profile & Parental ---

export interface Profile {
  id: string;
  name: string;
  color: string;
  hasPin: boolean;
  pin?: string;
  isKids?: boolean;
  /** Yönetici profil mi? İlk oluşturulan profil yöneticidir (v6.1.0).
   *  Profil ekleme/silme yalnızca yöneticinin PIN'iyle yapılır. */
  isAdmin?: boolean;
}

export interface ParentalSettings {
  enabled: boolean;
  pin: string;
  lockedCategories: string[];
  adultHidden?: boolean;
}

export interface CatchupProgram {
  title: string;
  start: string;
  stop: string;
  start_timestamp?: string | number;
  stop_timestamp?: string | number;
  has_archive?: number | string;
  epg_id?: string;
  description?: string;
}
