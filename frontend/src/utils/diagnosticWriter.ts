/** Bounded pending work, separate from the unchanged durable journal retention limits. */
export type WriterPriority='normal'|'important';
type Row<T>={value:T;bytes:number;at:number;resolve:()=>void;reject:(e:unknown)=>void};
export function createDiagnosticWriter<T>(options:{maxRows:number;maxBytes:number;batchSize:number;
  maxBatchBytes?:number;write:(values:T[])=>Promise<void>;importantOverflow:(value:T)=>void}) {
  const queue:Row<T>[]=[];let bytes=0,running=false;let dropped=0,overflow=0,batches=0,writeMs=0,peak=0,failures=0;
  const waiters:Array<()=>void>=[];
  const drain=async()=>{
    if(running)return;running=true;
    try { while(queue.length){
      let count=0,batchBytes=0;
      while(count<queue.length&&count<options.batchSize){const next=queue[count].bytes;if(count&&batchBytes+next>(options.maxBatchBytes||options.maxBytes))break;batchBytes+=next;count++;}
      const rows=queue.splice(0,count);for(const row of rows)bytes-=row.bytes;
      const at=Date.now();try{await options.write(rows.map(row=>row.value));rows.forEach(row=>row.resolve());}
      catch(error){failures++;rows.forEach(row=>row.reject(error));}
      batches++;writeMs=Date.now()-at;
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }} finally {running=false;waiters.splice(0).forEach(resolve=>resolve());if(queue.length)void drain();}
  };
  return {
    enqueue(value:T,size:number,priority:WriterPriority):Promise<void>{
      if(!Number.isFinite(size)||size<0)return Promise.reject(new Error('Invalid diagnostic size'));
      if(size>options.maxBytes||queue.length>=options.maxRows||bytes+size>options.maxBytes){
        if(priority==='important'){overflow++;try{options.importantOverflow(value);}catch(error){failures++;return Promise.reject(error);}}else dropped++;
        return Promise.resolve();
      }
      const result=new Promise<void>((resolve,reject)=>{queue.push({value,bytes:size,at:Date.now(),resolve,reject});bytes+=size;peak=Math.max(peak,queue.length);});
      // Batch calls from the same event-loop turn; do not accumulate unbounded closures.
      if(!running)void Promise.resolve().then(drain);return result;
    },
    flush():Promise<void>{return !running&&!queue.length?Promise.resolve():new Promise(resolve=>waiters.push(resolve));},
    health(){return {pending:queue.length,pendingBytes:bytes,oldestAgeMs:queue[0]?Date.now()-queue[0].at:0,peak,dropped,importantOverflow:overflow,batches,lastWriteMs:writeMs,failures};},
  };
}
