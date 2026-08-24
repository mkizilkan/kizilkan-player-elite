import { requireNativeModule } from "expo-modules-core";

export type NativeScanStartResult = {
  accepted: boolean;
  state: "STARTING" | "BUSY" | "REJECTED";
  runId: string;
  activeRunId?: string;
};

type NativeSnapshot = {
  runId?: string; state?: "STARTING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED"; createdAt?: number; updatedAt?: number;
  mode?: "single" | "bulk" | "unified"; running?: boolean; cancelled?: boolean; paused?: boolean;
  tested?: number; total?: number; accountTested?: number; accountTotal?: number; accountIndex?: number;
  panelTested?: number; panelTotal?: number; found?: number; panelName?: string; currentServer?: string; error?: string; matches?: any[];
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
  startUnifiedScan: async (jobs: Array<{ row?: number; name?: string; username: string; password: string; candidates: any[] }>, concurrency: number, timeoutMs: number): Promise<NativeScanStartResult | null> =>
    native ? normalizeStartResult(await native.startUnifiedScan(JSON.stringify(jobs), concurrency, timeoutMs)) : null,
  cancelScan: async (runId: string) => native && runId ? native.cancelScan(runId) : false,
  pauseScan: async (runId: string) => native && runId ? native.pauseScan(runId) : false,
  resumeScan: async (runId: string) => native && runId ? native.resumeScan(runId) : false,
  getActiveRunId: (): string => native ? String(native.getActiveRunId?.() || "") : "",
  getSnapshot: (): NativeSnapshot => { if (!native) return {}; try { return JSON.parse(native.getSnapshot() || "{}"); } catch { return {}; } },
};
