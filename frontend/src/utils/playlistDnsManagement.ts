import type { Playlist, PlaylistEndpoint } from '@/src/types';
import { canonicalEndpointUrl, mergeEndpointEvidence, playlistEndpoints } from './playlistEndpoints';

export function playlistDnsAddresses(pl: Partial<Playlist>): string[] {
  return playlistEndpoints(pl).map(e => e.url);
}

/** A new failed test must not rank an old successful frame as current health. */
export function endpointHasCurrentFrame(e: PlaylistEndpoint): boolean {
  if (!e.firstFrameAt || !Number.isFinite(Date.parse(e.firstFrameAt))) return false;
  return !e.playbackTestAt || e.playbackTestState === 'frame'
    || Date.parse(e.firstFrameAt) > Date.parse(e.playbackTestAt);
}

/** Compare actual first-frame observations; auth/HEAD latency alone is not video proof. */
export function bestPlaybackEndpoint(values: PlaylistEndpoint[]): PlaylistEndpoint | undefined {
  return values.filter(e => endpointHasCurrentFrame(e) && Number.isFinite(e.firstFrameElapsedMs) && e.firstFrameElapsedMs! >= 0)
    .sort((a, b) => a.firstFrameElapsedMs! - b.firstFrameElapsedMs!
      || (a.accountLatencyMs ?? Infinity) - (b.accountLatencyMs ?? Infinity))[0];
}

/** User supplied aliases become part of the explicit DNS selection, even in strict mode. */
export function playlistDnsPatch(pl: Playlist, addresses: string[], primary?: string): Partial<Playlist> {
  if (pl.source !== 'stalker' && pl.source !== 'xtream') throw new Error('Bu kaynak DNS hesabı değil.');
  const old = canonicalEndpointUrl(pl.source === 'stalker' ? pl.stalkerPortal || '' : pl.xtreamServer || '');
  const urls = [...new Set(addresses.map(canonicalEndpointUrl).filter(Boolean))];
  const target = canonicalEndpointUrl(primary || old);
  if (!target || !urls.includes(target)) throw new Error('Birincil adres DNS listesinde olmalı.');
  const kind = pl.source === 'stalker' ? 'stalker' : 'xtream';
  let endpoints = playlistEndpoints(pl).filter(e => urls.includes(e.url));
  endpoints = mergeEndpointEvidence(endpoints, { url: target, kind, source: 'manual', primary: true });
  const patch: Partial<Playlist> = { endpoints };
  if (kind === 'stalker') {
    patch.stalkerPortal = target;
    patch.stalkerBackupPortals = urls.filter(h => h !== target);
    if (target !== old) patch.stalkerResolvedPortal = undefined;
  } else {
    patch.xtreamServer = target;
    patch.backupHosts = urls.filter(h => h !== target);
  }
  if (pl.serverCodeBinding) patch.serverCodeBinding = {
    ...pl.serverCodeBinding,
    selectedHosts: urls,
    validatedHosts: (pl.serverCodeBinding.validatedHosts || []).filter(h => urls.includes(canonicalEndpointUrl(h))),
    preferredServer: target,
    lastResolvedServer: target,
    lastResolvedAt: new Date().toISOString(),
  };
  return patch;
}
