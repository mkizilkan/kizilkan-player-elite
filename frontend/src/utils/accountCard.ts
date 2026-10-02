import type { Playlist } from '@/src/types';
import { accountExpiryMs, formatAccountExpiry } from './accountExpiry';

export function playlistProtectionText(playlist: Pick<Playlist, 'source' | 'accountInfo'>): string | null {
  if (playlist.source !== 'stalker') return null;
  const observation = playlist.accountInfo?.extra?.magProtection as any;
  if (!observation || observation.state === 'unknown') return 'Koruma: belirlenemedi';
  const label = observation.state === 'present' ? `Koruma gözlendi${observation.kind ? ` (${observation.kind})` : ''}` : 'Koruma görülmedi';
  const at = Date.parse(String(observation.observedAt || ''));
  return `${label}${Number.isFinite(at) ? ` · ${new Date(at).toLocaleDateString('tr-TR')}` : ''}`;
}
export function playlistExpiryText(playlist: Pick<Playlist, 'accountInfo'>): string { return formatAccountExpiry(playlist.accountInfo) || 'Bitiş: bilinmiyor / sınırsız'; }
export function playlistIsExpired(playlist: Pick<Playlist, 'accountInfo'>): boolean {
  const at = accountExpiryMs(playlist.accountInfo);
  return at !== null && at <= Date.now();
}
export function playlistCatalogStateText(playlist: Pick<Playlist, 'catalogLocalState'>): string | null {
  if (playlist.catalogLocalState === 'empty') return 'Katalog boş';
  if (playlist.catalogLocalState === 'missing') return 'İçerik cihazda yok · seçimde yeniden alınacak';
  if (playlist.catalogLocalState === 'unverified') return 'İçerik henüz doğrulanmadı';
  return null;
}
