/** Çoklu MAG analizi: kullanıcı kapsamı, işlem sahipliği, ortak host temposu ve kanıtlı sonuçlar. */
import type { AccountInfo } from "@/src/types";
import type { StalkerCreds, StalkerRequestScope, MagProtectionObservation } from "@/src/utils/stalker";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import { discoverMagHosts, type MagPortalDiscovery } from "@/src/utils/magPortalDiscovery";
import { MAG_MAX_PARALLEL, type MagBulkJob, type MagHostEntry, type MagDiscoveryScope } from "@/src/utils/magBulk";

export type MagScanCategory = "valid" | "unverified" | "expired" | "blocked" | "protected" | "no-portal" | "error";
export type MagScanResult = {
  hostRaw: string; portal: string; mac: string; category: MagScanCategory;
  status?: string; expiry?: string | null; liveCount?: number; message?: string;
  accountInfo?: AccountInfo;
  protection?: MagProtectionObservation;
  verificationEvidence?: string[];
};
export type MagScanControl = { isCancelled?: () => boolean; waitIfPaused?: () => Promise<void>; signal?: AbortSignal };
export type MagScanOptions = {
  concurrency?: number; useProxy?: boolean; scope?: MagDiscoveryScope;
  maxCandidatesPerHost?: number; timeoutMs?: number;
  onPhase?: (phase: "discovery" | "selection" | "accounts") => void;
  onPortalDiscovery?: (reports: MagPortalDiscovery[]) => void;
  selectPortals?: (reports: MagPortalDiscovery[]) => Promise<Record<string, string>>;
  onResult?: (r: MagScanResult) => void;
  onProgress?: (done: number, total: number, current?: string) => void;
  onStage?: (msg: string) => void;
  control?: MagScanControl;
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
export function createMagRequestGate(control?: MagScanControl, onStage?: (message: string) => void): Pick<StalkerRequestScope, "beforeRequest" | "onRateLimit"> {
  const hostState = new Map<string, { tail: Promise<void>; lastAt: number; holdUntil: number; announced: number }>();
  const stateFor = (url: string) => {
    const key = hostname(url); let state = hostState.get(key);
    if (!state) { state = { tail: Promise.resolve(), lastAt: 0, holdUntil: 0, announced: 0 }; hostState.set(key, state); }
    return state;
  };
  return {
    onRateLimit(url, retryAfterMs) {
      const state = stateFor(url);
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
          const now = Date.now();
          const remaining = Math.max(state.holdUntil - now, 650 - (now - state.lastAt));
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
  const concurrency = Math.max(1, Math.min(MAG_MAX_PARALLEL, Math.floor(Number(opts.concurrency) || 3)));
  const scope = opts.scope || "exact";
  const results: MagScanResult[] = [];
  const gate = createMagRequestGate(opts.control, opts.onStage);
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
    reports = await discoverMagHosts(Array.from(uniqueHosts.values()), {
      scope, concurrency, timeoutMs: opts.timeoutMs, useProxy: opts.useProxy, control: opts.control, gate,
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
    opts.onPortalDiscovery?.(reports);
  } catch (error: any) {
    if (aborted(error) || cancelled(opts.control)) return results;
    throw error;
  }
  const reportByHost = new Map(reports.map(report => [report.host.host, report]));
  // v18.7.10 — HANDSHAKE YEDEĞİ. Pasif keşif bir host'ta seçilebilir aday bulamazsa (weko gibi
  // "izsiz" portaller ya da /c/ redirect'i), TEKLİ eklemedeki gibi bir MAC ile GERÇEK handshake
  // keşfi (discoverMagPortal) yapılır. Bulunan endpoint, seçilebilir aday olarak rapora eklenir →
  // hem otomatik/manuel seçimde görünür hem de sonraki hesap doğrulaması bu endpoint'te çalışır.
  for (const [hostKey, hostEntry] of uniqueHosts) {
    if (cancelled(opts.control)) return results;
    const existing = reportByHost.get(hostKey);
    if (selectablePortalCandidates(existing).length > 0) continue;
    // M02 — KORUMALI / İSTEK-SINIRLI host'ta handshake yedeği ÇALIŞMAZ. Pasif keşif WAF/CAPTCHA/429
    // gördüyse gerçek handshake atmak koruma durdurmasını deler; host olduğu gibi bırakılır.
    if (existing?.state === "protected" || existing?.candidates.some(c => c.protection?.state === "present")) {
      void recordDiagnostic("scan", "MAG_BULK_HANDSHAKE_FALLBACK_SKIP", { host: hostEntry.raw, reason: "protected" });
      continue;
    }
    const firstJob = jobs.find(job => job.portal === hostKey);
    if (!firstJob) continue;
    // M03 — literal `.php` girişte YALNIZ o endpoint denenir (başka kurulum ailesine taşma yok);
    // dizin / `/c/` girişte kurulum ailesi (portal.php / server/load.php …) denenir.
    const isLiteralPhp = (() => { try { return /\.php$/i.test(new URL(hostEntry.host).pathname); } catch { return false; } })();
    const candidates = isLiteralPhp ? [hostEntry.host] : portalDiscoveryCandidates(hostEntry, { allPorts: !hostEntry.hasPort });
    if (!candidates.length) continue;
    // M04 — tek MAC'in handshake reddi host'u "portalsız" yapmasın: ilk birkaç DISTINCT MAC denenir.
    const hostMacs: string[] = [];
    for (const job of jobs) if (job.portal === hostKey && !hostMacs.includes(job.mac)) { hostMacs.push(job.mac); if (hostMacs.length >= 3) break; }
    if (!hostMacs.length) continue;
    opts.onStage?.("Pasif keşif boş · gerçek handshake ile portal aranıyor…");
    void recordDiagnostic("scan", "MAG_BULK_HANDSHAKE_FALLBACK_START", { host: firstJob.hostRaw, candidates: candidates.length, hasPort: !!hostEntry.hasPort, macs: hostMacs.length });
    let found: { endpoint: string; token: string } | null = null;
    let protectedStop = false;
    for (const mac of hostMacs) {
      if (found?.endpoint || protectedStop || cancelled(opts.control)) break;
      let observation = unknownObservation(hostKey, !!opts.useProxy);
      const requestScope: StalkerRequestScope = {
        ...gate, transport: opts.useProxy ? "proxy" : "direct", signal: opts.control?.signal, timeoutMs: opts.timeoutMs,
        onObservation(next) { if (observation.state !== "present" || next.state === "present") observation = next; },
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
        // Koruma/istek sınırı terminaldir: başka MAC denenmez, host koruma olarak işaretlenir (M02 ile tutarlı).
        if (kind === "MAG_PROTECTION" || kind === "MAG_RATE_LIMIT") {
          protectedStop = true;
          if (existing) { existing.state = "protected"; existing.message = "Portal koruması / istek sınırı; handshake yedeği durduruldu"; }
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
  if (opts.selectPortals && reports.some(report => selectablePortalCandidates(report).length > 0)) {
    opts.onPhase?.("selection");
    try { choices = await waitControlled(opts.selectPortals(reports), opts.control); }
    catch (error: any) { if (aborted(error) || cancelled(opts.control)) return results; throw error; }
  }
  for (const [host, endpoint] of Object.entries(choices)) {
    if (!selectablePortalCandidates(reportByHost.get(host)).some(c => c.endpoint === endpoint))
      throw new Error("Seçilen API yolu bu portal keşfinde doğrulanmış bir aday değil.");
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
      onObservation(next) { if (observation.state !== "present" || next.state === "present") observation = next; },
    };
    const cred: StalkerCreds = { portal, mac: job.mac, endpointPolicy: "exact", requestScope };
    try {
      checkCancelled(opts.control);
      opts.onStage?.("Seçilen API yolunda hesap ve içerik erişimi doğrulanıyor");
      const login = await stalkerLogin(cred, { forceFresh: true, signal: opts.control?.signal });
      checkCancelled(opts.control);
      const verification = await stalkerVerifyAccount(cred, login.session, login.profile, { signal: opts.control?.signal });
      checkCancelled(opts.control);
      const info = verification.accountInfo;
      const category: MagScanCategory = verification.state === "verified" ? "valid" : verification.state;
      void recordDiagnostic("scan", "MAG_BULK_ACCOUNT_VERIFIED", { state: verification.state, liveCount: verification.liveCount, evidence: verification.evidence });
      return { ...base, category, status: info.status, expiry: info.tariff_expired_date || info.exp_date,
        accountInfo: { ...info, extra: { ...info.extra, magProtection: observation } }, liveCount: verification.liveCount,
        protection: observation, verificationEvidence: verification.evidence, message: verification.message };
    } catch (error: any) {
      if (aborted(error) || cancelled(opts.control)) throw error;
      if (error?.observation) observation = error.observation;
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
        results.push(result); done++;
        opts.onResult?.(result); opts.onProgress?.(done, accountJobs.length, job.hostRaw + " · " + job.mac);
      } catch (error: any) { if (aborted(error) || cancelled(opts.control)) return; throw error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, accountJobs.length) }, () => worker()));
  void recordDiagnostic("scan", "MAG_BULK_SCAN_DONE", { jobs: accountJobs.length, hosts: reports.length, scanned: done,
    valid: results.filter(r => r.category === "valid").length, cancelled: cancelled(opts.control) });
  return results;
}
