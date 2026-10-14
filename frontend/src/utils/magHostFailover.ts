/**
 * KIZILKAN PLAYER — MAG ÇOKLU-IP DNS FAILOVER (v18.7.12)
 * ===========================================================================
 * SORUN (cihaz kanıtı 04.10.2026): `panel-b.example` 5 A kaydı döndürüyor ama
 * yalnız 1'i (172.110.220.225) CANLI; diğer 4'ü (.69/.249/.250/.251) ÖLÜ. Telefonun
 * sistem DNS'i ölü IP'yi döndürünce istek 6 sn timeout oluyor ve OkHttp/expo-fetch
 * diğer IP'leri TEK istek bütçesi içinde deneyemeden vazgeçiyor → canlı IP'ye hiç
 * ulaşılamıyor. Oynatıcıda host failover vardı, MAG ekleme/tarama yolunda YOKTU
 * (IPTV Extreme çalışıyor çünkü tüm IP'leri deniyor).
 *
 * ÇÖZÜM: Hostun TÜM A kayıtlarını DoH (DNS-over-HTTPS) ile çöz, her birini hızlıca
 * yokla, CANLI olanı host için SABİTLE (pin). Sonraki istekler bağlantıyı canlı IP'ye
 * yapar — AMA IP yalnız fetch sınırında kalır: Host başlığı hostname olur ve yanıtın
 * finalUrl'i mantıksal olarak hostname'e geri çevrilir (origin/redirect güvenlik
 * kontrolleri bozulmaz, saklanan endpoint hostname kalır). HTTPS (SNI)
 * isteklerde native OkHttp özgün hostname/SNI kullanır. DoH tek IPv4 kaydında gereksizdir.
 * ===========================================================================
 */
import { recordDiagnostic } from "@/src/utils/diagnostics";
import type { MagDiscoveryBudget } from '@/src/utils/magDiscoveryBudget';

type Pin = { ip: string; at: number;expiresAt:number };
const pins = new Map<string, Pin>();              // "hostname:port" -> canlı IP
const ipBack = new Map<string, Map<string, number>>(); // compatibility: one IP may serve multiple origins
const resolving = new Map<string, Promise<void>>(); // host başına tek uçuş
const negativeDoh = new Map<string, number>();    // DoH başarısız host -> zaman
const PIN_TTL = 5 * 60_000;
const NEG_TTL = 60_000;
const MAX_DNS_HOSTS=512;
const addressCache=new Map<string,{ips:string[];at:number;ttl:number}>();
const flights=new Map<string,{promise:Promise<void>;controller:AbortController;waiters:number}>();
const budgetOwners=new WeakMap<MagDiscoveryBudget,number>();let budgetOwnerSequence=0;
function budgetOwner(budget?:MagDiscoveryBudget):string{if(!budget)return 'shared';let owner=budgetOwners.get(budget);if(!owner){owner=++budgetOwnerSequence;budgetOwners.set(budget,owner);}return String(owner);}
let dnsBridge:typeof import('@/modules/panel-scan').PanelScan|undefined;
let networkContext='initial';let cacheGeneration=0;
async function loadDnsBridge(){if(!dnsBridge){try{dnsBridge=(await import('@/modules/panel-scan')).PanelScan;}catch{}}return dnsBridge;}
function refreshNetwork(){
  let next='unsupported';try{next=dnsBridge?.getDnsNetworkContext?.()||'unsupported';}catch{}
  if(next!==networkContext){networkContext=next;cacheGeneration++;pins.clear();ipBack.clear();negativeDoh.clear();addressCache.clear();
    for(const flight of flights.values())flight.controller.abort();flights.clear();resolving.clear();
    void import('./adaptiveNetworkPolicy').then(m=>m.setTimingNetwork(next)).catch(()=>{});}
}
function trimCaches(){for(const map of [pins,ipBack,negativeDoh,addressCache])while(map.size>MAX_DNS_HOSTS)map.delete(map.keys().next().value!);}
/**
 * Yalnız gerçek React Native çalışma ortamında aktif (navigator.product === "ReactNative").
 * Node/VM test koşumlarında kapalıdır → fixture fetch sayımları ve davranışları değişmez.
 * Testler `_setHostFailoverEnabled(true)` ile açıkça açar.
 */
let enabled = (globalThis as any)?.navigator?.product === "ReactNative";
export function _setHostFailoverEnabled(value: boolean): void { enabled = !!value; }

