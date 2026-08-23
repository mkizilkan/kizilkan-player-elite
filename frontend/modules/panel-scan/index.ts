import { requireNativeModule } from "expo-modules-core";

type NativeSnapshot = {
  mode?: "single" | "bulk" | "unified"; running?: boolean; cancelled?: boolean; paused?: boolean;
  tested?: number; total?: number; accountTested?: number; accountTotal?: number; accountIndex?: number;
  panelTested?: number; panelTotal?: number; found?: number; panelName?: string; error?: string; matches?: any[];
};

let native: any = null;
try { native = requireNativeModule("PanelScan"); } catch {}

export const PanelScan = {
  available: !!native,
  startScan: async (candidates: any[], username: string, password: string, concurrency: number, timeoutMs: number) => native ? native.startScan(JSON.stringify(candidates), username, password, concurrency, timeoutMs) : false,
  startBulkScan: async (candidates: any[], accounts: Array<{ row?: number; name?: string; username: string; password: string }>, concurrency: number, timeoutMs: number) => native ? native.startBulkScan(JSON.stringify(candidates), JSON.stringify(accounts), concurrency, timeoutMs) : false,
  startUnifiedScan: async (jobs: Array<{ row?: number; name?: string; username: string; password: string; candidates: any[] }>, concurrency: number, timeoutMs: number) => native ? native.startUnifiedScan(JSON.stringify(jobs), concurrency, timeoutMs) : false,
  cancelScan: async () => native ? native.cancelScan() : false,
  pauseScan: async () => native ? native.pauseScan() : false,
  resumeScan: async () => native ? native.resumeScan() : false,
  getSnapshot: (): NativeSnapshot => { if (!native) return {}; try { return JSON.parse(native.getSnapshot() || "{}"); } catch { return {}; } },
};
