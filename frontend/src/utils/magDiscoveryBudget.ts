/** Host keşfi için ortak istek sayacı ve gerçek süre/iptal sınırı. */
export type MagDiscoverySpeed = 'fast' | 'balanced' | 'slow';
export const MAG_DISCOVERY_LIMITS = {
  fast: { deadlineMs: 12000, maxRequests: 96 },
  balanced: { deadlineMs: 25000, maxRequests: 144 },
  slow: { deadlineMs: 40000, maxRequests: 192 },
} as const;
export class MagDiscoveryBudget {
  readonly controller = new AbortController();
  readonly startedAt = Date.now();
  readonly deadlineAt: number;
  readonly maxRequests: number;
  requests = 0;
  private reason?: 'deadline' | 'requests' | 'cancelled';
  private timer: ReturnType<typeof setTimeout>;
  private parent?: AbortSignal;
  readonly sharedBudget?: MagDiscoveryBudget;
  private onParent = () => this.stop('cancelled');
  private onShared = () => this.stop(this.sharedBudget?.stopReason === 'cancelled' ? 'cancelled' : this.sharedBudget?.stopReason === 'requests' ? 'requests' : 'deadline');
  constructor(options: { deadlineMs?: number; maxRequests?: number; signal?: AbortSignal; speed?: MagDiscoverySpeed; sharedBudget?: MagDiscoveryBudget } = {}) {
    const limits = MAG_DISCOVERY_LIMITS[options.speed || 'balanced'];
    this.deadlineAt = this.startedAt + Math.max(1, options.deadlineMs ?? limits.deadlineMs);
    this.maxRequests = Math.max(1, Math.floor(options.maxRequests ?? limits.maxRequests));
    this.parent = options.signal;
    this.sharedBudget = options.sharedBudget;
    this.timer = setTimeout(() => this.stop('deadline'), Math.max(1, this.deadlineAt - Date.now()));
    this.parent?.addEventListener('abort', this.onParent, { once: true });
    this.sharedBudget?.signal.addEventListener('abort', this.onShared, { once: true });
    if (this.parent?.aborted) this.onParent();
    if (this.sharedBudget?.signal.aborted) this.onShared();
  }
  get signal(): AbortSignal { return this.controller.signal; }
  get remainingMs(): number { return Math.max(0, Math.min(this.deadlineAt - Date.now(), this.sharedBudget?.remainingMs ?? Infinity)); }
  get exhausted(): boolean { return this.reason === 'deadline' || this.reason === 'requests' || this.remainingMs === 0; }
  get stopReason(): string | undefined { return this.reason; }
  stop(reason: 'deadline' | 'requests' | 'cancelled'): void {
    if (this.reason) return;
    this.reason = reason; this.controller.abort();
  }
  check(): void {
    this.sharedBudget?.check();
    if (!this.reason && this.remainingMs === 0) this.stop('deadline');
    if (this.reason) throw Object.assign(new Error(this.reason === 'cancelled' ? 'Keşif iptal edildi' : `Host keşif bütçesi doldu (${this.reason})`), { kind: this.reason === 'cancelled' ? 'CANCELLED' : 'MAG_DISCOVERY_BUDGET' });
  }
  consume(): void {
    this.check();
    if (this.requests >= this.maxRequests) { this.stop('requests'); this.check(); }
    this.sharedBudget?.consume();
    this.requests++;
  }
  async run<T>(work: Promise<T>): Promise<T> {
    this.check();
    let stop!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      stop = () => { try { this.check(); } catch (error) { reject(error); } };
      this.signal.addEventListener('abort', stop, { once: true });
      if (this.signal.aborted) stop();
    });
    try { const value = await Promise.race([work, cancelled]); this.check(); return value; }
    finally { this.signal.removeEventListener('abort', stop); }
  }
  dispose(): void { clearTimeout(this.timer); this.parent?.removeEventListener('abort', this.onParent); this.sharedBudget?.signal.removeEventListener('abort', this.onShared); }
}

/** Pasif araştırma ortak sayacı sıfırlamaz; kalan süre/istekler handshake'e kalır. */
export function magPassiveDiscoveryBudget(sharedBudget: MagDiscoveryBudget): MagDiscoveryBudget {
  sharedBudget.check();
  return new MagDiscoveryBudget({ sharedBudget, deadlineMs: Math.max(1, Math.floor(sharedBudget.remainingMs * 0.55)),
    maxRequests: Math.max(1, sharedBudget.maxRequests - sharedBudget.requests - 24) });
}
