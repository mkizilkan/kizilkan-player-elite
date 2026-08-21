/**
 * Client-side M3U parser & Xtream Codes API.
 * Runs entirely on-device — no backend proxy required.
 * Supports both extended M3U (with #EXTINF metadata) and simple URL lists.
 *
 * Handles:
 *  - #EXTINF:-1 tvg-id, tvg-name, tvg-logo, group-title
 *  - #EXTGRP:  Fallback group
 *  - #KODIPROP: DRM/license info (preserved as-is on channel.headers)
 *  - Case-insensitive attribute keys, single/double quotes
 *  - BOM stripping
 */

import type { Channel, VodItem, SeriesItem } from '@/src/types';

/**
 * UTF-8 FARKINDA base64 çözücü (Türkçe karakter düzeltmesi).
 *
 * SORUN: atob(s) base64'ü çözer ama sonucu Latin-1 (tek bayt) olarak yorumlar.
 * Türkçe karakterler (ş, ğ, ü, ö, ç, İ, ı) UTF-8'de ÇOK BAYTLI olduğu için
 * atob onları bozar: "Diriliş" -> "DiriliÅ", "Güzel" -> "GÃ¼zel".
 *
 * ÇÖZÜM: base64'ü ham baytlara çevir, sonra bu baytları UTF-8 olarak decode et.
 * TextDecoder her modern RN/Hermes ortamında vardır; yoksa Buffer'a düşeriz.
 */
export function decodeBase64Utf8(s: any): any {
  if (!s || typeof s !== 'string') return s;
  try {
    // Ortam Buffer destekliyorsa en temiz yol (Node/bazı RN polyfill'leri).
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(s, 'base64').toString('utf-8');
    }
    // Tarayıcı/Hermes: atob ile ham baytları al, TextDecoder ile UTF-8 çöz.
    // eslint-disable-next-line no-undef
    if (typeof atob !== 'undefined') {
      // eslint-disable-next-line no-undef
      const bin = atob(s);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      // eslint-disable-next-line no-undef
      if (typeof TextDecoder !== 'undefined') {
        // eslint-disable-next-line no-undef
        return new TextDecoder('utf-8').decode(bytes);
      }
      // TextDecoder yoksa: baytları elle UTF-8'e çevir (yedek).
      return decodeURIComponent(
        Array.from(bytes).map(b => '%' + b.toString(16).padStart(2, '0')).join('')
      );
    }
    return s;
  } catch {
    return s;
  }
}

// --- Deterministik ID üretimi (P0-2 çözümü) ---
// ESKİ: nano() = Math.random -> her yüklemede kanal ID'si DEĞİŞİYORDU.
// Sonuç: M3U listesini her yenileyişte favoriler, "devam et" ilerlemesi ve
// gizlenenler kopuyordu. ÇÖZÜM: ID'yi içerikten (url + isim) türet -> aynı
// kanal her zaman aynı ID'yi alır, favoriler kalıcı olur.
//
// Not: Kriptografik güç GEREKMİYOR (güvenlik değil, tutarlılık lazım). Bu yüzden
// expo-crypto'nun async hash'i yerine SENKRON bir hash (FNV-1a türevi) kullanıyoruz;
// böylece senkron M3U parse döngüsünü async'e çevirmek zorunda kalmıyoruz.
function stableHash(input: string): string {
  // 64-bit'e yakın çakışma direnci için iki bağımsız 32-bit hash birleştiriyoruz.
  let h1 = 0x811c9dc5; // FNV offset
  let h2 = 0x1000193; // ikinci tohum
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = (h1 * 0x01000193) >>> 0;
    h2 = ((h2 << 5) - h2 + c) >>> 0; // djb2 benzeri
  }
  // 8 + 8 = 16 haneli onaltılık, çakışma olasılığı pratikte ihmal edilebilir.
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/**
 * Bir M3U kanalı için kalıcı ID üretir.
 *
 * ÖNEMLİ (favori çoklu-seçim bug düzeltmesi):
 * Aynı kanalın HD/SD/4K varyantları çoğu sağlayıcıda AYNI tvg-id taşır
 * (ör. hepsi "trt2.tr"). Eğer ID'yi sadece tvg-id'den türetirsek üç varyant
 * da AYNI ID alır -> birini favoriye ekleyince hepsi ekleniyordu.
 *
 * ÇÖZÜM: ID'yi tvg-id İLE url'i BİRLEŞTİREREK türet. URL her varyantta
 * farklıdır (farklı stream). Böylece TRT2 HD, TRT2 SD, TRT2 4K ayrı ID alır,
 * favori tek tek seçilir. tvg-id yoksa url, o da yoksa isim kullanılır.
 * Aynı kanal (aynı tvg-id + aynı url) her yüklemede yine aynı ID'yi alır.
 */
