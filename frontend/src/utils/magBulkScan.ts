/** Çoklu MAG analizi: kullanıcı kapsamı, işlem sahipliği, ortak host temposu ve kanıtlı sonuçlar. */
import type { AccountInfo, PlaylistEndpoint } from "@/src/types";
import type { StalkerCreds, StalkerRequestScope, MagProtectionObservation } from "@/src/utils/stalker";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import { discoverMagHosts, type MagPortalDiscovery } from "@/src/utils/magPortalDiscovery";
import { MAG_MAX_PARALLEL, type MagBulkJob, type MagHostEntry, type MagDiscoveryScope } from "@/src/utils/magBulk";
import { MagDiscoveryBudget, magPassiveDiscoveryBudget, type MagDiscoverySpeed } from '@/src/utils/magDiscoveryBudget';
import { resolveMagPortal, type ResolvedMagPortal } from '@/src/utils/magEndpointRegistry';

// v18.7.16 (A): "probable" = hesap kimliği + gelecek bitiş var ama içerik erişim örneği (çökük host/süre
// bütçesi) alınamadı. "unverified"ten ayrılır: kullanıcı isterse eklenebilir (uyarı etiketiyle).
export type MagScanCategory = "valid" | "probable" | "unverified" | "expired" | "blocked" | "protected" | "no-portal" | "error";
export type MagScanResult = {
  hostRaw: string; portal: string; mac: string; category: MagScanCategory;
  status?: string; expiry?: string | null; liveCount?: number; message?: string;
  accountInfo?: AccountInfo;
  protection?: MagProtectionObservation;
  verificationEvidence?: string[];
  resolvedPortal?: ResolvedMagPortal;
  endpoints?: PlaylistEndpoint[];
  categories?: { live?: string[]; vod?: string[]; series?: string[]; warnings?: string[] };
};
/** Rate limits are temporary; CAPTCHA/WAF/challenges never enter an automatic retry. */
export function isUncertainMagResult(result: MagScanResult): boolean {
  return ["error", "unverified", "probable", "no-portal"].includes(result.category)
    || (result.category === "protected" && result.protection?.kind === "rate_limit");
}
function failureObservation(error: any, previous: MagProtectionObservation): MagProtectionObservation {
  if (error?.observation) return error.observation;
  if (error?.kind === "MAG_RATE_LIMIT") return { ...previous, state: "present", kind: "rate_limit",
    httpStatus: Number(error?.status) || previous.httpStatus, evidence: [...previous.evidence, "rate-limit-stop"] };
  return previous;
}
export type MagScanControl = { isCancelled?: () => boolean; waitIfPaused?: () => Promise<void>; signal?: AbortSignal };
export type MagScanOptions = {
  concurrency?: number; useProxy?: boolean; scope?: MagDiscoveryScope;
  maxCandidatesPerHost?: number; timeoutMs?: number;
  onPhase?: (phase: "discovery" | "selection" | "accounts") => void;
  onPortalDiscovery?: (reports: MagPortalDiscovery[]) => void;
  selectPortals?: (reports: MagPortalDiscovery[]) => Promise<Record<string, string>>;
  onResult?: (r: MagScanResult) => void | Promise<void>;
  onProgress?: (done: number, total: number, current?: string) => void;
  onStage?: (msg: string) => void;
  control?: MagScanControl;
  discoverySpeed?: MagDiscoverySpeed;
  retryPass?: boolean;
  /** Retry an already selected endpoint without opening another discovery/selection phase. */
  lockedEndpoints?: boolean;
  hostGroups?: Record<string,string>;
  requestGate?: Pick<StalkerRequestScope,'beforeRequest'|'onRateLimit'|'onObservation'>;
  onRetry?: (job:MagBulkJob,state:'pending'|'resolved'|'unresolved',attempt:number) => Promise<void>;
};

