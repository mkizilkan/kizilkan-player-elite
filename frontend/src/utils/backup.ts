import { storage } from '@/src/utils/storage';
import type { StorageItemValue } from './storage/storage-base';
import { bigStore } from '@/src/utils/storage/bigStore';
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';
import { inspectBackupLists, planSelectedRestore, type SelectedRestorePlan } from './backupSelection';
import { backupRestoreSessionId, backupRestoreStageId, commitSelectedPlaylistRestore, commitBackupRestoreTransaction, type BackupHeavy, type RestoreMetadataPatch, type RestoreMapping } from './backupRestoreTransaction';
export { inspectBackupLists } from './backupSelection';
export type { BackupListEntry } from './backupSelection';

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
  'kizilkan.player.autoNext.',
  'kizilkan.favorites.',
  'kizilkan.recent.',
  'kizilkan.searchHistory.',
  'kizilkan.watchlist.',
  'kizilkan.progress.',
  'kizilkan.hiddenItems.',
  'kizilkan.hiddenGroups.',
  'kizilkan.watched.',
  'kizilkan.seriesLast.',
  'kizilkan.player.startLast.',
  'kizilkan.libraryLegacyOwner.',
];

const metaKey = (pid: string) => `kizilkan.playlists.meta.${pid}`;
const activeKey = (pid: string) => `kizilkan.activePlaylistId.${pid}`;

type PlaylistHeavy = { channels: any[]; vod: any[]; series: any[] };

export type PlaylistProfileBackup = {
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
  data: Record<string, StorageItemValue>;
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

function parseArray(raw: unknown): any[] {
  if (!raw) return [];
  if(typeof raw!=='string')throw new Error('Yedek liste kaydı metin biçiminde değil.');
  try {
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed))throw new Error('Yedek liste kaydı dizi biçiminde değil.');return parsed;
  } catch {
    throw new Error('Yedek liste kaydı bozuk; mevcut veri korunuyor.');
  }
}

async function getProfileIds(): Promise<string[]> {
  const ids = new Set<string>(['default']);
  const rawProfiles = await storage.getItemStrict<string>('kizilkan.profiles', '');
  for (const p of parseArray(rawProfiles || '')) {
    if (p?.id) ids.add(String(p.id));
  }
  return Array.from(ids);
}

async function collectKey(data: BackupPayload['data'], key: string): Promise<void> {
  const value = await storage.getItemStrict<StorageItemValue>(key, null);
  if (value !== null) data[key] = value;
}

export type BackupScope = 'quick' | 'personal' | 'full';

const PLAYLIST_BASE_KEYS = new Set([
  'kizilkan.playlists', 'kizilkan.playlists.meta', 'kizilkan.activePlaylistId', 'kizilkan.playlists.migratedTo',
]);

/** v15.2.13: Ağır katalogları JS belleğine almadan küçük/stream yedek başlığı üretir. */
export async function createBackupMetadata(scope: BackupScope = 'quick'): Promise<BackupPayload> {
  const data: BackupPayload['data'] = {};
  const warnings: string[] = [];
  const includePlaylists = scope !== 'personal';

  for (const key of BASE_KEYS) {
    if (key === 'kizilkan.playlists') continue; // eski monolitik heavy JSON yeni yedeği tekrar şişirmesin
    if (!includePlaylists && PLAYLIST_BASE_KEYS.has(key)) continue;
    await collectKey(data, key);
  }

  const profileIds = await getProfileIds();
  const playlistProfiles: Record<string, PlaylistProfileBackup> = {};
  const uniquePlaylistIds = new Set<string>();
  for (const pid of profileIds) {
    for (const prefix of PROFILE_PREFIXED) await collectKey(data, prefix + pid);
    if (!includePlaylists) continue;
    const mk = metaKey(pid); const ak = activeKey(pid);
    const metadata = (await storage.getItemStrict<string>(mk, '')) || '';
    const activeId = (await storage.getItemStrict<string>(ak, '')) || '';
    if (metadata) data[mk] = metadata;
    if (activeId) data[ak] = activeId;
    const playlistIds = parseArray(metadata).map((m:any)=>String(m?.id || '').trim()).filter(Boolean);
    playlistProfiles[pid] = { metadata, ...(activeId ? { activeId } : {}), playlistIds };
    playlistIds.forEach(id => uniquePlaylistIds.add(id));
  }
  return {
    version: scope === 'full' ? '3.0-meta' : '2.1',
    createdAt: new Date().toISOString(), appName: 'KIZILKAN PLAYER ELITE', data,
    ...(includePlaylists ? { playlists: { profiles: playlistProfiles, heavy: {} } } : {}),
    summary: { profiles: profileIds.filter(id=>id !== 'default').length, playlists: uniquePlaylistIds.size, heavyPlaylists: 0, settings: Object.keys(data).length, warnings },
  };
}

