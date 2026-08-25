import { File, Paths } from 'expo-file-system';
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';
import { bigStore } from '@/src/utils/storage/bigStore';
import {
  backupPlaylistIds, createBackupMetadata, restoreBackupMetadataExact,
  type BackupPayload, type RestoreResult,
} from '@/src/utils/backup';

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

export async function restoreFullBackupV3(asset: { uri:string; name?:string }, opts?: { onProgress?:ProgressFn }): Promise<RestoreResult> {
  if (!KizilkanNativeCore.available) throw new Error('Tam v3 yedek geri yükleme Android Native Core gerektirir.');
  const file = new File(asset as any);
  // v15.2.14: Canlı Room snapshot'ına dosya okunurken ASLA yazma. Her playlist
  // session'a özel bir stage ID altında tamamen indekslenir. Ancak header/end,
  // metadata playlist seti ve bütün playlist-end kayıtları doğrulandıktan sonra
  // tek native transaction ile canlı ID'lere swap edilir.
  const currentMeta = await createBackupMetadata('quick');
  const previousIds = new Set(backupPlaylistIds(currentMeta));
  const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  const stageIdFor = (id:string) => `__kzb_stage_${sessionId}_${id}`;
  let metadata: BackupPayload | null = null;
  let headerSeen = false, endSeen = false;
  const begun = new Set<string>();
  const finished = new Set<string>();
  const itemCounts = new Map<string, number>();
  let chunks = 0;
  let swapApplied = false;
  let metadataApplied = false;
  let swapTargets: string[] = [];
  try {
    await readLines(file, async (line) => {
      let rec:any; try { rec=JSON.parse(line); } catch { throw new Error('Tam yedek satırı bozuk/eksik.'); }
      if (!headerSeen) {
        if (rec?.magic !== MAGIC || rec?.version !== 3 || !rec?.metadata) throw new Error('Bu geçerli bir KIZILKAN tam yedeği değil.');
        metadata = rec.metadata; headerSeen = true; return;
      }
      if (endSeen) throw new Error('Tam yedek son kaydından sonra beklenmeyen veri var.');
      if (rec?.type === 'playlist-start') {
        const id=String(rec.playlistId||''); if (!id) throw new Error('Yedekte playlist kimliği eksik.');
        if (id.startsWith('__kzb_')) throw new Error(`Yedekte ayrılmış playlist kimliği kullanılmış: ${id}`);
        if (begun.has(id)) throw new Error(`Yedekte playlist birden fazla başlatılmış: ${id}`);
        const stageId=stageIdFor(id);
        if (!(await KizilkanNativeCore.beginChunkedPlaylistImport(stageId))) throw new Error(`Playlist staging başlatılamadı: ${id}`);
        begun.add(id); itemCounts.set(id, 0); return;
      }
      if (rec?.type === 'chunk') {
        const id=String(rec.playlistId||''); const kind=rec.kind as 'live'|'vod'|'series';
        if (!begun.has(id) || finished.has(id) || !['live','vod','series'].includes(kind) || !Array.isArray(rec.items)) throw new Error('Yedek chunk sözleşmesi bozuk.');
        const stageId=stageIdFor(id);
        const written=await KizilkanNativeCore.appendPlaylistChunk(stageId, kind, JSON.stringify(rec.items));
        if (written !== rec.items.length) throw new Error(`Playlist chunk eksik yazıldı: ${id}/${kind} ${written}/${rec.items.length}`);
        itemCounts.set(id, (itemCounts.get(id) || 0) + written);
        chunks++;
        opts?.onProgress?.({ phase:'restore-stage', current:chunks, total:0, message:`${id} · ${kind} staging` });
        return;
      }
      if (rec?.type === 'playlist-end') {
        const id=String(rec.playlistId||'');
        if (!begun.has(id) || finished.has(id)) throw new Error(`Playlist bitiş sırası bozuk: ${id}`);
        const stageId=stageIdFor(id);
        const summary=await KizilkanNativeCore.finishChunkedPlaylistImport(stageId);
        if (!summary?.roomIndexed) throw new Error(`Playlist Room staging doğrulaması başarısız: ${id}`);
        const stagedTotal=Number(summary.channels||0)+Number(summary.vod||0)+Number(summary.series||0);
        if (stagedTotal !== (itemCounts.get(id) || 0)) throw new Error(`Playlist staging sayaç doğrulaması başarısız: ${id} ${stagedTotal}/${itemCounts.get(id) || 0}`);
        finished.add(id); return;
      }
      if (rec?.type === 'end') {
        if (endSeen) throw new Error('Tam yedekte birden fazla son kayıt var.');
        endSeen=true;
        const declaredPlaylists=Number(rec?.playlists);
        const declaredItems=Number(rec?.items);
        if (Number.isFinite(declaredPlaylists) && declaredPlaylists !== finished.size) throw new Error(`Tam yedek playlist sayacı uyuşmuyor: ${declaredPlaylists}/${finished.size}`);
        const actualItems=Array.from(itemCounts.values()).reduce((a,b)=>a+b,0);
        if (Number.isFinite(declaredItems) && declaredItems !== actualItems) throw new Error(`Tam yedek item sayacı uyuşmuyor: ${declaredItems}/${actualItems}`);
        return;
      }
      throw new Error(`Tam yedekte bilinmeyen kayıt tipi: ${String(rec?.type || 'yok')}`);
    });
    if (!headerSeen || !metadata || !endSeen) throw new Error('Tam yedek tamamlanmamış; son doğrulama kaydı yok.');
    if (begun.size !== finished.size) throw new Error(`Tam yedek eksik: ${begun.size} playlist başladı, ${finished.size} tamamlandı.`);
    const incomingIds = new Set(backupPlaylistIds(metadata));
    if (incomingIds.size !== begun.size || Array.from(incomingIds).some(id=>!finished.has(id))) {
      throw new Error(`Tam yedek metadata/katalog seti uyuşmuyor: metadata=${incomingIds.size}, katalog=${finished.size}`);
    }

    // Hem gelen hem de snapshot'ta artık bulunmaması gereken eski playlistleri
    // aynı native transaction'ın hedef setine koy. stageId=null -> güvenli silme.
    swapTargets = Array.from(new Set([...previousIds, ...incomingIds]));
    const mappings = swapTargets.map(targetId => ({ targetId, stageId: incomingIds.has(targetId) ? stageIdFor(targetId) : null }));
    opts?.onProgress?.({ phase:'restore-commit', current:0, total:swapTargets.length, message:'Doğrulanan yedek atomik olarak uygulanıyor' });
    if (!(await KizilkanNativeCore.applyAtomicPlaylistRestore(sessionId, mappings))) throw new Error('Atomik Room restore swap başlatılamadı.');
    swapApplied = true;

    metadataApplied = true; // restoreBackupMetadata kısmi yazarsa catch eski metadata'yı geri koyabilsin.
    const base = await restoreBackupMetadataExact(metadata);
    if (!(await KizilkanNativeCore.finalizeAtomicPlaylistRestore(sessionId, swapTargets))) throw new Error('Atomik restore finalize edilemedi.');
    swapApplied = false; // rollback alanları artık bilerek temizlendi.
    // Snapshot'ta bulunmayan eski playlistlerin olası legacy JSON dosyalarını da
    // yalnız başarıdan SONRA temizle; Room zaten finalize sırasında kaldırıldı.
    for (const oldId of previousIds) if (!incomingIds.has(oldId)) { try { await bigStore.remove(oldId); } catch {} }
    opts?.onProgress?.({ phase:'restore-done', current:swapTargets.length, total:swapTargets.length, message:'Tam yedek doğrulandı ve uygulandı' });
    return { ...base, heavyPlaylists: finished.size };
  } catch (e) {
    // Dosya parse/staging sırasında yalnız geçici ID'leri temizle. Swap başladıysa
    // native rollback eski Room + EPG snapshot'ını transaction ile geri getirir.
    if (swapApplied) {
      try { await KizilkanNativeCore.rollbackAtomicPlaylistRestore(sessionId, swapTargets); } catch (rollbackError) {
        console.error('[BackupV3] Room rollback başarısız', rollbackError);
      }
      try { if (metadataApplied) await restoreBackupMetadataExact(currentMeta); } catch (metaRollbackError) {
        console.error('[BackupV3] metadata rollback başarısız', metaRollbackError);
      }
    }
    for (const id of begun) {
      try { await KizilkanNativeCore.cancelChunkedPlaylistImport(stageIdFor(id)); } catch {}
      try { await KizilkanNativeCore.removePlaylistIndex(stageIdFor(id)); } catch {}
    }
    throw e;
  }
}

export function isFullBackupV3Name(name?:string) { return String(name || '').toLowerCase().endsWith('.kzb'); }
