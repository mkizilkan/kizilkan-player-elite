const listeners = new Set<() => void>();
const drains = new Set<() => Promise<unknown>>();
export function subscribeProfileDataReload(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyProfileDataReload(): void {
  for (const listener of Array.from(listeners)) listener();
}
/** Restore first rejects new writes, then waits for each provider's already queued work. */
export function registerProfileDataDrain(drain: () => Promise<unknown>): () => void {
  drains.add(drain);
  return () => { drains.delete(drain); };
}
export async function drainProfileDataWrites(): Promise<void> {
  await Promise.all(Array.from(drains, drain => drain()));
}