export function backupPlaylistIds(payload: BackupPayload): string[] {
  const out = new Set<string>();
  for (const profile of Object.values(payload.playlists?.profiles || {})) for (const id of profile.playlistIds || []) out.add(id);
  return Array.from(out);
}

export type SelectedBackupRestoreOptions = { selectedKeys: string[]; targetProfileId: string; authorizedProfileId?: string; signal?: AbortSignal; onProgress?: (message: string) => void };

export async function prepareSelectedBackupRestore(payload: BackupPayload, opts: SelectedBackupRestoreOptions, sessionId: string): Promise<SelectedRestorePlan> {
  if (!isKizilkanBackup(payload)) throw new Error('Bu bir KIZILKAN PLAYER ELITE yedek dosyası değil.');
  const current = await createBackupMetadata('quick');
  const targetProfile = parseArray(current.data['kizilkan.profiles'] || '').find(profile => String(profile.id) === opts.targetProfileId);
  if (targetProfile?.hasPin && opts.authorizedProfileId !== opts.targetProfileId) throw new Error('PIN korumalı hedef profile önce giriş yapın.');
  const inventory = KizilkanNativeCore.available ? await KizilkanNativeCore.getSnapshotInventory() : [];
  return planSelectedRestore(payload, opts.selectedKeys, current, opts.targetProfileId, sessionId, inventory.map(row => String(row.playlistId)));
}

export function setRestoredCatalogCounts(item: { metadata: Record<string, any> }, counts: { channels: number; vod: number; series: number }, indexed: boolean) {
  Object.assign(item.metadata, { channelsCount: counts.channels, vodCount: counts.vod, seriesCount: counts.series,
    catalogLocalState: counts.channels + counts.vod + counts.series ? 'ready' : 'empty', catalogExpectedCounts: counts,
    catalogRevision: Date.now(), catalogRecovery: { state: 'ready', completedAt: Date.now() },
    catalogSync: { roomVerified: indexed, initialSyncState: 'ready', updatedAt: new Date().toISOString() } });
}

