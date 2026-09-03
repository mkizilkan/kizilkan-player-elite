import { requireNativeModule } from "expo-modules-core";

export type NativeScanStartResult = {
  accepted: boolean;
  state: "STARTING" | "BUSY" | "REJECTED";
  runId: string;
  activeRunId?: string;
};

type NativeSnapshot = {
  runId?: string; state?: "STARTING" | "RUNNING" | "PAUSED" | "CANCELLING" | "COMPLETED" | "FAILED" | "CANCELLED"; createdAt?: number; updatedAt?: number;
  mode?: "single" | "bulk" | "unified"; running?: boolean; cancelled?: boolean; paused?: boolean;
  tested?: number; total?: number; accountTested?: number; accountTotal?: number; accountIndex?: number;
  panelTested?: number; panelTotal?: number; found?: number; panelName?: string; currentServer?: string; error?: string; terminalReason?: string; matches?: any[];
  accountStatuses?: Array<{ accountIndex:number; sourceRow?:number; name?:string; state:string; tested:number; total:number; remaining:number; found:number }>;
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
  startScan: async (candidates: any[], username: string, password: string, concurrency: number, timeoutMs: number): Promise<NativeScanStartResult | null> =>
    native ? normalizeStartResult(await native.startScan(JSON.stringify(candidates), username, password, concurrency, timeoutMs)) : null,
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
  cancelScan: async (runId: string) => native && runId ? native.cancelScan(runId) : false,
  pauseScan: async (runId: string) => native && runId ? native.pauseScan(runId) : false,
  resumeScan: async (runId: string) => native && runId ? native.resumeScan(runId) : false,
  getActiveRunId: (): string => native ? String(native.getActiveRunId?.() || "") : "",
  getSnapshot: (): NativeSnapshot => { if (!native) return {}; try { return JSON.parse(native.getSnapshot() || "{}"); } catch { return {}; } },
  acknowledgeSnapshot: (runId: string): boolean => native && runId ? !!native.acknowledgeSnapshot?.(runId) : false,
  getDiagnosticEvents: (): any[] => { if (!native) return []; try { const v = JSON.parse(native.getDiagnosticEvents?.() || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } },
  getLastCrash: (): any => { if (!native) return {}; try { return JSON.parse(native.getLastCrash?.() || "{}"); } catch { return {}; } },
  clearDiagnostics: (): boolean => native ? !!native.clearDiagnostics?.() : false,
};
