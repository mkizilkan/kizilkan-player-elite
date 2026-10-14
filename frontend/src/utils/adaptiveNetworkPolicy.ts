/** RTT-based deadlines. Rate limits and credential rejection are not slow-network samples. */
type Sample={values:number[];at:number;timeouts:number};
const hosts=new Map<string,Sample>();let network='initial';
const MAX_HOSTS=512,TTL=5*60_000;
export function setTimingNetwork(value:string):void {if(value!==network){network=value;hosts.clear();}}
function key(url:string,stage:string,transport:string){try{return `${network}|${new URL(url).origin.toLowerCase()}|${stage}|${transport}`;}catch{return `${network}|invalid|${stage}|${transport}`;}}
export function rememberHostTiming(url:string,stage:string,ms:number,outcome:'success'|'timeout'|'other',transport='direct'):void {
  if(outcome==='other'||!Number.isFinite(ms)||ms<0)return;
  const k=key(url,stage,transport),old=hosts.get(k),row=old&&Date.now()-old.at<TTL?old:{values:[],at:0,timeouts:0};
  if(outcome==='success'){row.values.push(ms);if(row.values.length>32)row.values.shift();row.timeouts=Math.max(0,row.timeouts-1);}
  else row.timeouts=Math.min(4,row.timeouts+1);
  row.at=Date.now();hosts.delete(k);hosts.set(k,row);while(hosts.size>MAX_HOSTS)hosts.delete(hosts.keys().next().value!);
}
export function adaptiveTimeout(url:string,stage:string,ceilingMs:number,remainingMs=Infinity,transport='direct'):number {
  const ceiling=Math.max(1,ceilingMs),row=hosts.get(key(url,stage,transport));
  // Catalogue size can differ by orders of magnitude between accounts on one host.
  // A small previous response must never shorten the next full catalogue download.
  if(/catalog|body|streams|vod|series/i.test(stage))return Math.max(1,Math.min(ceiling,remainingMs));
  if(!row||Date.now()-row.at>=TTL||row.values.length<4)return Math.max(1,Math.min(ceiling,remainingMs));
  const values=row.values.slice().sort((a,b)=>a-b),p90=values[Math.ceil(values.length*.9)-1],median=values[Math.floor(values.length/2)];
  const floor=/catalog|body|streams|vod|series/i.test(stage)?Math.min(ceiling,12000):Math.min(ceiling,2000);
  const observed=Math.max(floor,p90*2.5,median*4)*(1+row.timeouts*.5);
  return Math.max(1,Math.min(ceiling,remainingMs,Math.ceil(observed)));
}
export function hostTimingSummary(){return {hosts:hosts.size,samples:Array.from(hosts.values()).reduce((n,s)=>n+s.values.length,0),networkContextAvailable:network!=='initial'};}
export function _resetHostTiming(){hosts.clear();network='initial';}
