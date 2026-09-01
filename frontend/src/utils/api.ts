import { Channel, VodItem, SeriesItem, AccountInfo } from '@/src/types';

/**
 * Backend URL resolution with fallback support.
 * Reads EXPO_PUBLIC_BACKEND_URL (baked in at build time).
 * Falls back through a list of known hosts if the primary is unreachable.
 * The first URL to respond to /api/health becomes the "sticky" active URL.
 */
const PRIMARY_BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// v9.11.0: Emergent backend fallback adresleri KALDIRILDI. Proje cihaz-içi
// çalışıyor (M3U/Xtream/Stalker/EPG doğrudan sağlayıcıya gider). Eski emergent
// host'ları burada duruyordu ve api.* çağrılırsa o kapalı servislere erişmeye
// çalışıyordu. Yalnızca açıkça EXPO_PUBLIC_BACKEND_URL verilirse kullanılır.
const FALLBACK_URLS: string[] = [];

// Deduplicate + keep order
const ALL_URLS: string[] = Array.from(new Set([PRIMARY_BACKEND, ...FALLBACK_URLS].filter(Boolean)));

let ACTIVE_BACKEND: string | null = null;
let RESOLVING: Promise<string | null> | null = null;

async function testUrl(url: string, timeoutMs = 6000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const j = await res.json().catch(() => null);
    return j?.status === 'ok';
  } catch { return false; }
}

async function resolveBackend(): Promise<string | null> {
  if (ACTIVE_BACKEND) return ACTIVE_BACKEND;
  if (RESOLVING) return RESOLVING;
  RESOLVING = (async () => {
    for (const url of ALL_URLS) {
      if (await testUrl(url)) {
        ACTIVE_BACKEND = url;
        return url;
      }
    }
    return null;
  })();
  const out = await RESOLVING;
  RESOLVING = null;
  return out;
}

export function getActiveBackend(): string | null { return ACTIVE_BACKEND; }
export function getConfiguredBackends(): string[] { return ALL_URLS; }
export async function forceResolveBackend(): Promise<{ ok: boolean; active: string | null; tested: { url: string; ok: boolean }[] }> {
  ACTIVE_BACKEND = null;
  RESOLVING = null;
  const results: { url: string; ok: boolean }[] = [];
  for (const url of ALL_URLS) {
    const ok = await testUrl(url);
    results.push({ url, ok });
    if (ok && !ACTIVE_BACKEND) ACTIVE_BACKEND = url;
  }
  return { ok: !!ACTIVE_BACKEND, active: ACTIVE_BACKEND, tested: results };
}

