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
export function freshnessDue(lastAttempt:number,minutes:number|undefined,now=Date.now()):boolean{
  const interval=Math.max(1,Math.min(1440,Number.isFinite(minutes)?minutes!:DEFAULT_FRESHNESS_MINUTES));
  return now-lastAttempt>=interval*60000;
}
