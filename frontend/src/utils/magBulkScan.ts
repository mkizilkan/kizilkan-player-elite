/** Çoklu MAG analizi: kullanıcı kapsamı, işlem sahipliği, ortak host temposu ve kanıtlı sonuçlar. */
import type { AccountInfo } from "@/src/types";
import type { StalkerCreds, StalkerRequestScope, MagProtectionObservation } from "@/src/utils/stalker";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import { parseAccountExpiryMs } from "@/src/utils/accountExpiry";
import { MAG_MAX_PARALLEL, portalDiscoveryCandidates, type MagBulkJob, type MagHostEntry, type MagDiscoveryScope } from "@/src/utils/magBulk";

export type MagScanCategory = "valid" | "expired" | "blocked" | "protected" | "no-portal" | "error";
export type MagScanResult = {
  hostRaw: string; portal: string; mac: string; category: MagScanCategory;
  status?: string; expiry?: string | null; liveCount?: number; message?: string;
  accountInfo?: AccountInfo;
  protection?: MagProtectionObservation;
};
export type MagScanControl = { isCancelled?: () => boolean; waitIfPaused?: () => Promise<void>; signal?: AbortSignal };
export type MagScanOptions = {
  concurrency?: number; useProxy?: boolean; scope?: MagDiscoveryScope;
  maxCandidatesPerHost?: number; timeoutMs?: number;
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

function classifyStatus(info: AccountInfo): MagScanCategory {
  const status = String(info.status || "").toLowerCase();
  if (/block|ban|disable|inactive|deakt|kapal/.test(status) || status === "0" || status === "false") return "blocked";
  if (/expire|süre|bitti|dol/.test(status)) return "expired";
  const expiry = parseAccountExpiryMs(info.tariff_expired_date);
  if (expiry !== null && expiry < Date.now()) return "expired";
  return "valid";
}
function unknownObservation(portal: string, proxy: boolean): MagProtectionObservation {
  return { state: "unknown", kind: "unknown", endpoint: portal, stage: "analysis", evidence: [], observedAt: new Date().toISOString(), transport: proxy ? "proxy" : "direct" };
}

export async function runMagBulkScan(jobs: MagBulkJob[], opts: MagScanOptions = {}): Promise<MagScanResult[]> {
  const concurrency = Math.max(1, Math.min(MAG_MAX_PARALLEL, Math.floor(Number(opts.concurrency) || 3)));
  const scope = opts.scope || "fallback";
  const results: MagScanResult[] = [];
  const positivePortalCache = new Map<string, string>();
  const portalInFlight = new Map<string, Promise<string | null>>();
  const gate = createMagRequestGate(opts.control, opts.onStage);
  const { discoverMagPortal, normalizeStalkerAccountInfo, stalkerLogin } = await import("@/src/utils/stalker");
  let done = 0, cursor = 0;

  const scanOne = async (job: MagBulkJob): Promise<MagScanResult> => {
    const base: MagScanResult = { hostRaw: job.hostRaw, portal: job.portal, mac: job.mac, category: "error" };
    let observation = unknownObservation(job.portal, !!opts.useProxy);
    const requestScope: StalkerRequestScope = {
      ...gate, transport: opts.useProxy ? "proxy" : "direct", signal: opts.control?.signal, timeoutMs: opts.timeoutMs,
      onObservation(next) {
        // Bir sonraki başarılı yanıt önce gözlenen challenge/429 kanıtını silmez.
        if (observation.state !== "present" || next.state === "present") observation = next;
      },
    };
    const creds = (portal: string): StalkerCreds => ({ portal, mac: job.mac, endpointPolicy: "exact", requestScope });
    const discover = async (): Promise<string | null> => {
      const key = job.portal;
      while (portalInFlight.has(key)) {
        const found = await portalInFlight.get(key)!;
        checkCancelled(opts.control);
        if (found) return found;
        // Önceki MAC'in yetkisizliği/yokluğu bu MAC için negatif cache değildir.
      }
      const cached = positivePortalCache.get(key);
      if (cached) return cached;
      const entry: MagHostEntry = { raw: job.hostRaw, host: job.portal, hasPort: job.hasPort, explicitPort: job.explicitPort, hasPath: job.hasPath };
      const candidates = Array.from(new Set([job.portal, ...portalDiscoveryCandidates(entry, { allPorts: true })]));
      const task = discoverMagPortal(creds(job.portal), candidates, {
        signal: opts.control?.signal, maxCandidates: opts.maxCandidatesPerHost ?? candidates.length, timeoutMs: opts.timeoutMs,
        onProbe(endpoint, index, total) {
          checkCancelled(opts.control);
          try { const u = new URL(endpoint); opts.onStage?.(`Portal aranıyor · ${u.host}${u.pathname} (${index + 1}/${total})`); } catch (error: any) { if (aborted(error)) throw error; }
        },
      }).then(found => {
        if (found?.endpoint) { positivePortalCache.set(key, found.endpoint); opts.onStage?.(`Portal bulundu: ${found.endpoint}`); }
        return found?.endpoint || null;
      });
      portalInFlight.set(key, task);
      try { return await task; }
      finally { if (portalInFlight.get(key) === task) portalInFlight.delete(key); }
    };
    try {
      checkCancelled(opts.control);
      let login: Awaited<ReturnType<typeof stalkerLogin>> | undefined;
      let portal = job.portal;
      if (scope !== "all") {
        try { login = await stalkerLogin(creds(portal), { forceFresh: true, signal: opts.control?.signal }); }
        catch (error: any) {
          if (scope === "exact" || aborted(error) || observation.kind === "access_denied" || /authorization failed|not authorized|unauthori[sz]ed/i.test(String(error?.message || "")) || ["MAG_RATE_LIMIT", "MAG_PROTECTION"].includes(String(error?.kind || ""))) throw error;
          // Fallback yalnız kullanıcının seçtiği politikada çalışır.
        }
      }
      if (!login) {
        const found = await discover();
        if (!found) return { ...base, category: "no-portal", protection: observation, message: "Seçilen kapsamda çalışan MAG API portalı bulunamadı." };
        portal = found;
        login = await stalkerLogin(creds(portal), { forceFresh: true, signal: opts.control?.signal });
      }
      checkCancelled(opts.control);
      const info = normalizeStalkerAccountInfo(login.profile);
      const category = login.session.profileError && !login.profile ? "error" : classifyStatus(info);
      return { ...base, portal: login.session.endpoint || portal, category, status: info.status,
        expiry: info.tariff_expired_date, accountInfo: { ...info, extra: { ...info.extra, magProtection: observation } }, protection: observation, message: login.session.profileError || undefined };
    } catch (error: any) {
      if (aborted(error) || cancelled(opts.control)) throw error;
      if (error?.observation) observation = error.observation;
      const kind = String(error?.kind || "");
      const explicitlyUnauthorized = /authorization failed|not authorized|unauthori[sz]ed/.test(String(error?.snippet || error?.message || "").toLowerCase());
      const category: MagScanCategory = kind === "MAG_PROTECTION" ? "protected" : explicitlyUnauthorized ? "blocked" : "error";
      return { ...base, category, protection: observation,
        message: `${kind || "HATA"}: ${String(error?.message || error).slice(0, 180)}` };
    }
  };
  void recordDiagnostic("scan", "MAG_BULK_SCAN_START", { jobs: jobs.length, concurrency, proxy: !!opts.useProxy, scope, timeoutMs: opts.timeoutMs });
  const worker = async () => {
    while (!cancelled(opts.control)) {
      await opts.control?.waitIfPaused?.();
      if (cancelled(opts.control)) return;
      const index = cursor++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      opts.onProgress?.(done, jobs.length, `${job.hostRaw} · ${job.mac}`);
      try {
        const result = await scanOne(job);
        if (cancelled(opts.control)) return;
        results.push(result); done++;
        opts.onResult?.(result); opts.onProgress?.(done, jobs.length, `${job.hostRaw} · ${job.mac}`);
      } catch (error: any) { if (aborted(error) || cancelled(opts.control)) return; throw error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  void recordDiagnostic("scan", "MAG_BULK_SCAN_DONE", { jobs: jobs.length, scanned: done, valid: results.filter(r => r.category === "valid").length, cancelled: cancelled(opts.control) });
  return results;
}
