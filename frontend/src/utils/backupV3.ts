import { File, Paths } from 'expo-file-system';
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';
import { bigStore } from '@/src/utils/storage/bigStore';
import {
  backupPlaylistIds, createBackupMetadata, buildBackupMetadataPatch, backupRestoreResult, updateBackupCatalogCounts,
  prepareSelectedBackupRestore, setRestoredCatalogCounts, inspectBackupLists, isKizilkanBackup,
  type BackupPayload, type RestoreResult, type SelectedBackupRestoreOptions,
} from '@/src/utils/backup';
import { backupRestoreSessionId, backupRestoreStageId, commitSelectedPlaylistRestore, commitBackupRestoreTransaction } from './backupRestoreTransaction';

const MAGIC = 'KIZILKAN_BACKUP_V3';
const PAGE = 200;
const READ_CHUNK = 256 * 1024;

type Progress = { phase: string; current: number; total: number; message: string };
type ProgressFn = (p: Progress) => void;

function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Yedekleme kullanıcı tarafından durduruldu.');
}
function bytes(text: string): Uint8Array {
  if (typeof TextEncoder === 'undefined') throw new Error('Bu cihaz UTF-8 streaming yedeklemeyi desteklemiyor.');
  return new TextEncoder().encode(text);
}


export interface BackupV3ExportResult { uri: string; fileName: string; playlists: number; items: number; bytes: number; }

export async function exportFullBackupV3(opts?: { signal?: AbortSignal; onProgress?: ProgressFn }): Promise<BackupV3ExportResult> {
  const signal = opts?.signal; const onProgress = opts?.onProgress;
  aborted(signal);
  const meta = await createBackupMetadata('full');
  const ids = backupPlaylistIds(meta);
  const date = new Date().toISOString().replace(/[:.]/g,'-');
  const finalName = `kizilkan-player-elite-full-${date}.kzb`;
  const tmp = new File(Paths.cache, `${finalName}.part`);
  if (tmp.exists) tmp.delete();
  tmp.create();
  const handle = tmp.open();
  let itemCount = 0;
  const writeLine = (value:any) => handle.writeBytes(bytes(JSON.stringify(value) + '\n'));
  try {
    writeLine({ magic: MAGIC, version: 3, createdAt: new Date().toISOString(), metadata: meta });
    for (let pi=0; pi<ids.length; pi++) {
      aborted(signal);
      const id = ids[pi];
      writeLine({ type: 'playlist-start', playlistId: id });
      onProgress?.({ phase:'playlist', current:pi, total:ids.length, message:`Playlist ${pi+1}/${ids.length} hazırlanıyor` });
      for (const kind of ['live','vod','series'] as const) {
        if (KizilkanNativeCore.available) {
          let offset=0;
          while (true) {
            aborted(signal);
            const page = await KizilkanNativeCore.queryItems<any>(id, kind, { offset, limit: PAGE });
            if (page.items.length) { writeLine({ type:'chunk', playlistId:id, kind, items:page.items }); itemCount += page.items.length; }
            onProgress?.({ phase:kind, current:itemCount, total:0, message:`${pi+1}/${ids.length} · ${kind} · ${offset + page.items.length}/${page.total}` });
            if (!page.hasMore || !page.items.length) break;
            offset += page.items.length;
          }
        } else {
          const heavy = await bigStore.read<any>(id, { channels:[], vod:[], series:[] });
          const arr = kind === 'live' ? (heavy?.channels || []) : (heavy?.[kind] || []);
          for (let i=0;i<arr.length;i+=PAGE) {
            aborted(signal); const part=arr.slice(i,i+PAGE);
            writeLine({ type:'chunk', playlistId:id, kind, items:part }); itemCount += part.length;
          }
        }
      }
      writeLine({ type:'playlist-end', playlistId:id });
    }
    writeLine({ type:'end', playlists:ids.length, items:itemCount });
    handle.close();
    const final = new File(Paths.cache, finalName);
    if (final.exists) final.delete();
    tmp.move(final);
    return { uri: final.uri, fileName: finalName, playlists: ids.length, items: itemCount, bytes: final.size };
  } catch (e) {
    try { handle.close(); } catch {}
    try { if (tmp.exists) tmp.delete(); } catch {}
    throw e;
  }
}

