type Waiter = { grant: () => void; abort: () => void };
const hosts = new Map<string, { active: number; waiting: Waiter[]; until: number }>();

export function retryAfterMilliseconds(value: string | null, now = Date.now()): number {
  if (!value) return 1000;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, Math.min(120000, delay)) : 1000;
}
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(Object.assign(new Error('İşlem iptal edildi.'), { kind: 'CANCELLED' })); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, Math.max(0, ms));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
export function deferHost(host: string, ms: number): void {
  const state = hosts.get(host) || { active: 0, waiting: [], until: 0 };
  state.until = Math.max(state.until, Date.now() + ms); hosts.set(host, state);
}
/** Fair, cancellable host queue. Catalogue calls are separate from the single playback lease. */
export async function acquireHostRequest(host: string, signal?: AbortSignal, limit = 4): Promise<() => void> {
  if (signal?.aborted) throw Object.assign(new Error('İşlem iptal edildi.'), { kind: 'CANCELLED' });
  const state = hosts.get(host) || { active: 0, waiting: [], until: 0 }; hosts.set(host, state);
  await new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      grant: () => { signal?.removeEventListener('abort', waiter.abort); state.active++; resolve(); },
      abort: () => { const i = state.waiting.indexOf(waiter); if (i >= 0) state.waiting.splice(i, 1); signal?.removeEventListener('abort', waiter.abort); reject(Object.assign(new Error('İşlem iptal edildi.'), { kind: 'CANCELLED' })); },
    };
    if (state.active < limit) waiter.grant();
    else { state.waiting.push(waiter); signal?.addEventListener('abort', waiter.abort, { once: true }); if (signal?.aborted) waiter.abort(); }
  });
  let released = false;
  const release = () => {
    if (released) return; released = true; state.active--;
    state.waiting.shift()?.grant();
    if (!state.active && !state.waiting.length && state.until <= Date.now()) hosts.delete(host);
  };
  try { await abortableDelay(state.until - Date.now(), signal); return release; }
  catch (e) { release(); throw e; }
}
