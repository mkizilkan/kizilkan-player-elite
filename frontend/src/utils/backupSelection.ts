import type { BackupPayload } from './backup';

export type BackupListEntry = {
  key: string;
  profileId: string;
  profileName: string;
  id: string;
  name: string;
  source: string;
  channels: number;
  vod: number;
  series: number;
  metadata: Record<string, any>;
};
export type SelectedRestoreItem = { sourceId: string; targetId: string; metadata: Record<string, any> };
export type SelectedRestorePlan = { profileId: string; items: SelectedRestoreItem[]; metadata: Record<string, any>[]; activeId: string | null };

function array(raw: unknown, label: string): any[] {
  if (!raw) return [];
  let value: unknown;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new Error(`${label} bozuk.`); }
  if (!Array.isArray(value)) throw new Error(`${label} liste biçiminde değil.`);
  return value;
}
function count(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
function compact(meta: Record<string, any>): Record<string, any> {
  const { channels, vod, series, ...rest } = meta;
  return { ...rest, channelsCount: count(rest.channelsCount ?? channels?.length), vodCount: count(rest.vodCount ?? vod?.length), seriesCount: count(rest.seriesCount ?? series?.length) };
}

/** Only metadata is inspected; the full v3 catalogue is never hydrated for selection. */
export function inspectBackupLists(payload: BackupPayload): BackupListEntry[] {
  if (!payload?.data || typeof payload.data !== 'object') throw new Error('Yedek metadata alanı eksik.');
  const names = new Map(array(payload.data['kizilkan.profiles'], 'Profil bilgisi').map(p => [String(p?.id || ''), String(p?.name || 'Profil')]));
  const entries: BackupListEntry[] = [];
  const seen = new Set<string>();
  const add = (profileId: string, values: any[]) => {
    for (const value of values) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || !value.id) throw new Error('Yedekte liste kimliği eksik.');
      const id = String(value.id);
      if (id.startsWith('__kzb_')) throw new Error('Yedekte ayrılmış liste kimliği var.');
      const key = JSON.stringify([profileId, id]);
      if (seen.has(key)) throw new Error('Yedekte aynı liste birden fazla tanımlanmış.');
      seen.add(key);
      const metadata = compact({ ...value, id });
      entries.push({ key, profileId, profileName: names.get(profileId) || (profileId === 'default' ? 'Varsayılan' : 'Profil'), id,
        name: String(value.name || 'İsimsiz liste'), source: String(value.source || 'm3u_url'), channels: metadata.channelsCount,
        vod: metadata.vodCount, series: metadata.seriesCount, metadata });
    }
  };
  if (payload.playlists) {
    for (const [pid, bundle] of Object.entries(payload.playlists.profiles || {})) {
      const values = array(bundle.metadata || payload.data[`kizilkan.playlists.meta.${pid}`], 'Liste bilgisi');
      const actual = new Set(values.map(v => String(v?.id || '')));
      const declared = new Set((bundle.playlistIds || []).map(String));
      if (actual.size !== declared.size || [...actual].some(id => !declared.has(id))) throw new Error('Yedek liste kimlikleri ile metadata uyuşmuyor.');
      add(pid, values);
    }
  } else {
    for (const [key, raw] of Object.entries(payload.data)) if (key.startsWith('kizilkan.playlists.meta.')) add(key.slice('kizilkan.playlists.meta.'.length), array(raw, 'Liste bilgisi'));
    if (!entries.length && payload.data['kizilkan.playlists']) {
      const pid = payload.data['kizilkan.activeProfileId'] || String(names.keys().next().value || 'default');
      if(typeof pid!=='string')throw new Error('Yedekte aktif profil kimliği geçersiz.');
      add(pid, array(payload.data['kizilkan.playlists'], 'Eski liste bilgisi'));
    }
  }
  return entries;
}

function identity(meta: Record<string, any>): string {
  return JSON.stringify([meta.source, meta.m3uUrl || '', meta.xtreamServer || '', meta.xtreamUsername || '', meta.xtreamPassword || '', meta.stalkerPortal || '', meta.stalkerMac || '']);
}

/** Selected lists merge into one explicitly chosen existing profile; other profiles stay untouched. */
export function planSelectedRestore(payload: BackupPayload, selectedKeys: string[], current: BackupPayload, profileId: string, sessionId: string, reservedIds: string[] = []): SelectedRestorePlan {
  const all = inspectBackupLists(payload);
  const selected = new Set(selectedKeys);
  if (!selected.size || [...selected].some(key => !all.some(e => e.key === key))) throw new Error('Geri yüklenecek liste seçimi geçersiz.');
  const profiles = array(current.data['kizilkan.profiles'], 'Mevcut profil bilgisi');
  if (!profiles.some(p => String(p.id) === profileId)) throw new Error('Hedef profil artık mevcut değil.');
  const existing = inspectBackupLists(current);
  const metadata = array(current.data[`kizilkan.playlists.meta.${profileId}`] || current.playlists?.profiles[profileId]?.metadata, 'Mevcut liste bilgisi').map(v => ({ ...v }));
  const reserved = new Set([...existing.map(e => e.id), ...reservedIds]);
  const sourceTargets = new Map<string, string>();
  const items: SelectedRestoreItem[] = [];
  let suffix = 0;
  for (const entry of all.filter(e => selected.has(e.key))) {
    if (sourceTargets.has(entry.id)) continue;
    let targetId = entry.id;
    const owned = metadata.find(v => String(v.id) === targetId);
    const sharedElsewhere = existing.some(e => e.id === targetId && e.profileId !== profileId);
    if (reserved.has(targetId) && (!owned || sharedElsewhere || identity(owned) !== identity(entry.metadata))) {
      do { targetId = `restored-${sessionId}-${++suffix}`; } while (reserved.has(targetId));
    }
    reserved.add(targetId); sourceTargets.set(entry.id, targetId);
    const oldIndex = metadata.findIndex(v => String(v.id) === targetId);
    const next = { ...entry.metadata, id: targetId, manualOrder: oldIndex >= 0 ? metadata[oldIndex].manualOrder : metadata.reduce((max, v) => Math.max(max, Number(v.manualOrder ?? -1)), -1) + 1 };
    if (oldIndex >= 0) metadata[oldIndex] = next; else metadata.push(next);
    items.push({ sourceId: entry.id, targetId, metadata: next });
  }
  const previousActive = current.data[`kizilkan.activePlaylistId.${profileId}`];
  return { profileId, items, metadata, activeId: typeof previousActive==='string' && previousActive && metadata.some(v => v.id === previousActive) ? previousActive : metadata[0]?.id || null };
}
