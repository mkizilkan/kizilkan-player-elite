export class PlaybackSessionGate {
  private seq = 0;
  private active = 0;

  begin(): number {
    this.active = ++this.seq;
    return this.active;
  }
  current(): number { return this.active; }
  isActive(id: number): boolean { return id === this.active; }
  invalidate(id?: number): void {
    if (id === undefined || id === this.active) this.active = ++this.seq;
  }
}
