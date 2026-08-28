import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";

/**
 * v15.2.4 — Native-backed playback generation gate.
 *
 * JS tarafındaki hızlı local sayaç fallback olarak korunur; Android Native Core
 * mevcutsa generation authority Kotlin'dedir. Böylece stale callback/fallback
 * kontrolleri yalnız React component ömrüne bağlı kalmaz.
 */
export class PlaybackSessionGate {
  private seq = 0;
  private active = 0;

  begin(): number {
    const nativeId = KizilkanNativeCore.beginPlayerSession();
    if (typeof nativeId === "number" && Number.isFinite(nativeId) && nativeId > 0) {
      this.active = nativeId;
      this.seq = Math.max(this.seq, nativeId);
      return nativeId;
    }
    this.active = ++this.seq;
    return this.active;
  }

  current(): number {
    const nativeId = KizilkanNativeCore.getPlayerSession();
    if (typeof nativeId === "number" && Number.isFinite(nativeId) && nativeId > 0) {
      this.active = nativeId;
      this.seq = Math.max(this.seq, nativeId);
    }
    return this.active;
  }

  isActive(id: number): boolean {
    if (KizilkanNativeCore.available) return KizilkanNativeCore.isPlayerSessionActive(id);
    return id === this.active;
  }

  invalidate(id?: number): void {
    if (KizilkanNativeCore.available) {
      const next = KizilkanNativeCore.invalidatePlayerSession(id ?? 0);
      if (typeof next === "number" && Number.isFinite(next) && next > 0) {
        this.active = next;
        this.seq = Math.max(this.seq, next);
      }
      return;
    }
    if (id === undefined || id === this.active) this.active = ++this.seq;
  }
}
