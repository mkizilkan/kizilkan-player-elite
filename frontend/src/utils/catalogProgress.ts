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

/** ETA requires actual increasing samples and a known total; HTTP latency alone is not progress. */
export function createCatalogProgressEstimator(){
  const samples=new Map<string,{at:number;count:number}>();
  return (progress:RefreshProgress,now=Date.now()):RefreshProgress=>{
    const result={...progress};delete result.estimatedRemainingMs;
    const kind=progress.activeKind;if(!kind)return result;
    const count=progress[`${kind}Count`],total=progress[`${kind}Total`];
    if(count===undefined||total===undefined||total<=0||count>total)return result;
    if(progress[kind]==='done'){result.estimatedRemainingMs=0;return result;}
    const before=samples.get(kind);
    if(before&&now>before.at&&count>before.count&&now-before.at>=250)
      result.estimatedRemainingMs=Math.max(0,Math.ceil((total-count)*(now-before.at)/(count-before.count)));
    if(!before||count!==before.count)samples.set(kind,{at:now,count});
    return result;
  };
}
