import { storage } from '@/src/utils/storage';
import { bigStore } from '@/src/utils/storage/bigStore';

/**
 * GPT KIZILKAN Player — Backup v2
 *
 * PlaylistContext v2 stores playlist metadata in AsyncStorage but the heavy
 * channels/vod/series arrays in bigStore files. The old v1 backup only read the
 * obsolete `kizilkan.playlists` key, so modern profile-scoped playlists were
 * silently omitted. v2 backs up BOTH layers and verifies them before reporting
 * success.
 */

const BASE_KEYS = [
  'kizilkan.theme',
  'kizilkan.parental',
  'kizilkan.profiles',
  'kizilkan.activeProfileId',
  'kizilkan.profileSetupDone',
  'kizilkan.recoveryCode',
  'kizilkan.tv.layout',
  'kizilkan.tv.preview',
  'kizilkan.tvMode',
  'kizilkan.download.target',
  'kizilkan.downloads.v1',
  'kizilkan.player.engine',
  'kizilkan.player.hwaccel',
  'kizilkan.player.surface',
  'kizilkan.player.buffer',
  'kizilkan.player.audioDelay',
  'kizilkan.codeSource.baseUrl',
  // Legacy/global keys are kept for backward migration compatibility.
  'kizilkan.playlists',
  'kizilkan.playlists.meta',
  'kizilkan.activePlaylistId',
  'kizilkan.playlists.migratedTo',
];

const PROFILE_PREFIXED = [
  'kizilkan.favorites.',
  'kizilkan.recent.',
  'kizilkan.searchHistory.',
  'kizilkan.watchlist.',
];

const metaKey = (pid: string) => `kizilkan.playlists.meta.${pid}`;
const activeKey = (pid: string) => `kizilkan.activePlaylistId.${pid}`;

type PlaylistHeavy = { channels: any[]; vod: any[]; series: any[] };

type PlaylistProfileBackup = {
  /** Exact serialized PlaylistMeta[] value used by PlaylistContext. */
  metadata: string;
  activeId?: string;
  playlistIds: string[];
};

export interface BackupPlaylistBundle {
  profiles: Record<string, PlaylistProfileBackup>;
  heavy: Record<string, PlaylistHeavy>;
}

export interface BackupSummary {
  profiles: number;
  playlists: number;
  heavyPlaylists: number;
  settings: number;
  warnings: string[];
}

export interface BackupPayload {
  version: string;
  createdAt: string;
  appName: string;
  data: Record<string, string>;
  playlists?: BackupPlaylistBundle;
  summary?: BackupSummary;
}

export interface RestoreResult {
  restored: number;
  profiles: number;
  playlists: number;
  heavyPlaylists: number;
  warnings: string[];
}

