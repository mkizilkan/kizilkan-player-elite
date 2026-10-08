import React, { useEffect, useRef, useState } from 'react';
import { EndpointPlaybackTest } from './EndpointPlaybackTest';
import type { PlaylistEndpoint } from '@/src/types';

export type PlaybackTestAccount = { key: string; endpoint: string; kind: 'xtream' | 'stalker'; username?: string; password?: string; mac?: string; serial?: string; profileId?: string };
/** Mount one renderer at a time. The probe lease is released before the next account can open. */
export function AccountPlaybackTestQueue({ accounts, onEvidence, onClose }: {
  accounts: PlaybackTestAccount[]; onEvidence: (key: string, evidence: PlaylistEndpoint) => void; onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const account = accounts[index];
  if (!account) return null;
  const { key: accountKey, ...testProps } = account;
  return <EndpointPlaybackTest key={accountKey + index} {...testProps} onClose={onClose} onEvidence={value => {
    onEvidence(account.key, value);
    timer.current = setTimeout(() => { if (index + 1 < accounts.length) setIndex(index + 1); else onClose(); }, 750);
  }} />;
}