function channelId(prefix: string, opts: { tvgId?: string | null; url?: string | null; name?: string | null }): string {
  const tvg = (opts.tvgId && opts.tvgId.trim()) || "";
  const url = (opts.url && opts.url.trim()) || "";
  const name = (opts.name && opts.name.trim()) || "";

  // Öncelik: tvg-id + url birlikte (en ayırt edici). En az biri olmalı.
  let basis = "";
  if (tvg && url) basis = tvg + "|" + url;
  else if (url) basis = url;             // url tek başına da varyantları ayırır
  else if (tvg && name) basis = tvg + "|" + name;
  else if (name) basis = name;

  if (!basis) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return `${prefix}-${stableHash(basis)}`;
}

function parseAttrs(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // capture key="value" OR key='value' OR key=value (unquoted, up to whitespace)
  const re = /([a-zA-Z0-9\-_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const k = m[1].toLowerCase();
    const v = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[k] = v;
  }
  return attrs;
}

export interface ParsedM3U {
  channels: Channel[];
  vod: VodItem[];
  series: SeriesItem[];
  count: number;
}

function classifyUrl(url: string, ext: string | null): "live" | "vod" | "series" {
  const u = url.toLowerCase();
  if (u.includes("/series/") || u.includes("/tv-series/")) return "series";
  if (u.includes("/movie/") || u.includes("/vod/") || u.includes("/films/") || u.includes("/movies/")) return "vod";
  const vodExts = ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"];
  if (ext && vodExts.includes(ext)) return "vod";
  return "live";
}

export function parseM3U(rawContent: string): ParsedM3U {
  if (!rawContent) return { channels: [], vod: [], series: [], count: 0 };
  const text = rawContent.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const channels: Channel[] = [];
  const vod: VodItem[] = [];
  const series: SeriesItem[] = [];
  let pending: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) continue;

    if (line.startsWith('#EXTINF')) {
      const commaIdx = line.indexOf(',');
      const meta = commaIdx >= 0 ? line.slice(0, commaIdx) : line;
      const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : 'Kanal';
      const attrs = parseAttrs(meta);
      pending = {
        // ID URL geldikten SONRA kesinleşecek (aşağıda). Geçici boş bırakıyoruz.
        id: '',
        name,
        tvg_id: attrs['tvg-id'] || null,
        tvg_name: attrs['tvg-name'] || null,
        epg_channel_id: attrs['tvg-id'] || attrs['channel-id'] || null,
        logo: attrs['tvg-logo'] || attrs['logo'] || null,
        group: attrs['group-title'] || attrs['group'] || 'Genel',
        url: '',
        container_ext: null,
        stream_id: null,
        source: 'm3u',
        headers: {},
      };
    } else if (line.startsWith('#EXTGRP')) {
      const val = line.split(':')[1]?.trim();
      if (pending && val) pending.group = val;
    } else if (line.startsWith('#EXTVLCOPT') || line.startsWith('#KODIPROP')) {
      const val = line.split(':').slice(1).join(':').trim();
      const [k, ...rest] = val.split('=');
      if (pending && k) {
        pending.headers = pending.headers || {};
        pending.headers[k.toLowerCase()] = rest.join('=');
      }
    } else if (line.startsWith('#')) {
      continue;
    } else {
      if (!pending) {
        pending = {
          id: '',
          name: line.split('/').pop() || 'Kanal',
          group: 'Genel',
          logo: null, tvg_id: null, tvg_name: null, epg_channel_id: null,
          url: '', container_ext: null, stream_id: null, source: 'm3u',
        };
      }
      pending.url = line;
      const ext = (line.split('.').pop() || '').split('?')[0].toLowerCase();
      pending.container_ext = ext && ext.length <= 5 ? ext : (line.includes('.m3u8') ? 'm3u8' : null);

      // Kalıcı ID artık URL biliniyorken üretiliyor (P0-2). Aynı kanal = aynı ID.
      const stable = channelId('ch', { tvgId: pending.tvg_id, url: pending.url, name: pending.name });

      const kind = classifyUrl(line, pending.container_ext);
      if (kind === "vod") {
        vod.push({
          id: `vod-${stable}`,
          name: pending.name,
          group: pending.group,
          poster: pending.logo,
          url: pending.url,
          container_ext: pending.container_ext || 'mp4',
          stream_id: null,
          year: null, rating: null, rating_5based: null,
          plot: null, cast: null, director: null, genre: null,
        } as VodItem);
      } else if (kind === "series") {
        series.push({
          id: `ser-${stable}`,
          name: pending.name,
          group: pending.group,
          poster: pending.logo,
          series_id: null,
          year: null, rating: null, rating_5based: null,
          plot: null, cast: null, director: null, genre: null,
        } as SeriesItem);
      } else {
        pending.id = stable;
        channels.push(pending as Channel);
      }
      pending = null;
    }
  }
  return { channels, vod, series, count: channels.length + vod.length + series.length };
}

