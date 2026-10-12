import { PanelScan } from '@/modules/panel-scan';
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';

export type TestQueueState<J,R> = { version:1; owner:string; runId:string; phase:'running'|'interrupted'|'done'; jobs:J[]; results:Record<string,R>; error?:string };
const active=new Set<string>();
export async function loadTestQueue<J,R>(owner:string,kind:string):Promise<TestQueueState<J,R>|null> {
  const state=await PanelScan.loadBackgroundWork<TestQueueState<J,R>>(`test:${kind}:${owner}`);
  if(!state)return null;
  if(state.version!==1 || state.owner!==owner || !Array.isArray(state.jobs) || !state.results || typeof state.results!=='object')throw new Error('Kayıtlı test kuyruğu doğrulanamadı.');
  if(state.phase==='running' && !active.has(`test:${kind}:${owner}`))state.phase='interrupted';
  return state;
}
export async function runTestQueue<J extends {key:string},R>(options:{owner:string;kind:string;jobs:J[];resume?:boolean;title:string;signal:AbortSignal;concurrency:number;timeoutMs?:number;
  checkpointEach?:boolean;test:(job:J,signal:AbortSignal)=>Promise<R>;onProgress?:(done:number,total:number)=>void;onResult?:(job:J,result:R)=>void|Promise<void>}):Promise<TestQueueState<J,R>> {
  const scope=`test:${options.kind}:${options.owner}`;
  if(active.has(scope))throw new Error('Bu test zaten çalışıyor.');
  active.add(scope);
  const controller=new AbortController();const abort=()=>controller.abort();
  options.signal.addEventListener('abort',abort,{once:true});if(options.signal.aborted)abort();
  let state:TestQueueState<J,R>|null=null;let heartbeat:ReturnType<typeof setInterval>|undefined;let pendingWrite=Promise.resolve();let dirty=false;let fatal:unknown;
  const checkpoint=()=>{ if(!state)return pendingWrite;
    const captured=JSON.parse(JSON.stringify(state));
    pendingWrite=pendingWrite.then(()=>PanelScan.saveBackgroundWork(scope,captured));return pendingWrite;
  };
  try {
    state=options.resume?await loadTestQueue<J,R>(options.owner,options.kind):null;
    state=state || {version:1,owner:options.owner,runId:`${options.kind}-${Date.now()}`,phase:'running',jobs:Array.from(new Map(options.jobs.map(job=>[job.key,job])).values()),results:{}};
    state.phase='running';delete state.error;
    await checkpoint();
    if(!KizilkanNativeCore.startForegroundKeepAlive(options.title,'Testler sürüyor…',scope,()=>controller.abort()))throw new Error('Arka plan test servisi başlatılamadı.');
    const jobs=state.jobs.filter(job=>!Object.prototype.hasOwnProperty.call(state!.results,job.key));let index=0;
    const progress=()=>{const done=Object.keys(state!.results).length;options.onProgress?.(done,state!.jobs.length);
      KizilkanNativeCore.updateForegroundKeepAlive(`${done}/${state!.jobs.length} test`,done,state!.jobs.length,scope);};
    progress();
    heartbeat=setInterval(()=>{try{progress();if(dirty){dirty=false;void checkpoint().catch(error=>{fatal=error;controller.abort();});}}catch(error){fatal=error;controller.abort();}},2000);
    const worker=async()=>{try{
      while(index<jobs.length && !controller.signal.aborted && !fatal){const job=jobs[index++];
        const per=new AbortController();const perAbort=()=>per.abort();controller.signal.addEventListener('abort',perAbort,{once:true});
        const timer=setTimeout(()=>per.abort(),options.timeoutMs||30000);
        let result:R;try{result=await options.test(job,per.signal);}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',perAbort);}
        if(controller.signal.aborted)break;
        await options.onResult?.(job,result);state!.results[job.key]=result;dirty=true;
        if(options.checkpointEach){await checkpoint();dirty=false;}progress();
      }
    }catch(error){fatal=error;controller.abort();}
    };
    await Promise.all(Array.from({length:Math.min(options.concurrency,jobs.length)},worker));
    if(fatal)throw fatal;
    state.phase=controller.signal.aborted?'interrupted':'done';await checkpoint();
    PanelScan.notifyBackgroundResult(state.runId,state.phase==='done'?`${options.title} tamamlandı`:`${options.title} durduruldu`,`${Object.keys(state.results).length}/${state.jobs.length} test kaydedildi`,options.kind==='mac-frame'?'mag-bulk':'add-playlist');
    return state;
  } catch(error) {
    if(state){state.phase='interrupted';state.error='Test kesildi; tamamlanan sonuçlar ve kalan işler korunuyor.';try{await checkpoint();}catch{}
      PanelScan.notifyBackgroundResult(state.runId,`${options.title} kesildi`,'Tamamlanan sonuçlar korundu; kalan işleri devam ettirebilirsiniz.',options.kind==='mac-frame'?'mag-bulk':'add-playlist');}
    throw error;
  } finally {
    if(heartbeat)clearInterval(heartbeat);options.signal.removeEventListener('abort',abort);controller.abort();active.delete(scope);try{KizilkanNativeCore.stopForegroundKeepAlive(scope);}catch{}
  }
}
