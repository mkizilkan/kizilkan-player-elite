import type { Playlist, PlaylistEndpoint } from '@/src/types';

export function canonicalEndpointUrl(value: string): string {
  try {
    const u = new URL(value);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash) return '';
    return `${u.origin.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch { return ''; }
}

/** A selected full portal keeps its path; an origin inherits the active path. */
export function selectedMagDnsCandidate(value: string, currentEndpoint: string): string {
  const canonical = canonicalEndpointUrl(value);
  if (!canonical) return '';
  try {
    const target = new URL(canonical);
    if (target.pathname.replace(/\/+$/, '')) return canonical;
    const current = new URL(currentEndpoint);
    const explicitPort = /^[a-z]+:\/\/(?:\[[^\]]+\]|[^/:?#]+):\d+(?:[/?#]|$)/i.test(value);
    if (!explicitPort && !target.port && current.port) target.port = current.port;
    target.pathname = current.pathname;
    return canonicalEndpointUrl(target.toString());
  } catch { return ''; }
}

/** Address membership is explicit. Sharing a MAC/username never merges accounts. */
export function playlistEndpoints(pl: Partial<Playlist>): PlaylistEndpoint[] {
  const kind = pl.source === 'stalker' ? 'stalker' : pl.source === 'xtream' ? 'xtream' : null;
  if (!kind) return [];
  const primary = kind === 'stalker' ? pl.stalkerPortal : pl.xtreamServer;
  const urls = kind === 'stalker' ? [primary, ...(pl.stalkerBackupPortals || []), ...(pl.serverCodeBinding?.selectedHosts || []).map(h => selectedMagDnsCandidate(h, primary || ''))] : [primary, ...(pl.serverCodeBinding?.validatedHosts || []), ...(pl.serverCodeBinding?.selectedHosts || []), ...(pl.backupHosts || [])];
  const existing = new Map((pl.endpoints || []).filter(e => e.kind === kind).map(e => [canonicalEndpointUrl(e.url), e]));
  const out = new Map<string, PlaylistEndpoint>();
  for (const value of urls) {
    const url = canonicalEndpointUrl(String(value || '')); if (!url) continue;
    out.set(url, { ...(existing.get(url) || {}), url, kind, source: existing.get(url)?.source || 'metadata', primary: url === canonicalEndpointUrl(String(primary || '')) });
  }
  return [...out.values()];
}

export function endpointProofLabel(endpoint: PlaylistEndpoint): string {
  if (endpoint.playbackTestAt && endpoint.playbackTestState && endpoint.playbackTestState !== 'frame'
    && (!endpoint.firstFrameAt || Date.parse(endpoint.playbackTestAt) >= Date.parse(endpoint.firstFrameAt))) {
    const result = endpoint.playbackTestState === 'no_frame' ? 'Testte görüntü alınamadı'
      : endpoint.playbackTestState === 'cancelled' ? 'Görüntü testi iptal edildi' : 'Görüntü testi tamamlanamadı';
    return `${result} · ${new Date(endpoint.playbackTestAt).toLocaleString('tr-TR')}`;
  }
  if (endpoint.firstFrameAt) return `İlk kare görüldü${Number.isFinite(endpoint.firstFrameElapsedMs) ? ` · ${(endpoint.firstFrameElapsedMs! / 1000).toFixed(1)} sn` : ''} · ${new Date(endpoint.firstFrameAt).toLocaleString('tr-TR')}`;
  if (endpoint.playbackObservedAt) return `Video ve ilerleyen oynatma gözlendi · ${new Date(endpoint.playbackObservedAt).toLocaleString('tr-TR')}`;
  if (endpoint.catalogVerifiedAt) return 'Katalog alındı · ilk kare sınanmadı';
  if (endpoint.accountVerifiedAt) return 'Hesap doğrulandı · ilk kare sınanmadı';
  return endpoint.lastError ? 'Son test tamamlanamadı · yeniden test edilebilir' : 'Henüz doğrulanmadı';
}

export function mergeEndpointEvidence(existing: PlaylistEndpoint[], evidence: PlaylistEndpoint): PlaylistEndpoint[] {
  const url = canonicalEndpointUrl(evidence.url);
  if (!url) return existing;
  const previous = existing.find(e => e.kind === evidence.kind && canonicalEndpointUrl(e.url) === url);
  return [...existing.filter(e => e.kind !== evidence.kind || canonicalEndpointUrl(e.url) !== url).map(e=>evidence.primary && e.kind===evidence.kind?{...e,primary:false}:e), { ...previous, ...evidence, url }];
}

export function endpointProjection(profileId: string, playlists: Partial<Playlist>[]) {
  return playlists.map(pl => ({ playlistId: String(pl.id), endpoints: playlistEndpoints(pl) }));
}
