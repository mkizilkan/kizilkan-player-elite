/** Transport failures are never credential rejection. Shared by discovery and DNS health. */
export type ScanOutcome<T> = { state: 'valid'; value: T; elapsedMs: number } | {
  state: 'rejected' | 'temporary' | 'protected' | 'cancelled'; reason: string; elapsedMs: number; retryAfterMs?: number;
};
export function explicitScanAuth(value: unknown): boolean | null {
  if ([1, '1', true, 'true'].includes(value as any)) return true;
  if ([0, '0', false, 'false'].includes(value as any)) return false;
  return null;
}
export function scanResponseFailure(status: number, headers: Record<string, string>, body: string): 'protected' | 'temporary' | null {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  if (h['cf-mitigated'] === 'challenge' || /\/cdn-cgi\/challenge-platform\/|cf_chl_opt|captcha (?:is )?required|human verification required|request blocked by.*(?:waf|firewall)/i.test(body.slice(0, 65536))) return 'protected';
  if (status === 401 || status === 403) return 'protected'; // HTTP denial alone is not proof of bad credentials.
  if (status < 200 || status >= 300) return 'temporary';
  return null;
}
