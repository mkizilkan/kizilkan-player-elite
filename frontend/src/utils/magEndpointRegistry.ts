/** Ortak, kimlik bilgisi içermeyen MAG kurulum/endpoint sözleşmesi. */
export const MAG_ENDPOINT_REGISTRY = [
  { family: 'classic', base: '', ui: '/c/', api: ['/portal.php', '/server/load.php', '/server/portal.php', '/load.php', '/c/portal.php', '/c/server/load.php'] },
  { family: 'stalker-portal', base: '/stalker_portal', ui: '/c/', api: ['/server/load.php', '/server/portal.php', '/portal.php'] },
  { family: 'ministra', base: '/ministra', ui: '/c/', api: ['/portal.php', '/server/load.php', '/server/portal.php'] },
  { family: 'ministra', base: '/ministra/portal', ui: '/c/', api: ['/portal.php', '/server/load.php'] },
] as const;
export const MAG_LEGACY_API_PATHS = ['/portal.php', '/load.php', '/stalker_portal/server/load.php', '/stalker_portal/server/portal.php', '/server/load.php', '/server/portal.php', '/c/portal.php'];
export const MAG_REGISTERED_DISCOVERY_PATHS = ['/c/', '/portal.php', '/stalker_portal/c/', '/stalker_portal/server/load.php', '/stalker_portal/server/', '/stalker_portal/', '/server/load.php', '/portal/', '/load.php', '/c/portal.php', '/ministra/c/', '/ministra/portal/c/', '/ministra/portal/', '/ministra/'];
export type MagPortalFamily = 'classic' | 'stalker-portal' | 'ministra' | 'c-subpath' | 'unknown';
export type MagPortalConfidence = 'none' | 'weak' | 'fingerprint' | 'strong' | 'verified';
export type ResolvedMagPortal = {
  inputUrl: string; origin: string; uiPath?: string; apiPath: string; endpoint: string;
  family: MagPortalFamily; confidence: MagPortalConfidence;
  resolvedBy: 'input' | 'redirect' | 'version' | 'xpcom' | 'html' | 'api' | 'handshake';
  evidence: Array<{ kind: string; weight: number }>;
  compatProfileId?: string; endpointLocked: boolean; discoveredAt: string;
};
export function magInstallation(value: string): { origin: string; base: string; uiPath: string; family: MagPortalFamily } {
  const u = new URL(value);
  let base = u.pathname.replace(/\/+$/, '').replace(/\/(?:[^/]+\.(?:php|html?|js))$/i, '');
  base = base.replace(/\/(?:c|server)$/i, '');
  const known = [...MAG_ENDPOINT_REGISTRY].reverse().find(entry => entry.base && (base === entry.base || base.endsWith(entry.base)));
  const family: MagPortalFamily = known?.family || (base ? 'c-subpath' : 'classic');
  return { origin: u.origin, base, uiPath: `${base}/c/`, family };
}
export function magFamilyEndpoints(value: string): string[] {
  const u = new URL(value), installation = magInstallation(value);
  if (/\.php$/i.test(u.pathname)) return [u.origin + u.pathname];
  const registered = MAG_ENDPOINT_REGISTRY.find(entry => entry.family === installation.family) || MAG_ENDPOINT_REGISTRY[0];
  const paths = [u.pathname, installation.uiPath, `${installation.base}/c/index.html`, ...registered.api.map(path => installation.base + path)];
  return [...new Set(paths.map(path => u.origin + path))];
}
export function magClientAssetUrls(value: string): { xpcom: string; version: string } {
  const { origin, uiPath } = magInstallation(value);
  return { xpcom: origin + uiPath + 'xpcom.common.js', version: origin + uiPath + 'version.js' };
}
export function magEvidenceWeight(kind: string): number {
  if (/handshake-token|discovered-by-handshake/.test(kind)) return 100;
  if (/anonymous-stb-token|stb-field|api-envelope/.test(kind)) return 80;
  if (/xpcom/.test(kind)) return 60;
  if (/version-js/.test(kind)) return 35;
  if (/brand|client-marker|api-link/.test(kind)) return 25;
  if (/redirect/.test(kind)) return 15;
  return 0; // HTTP 200 tek başına portal kanıtı değildir.
}
export function resolveMagPortal(inputUrl: string, endpoint: string, kinds: string[], resolvedBy: ResolvedMagPortal['resolvedBy'] = 'input', compatProfileId?: string): ResolvedMagPortal {
  const input = new URL(inputUrl), u = new URL(endpoint);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash || input.username || input.password
    || u.hostname.toLowerCase() !== input.hostname.toLowerCase()) throw new Error('Geçersiz çözümlenmiş portal adresi');
  const installation = magInstallation(u.toString());
  const evidence = [...new Set(kinds)].map(kind => ({ kind, weight: magEvidenceWeight(kind) }));
  const score = Math.max(0, ...evidence.map(item => item.weight));
  const confidence: MagPortalConfidence = score >= 100 ? 'verified' : score >= 80 ? 'strong' : score >= 25 ? 'fingerprint' : score ? 'weak' : 'none';
  return { inputUrl: input.origin + input.pathname, origin: u.origin, uiPath: installation.uiPath, apiPath: u.pathname,
    endpoint: u.origin + u.pathname.replace(/\/+$/, ''), family: installation.family, confidence, resolvedBy, evidence,
    compatProfileId, endpointLocked: confidence === 'verified' || confidence === 'strong', discoveredAt: new Date().toISOString() };
}
export function preferResolvedMagPortal(current: ResolvedMagPortal | undefined, next: ResolvedMagPortal): ResolvedMagPortal {
  if (!current) return next;
  const score = (portal: ResolvedMagPortal) => Math.max(0, ...portal.evidence.map(item => item.weight));
  return score(next) > score(current) ? next : current;
}
