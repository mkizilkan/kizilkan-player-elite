import type { ServerCodeBinding } from '@/src/types';
import { validPanelHosts } from './panelDirectoryModel';

/** Only bound, user-approved panel origins may provide new credential destinations. */
export async function boundPanelDnsCandidates(binding: ServerCodeBinding, signal?: AbortSignal): Promise<string[]> {
  if (signal?.aborted) throw Object.assign(new Error('İşlem iptal edildi.'),{kind:'CANCELLED'});
  const selected = binding.selectedHosts ?? binding.validatedHosts ?? [];
  if (!binding.autoResolve || binding.allowDirectoryAlternatives === false) return validPanelHosts(selected);
  const {resolveHosts}=await import('./serverCode');
  const origins = binding.sources?.length ? binding.sources : [{baseUrl:binding.codeSource,panelName:binding.panelName}];
  const results = await Promise.allSettled(origins.map(o=>resolveHosts(o.baseUrl,o.panelName,signal)));
  if (signal?.aborted) throw Object.assign(new Error('İşlem iptal edildi.'),{kind:'CANCELLED'});
  return validPanelHosts([...selected,...results.flatMap(r=>r.status==='fulfilled'?r.value:[])]);
}
export function magDnsCandidate(base: string, currentEndpoint: string): string {
  const target = new URL(base), current = new URL(currentEndpoint);
  // A directory base does not authorize unrelated portal paths or a broad port sweep.
  const explicitPort=/^[a-z]+:\/\/(?:\[[^\]]+\]|[^/:?#]+):\d+(?:[/?#]|$)/i.test(base);
  if(!explicitPort && !target.port && current.port)target.port=current.port;
  target.pathname = current.pathname; target.search=''; target.hash='';
  return target.toString().replace(/\/$/,'');
}
export function canTryDnsAlternative(error: any): boolean {
  return !['CANCELLED','BACKGROUND_PAUSE','MAG_RATE_LIMIT','MAG_PROTECTION','PROTECTION','RATE_LIMIT','ACCOUNT_REJECTED'].includes(String(error?.kind||'')) && ![401,403,429].includes(Number(error?.status));
}
