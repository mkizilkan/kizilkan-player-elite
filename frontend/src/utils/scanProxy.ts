/**
 * KIZILKAN PLAYER v18.4.0 — Taramaya özel proxy: yapılandırma + kaynak indirme.
 * ===========================================================================
 * KAPSAM: yalnız tarama trafiği. Oynatma/yenileme/EPG/timeshift DEĞİŞMEZ.
 * Varsayılan KAPALI (isteğe bağlı). Aday listeler tür bazında indirilir; canlılık
 * testi + rotasyon native tarafta (ScanProxyPool). Proxy adres/şifresi native'de
 * cihazda ŞİFRELİ saklanır (Keystore AES-GCM); burada yalnız tercih tutulur.
 *
 * Kaynak kataloğu 27.09.2026'da CANLI doğrulandı; ölü/eski (jetkai, ShiftyTR 2023)
 * ve HTML dönen uçlar (TheSpeedX http) katalogdan ÇIKARILDI.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PanelScan, type NativeScanProxyEntry, type NativeScanProxyStatus, type ScanProxyTestConfig } from "../../modules/panel-scan";
import { parseProxyText, countBySchemeKind, proxyEntryKey, type ProxyEntry, type ProxyScheme } from "./scanProxyParse";
import { recordDiagnostic } from "./diagnostics";

export type ProxyProtocol = "http" | "socks4" | "socks5";
export type ScanProxySource = "manual" | "auto";

export type ProxySourceDef = {
  id: string;
  label: string;
  provider: string;
  /** Güncel tutuluyor mu (günlük). */
  fresh: boolean;
  /** Sağladığı türler → ham liste URL'i. */
  urls: Partial<Record<ProxyProtocol, string>>;
};