function cancelled(control?: MagScanControl): boolean { return !!control?.signal?.aborted || !!control?.isCancelled?.(); }
function checkCancelled(control?: MagScanControl): void {
  if (cancelled(control)) { const e: any = new Error("MAG analizi iptal edildi"); e.kind = "CANCELLED"; throw e; }
}
function aborted(error: any): boolean { return ["CANCELLED", "BACKGROUND_PAUSE"].includes(String(error?.kind || "")); }
async function delay(ms: number, control?: MagScanControl): Promise<void> {
  checkCancelled(control);
  await new Promise<void>((resolve, reject) => {
    const signal = control?.signal;
    const done = () => { signal?.removeEventListener("abort", stop); resolve(); };
    const timer = setTimeout(done, ms);
    const stop = () => { clearTimeout(timer); signal?.removeEventListener("abort", stop); const e: any = new Error("MAG analizi iptal edildi"); e.kind = "CANCELLED"; reject(e); };
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
  });
  checkCancelled(control);
}
function hostname(url: string): string { try { return new URL(url).hostname.toLowerCase(); } catch { return url; } }
async function waitControlled<T>(work: Promise<T>, control?: MagScanControl): Promise<T> {
  const finished = work.then(value => ({ done: true as const, value }));
  void finished.catch(() => undefined);
  while (true) {
    checkCancelled(control);
    const next = await Promise.race([finished, delay(100, control).then(() => ({ done: false as const }))]);
    if (next.done) return next.value;
  }
}

/** Bir çalışmadaki bütün MAC'ler/portlar aynı host sınırını paylaşır; oynatmaya etki etmez. */
export function createMagRequestGate(control?: MagScanControl, onStage?: (message: string) => void, groups?:Record<string,string>): Pick<StalkerRequestScope, "beforeRequest" | "onRateLimit" | "onObservation"> {
  const hostState = new Map<string, { tail: Promise<void>; lastAt: number; holdUntil: number; announced: number; interval: number; successes: number; protection?:MagProtectionObservation }>();
  const stateFor = (url: string) => {
    const key = groups?.[hostname(url)] || hostname(url); let state = hostState.get(key);
    if (!state) { state = { tail: Promise.resolve(), lastAt: 0, holdUntil: 0, announced: 0, interval:650, successes:0 }; hostState.set(key, state); }
    return state;
  };
  return {
    onObservation(observation) {
      const state=stateFor(observation.endpoint);
      if(observation.state==='present' && observation.kind!=='rate_limit')state.protection=observation;
      if(observation.state==='not_observed' && observation.httpStatus===200){if(++state.successes>=8){state.interval=Math.max(650,Math.floor(state.interval*.9));state.successes=0;}}
    },
    onRateLimit(url, retryAfterMs) {
      const state = stateFor(url);
      state.interval=Math.min(5000,state.interval*2);state.successes=0;
      state.holdUntil = Math.max(state.holdUntil, Date.now() + Math.max(1000, retryAfterMs));
      state.announced = 0;
      onStage?.(`Portal istek sınırı · ${hostname(url)} · aynı hosttaki analizler bekletiliyor`);
    },
    async beforeRequest(url, requestSignal) {
      const requestControl: MagScanControl = { ...control, signal: requestSignal || control?.signal,
        isCancelled: () => cancelled(control) || !!requestSignal?.aborted };
      const state = stateFor(url);
      const previous = state.tail;
      let release!: () => void;
      state.tail = new Promise<void>(resolve => { release = resolve; });
      let reserved = false;
      try {
        await waitControlled(previous, requestControl); reserved = true;
        checkCancelled(requestControl);
        if (control?.waitIfPaused) await waitControlled(control.waitIfPaused(), requestControl);
        checkCancelled(requestControl);
        while (true) {
          if(state.protection)throw Object.assign(new Error('Bu çalışmada host koruması görüldü; yeni istekler durduruldu.'),{kind:'MAG_PROTECTION',observation:state.protection});
          const now = Date.now();
          const remaining = Math.max(state.holdUntil - now, state.interval - (now - state.lastAt));
          if (remaining <= 0) break;
          if (state.holdUntil > now && now - state.announced >= 1000) {
            state.announced = now;
            onStage?.(`Portal istek sınırı · ${hostname(url)} · ${Math.ceil((state.holdUntil - now) / 1000)} sn bekleniyor`);
          }
          await delay(Math.min(remaining, 250), requestControl);
          if (control?.waitIfPaused) await waitControlled(control.waitIfPaused(), requestControl);
          checkCancelled(requestControl);
        }
        state.lastAt = Date.now();
      } finally {
        // A cancelled waiter must not open a gap in the host reservation chain.
        if (reserved) release(); else void previous.then(release, release);
      }
    },
  };
}