function isIpv4(value: string): boolean { return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)&&value.split('.').every(n=>Number(n)<=255); }
function isIp(value:string){return isIpv4(value)||value.includes(':')&&/^[\[\]0-9a-fA-F:.]+$/.test(value);}
function portOf(u: URL): string { return u.port || (u.protocol === "https:" ? "443" : "80"); }
function keyOf(u: URL): string { return u.origin.toLowerCase(); }

/** DoH ile hostun tüm IPv4 A kayıtları (dns.google → cloudflare yedek). Başarısızsa []. */
async function dohResolveAll(hostname: string, signal?: AbortSignal, budget?: MagDiscoveryBudget): Promise<string[]> {
  const name=hostname.toLowerCase().replace(/\.$/,'');
  const cached=addressCache.get(name);if(cached&&Date.now()-cached.at<cached.ttl){addressCache.delete(name);addressCache.set(name,cached);return cached.ips.slice();}
  const providers = [
    `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
  ];
  for (const url of providers) {
    if (signal?.aborted) return [];
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      budget?.consume();
      const work = fetch(url, { method: "GET", headers: { Accept: "application/dns-json" }, signal: controller.signal });
      const res: any = await (budget ? budget.run(work) : work);
      if (!res || !(res.status >= 200 && res.status < 300)) continue;
      const text = res.text();
      const data = JSON.parse(String(await (budget ? budget.run(text) : text)));
      const ips: string[] = Array.isArray(data?.Answer)
        ? data.Answer.filter((a: any) => Number(a?.type) === 1 && isIpv4(String(a?.data))).map((a: any) => String(a.data))
        : [];
      let all=Array.from(new Set(ips));
      const answers:any[]=[...(Array.isArray(data.Answer)?data.Answer:[])];
      if(dnsBridge?.available){try{
        const ipv6Url=url.replace(/type=A$/,'type=AAAA');budget?.consume();
        const work=fetch(ipv6Url,{headers:{Accept:'application/dns-json'},signal:controller.signal});
        const response:any=await(budget?budget.run(work):work);
        if(response.status>=200&&response.status<300){const text=response.text();
          const more=JSON.parse(String(await(budget?budget.run(text):text)));
          const rows=Array.isArray(more.Answer)?more.Answer:[];answers.push(...rows);
          all.push(...rows.filter((row:any)=>Number(row.type)===28&&isIp(String(row.data))).map((row:any)=>String(row.data)));}
      }catch{}}
      if(all.length){
        const ttls=answers.filter(row=>[1,28].includes(Number(row.type))).map(row=>Number(row.TTL)*1000).filter(n=>Number.isFinite(n)&&n>=0);
        const value={ips:[...new Set(all)].slice(0,16),at:Date.now(),ttl:Math.min(PIN_TTL,...(ttls.length?ttls:[PIN_TTL]))};
        addressCache.set(name,value);trimCaches();return value.ips.slice();
      }
    } catch { /* sıradaki sağlayıcı */ }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
  }
  return [];
}

/** Bir IP:port'a kısa bir HTTP yoklaması: yanıt (herhangi status) = CANLI, timeout = ÖLÜ. */
async function probeIp(ip: string, port: string, hostname: string, timeoutMs: number, signal?: AbortSignal, budget?: MagDiscoveryBudget): Promise<boolean> {
  if (signal?.aborted) return false;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Host başlığı hostname'e sabit; bağlantı doğrudan IP'ye. Yanıt gelmesi (status>0) canlı demektir.
    budget?.consume();
    const work = fetch(`http://${ip}:${port}/`, { method: "GET", headers: { Host: hostname, Accept: "*/*" }, signal: controller.signal });
    const res: any = await (budget ? budget.run(work) : work);
    try{await res.body?.cancel();}catch{}
    return Number(res?.status) > 0;
  } catch (e: any) {
    // Abort/timeout = ölü. Bağlantı reddi gibi HIZLI hatalar da "bir şey yanıt verdi" sayılmaz ama
    // çok nadir; güvenli taraf: yalnız gerçek yanıtı canlı say.
    return false;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}

/**
 * Host için CANLI bir IP bulunmuşsa sabitler. Yalnız http + çoklu A kaydı olan hostlarda çalışır.
 * Tek uçuş (aynı host için eşzamanlı çağrılar aynı Promise'i paylaşır). İdempotenttir.
 */
export async function ensureLiveHostIp(url: string, signal?: AbortSignal, budget?: MagDiscoveryBudget): Promise<void> {
  if (!enabled || signal?.aborted) return;
  await loadDnsBridge();refreshNetwork();
  let u: URL; try { u = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`); } catch { return; }
  if ((u.protocol!=="http:"&&u.protocol!=="https:")||isIp(u.hostname))return;
  if(u.protocol==='https:'&&!dnsBridge?.available)return;
  const key = keyOf(u);
  const pinned = pins.get(key);
  if (pinned && Date.now()<pinned.expiresAt){pins.delete(key);pins.set(key,pinned);return;}
  if ((negativeDoh.get(key) || 0) > Date.now() - NEG_TTL) return;
  // A passive child and its parent share a trace ID, but not a cancellation owner.
  const flightKey=key+'|'+budgetOwner(budget);
  const inflight=flights.get(flightKey);
  if(inflight)return waitForDnsFlight(inflight,signal);
  const controller=new AbortController(),generation=cacheGeneration;
  const onBudget=()=>controller.abort();budget?.signal.addEventListener('abort',onBudget,{once:true});
  const task = (async () => {
    const started = Date.now();
    const ips = await dohResolveAll(u.hostname, controller.signal, budget);
    if (controller.signal.aborted||generation!==cacheGeneration) return;
    if (!ips.length || ips.length === 1 && !ips[0].includes(':')) { negativeDoh.set(key, Date.now());trimCaches(); return; } // tek/sıfır IP → failover gereksiz
    const port = portOf(u);
    let live = "";
    // Paralel yokla; ilk canlıyı sabitle (hepsini beklemeden erken dönülür).
    await new Promise<void>(resolve => {
      let cursor=0,done=false;
      const finish=()=>{if(!done){done=true;controller.signal.removeEventListener('abort',finish);resolve();}};
      controller.signal.addEventListener('abort',finish,{once:true});
      const worker=async()=>{while(cursor<ips.length&&!done&&!controller.signal.aborted){
        const ip=ips[cursor++];let ok=false;
        try {
          if((u.protocol==='https:'||ip.includes(':'))&&dnsBridge?.available){
            budget?.consume();const work=dnsBridge.dnsRoutedRequest(`${u.origin}/`,'GET',{},'',[ip],2500,controller.signal,1024);
            const result=await(budget?budget.run(work):work);ok=result.status>0;
          } else ok=await probeIp(ip,port,u.hostname,2500,controller.signal,budget);
        }catch{}
        if(ok&&!live){live=ip;finish();}
      }};
      void Promise.allSettled(Array.from({length:Math.min(4,ips.length)},()=>worker())).then(finish);
      if(controller.signal.aborted)finish();
    });
    if (controller.signal.aborted||generation!==cacheGeneration) return;
    if (live) {
      const answers=addressCache.get(u.hostname.toLowerCase().replace(/\.$/,''));
      const expiresAt=answers?answers.at+answers.ttl:Date.now()+PIN_TTL;
      pins.set(key, { ip: live, at: Date.now(),expiresAt });
      try{dnsBridge?.publishDnsRoute?.(u.hostname,Number(port),live,expiresAt);}catch{}
      const routes=ipBack.get(`${live}:${port}`)||new Map<string,number>();
      routes.set(key,expiresAt);ipBack.set(`${live}:${port}`,routes);
      trimCaches();
      void recordDiagnostic("scan", "MAG_HOST_IP_FAILOVER", { host: u.hostname, aRecords: ips.length, elapsedMs: Date.now() - started });
    } else {
      negativeDoh.set(key, Date.now());
      trimCaches();
      void recordDiagnostic("scan", "MAG_HOST_IP_FAILOVER_NONE", { host: u.hostname, aRecords: ips.length, elapsedMs: Date.now() - started });
    }
  })().finally(() => {if(resolving.get(key)===task)resolving.delete(key);if(flights.get(flightKey)?.promise===task)flights.delete(flightKey);budget?.signal.removeEventListener('abort',onBudget);});
  resolving.set(key, task);
  const flight={promise:task,controller,waiters:0};flights.set(flightKey,flight);
  return waitForDnsFlight(flight,signal);
}
async function waitForDnsFlight(flight:{promise:Promise<void>;controller:AbortController;waiters:number},signal?:AbortSignal){
  flight.waiters++;let stopped!:()=>void;
  const cancelled=new Promise<void>(resolve=>{stopped=()=>resolve();signal?.addEventListener('abort',stopped,{once:true});if(signal?.aborted)stopped();});
  try{await Promise.race([flight.promise,cancelled]);}finally{signal?.removeEventListener('abort',stopped);if(--flight.waiters===0)flight.controller.abort();}
}

/**
 * Bağlantı için IP'ye çevrilmiş URL + Host başlığı. Pin yoksa URL aynen döner, host boş.
 * IP yalnız burada (fetch sınırında) görünür; iç mantık hostname'i kullanmaya devam eder.
 */
export function connectInfo(url: string): { url: string; host?: string } {
  if (!enabled) return { url };
  refreshNetwork();
  let u: URL; try { u = new URL(url); } catch { return { url }; }
  if (u.protocol !== "http:" || isIpv4(u.hostname)) return { url };
  const pin = pins.get(keyOf(u));
  if (!pin || Date.now()>=pin.expiresAt) return { url };
  const host = u.host;
  u.hostname = pin.ip.includes(':')?`[${pin.ip}]`:pin.ip;
  return { url: u.toString(), host };
}

/** IP'ye çevrilmiş bir yanıt URL'ini mantıksal hostname URL'ine geri çevirir (origin kontrolleri için). */
export function logicalUrl(url: string, originalUrl?: string, transportUrl?: string): string {
  let u: URL; try { u = new URL(url); } catch { return url; }
  if (!isIp(u.hostname)) return url;
  if(originalUrl) {
    try {
      const original=new URL(originalUrl), transport=new URL(transportUrl||connectInfo(originalUrl).url);
      // Only translate the origin actually used for this request. A real redirect stays foreign.
      if(u.origin!==transport.origin || original.protocol!==transport.protocol)return url;
      u.hostname=original.hostname;u.port=original.port;return u.toString();
    } catch { return url; }
  }
  const routes=ipBack.get(`${u.hostname}:${portOf(u)}`);
  if(!routes)return url;
  for(const [origin,expiresAt] of routes)if(Date.now()>=expiresAt)routes.delete(origin);
  if(routes.size!==1)return url; // An ambiguous reverse route must never guess another virtual host.
  const back=routes.keys().next().value;
  if (!back) return url;
  try{const original=new URL(back);if(original.protocol!==u.protocol)return url;u.hostname=original.hostname;u.port=original.port;}catch{return url;}
  return u.toString();
}

/** Test/temizlik için. */
export function _resetHostFailover(): void {cacheGeneration++;for(const flight of flights.values())flight.controller.abort();flights.clear();addressCache.clear();pins.clear();ipBack.clear();resolving.clear();negativeDoh.clear();}
/** Original HTTPS hostname is passed to OkHttp; DNS affects only socket routing. */
export async function fetchWithDns(url:string,init:any,maxBytes:number|undefined,timeoutMs:number,fallback:(url:string,init:any)=>Promise<any>):Promise<any>{
  const u=new URL(url);refreshNetwork();const pin=pins.get(keyOf(u));
  if(u.protocol==='https:'&&pin&&Date.now()<pin.expiresAt&&dnsBridge?.available&&maxBytes){
    const reply=await dnsBridge.dnsRoutedRequest(url,init.method||'GET',init.headers||{},typeof init.body==='string'?init.body:'',[pin.ip],timeoutMs,init.signal,maxBytes);
    if(!reply.status){pins.delete(keyOf(u));throw Object.assign(new Error(`DNS transport: ${reply.error||'NETWORK'}`),{kind:reply.error==='CANCELLED'?'CANCELLED':reply.error==='TIMEOUT'?'TIMEOUT':'NETWORK'});}
    if(reply.error==='BODY_LIMIT')throw Object.assign(new Error('DNS yanıt boyutu sınırı aşıldı'),{kind:'RESPONSE_TOO_LARGE'});
    const map=Object.fromEntries(Object.entries(reply.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
    return{status:reply.status,ok:reply.ok,url:reply.url||url,redirected:false,headers:{get:(k:string)=>map[k.toLowerCase()]||null},text:async()=>reply.body};
  }
  const conn=connectInfo(url);return fallback(conn.url,{...init,headers:conn.host?{...init.headers,Host:conn.host}:init.headers});
}