/** 2026 rehberi + canlı doğrulama. Her kaynağın SAĞLADIĞI tür açıkça bellidir. */
export const PROXY_SOURCE_CATALOG: ProxySourceDef[] = [
  { id: "proxifly", label: "Proxifly", provider: "proxifly/free-proxy-list", fresh: true, urls: {
    http: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt",
    socks4: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks4/data.txt",
    socks5: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt" } },
  { id: "monosans", label: "Monosans", provider: "monosans/proxy-list", fresh: true, urls: {
    http: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
    socks4: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt",
    socks5: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" } },
  { id: "proxio", label: "Proxio", provider: "proxio-io/proxy-list", fresh: true, urls: {
    http: "https://raw.githubusercontent.com/proxio-io/proxy-list/main/http.txt",
    socks4: "https://raw.githubusercontent.com/proxio-io/proxy-list/main/socks4.txt",
    socks5: "https://raw.githubusercontent.com/proxio-io/proxy-list/main/socks5.txt" } },
  { id: "iplocate", label: "IPLocate", provider: "iplocate/free-proxy-list", fresh: true, urls: {
    http: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/http.txt",
    socks4: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/socks4.txt",
    socks5: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/socks5.txt" } },
  { id: "proxmint", label: "Proxmint", provider: "proxmint/free-proxy-list", fresh: true, urls: {
    http: "https://raw.githubusercontent.com/proxmint/free-proxy-list/main/proxies/http.txt",
    socks4: "https://raw.githubusercontent.com/proxmint/free-proxy-list/main/proxies/socks4.txt",
    socks5: "https://raw.githubusercontent.com/proxmint/free-proxy-list/main/proxies/socks5.txt" } },
  { id: "proxyscrape", label: "ProxyScrape", provider: "proxyscrape.com", fresh: true, urls: {
    http: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http",
    socks4: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4",
    socks5: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5" } },
  { id: "thespeedx", label: "TheSpeedX", provider: "TheSpeedX/PROXY-List", fresh: true, urls: {
    socks4: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt",
    socks5: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt" } },
  { id: "mmpx12", label: "mmpx12", provider: "mmpx12/proxy-list", fresh: true, urls: {
    http: "https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt",
    socks4: "https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks4.txt",
    socks5: "https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks5.txt" } },
  { id: "vakhov", label: "Vakhov (taze)", provider: "vakhov/fresh-proxy-list", fresh: true, urls: {
    http: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt",
    socks4: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks4.txt",
    socks5: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt" } },
  { id: "roosterkid", label: "Roosterkid", provider: "roosterkid/openproxylist", fresh: true, urls: {
    http: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
    socks4: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt",
    socks5: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt" } },
  { id: "hookzof", label: "Hookzof (SOCKS5)", provider: "hookzof/socks5_list", fresh: true, urls: {
    socks5: "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt" } },
];

export type CustomSource = { url: string; scheme: ProxyProtocol | "auto" };

export type ScanProxyTestPrefs = {
  mode: "system" | "custom";
  url: string;
  expectText: string;
  concurrency: number;
  timeoutMs: number;
  rejectTransparent: boolean;
};

export type ScanProxyConfig = {
  enabled: boolean;
  source: ScanProxySource;
  manualText: string;
  /** Kaynak id → seçili türler. */
  autoSelections: Record<string, ProxyProtocol[]>;
  customSources: CustomSource[];
  test: ScanProxyTestPrefs;
};

const STORAGE_KEY = "@kizilkan/scanProxy/v2";
const MAX_ENTRIES = 200_000;

export const DEFAULT_SCAN_PROXY_CONFIG: ScanProxyConfig = {
  enabled: false,
  source: "manual",
  manualText: "",
  autoSelections: {},
  customSources: [],
  test: { mode: "system", url: "", expectText: "", concurrency: 64, timeoutMs: 6000, rejectTransparent: true },
};

export async function loadScanProxyConfig(): Promise<ScanProxyConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SCAN_PROXY_CONFIG };
    const p = JSON.parse(raw);
    return {
      ...DEFAULT_SCAN_PROXY_CONFIG,
      ...p,
      autoSelections: p?.autoSelections && typeof p.autoSelections === "object" ? p.autoSelections : {},
      customSources: Array.isArray(p?.customSources) ? p.customSources : [],
      test: { ...DEFAULT_SCAN_PROXY_CONFIG.test, ...(p?.test || {}) },
    };
  } catch { return { ...DEFAULT_SCAN_PROXY_CONFIG }; }
}

export async function saveScanProxyConfig(cfg: ScanProxyConfig): Promise<void> {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
}

async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

export type DownloadJob = { label: string; url: string; scheme: ProxyScheme | "auto" };
export type SourceResult = { label: string; scheme: string; count: number; error?: string };
export type DownloadOutcome = { entries: NativeScanProxyEntry[]; sources: SourceResult[]; byScheme: { http: number; socks4: number; socks5: number } };

/** Yapılandırmadan indirilecek işleri çıkar (kaynak × seçili tür + özel URL'ler). */
export function buildDownloadJobs(cfg: ScanProxyConfig): DownloadJob[] {
  const jobs: DownloadJob[] = [];
  for (const src of PROXY_SOURCE_CATALOG) {
    const sel = cfg.autoSelections[src.id] || [];
    for (const proto of sel) {
      const url = src.urls[proto];
      if (url) jobs.push({ label: `${src.label} · ${proto.toUpperCase()}`, url, scheme: proto });
    }
  }
  for (const c of cfg.customSources) {
    if (/^https?:\/\//i.test(c.url)) jobs.push({ label: `Özel · ${c.scheme.toUpperCase()}`, url: c.url, scheme: c.scheme });
  }
  return jobs;
}

/** Tüm işleri indir, tür bazında ayrıştır, birleştir+tekilleştir. onProgress her iş sonunda. */
export async function downloadProxySources(
  jobs: DownloadJob[],
  onProgress?: (done: number, total: number, last: SourceResult) => void,
): Promise<DownloadOutcome> {
  const seen = new Set<string>();
  const merged: ProxyEntry[] = [];
  const sources: SourceResult[] = [];
  let done = 0;
  for (const job of jobs) {
    let result: SourceResult;
    try {
      const text = await fetchText(job.url);
      const list = parseProxyText(text, job.scheme === "auto" ? "http" : job.scheme);
      let added = 0;
      for (const e of list) {
        const key = proxyEntryKey(e);
        if (seen.has(key)) continue;
        seen.add(key); merged.push(e); added++;
        if (merged.length >= MAX_ENTRIES) break;
      }
      result = { label: job.label, scheme: String(job.scheme), count: added };
    } catch (e: any) {
      result = { label: job.label, scheme: String(job.scheme), count: 0, error: String(e?.message || e) };
    }
    sources.push(result);
    done++; onProgress?.(done, jobs.length, result);
    if (merged.length >= MAX_ENTRIES) break;
  }
  return { entries: merged as NativeScanProxyEntry[], sources, byScheme: countBySchemeKind(merged) };
}

/** Manuel metni yapısal girişlere çevir. */
export function parseManual(text: string): NativeScanProxyEntry[] {
  return parseProxyText(text, "http") as NativeScanProxyEntry[];
}

export type ApplyResult = { status: NativeScanProxyStatus; entryCount: number; sources: SourceResult[]; byScheme: { http: number; socks4: number; socks5: number } };

/**
 * Yapılandırmayı kaydet ve native aday listesini kur (test AYRI adım).
 * onProgress otomatik indirmede iş iş bildirir.
 */
export async function applyScanProxyConfig(
  cfg: ScanProxyConfig,
  onProgress?: (done: number, total: number, last: SourceResult) => void,
): Promise<ApplyResult> {
  await saveScanProxyConfig(cfg);
  await PanelScan.setScanProxyEnabled(cfg.enabled);
  if (!cfg.enabled) {
    const status = await PanelScan.clearScanProxy();
    return { status, entryCount: 0, sources: [], byScheme: { http: 0, socks4: 0, socks5: 0 } };
  }
  let entries: NativeScanProxyEntry[] = [];
  let sources: SourceResult[] = [];
  let byScheme = { http: 0, socks4: 0, socks5: 0 };
  if (cfg.source === "manual") {
    entries = parseManual(cfg.manualText);
    byScheme = countBySchemeKind(entries as ProxyEntry[]);
    sources = [{ label: "Elle giriş", scheme: "karışık", count: entries.length }];
  } else {
    const out = await downloadProxySources(buildDownloadJobs(cfg), onProgress);
    entries = out.entries; sources = out.sources; byScheme = out.byScheme;
  }
  const status = await PanelScan.loadScanProxyCandidates(entries, true);
  void recordDiagnostic("scan", "SCAN_PROXY_CANDIDATES_LOADED", { source: cfg.source, entryCount: entries.length, byScheme });
  return { status, entryCount: entries.length, sources, byScheme };
}

/** Test etmeden doğrudan kullan (ödemeli rotating gateway / güvenilir elle proxy). */
export async function useWithoutTest(): Promise<NativeScanProxyStatus> {
  return PanelScan.commitScanProxyCandidates();
}

// ── Canlılık testi kontrolü ─────────────────────────────────────────────────
export async function startLivenessTest(prefs: ScanProxyTestPrefs): Promise<{ started: boolean; error?: string }> {
  const cfg: ScanProxyTestConfig = {
    mode: prefs.mode,
    url: prefs.mode === "custom" ? prefs.url : undefined,
    expectText: prefs.expectText || undefined,
    concurrency: prefs.concurrency,
    timeoutMs: prefs.timeoutMs,
    rejectTransparent: prefs.rejectTransparent,
  };
  return PanelScan.startScanProxyTest(cfg);
}
export const pauseLivenessTest = () => PanelScan.pauseScanProxyTest();
export const resumeLivenessTest = () => PanelScan.resumeScanProxyTest();
/** useTested=true → "bu kadar yeter", o ana kadar çalışanlar havuz olur. */
export const stopLivenessTest = (useTested: boolean) => PanelScan.stopScanProxyTest(useTested);
export const livenessProgress = () => PanelScan.getScanProxyTestProgress();

export async function testSingleProxy() { return PanelScan.testScanProxy(); }
export function scanProxyStatus(): NativeScanProxyStatus { return PanelScan.getScanProxyStatus(); }

/** İnsana okunur sayı: 21500 → "21.5k". */
export function human(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
}
