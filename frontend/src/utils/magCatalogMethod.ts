import { storage } from '@/src/utils/storage';
export type MagCatalogMethod = 'itv' | 'vod' | 'series' | 'all';
const KEY='kizilkan.mag.catalog-method.v18730';
const memory=new Map<string,{method:MagCatalogMethod;at:number}>();
let hydration:Promise<void>|undefined;
export async function preferredMagCatalogMethod(endpoint:string):Promise<MagCatalogMethod|undefined> {
  if(!hydration)hydration=(async()=>{let saved:any={};try{saved=JSON.parse((await storage.getItem<string>(KEY,'{}'))||'{}');}catch{}for(const [k,v] of Object.entries(saved||{}) as [string,any][])if(['itv','vod','series','all'].includes(v?.method)&&Number.isFinite(v?.at)&&!memory.has(k))memory.set(k,v);while(memory.size>512)memory.delete(memory.keys().next().value!);})();
  await hydration;
  const hit=memory.get(endpoint);const age=hit?Date.now()-hit.at:-1;return hit&&age>=0&&age<86400000?hit.method:undefined;
}
let writes:Promise<unknown>=Promise.resolve();
export function rememberMagCatalogMethod(endpoint:string,method:MagCatalogMethod):Promise<unknown> {
  memory.set(endpoint,{method,at:Date.now()});
  if(memory.size>512)memory.delete(memory.keys().next().value!);
  writes=writes.catch(()=>undefined).then(()=>storage.setItem(KEY,JSON.stringify(Object.fromEntries(memory))));
  return writes;
}