/** Download M3U over HTTP and parse in one shot. */
/** Tüm ağ çağrılarında kullanılan ortak istemci kimliği. */
const UA = "VLC/3.0.20 LibVLC/3.0.20";

export async function fetchAndParseM3U(url: string, timeoutMs = 120000): Promise<ParsedM3U> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // v9.1.0: Merkezi UA sabiti (streamTest.ts) — oynatma, test, EPG ve
        // liste indirmede AYNI kimlik kullanılır; sağlayıcı tarafında
        // tutarsızlık kaynaklı reddedilmeler önlenir.
        'User-Agent': UA,
        'Accept': '*/*',
      },
    });
    if (!res.ok) throw new Error(`Sunucu hatası: HTTP ${res.status}`);
    const text = await res.text();
    if (!text || text.length < 8) throw new Error('Boş yanıt döndü');
    return parseM3U(text);
  } finally {
    clearTimeout(t);
  }
}

// ============================================================================
// XTREAM CODES CLIENT
// ============================================================================

export interface XtreamCredentials { server: string; username: string; password: string; }
export interface XtreamAccountInfo {
  username?: string;
  status?: string;
  exp_date?: string | null;
  is_trial?: string;
  active_cons?: string;
  max_connections?: string;
  allowed_output_formats?: string[];
}
export interface XtreamCategory { category_id: string; category_name: string; parent_id?: number }

function normalizeServer(server: string): string {
  let s = server.trim();
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s.replace(/\/+$/, '');
}

async function xtGet<T>(url: string, timeoutMs = 60000): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16', 'Accept': 'application/json,*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text) as T; } catch { throw new Error('Geçersiz JSON'); }
  } finally { clearTimeout(t); }
}

export async function xtreamLogin(cred: XtreamCredentials): Promise<{ user_info: XtreamAccountInfo; server_info: any }> {
  const base = normalizeServer(cred.server);
  const url = `${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}`;
  const data = await xtGet<any>(url, 30000);
  if (!data?.user_info) throw new Error('Geçersiz kimlik bilgileri');
  if (data.user_info.auth === 0 || data.user_info.auth === '0') throw new Error('Kullanıcı adı veya şifre hatalı');
  // v5.6.0: Panelin gönderdiği TÜM ek alanları koru.
  // Xtream standardında allowed_output_formats ve message vardır; bazı paneller
  // APK linki, destek bağlantısı gibi ÖZEL alanlar da gönderir. Bunları atmak
  // yerine "extra" içinde saklayıp kullanıcıya gösteriyoruz.
  const ui = data.user_info || {};
  const KNOWN = new Set([
    "username", "password", "message", "auth", "status", "exp_date", "is_trial",
    "active_cons", "created_at", "max_connections", "allowed_output_formats",
  ]);
  const extra: Record<string, any> = {};
  for (const [k, v] of Object.entries(ui)) {
    if (KNOWN.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "object") continue;      // karmaşık nesneleri atla
    extra[k] = v;
  }

  return {
    user_info: { ...ui, extra: Object.keys(extra).length ? extra : undefined },
    server_info: data.server_info || {},
  };
}

export async function xtreamLiveCategories(cred: XtreamCredentials): Promise<XtreamCategory[]> {
  const base = normalizeServer(cred.server);
  return xtGet(`${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&action=get_live_categories`);
}

