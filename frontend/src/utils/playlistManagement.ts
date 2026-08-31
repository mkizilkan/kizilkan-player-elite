import type { Playlist } from '@/src/types';

export type PlaylistSortMode =
  | 'manual'
  | 'name_asc'
  | 'name_desc'
  | 'created_desc'
  | 'created_asc'
  | 'last_used_desc'
  | 'last_refresh_desc'
  | 'total_desc'
  | 'live_desc'
  | 'vod_desc'
  | 'series_desc'
  | 'max_users_desc'
  | 'max_users_asc'
  | 'expiry_asc'
  | 'expiry_desc';

export interface PlaylistSortPreferences {
  mode: PlaylistSortMode;
  pinnedFirst: boolean;
}

export const DEFAULT_PLAYLIST_SORT: PlaylistSortPreferences = { mode: 'manual', pinnedFirst: true };

export const PLAYLIST_SORT_LABELS: Record<PlaylistSortMode, string> = {
  manual: 'Özel sıram',
  name_asc: 'Ad A → Z',
  name_desc: 'Ad Z → A',
  created_desc: 'Yeni eklenen',
  created_asc: 'Eski eklenen',
  last_used_desc: 'Son kullanılan',
  last_refresh_desc: 'Son güncellenen',
  total_desc: 'Toplam içerik',
  live_desc: 'Canlı sayısı',
  vod_desc: 'Film sayısı',
  series_desc: 'Dizi sayısı',
  max_users_desc: 'Maks. kullanıcı çok → az',
  max_users_asc: 'Maks. kullanıcı az → çok',
  expiry_asc: 'Kalan gün az → çok',
  expiry_desc: 'Kalan gün çok → az',
};

const count = (p: Playlist, kind: 'channels'|'vod'|'series') => {
  if (kind === 'channels') return Number(p.channelsCount ?? p.channels?.length ?? 0);
  if (kind === 'vod') return Number(p.vodCount ?? p.vod?.length ?? 0);
  return Number(p.seriesCount ?? p.series?.length ?? 0);
};
export const playlistTotalCount = (p: Playlist) => count(p,'channels') + count(p,'vod') + count(p,'series');

export function playlistMaxUsers(p: Playlist): number | null {
  const raw = p.accountInfo?.max_connections;
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseEpochLike(value?: string | null): number | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || raw === '0' || raw.toLowerCase() === 'null') return null;
  if (/^\d{9,13}$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return raw.length >= 12 ? n : n * 1000;
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

export function playlistExpiryMs(p: Playlist): number | null {
  return parseEpochLike(p.accountInfo?.exp_date) ?? parseEpochLike(p.accountInfo?.tariff_expired_date);
}

export function playlistRemainingDays(p: Playlist, now = Date.now()): number | null {
  const exp = playlistExpiryMs(p);
  if (exp == null) return null;
  return Math.ceil((exp - now) / 86400000);
}

export function sortPlaylists(input: Playlist[], pref: PlaylistSortPreferences): Playlist[] {
  const rows = [...input];
  const cmpText = (a:string,b:string) => a.localeCompare(b, 'tr', { sensitivity:'base', numeric:true });
  const time = (v?:string) => v ? (Date.parse(v) || 0) : 0;
  const valueCmp = (a: Playlist, b: Playlist): number => {
    switch(pref.mode){
      case 'name_asc': return cmpText(a.name || '', b.name || '');
      case 'name_desc': return cmpText(b.name || '', a.name || '');
      case 'created_asc': return time(a.createdAt) - time(b.createdAt);
      case 'created_desc': return time(b.createdAt) - time(a.createdAt);
      case 'last_used_desc': return time(b.lastUsedAt) - time(a.lastUsedAt);
      case 'last_refresh_desc': return time(b.lastRefreshedAt) - time(a.lastRefreshedAt);
      case 'total_desc': return playlistTotalCount(b) - playlistTotalCount(a);
      case 'live_desc': return count(b,'channels') - count(a,'channels');
      case 'vod_desc': return count(b,'vod') - count(a,'vod');
      case 'series_desc': return count(b,'series') - count(a,'series');
      case 'max_users_desc': { const av=Number(a.accountInfo?.max_connections),bv=Number(b.accountInfo?.max_connections); const aa=Number.isFinite(av)?av:-1,bb=Number.isFinite(bv)?bv:-1; return bb-aa; }
      case 'max_users_asc': { const av=Number(a.accountInfo?.max_connections),bv=Number(b.accountInfo?.max_connections); const aa=Number.isFinite(av)?av:Number.MAX_SAFE_INTEGER,bb=Number.isFinite(bv)?bv:Number.MAX_SAFE_INTEGER; return aa-bb; }
      case 'expiry_asc': {
        const av=playlistExpiryMs(a), bv=playlistExpiryMs(b);
        if(av==null&&bv==null)return 0; if(av==null)return 1; if(bv==null)return -1; return av-bv;
      }
      case 'expiry_desc': {
        const av=playlistExpiryMs(a), bv=playlistExpiryMs(b);
        if(av==null&&bv==null)return 0; if(av==null)return 1; if(bv==null)return -1; return bv-av;
      }
      case 'manual':
      default: return Number(a.manualOrder ?? Number.MAX_SAFE_INTEGER) - Number(b.manualOrder ?? Number.MAX_SAFE_INTEGER);
    }
  };
  rows.sort((a,b)=>{
    if(pref.pinnedFirst && !!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const c=valueCmp(a,b);
    if(c) return c;
    return time(a.createdAt)-time(b.createdAt) || cmpText(a.name||'',b.name||'');
  });
  return rows;
}

export function normalizeIdentityUrl(value?: string): string {
  if(!value) return '';
  try {
    const u=new URL(value.trim());
    u.hash='';
    u.hostname=u.hostname.toLowerCase();
    if((u.protocol==='http:'&&u.port==='80')||(u.protocol==='https:'&&u.port==='443'))u.port='';
    u.pathname=u.pathname.replace(/\/{2,}/g,'/').replace(/\/$/,'');
    return u.toString().replace(/\/$/,'');
  } catch { return value.trim().replace(/\/+$/,'').toLowerCase(); }
}

/** Credential değerini dışarı döndürmez; yalnız karşılaştırma için process-içi canonical identity. */
export function playlistIdentityCanonical(p: Partial<Playlist>): string {
  switch(p.source){
    case 'xtream': return `xtream\u0000${normalizeIdentityUrl(p.xtreamServer)}\u0000${String(p.xtreamUsername||'').trim()}`;
    case 'stalker': return `stalker\u0000${normalizeIdentityUrl(p.stalkerPortal)}\u0000${String(p.stalkerMac||'').replace(/[^0-9a-f]/gi,'').toUpperCase()}`;
    case 'm3u_url': return `m3u_url\u0000${normalizeIdentityUrl(p.m3uUrl)}`;
    case 'm3u_file': return `m3u_file\u0000${String(p.id||'')}`;
    default: return `${String(p.source||'')}\u0000${String(p.id||'')}`;
  }
}