/** Import selected definitions/catalogues into an existing profile without replacing settings or unselected lists. */
export async function restoreSelectedBackup(payload: BackupPayload, opts: SelectedBackupRestoreOptions): Promise<RestoreResult> {
  const sessionId = backupRestoreSessionId();
  const plan = await prepareSelectedBackupRestore(payload, opts, sessionId);
  const legacy = parseArray(payload.data['kizilkan.playlists'] || '');
  const heavyFor = (id: string): BackupHeavy | null => {
    const value = payload.playlists?.heavy?.[id] || legacy.find(value => String(value?.id) === id);
    if (!value) return null;
    if (!Array.isArray(value.channels) || !Array.isArray(value.vod || []) || !Array.isArray(value.series || [])) throw new Error('Yedek katalog dizileri bozuk.');
    return { channels: value.channels, vod: value.vod || [], series: value.series || [] };
  };
  const withCatalogue = plan.items.some(item => heavyFor(item.sourceId));
  if (withCatalogue && plan.items.some(item => !heavyFor(item.sourceId))) throw new Error('Seçilen listelerden birinin tam kataloğu yedekte eksik.');
  if (!withCatalogue && String(payload.version).startsWith('2.0') && payload.playlists) throw new Error('Tam JSON yedeğinde seçilen kataloglar bulunamadı.');
  await commitSelectedPlaylistRestore(plan, sessionId, async mappings => {
    for (let i = 0; i < plan.items.length; i++) {
      if (opts.signal?.aborted) throw new Error('Geri yükleme durduruldu.');
      const item = plan.items[i];
      opts.onProgress?.(`${i + 1}/${plan.items.length} · ${String(item.metadata.name || 'Liste')} hazırlanıyor`);
      if (withCatalogue) {
        const heavy = heavyFor(item.sourceId)!;
        if (!(await bigStore.write(mappings[i].stageId!, heavy))) throw new Error('Seçilen katalog staging alanına yazılamadı.');
        const expected = { channels: heavy.channels.length, vod: heavy.vod.length, series: heavy.series.length };
        if (KizilkanNativeCore.available) {
          const actual = await KizilkanNativeCore.getPlaylistSummaryVerified(mappings[i].stageId!);
          if (!actual?.roomIndexed || actual.channels !== expected.channels || actual.vod !== expected.vod || actual.series !== expected.series) throw new Error('Seçilen katalog kayıt sayısı doğrulanamadı.');
        }
        setRestoredCatalogCounts(item, expected, KizilkanNativeCore.available);
      } else {
        const summary = KizilkanNativeCore.available && await KizilkanNativeCore.hasPlaylistIndex(item.targetId) ? await KizilkanNativeCore.getPlaylistSummaryVerified(item.targetId) : null;
        const existing = !KizilkanNativeCore.available ? await bigStore.read<BackupHeavy | null>(item.targetId, null) : null;
        const expected = { channels: Number(item.metadata.channelsCount || 0), vod: Number(item.metadata.vodCount || 0), series: Number(item.metadata.seriesCount || 0) };
        const counts = { channels: Number(summary?.channels || existing?.channels.length || 0), vod: Number(summary?.vod || existing?.vod.length || 0), series: Number(summary?.series || existing?.series.length || 0) };
        Object.assign(item.metadata, { channelsCount: counts.channels, vodCount: counts.vod, seriesCount: counts.series, catalogExpectedCounts: expected,
          catalogLocalState: summary || existing ? counts.channels + counts.vod + counts.series ? 'ready' : 'empty' : 'missing' });
        delete item.metadata.catalogSync; delete item.metadata.catalogRecovery;
      }
    }
  }, { catalog: withCatalogue, signal: opts.signal });
  return { restored: 3, profiles: 0, playlists: plan.items.length, heavyPlaylists: withCatalogue ? plan.items.length : 0,
    warnings: withCatalogue ? [] : ['Hızlı yedekte katalog bulunmaz. Yeni eklenen listelerin içerikleri seçildiğinde kaynaktan alınır.'], };
}

