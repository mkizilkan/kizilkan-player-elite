/**
 * KIZILKAN PLAYER v18.4.0 — Taramaya özel proxy: yapılandırma + kaynak indirme.
 * ===========================================================================
 * KAPSAM: yalnız tarama trafiği. Oynatma/yenileme/EPG/timeshift DEĞİŞMEZ.
 * Varsayılan KAPALI (isteğe bağlı). Aday listeler tür bazında indirilir; canlılık
 * testi + rotasyon native tarafta (ScanProxyPool). Proxy adres/şifresi native'de
 * cihazda ŞİFRELİ saklanır (Keystore AES-GCM); burada yalnız tercih tutulur.
 *
 * Kaynak kataloğu 08.10.2026'da ALPHA kaynaklarıyla karşılaştırıldı. Erişilebilir
 * eski listeler fresh:false ile işaretli; indirilen adaylar için native canlılık
 * testi ayrı adımdır. Kaynağın açılması proxy'nin çalıştığı anlamına gelmez.
 * 404/502 dönen uçlar eklenmedi. TheSpeedX HTTP yeniden metin olarak doğrulandı.
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
  mirrors?: Partial<Record<ProxyProtocol, string[]>>;
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
    socks5: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5" }, mirrors: {
    http: ["https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/protocols/http/data.txt"],
    socks4: ["https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/protocols/socks4/data.txt"],
    socks5: ["https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/protocols/socks5/data.txt"] } },
  { id: "thespeedx", label: "TheSpeedX", provider: "TheSpeedX/PROXY-List", fresh: true, urls: {
    http: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
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
  { id: "aliilapro", label: "ALIILAPRO", provider: "ALIILAPRO/Proxy", fresh: true, urls: {
    http: "https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/http.txt",
    socks4: "https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/socks4.txt",
    socks5: "https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/socks5.txt" } },
  { id: "openproxylist", label: "OpenProxyList API", provider: "api.openproxylist.xyz", fresh: true, urls: {
    http: "https://api.openproxylist.xyz/http.txt",
    socks4: "https://api.openproxylist.xyz/socks4.txt",
    socks5: "https://api.openproxylist.xyz/socks5.txt" } },
  { id: "sunny9577", label: "Sunny9577", provider: "sunny9577/proxy-scraper", fresh: true, urls: {
    http: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt" } },
  { id: "jetkai", label: "Jetkai", provider: "jetkai/proxy-list", fresh: false, urls: {
    http: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt",
    socks4: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt",
    socks5: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt" } },
  { id: "clarketm", label: "Clarketm", provider: "clarketm/proxy-list", fresh: false, urls: {
    http: "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt" } },
  { id: "shiftytr", label: "ShiftyTR", provider: "ShiftyTR/Proxy-List", fresh: false, urls: {
    http: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
    socks4: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt",
    socks5: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt" } },
  { id: "opsxcq", label: "Opsxcq", provider: "opsxcq/proxy-list", fresh: false, urls: {
    http: "https://raw.githubusercontent.com/opsxcq/proxy-list/master/list.txt" } },
  { id: "proxy4parsing", label: "Proxy4parsing", provider: "proxy4parsing/proxy-list", fresh: false, urls: {
    http: "https://raw.githubusercontent.com/proxy4parsing/proxy-list/main/http.txt" } },
  { id: "almroot", label: "Almroot", provider: "almroot/proxylist", fresh: false, urls: {
    http: "https://raw.githubusercontent.com/almroot/proxylist/master/list.txt" } },
  { id: "saisuiu", label: "Saisuiu", provider: "saisuiu/Lionkings-Http-Proxys-Proxies", fresh: false, urls: {
    http: "https://raw.githubusercontent.com/saisuiu/Lionkings-Http-Proxys-Proxies/main/free.txt" } },
  { id: "vanndev", label: "VannDev", provider: "Vann-Dev/proxy-list", fresh: false, urls: {
    http: "https://raw.githubusercontent.com/Vann-Dev/proxy-list/main/proxies/http.txt",
    socks4: "https://raw.githubusercontent.com/Vann-Dev/proxy-list/main/proxies/socks4.txt" } },
  { id: "vmheaven", label: "VMHeaven", provider: "vmheaven/VMHeaven-Free-Proxy-Updated", fresh: false, urls: {
    socks4: "https://raw.githubusercontent.com/vmheaven/VMHeaven-Free-Proxy-Updated/main/socks4.txt" } },
];

export type CustomSource = { url: string; scheme: ProxyProtocol | "auto" };

export type ScanProxyTestPrefs = {
  mode: "system" | "custom";
  url: string;
  expectText: string;
  concurrency: number;
  timeoutMs: number;
  rejectTransparent: boolean;
  /** v18.5.0: yalnız elite proxy'ler havuza girsin. */
  eliteOnly: boolean;
};

