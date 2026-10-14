import { parsePortalHosts, portalDiscoveryCandidates, type MagDiscoveryScope } from '@/src/utils/magBulk';
import { discoverMagHosts } from '@/src/utils/magPortalDiscovery';
import { chooseMagPortals, createMagRequestGate } from '@/src/utils/magBulkScan';
import { discoverMagPortal, type StalkerCreds } from '@/src/utils/stalker';
import { MagDiscoveryBudget, magPassiveDiscoveryBudget } from '@/src/utils/magDiscoveryBudget';
import { magFamilyEndpoints, resolveMagPortal, type ResolvedMagPortal } from '@/src/utils/magEndpointRegistry';

/** Tekli ekleme de toplu akışın aynı keşif/endpoint/bütçe sözleşmesini kullanır. */
export async function resolveMagInput(cred: StalkerCreds, options: { signal?: AbortSignal; scope?: MagDiscoveryScope; onStage?: (message: string) => void } = {}): Promise<ResolvedMagPortal> {
  const parsed = parsePortalHosts(cred.portal), host = parsed.hosts[0];
  if (!host || parsed.invalid.length || parsed.hosts.length !== 1) throw new Error('Geçersiz MAG portal adresi.');
  const literalApi = /\.php$/i.test(new URL(host.host).pathname);
  const scope = options.scope || (literalApi ? 'exact' : 'fallback');
  const budget = new MagDiscoveryBudget({ signal: options.signal,operationId:cred.operationId||cred.requestScope?.operationId });
  const control = { signal: options.signal }, gate = createMagRequestGate(control, options.onStage);
  try {
    const passive = magPassiveDiscoveryBudget(budget);
    let reports;
    try { reports = await discoverMagHosts([host], { scope, gate, control, budgetForHost: () => passive, allowOtherPorts: options.scope === 'all' || !host.hasPort, onStage: options.onStage }); }
    finally { passive.dispose(); }
    const report = reports[0];
    if (report?.state === 'protected') throw Object.assign(new Error(report.message || 'Portal doğrulama/koruma istiyor.'), { kind: 'MAG_PROTECTION' });
    const selected = report && chooseMagPortals(reports)[report.host.host];
    if (selected) {
      const candidate = report.candidates.find(value => value.endpoint === selected)!;
      return candidate.resolvedPortal || resolveMagPortal(host.host, selected, candidate.evidence, 'input');
    }
    budget.check();
    const candidates = scope === 'exact' ? [host.host] : host.hasPort
      ? magFamilyEndpoints(host.host).filter(value => /\.php$/i.test(new URL(value).pathname))
      : portalDiscoveryCandidates(host);
    const found = await discoverMagPortal({ ...cred, portal: host.host, requestScope: { ...gate, operationId:budget.operationId,transport: 'direct', signal: options.signal, discoveryBudget: budget } }, candidates, {
      signal: options.signal, timeoutMs: 6000,
      onProbe: (_endpoint, i, t) => options.onStage?.(`Portal aranıyor · handshake ${i + 1}/${t}`),
    });
    if (found) return found.resolvedPortal || resolveMagPortal(host.host, found.endpoint, ['handshake-token'], 'handshake');
    throw new Error(report?.message || 'Bu kapsamda MAG API doğrulanamadı. Portal adresini, portunu ve yolunu kontrol edin.');
  } finally { budget.dispose(); }
}
