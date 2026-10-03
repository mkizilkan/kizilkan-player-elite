/** MAC-independent portal discovery. Results are endpoint hints, never account sessions. */
import { portalDiscoveryCandidates, discoveryPortsFor, type MagHostEntry, type MagDiscoveryScope, MAG_MAX_PARALLEL } from "@/src/utils/magBulk";
import type { MagScanControl } from "@/src/utils/magBulkScan";
import type { MagProtectionObservation, StalkerRequestScope } from "@/src/utils/stalker";
import { recordDiagnostic } from "@/src/utils/diagnostics";

export type MagPortalCandidate = {
  endpoint: string; httpStatus: number; confidence: "api" | "fingerprint" | "protected";
  evidence: string[]; protection?: MagProtectionObservation; elapsedMs: number; selectable: boolean;
};
export type MagPortalDiscovery = {
  host: MagHostEntry; candidates: MagPortalCandidate[]; probes: number;
  state: "ready" | "not-found" | "protected" | "error"; message?: string;
};
export type MagPortalDiscoveryOptions = {
  scope?: MagDiscoveryScope; concurrency?: number; timeoutMs?: number; useProxy?: boolean; maxCandidatesPerHost?: number;
  control?: MagScanControl; gate?: Pick<StalkerRequestScope, "beforeRequest" | "onRateLimit">;
  onStage?: (message: string) => void; onHost?: (report: MagPortalDiscovery) => void;
  onProgress?: (done: number, total: number, current?: string) => void;
};
const BODY_LIMIT = 65536;
const MAX_EXTRA_ENDPOINTS = 64;
const fault = (kind: string, message: string): any => Object.assign(new Error(message), { kind });
const isCancelled = (control?: MagScanControl) => !!control?.signal?.aborted || !!control?.isCancelled?.();
function check(control?: MagScanControl): void { if (isCancelled(control)) throw fault("CANCELLED", "Portal keşfi iptal edildi"); }
async function pause(control?: MagScanControl): Promise<void> {
  check(control); if (control?.waitIfPaused) await controlled(control.waitIfPaused(), control); check(control);
}
async function controlled<T>(work: Promise<T>, control?: MagScanControl, signal?: AbortSignal, onStop?: () => void): Promise<T> {
  const settled = work.then(value => ({ done: true as const, value }));
  void settled.catch(() => undefined);
  while (true) {
    if (isCancelled(control) || signal?.aborted) { onStop?.(); throw fault(isCancelled(control) ? "CANCELLED" : "TIMEOUT", isCancelled(control) ? "Portal keşfi iptal edildi" : "Portal keşfi zaman aşımına uğradı"); }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let next: Awaited<typeof settled> | { done: false };
    try { next = await Promise.race([settled, new Promise<{ done: false }>(resolve => { timer = setTimeout(() => resolve({ done: false }), 50); })]); }
    finally { if (timer) clearTimeout(timer); }
    if (next.done) { if (isCancelled(control) || signal?.aborted) { onStop?.(); throw fault(isCancelled(control) ? "CANCELLED" : "TIMEOUT", isCancelled(control) ? "Portal keşfi iptal edildi" : "Portal keşfi zaman aşımına uğradı"); } return next.value; }
  }
}
async function wait(ms: number, control?: MagScanControl): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) { check(control); await new Promise(resolve => setTimeout(resolve, Math.min(100, end - Date.now()))); }
  check(control);
}
function localGate(control?: MagScanControl): Pick<StalkerRequestScope, "beforeRequest" | "onRateLimit"> {
  const hosts = new Map<string, { tail: Promise<void>; at: number; hold: number }>();
  const state = (url: string) => {
    const key = new URL(url).hostname.toLowerCase(); let current = hosts.get(key);
    if (!current) { current = { tail: Promise.resolve(), at: 0, hold: 0 }; hosts.set(key, current); } return current;
  };
  return {
    onRateLimit(url, ms) { const current = state(url); current.hold = Math.max(current.hold, Date.now() + Math.max(1000, ms)); },
    async beforeRequest(url) {
      const current = state(url), previous = current.tail; let release!: () => void; let reserved = false;
      current.tail = new Promise(resolve => { release = resolve; });
      try {
        await controlled(previous, control); reserved = true; await pause(control);
        while (true) { const remaining = Math.max(650 - (Date.now() - current.at), current.hold - Date.now()); if (remaining <= 0) break; await wait(Math.min(remaining, 100), control); await pause(control); }
        current.at = Date.now();
      } finally { if (reserved) release(); else void previous.then(release, release); }
    },
  };
}
function endpoint(value: string): string | null {
  try { const u = new URL(value); if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null; u.search = ""; u.hash = ""; return u.toString(); } catch { return null; }
}
/** v18.7.6: bir adayın portu (port-öncelikli budama için). */
function portOf(value: string): string {
  try { const u = new URL(value); return u.port || (u.protocol === "https:" ? "443" : "80"); } catch { return ""; }
}
/** Bağlantı reddi / zaman aşımı = port kapalı/filtreli; sunucu yanıtı (bizim fault'larımız) = açık. */
function isDeadPortError(error: any): boolean {
  const kind = String(error?.kind || "");
  if (["CANCELLED", "BODY_LIMIT", "FOREIGN_REDIRECT", "REDIRECT_LIMIT", "PROXY", "HTTP_SERVER"].includes(kind)) return false;
  return true; // TIMEOUT ve ham ağ hataları: o portta yol denemeye devam etme.
}
function basePath(value: string): string {
  let path = new URL(value).pathname.replace(/\/+$/, "");
  if (/\.php$/i.test(path)) return path.slice(0, path.lastIndexOf("/"));
  if (/\.(?:html?|js)$/i.test(path)) path = path.slice(0, path.lastIndexOf("/"));
  return path.replace(/\/(?:c|server)$/i, "");
}
function family(entry: MagHostEntry): string[] {
  const entered = endpoint(entry.host); if (!entered) return [];
  if (/\.php$/i.test(new URL(entered).pathname)) return [entered];
  const u = new URL(entered), base = basePath(entered);
  return Array.from(new Set([entered, ...["/c/", "/c/index.html", "/portal.php", "/server/load.php", "/server/portal.php", "/load.php", "/c/portal.php", "/c/server/load.php"].map(path => endpoint(u.origin + base + path)!).filter(Boolean)]));
}
function resolveLocal(raw: string, parent: string, base: string): string | null {
  try {
    const u = new URL(raw, parent), from = new URL(parent);
    if (u.origin !== from.origin || u.username || u.password || !/^https?:$/.test(u.protocol)) return null;
    const decoded = decodeURIComponent(u.pathname);
    if (decoded.includes("\\") || decoded.split("/").includes("..") || (base && !(decoded === base || decoded.startsWith(base + "/")))) return null;
    return endpoint(u.toString());
  } catch { return null; }
}
function utf8Length(text: string): number {
  let bytes = 0; for (const char of text) { const cp = char.codePointAt(0)!; bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; if (bytes > BODY_LIMIT) return bytes; } return bytes;
}
async function limitedText(response: any, signal?: AbortSignal): Promise<string> {
  if (Number(response.headers?.get?.("content-length")) > BODY_LIMIT) { try { void Promise.resolve(response.body?.cancel?.()).catch(() => undefined); } catch {} throw fault("BODY_LIMIT", "Portal yanıtı 64 KiB sınırını aşıyor"); }
  const reader = response.body?.getReader?.();
  if (!reader) {
    // RN versions without a readable body materialize text first. Native proxy uses a byte cap.
    const text = String(await response.text()); if (utf8Length(text) > BODY_LIMIT) throw fault("BODY_LIMIT", "Portal yanıtı 64 KiB sınırını aşıyor"); return text;
  }
  const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { try { void Promise.resolve(reader.cancel()).catch(() => undefined); } catch {} };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > BODY_LIMIT) throw fault("BODY_LIMIT", "Portal yanıtı 64 KiB sınırını aşıyor"); chunks.push(part.value); }
    const joined = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(joined);
    let encoded = ""; for (const byte of joined) encoded += "%" + byte.toString(16).padStart(2, "0");
    try { return decodeURIComponent(encoded); } catch { return ""; }
  } finally { signal?.removeEventListener("abort", cancel); try { await reader.cancel(); } catch {} }
}
function apiEvidence(body: string): string[] {
  let parsed: any; try { parsed = JSON.parse(body.replace(/^\uFEFF/, "").trim()); } catch { return []; }
  const js = parsed?.js; if (!js || typeof js !== "object" || Array.isArray(js)) return [];
  if (typeof js.token === "string" && js.token.trim()) return ["anonymous-stb-token"];
  const config = ["stb_type", "stb_lang", "allowed_stb_types", "portal_url", "default_timezone", "parent_password"].filter(key => js[key] != null && (typeof js[key] === "string" ? !!js[key].trim() : Array.isArray(js[key]) && js[key].length > 0));
  return config.length >= 2 ? config.map(key => "stb-field:" + key) : [];
}
function authEvidence(body: string): string[] {
  const text = body.trim();
  if (/^(?:authorization failed\.?|not authorized\.?|unauthorized\.?|authentication required\.?)$/i.test(text)) return ["stb-auth-denial", "mac-validation-required"];
  try {
    const js = JSON.parse(text)?.js;
    const message = typeof js?.error === "string" ? js.error : typeof js?.message === "string" ? js.message : "";
    if (/authorization failed|not authorized|unauthorized|authentication required/i.test(message)) return ["stb-auth-error-envelope", "mac-validation-required"];
  } catch {}
  return [];
}
function htmlEvidence(body: string): string[] {
  if (!/<(?:html|head|body|script)\b/i.test(body)) return [];
  const brand = /\b(?:stalker(?:[ _-]portal| middleware)?|ministra(?: tv)?|infomir)\b/i.test(body);
  const client = /(?:\bstb\.(?:Init|init|api|load|Get)|\bgSTB\b|\bJsHttpRequest\b|["'\/]stb(?:\.min)?\.js\b|\bMAG(?:200|250|254|256|320|322)\b)/i.test(body);
  return brand && client ? ["stalker-ministra-brand", "stb-client-marker"] : [];
}
function linkedApis(body: string, parent: string, base: string): string[] {
  const out = new Set<string>();
  const strings = body.matchAll(/["']([^"'\s<>]{1,300}(?:portal|load)\.php(?:\?[^"'\s<>]*)?)["']/gi);
  for (const match of strings) { const resolved = resolveLocal(match[1], parent, base); if (resolved) out.add(resolved); }
  return [...out].slice(0, 8);
}
function retryAfter(value: string): number {
  const ms = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.max(1000, ms) : 60000;
}
type Raw = { status: number; body: string; headers: Record<string, string>; finalUrl: string; elapsedMs: number };

export async function discoverMagHosts(hosts: MagHostEntry[], opts: MagPortalDiscoveryOptions = {}): Promise<MagPortalDiscovery[]> {
  const { observeMagProtection } = await import("@/src/utils/stalker");
  const gate = opts.gate || localGate(opts.control), timeoutMs = Math.max(250, Math.min(30000, Number(opts.timeoutMs) || 6000));
  const maxCandidates = Number.isFinite(opts.maxCandidatesPerHost) ? Math.max(1, Math.floor(opts.maxCandidatesPerHost!)) : Number.MAX_SAFE_INTEGER;
  const unique = hosts.filter((host, index, all) => all.findIndex(other => other.host === host.host && other.explicitPort === host.explicitPort) === index);
  const reports: MagPortalDiscovery[] = []; let cursor = 0, done = 0;
  const scan = async (host: MagHostEntry): Promise<MagPortalDiscovery> => {
    const report: MagPortalDiscovery = { host, candidates: [], probes: 0, state: "not-found" };
    const entered = endpoint(host.host); if (!entered) return { ...report, state: "error", message: "Geçersiz portal adresi" };
    const seen = new Set<string>(), planned = new Set<string>(), candidates = new Map<string, MagPortalCandidate>(); let lastError = ""; let stop = false;
    const scope = opts.scope || "fallback";
    // v18.7.6 (bulgu A4): PORT-ÖNCELİKLİ BUDAMA. İlk yol turu her portu bir kez dener;
    // bağlantı reddi/zaman aşımı alan port "dead" işaretlenir ve sonraki yollarda atlanır.
    // Böylece ölü portlarda 14 yol boşuna denenmez (kullanıcı: "757 versiyon").
    const portState = new Map<string, "open" | "dead">();
    const announceOpenPorts = () => {
      const open = [...portState.entries()].filter(([, s]) => s === "open").map(([p]) => p);
      if (open.length) opts.onStage?.(`Portal keşfi · açık portlar: ${open.join(", ")} · yollar deneniyor`);
    };
    // v18.7.6 (A3): aday bulundukça raporu CANLI yayınla (kullanıcı anında görsün).
    const emitLive = () => { report.candidates = [...candidates.values()]; opts.onHost?.({ ...report, candidates: report.candidates }); };
    const raw = async (url: string, base: string, redirects = 0): Promise<Raw> => {
      await pause(opts.control);
      const stage = (requests: number) => { const u = new URL(url); opts.onStage?.(`Portal keşfi · ${u.host}${u.pathname} · aday ${seen.size}/${Math.min(maxCandidates, planned.size)} · ${requests} istek`); };
      stage(report.probes);
      const controller = new AbortController(), parent = opts.control?.signal;
      const cancel = () => controller.abort(); parent?.addEventListener("abort", cancel, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await controlled(Promise.resolve(gate.beforeRequest?.(url, controller.signal)), opts.control, undefined, cancel);
        check(opts.control); timer = setTimeout(cancel, timeoutMs); const started = Date.now(); report.probes++; stage(report.probes);
        const headers = { Accept: "text/html, application/json;q=0.9, */*;q=0.1" };
        let response: any;
        if (opts.useProxy) {
          const { PanelScan } = await import("@/modules/panel-scan");
          const value = await controlled(PanelScan.proxiedRequest(url, "GET", headers, "", timeoutMs, controller.signal, BODY_LIMIT), opts.control, controller.signal, cancel);
          if (!(value.status > 0)) throw fault(value.error === "BODY_LIMIT" ? "BODY_LIMIT" : "PROXY", `Proxy keşfi başarısız: ${value.error || "proxy yok"}`);
          const map = Object.fromEntries(Object.entries(value.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
          response = { status: value.status, url, headers: { get: (key: string) => map[key.toLowerCase()] || "" }, text: async () => value.body };
        } else {
          // RN's global fetch ignores manual redirects and credentials:omit. Expo's
          // installed native transport disables redirects/cookies and streams the body.
          const { fetch: portalFetch } = await import("expo/fetch");
          check(opts.control);
          response = await controlled(portalFetch(url, { method: "GET", headers, credentials: "omit", redirect: "manual", signal: controller.signal }), opts.control, controller.signal, cancel);
        }
        const finalUrl = String(response.url || url);
        if (!resolveLocal(finalUrl, url, base)) throw fault("FOREIGN_REDIRECT", "Portal başka origin veya kurulum dizinine yönlendirdi");
        const location = String(response.headers?.get?.("location") || "");
        if (response.status >= 300 && response.status < 400 && location) {
          if (redirects >= 3) throw fault("REDIRECT_LIMIT", "Portal yönlendirme sınırını aşıyor");
          const next = resolveLocal(location, url, base); if (!next) throw fault("FOREIGN_REDIRECT", "Portal başka origin veya kurulum dizinine yönlendirdi");
          clearTimeout(timer); timer = undefined; return await raw(next, base, redirects + 1);
        }
        const body = await controlled(limitedText(response, controller.signal), opts.control, controller.signal, cancel);
        const result: Raw = { status: Number(response.status), body, headers: {}, finalUrl, elapsedMs: Date.now() - started };
        for (const key of ["content-type", "cf-mitigated", "retry-after"]) result.headers[key] = String(response.headers?.get?.(key) || "");
        return result;
      } finally { if (timer) clearTimeout(timer); parent?.removeEventListener("abort", cancel); }
    };
    const inspect = (target: string, response: Raw): MagPortalCandidate | null => {
      const protection = observeMagProtection({ endpoint: response.finalUrl, stage: "portal-discovery", status: response.status, body: response.body, headers: response.headers, transport: opts.useProxy ? "proxy" : "direct" });
      if (protection.state === "present") {
        if (protection.kind === "rate_limit") gate.onRateLimit?.(target, retryAfter(response.headers["retry-after"] || ""));
        stop = true; report.state = "protected"; report.message = protection.kind === "rate_limit" ? "Portal istek sınırı uyguladı; host keşfi durduruldu" : "Portal CAPTCHA/WAF doğrulaması istiyor; host keşfi durduruldu";
        return { endpoint: endpoint(response.finalUrl)!, httpStatus: response.status, confidence: "protected", evidence: protection.evidence, protection, elapsedMs: response.elapsedMs, selectable: false };
      }
      const evidence = response.status >= 200 && response.status < 300 ? apiEvidence(response.body) : [];
      if (evidence.length) return { endpoint: endpoint(response.finalUrl)!, httpStatus: response.status, confidence: "api", evidence, protection, elapsedMs: response.elapsedMs, selectable: true };
      if (/\.php$/i.test(new URL(target).pathname) && [200, 401, 403].includes(response.status)) {
        const auth = authEvidence(response.body);
        if (auth.length) return { endpoint: endpoint(response.finalUrl)!, httpStatus: response.status, confidence: "fingerprint", evidence: auth, protection, elapsedMs: response.elapsedMs, selectable: true };
        if (scope !== "all" && endpoint(target) === entered && response.status === 200) {
          try { const parsed = JSON.parse(response.body.trim()); if (parsed && Object.keys(parsed).length === 1 && Object.prototype.hasOwnProperty.call(parsed, "js") && parsed.js === null) return { endpoint: entered, httpStatus: response.status, confidence: "fingerprint", evidence: ["entered-api-envelope", "mac-validation-required"], protection, elapsedMs: response.elapsedMs, selectable: true }; } catch {}
        }
      }
      return null;
    };
    const probe = async (value: string, queue: string[]): Promise<void> => {
      const target = endpoint(value), key = target?.replace(/\/+$/, ""); if (!target || !key || seen.has(key) || stop || seen.size >= maxCandidates) return;
      // v18.7.6: bu portun kapalı olduğu kanıtlandıysa yol denemesini atla.
      const port = portOf(target);
      if (port && portState.get(port) === "dead") { void recordDiagnostic("scan", "MAG_DISCOVERY_PORT_SKIP", { port }); return; }
      planned.add(key); seen.add(key);
      const linked = candidates.get(target);
      if (linked?.confidence === "fingerprint") candidates.set(target, { ...linked, selectable: false, evidence: [...linked.evidence, "api-probe-unconfirmed"] });
      const base = basePath(target);
      let response: Raw;
      try { response = await raw(target, base); if (port) { const first = !portState.has(port); portState.set(port, "open"); if (first) announceOpenPorts(); } }
      catch (error: any) {
        if (port && isDeadPortError(error) && !portState.has(port)) { portState.set(port, "dead"); void recordDiagnostic("scan", "MAG_DISCOVERY_PORT_DEAD", { port }); }
        throw error;
      }
      let found = inspect(target, response);
      if (found) { candidates.set(found.endpoint, found); emitLive(); return; }
      if (response.status >= 500) throw fault("HTTP_SERVER", `Portal HTTP ${response.status} döndürdü; API doğrulanamadı`);
      const fingerprint = response.status >= 200 && response.status < 300 ? htmlEvidence(response.body) : [];
      if (fingerprint.length && !/\.php$/i.test(new URL(target).pathname)) {
        // Compare a same-family missing page only after strong HTML evidence. Literal PHP is exact.
        let same = false;
        try {
          const baseline = await raw(new URL(target).origin + base + "/c/__kz_portal_not_found__.html", base);
          const baselineProtection = inspect(target, baseline);
          if (baselineProtection?.confidence === "protected") { candidates.set(baselineProtection.endpoint, baselineProtection); return; }
          if ([200, 404].includes(baseline.status)) same = baseline.body.trim().replace(/\s+/g, " ") === response.body.trim().replace(/\s+/g, " ");
        } catch (error: any) { if (isCancelled(opts.control) || error?.kind === "CANCELLED") throw error; }
        if (!same) {
          const links = linkedApis(response.body, response.finalUrl, base);
          for (const link of links) {
            if (queue.length < MAX_EXTRA_ENDPOINTS && !queue.includes(link)) { queue.push(link); planned.add(link.replace(/\/+$/, "")); }
            if (!seen.has(link.replace(/\/+$/, ""))) candidates.set(link, { endpoint: link, httpStatus: response.status, confidence: "fingerprint", evidence: [...fingerprint, "same-family-api-link"], elapsedMs: response.elapsedMs, selectable: true });
          }
          if (!links.length) candidates.set(target, { endpoint: target, httpStatus: response.status, confidence: "fingerprint", evidence: fingerprint, elapsedMs: response.elapsedMs, selectable: false });
          emitLive();
        }
      }
      if (stop || response.status === 404 || !/\.php$/i.test(new URL(target).pathname)) return;
      const u = new URL(target); u.search = new URLSearchParams({ type: "stb", action: "handshake", JsHttpRequest: "1-xml" }).toString();
      found = inspect(target, await raw(u.toString(), base)); if (found) { candidates.set(found.endpoint, found); emitLive(); }
    };
    const sweep = async (plan: string[]): Promise<void> => {
      for (const value of plan) { const target = endpoint(value); if (target) planned.add(target.replace(/\/+$/, "")); }
      const extra: string[] = [];
      for (const target of plan) { if (stop || seen.size >= maxCandidates) break; try { await probe(target, extra); } catch (error: any) { if (isCancelled(opts.control) || error?.kind === "CANCELLED") throw error; lastError = String(error?.message || error).slice(0, 180); if (["PROXY", "FOREIGN_REDIRECT"].includes(error?.kind)) { report.state = "error"; stop = true; } } }
      for (let index = 0; index < extra.length && !stop; index++) { try { await probe(extra[index], extra); } catch (error: any) { if (isCancelled(opts.control) || error?.kind === "CANCELLED") throw error; lastError = String(error?.message || error).slice(0, 180); } }
    };
    // v18.7.6 — PARALEL PORT ERİŞİLEBİLİRLİK. Çok-portlu keşiften önce portların açık/kapalı
    // durumu PARALEL ve gate'siz (her port ayrı TCP ucu; portal API'si değil → ban riski yok)
    // bulunur; sonra yalnız AÇIK portlarda yol/API denemesi yapılır (aralıklı gate korunur).
    // Böylece 57 portu sırayla 650 ms aralıkla denemek (~37 sn) yerine tek timeout penceresinde
    // açık portlar bulunur. Hiç açık bulunamazsa eski geniş sweep'e düşülür.
    const reachProbe = async (portUrl: string, ms: number): Promise<boolean> => {
      const controller = new AbortController(), parent = opts.control?.signal;
      const onAbort = () => controller.abort(); parent?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), ms);
      try {
        if (opts.useProxy) {
          const { PanelScan } = await import("@/modules/panel-scan");
          const v = await PanelScan.proxiedRequest(portUrl, "GET", { Accept: "*/*" }, "", ms, controller.signal, 1024);
          return Number(v.status) > 0;
        }
        const { fetch: portalFetch } = await import("expo/fetch");
        const r = await portalFetch(portUrl, { method: "GET", headers: { Accept: "*/*" }, credentials: "omit", redirect: "manual", signal: controller.signal });
        return Number(r.status) > 0;
      } catch { return false; } finally { clearTimeout(timer); parent?.removeEventListener("abort", onAbort); }
    };
    const reachableOpenPorts = async (): Promise<string[]> => {
      const ports = discoveryPortsFor(host, { allPorts: true });
      if (ports.length <= 1) return ports;
      // Kullanıcı portu açıkça verdiyse paralel ön-tarama YAPMA: "all" kapsamı normal
      // aralıklı/protection-aware gated sweep ile genişler (ban-güvenli). Paralel reachability
      // yalnız port BİLİNMEYEN gerçek keşifte devreye girer (asıl yavaş senaryo).
      if (host.hasPort) return ports;
      const u0 = new URL(entered), givenPort = u0.port || (u0.protocol === "https:" ? "443" : "80");
      const reachTimeout = Math.max(1500, Math.min(timeoutMs, 4000));
      const open: string[] = []; let idx = 0;
      const limit = Math.min(ports.length, Math.max(6, Math.min(MAG_MAX_PARALLEL, Math.floor(Number(opts.concurrency) || 6))));
      opts.onStage?.(`Portal keşfi · ${u0.hostname} · ${ports.length} port paralel taranıyor`);
      const w = async () => {
        while (true) {
          await pause(opts.control);
          const i = idx++; if (i >= ports.length || stop) return;
          const p = ports[i];
          if (portState.has(p)) { if (portState.get(p) === "open" && !open.includes(p)) open.push(p); continue; }
          const scheme = p === givenPort ? u0.protocol.replace(":", "") : ["443", "8443", "2053", "2083", "2087", "2096"].includes(p) ? "https" : "http";
          const ok = await reachProbe(`${scheme}://${u0.hostname}:${p}/`, reachTimeout);
          portState.set(p, ok ? "open" : "dead");
          if (ok) { open.push(p); announceOpenPorts(); }
        }
      };
      await Promise.all(Array.from({ length: limit }, () => w()));
      check(opts.control);
      // Açık portları öncelik sırasında tut.
      const ordered = ports.filter((p: string) => open.includes(p));
      void recordDiagnostic("scan", "MAG_DISCOVERY_PORT_SCAN", { host: u0.hostname, scanned: ports.length, open: ordered.length, parallel: limit });
      return ordered.length ? ordered : ports;
    };
    const allPortsPlan = async () => portalDiscoveryCandidates(host, { allPorts: true, ports: await reachableOpenPorts() });
    await sweep(scope === "all" ? [entered, ...(await allPortsPlan())] : family(host));
    if (!stop && scope === "fallback" && ![...candidates.values()].some(candidate => candidate.selectable)) await sweep(await allPortsPlan());
    report.candidates = [...candidates.values()];
    if (!stop) report.state = report.candidates.some(candidate => candidate.selectable) ? "ready" : lastError ? "error" : "not-found";
    if (lastError && report.state === "error") report.message = lastError;
    else if (report.state === "not-found" && seen.size >= maxCandidates) report.message = `Portal aday sınırına ulaşıldı (${maxCandidates}); bu kapsamda API doğrulanamadı`;
    return report;
  };
  const worker = async () => {
    while (true) { await pause(opts.control); const index = cursor++; if (index >= unique.length) return; const host = unique[index]; opts.onProgress?.(done, unique.length, host.raw); const report = await scan(host); check(opts.control); reports.push(report); done++; opts.onHost?.(report); opts.onProgress?.(done, unique.length, host.raw); }
  };
  const concurrency = Math.max(1, Math.min(MAG_MAX_PARALLEL, Math.floor(Number(opts.concurrency) || 3)));
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));
  return reports;
}
