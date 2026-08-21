import { requireNativeModule } from "expo-modules-core";

type NativeSnapshot = {
  running?: boolean;
  cancelled?: boolean;
  tested?: number;
  total?: number;
  panelTested?: number;
  panelTotal?: number;
  found?: number;
  panelName?: string;
  error?: string;
  matches?: any[];
};

let native: any = null;
try { native = requireNativeModule("PanelScan"); } catch {}

export const PanelScan = {
  available: !!native,
  startScan: async (candidates: any[], username: string, password: string, concurrency: number, timeoutMs: number) => {
    if (!native) return false;
    return native.startScan(JSON.stringify(candidates), username, password, concurrency, timeoutMs);
  },
  cancelScan: async () => native ? native.cancelScan() : false,
  getSnapshot: (): NativeSnapshot => {
    if (!native) return {};
    try { return JSON.parse(native.getSnapshot() || "{}"); } catch { return {}; }
  },
};