function normalizeNetworkError(err: any, backend: string | null): Error {
  const msg = String(err?.message || err || '');
  if (/network request failed|failed to fetch|typeerror.*network|abort/i.test(msg)) {
    const url = backend || 'yapılandırılmamış';
    return new Error(
      `Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.\nBackend: ${url}\nAyarlar → Bağlantıyı Test Et üzerinden diagnostik yapabilirsiniz.`
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

async function post<T>(path: string, body: any, timeout = 60000): Promise<T> {
  const backend = await resolveBackend();
  if (!backend) {
    throw new Error(
      `Hiçbir backend'e ulaşılamıyor.\nDenendi: ${ALL_URLS.join(', ')}\nİnternet bağlantınızı kontrol edin.`
    );
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${backend}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text }; }
    if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
    return data as T;
  } catch (err) {
    // On network error, invalidate cached backend so next call retries fallbacks
    if (String((err as any)?.message || '').match(/network request failed|failed to fetch|abort/i)) {
      ACTIVE_BACKEND = null;
    }
    throw normalizeNetworkError(err, backend);
  } finally {
    clearTimeout(id);
  }
}

async function get<T>(path: string, timeout = 30000): Promise<T> {
  const backend = await resolveBackend();
  if (!backend) {
    throw new Error(
      `Hiçbir backend'e ulaşılamıyor.\nDenendi: ${ALL_URLS.join(', ')}\nİnternet bağlantınızı kontrol edin.`
    );
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${backend}/api${path}`, { signal: controller.signal });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text }; }
    if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
    return data as T;
  } catch (err) {
    if (String((err as any)?.message || '').match(/network request failed|failed to fetch|abort/i)) {
      ACTIVE_BACKEND = null;
    }
    throw normalizeNetworkError(err, backend);
  } finally {
    clearTimeout(id);
  }
}

export const api = {
  // M3U
  parseM3UFromUrl: (url: string) =>
    post<{ success: boolean; count: number; channels: Channel[] }>('/m3u/parse-url', { url }, 90000),
  parseM3UFromContent: (content: string) =>
    post<{ success: boolean; count: number; channels: Channel[] }>('/m3u/parse-content', { content }, 60000),

  // Xtream
  xtreamLogin: (server: string, username: string, password: string) =>
    post<{ success: boolean; user_info: AccountInfo; server_info: any }>('/xtream/login', { server, username, password }),
  xtreamLoad: (server: string, username: string, password: string) =>
    post<{ success: boolean; count: number; channels: Channel[] }>('/xtream/load', { server, username, password }, 120000),
  xtreamVod: (server: string, username: string, password: string) =>
    post<{ success: boolean; count: number; items: VodItem[] }>('/xtream/vod', { server, username, password }, 120000),
  xtreamVodInfo: (server: string, username: string, password: string, vod_id: string) =>
    post<{ success: boolean; info: any; movie_data: any }>('/xtream/vod-info', { server, username, password, vod_id }, 30000),
  xtreamSeries: (server: string, username: string, password: string) =>
    post<{ success: boolean; count: number; items: SeriesItem[] }>('/xtream/series', { server, username, password }, 120000),
  xtreamSeriesInfo: (server: string, username: string, password: string, series_id: string) =>
    post<{ success: boolean; info: any; seasons: { season: string; episodes: any[] }[] }>(
      '/xtream/series-info', { server, username, password, series_id }, 60000),
  xtreamCatchupEpg: (server: string, username: string, password: string, stream_id: string, limit = 100) =>
    post<{ success: boolean; programs: any[] }>('/xtream/catchup-epg', { server, username, password, stream_id, limit }, 30000),

  // Stalker (MAG)
  stalkerLogin: (portal: string, mac: string, serial?: string) =>
    post<{ success: boolean; token: string; profile: any }>('/stalker/login', { portal, mac, serial }, 45000),
  stalkerLoad: (portal: string, mac: string, serial?: string) =>
    post<{ success: boolean; count: number; channels: Channel[]; token: string }>('/stalker/load', { portal, mac, serial }, 120000),

  // EPG
  fetchEpg: (url: string, playlistId: string) =>
    post<{ success: boolean; programs: number }>('/epg/fetch', { url, playlist_id: playlistId }, 180000),
  epgNowNext: (playlistId: string, channels: string[]) =>
    get<{ success: boolean; data: Record<string, { now: any; next: any }> }>(
      `/epg/now-next?playlist_id=${encodeURIComponent(playlistId)}&channels=${encodeURIComponent(channels.join(','))}`
    ),
  epgForChannel: (playlistId: string, channel: string, limit = 50) =>
    get<{ success: boolean; programs: any[] }>(
      `/epg/channel?playlist_id=${encodeURIComponent(playlistId)}&channel=${encodeURIComponent(channel)}&limit=${limit}`
    ),

  // DVR
  dvrSchedule: (data: any) =>
    post<{ success: boolean; recording: any }>('/dvr/schedule', data),
  dvrList: (playlist_id: string) =>
    get<{ success: boolean; recordings: any[] }>(`/dvr/schedules?playlist_id=${encodeURIComponent(playlist_id)}`),
  dvrDelete: async (rec_id: string) => {
    const backend = await resolveBackend();
    if (!backend) throw new Error('Backend URL yok');
    return fetch(`${backend}/api/dvr/schedule/${encodeURIComponent(rec_id)}`, { method: 'DELETE' })
      .then(r => r.json());
  },

  health: () => get<{ status: string }>(`/health`),
};