async function readLines(file: File, onLine: (line:string)=>Promise<void>): Promise<void> {
  const h = file.open();
  if (typeof TextDecoder === 'undefined') throw new Error('Bu cihaz UTF-8 streaming yedeklemeyi desteklemiyor.');
  const decoder = new TextDecoder('utf-8');
  let carry = '';
  try {
    while ((h.offset ?? 0) < (h.size ?? file.size)) {
      const remaining = Math.max(0, (h.size ?? file.size) - (h.offset ?? 0));
      const chunk = h.readBytes(Math.min(READ_CHUNK, remaining));
      if (!chunk.length) break;
      carry += decoder.decode(chunk, { stream:true });
      let idx:number;
      while ((idx = carry.indexOf('\n')) >= 0) {
        const line = carry.slice(0, idx).trim(); carry = carry.slice(idx+1);
        if (line) await onLine(line);
      }
    }
    carry += decoder.decode();
    if (carry.trim()) await onLine(carry.trim());
  } finally { h.close(); }
}

/** Read just the metadata header for selection; no catalogue or live database writes. */
export async function previewFullBackupV3(asset: { uri: string; name?: string }): Promise<BackupPayload> {
  const file = new File(asset as any);
  const handle = file.open();
  if (typeof TextDecoder === 'undefined') { handle.close(); throw new Error('Bu cihaz UTF-8 yedek okumayı desteklemiyor.'); }
  const decoder = new TextDecoder('utf-8');
  let text = '';
  try {
    while ((handle.offset ?? 0) < (handle.size ?? file.size)) {
      const chunk = handle.readBytes(Math.min(READ_CHUNK, (handle.size ?? file.size) - (handle.offset ?? 0)));
      if (!chunk.length) break;
      text += decoder.decode(chunk, { stream: true });
      const newline = text.indexOf('\n');
      if (newline >= 0) { text = text.slice(0, newline); break; }
      if (text.length > 16 * 1024 * 1024) throw new Error('Yedek metadata başlığı izin verilen boyutu aşıyor.');
    }
    let header: any;
    try { header = JSON.parse(text.trim()); } catch { throw new Error('Tam yedek başlığı bozuk.'); }
    if (header?.magic !== MAGIC || header.version !== 3 || !isKizilkanBackup(header.metadata)) throw new Error('Bu geçerli bir KIZILKAN tam yedeği değil.');
    inspectBackupLists(header.metadata);
    return header.metadata;
  } finally { handle.close(); }
}

