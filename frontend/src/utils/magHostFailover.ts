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
 * kontrolleri bozulmaz, saklanan endpoint hostname kalır). Yalnız HTTP; HTTPS (SNI)
 * dokunulmaz. DoH yalnız çoklu A kaydı olan hostlarda devreye girer (tek IP → gereksiz).
 * ===========================================================================
 */
import { recordDiagnostic } from "@/src/utils/diagnostics";
import type { MagDiscoveryBudget } from '@/src/utils/magDiscoveryBudget';

type Pin = { ip: string; at: number };
const pins = new Map<string, Pin>();              // "hostname:port" -> canlı IP
const ipBack = new Map<string, string>();         // "ip:port" -> "hostname:port"
const resolving = new Map<string, Promise<void>>(); // host başına tek uçuş
const negativeDoh = new Map<string, number>();    // DoH başarısız host -> zaman
const PIN_TTL = 5 * 60_000;
const NEG_TTL = 60_000;
/**
 * Yalnız gerçek React Native çalışma ortamında aktif (navigator.product === "ReactNative").
 * Node/VM test koşumlarında kapalıdır → fixture fetch sayımları ve davranışları değişmez.
 * Testler `_setHostFailoverEnabled(true)` ile açıkça açar.
 */
let enabled = (globalThis as any)?.navigator?.product === "ReactNative";
export function _setHostFailoverEnabled(value: boolean): void { enabled = !!value; }

function isIpv4(value: string): boolean { return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value); }
function portOf(u: URL): string { return u.port || (u.protocol === "https:" ? "443" : "80"); }
function keyOf(u: URL): string { return `${u.hostname}:${portOf(u)}`; }

/** DoH ile hostun tüm IPv4 A kayıtları (dns.google → cloudflare yedek). Başarısızsa []. */
async function dohResolveAll(hostname: string, signal?: AbortSignal, budget?: MagDiscoveryBudget): Promise<string[]> {
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
      if (ips.length) return Array.from(new Set(ips));
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
  let u: URL; try { u = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`); } catch { return; }
  if (u.protocol !== "http:" || isIpv4(u.hostname)) return;
  const key = keyOf(u);
  const pinned = pins.get(key);
  if (pinned && Date.now() - pinned.at < PIN_TTL) return;
  if ((negativeDoh.get(key) || 0) > Date.now() - NEG_TTL) return;
  const inflight = resolving.get(key);
  if (inflight) return inflight;
  const task = (async () => {
    const started = Date.now();
    const ips = await dohResolveAll(u.hostname, signal, budget);
    if (signal?.aborted) return;
    if (ips.length <= 1) { negativeDoh.set(key, Date.now()); return; } // tek/sıfır IP → failover gereksiz
    const port = portOf(u);
    let live = "";
    // Paralel yokla; ilk canlıyı sabitle (hepsini beklemeden erken dönülür).
    await new Promise<void>(resolve => {
      let pending = ips.length;
      let done = false;
      for (const ip of ips) {
        void probeIp(ip, port, u.hostname, 2500, signal, budget).then(ok => {
          if (ok && !live) { live = ip; }
          if ((ok && !done) || --pending === 0) { if (!done) { done = true; resolve(); } }
        });
      }
    });
    if (signal?.aborted) return;
    if (live) {
      pins.set(key, { ip: live, at: Date.now() });
      ipBack.set(`${live}:${port}`, key);
      void recordDiagnostic("scan", "MAG_HOST_IP_FAILOVER", { host: u.hostname, aRecords: ips.length, elapsedMs: Date.now() - started });
    } else {
      negativeDoh.set(key, Date.now());
      void recordDiagnostic("scan", "MAG_HOST_IP_FAILOVER_NONE", { host: u.hostname, aRecords: ips.length, elapsedMs: Date.now() - started });
    }
  })().finally(() => resolving.delete(key));
  resolving.set(key, task);
  return task;
}

/**
 * Bağlantı için IP'ye çevrilmiş URL + Host başlığı. Pin yoksa URL aynen döner, host boş.
 * IP yalnız burada (fetch sınırında) görünür; iç mantık hostname'i kullanmaya devam eder.
 */
export function connectInfo(url: string): { url: string; host?: string } {
  if (!enabled) return { url };
  let u: URL; try { u = new URL(url); } catch { return { url }; }
  if (u.protocol !== "http:" || isIpv4(u.hostname)) return { url };
  const pin = pins.get(keyOf(u));
  if (!pin || Date.now() - pin.at >= PIN_TTL) return { url };
  const host = u.host;
  u.hostname = pin.ip;
  return { url: u.toString(), host };
}

/** IP'ye çevrilmiş bir yanıt URL'ini mantıksal hostname URL'ine geri çevirir (origin kontrolleri için). */
export function logicalUrl(url: string): string {
  let u: URL; try { u = new URL(url); } catch { return url; }
  if (!isIpv4(u.hostname)) return url;
  const back = ipBack.get(`${u.hostname}:${portOf(u)}`);
  if (!back) return url;
  const [host, port] = back.split(":");
  u.hostname = host;
  if (port && port !== (u.protocol === "https:" ? "443" : "80")) u.port = port; else u.port = "";
  return u.toString();
}

/** Test/temizlik için. */
export function _resetHostFailover(): void { pins.clear(); ipBack.clear(); resolving.clear(); negativeDoh.clear(); }