function parseArray(raw: string): any[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getProfileIds(): Promise<string[]> {
  const ids = new Set<string>(['default']);
  const rawProfiles = await storage.getItem<string>('kizilkan.profiles', '');
  for (const p of parseArray(rawProfiles || '')) {
    if (p?.id) ids.add(String(p.id));
  }
  return Array.from(ids);
}

async function collectKey(data: Record<string, string>, key: string): Promise<void> {
  const value = await storage.getItem<string>(key, '');
  if (value) data[key] = value;
}

export async function createBackup(): Promise<BackupPayload> {
  const data: Record<string, string> = {};
  const warnings: string[] = [];

  for (const key of BASE_KEYS) await collectKey(data, key);

  const profileIds = await getProfileIds();
  const playlistProfiles: Record<string, PlaylistProfileBackup> = {};
  const heavy: Record<string, PlaylistHeavy> = {};
  const uniquePlaylistIds = new Set<string>();

  for (const pid of profileIds) {
    for (const prefix of PROFILE_PREFIXED) {
      await collectKey(data, prefix + pid);
    }

    const mk = metaKey(pid);
    const ak = activeKey(pid);
    const metadata = (await storage.getItem<string>(mk, '')) || '';
    const activeId = (await storage.getItem<string>(ak, '')) || '';

    // Preserve the actual storage keys as well; this makes v2 easy to inspect
    // and keeps restore compatible with PlaylistContext's exact schema.
    if (metadata) data[mk] = metadata;
    if (activeId) data[ak] = activeId;

    const metas = parseArray(metadata);
    const playlistIds = metas
      .map((m: any) => String(m?.id || '').trim())
      .filter(Boolean);

    playlistProfiles[pid] = {
      metadata,
      ...(activeId ? { activeId } : {}),
      playlistIds,
    };

    for (const id of playlistIds) {
      uniquePlaylistIds.add(id);
      if (heavy[id]) continue;

      const exists = await bigStore.exists(id);
      if (!exists) {
        warnings.push(`Playlist ağır verisi bulunamadı: ${id}`);
        continue;
      }

      const value = await bigStore.read<PlaylistHeavy>(id, {
        channels: [], vod: [], series: [],
      });
      heavy[id] = {
        channels: Array.isArray(value?.channels) ? value.channels : [],
        vod: Array.isArray(value?.vod) ? value.vod : [],
        series: Array.isArray(value?.series) ? value.series : [],
      };
    }
  }

  // Critical correctness gate: never claim a complete backup if metadata says
  // playlists exist but their heavy files were silently omitted.
  if (uniquePlaylistIds.size > 0 && Object.keys(heavy).length !== uniquePlaylistIds.size) {
    throw new Error(
      `Playlist yedeği eksik: ${uniquePlaylistIds.size} listeden ` +
      `${Object.keys(heavy).length} tanesinin kanal/film/dizi verisi okunabildi. ` +
      `Yedek oluşturulmadı; cihaz depolamasını kontrol edin.`
    );
  }

  const summary: BackupSummary = {
    profiles: profileIds.filter(id => id !== 'default').length,
    playlists: uniquePlaylistIds.size,
    heavyPlaylists: Object.keys(heavy).length,
    settings: Object.keys(data).length,
    warnings,
  };

  return {
    version: '2.0',
    createdAt: new Date().toISOString(),
    appName: 'KIZILKAN PLAYER ELITE',
    data,
    playlists: { profiles: playlistProfiles, heavy },
    summary,
  };
}

async function clearCurrentPlaylistState(profileIds: string[]): Promise<void> {
  const ids = new Set<string>();
  for (const pid of profileIds) {
    const raw = (await storage.getItem<string>(metaKey(pid), '')) || '';
    for (const meta of parseArray(raw)) {
      if (meta?.id) ids.add(String(meta.id));
    }
    await storage.removeItem(metaKey(pid));
    await storage.removeItem(activeKey(pid));
  }
  for (const id of ids) await bigStore.remove(id);
}

export function isKizilkanBackup(payload: any): boolean {
  return payload?.appName === 'KIZILKAN PLAYER' || payload?.appName === 'GPT KIZILKAN PLAYER' || payload?.appName === 'KIZILKAN PLAYER ELITE';
}

export async function restoreBackup(payload: BackupPayload): Promise<RestoreResult> {
  if (!payload?.data || typeof payload.data !== 'object') {
    throw new Error('Geçersiz yedek dosyası');
  }
  if (!isKizilkanBackup(payload)) {
    throw new Error('Bu bir KIZILKAN PLAYER ELITE yedek dosyası değil');
  }

  let restored = 0;
  let restoredHeavy = 0;
  const warnings: string[] = [];

  const incomingProfiles = parseArray(payload.data['kizilkan.profiles'] || '');
  const incomingProfileIds = new Set<string>(['default']);
  for (const p of incomingProfiles) if (p?.id) incomingProfileIds.add(String(p.id));

  const currentProfileIds = await getProfileIds();

  // v2 backup is an exact playlist snapshot. Clear only playlist state before
  // restoring so stale lists cannot survive beside the backup contents.
  if (payload.playlists) {
    const allProfileIds = new Set<string>([
      ...currentProfileIds,
      ...incomingProfileIds,
      ...Object.keys(payload.playlists.profiles || {}),
    ]);
    await clearCurrentPlaylistState(Array.from(allProfileIds));
  }

  for (const [key, value] of Object.entries(payload.data)) {
    if (typeof value !== 'string') continue;
    if (!key.startsWith('kizilkan.')) continue;
    const ok = await storage.setItem(key, value);
    if (!ok) throw new Error(`Yedek geri yüklenirken kayıt yazılamadı: ${key}`);
    restored++;
  }

  if (payload.playlists) {
    for (const [id, heavy] of Object.entries(payload.playlists.heavy || {})) {
      const ok = await bigStore.write(id, {
        channels: Array.isArray(heavy?.channels) ? heavy.channels : [],
        vod: Array.isArray(heavy?.vod) ? heavy.vod : [],
        series: Array.isArray(heavy?.series) ? heavy.series : [],
      });
      if (!ok) throw new Error(`Playlist içeriği geri yüklenemedi: ${id}`);
      restoredHeavy++;
    }

    const expectedIds = new Set<string>();
    for (const profile of Object.values(payload.playlists.profiles || {})) {
      for (const id of profile.playlistIds || []) expectedIds.add(id);
    }
    if (restoredHeavy !== expectedIds.size) {
      throw new Error(
        `Playlist geri yükleme eksik: ${expectedIds.size} listeden ${restoredHeavy} ağır veri dosyası yazıldı.`
      );
    }
  } else {
    // Old v1 backup: it can restore profiles/favorites/settings, but modern
    // profile-scoped playlist files were never included in that format.
    const hasLegacyPlaylist = !!payload.data['kizilkan.playlists'];
    if (!hasLegacyPlaylist) {
      warnings.push('Bu eski yedek dosyasında playlist hesapları/içerikleri bulunmuyor. Profil ve diğer ayarlar geri yüklendi.');
    }
  }

  return {
    restored,
    profiles: incomingProfiles.length,
    playlists: payload.playlists
      ? new Set(Object.values(payload.playlists.profiles).flatMap(p => p.playlistIds || [])).size
      : (payload.data['kizilkan.playlists'] ? parseArray(payload.data['kizilkan.playlists']).length : 0),
    heavyPlaylists: restoredHeavy,
    warnings,
  };
}