/** A later terminal host observation invalidates earlier candidates for this run. */
function selectablePortalCandidates(report?: MagPortalDiscovery) {
  return report?.state === "ready"
    ? report.candidates.filter(c => c.selectable && c.confidence !== "protected")
    : [];
}

/** A proven API ranks ahead of an accessible client fingerprint; HTTP 200 alone never suffices. */
export function chooseMagPortals(reports: MagPortalDiscovery[]): Record<string, string> {
  const choices: Record<string, string> = {};
  for (const report of reports) {
    const candidates = selectablePortalCandidates(report);
    candidates.sort((a, b) => {
      const score = (c: typeof a) => (c.confidence === "api" ? 100 : 0) + (c.httpStatus === 200 ? 10 : 0)
        + (c.protection?.state === "present" ? -50 : 0);
      return score(b) - score(a) || a.elapsedMs - b.elapsedMs || a.endpoint.localeCompare(b.endpoint);
    });
    if (candidates[0]) choices[report.host.host] = candidates[0].endpoint;
  }
  return choices;
}
function unknownObservation(portal: string, proxy: boolean): MagProtectionObservation {
  return { state: "unknown", kind: "unknown", endpoint: portal, stage: "analysis", evidence: [], observedAt: new Date().toISOString(), transport: proxy ? "proxy" : "direct" };
}