export async function xtreamLiveStreams(cred: XtreamCredentials): Promise<Channel[]> {
  const base = normalizeServer(cred.server);
  const url = `${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&action=get_live_streams`;
  const [streams, cats] = await Promise.all([
    xtGet<any[]>(url, 120000),
    xtreamLiveCategories(cred).catch(() => [] as XtreamCategory[]),
  ]);
  const catMap = new Map<string, string>(cats.map(c => [String(c.category_id), c.category_name]));
  return (streams || []).map((s: any) => ({
    id: `xt-live-${s.stream_id}`,
    name: s.name || 'Kanal',
    group: catMap.get(String(s.category_id)) || 'Genel',
    logo: s.stream_icon || null,
    tvg_id: s.epg_channel_id || null,
    tvg_name: s.name || null,
    epg_channel_id: s.epg_channel_id || null,
    url: `${base}/live/${encodeURIComponent(cred.username)}/${encodeURIComponent(cred.password)}/${s.stream_id}.${s.container_extension || 'ts'}`,
    container_ext: s.container_extension || 'ts',
    stream_id: String(s.stream_id),
    // CATCH-UP DÜZELTMESİ (v5.8.0):
    // tv_archive tipte tanımlıydı ve iki yerde kullanılıyordu (player'daki
    // Catch-up düğmesi ve uzun-bas menüsü) AMA sunucudan HİÇ ALINMIYORDU.
    // Bu yüzden Catch-up seçeneği hiçbir kanalda görünmüyordu.
    tv_archive: Number(s.tv_archive) || 0,
    tv_archive_duration: Number(s.tv_archive_duration) || 0,
    // Sağlayıcının verdiği kanal numarası (sıralama/zapping için)
    num: s.num !== undefined ? Number(s.num) : undefined,
    source: 'xtream',
  } as Channel));
}

export async function xtreamVodCategories(cred: XtreamCredentials): Promise<XtreamCategory[]> {
  const base = normalizeServer(cred.server);
  return xtGet(`${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&action=get_vod_categories`);
}

export async function xtreamVod(cred: XtreamCredentials): Promise<VodItem[]> {
  const base = normalizeServer(cred.server);
  const url = `${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&action=get_vod_streams`;
  const [items, cats] = await Promise.all([
    xtGet<any[]>(url, 120000),
    xtreamVodCategories(cred).catch(() => [] as XtreamCategory[]),
  ]);
  const catMap = new Map<string, string>(cats.map(c => [String(c.category_id), c.category_name]));
  return (items || []).map((v: any) => ({
    id: `xt-vod-${v.stream_id}`,
    name: v.name || 'Film',
    group: catMap.get(String(v.category_id)) || 'Genel',
    poster: v.stream_icon || null,
    year: v.year || null,
    rating_5based: v.rating_5based ? Number(v.rating_5based) : null,
    /**
     * İÇERİK ZENGİNLEŞTİRME (v7.3.0)
     * Bu alanlar sunucudan GELİYOR ama alınmıyordu. Detay ekranını
     * belirgin şekilde zenginleştiriyorlar.
     */
    youtube_trailer: v.youtube_trailer || null,    // fragman kimliği/adresi
    backdrop_path: Array.isArray(v.backdrop_path) ? v.backdrop_path[0] : (v.backdrop_path || null),
    duration: v.duration || v.episode_run_time || null,
    age: v.age || null,                             // yaş sınırı
    added: v.added || null,                         // eklenme zamanı (yeni içerik sıralaması)
    release_date: v.release_date || v.releaseDate || null,
    country: v.country || null,
    rating: v.rating || null,
    plot: v.plot || null,
    cast: v.cast || null,
    director: v.director || null,
    genre: v.genre || null,
    container_ext: v.container_extension || 'mp4',
    stream_id: String(v.stream_id),
    url: `${base}/movie/${encodeURIComponent(cred.username)}/${encodeURIComponent(cred.password)}/${v.stream_id}.${v.container_extension || 'mp4'}`,
  } as VodItem));
}

export async function xtreamSeriesCategories(cred: XtreamCredentials): Promise<XtreamCategory[]> {
  const base = normalizeServer(cred.server);
  return xtGet(`${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&action=get_series_categories`);
}

