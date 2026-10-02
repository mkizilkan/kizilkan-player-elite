import { storage } from './storage';
import { bigStore } from './storage/bigStore';
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';
import type { SelectedRestorePlan } from './backupSelection';

const JOURNAL_KEY = 'kizilkan.backup.restoreJournal.v1';
export type RestoreMetadataPatch = Record<string, string | number | boolean | null>;
type KV = RestoreMetadataPatch;
export type RestoreMapping = { targetId: string; stageId: string | null };
type Mapping = RestoreMapping;
type Journal = { version: 1; sessionId: string; native: boolean; phase: 'staging' | 'applying' | 'finalized'; before: KV; after: KV; mappings: Mapping[]; legacyOld: Array<{ id: string; backupId: string | null }> };
function validateKV(raw:unknown):asserts raw is KV{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Geri yükleme güvenlik kaydı geçersiz.');
  for(const [key,value]of Object.entries(raw))if(!key.startsWith('kizilkan.')||key===JOURNAL_KEY||!(value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value))))throw new Error('Geri yükleme güvenlik kaydında geçersiz alan var.');
}
function validateJournal(raw:unknown):asserts raw is Journal{
  const j=raw as Journal;
  if(!j||typeof j!=='object'||Array.isArray(j)||j.version!==1||typeof j.sessionId!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(j.sessionId)||typeof j.native!=='boolean'||!['staging','applying','finalized'].includes(j.phase)||!Array.isArray(j.mappings)||!Array.isArray(j.legacyOld))throw new Error('Yarım geri yükleme güvenlik kaydı geçersiz.');
  validateKV(j.before);validateKV(j.after);
  const keys=Object.keys(j.before);if(keys.length!==Object.keys(j.after).length||keys.some(key=>!Object.prototype.hasOwnProperty.call(j.after,key)))throw new Error('Geri yükleme güvenlik kaydı alanları uyuşmuyor.');
  const targets=new Set<string>(),stages=new Set<string>();
  for(const m of j.mappings){if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.targetId!=='string'||!m.targetId||m.targetId.startsWith('__kzb_')||targets.has(m.targetId)||(m.stageId!==null&&(typeof m.stageId!=='string'||!m.stageId.startsWith(`__kzb_stage_${j.sessionId}_`)||stages.has(m.stageId))))throw new Error('Geri yükleme katalog eşlemesi geçersiz.');targets.add(m.targetId);if(m.stageId)stages.add(m.stageId);}
  const oldIds=new Set<string>();
  for(const old of j.legacyOld){if(!old||typeof old!=='object'||Array.isArray(old)||typeof old.id!=='string'||!targets.has(old.id)||oldIds.has(old.id)||(old.backupId!==null&&old.backupId!==`__kzb_rollback_${j.sessionId}_${old.id}`))throw new Error('Geri yükleme geri alma kaydı geçersiz.');oldIds.add(old.id);}
}
export const backupRestoreSessionId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const backupRestoreStageId = (session: string, id: string) => `__kzb_stage_${session}_${id}`;
export type BackupHeavy = { channels: any[]; vod: any[]; series: any[] };