/** Complete MAC-free discovery once per entered host before any supplied MAC is transmitted. */
export async function runMagBulkScan(jobs: MagBulkJob[], opts: MagScanOptions = {}): Promise<MagScanResult[]> {
  // Restored work keeps its original scope; a selected API never reopens discovery.
  if(jobs.some(j=>j.retryScope!==undefined || j.selectedEndpoint!==undefined)) {
    const gate=opts.requestGate||createMagRequestGate(opts.control,opts.onStage,opts.hostGroups);
    const groups=new Map<string,MagBulkJob[]>();
    for(const job of jobs){const key=JSON.stringify([job.retryScope||opts.scope||'exact',!!job.selectedEndpoint]);const group=groups.get(key)||[];group.push(job);groups.set(key,group);}
    const restored:MagScanResult[]=[];let completed=0;
    for(const [key,group]of groups){checkCancelled(opts.control);const [scope,locked]=JSON.parse(key);
      for(const job of group)await opts.onRetry?.(job,'pending',0);
      const plain=group.map(({retryScope,selectedEndpoint,...job})=>job);
      const next=await runMagBulkScan(plain,{...opts,scope,requestGate:gate,retryPass:true,lockedEndpoints:locked,selectPortals:locked?undefined:opts.selectPortals,onProgress:(done,_total,current)=>opts.onProgress?.(completed+done,jobs.length,current)});
      restored.push(...next);completed+=group.length;
    }
    return restored;
  }
  const concurrency = Math.max(1, Math.min(MAG_MAX_PARALLEL, Math.floor(Number(opts.concurrency) || 3)));
  const scope = opts.scope;
  const budgets = new Map<string, MagDiscoveryBudget>();
  const passiveBudgets = new Map<string, MagDiscoveryBudget>();
  const budgetForHost = (host: MagHostEntry) => {
    const key = hostname(host.host); let budget = budgets.get(key);
    if (!budget) { budget = new MagDiscoveryBudget({ signal: opts.control?.signal, speed: opts.discoverySpeed }); budgets.set(key, budget); }
    return budget;
  };
  try {
  const results: MagScanResult[] = [];
  const gate = opts.requestGate || createMagRequestGate(opts.control, opts.onStage,opts.hostGroups);
  const { stalkerLogin, stalkerVerifyAccount, discoverMagPortal } = await import("@/src/utils/stalker");
  const { portalDiscoveryCandidates } = await import("@/src/utils/magBulk");
  const uniqueHosts = new Map<string, MagHostEntry>();
  for (const job of jobs) if (!uniqueHosts.has(job.portal)) uniqueHosts.set(job.portal, {
    raw: job.hostRaw, host: job.portal, hasPort: job.hasPort, explicitPort: job.explicitPort, hasPath: job.hasPath,
  });
  void recordDiagnostic("scan", "MAG_BULK_SCAN_START", { jobs: jobs.length, hosts: uniqueHosts.size, concurrency, proxy: !!opts.useProxy, scope });
  opts.onPhase?.("discovery");
  let reports: MagPortalDiscovery[];
  const completedReports: MagPortalDiscovery[] = [];
  try {
    reports = opts.lockedEndpoints ? Array.from(uniqueHosts.values()).map(host=>({host,state:'ready' as const,probes:0,candidates:[{endpoint:host.host,confidence:'fingerprint' as const,httpStatus:0,elapsedMs:0,selectable:true,evidence:['previously-selected-endpoint']}]})) : await discoverMagHosts(Array.from(uniqueHosts.values()), {
      scope, concurrency, timeoutMs: opts.timeoutMs, useProxy: opts.useProxy, control: opts.control, gate,
      budgetForHost: host => {
        const key = hostname(host.host); let passive = passiveBudgets.get(key);
        if (!passive) { passive = magPassiveDiscoveryBudget(budgetForHost(host)); passiveBudgets.set(key, passive); }
        return passive;
      },
      maxCandidatesPerHost: opts.maxCandidatesPerHost,
      // v18.7.6 (A3): host başına UPSERT — aday bulundukça canlı güncellenir (çift blok yok).
      onHost: report => {
        const i = completedReports.findIndex(r => r.host.host === report.host.host);
        if (i >= 0) completedReports[i] = report; else completedReports.push(report);
        opts.onPortalDiscovery?.([...completedReports]);
      },
      onStage: opts.onStage, onProgress: (done, total, current) => opts.onProgress?.(done, total, current),
    });
    checkCancelled(opts.control);
    if(!opts.lockedEndpoints)opts.onPortalDiscovery?.(reports);
  } catch (error: any) {
    if (aborted(error) || cancelled(opts.control)) return results;
    throw error;
  }
  const reportByHost = new Map(reports.map(report => [report.host.host, report]));
  // v18.7.10 — HANDSHAKE YEDEĞİ. Pasif keşif bir host'ta seçilebilir aday bulamazsa (panel-c gibi
  // "izsiz" portaller ya da /c/ redirect'i), TEKLİ eklemedeki gibi bir MAC ile GERÇEK handshake
  // keşfi (discoverMagPortal) yapılır. Bulunan endpoint, seçilebilir aday olarak rapora eklenir →
  // hem otomatik/manuel seçimde görünür hem de sonraki hesap doğrulaması bu endpoint'te çalışır.
  for (const [hostKey, hostEntry] of uniqueHosts) {
    if (cancelled(opts.control)) return results;
    const existing = reportByHost.get(hostKey);
    if (selectablePortalCandidates(existing).length > 0) continue;
    const budget = budgetForHost(hostEntry);
    if (budget.exhausted) { if (existing) existing.message = 'Host keşif bütçesi doldu; ek handshake denenmedi.'; continue; }
    // M02 — KORUMALI / İSTEK-SINIRLI host'ta handshake yedeği ÇALIŞMAZ. Pasif keşif WAF/CAPTCHA/429
    // gördüyse gerçek handshake atmak koruma durdurmasını deler; host olduğu gibi bırakılır.
    if (existing?.state === "protected" || existing?.candidates.some(c => c.protection?.state === "present")) {
      void recordDiagnostic("scan", "MAG_BULK_HANDSHAKE_FALLBACK_SKIP", { host: hostEntry.raw, reason: "protected" });
      continue;
    }
    const firstJob = jobs.find(job => job.portal === hostKey);
    if (!firstJob) continue;
    // v18.7.13: "Yalnız girilen" (exact) → KATİ: yalnız girilen endpoint; başka yol/port denenmez.
    // M03 — literal `.php` girişte YALNIZ o endpoint; dizin / `/c/` girişte kurulum ailesi (fallback/all).
    const isLiteralPhp = (() => { try { return /\.php$/i.test(new URL(hostEntry.host).pathname); } catch { return false; } })();
    const scope = opts.scope || (isLiteralPhp ? 'exact' : 'fallback');
    const candidates = (scope === "exact" || isLiteralPhp) ? [hostEntry.host] : portalDiscoveryCandidates(hostEntry, { allPorts: !hostEntry.hasPort });
    if (!candidates.length) continue;
    // M04 — tek MAC'in handshake reddi host'u "portalsız" yapmasın: ilk birkaç DISTINCT MAC denenir.
    const hostMacs: string[] = [];
    for (const job of jobs) if (job.portal === hostKey && !hostMacs.includes(job.mac)) { hostMacs.push(job.mac); if (hostMacs.length >= 3) break; }
    if (!hostMacs.length) continue;
    opts.onStage?.("Pasif keşif boş · gerçek handshake ile portal aranıyor…");
    void recordDiagnostic("scan", "MAG_BULK_HANDSHAKE_FALLBACK_START", { host: firstJob.hostRaw, candidates: candidates.length, hasPort: !!hostEntry.hasPort, macs: hostMacs.length });
    let found: { endpoint: string; token: string; resolvedPortal?: ResolvedMagPortal } | null = null;
    let protectedStop = false;
    for (const mac of hostMacs) {
      if (found?.endpoint || protectedStop || cancelled(opts.control) || budget.exhausted) break;
      let observation = unknownObservation(hostKey, !!opts.useProxy);
      const requestScope: StalkerRequestScope = {
        ...gate, transport: opts.useProxy ? "proxy" : "direct", signal: opts.control?.signal, timeoutMs: opts.timeoutMs,
        discoveryBudget: budget,
        onObservation(next) { gate.onObservation?.(next);if (observation.state !== "present" || next.state === "present") observation = next; },
      };
      const probeCred: StalkerCreds = { portal: hostKey, mac, requestScope };
      try {
        found = await discoverMagPortal(probeCred, candidates, {
          timeoutMs: opts.timeoutMs ?? 6000, maxCandidates: hostEntry.hasPort ? candidates.length : 48, signal: opts.control?.signal,
          onProbe: (_endpoint, index, total) => opts.onStage?.(`Handshake keşfi · ${index + 1}/${total}`),
        });
      } catch (error: any) {
        if (aborted(error) || cancelled(opts.control)) return results;
        const kind = String(error?.kind || "");
        if (kind === 'MAG_DISCOVERY_BUDGET') break;
        // Koruma/istek sınırı terminaldir: başka MAC denenmez, host koruma olarak işaretlenir (M02 ile tutarlı).
        if (kind === "MAG_PROTECTION" || kind === "MAG_RATE_LIMIT") {
          protectedStop = true;
          const protection = failureObservation(error, observation);
          const candidate: MagPortalDiscovery["candidates"][number] = { endpoint: protection.endpoint || hostKey,
            httpStatus: protection.httpStatus || 0, confidence: "protected", selectable: false,
            evidence: protection.evidence, elapsedMs: 0, protection };
          const terminal = existing || { host: hostEntry, candidates: [], probes: 0, state: "protected" as const };
          terminal.state = "protected"; terminal.message = "Portal koruması / istek sınırı; handshake yedeği durduruldu";
          terminal.candidates = [candidate, ...terminal.candidates.filter(c => c.endpoint !== candidate.endpoint)];
          if (!existing) { reports.push(terminal); reportByHost.set(hostKey, terminal); }
          opts.onPortalDiscovery?.([...reports]);
          void recordDiagnostic("scan", "MAG_BULK_HANDSHAKE_FALLBACK_PROTECTED", { host: firstJob.hostRaw, kind });
        } else {
          void recordDiagnostic("scan", "MAG_BULK_HANDSHAKE_FALLBACK_ERROR", { host: firstJob.hostRaw, message: String(error?.message || error).slice(0, 160) });
        }
      }
    }
    if (found?.endpoint) {
      const foundEndpoint = found.endpoint;
      const synthetic: MagPortalDiscovery["candidates"][number] = {
        endpoint: foundEndpoint, httpStatus: 200, confidence: "api",
        evidence: ["handshake-token", "discovered-by-handshake"], elapsedMs: 0, selectable: true,
        resolvedPortal: found.resolvedPortal || resolveMagPortal(hostEntry.host, foundEndpoint, ['handshake-token'], 'handshake'),
      };
      if (existing) { existing.candidates = [synthetic, ...existing.candidates.filter(c => c.endpoint !== foundEndpoint)]; existing.state = "ready"; existing.message = undefined; }
      else { const r: MagPortalDiscovery = { host: hostEntry, candidates: [synthetic], probes: 0, state: "ready" }; reports.push(r); reportByHost.set(hostKey, r); }
      opts.onPortalDiscovery?.([...reports]);
      void recordDiagnostic("scan", "MAG_BULK_HANDSHAKE_FALLBACK_OK", { host: firstJob.hostRaw, endpointPath: (() => { try { return new URL(foundEndpoint).pathname; } catch { return ""; } })() });
    } else if (!protectedStop) {
      // M06 — handshake yedeği de bulamadıysa host "KESİN portalsız" DEĞİL; bounded keşif (sınırlı
      // port/yol) tamamlanamamış olabilir. Mesaj buna göre yazılır; durum enum'u değişmez (regresyon yok).
      if (existing && existing.state !== "error") existing.message = existing.message || "Bu kapsamda portal doğrulanamadı (keşif + handshake denendi); port/yol genişletmeyi deneyin.";
      void recordDiagnostic("scan", "MAG_BULK_HANDSHAKE_FALLBACK_EMPTY", { host: firstJob.hostRaw, triedMacs: hostMacs.length });
    }
  }
  let choices = chooseMagPortals(reports);
  // v18.7.13 (#1): Manuel ("ben seçeyim") modda seçim fazı, BULUNAN herhangi bir aday (seçilebilir API
  // VEYA "portal izi") varsa AÇILIR — eskiden yalnız seçilebilir API varsa açılıyordu, bu yüzden yalnız
  // iz bulunan hostlarda kullanıcıya hiç seçim sunulmuyordu. Kullanıcının seçtiği iz, hesap fazında
  // gerçek handshake ile doğrulanır (seçim ≠ doğrulama; sahte başarı yok).
  // v18.7.13: seçilebilir aday İÇERMEYEN ama "portal izi" olan raporlar da manuel seçime açılır.
  // AMA terminal (error/protected/rate-limit) raporlar seçime GİRMEZ — koruma/hata durdurması korunur.
  const pickableReport = (r: MagPortalDiscovery) => r.state !== "error" && r.state !== "protected"
    && r.candidates.some(c => c.confidence !== "protected");
  if (opts.selectPortals && reports.some(pickableReport)) {
    opts.onPhase?.("selection");
    try { choices = await waitControlled(opts.selectPortals(reports), opts.control); }
    catch (error: any) { if (aborted(error) || cancelled(opts.control)) return results; throw error; }
  }
  for (const [host, endpoint] of Object.entries(choices)) {
    // v18.7.13: seçim keşifte BULUNAN, terminal-olmayan, koruma-olmayan bir aday olmalı (keyfi endpoint
    // değil); seçilebilir olması şart değil (manuel modda iz de seçilebilir), doğrulama handshake ile yapılır.
    const rep = reportByHost.get(host);
    if (!rep || rep.state === "error" || rep.state === "protected"
      || !rep.candidates.some(c => c.endpoint === endpoint && c.confidence !== "protected"))
      throw new Error("Seçilen API yolu bu portal keşfinde bulunan geçerli bir aday değil.");
  }
  const accountJobs = opts.selectPortals
    ? jobs.filter(job => choices[job.portal] || selectablePortalCandidates(reportByHost.get(job.portal)).length === 0)
    : jobs;
  opts.onPhase?.("accounts");
  let done = 0, cursor = 0;
  const scanOne = async (job: MagBulkJob): Promise<MagScanResult> => {
    const report = reportByHost.get(job.portal), portal = choices[job.portal];
    const base: MagScanResult = { hostRaw: job.hostRaw, portal: portal || job.portal, mac: job.mac, category: "error" };
    if (!portal) {
      const guarded = report?.candidates.find(c => c.protection?.state === "present");
      return { ...base, category: guarded || report?.state === "protected" ? "protected" : report?.state === "error" ? "error" : "no-portal",
        protection: guarded?.protection || unknownObservation(job.portal, !!opts.useProxy),
        message: report?.message || "Seçilen kapsamda MAG API yolu doğrulanamadı; bu MAC için istek gönderilmedi." };
    }
    let observation = unknownObservation(portal, !!opts.useProxy);
    const requestScope: StalkerRequestScope = {
      ...gate, transport: opts.useProxy ? "proxy" : "direct", signal: opts.control?.signal, timeoutMs: opts.timeoutMs,
      onObservation(next) { gate.onObservation?.(next);if (observation.state !== "present" || next.state === "present") observation = next; },
    };
    const candidate = report?.candidates.find(value => value.endpoint === portal);
    const resolvedPortal = candidate?.resolvedPortal || resolveMagPortal(job.portal, portal, candidate?.evidence || [], 'input');
    const cred: StalkerCreds = { portal, mac: job.mac, endpointPolicy: "exact", requestScope, resolvedPortal };
    try {
      checkCancelled(opts.control);
      opts.onStage?.("Seçilen API yolunda hesap ve içerik erişimi doğrulanıyor");
      const login = await stalkerLogin(cred, { forceFresh: true, signal: opts.control?.signal });
      checkCancelled(opts.control);
      const verification = await stalkerVerifyAccount(cred, login.session, login.profile, { signal: opts.control?.signal });
      checkCancelled(opts.control);
      const info = verification.accountInfo;
      // v18.7.16 (A): doğrulama "unverified" ama hesap kimliği VE gelecek bitiş varsa → "probable".
      // Yalnız içerik örneği alınamamış demektir (denial değil; blocked/expired ayrı state). Kullanıcı
      // isterse ekleyebilir. Kimlik yoksa veya bitiş yoksa eski "unverified" davranışı korunur.
      const category: MagScanCategory = verification.state === "verified" ? "valid"
        : verification.state === "unverified" && (verification.accountIdentity || verification.expiryValid) ? "probable"
        : verification.state;
      void recordDiagnostic("scan", "MAG_BULK_ACCOUNT_VERIFIED", { state: verification.state, category, liveCount: verification.liveCount, evidence: verification.evidence, accountIdentity: verification.accountIdentity, expiryValid: verification.expiryValid });
      return { ...base, category, status: info.status, expiry: info.tariff_expired_date || info.exp_date,
        resolvedPortal: login.session.resolvedPortal || resolvedPortal,
        accountInfo: { ...info, extra: { ...info.extra, magProtection: observation } }, liveCount: verification.liveCount,
        protection: observation, verificationEvidence: verification.evidence, message: verification.message };
    } catch (error: any) {
      if (aborted(error) || cancelled(opts.control)) throw error;
      observation = failureObservation(error, observation);
      const kind = String(error?.kind || "");
      const explicitlyUnauthorized = /authorization failed|not authorized|unauthori[sz]ed/.test(String(error?.snippet || error?.message || "").toLowerCase());
      return { ...base, category: kind === "MAG_PROTECTION" || kind === "MAG_RATE_LIMIT" ? "protected" : explicitlyUnauthorized ? "blocked" : "error",
        protection: observation, message: (kind || "HATA") + ": " + String(error?.message || error).slice(0, 180) };
    }
  };
  const worker = async () => {
    while (!cancelled(opts.control)) {
      await opts.control?.waitIfPaused?.();
      if (cancelled(opts.control)) return;
      const index = cursor++;
      if (index >= accountJobs.length) return;
      const job = accountJobs[index];
      opts.onProgress?.(done, accountJobs.length, job.hostRaw + " · " + job.mac);
      try {
        const result = await scanOne(job);
        if (cancelled(opts.control)) return;
        if(!opts.retryPass && isUncertainMagResult(result))await opts.onRetry?.({...job,portal:choices[job.portal]||job.portal,retryScope:opts.scope||(/\.php$/i.test(new URL(job.portal).pathname)?'exact':'fallback'),selectedEndpoint:!!choices[job.portal]},'pending',0);
        results.push(result); done++;
        await opts.onResult?.(result); opts.onProgress?.(done, accountJobs.length, job.hostRaw + " · " + job.mac);
      } catch (error: any) { if (aborted(error) || cancelled(opts.control)) return; throw error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, accountJobs.length) }, () => worker()));
  // A fresh, bounded discovery budget is used only for uncertain jobs, never for explicit rejection or CAPTCHA/WAF/challenges; 429 respects the same gate.
  if(!opts.retryPass && !cancelled(opts.control)) {
    const uncertain=results.filter(isUncertainMagResult);
    const uncertainKeys=new Set(uncertain.map(r=>JSON.stringify([r.hostRaw,r.mac])));
    const retryJobs=accountJobs.filter(j=>uncertainKeys.has(JSON.stringify([j.hostRaw,j.mac])));
    if(retryJobs.length){
      opts.onStage?.(`İkinci tur · ${retryJobs.length} belirsiz hesap`);
      await delay(1000,opts.control);
      const locked=retryJobs.filter(j=>!!choices[j.portal]).map(j=>({...j,portal:choices[j.portal]}));
      const undiscovered=retryJobs.filter(j=>!choices[j.portal]);
      for(const group of [locked,undiscovered]){
        if(!group.length || cancelled(opts.control))continue;
        const second=await runMagBulkScan(group,{...opts,requestGate:gate,retryPass:true,lockedEndpoints:group===locked,scope:group===locked?'exact':opts.scope,selectPortals:group===locked?undefined:opts.selectPortals,discoverySpeed:'slow',timeoutMs:Math.max(opts.timeoutMs||6000,10000)});
        for(const result of second){const index=results.findIndex(r=>r.mac===result.mac&&r.hostRaw===result.hostRaw);if(index>=0)results[index]=result;}
      }
    }
  }
  if(opts.retryPass)for(const result of results){const job=accountJobs.find(j=>j.mac===result.mac&&j.hostRaw===result.hostRaw);if(job)await opts.onRetry?.({...job,portal:choices[job.portal]||job.portal,retryScope:opts.scope||(/\.php$/i.test(new URL(job.portal).pathname)?'exact':'fallback'),selectedEndpoint:!!choices[job.portal]},isUncertainMagResult(result)?'unresolved':'resolved',1);}
  void recordDiagnostic("scan", "MAG_BULK_SCAN_DONE", { jobs: accountJobs.length, hosts: reports.length, scanned: done,
    valid: results.filter(r => r.category === "valid").length, cancelled: cancelled(opts.control) });
  return results;
  } finally { for (const budget of passiveBudgets.values()) budget.dispose(); for (const budget of budgets.values()) budget.dispose(); }
}
