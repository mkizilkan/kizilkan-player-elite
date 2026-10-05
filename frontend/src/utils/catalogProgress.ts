import type { RefreshProgress } from '@/src/utils/refreshPlaylist';
import type { StalkerCatalogProgress } from '@/src/utils/stalker';

/** Mesajdan sayı ayrıştırmadan aynı katalog olayını bütün ekranlara taşır. */
export function applyCatalogProgress(previous: RefreshProgress | null, next: StalkerCatalogProgress): RefreshProgress {
  const result: RefreshProgress = { ...previous, phase: next.stage === 'final' ? 'save' : 'content', message: next.message };
  if (next.stage !== 'final') {
    const kind = next.stage;
    result.activeKind = kind;
    if (!result[kind]) result[kind] = 'waiting';
    if (typeof next.loaded === 'number' && Number.isFinite(next.loaded)) result[`${kind}Count`] = Math.max(0, next.loaded);
    if (typeof next.total === 'number' && Number.isFinite(next.total)) result[`${kind}Total`] = Math.max(0, next.total);
    if (typeof next.page === 'number') result[`${kind}Page`] = next.page;
  }
  return result;
}
