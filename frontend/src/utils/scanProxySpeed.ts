/** Verification workers are separate from the fast TCP stage. */
export const PROXY_VERIFY_SPEEDS = [
  { id: "slow", label: "Yavaş", parallel: 16 },
  { id: "safe", label: "Güvenli", parallel: 32 },
  { id: "fast", label: "Hızlı", parallel: 64 },
  { id: "ultra", label: "Ultra", parallel: 128 },
  { id: "manual", label: "Manuel", parallel: null },
] as const;
export type ProxyVerificationSpeed = typeof PROXY_VERIFY_SPEEDS[number]["id"];
export const MAX_PROXY_VERIFY_PARALLEL = 128;
const bounded = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value)
  ? Math.max(1, Math.min(MAX_PROXY_VERIFY_PARALLEL, Math.floor(value))) : fallback;

export function proxyVerificationSettings(value: {
  verificationSpeed?: unknown; verifyConcurrency?: unknown; manualVerifyConcurrency?: unknown;
}) {
  const speed = PROXY_VERIFY_SPEEDS.find(s => s.id === value.verificationSpeed) || PROXY_VERIFY_SPEEDS[0];
  const manualVerifyConcurrency = bounded(value.manualVerifyConcurrency ?? value.verifyConcurrency, 16);
  return { verificationSpeed: speed.id, manualVerifyConcurrency,
    verifyConcurrency: speed.parallel ?? manualVerifyConcurrency };
}

/** Invalid user input is shown as an error; never silently launch with a different number. */
export function parseManualProxyParallel(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_PROXY_VERIFY_PARALLEL ? n : null;
}

export function proxyTcpParallel(value: unknown, legacy = false): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 64;
  return Math.max(4, Math.min(128, legacy ? Math.max(4, n) * 2 : n));
}
