/**
 * KIZILKAN PLAYER v18.3.0 — Taramaya özel proxy: yapılandırma + kaynak indirme.
 * ===========================================================================
 * KAPSAM: yalnız tarama trafiği. Oynatma/yenileme/EPG/timeshift DEĞİŞMEZ.
 * Varsayılan KAPALI (isteğe bağlı). Proxy adres/şifresi native tarafta cihazda
 * ŞİFRELİ saklanır (Android Keystore AES-GCM); burada AsyncStorage'da yalnız
 * yapılandırma tercihi tutulur, tanı raporunda maskelenir.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PanelScan, type NativeScanProxyStatus } from "../../modules/panel-scan";
import { parseProxyText, maskProxyEntry, type ProxyEntry } from "./scanProxyParse";
import { recordDiagnostic } from "./diagnostics";

export type ScanProxySource = "manual" | "auto";

export type ScanProxyConfig = {
  enabled: boolean;
  source: ScanProxySource;
  manualText: string;
  autoUrls: string[];
  maxPool: number;
  testUrl: string;
};

const STORAGE_KEY = "@kizilkan/scanProxy/v1";

export const DEFAULT_SCAN_PROXY_CONFIG: ScanProxyConfig = {
  enabled: false,
  source: "manual",
  manualText: "",
  autoUrls: [],
  maxPool: 400,
  testUrl: "https://api.ipify.org?format=json",
};

/** 2026 rehberindeki HTTPS ham liste uç noktaları (kullanıcı seçer). */
export const CURATED_PROXY_SOURCES: Array<{ id: string; label: string; url: string }> = [
  { id: "proxifly", label: "Proxifly (tümü)", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.txt" },
  { id: "monosans", label: "Monosans (tümü)", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/all.txt" },
  { id: "proxio", label: "Proxio (tümü)", url: "https://raw.githubusercontent.com/proxio-io/proxy-list/main/all.txt" },
  { id: "iplocate", label: "IPLocate (tümü)", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/all-proxies.txt" },
  { id: "proxmint", label: "Proxmint (tümü)", url: "https://raw.githubusercontent.com/proxmint/free-proxy-list/main/proxies/all.txt" },
  { id: "proxyscrape-socks5", label: "ProxyScrape (SOCKS5)", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5" },
  { id: "proxyscrape-http", label: "ProxyScrape (HTTP)", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http" },
];

export async function loadScanProxyConfig(): Promise<ScanProxyConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SCAN_PROXY_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SCAN_PROXY_CONFIG,
      ...parsed,
      autoUrls: Array.isArray(parsed?.autoUrls) ? parsed.autoUrls.map(String) : [],
      manualText: typeof parsed?.manualText === "string" ? parsed.manualText : "",
    };
  } catch {
    return { ...DEFAULT_SCAN_PROXY_CONFIG };
  }
}

export async function saveScanProxyConfig(cfg: ScanProxyConfig): Promise<void> {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
}

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export type ResolvedProxies = {
  entries: ProxyEntry[];
  sources: Array<{ url: string; count: number; error?: string }>;
};

/** Manuel metni ayrıştır veya seçili kaynak URL'lerini indirip birleştir. */
export async function resolveScanProxyEntries(cfg: ScanProxyConfig): Promise<ResolvedProxies> {
  if (cfg.source === "manual") {
    const entries = parseProxyText(cfg.manualText);
    return { entries, sources: [{ url: "(elle giriş)", count: entries.length }] };
  }
  const seen = new Set<string>();
  const merged: ProxyEntry[] = [];
  const sources: ResolvedProxies["sources"] = [];
  for (const url of cfg.autoUrls) {
    try {
      const text = await fetchText(url);
      const list = parseProxyText(text);
      let added = 0;
      for (const e of list) {
        const key = `${e.scheme}://${e.user || ""}:${e.pass || ""}@${e.host}:${e.port}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(e);
        added++;
        if (merged.length >= cfg.maxPool) break;
      }
      sources.push({ url, count: added });
    } catch (e: any) {
      sources.push({ url, count: 0, error: String(e?.message || e) });
    }
    if (merged.length >= cfg.maxPool) break;
  }
  return { entries: merged, sources };
}

export type ApplyResult = {
  status: NativeScanProxyStatus;
  entryCount: number;
  sources: ResolvedProxies["sources"];
};

/** Yapılandırmayı kaydet, girişleri çöz ve native havuzu yapılandır. */
export async function applyScanProxyConfig(cfg: ScanProxyConfig): Promise<ApplyResult> {
  await saveScanProxyConfig(cfg);
  let entries: ProxyEntry[] = [];
  let sources: ResolvedProxies["sources"] = [];
  if (cfg.enabled) {
    const resolved = await resolveScanProxyEntries(cfg);
    entries = resolved.entries;
    sources = resolved.sources;
  }
  const status = await PanelScan.configureScanProxy({
    enabled: cfg.enabled && entries.length > 0,
    order: "socks5-first",
    testUrl: cfg.testUrl,
    maxPool: cfg.maxPool,
    entries,
  });
  void recordDiagnostic("scan", cfg.enabled ? "SCAN_PROXY_ENABLED" : "SCAN_PROXY_DISABLED", {
    source: cfg.source,
    entryCount: entries.length,
    sample: entries.slice(0, 3).map(maskProxyEntry),
  });
  return { status, entryCount: entries.length, sources };
}

/** Ayarı tamamen kapat (native havuzu boşalt). */
export async function disableScanProxy(): Promise<void> {
  const cfg = await loadScanProxyConfig();
  await applyScanProxyConfig({ ...cfg, enabled: false });
}

/** Kullanıcı "Test et": havuzu ısıt + proxy üzerinden dış IP. */
export async function testScanProxy(): Promise<{ ok: boolean; ip?: string; proxy?: string; error?: string; working?: number; total?: number }> {
  const warm = await PanelScan.warmScanProxyPool();
  const res = await PanelScan.testScanProxy();
  return { ...res, working: warm.working, total: warm.total };
}

export function scanProxyStatus(): NativeScanProxyStatus {
  return PanelScan.getScanProxyStatus();
}
