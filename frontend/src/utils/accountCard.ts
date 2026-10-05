import type { Playlist } from '@/src/types';
import { accountExpiryMs, formatAccountExpiry } from './accountExpiry';

export function playlistProtectionText(playlist: Pick<Playlist, 'source' | 'accountInfo'>): string | null {
  if (playlist.source !== 'stalker') return null;
  const observation = playlist.accountInfo?.extra?.magProtection as any;
  if (!observation || observation.state === 'unknown') return observation?.edge === 'cloudflare' ? 'Cloudflare edge görüldü · koruma belirlenemedi' : 'Koruma: belirlenemedi';
  const label = observation.state === 'present' ? `Koruma gözlendi${observation.kind ? ` (${observation.kind})` : ''}` : 'Koruma görülmedi';
  const at = Date.parse(String(observation.observedAt || ''));
  return `${label}${observation.edge === 'cloudflare' ? ' · Cloudflare edge' : ''}${Number.isFinite(at) ? ` · ${new Date(at).toLocaleDateString('tr-TR')}` : ''}`;
}
export function accountExpiryLabel(info?: Playlist['accountInfo']): string {
  const at = accountExpiryMs(info);
  if (at !== null) return new Date(at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  return info?.expiryKind === 'unlimited' ? 'Sınırsız' : 'Belirlenemedi';
}
export function accountStatus(info?: Playlist['accountInfo'], now = Date.now()): { label: string; tone: 'success' | 'error' | 'unknown' } {
  const status = String(info?.status ?? '').trim().toLowerCase();
  const at = accountExpiryMs(info);
  if (at !== null && at <= now || status === 'expired') return { label: 'SÜRESİ DOLDU', tone: 'error' };
  if (['blocked', 'banned'].includes(status)) return { label: 'ENGELLİ', tone: 'error' };
  if (['disabled', 'inactive', '0', 'false'].includes(status)) return { label: 'PASİF', tone: 'error' };
  if (['active', '1', 'true', 'enabled'].includes(status)) return { label: 'AKTİF', tone: 'success' };
  return { label: 'BELİRLENEMEDİ', tone: 'unknown' };
}
export function playlistExpiryText(playlist: Pick<Playlist, 'accountInfo'>): string { return formatAccountExpiry(playlist.accountInfo) || `Bitiş: ${accountExpiryLabel(playlist.accountInfo)}`; }
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
