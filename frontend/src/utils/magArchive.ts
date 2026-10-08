import type { MagScanResult, MagScanCategory } from './magBulkScan';
import { canonicalEndpointUrl } from './playlistEndpoints';
import { magAccountIdentity } from './magBulk';

/** Reads our checked native JSON-lines and portable MAG TXT; no account is invented. */
export function parseMagArchive(text: string): { results: MagScanResult[]; warnings: string[] } {
  const warnings: string[] = []; const results = new Map<string, MagScanResult>();
  const allowed: MagScanCategory[] = ['valid', 'probable', 'unverified', 'expired', 'blocked', 'protected', 'no-portal', 'error'];
  const accept = (value: any) => {
    const portal = canonicalEndpointUrl(String(value.portal || ''));
    const mac = String(value.mac || '').toUpperCase();
    if (!portal || !/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) { warnings.push('Portal/MAC alanı geçersiz bir kayıt atlandı.'); return; }
    const category = allowed.includes(value.category) ? value.category : 'unverified';
    results.set(magAccountIdentity(portal, mac), { ...value, portal, mac, hostRaw: value.hostRaw || portal, category,
      accountInfo: value.accountInfo || { username: value.username, password: value.password, tariff_plan: value.tariffPlan, tariff_expired_date: value.expiry },
      categories: value.categories || { live: value.liveCategories, vod: value.vodCategories, series: value.seriesCategories, warnings: value.warnings },
      endpoints: Array.isArray(value.endpoints) ? value.endpoints.filter((e: any) => e.kind === 'stalker' && canonicalEndpointUrl(e.url)) : [],
    });
  };
  const machineLines = text.split(/\r?\n/).filter(line => line.startsWith('{') || line.startsWith('HESAP_JSON='));
  if (machineLines.length) for (const line of machineLines) {
    try { const value = JSON.parse(line.startsWith('HESAP_JSON=') ? line.slice(11) : line); if (value.portal || value.mac) accept(value); }
    catch { warnings.push('Bozuk JSON hesap satırı atlandı.'); }
  } else if (text.includes('# KIZILKAN MAG hesap arşivi')) {
    for (const block of text.split(/=== HESAP \d+ ===/).slice(1)) {
      const field = (name: string) => block.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim() || '';
      accept({ portal: field('PORTAL'), mac: field('MAC'), category: field('SONUC').split(' · ')[0], message: 'Eski TXT: hesap yeniden doğrulanacak; biçimli bitiş tarihi ham API verisi sayılmadı.' });
    }
  }
  return { results: [...results.values()], warnings };
}
