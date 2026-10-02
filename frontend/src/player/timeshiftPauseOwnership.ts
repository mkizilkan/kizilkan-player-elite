/** Pause intent belongs to one external play request, not a reusable channel URL. */
export type TimeshiftPauseScope = {
  source: object | null;
  visible: boolean;
  profileId: string;
  playlistId: string;
  channelId: string;
  requestIdentity: string;
  mode: string;
};

export class TimeshiftPauseOwnership {
  private sequence = 0;
  private current: { source: object; identity: string; token: string } | null = null;

  update(scope: TimeshiftPauseScope): string {
    if (!scope.visible || !scope.source || !scope.requestIdentity) {
      this.current = null;
      return "";
    }
    const identity = JSON.stringify([
      scope.profileId, scope.playlistId, scope.channelId, scope.requestIdentity, scope.mode,
    ]);
    if (!this.current || this.current.source !== scope.source || this.current.identity !== identity) {
      this.current = { source: scope.source, identity, token: `pause-owner-${++this.sequence}` };
    }
    return this.current.token;
  }

  owns(token: string): boolean {
    return !!token && this.current?.token === token;
  }
}