export type ScanProxyConfig = {
  manualScheme: ProxyScheme;
  rotation: "round_robin" | "random" | "gateway";
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
  manualScheme: "http", rotation: "round_robin",
  autoSelections: {},
  customSources: [],
  test: { mode: "system", url: "", expectText: "", concurrency: 64, timeoutMs: 6000, rejectTransparent: true, eliteOnly: false },
};

export async function loadScanProxyConfig(): Promise<ScanProxyConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    const privateConfig = JSON.parse(await PanelScan.loadScanProxyPrivateConfig());
    let manualText = typeof privateConfig.manualText === "string" ? privateConfig.manualText : await PanelScan.loadScanProxyManualText();
    const testSecrets = { ...(privateConfig.test || {}) };
    if (typeof p.test?.url === 'string') testSecrets.url = p.test.url;
    if (typeof p.test?.expectText === 'string') testSecrets.expectText = p.test.expectText;
    if (typeof p.manualText === "string" && p.manualText || Array.isArray(p.customSources) || typeof p.test?.url === 'string' || typeof p.test?.expectText === 'string') {
      // Migrate only after a successful encrypted write. Never silently lose a paid password.
      if (typeof p.manualText === "string" && p.manualText) { await PanelScan.saveScanProxyManualText(p.manualText); manualText = p.manualText; }
      await PanelScan.saveScanProxyPrivateConfig(JSON.stringify({ manualText, customSources: p.customSources || privateConfig.customSources || [], test: testSecrets }));
      const { manualText: _legacy, customSources: _urls, ...safe } = p;
      const { url: _testUrl, expectText: _testText, ...publicTest } = p.test || {};
      safe.test = publicTest;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    }
    return {
      ...DEFAULT_SCAN_PROXY_CONFIG,
      ...p,
      manualText,
      manualScheme: ["http", "https", "socks4", "socks5"].includes(p.manualScheme) ? p.manualScheme : "http",
      rotation: ["round_robin", "random", "gateway"].includes(p.rotation) ? p.rotation : "round_robin",
      autoSelections: p?.autoSelections && typeof p.autoSelections === "object" ? p.autoSelections : {},
      customSources: Array.isArray(p?.customSources) ? p.customSources : Array.isArray(privateConfig.customSources) ? privateConfig.customSources : [],
      test: { ...DEFAULT_SCAN_PROXY_CONFIG.test, ...(p?.test || {}), ...testSecrets },
    };
  } catch (error) { throw new Error("Proxy tercihleri okunamadı; mevcut bilgiler korundu. " + String((error as Error)?.message || "")); }
}

export async function saveScanProxyConfig(cfg: ScanProxyConfig): Promise<void> {
  const { manualText: _secret, customSources: custom, ...preferences } = cfg;
  const { url, expectText, ...publicTest } = cfg.test;
  preferences.test = publicTest as ScanProxyTestPrefs;
  // Custom download/test URLs may contain provider tokens; keep them encrypted too.
  await PanelScan.saveScanProxyPrivateConfig(JSON.stringify({ manualText: cfg.manualText, customSources: custom, test: { url, expectText } }));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  await PanelScan.setScanProxyRotation(cfg.rotation);
}