async function restoreSelectedFullBackupV3(asset: { uri: string; name?: string }, opts: SelectedBackupRestoreOptions & { onProgressDetail?: ProgressFn }): Promise<RestoreResult> {
  if (!KizilkanNativeCore.available) throw new Error('Tam v3 yedek geri yükleme Android Native Core gerektirir.');
  const metadata = await previewFullBackupV3(asset);
  const sessionId = backupRestoreSessionId();
  const plan = await prepareSelectedBackupRestore(metadata, opts, sessionId);
  const wanted = new Map(plan.items.map(item => [item.sourceId, item]));
  const declaredIds = new Set(backupPlaylistIds(metadata));
  const begun = new Set<string>(), finished = new Set<string>();
  const counts = new Map<string, number>();
  let headerSeen = false, endSeen = false, chunks = 0;
  await commitSelectedPlaylistRestore(plan, sessionId, async mappings => {
    const stages = new Map(plan.items.map((item, index) => [item.sourceId, mappings[index].stageId!]));
    await readLines(new File(asset as any), async line => {
      if (opts.signal?.aborted) throw new Error('Geri yükleme durduruldu.');
      let rec: any;
      try { rec = JSON.parse(line); } catch { throw new Error('Tam yedek satırı bozuk/eksik.'); }
      if (!headerSeen) {
        if (rec?.magic !== MAGIC || rec.version !== 3 || JSON.stringify(rec.metadata) !== JSON.stringify(metadata)) throw new Error('Yedek başlığı önizleme sonrası değişti.');
        headerSeen = true; return;
      }
      if (endSeen) throw new Error('Tam yedek son kaydından sonra veri var.');
      const id = String(rec.playlistId || '');
      if (rec.type === 'playlist-start') {
        if (!id || !declaredIds.has(id) || begun.has(id)) throw new Error('Tam yedek liste başlangıcı geçersiz.');
        begun.add(id); counts.set(id, 0);
        if (wanted.has(id) && !(await KizilkanNativeCore.beginChunkedPlaylistImport(stages.get(id)!))) throw new Error('Seçilen liste staging başlatılamadı.');
      } else if (rec.type === 'chunk') {
        if (!begun.has(id) || finished.has(id) || !['live', 'vod', 'series'].includes(rec.kind) || !Array.isArray(rec.items) || rec.items.some((item: any) => !item || typeof item !== 'object' || Array.isArray(item) || !item.id)) throw new Error('Tam yedek katalog parçası geçersiz.');
        counts.set(id, (counts.get(id) || 0) + rec.items.length);
        if (wanted.has(id)) {
          const written = await KizilkanNativeCore.appendPlaylistChunk(stages.get(id)!, rec.kind, JSON.stringify(rec.items));
          if (written !== rec.items.length) throw new Error('Seçilen katalog parçası eksik yazıldı.');
          chunks++;
          const message = `${String(wanted.get(id)!.metadata.name || 'Liste')} · ${rec.kind} · ${counts.get(id)} kayıt`;
          opts.onProgress?.(message); opts.onProgressDetail?.({ phase: 'restore-stage', current: chunks, total: 0, message });
        }
      } else if (rec.type === 'playlist-end') {
        if (!begun.has(id) || finished.has(id)) throw new Error('Tam yedek liste bitişi geçersiz.');
        if (wanted.has(id)) {
          const finishedSummary = await KizilkanNativeCore.finishChunkedPlaylistImport(stages.get(id)!);
          const summary = finishedSummary?.roomIndexed ? await KizilkanNativeCore.getPlaylistSummaryVerified(stages.get(id)!) : null;
          if (!summary?.roomIndexed || Number(summary.channels || 0) + Number(summary.vod || 0) + Number(summary.series || 0) !== counts.get(id)) throw new Error('Seçilen Room kataloğu doğrulanamadı.');
          setRestoredCatalogCounts(wanted.get(id)!, { channels: Number(summary.channels || 0), vod: Number(summary.vod || 0), series: Number(summary.series || 0) }, true);
        }
        finished.add(id);
      } else if (rec.type === 'end') {
        const total = [...counts.values()].reduce((a, b) => a + b, 0);
        if (!Number.isInteger(rec.playlists) || !Number.isInteger(rec.items) || rec.playlists !== finished.size || rec.items !== total) throw new Error('Tam yedek toplam sayaçları uyuşmuyor.');
        endSeen = true;
      } else throw new Error('Tam yedekte bilinmeyen kayıt tipi.');
    });
    if (!headerSeen || !endSeen || begun.size !== finished.size || declaredIds.size !== finished.size || [...declaredIds].some(id => !finished.has(id))) throw new Error('Tam yedek tamamlanmamış veya metadata/katalog seti uyuşmuyor.');
    opts.onProgress?.('Seçilen listeler doğrulandı; geri yükleniyor');
  }, { catalog: true, signal: opts.signal });
  return { restored: 3, profiles: 0, playlists: plan.items.length, heavyPlaylists: plan.items.length, warnings: [] };
}

