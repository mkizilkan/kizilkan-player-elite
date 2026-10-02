import type { AccountInfo } from '@/src/types';

/** One date contract for scans, account cards, sorting and archives. */
export function parseAccountExpiryMs(value: unknown): number | null {
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) return null;
  const raw = String(value).trim();
  if (!raw || /^(?:0|null|undefined|unlimited|never|sınırsız)$/i.test(raw)) return null;
  const plausible = (ms: number) => Number.isFinite(ms) && new Date(ms).getUTCFullYear() >= 1970
    && new Date(ms).getUTCFullYear() <= 2500 ? ms : null;
  if (/^[1-9]\d{8,13}$/.test(raw)) {
    const n = Number(raw);
    const ms = raw.length >= 12 ? n : n * 1000;
    return plausible(ms);
  }
  // Short numbers, locale guesses and JavaScript's overflowing calendar normalization
  // cannot establish an account expiry. Only these explicit wire formats are accepted.
  let year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millis = 0;
  let zone: string | undefined, localTime = false;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i);
  const tr = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
    hour = Number(iso[4] || 0); minute = Number(iso[5] || 0); second = Number(iso[6] || 0);
    millis = Number((iso[7] || '').padEnd(3, '0')); zone = iso[8];
    localTime = !!iso[4] && !zone;
  } else if (tr) {
    day = Number(tr[1]); month = Number(tr[2]); year = Number(tr[3]);
    hour = Number(tr[4] || 0); minute = Number(tr[5] || 0); second = Number(tr[6] || 0);
    localTime = !!tr[4];
  } else {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const english = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
    if (!english) return null;
    const monthName = english[1].toLowerCase();
    month = months.findIndex(name => name === monthName || name.slice(0, 3) === monthName) + 1;
    day = Number(english[2]); year = Number(english[3]); hour = Number(english[4] || 0);
    minute = Number(english[5] || 0); second = Number(english[6] || 0); localTime = !!english[4];
    if (english[7]) {
      if (hour < 1 || hour > 12) return null;
      hour = hour % 12 + (english[7].toLowerCase() === 'pm' ? 12 : 0);
    }
  }
  if (year < 1970 || year > 2500 || month < 1 || month > 12 || day < 1 || day > 31
    || hour > 23 || minute > 59 || second > 59) return null;
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  const calendar = new Date(utc);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  if (zone && zone.toUpperCase() !== 'Z') {
    const match = zone.match(/^([+-])(\d{2}):?(\d{2})$/)!;
    const hours = Number(match[2]), minutes = Number(match[3]);
    if (hours > 23 || minutes > 59) return null;
    return plausible(utc - (match[1] === '+' ? 1 : -1) * (hours * 60 + minutes) * 60000);
  }
  return plausible(localTime ? new Date(year, month - 1, day, hour, minute, second, millis).getTime() : utc);
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
