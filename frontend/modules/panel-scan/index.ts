import { requireNativeModule } from "expo-modules-core";

export type NativeScanStartResult = {
  accepted: boolean;
  state: "STARTING" | "BUSY" | "REJECTED";
  runId: string;
  activeRunId?: string;
};

type NativeSnapshot = {
  runId?: string; state?: "STARTING" | "RUNNING" | "PAUSED" | "CANCELLING" | "COMPLETED" | "FAILED" | "CANCELLED"; createdAt?: number; updatedAt?: number;
  mode?: "single" | "bulk" | "unified" | "streaming-file-v172"; running?: boolean; cancelled?: boolean; paused?: boolean;
  tested?: number; total?: number; accountTested?: number; accountTotal?: number; accountIndex?: number;
  panelTested?: number; panelTotal?: number; found?: number; recoverable?: boolean; recovered?: boolean; panelName?: string; currentServer?: string; error?: string; terminalReason?: string; pauseReason?: string; matches?: any[];
  accountStatuses?: Array<{ accountIndex:number; sourceRow?:number; name?:string; state:string; tested:number; total:number; remaining:number; found:number }>;
  batchIndex?: number; batchCount?: number; batchSize?: number; batchStart?: number; batchEnd?: number;
  requestedConcurrency?: number; effectiveConcurrency?: number; sourceFingerprint?: string;
  streamingFile?: boolean; producerDone?: boolean; queueDepth?: number; queueCapacity?: number; producerBackpressure?: boolean; skippedNoCandidate?: number; directoryPanels?: number;
};


export type UnifiedScanCompactJob = {
  row?: number;
  name?: string;
  username: string;
  password: string;
  candidateSet: number;
};

export type UnifiedScanCompactPayload = {
  version: 3;
  candidateSets: any[][];
  jobs: UnifiedScanCompactJob[];
};

let native: any = null;
try { native = requireNativeModule("PanelScan"); } catch {}

function normalizeStartResult(value: any): NativeScanStartResult | null {
  if (!value) return null;
  if (typeof value === "string") return { accepted: true, state: "STARTING", runId: value, activeRunId: value };
  return {
    accepted: !!value.accepted,
    state: String(value.state || (value.accepted ? "STARTING" : "REJECTED")) as NativeScanStartResult["state"],
    runId: String(value.runId || ""),
    activeRunId: value.activeRunId ? String(value.activeRunId) : undefined,
  };
}