export async function xtreamSeries(cred: XtreamCredentials): Promise<SeriesItem[]> {
  const base = normalizeServer(cred.server);
  const url = `${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&action=get_series`;
  const [items, cats] = await Promise.all([
    xtGet<any[]>(url, 120000),
    xtreamSeriesCategories(cred).catch(() => [] as XtreamCategory[]),
  ]);
  const catMap = new Map<string, string>(cats.map(c => [String(c.category_id), c.category_name]));
  return (items || []).map((s: any) => ({
    id: `xt-series-${s.series_id}`,
    name: s.name || 'Dizi',
    group: catMap.get(String(s.category_id)) || 'Genel',
    poster: s.cover || null,
    plot: s.plot || null,
    cast: s.cast || null,
    director: s.director || null,
    genre: s.genre || null,
    rating: s.rating || null,
    rating_5based: s.rating_5based ? Number(s.rating_5based) : null,
    year: s.year || s.release_date || null,
    // İÇERİK ZENGİNLEŞTİRME (v7.3.0) — dizi tarafı
    youtube_trailer: s.youtube_trailer || null,
    backdrop_path: Array.isArray(s.backdrop_path) ? s.backdrop_path[0] : (s.backdrop_path || null),
    duration: s.episode_run_time || null,
    age: s.age || null,
    added: s.last_modified || null,
    release_date: s.release_date || s.releaseDate || null,
    series_id: String(s.series_id),
  } as SeriesItem));
}

export async function xtreamSeriesInfo(cred: XtreamCredentials, series_id: string): Promise<{ info: any; seasons: { season: string; episodes: any[] }[] }> {
  const base = normalizeServer(cred.server);
  const url = `${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&action=get_series_info&series_id=${encodeURIComponent(series_id)}`;
  const data = await xtGet<any>(url, 60000);
  const eps = data?.episodes || {};
  const seasons = Object.keys(eps).map(k => ({
    season: k,
    episodes: (eps[k] || []).map((e: any) => ({
      ...e,
      url: `${base}/series/${encodeURIComponent(cred.username)}/${encodeURIComponent(cred.password)}/${e.id}.${e.container_extension || 'mp4'}`,
    })),
  }));
  return { info: data?.info || {}, seasons };
}

export async function xtreamVodInfo(cred: XtreamCredentials, vod_id: string): Promise<{ info: any; movie_data: any }> {
  const base = normalizeServer(cred.server);
  const url = `${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&action=get_vod_info&vod_id=${encodeURIComponent(vod_id)}`;
  const data = await xtGet<any>(url, 60000);
  return { info: data?.info || {}, movie_data: data?.movie_data || {} };
}


// -------------------- XTREAM EPG (client-side) --------------------

export interface EpgProgram {
  title: string;
  description?: string | null;
  start: string;   // ISO or Xtream epoch
  stop: string;
  start_timestamp?: number;
  stop_timestamp?: number;
}

/**
 * Xtream: get_short_epg per stream_id (next N programs).
 * Returns an array of programs; empty if provider has no EPG.
 */
/**
 * Xtream: Catch-up / archive EPG (geriye dönük izleme program listesi).
 * get_simple_data_table action'ı has_archive alanını içerir; hangi programların
 * geriye dönük izlenebileceğini söyler. CİHAZ-İÇİ — backend proxy gerekmez.
 *
 * @returns { programs } — catchup.tsx'in beklediği yapıyla uyumlu.
 */
export async function xtreamCatchupEpg(
  cred: XtreamCredentials,
  stream_id: string,
  limit = 100
): Promise<{ programs: any[] }> {
  const base = normalizeServer(cred.server);
  const url = `${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&action=get_simple_data_table&stream_id=${encodeURIComponent(stream_id)}`;
  try {
    const data = await xtGet<any>(url, 30000);
    const list = data?.epg_listings || data?.epg || [];

    const decode = decodeBase64Utf8;

    const programs = (Array.isArray(list) ? list : [])
      .slice(0, limit)
      .map((p: any) => ({
        title: decode(p.title) || "Program",
        description: decode(p.description) || null,
        start: p.start || String(p.start_timestamp || ""),
        stop: p.end || p.stop || String(p.stop_timestamp || ""),
        start_timestamp: p.start_timestamp ? Number(p.start_timestamp) : undefined,
        stop_timestamp: p.stop_timestamp ? Number(p.stop_timestamp) : undefined,
        has_archive: Number(p.has_archive) || 0,
        now_playing: Number(p.now_playing) || 0,
      }));

    return { programs };
  } catch {
    return { programs: [] };
  }
}