export async function createBackup(): Promise<BackupPayload> {
  const data: BackupPayload['data'] = {};
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
    const metadata = (await storage.getItemStrict<string>(mk, '')) || '';
    const activeId = (await storage.getItemStrict<string>(ak, '')) || '';

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

export function isKizilkanBackup(payload: any): boolean {
  return payload?.appName === 'KIZILKAN PLAYER' || payload?.appName === 'GPT KIZILKAN PLAYER' || payload?.appName === 'KIZILKAN PLAYER ELITE';
}

/** Build an explicit KV patch so its previous values can be recovered after a process death. */
export async function buildBackupMetadataPatch(payload: BackupPayload, exact = false): Promise<RestoreMetadataPatch> {
  if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) throw new Error('Geçersiz yedek dosyası');
  if (!isKizilkanBackup(payload)) throw new Error('Bu bir KIZILKAN PLAYER ELITE yedek dosyası değil');
  for(const [key,value]of Object.entries(payload.data)){
    if(!(value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value))))throw new Error('Yedekte desteklenmeyen ayar değeri var.');
    if(['kizilkan.profiles','kizilkan.parental','kizilkan.playlists','kizilkan.playlists.meta','kizilkan.activeProfileId','kizilkan.activePlaylistId','kizilkan.recoveryCode'].includes(key)||key.startsWith('kizilkan.playlists.meta.')||key.startsWith('kizilkan.activePlaylistId.'))if(typeof value!=='string')throw new Error('Yedekte hesap veya kilit bilgisi yanlış biçimde.');
  }
  if(Object.prototype.hasOwnProperty.call(payload.data,'kizilkan.profiles')){
    const list=parseArray(payload.data['kizilkan.profiles']);
    if(list.some(p=>!p||typeof p!=='object'||Array.isArray(p)||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||(p.pin!==undefined&&p.pin!==null&&typeof p.pin!=='string'))||new Set(list.map(p=>p.id)).size!==list.length)throw new Error('Yedekte profil bilgisi geçersiz.');
  }
  if(Object.prototype.hasOwnProperty.call(payload.data,'kizilkan.parental')){
    let parental:any;try{parental=JSON.parse(String(payload.data['kizilkan.parental']));}catch{throw new Error('Yedekte ebeveyn bilgisi bozuk.');}
    if(!parental||typeof parental!=='object'||Array.isArray(parental)||typeof parental.enabled!=='boolean'||typeof parental.pin!=='string'||!Array.isArray(parental.lockedCategories)||parental.lockedCategories.some((g:unknown)=>typeof g!=='string'))throw new Error('Yedekte ebeveyn bilgisi geçersiz.');
  }
  if (payload.playlists) inspectBackupLists(payload);
  const profiles = new Set([...await getProfileIds(), 'default', ...parseArray(payload.data['kizilkan.profiles'] || '').map(p => String(p?.id || '')).filter(Boolean), ...Object.keys(payload.playlists?.profiles || {})]);
  const patch: RestoreMetadataPatch = {};
  if (exact) for (const key of BASE_KEYS) patch[key] = null;
  for (const pid of profiles) {
    if (exact) for (const prefix of PROFILE_PREFIXED) patch[prefix + pid] = null;
    if (exact || payload.playlists) { patch[metaKey(pid)] = null; patch[activeKey(pid)] = null; }
  }
  for (const [key, value] of Object.entries(payload.data)) {
    // A backup cannot replace the journal which protects its own application.
    if ((typeof value === 'string' || typeof value==='boolean' || (typeof value==='number'&&Number.isFinite(value))) && key.startsWith('kizilkan.') && key !== 'kizilkan.backup.restoreJournal.v1') patch[key] = value;
  }
  for (const [pid, profile] of Object.entries(payload.playlists?.profiles || {})) {
    patch[metaKey(pid)] = profile.metadata;
    patch[activeKey(pid)] = profile.activeId || null;
  }
  return patch;
}

export function backupRestoreResult(payload: BackupPayload, patch: RestoreMetadataPatch, heavyPlaylists = 0, warnings: string[] = []): RestoreResult {
  return { restored: Object.values(patch).filter(value => value !== null).length, profiles: parseArray(payload.data['kizilkan.profiles'] || '').length,
    playlists: payload.playlists ? backupPlaylistIds(payload).length : parseArray(payload.data['kizilkan.playlists'] || '').length, heavyPlaylists, warnings };
}

/** Update every profile reference to a shared catalogue using verified local counts. */
export function updateBackupCatalogCounts(payload: BackupPayload, patch: RestoreMetadataPatch, id: string, counts: { channels: number; vod: number; series: number }, local: 'ready' | 'empty' | 'missing') {
  for (const [pid, profile] of Object.entries(payload.playlists?.profiles || {})) {
    if (!profile.playlistIds.includes(id)) continue;
    const metas = parseArray(String(patch[metaKey(pid)] || profile.metadata));
    for (const metadata of metas) if (String(metadata.id) === id) {
      if (local === 'missing') {
        metadata.catalogExpectedCounts = { channels: Number(metadata.channelsCount || 0), vod: Number(metadata.vodCount || 0), series: Number(metadata.seriesCount || 0) };
        Object.assign(metadata, { channelsCount: 0, vodCount: 0, seriesCount: 0, catalogLocalState: 'missing' });
        delete metadata.catalogSync; delete metadata.catalogRecovery;
      } else setRestoredCatalogCounts({ metadata }, counts, KizilkanNativeCore.available);
    }
    patch[metaKey(pid)] = JSON.stringify(metas);
  }
}

/** Exact managed metadata replacement; catalogues are untouched, with a durable KV journal. */
export async function restoreBackupMetadataExact(payload: BackupPayload): Promise<RestoreResult> {
  const patch = await buildBackupMetadataPatch(payload, true);
  await commitBackupRestoreTransaction(backupRestoreSessionId(), [], () => patch, async () => {});
  return backupRestoreResult(payload, patch);
}

