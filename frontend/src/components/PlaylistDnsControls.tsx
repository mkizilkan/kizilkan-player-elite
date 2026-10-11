import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Playlist, PlaylistEndpoint } from '@/src/types';
import { usePlaylists } from '@/src/store/PlaylistContext';
import { useProfiles } from '@/src/store/ProfileContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { DnsManager } from './DnsManager';
import { playlistEndpoints, mergeEndpointEvidence } from '@/src/utils/playlistEndpoints';
import { playlistDnsAddresses, playlistDnsPatch } from '@/src/utils/playlistDnsManagement';
import { rememberWorkingHost } from '@/src/player/hostFailover';
import { boundPanelDnsCandidates, magDnsCandidate } from '@/src/utils/panelDnsFailover';

/** Immediate metadata saves, without downloading a whole catalogue per DNS test. */
export function PlaylistDnsControls({ playlist }: { playlist: Playlist }) {
  const { updatePlaylist } = usePlaylists(); const { activeProfile } = useProfiles(); const { colors } = useTheme();
  const current = useRef(playlist); const alive = useRef(false); const pending = useRef(0);
  const confirmed = useRef(playlist); const sequence = useRef(0);
  const tail = useRef<Promise<void>>(Promise.resolve());
  const [focused, setFocused] = useState(false); const [draft, setDraft] = useState(playlist); const [error, setError] = useState('');
  useEffect(() => { if (!pending.current) { current.current = playlist; confirmed.current = playlist; setDraft(playlist); } }, [playlist]);
  useFocusEffect(useCallback(() => {
    alive.current = true; setFocused(true);
    const controller = new AbortController();
    void (async () => {
      const initial = current.current;
      if (!initial.serverCodeBinding?.autoResolve || initial.serverCodeBinding.allowDirectoryAlternatives === false) return;
      try {
        const aliases = await boundPanelDnsCandidates(initial.serverCodeBinding, controller.signal);
        if (!alive.current || controller.signal.aborted) return;
        const currentPlaylist = current.current;
        const urls = [...new Set([...playlistDnsAddresses(currentPlaylist), ...aliases.map(h => currentPlaylist.source === 'stalker' ? magDnsCandidate(h, currentPlaylist.stalkerPortal || '') : h)])];
        if (urls.length > playlistDnsAddresses(currentPlaylist).length) persist(playlistDnsPatch(currentPlaylist, urls));
      } catch (e: any) { if (alive.current && !controller.signal.aborted) setError(`Rehber DNS'leri şu an alınamadı; kayıtlı adresler kullanılabilir. ${String(e?.message || e)}`); }
    })();
    return () => { controller.abort(); alive.current = false; setFocused(false); };
  }, []));
  const persist = (patch: Partial<Playlist>, preferred?: string) => {
    if (!alive.current) return;
    const snapshot = current.current;
    current.current = { ...snapshot, ...patch }; setDraft(current.current); setError(''); pending.current++;
    const currentSnapshot = current.current;
    const owner = ++sequence.current;
    tail.current = tail.current.catch(() => {}).then(async () => {
      if (!alive.current) return;
      if (preferred && snapshot.source === 'xtream') await rememberWorkingHost(snapshot.id, preferred);
      // Every queued write carries the whole DNS metadata projection. A prior
      // failed save cannot leave endpoint.primary and server fields disagreeing.
      const dnsPatch = snapshot.source === 'stalker'
        ? { stalkerPortal: currentSnapshot.stalkerPortal, stalkerBackupPortals: currentSnapshot.stalkerBackupPortals, stalkerResolvedPortal: currentSnapshot.stalkerResolvedPortal }
        : { xtreamServer: currentSnapshot.xtreamServer, backupHosts: currentSnapshot.backupHosts };
      const payload = { ...dnsPatch, serverCodeBinding: currentSnapshot.serverCodeBinding, endpoints: currentSnapshot.endpoints };
      try { await updatePlaylist(snapshot.id, payload); }
      catch (e) { if (preferred && snapshot.source === 'xtream') await rememberWorkingHost(snapshot.id, confirmed.current.xtreamServer || ''); throw e; }
      confirmed.current = { ...confirmed.current, ...payload };
      if (alive.current) setError('');
    }).catch((e: any) => { if (alive.current) {
      if (owner === sequence.current) { current.current = confirmed.current; setDraft(confirmed.current); }
      setError(`DNS değişikliği kaydedilemedi: ${String(e?.message || e)}`);
    } })
      .finally(() => { pending.current--; });
  };
  const accept = (e: PlaylistEndpoint) => persist({ endpoints: mergeEndpointEvidence(playlistEndpoints(current.current), e) });
  if (!focused || !['stalker', 'xtream'].includes(draft.source)) return null;
  const primary = draft.source === 'stalker' ? draft.stalkerPortal || '' : draft.xtreamServer || '';
  return <View>
    <DnsManager primary={primary} hosts={playlistDnsAddresses(draft).filter(h => h !== primary)} kind={draft.source === 'stalker' ? 'stalker' : 'xtream'}
      username={draft.xtreamUsername || ''} password={draft.xtreamPassword || ''} mac={draft.stalkerMac} serial={draft.stalkerSerial} profileId={activeProfile.id}
      endpoints={draft.endpoints} onEvidence={accept}
      onChange={hosts => persist(playlistDnsPatch(current.current, [primary, ...hosts]))}
      onMakePrimary={host => persist(playlistDnsPatch(current.current, playlistDnsAddresses(current.current), host), host)}
      saveHint="DNS ve test sonuçları otomatik kaydedilir. Aktif yap seçimi bu hesapta hemen uygulanır." />
    {error ? <Text style={{ color: colors.error, marginVertical: 8 }}>{error}</Text> : null}
  </View>;
}