async function writeKV(values: KV) {
  validateKV(values);
  for (const [key, value] of Object.entries(values)) {
    const ok = value === null ? await storage.removeItem(key) : await storage.setItem(key, value);
    if (!ok) throw new Error('Geri yükleme bilgisi cihaza yazılamadı. Depolama alanını kontrol edin.');
  }
}
async function save(journal: Journal) {
  validateJournal(journal);
  const raw = JSON.stringify(journal);
  // AsyncStorage stores strings with another JSON encoding layer. Stay below
  // Android's CursorWindow boundary and verify the journal can actually be read.
  const encoded = JSON.stringify(raw);
  const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(encoded).length : encoded.length * 4;
  if (bytes > 1536 * 1024) throw new Error('Geri yükleme güvenlik kaydı çok büyük. Listeleri daha küçük gruplar halinde seçin.');
  if (!(await storage.setItem(JOURNAL_KEY, raw)) || await storage.getItemStrict<string>(JOURNAL_KEY, '') !== raw) throw new Error('Geri yükleme güvenlik kaydı yazılamadı veya doğrulanamadı.');
}
async function cleanup(journal: Journal) {
  // Finalized Room data is authoritative. A stale legacy file must not revive
  // a removed/replaced catalogue during a later legacy-to-Room migration.
  if (journal.native && journal.phase === 'finalized') for (const mapping of journal.mappings) {
    if (!(await KizilkanNativeCore.deleteLegacyPlaylistFile(mapping.targetId))) throw new Error('Eski katalog dosyası temizlenemedi.');
  }
  for (const mapping of journal.mappings) if (mapping.stageId) {
    if (journal.native) {
      if (!(await KizilkanNativeCore.cancelChunkedPlaylistImport(mapping.stageId)) || !(await KizilkanNativeCore.removePlaylistIndex(mapping.stageId))) throw new Error('Geçici Room kataloğu temizlenemedi.');
    }
    else if (!(await bigStore.remove(mapping.stageId))) throw new Error('Geçici yedek kataloğu temizlenemedi.');
  }
  // Also cover a process death between writing a rollback file and recording
  // it in legacyOld: its name is deterministic from the persisted mapping.
  if (!journal.native) for (const mapping of journal.mappings) if (!(await bigStore.remove(`__kzb_rollback_${journal.sessionId}_${mapping.targetId}`))) throw new Error('Geçici geri alma kataloğu temizlenemedi.');
}
async function rollbackLegacy(journal: Journal) {
  if (journal.phase !== 'applying') return;
  for (const old of journal.legacyOld) {
    if (old.backupId) {
      const data = await bigStore.read<BackupHeavy | null>(old.backupId, null);
      if (!data || !(await bigStore.write(old.id, data))) throw new Error('Katalog geri alma işlemi tamamlanamadı. Uygulamayı yeniden açın.');
    } else if (!(await bigStore.remove(old.id))) throw new Error('Yeni katalog geri alınamadı.');
  }
}

/** Called before providers load: a process death cannot leave Room and metadata at different restore stages. */
export async function recoverPendingPlaylistRestore(): Promise<boolean> {
  const raw = await storage.getItemStrict<string>(JOURNAL_KEY, '');
  if (!raw) return false;
  let journal: Journal;
  try { journal = JSON.parse(raw); } catch { throw new Error('Yarım geri yükleme güvenlik kaydı bozuk.'); }
  validateJournal(journal);
  if (journal.native) {
    if (!KizilkanNativeCore.available) throw new Error('Yarım katalog geri yüklemesi için Native Core gerekli.');
    const state = await KizilkanNativeCore.getAtomicPlaylistRestoreState(journal.sessionId);
    if (state === 'finalized' || (!journal.mappings.length && journal.phase === 'finalized')) { await writeKV(journal.after); journal.phase = 'finalized'; }
    else {
      if (state === 'applied' && !(await KizilkanNativeCore.rollbackAtomicPlaylistRestore(journal.sessionId, journal.mappings.map(m => m.targetId)))) throw new Error('Katalog geri alma işlemi tamamlanamadı.');
      await writeKV(journal.before);
    }
  } else if (journal.phase === 'finalized') await writeKV(journal.after);
  else { await rollbackLegacy(journal); await writeKV(journal.before); }
  await cleanup(journal);
  if (!(await storage.removeItem(JOURNAL_KEY))) throw new Error('Geri yükleme güvenlik kaydı temizlenemedi.');
  if (journal.native) await KizilkanNativeCore.clearAtomicPlaylistRestoreState(journal.sessionId);
  return true;
}