export const PanelScan = {
  available: !!native,
  parseBulkAccountsFile: async (uri: string): Promise<any> => native ? await native.parseBulkAccountsFile(uri) : { supported: false, reason: "native-unavailable" },
  inspectBulkAccountsFile: async (uri: string, sampleLimit = 12): Promise<any> => native ? await native.inspectBulkAccountsFile(uri, sampleLimit) : { supported: false, reason: "native-unavailable" },
  startStreamingFileScanV172: async (uri: string, directory: any[], requestedConcurrency: number, timeoutMs: number, batchSize: number, sourceFingerprint: string): Promise<NativeScanStartResult | null> =>
    native ? normalizeStartResult(await native.startStreamingFileScanV172(uri, JSON.stringify(directory || []), requestedConcurrency, timeoutMs, batchSize, sourceFingerprint)) : null,
  startScan: async (candidates: any[], username: string, password: string, concurrency: number, timeoutMs: number): Promise<NativeScanStartResult | null> => {
    if (!native) return null;
    /**
     * v17.4.0 — BINDER PARCEL KORUMASI (P0)
     * ------------------------------------------------------------------------
     * Cihaz kaydı: "PanelScan.startScan has been rejected →
     * TransactionTooLargeException: data parcel size 11.525.580 bytes".
     * Android'in Binder işlem sınırı ~1 MB'tır; aşılırsa çağrı REDDEDİLİR ve
     * tarama hiç başlamaz. Kullanıcı bunu "başlar gibi yapıp yarıda kalıyor"
     * olarak görüyordu.
     *
     * Asıl sebep kapsam filtresinin atlanmasıydı (bkz. resolveScanDirectory);
     * o düzeltildi. Bu ise SON SAVUNMA: yük yine de sınırı aşarsa veriyi
     * sessizce kırpmak yerine (eksik tarama = yanlış sonuç) anlaşılır bir hata
     * veririz. Boyut her durumda telemetriye yazılır.
     */
    const payload = JSON.stringify(candidates);
    const bytes = payload.length;
    const LIMIT = 768 * 1024;   // Binder sınırının güvenli altı
    if (bytes > LIMIT) {
      const err: any = new Error(
        `Tarama listesi çok büyük (${(bytes / 1048576).toFixed(1)} MB · ${candidates.length} adres). ` +
        `Android'in aktarım sınırı aşıldığı için tarama başlatılamadı.\n\n` +
        `Panel seçiminizi daraltın (belirli bir panel veya kaynak seçin) ya da rehberi yenileyip tekrar deneyin.`
      );
      err.code = 'SCAN_PAYLOAD_TOO_LARGE';
      err.bytes = bytes;
      err.candidateCount = candidates.length;
      throw err;
    }
    return normalizeStartResult(await native.startScan(payload, username, password, concurrency, timeoutMs));
  },
  startBulkScan: async (candidates: any[], accounts: Array<{ row?: number; name?: string; username: string; password: string }>, concurrency: number, timeoutMs: number): Promise<NativeScanStartResult | null> =>
    native ? normalizeStartResult(await native.startBulkScan(JSON.stringify(candidates), JSON.stringify(accounts), concurrency, timeoutMs)) : null,
  startUnifiedScan: async (jobs: Array<{ row?: number; name?: string; username: string; password: string; candidates: any[] }>, concurrency: number, timeoutMs: number): Promise<NativeScanStartResult | null> => {
    if (!native) return null;
    // v15.2.17: Aynı panel rehberi birden fazla hesapta kullanılıyorsa JSON içinde
    // tekrar tekrar çoğaltma. Native service tarafı candidateSet indeksini doğrudan okur.
    const setIndex = new Map<string, number>();
    const candidateSets: any[][] = [];
    const compactJobs = jobs.map(({ candidates, ...job }) => {
      const key = JSON.stringify(candidates || []);
      let index = setIndex.get(key);
      if (index === undefined) {
        index = candidateSets.length;
        setIndex.set(key, index);
        candidateSets.push(candidates || []);
      }
      return { ...job, candidateSet: index };
    });
    const payload = { version: 2, candidateSets, jobs: compactJobs };
    const initialTotal = jobs.reduce((sum, job) => sum + (job.candidates?.length || 0), 0);
    return normalizeStartResult(await native.startUnifiedScan(JSON.stringify(payload), jobs.length, initialTotal, concurrency, timeoutMs));
  },
  startUnifiedScanV171: async (payload: UnifiedScanCompactPayload, requestedConcurrency: number, timeoutMs: number, batchSize: number, sourceFingerprint: string): Promise<NativeScanStartResult | null> => {
    if (!native) return null;
    const initialTotal = payload.jobs.reduce((sum, job) => sum + (payload.candidateSets[job.candidateSet]?.length || 0), 0);
    return normalizeStartResult(await native.startUnifiedScanV171(
      JSON.stringify(payload),
      payload.jobs.length,
      initialTotal,
      requestedConcurrency,
      timeoutMs,
      batchSize,
      sourceFingerprint,
    ));
  },
  cancelScan: async (runId: string) => native && runId ? native.cancelScan(runId) : false,
  pauseScan: async (runId: string) => native && runId ? native.pauseScan(runId) : false,
  resumeScan: async (runId: string) => native && runId ? native.resumeScan(runId) : false,
  getActiveRunId: (): string => native ? String(native.getActiveRunId?.() || "") : "",
  getRecoverableScan: (): any => { if (!native) return {}; try { return JSON.parse(native.getRecoverableScan?.() || "{}"); } catch { return {}; } },
  recoverInterruptedScan: async (): Promise<boolean> => native ? !!(await native.recoverInterruptedScan?.()) : false,
  getBatteryOptimizationStatus: (): { supported:boolean; ignoring:boolean } => {
    if (!native) return { supported:false, ignoring:false };
    try { const v=native.getBatteryOptimizationStatus?.() || {}; return { supported:!!v.supported, ignoring:!!v.ignoring }; } catch { return { supported:false, ignoring:false }; }
  },
  requestBatteryOptimizationExemption: async (): Promise<boolean> => native ? !!(await native.requestBatteryOptimizationExemption?.()) : false,
  openBatteryOptimizationSettings: async (): Promise<boolean> => native ? !!(await native.openBatteryOptimizationSettings?.()) : false,
  getSnapshot: (): NativeSnapshot => { if (!native) return {}; try { return JSON.parse(native.getSnapshot() || "{}"); } catch { return {}; } },
  acknowledgeSnapshot: (runId: string): boolean => native && runId ? !!native.acknowledgeSnapshot?.(runId) : false,
  getDiagnosticEvents: (): any[] => { if (!native) return []; try { const v = JSON.parse(native.getDiagnosticEvents?.() || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } },
  getLastCrash: (): any => { if (!native) return {}; try { return JSON.parse(native.getLastCrash?.() || "{}"); } catch { return {}; } },
  clearDiagnostics: (): boolean => native ? !!native.clearDiagnostics?.() : false,

  // ── v18.4.0: Taramaya özel proxy (test motoru + rotasyon) ─────────────────
  setScanProxyEnabled: async (on: boolean): Promise<NativeScanProxyStatus> => {
    if (!native?.setScanProxyEnabled) return emptyProxyStatus("native-unavailable");
    try { return JSON.parse(await native.setScanProxyEnabled(on)); } catch (e: any) { return emptyProxyStatus(String(e?.message || e)); }
  },
  /** Tür bazında ayrıştırılmış yapısal aday listesini native'e gönder. replace=false → ekle. */
  loadScanProxyCandidates: async (entries: NativeScanProxyEntry[], replace: boolean): Promise<NativeScanProxyStatus> => {
    if (!native?.loadScanProxyCandidates) return emptyProxyStatus("native-unavailable");
    try { return JSON.parse(await native.loadScanProxyCandidates(JSON.stringify(entries), replace)); } catch (e: any) { return emptyProxyStatus(String(e?.message || e)); }
  },
  /** Test etmeden kullan (ödemeli rotating gateway). */
  commitScanProxyCandidates: async (): Promise<NativeScanProxyStatus> => {
    if (!native?.commitScanProxyCandidates) return emptyProxyStatus("native-unavailable");
    try { return JSON.parse(await native.commitScanProxyCandidates()); } catch (e: any) { return emptyProxyStatus(String(e?.message || e)); }
  },
  clearScanProxy: async (): Promise<NativeScanProxyStatus> => {
    if (!native?.clearScanProxy) return emptyProxyStatus("native-unavailable");
    try { return JSON.parse(await native.clearScanProxy()); } catch (e: any) { return emptyProxyStatus(String(e?.message || e)); }
  },
  /** Canlılık testini başlat. */
  startScanProxyTest: async (cfg: ScanProxyTestConfig): Promise<{ started: boolean; error?: string }> => {
    if (!native?.startScanProxyTest) return { started: false, error: "native-unavailable" };
    try { return JSON.parse(await native.startScanProxyTest(JSON.stringify(cfg))); } catch (e: any) { return { started: false, error: String(e?.message || e) }; }
  },
  pauseScanProxyTest: (): boolean => native ? !!native.pauseScanProxyTest?.() : false,
  resumeScanProxyTest: (): boolean => native ? !!native.resumeScanProxyTest?.() : false,
  stopScanProxyTest: async (useTested: boolean): Promise<NativeScanProxyStatus> => {
    if (!native?.stopScanProxyTest) return emptyProxyStatus("native-unavailable");
    try { return JSON.parse(await native.stopScanProxyTest(useTested)); } catch (e: any) { return emptyProxyStatus(String(e?.message || e)); }
  },
  getScanProxyTestProgress: (): ScanProxyTestProgress => {
    if (!native?.getScanProxyTestProgress) return { phase: "idle", total: 0, tested: 0, working: 0, dead: 0, transparent: 0, http: 0, socks4: 0, socks5: 0, elapsedMs: 0, etaMs: 0, ratePerSec: 0, ownIp: "", fastest: [] };
    try { return JSON.parse(native.getScanProxyTestProgress()); } catch { return { phase: "idle", total: 0, tested: 0, working: 0, dead: 0, transparent: 0, http: 0, socks4: 0, socks5: 0, elapsedMs: 0, etaMs: 0, ratePerSec: 0, ownIp: "", fastest: [] }; }
  },
  /** Kullanıcı "Test et": ilk çalışan proxy üzerinden dış IP. */
  testScanProxy: async (): Promise<{ ok: boolean; ip?: string; httpCode?: number; proxy?: string; error?: string }> => {
    if (!native?.testScanProxy) return { ok: false, error: "native-unavailable" };
    try { return JSON.parse(await native.testScanProxy()); } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
  },
  getScanProxyStatus: (): NativeScanProxyStatus => {
    if (!native?.getScanProxyStatus) return emptyProxyStatus("");
    try { return JSON.parse(native.getScanProxyStatus()); } catch { return emptyProxyStatus(""); }
  },
  /** JS keşfini proxy'ye yönlendir (serverCode.ts). */
  proxiedProbe: async (url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; body: string; error?: string }> => {
    if (!native?.proxiedProbe) return { ok: false, status: 0, body: "", error: "native-unavailable" };
    try { return JSON.parse(await native.proxiedProbe(url, timeoutMs)); }
    catch (e: any) { return { ok: false, status: 0, body: "", error: String(e?.message || e) }; }
  },
};

function emptyProxyStatus(err: string): NativeScanProxyStatus {
  return { enabled: false, candidates: 0, pool: 0, dead: 0, alive: 0, poolTested: false, testPhase: "idle", exhausted: false, total: 0, working: 0, lastError: err };
}

export type NativeScanProxyEntry = {
  scheme: "http" | "https" | "socks4" | "socks5";
  host: string;
  port: number;
  user?: string;
  pass?: string;
};

export type ScanProxyTestConfig = {
  mode: "system" | "custom";
  url?: string;
  expectText?: string;
  concurrency?: number;
  timeoutMs?: number;
  rejectTransparent?: boolean;
  /** v18.5.0: yalnız elite (IP gizli + proxy izi yok) proxy'ler havuza girer. */
  eliteOnly?: boolean;
};

export type ScanProxyTestProgress = {
  phase: "idle" | "running" | "paused" | "done" | "stopped" | "cancelled" | "failed";
  mode?: string;
  /** v18.5.0: "tcp" hızlı bağlantı elemesi → "verify" doğrulama + anonimlik. */
  stage?: "" | "tcp" | "verify";
  tcpTotal?: number; tcpTested?: number; tcpAlive?: number;
  elite?: number; anonymous?: number; unknownAnon?: number;
  total: number; tested: number; working: number; dead: number; transparent: number;
  http: number; socks4: number; socks5: number;
  elapsedMs: number; etaMs: number; ratePerSec: number;
  ownIp: string; error?: string;
  fastest: Array<{ proxy: string; ms: number; anon?: string }>;
};

export type NativeScanProxyStatus = {
  enabled: boolean;
  candidates: number;
  candidatesByScheme?: { http: number; socks4: number; socks5: number };
  pool: number;
  poolByScheme?: { http: number; socks4: number; socks5: number };
  poolByAnon?: { elite: number; anonymous: number; transparent: number; unknown: number };
  poolTested: boolean;
  dead: number;
  alive: number;
  /** v18.5.0: panel yanıtı almış kalıcı iyi proxy sayısı, şu an kullanımdaki istek, toplam başarı, son proxy. */
  good?: number;
  inUse?: number;
  panelSuccess?: number;
  lastProxy?: string;
  lastRefreshAt?: number;
  lastTestAt?: number;
  testPhase: string;
  exhausted: boolean;
  /** Geriye dönük (v18.3.0). */
  total: number;
  working: number;
  lastError?: string;
};