async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { fetch: streamingFetch } = await import('expo/fetch');
    const res = await streamingFetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const limit = 8 * 1024 * 1024;
    if (Number(res.headers.get('content-length')) > limit) throw new Error('Liste boyutu 8 MiB sınırını aşıyor');
    if (!res.body) throw new Error('Kaynak gövdesi okunamadı');
    const reader = res.body.getReader(); const decoder = new TextDecoder();
    const chunks: string[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) { controller.abort(); throw new Error('Liste boyutu 8 MiB sınırını aşıyor'); }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode()); return chunks.join('');
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } finally { clearTimeout(timer); }
}

export type DownloadJob = { label: string; url: string; scheme: ProxyScheme | "auto"; mirrors?: string[]; sourceId?: string };
export type SourceResult = { label: string; scheme: string; count: number; rawCount?: number; elapsedMs?: number; mirrorUsed?: boolean; error?: string };
export type DownloadOutcome = { entries: NativeScanProxyEntry[]; sources: SourceResult[]; byScheme: { http: number; socks4: number; socks5: number } };

/** Yapılandırmadan indirilecek işleri çıkar (kaynak × seçili tür + özel URL'ler). */
export function buildDownloadJobs(cfg: ScanProxyConfig): DownloadJob[] {
  const jobs: DownloadJob[] = [];
  for (const src of PROXY_SOURCE_CATALOG) {
    const sel = cfg.autoSelections[src.id] || [];
    for (const proto of sel) {
      const url = src.urls[proto];
      if (url) jobs.push({ label: `${src.label} · ${proto.toUpperCase()}`, url, mirrors: src.mirrors?.[proto], sourceId: src.id, scheme: proto });
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
  const seen = new Map<string, ProxyEntry>();
  const merged: ProxyEntry[] = [];
  const sources: SourceResult[] = [];
  let done = 0;
  let next = 0;
  const worker = async () => { while (next < jobs.length) {
    const job = jobs[next++];
    const started = Date.now();
    let result: SourceResult;
    try {
      let list: ProxyEntry[] = []; let mirrorUsed = false;
      for (const [index, url] of [job.url, ...(job.mirrors || [])].entries()) {
        try {
          const text = await fetchText(url);
          if (text.length > 8 * 1024 * 1024) throw new Error("Liste boyutu 8 MiB sınırını aşıyor");
          list = parseProxyText(text, job.scheme === "auto" ? "http" : job.scheme);
          if (!list.length) throw new Error("Geçerli proxy satırı yok");
          mirrorUsed = index > 0; break;
        } catch (error) { if (index === (job.mirrors?.length || 0)) throw error; }
      }
      let added = 0;
      for (const e of list) {
        const key = proxyEntryKey(e);
        const sourceId = job.sourceId || "custom";
        const existing = seen.get(key);
        if (existing) { existing.sourceIds = [...new Set([...(existing.sourceIds || []), sourceId])]; continue; }
        if (merged.length >= MAX_ENTRIES) break;
        e.sourceIds = [sourceId]; seen.set(key, e); merged.push(e); added++;
        if (merged.length >= MAX_ENTRIES) break;
      }
      result = { label: job.label, scheme: String(job.scheme), count: added, rawCount: list.length, mirrorUsed, elapsedMs: Date.now() - started };
    } catch (e: any) {
      result = { label: job.label, scheme: String(job.scheme), count: 0, elapsedMs: Date.now() - started, error: e?.name === "AbortError" ? "Zaman aşımı" : /HTTP \d{3}|Geçerli proxy|Liste boyutu/.exec(String(e?.message))?.[0] || "Kaynak bağlantısı başarısız" };
    }
    sources.push(result);
    done++; onProgress?.(done, jobs.length, result);
  } };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  return { entries: merged as NativeScanProxyEntry[], sources, byScheme: countBySchemeKind(merged) };
}

/** Manuel metni yapısal girişlere çevir. */
export function parseManual(text: string, scheme: ProxyScheme = "http"): NativeScanProxyEntry[] {
  return parseProxyText(text, scheme).map(entry => ({ ...entry, sourceIds: ["manual"] })) as NativeScanProxyEntry[];
}

export type ApplyResult = { status: NativeScanProxyStatus; entryCount: number; sources: SourceResult[]; byScheme: { http: number; socks4: number; socks5: number } };

/**
 * v18.5.0 — Proxy'yi taramada kullan/kullanma (yalnız tercih). Listeler ve havuz SİLİNMEZ;
 * proxy kapalıyken de indirme ve test yapılabilir (proxy merkezi her durumda çalışır).
 */
export async function setScanProxyUse(on: boolean): Promise<NativeScanProxyStatus> {
  const cfg = await loadScanProxyConfig();
  await saveScanProxyConfig({ ...cfg, enabled: on });
  return PanelScan.setScanProxyEnabled(on);
}

/**
 * Aday listeyi kur (elle metin veya seçili kaynakları indir). Açık/kapalı durumundan BAĞIMSIZ.
 * onProgress otomatik indirmede iş iş bildirir. Test AYRI adımdır.
 */
export async function applyScanProxyConfig(
  cfg: ScanProxyConfig,
  onProgress?: (done: number, total: number, last: SourceResult) => void,
): Promise<ApplyResult> {
  await saveScanProxyConfig(cfg);
  let entries: NativeScanProxyEntry[] = [];
  let sources: SourceResult[] = [];
  let byScheme = { http: 0, socks4: 0, socks5: 0 };
  if (cfg.source === "manual") {
    entries = parseManual(cfg.manualText, cfg.manualScheme);
    byScheme = countBySchemeKind(entries as ProxyEntry[]);
    sources = [{ label: "Elle giriş", scheme: "karışık", count: entries.length }];
  } else {
    const out = await downloadProxySources(buildDownloadJobs(cfg), onProgress);
    entries = out.entries; sources = out.sources; byScheme = out.byScheme;
  }
  if (!entries.length) throw new Error("Geçerli proxy indirilemedi/ayrıştırılamadı. Mevcut adaylar ve iyi havuz korunuyor.");
  const status = await PanelScan.loadScanProxyCandidates(entries, true);
  void recordDiagnostic("scan", "SCAN_PROXY_CANDIDATES_LOADED", { source: cfg.source, entryCount: entries.length, byScheme, enabled: cfg.enabled });
  return { status, entryCount: entries.length, sources, byScheme };
}

/** Aday listeyi, havuzu ve iyi proxy listesini temizle. */
export async function clearScanProxyLists(): Promise<NativeScanProxyStatus> {
  return PanelScan.clearScanProxy();
}
export const removeProxySource = (sourceId: string) => PanelScan.removeScanProxySource(sourceId);

/** Test etmeden doğrudan kullan (ödemeli rotating gateway / güvenilir elle proxy). */
export async function useWithoutTest(): Promise<NativeScanProxyStatus> {
  return PanelScan.commitScanProxyCandidates();
}

// ── Canlılık testi kontrolü ─────────────────────────────────────────────────
export async function startLivenessTest(prefs: ScanProxyTestPrefs, resume = false): Promise<{ started: boolean; error?: string }> {
  const cfg: ScanProxyTestConfig = {
    mode: prefs.mode,
    resume,
    url: prefs.mode === "custom" ? prefs.url : undefined,
    expectText: prefs.expectText || undefined,
    concurrency: prefs.concurrency,
    timeoutMs: prefs.timeoutMs,
    rejectTransparent: prefs.rejectTransparent,
    eliteOnly: prefs.eliteOnly,
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