/** Stage callback may only write temporary IDs; live IDs change after validation completes. */
export async function commitBackupRestoreTransaction(sessionId: string, mappings: Mapping[], metadataPatch: () => KV, stage: (mappings: Mapping[]) => Promise<void>, opts?: { signal?: AbortSignal }): Promise<void> {
  await recoverPendingPlaylistRestore();
  const signal = opts?.signal;
  const check = () => { if (signal?.aborted) throw new Error('Geri yükleme durduruldu.'); };
  const after = metadataPatch();
  const keys = Object.keys(after);
  const before: KV = {};
  for (const key of keys) before[key] = await storage.getItemStrict<any>(key, null);
  const journal: Journal = { version: 1, sessionId, native: KizilkanNativeCore.available, phase: 'staging', before, after, mappings, legacyOld: [] };
  check(); await save(journal);
  try {
    await stage(mappings); check();
    // Counts populated by staging refer to the actual verified Room rows.
    journal.after = metadataPatch();
    if (Object.keys(journal.after).length !== keys.length || keys.some(key => !(key in journal.after))) throw new Error('Geri yükleme metadata kapsamı staging sırasında değişti.');
    if (!journal.native) for (const mapping of mappings) {
      const exists = await bigStore.exists(mapping.targetId);
      const backupId = exists ? `__kzb_rollback_${sessionId}_${mapping.targetId}` : null;
      if (backupId) {
        const old = await bigStore.read<BackupHeavy | null>(mapping.targetId, null);
        if (!old || !(await bigStore.write(backupId, old))) throw new Error('Mevcut katalog için geri alma kopyası oluşturulamadı.');
      }
      journal.legacyOld.push({ id: mapping.targetId, backupId });
      await save(journal);
    }
    check(); journal.phase = 'applying'; await save(journal);
    if (journal.native && mappings.length) {
      if (!(await KizilkanNativeCore.applyAtomicPlaylistRestore(sessionId, mappings))) throw new Error('Seçilen kataloglar uygulanamadı.');
    } else if (!journal.native) for (const mapping of mappings) {
      if (mapping.stageId) {
        const data = await bigStore.read<BackupHeavy | null>(mapping.stageId, null);
        if (!data || !(await bigStore.write(mapping.targetId, data))) throw new Error('Seçilen katalog cihaza yazılamadı.');
      } else if (!(await bigStore.remove(mapping.targetId))) throw new Error('Eski katalog temizlenemedi.');
    }
    check(); await writeKV(journal.after);
    if (journal.native && mappings.length && !(await KizilkanNativeCore.finalizeAtomicPlaylistRestore(sessionId, mappings.map(m => m.targetId)))) throw new Error('Seçilen kataloglar tamamlanamadı.');
    journal.phase = 'finalized'; await save(journal);
    await cleanup(journal);
    if (!(await storage.removeItem(JOURNAL_KEY))) throw new Error('Geri yükleme güvenlik kaydı temizlenemedi.');
    if (journal.native && mappings.length) await KizilkanNativeCore.clearAtomicPlaylistRestoreState(sessionId);
  } catch (error) {
    try { await recoverPendingPlaylistRestore(); } catch (recoveryError) {
      throw new Error(`Geri yükleme yarım kaldı; uygulamayı yeniden açın. ${recoveryError instanceof Error ? recoveryError.message : ''}`);
    }
    throw error;
  }
}

export async function commitSelectedPlaylistRestore(plan: SelectedRestorePlan, sessionId: string, stage: (mappings: Mapping[]) => Promise<void>, opts?: { catalog: boolean; signal?: AbortSignal }): Promise<void> {
  const mappings = opts?.catalog ? plan.items.map(item => ({ targetId: item.targetId, stageId: backupRestoreStageId(sessionId, item.sourceId) })) : [];
  await commitBackupRestoreTransaction(sessionId, mappings, () => ({ [`kizilkan.playlists.meta.${plan.profileId}`]: JSON.stringify(plan.metadata),
    [`kizilkan.activePlaylistId.${plan.profileId}`]: plan.activeId, [`kizilkan.firstListAdded.${plan.profileId}`]: true }), stage, opts);
}
