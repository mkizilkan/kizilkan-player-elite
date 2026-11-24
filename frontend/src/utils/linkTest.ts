/**
 * KIZILKAN — M3U/Xtream Link Testi (v18.7.40)
 * ===========================================================================
 * Kullanıcının kirli/temiz TXT dosyasından veya yapıştırdığı metinden Xtream
 * get.php linklerini çıkarır, HIZLI test eder (durum/bitiş/maks bağlantı +
 * kategori sayıları), karta girilince TAM sayım (Live/VOD/Series stream) çeker.
 * Keşif YOK — sunucu linkte belli; HITHUNTER tarzı. Mevcut iptv.ts utils reuse.
 */
import {
  detectXtreamFromM3U,
  xtreamLogin,
  xtreamLiveCategories, xtreamVodCategories, xtreamSeriesCategories,
  xtreamLiveCatalogProbe, xtreamVodCatalogProbe, xtreamSeriesCatalogProbe,
  type XtreamCategory,
} from './iptv';

export type ExtractedLink = { server: string; username: string; password: string; raw: string };

// Dirty-text tolerant: metindeki her http(s) URL'i yakala, Xtream get.php olanı ayıkla.
const URL_RE = /https?:\/\/[^\s<>"'`|\\)\]]+/gi;

export function extractXtreamLinks(text: string): { links: ExtractedLink[]; totalUrls: number; duplicates: number } {
  const seen = new Set<string>();
  const links: ExtractedLink[] = [];
  let totalUrls = 0, duplicates = 0;
  const matches = String(text || '').match(URL_RE) || [];
  for (const rawMatch of matches) {
    const cleaned = rawMatch.replace(/[),.;'"»]+$/, '');
    const parsed = detectXtreamFromM3U(cleaned);
    if (!parsed || !parsed.username || !parsed.password || !parsed.server) continue;
    totalUrls++;
    const key = `${parsed.server}\u0000${parsed.username}\u0000${parsed.password}`.toLowerCase();
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    links.push({ server: parsed.server, username: parsed.username, password: parsed.password, raw: cleaned });
  }
  return { links, totalUrls, duplicates };
}

export type FastTestResult = {
  ok: boolean;
  error?: string;
  username: string;
  status: string;           // Active / Expired / Banned / ...
  active: boolean;
  expDate: string;          // formatlı tarih ya da "Sınırsız"
  expMs: number | null;
  maxConnections: string;
  activeCons: string;
  timezone: string;
  message?: string;
  // kategori listeleri (fast test sırasında zaten çekilir → detayda tekrar istek yok)
  liveCats: XtreamCategory[];
  vodCats: XtreamCategory[];
  seriesCats: XtreamCategory[];
  rawUserInfo?: Record<string, any>;
};

function expToMs(raw: any): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * 1000;
}

function authActive(auth: any): boolean {
  return [1, '1', true, 'true'].includes(auth);
}

/** HIZLI test: login + 3 kategori çağrısı (sayım + liste). Ban-makul, saniyeler. */
export async function fastTestXtream(link: ExtractedLink, signal?: AbortSignal): Promise<FastTestResult> {
  const cred = { server: link.server, username: link.username, password: link.password };
  try {
    const login = await xtreamLogin(cred, signal);
    const ui: Record<string, any> = login.user_info || {};
    const [live, vod, series] = await Promise.all([
      xtreamLiveCategories(cred, signal).catch(() => [] as XtreamCategory[]),
      xtreamVodCategories(cred, signal).catch(() => [] as XtreamCategory[]),
      xtreamSeriesCategories(cred, signal).catch(() => [] as XtreamCategory[]),
    ]);
    const statusRaw = String(ui.status || '').trim();
    const expMs = expToMs(ui.exp_date);
    const active = statusRaw ? /active/i.test(statusRaw) : authActive(ui.auth);
    return {
      ok: true,
      username: String(ui.username || link.username),
      status: statusRaw || (authActive(ui.auth) ? 'Active' : 'Unknown'),
      active,
      expDate: expMs ? new Date(expMs).toLocaleDateString('tr-TR') : 'Sınırsız/Belirsiz',
      expMs,
      maxConnections: String(ui.max_connections ?? '?'),
      activeCons: String(ui.active_cons ?? '0'),
      timezone: String(login.server_info?.timezone || ''),
      message: ui.message ? String(ui.message) : undefined,
      liveCats: Array.isArray(live) ? live : [],
      vodCats: Array.isArray(vod) ? vod : [],
      seriesCats: Array.isArray(series) ? series : [],
      rawUserInfo: ui,
    };
  } catch (e: any) {
    const kind = e?.kind;
    const msg = kind === 'ACCOUNT_REJECTED' ? 'Kullanıcı/şifre hatalı'
      : kind === 'INVALID_JSON' ? 'Yanıt doğrulanamadı (yeniden denenebilir)'
      : String(e?.message || e || 'Test başarısız');
    return {
      ok: false, error: msg, username: link.username, status: 'HATA', active: false,
      expDate: '-', expMs: null, maxConnections: '-', activeCons: '-', timezone: '',
      liveCats: [], vodCats: [], seriesCats: [],
    };
  }
}

export type FullCounts = { liveCount: number; vodCount: number; seriesCount: number };

/** TAM sayım: karta girilince tembel. 3 stream çağrısı (sadece sayı; tam liste indirme). */
export async function fullCountsXtream(link: ExtractedLink, signal?: AbortSignal): Promise<FullCounts> {
  const cred = { server: link.server, username: link.username, password: link.password };
  const [live, vod, series] = await Promise.all([
    xtreamLiveCatalogProbe(cred, signal).catch(() => 0),
    xtreamVodCatalogProbe(cred, signal).catch(() => 0),
    xtreamSeriesCatalogProbe(cred, signal).catch(() => 0),
  ]);
  return { liveCount: live, vodCount: vod, seriesCount: series };
}