export async function xtreamShortEpg(cred: XtreamCredentials, stream_id: string, limit = 24): Promise<EpgProgram[]> {
  const base = normalizeServer(cred.server);
  const url = `${base}/player_api.php?username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&action=get_short_epg&stream_id=${encodeURIComponent(stream_id)}&limit=${limit}`;
  try {
    const data = await xtGet<any>(url, 20000);
    const list = data?.epg_listings || data?.epg || [];
    return list.map((p: any) => {
      // Xtream titles/descriptions are base64 (UTF-8 farkında çözücü — Türkçe düzeltmesi)
      const decode = decodeBase64Utf8;
      return {
        title: decode(p.title) || 'Program',
        description: decode(p.description) || null,
        start: p.start || String(p.start_timestamp || ''),
        stop: p.end || p.stop || String(p.stop_timestamp || ''),
        start_timestamp: p.start_timestamp ? Number(p.start_timestamp) : undefined,
        stop_timestamp: p.stop_timestamp ? Number(p.stop_timestamp) : undefined,
      } as EpgProgram;
    });
  } catch {
    return [];
  }
}

/**
 * Xtream: fetch now/next for multiple channels in parallel.
 * Returns a map of { stream_id: { now, next } }.
 */
export async function xtreamNowNextBatch(
  cred: XtreamCredentials,
  streamIds: string[],
  concurrency = 4,
): Promise<Record<string, { now: EpgProgram | null; next: EpgProgram | null }>> {
  const out: Record<string, { now: EpgProgram | null; next: EpgProgram | null }> = {};
  const queue = [...streamIds];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      if (!id) break;
      const eps = await xtreamShortEpg(cred, id, 2);
      out[id] = { now: eps[0] || null, next: eps[1] || null };
    }
  });
  await Promise.all(workers);
  return out;
}

// ===========================================================================
// XTREAM PORTAL OTOMATİK ALGILAMA (kullanıcı isteği)
// ===========================================================================
/**
 * Bir M3U URL'inin aslında bir Xtream Codes portalı olup olmadığını anlar.
 * Xtream sağlayıcıları genelde şu biçimde M3U linki verir:
 *   http://sunucu:port/get.php?username=KULLANICI&password=SIFRE&type=m3u_plus
 * Bu aslında bir Xtream portalıdır; parçalarına ayrılıp Xtream API'si ile
 * çok daha zengin (kategoriler, EPG, VOD bilgisi) yüklenebilir.
 *
 * @returns Ayrıştırılabilirse { server, username, password }, değilse null.
 */
export function detectXtreamFromM3U(rawUrl: string): { server: string; username: string; password: string } | null {
  if (!rawUrl) return null;
  const url = rawUrl.trim();

  // get.php veya player_api.php içermiyorsa Xtream portalı değildir.
  const low = url.toLowerCase();
  if (!low.includes("get.php") && !low.includes("player_api.php")) return null;

  try {
    const u = new URL(url);
    const username = u.searchParams.get("username") || "";
    const password = u.searchParams.get("password") || "";
    if (!username || !password) return null;

    // Sunucu = protokol + host (+ port). Yol ve sorgu atılır.
    const server = `${u.protocol}//${u.host}`;
    return { server, username, password };
  } catch {
    return null;
  }
}

/**
 * XTREAM TIMESHIFT (CATCH-UP) URL — TEK MERKEZ (v9.12.0)
 * Format: {server}/timeshift/{user}/{pass}/{dakika}/{YYYY-MM-DD:HH-MM}/{stream_id}.ts
 * Kullanıcı adı/parola URL-encode edilir (özel karakter güvenliği).
 * Eskiden bu URL catchup.tsx ve epg-timeline.tsx'te AYRI AYRI (encode'suz,
 * biri Math.ceil biri Math.floor) kuruluyordu; artık tek kaynak.
 * NOT: Tarih cihazın yerel saatiyle biçimlenir (mevcut çalışan catchup.tsx ile
 * aynı davranış); sağlayıcı farklı timezone bekliyorsa ayrıca ele alınır.
 */
export function buildXtreamTimeshiftUrl(opts: {
  server: string;
  username: string;
  password: string;
  startMs: number;
  stopMs: number;
  streamId: string | number;
}): string | null {
  const { server, username, password, startMs, stopMs, streamId } = opts;
  if (!server || !username || !password || streamId === undefined || streamId === null || streamId === "") return null;
  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs)) return null;
  const d = new Date(startMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}:${pad(d.getHours())}-${pad(d.getMinutes())}`;
  const durMin = Math.max(1, Math.ceil((stopMs - startMs) / 60000));
  const base = server.replace(/\/+$/, "");
  return `${base}/timeshift/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${durMin}/${stamp}/${streamId}.ts`;
}