/** Legacy device restore semantics: replace playlist layout, merge incoming profile/settings keys. */
export async function restoreBackupMetadata(payload: BackupPayload, opts?: { preserveHeavy?: boolean; signal?: AbortSignal }): Promise<RestoreResult> {
  const patch = await buildBackupMetadataPatch(payload);
  const current = await createBackupMetadata('quick');
  const mappings = payload.playlists && !opts?.preserveHeavy ? [...new Set([...backupPlaylistIds(current), ...backupPlaylistIds(payload)])].map(targetId => ({ targetId, stageId: null })) : [];
  await commitBackupRestoreTransaction(backupRestoreSessionId(), mappings, () => patch, async () => {
    for (const id of backupPlaylistIds(payload)) {
      const summary = opts?.preserveHeavy && KizilkanNativeCore.available && await KizilkanNativeCore.hasPlaylistIndex(id) ? await KizilkanNativeCore.getPlaylistSummaryVerified(id) : null;
      const legacy = opts?.preserveHeavy && !KizilkanNativeCore.available ? await bigStore.read<BackupHeavy | null>(id, null) : null;
      const counts = { channels: Number(summary?.channels || legacy?.channels.length || 0), vod: Number(summary?.vod || legacy?.vod.length || 0), series: Number(summary?.series || legacy?.series.length || 0) };
      updateBackupCatalogCounts(payload, patch, id, counts, summary || legacy ? counts.channels + counts.vod + counts.series ? 'ready' : 'empty' : 'missing');
    }
  }, opts);
  return backupRestoreResult(payload, patch, 0, payload.playlists ? ['Hızlı yedek katalog içermez; listeler seçildiğinde içerikleri kaynaktan alınır.'] : []);
}

/** Full JSON device restore stages all incoming catalogue files before replacing live data. */
export async function restoreBackup(payload: BackupPayload, opts?: { signal?: AbortSignal }): Promise<RestoreResult> {
  const patch = await buildBackupMetadataPatch(payload);
  const current = await createBackupMetadata('quick');
  const incomingIds = new Set(backupPlaylistIds(payload));
  if (payload.playlists && (Object.keys(payload.playlists.heavy || {}).length !== incomingIds.size || [...incomingIds].some(id => !payload.playlists!.heavy[id]))) throw new Error('Playlist geri yükleme eksik: metadata/katalog seti uyuşmuyor.');
  const sessionId = backupRestoreSessionId();
  const mappings: RestoreMapping[] = payload.playlists ? [...new Set([...backupPlaylistIds(current), ...incomingIds])].map(targetId => ({ targetId, stageId: incomingIds.has(targetId) ? backupRestoreStageId(sessionId, targetId) : null })) : [];
  await commitBackupRestoreTransaction(sessionId, mappings, () => patch, async () => {
    for (const mapping of mappings) if (mapping.stageId) {
      if (opts?.signal?.aborted) throw new Error('Geri yükleme durduruldu.');
      const value = payload.playlists!.heavy[mapping.targetId];
      if (!Array.isArray(value.channels) || !Array.isArray(value.vod) || !Array.isArray(value.series)) throw new Error('Yedek katalog dizileri bozuk.');
      if (!(await bigStore.write(mapping.stageId, value))) throw new Error('Playlist staging yazılamadı.');
      const counts = { channels: value.channels.length, vod: value.vod.length, series: value.series.length };
      if (KizilkanNativeCore.available) {
        const actual = await KizilkanNativeCore.getPlaylistSummaryVerified(mapping.stageId);
        if (!actual?.roomIndexed || actual.channels !== counts.channels || actual.vod !== counts.vod || actual.series !== counts.series) throw new Error('Playlist staging kayıt sayısı doğrulanamadı.');
      }
      updateBackupCatalogCounts(payload, patch, mapping.targetId, counts, counts.channels + counts.vod + counts.series ? 'ready' : 'empty');
    }
  }, opts);
  return backupRestoreResult(payload, patch, incomingIds.size, !payload.playlists && !payload.data['kizilkan.playlists'] ? ['Bu eski yedek dosyasında playlist hesapları/içerikleri bulunmuyor. Profil ve diğer ayarlar geri yüklendi.'] : []);
}
