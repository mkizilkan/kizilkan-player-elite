import { requireNativeModule } from "expo-modules-core";
// v18.7.29 (Opus): `storage` üst-düzey import'u denetim VM'ini kırıyordu (@/ alias çözülemez, §7 tuzağı).
// Tek kullanım async fonksiyon içinde → tembel (await import) yüklenir.

export type NativeScanStartResult = {
  accepted: boolean;
  state: "STARTING" | "BUSY" | "REJECTED";
  runId: string;
  activeRunId?: string;
};

type NativeSnapshot = {
  profileId?: string; runId?: string; state?: "STARTING" | "RUNNING" | "PAUSED" | "CANCELLING" | "COMPLETED" | "FAILED" | "CANCELLED"; createdAt?: number; updatedAt?: number;
  mode?: "single" | "bulk" | "unified" | "streaming-file-v172"; running?: boolean; cancelled?: boolean; paused?: boolean;
  tested?: number; total?: number; accountTested?: number; accountTotal?: number; accountIndex?: number;
  panelTested?: number; panelTotal?: number; found?: number; recoverable?: boolean; recovered?: boolean; panelName?: string; currentServer?: string; error?: string; terminalReason?: string; pauseReason?: string; matches?: any[];
  accountStatuses?: Array<{ accountIndex:number; sourceRow?:number; name?:string; state:string; tested:number; total:number; remaining:number; found:number }>;
  batchIndex?: number; batchCount?: number; batchSize?: number; batchStart?: number; batchEnd?: number;
  requestedConcurrency?: number; effectiveConcurrency?: number; sourceFingerprint?: string;
  streamingFile?: boolean; producerDone?: boolean; queueDepth?: number; queueCapacity?: number; producerBackpressure?: boolean; skippedNoCandidate?: number; directoryPanels?: number;
  safetyBackup?: { ok?: boolean; path?: string; error?: string; count?: number };
  phase?: string; retryPending?: number; retryUnresolved?: number;
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

async function ownedScan(start: () => Promise<any>): Promise<NativeScanStartResult | null> {
  const { storage } = await import("@/src/utils/storage");
  const profileId = await storage.getItem<string>('kizilkan.activeProfileId', 'default') || 'default';
  const result = normalizeStartResult(await start());
  if (result?.accepted && result.runId && native?.bindResultArchiveOwner) await native.bindResultArchiveOwner(result.runId, profileId);
  return result;
}

export const PanelScan = {
  notifyBackgroundResult: (id:string,title:string,text:string,route:'add-playlist'|'mag-bulk'|'scan-proxy'):boolean => !!native?.notifyBackgroundResult?.(id,title,text,route),
  saveBackgroundWork: async (scope:string,value:unknown):Promise<void> => {
    if(!native?.saveBackgroundWork || !await native.saveBackgroundWork(scope,JSON.stringify(value)))throw new Error('Arka plan iş kaydı kaydedilemedi.');
  },
  loadBackgroundWork: async <T,>(scope:string):Promise<T|null> => {
    if(!native?.loadBackgroundWork)return null;const value=JSON.parse(await native.loadBackgroundWork(scope));return Object.keys(value).length?value:null;
  },
  writeArchiveRetry: async (runId:string,profileId:string,key:string,payload:any,state:string,attempts:number):Promise<void> => {
    if(!native?.writeArchiveRetry)throw new Error('Kalıcı yeniden deneme için güncel uygulama gerekli.');
    await native.writeArchiveRetry(runId,profileId,key,JSON.stringify(payload),state,attempts);
  },
  seedArchiveRetries: async (runId:string,profileId:string,rows:Array<{key:string;payload:unknown}>):Promise<void> => {
    if(!native?.seedArchiveRetries)throw new Error('Kalıcı iş kuyruğu için güncel uygulama gerekli.');
    for(let i=0;i<rows.length;i+=128)await native.seedArchiveRetries(runId,profileId,JSON.stringify(rows.slice(i,i+128)));
  },
  getArchiveRetries: async (runId:string,profileId:string,afterKey=''):Promise<{jobs:any[];nextKey:string}> => native?.getArchiveRetries ? JSON.parse(await native.getArchiveRetries(runId,profileId,afterKey)) : {jobs:[],nextKey:''},
  available: !!native,
  getLatestAccountArchive: async (profileId: string): Promise<string> => native?.getLatestAccountArchive ? await native.getLatestAccountArchive(profileId) : "",
  getResultArchiveInfo: async (runId:string,profileId:string):Promise<{runId:string;profileId:string;mode:string;state:string;createdAt:number}|null> => native?.getResultArchiveInfo ? JSON.parse(await native.getResultArchiveInfo(runId,profileId)) : null,
  updateResultEvidence: async (runId: string, identity: Record<string, string>, evidence: unknown): Promise<boolean> => native?.updateResultEvidence ? !!(await native.updateResultEvidence(runId, JSON.stringify(identity), JSON.stringify(evidence))) : false,
  createResultArchive: async (runId: string, profileId: string) => native ? await native.createResultArchive(runId, profileId) : runId,
  appendResultArchive: async (runId: string, key: string, payload: any): Promise<{ok?:boolean;error?:string;path?:string}> => native ? JSON.parse(await native.appendResultArchive(runId, key, JSON.stringify(payload))) : { ok: false, error: 'Otomatik kalıcı tarama yedeği Android Native gerektirir; bu sonuçları TXT ile kaydedin.' },
  flushResultArchive: async (runId: string): Promise<{ok?:boolean;error?:string;path?:string;count?:number}> => native ? JSON.parse(await native.flushResultArchive(runId)) : { ok: false, error: 'Bu platformda otomatik native yedek yok; TXT kaydı kullanın.' },
  getLatestResultArchive: async (profileId: string): Promise<string> => native ? await native.getLatestResultArchive(profileId) : '',
  getResultsPage: async (runId: string, afterId = 0, limit = 100): Promise<{ runId: string; matches: any[]; nextCursor: number; total: number; hasMore: boolean }> => {
    if (!native?.getResultsPage) throw new Error('Kalıcı tarama kayıtları için güncel DEV sürümü gerekli.');
    const page = JSON.parse(await native.getResultsPage(runId, afterId, limit));
    if (page.runId !== runId || !Array.isArray(page.matches) || !Number.isSafeInteger(page.nextCursor) || page.nextCursor < afterId) throw new Error('Tarama kayıt sayfası doğrulanamadı.');
    if (page.hasMore && page.nextCursor === afterId) throw new Error('Tarama cursor ilerlemiyor; kayıtlar korunuyor.');
    return page;
  },
  parseBulkAccountsFile: async (uri: string): Promise<any> => native ? await native.parseBulkAccountsFile(uri) : { supported: false, reason: "native-unavailable" },
  inspectBulkAccountsFile: async (uri: string, sampleLimit = 12): Promise<any> => native ? await native.inspectBulkAccountsFile(uri, sampleLimit) : { supported: false, reason: "native-unavailable" },
  startStreamingFileScanV172: async (uri: string, directory: any[], requestedConcurrency: number, timeoutMs: number, batchSize: number, sourceFingerprint: string): Promise<NativeScanStartResult | null> =>
    native ? ownedScan(() => native.startStreamingFileScanV172(uri, JSON.stringify(directory || []), requestedConcurrency, timeoutMs, batchSize, sourceFingerprint)) : null,
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
    return ownedScan(() => native.startScan(payload, username, password, concurrency, timeoutMs));
  },
  startBulkScan: async (candidates: any[], accounts: Array<{ row?: number; name?: string; username: string; password: string }>, concurrency: number, timeoutMs: number): Promise<NativeScanStartResult | null> =>
    native ? ownedScan(() => native.startBulkScan(JSON.stringify(candidates), JSON.stringify(accounts), concurrency, timeoutMs)) : null,
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
    return ownedScan(() => native.startUnifiedScan(JSON.stringify(payload), jobs.length, initialTotal, concurrency, timeoutMs));
  },
  startUnifiedScanV171: async (payload: UnifiedScanCompactPayload, requestedConcurrency: number, timeoutMs: number, batchSize: number, sourceFingerprint: string): Promise<NativeScanStartResult | null> => {
    if (!native) return null;
    const initialTotal = payload.jobs.reduce((sum, job) => sum + (payload.candidateSets[job.candidateSet]?.length || 0), 0);
    return ownedScan(() => native.startUnifiedScanV171(
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
  probePlaybackFrame: async (id: string, url: string, headers: Record<string,string>, signal?: AbortSignal): Promise<{frame:boolean;reason:string;elapsedMs?:number}> => {
    if (!native?.probePlaybackFrame) return {frame:false,reason:"NATIVE_UNAVAILABLE"};
    const cancel=()=>{void native.cancelPlaybackFrame?.(id);};
    signal?.addEventListener("abort",cancel,{once:true});
    try { if(signal?.aborted)return {frame:false,reason:"CANCELLED"}; return JSON.parse(await native.probePlaybackFrame(id,url,JSON.stringify(headers),12000)); }
    finally { signal?.removeEventListener("abort",cancel); }
  },
  saveScanProxyManualText: async (text: string): Promise<void> => {
    if (!native?.saveScanProxyManualText) throw new Error("Şifreli proxy kaydı için uygulamayı güncelleyin.");
    if (!await native.saveScanProxyManualText(text)) throw new Error("Proxy bilgisi kaydedilemedi.");
  },
  loadScanProxyManualText: async (): Promise<string> => native?.loadScanProxyManualText ? String(await native.loadScanProxyManualText()) : "",
  saveScanProxyPrivateConfig: async (json: string): Promise<void> => {
    if (!native?.saveScanProxyPrivateConfig || !await native.saveScanProxyPrivateConfig(json)) throw new Error("Şifreli proxy tercihleri kaydedilemedi.");
  },
  loadScanProxyPrivateConfig: async (): Promise<string> => native?.loadScanProxyPrivateConfig ? String(await native.loadScanProxyPrivateConfig()) : "{}",
  removeScanProxySource: async (sourceId: string): Promise<NativeScanProxyStatus> => {
    if (!native?.removeScanProxySource) throw new Error("Kaynak silme desteklenmiyor.");
    return JSON.parse(await native.removeScanProxySource(sourceId));
  },
  setScanProxyRotation: async (mode: "round_robin" | "random" | "gateway"): Promise<NativeScanProxyStatus> => {
    if (!native?.setScanProxyRotation) throw new Error("Proxy rotasyonu için uygulamayı güncelleyin.");
    return JSON.parse(await native.setScanProxyRotation(mode));
  },
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
  restoreScanProxyState: async (): Promise<ScanProxyTestProgress> => {
    if (!native?.restoreScanProxyState) return PanelScan.getScanProxyTestProgress();
    return JSON.parse(await native.restoreScanProxyState());
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
  proxiedProbe: async (url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; body: string; headers?:Record<string,string>; error?: string }> => {
    if (!native?.proxiedProbe) return { ok: false, status: 0, body: "", error: "native-unavailable" };
    try { return JSON.parse(await native.proxiedProbe(url, timeoutMs)); }
    catch (e: any) { return { ok: false, status: 0, body: "", error: String(e?.message || e) }; }
  },
  /**
   * v18.7.0 — Özel başlık/gövdeli proxy isteği (MAG çoklu-MAC stalker handshake/profil).
   * proxy YOKSA/kapalıysa native "proxy yok" döner; çağıran doğrudan isteğe düşer.
   */
  proxiedRequest: async (
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs: number,
    signal?: AbortSignal,
    maxBodyBytes?: number,
  ): Promise<{ ok: boolean; status: number; body: string; headers?: Record<string, string>; proxy?: string; error?: string }> => {
    if (!native?.proxiedRequest) return { ok: false, status: 0, body: "", error: "native-unavailable" };
    if (signal?.aborted) return { ok: false, status: 0, body: "", error: "CANCELLED" };
    const requestId = `mag_${Date.now()}_${++proxyRequestSequence}`;
    if (maxBodyBytes !== undefined && (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 1048576)) return { ok: false, status: 0, body: "", error: "invalid-body-limit" };
    if (maxBodyBytes !== undefined && !native.proxiedRequestBoundedCancelable) return { ok: false, status: 0, body: "", error: "native-body-limit-unavailable" };
    const stop = () => { void Promise.resolve(native.cancelProxiedRequest?.(requestId)).catch(() => {}); };
    if (signal && maxBodyBytes === undefined && !native.proxiedRequestCancelable) return { ok: false, status: 0, body: "", error: "native-cancellation-unavailable" };
    signal?.addEventListener("abort", stop, { once: true });
    try {
      if (signal?.aborted) return { ok: false, status: 0, body: "", error: "CANCELLED" };
      const raw = maxBodyBytes !== undefined
        ? await native.proxiedRequestBoundedCancelable(requestId, url, method, JSON.stringify(headers || {}), body || "", timeoutMs, maxBodyBytes)
        : signal
        ? await native.proxiedRequestCancelable(requestId, url, method, JSON.stringify(headers || {}), body || "", timeoutMs)
        : await native.proxiedRequest(url, method, JSON.stringify(headers || {}), body || "", timeoutMs);
      return signal?.aborted ? { ok: false, status: 0, body: "", error: "CANCELLED" } : JSON.parse(raw);
    }
    catch (e: any) { return { ok: false, status: 0, body: "", error: String(e?.message || e) }; }
    finally { signal?.removeEventListener("abort", stop); }
  },
};

let proxyRequestSequence = 0;
function emptyProxyStatus(err: string): NativeScanProxyStatus {
  return { enabled: false, candidates: 0, pool: 0, dead: 0, alive: 0, poolTested: false, testPhase: "idle", exhausted: false, total: 0, working: 0, lastError: err };
}

export type NativeScanProxyEntry = {
  sourceIds?: string[];
  scheme: "http" | "https" | "socks4" | "socks5";
  host: string;
  port: number;
  user?: string;
  pass?: string;
};

export type ScanProxyTestConfig = {
  resume?: boolean;
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
  phase: "idle" | "running" | "paused" | "done" | "stopped" | "cancelled" | "failed" | "interrupted";
  runId?: string; filtered?: number; httpUsable?: number; httpsUsable?: number; reasons?: Record<string, number>;
  mode?: string;
  /** v18.5.0: "tcp" hızlı bağlantı elemesi → "verify" doğrulama + anonimlik. */
  stage?: "" | "tcp" | "verify";
  tcpTotal?: number; tcpTested?: number; tcpAlive?: number;
  elite?: number; anonymous?: number; unknownAnon?: number;
  total: number; tested: number; working: number; dead: number; transparent: number;
  http: number; socks4: number; socks5: number;
  elapsedMs: number; etaMs: number; ratePerSec: number;
  ownIp: string; error?: string;
  fastest: Array<{ proxy: string; ms: number; anon?: string; http?: boolean; https?: boolean }>;
};

export type NativeScanProxyStatus = {
  sources?: Record<string, number>;
  rotation?: "round_robin" | "random" | "gateway";
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
