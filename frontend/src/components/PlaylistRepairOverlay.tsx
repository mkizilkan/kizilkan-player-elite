import React from 'react';
import { usePlaylists } from '@/src/store/PlaylistContext';
import { CatalogPreparationModal } from '@/src/components/CatalogPreparationModal';

/** Aynı gerçek recovery state'ini ortak hazırlama görünümüne aktarır. */
export function PlaylistRepairOverlay() {
  const { heavyLoading, repairProgress } = usePlaylists();
  if (!repairProgress) return null;
  return <CatalogPreparationModal testID="playlist-repair-overlay" visible={heavyLoading} title={repairProgress.playlistName + ' hazırlanıyor'}
    message={repairProgress.message} progress={repairProgress.progress} startedAt={repairProgress.startedAt} lastProgressAt={repairProgress.lastProgressAt}
    pausedAt={repairProgress.pausedAt} pausedTotalMs={repairProgress.pausedTotalMs} paused={repairProgress.phase === 'paused'}/>;
}
export default PlaylistRepairOverlay;
