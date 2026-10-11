/** Serialize catalog writes per playlist, while unrelated lists remain independent. */
const tails=new Map<string,Promise<unknown>>();
let restoreActive = false;
let restorePending = false;
export function isCatalogRestoreActive(): boolean { return restoreActive || restorePending; }
export function isCatalogRestoreWriting(): boolean { return restoreActive; }
export async function beginCatalogRestore(): Promise<() => void> {
  if (isCatalogRestoreActive()) throw new Error('Başka bir geri yükleme sürüyor.');
  restorePending = true;
  await Promise.allSettled(Array.from(tails.values()));
  restoreActive = true;
  restorePending = false;
  let released = false;
  return () => { if (!released) { released = true; restoreActive = false; } };
}
export async function withCatalogLock<T>(id:string,work:()=>Promise<T>):Promise<T>{
  if (isCatalogRestoreActive()) throw new Error('Yedek geri yüklenirken katalog değiştirilemez.');
  const previous=tails.get(id)||Promise.resolve();
  const operation=previous.catch(()=>undefined).then(work);tails.set(id,operation);
  try{return await operation;}finally{if(tails.get(id)===operation)tails.delete(id);}
}
export const DEFAULT_FRESHNESS_MINUTES=15;
export const FRESHNESS_OPTIONS = [5, 15, 30, 60, 180, 360, 1440, 2880, 4320, 10080, 43200];
export function freshnessLabel(minutes: number): string {
  if (minutes === 43200) return '1 ay (30 gün)';
  if (minutes === 10080) return '1 hafta';
  if (minutes >= 1440) return `${minutes / 1440} gün`;
  return minutes < 60 ? `${minutes} dk` : `${minutes / 60} sa`;
}
export function freshnessDue(lastAttempt:number,minutes:number|undefined,now=Date.now()):boolean{
  const interval=Math.max(1,Math.min(43200,Number.isFinite(minutes)?minutes!:DEFAULT_FRESHNESS_MINUTES));
  return now-lastAttempt>=interval*60000;
}
