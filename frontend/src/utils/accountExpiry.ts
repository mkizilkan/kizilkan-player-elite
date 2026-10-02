import type { AccountInfo } from '@/src/types';

/** One date contract for scans, account cards, sorting and archives. */
export function parseAccountExpiryMs(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || /^(?:0|null|undefined|unlimited|never|sınırsız)$/i.test(raw)) return null;
  if (/^\d{9,13}$/.test(raw)) {
    const n = Number(raw);
    const ms = raw.length >= 12 ? n : n * 1000;
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function accountExpiryMs(info?: AccountInfo | null): number | null {
  return parseAccountExpiryMs(info?.exp_date) ?? parseAccountExpiryMs(info?.tariff_expired_date);
}

export function formatAccountExpiry(info?: AccountInfo | null, now = Date.now()): string | null {
  const ms = accountExpiryMs(info);
  if (ms == null) return null;
  const date = new Date(ms).toLocaleDateString('tr-TR');
  if (ms <= now) return `Bitiş: ${date} · süresi doldu`;
  return `Bitiş: ${date} · ${Math.ceil((ms - now) / 86_400_000)} gün kaldı`;
}
