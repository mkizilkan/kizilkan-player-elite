import { requireNativeModule } from "expo-modules-core";

type NativeSnapshot = {
  runId?: string; state?: "STARTING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED"; createdAt?: number; updatedAt?: number;
  mode?: "single" | "bulk" | "unified"; running?: boolean; cancelled?: boolean; paused?: boolean;
  tested?: number; total?: number; accountTested?: number; accountTotal?: number; accountIndex?: number;
  panelTested?: number; panelTotal?: number; found?: number; panelName?: string; currentServer?: string; error?: string; matches?: any[];
  accountStatuses?: Array<{ accountIndex:number; sourceRow?:number; name?:string; state:string; tested:number; total:number; remaining:number; found:number }>;
};

let native: any = null;
try { native = requireNativeModule("PanelScan"); } catch {}

export const PanelScan = {
  available: !!native,
  startScan: async (candidates: any[], username: string, password: string, concurrency: number, timeoutMs: number): Promise<string | null> => native ? String(await native.startScan(JSON.stringify(candidates), username, password, concurrency, timeoutMs)) : null,
  startBulkScan: async (candidates: any[], accounts: Array<{ row?: number; name?: string; username: string; password: string }>, concurrency: number, timeoutMs: number): Promise<string | null> => native ? String(await native.startBulkScan(JSON.stringify(candidates), JSON.stringify(accounts), concurrency, timeoutMs)) : null,
  startUnifiedScan: async (jobs: Array<{ row?: number; name?: string; username: string; password: string; candidates: any[] }>, concurrency: number, timeoutMs: number): Promise<string | null> => native ? String(await native.startUnifiedScan(JSON.stringify(jobs), concurrency, timeoutMs)) : null,
  cancelScan: async () => native ? native.cancelScan() : false,
  pauseScan: async () => native ? native.pauseScan() : false,
  resumeScan: async () => native ? native.resumeScan() : false,
  getSnapshot: (): NativeSnapshot => { if (!native) return {}; try { return JSON.parse(native.getSnapshot() || "{}"); } catch { return {}; } },
};