export async function restoreFullBackupV3(asset: { uri:string; name?:string }, opts?: { onProgress?:ProgressFn; selectedKeys?: string[]; targetProfileId?: string; authorizedProfileId?: string; signal?: AbortSignal }): Promise<RestoreResult> {
  if (opts?.selectedKeys) return restoreSelectedFullBackupV3(asset, { selectedKeys: opts.selectedKeys, targetProfileId: opts.targetProfileId || '', authorizedProfileId: opts.authorizedProfileId, signal: opts.signal, onProgressDetail: opts.onProgress });
  if (!KizilkanNativeCore.available) throw new Error('Tam v3 yedek geri yükleme Android Native Core gerektirir.');
  const metadata = await previewFullBackupV3(asset);
  const patch = await buildBackupMetadataPatch(metadata, true);
  const current = await createBackupMetadata('quick');
  const incomingIds = new Set(backupPlaylistIds(metadata));
  const sessionId = backupRestoreSessionId();
  const mappings = [...new Set([...backupPlaylistIds(current), ...incomingIds])].map(targetId => ({ targetId, stageId: incomingIds.has(targetId) ? backupRestoreStageId(sessionId, targetId) : null }));
  const stages = new Map(mappings.filter(mapping => mapping.stageId).map(mapping => [mapping.targetId, mapping.stageId!]));
  const begun = new Set<string>(), finished = new Set<string>();
  const counts = new Map<string, number>();
  let headerSeen = false, endSeen = false, chunks = 0;
  // The journal is durable before any temporary catalogue is created. Only a
  // fully validated file can reach the native live swap and metadata commit.
  await commitBackupRestoreTransaction(sessionId, mappings, () => patch, async () => {
    await readLines(new File(asset as any), async line => {
      aborted(opts?.signal);
      let rec: any;
      try { rec = JSON.parse(line); } catch { throw new Error('Tam yedek satırı bozuk/eksik.'); }
      if (!headerSeen) {
        if (rec?.magic !== MAGIC || rec.version !== 3 || JSON.stringify(rec.metadata) !== JSON.stringify(metadata)) throw new Error('Yedek başlığı önizleme sonrası değişti.');
        headerSeen = true; return;
      }
      if (endSeen) throw new Error('Tam yedek son kaydından sonra veri var.');
      const id = String(rec.playlistId || '');
      if (rec.type === 'playlist-start') {
        if (!incomingIds.has(id) || begun.has(id)) throw new Error('Tam yedek liste başlangıcı geçersiz.');
        begun.add(id); counts.set(id, 0);
        if (!(await KizilkanNativeCore.beginChunkedPlaylistImport(stages.get(id)!))) throw new Error('Liste staging başlatılamadı.');
      } else if (rec.type === 'chunk') {
        if (!begun.has(id) || finished.has(id) || !['live', 'vod', 'series'].includes(rec.kind) || !Array.isArray(rec.items) || rec.items.some((item: any) => !item || typeof item !== 'object' || Array.isArray(item) || !item.id)) throw new Error('Tam yedek katalog parçası geçersiz.');
        const written = await KizilkanNativeCore.appendPlaylistChunk(stages.get(id)!, rec.kind, JSON.stringify(rec.items));
        if (written !== rec.items.length) throw new Error('Katalog parçası eksik yazıldı.');
        counts.set(id, (counts.get(id) || 0) + written); chunks++;
        opts?.onProgress?.({ phase: 'restore-stage', current: chunks, total: 0, message: id + ' · ' + rec.kind + ' staging' });
      } else if (rec.type === 'playlist-end') {
        if (!begun.has(id) || finished.has(id)) throw new Error('Tam yedek liste bitişi geçersiz.');
        const indexed = await KizilkanNativeCore.finishChunkedPlaylistImport(stages.get(id)!);
        const actual = indexed?.roomIndexed ? await KizilkanNativeCore.getPlaylistSummaryVerified(stages.get(id)!) : null;
        const verifiedCounts = { channels: Number(actual?.channels || 0), vod: Number(actual?.vod || 0), series: Number(actual?.series || 0) };
        if (!actual?.roomIndexed || verifiedCounts.channels + verifiedCounts.vod + verifiedCounts.series !== counts.get(id)) throw new Error('Room staging kayıt sayısı doğrulanamadı.');
        updateBackupCatalogCounts(metadata, patch, id, verifiedCounts, verifiedCounts.channels + verifiedCounts.vod + verifiedCounts.series ? 'ready' : 'empty');
        finished.add(id);
      } else if (rec.type === 'end') {
        const total = [...counts.values()].reduce((a, b) => a + b, 0);
        if (!Number.isInteger(rec.playlists) || !Number.isInteger(rec.items) || rec.playlists !== finished.size || rec.items !== total) throw new Error('Tam yedek toplam sayaçları uyuşmuyor.');
        endSeen = true;
      } else throw new Error('Tam yedekte bilinmeyen kayıt tipi.');
    });
    if (!headerSeen || !endSeen || begun.size !== finished.size || incomingIds.size !== finished.size || [...incomingIds].some(id => !finished.has(id))) throw new Error('Tam yedek tamamlanmamış veya metadata/katalog seti uyuşmuyor.');
    opts?.onProgress?.({ phase: 'restore-commit', current: 0, total: mappings.length, message: 'Doğrulanan yedek atomik olarak uygulanıyor' });
  }, { signal: opts?.signal });
  opts?.onProgress?.({ phase: 'restore-done', current: mappings.length, total: mappings.length, message: 'Tam yedek doğrulandı ve uygulandı' });
  return backupRestoreResult(metadata, patch, finished.size);
}

export function isFullBackupV3Name(name?:string) { return String(name || '').toLowerCase().endsWith('.kzb'); }
