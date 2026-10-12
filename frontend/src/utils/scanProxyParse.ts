/**
 * KIZILKAN PLAYER v18.3.0 — Taramaya özel proxy: satır biçimi ayrıştırıcı (SAF).
 * ===========================================================================
 * Bu dosya React Native'e bağlı DEĞİLDİR; Node ile birim testi yapılabilir
 * (tools/test-scan-proxy.js). Native tarafa yalnız yapısal giriş gönderilir.
 *
 * Desteklenen biçimler (2026 proxy rehberi):
 *   ip:port
 *   host:port                         (domain uç nokta — rotating gateway)
 *   http://ip:port   https://ip:port
 *   socks4://ip:port socks5://ip:port  socks://ip:port (→ socks5)
 *   scheme://KULLANICI:SIFRE@host:port
 *   KULLANICI:SIFRE@host:port          (şema yoksa → http)
 *   host:BASLANGIC-BITIS               (port aralığı → her port ayrı giriş)
 * Yorum satırları (#, //) ve satır sonundaki fazladan sütunlar atlanır.
 */

export type ProxyScheme = "http" | "https" | "socks4" | "socks5";

export type ProxyEntry = {
  scheme: ProxyScheme;
  host: string;
  port: number;
  user?: string;
  pass?: string;
  sourceIds?: string[];
};

const MAX_RANGE = 512; // Tek satırda port aralığı patlamasını engelle.

function normalizeScheme(raw: string): ProxyScheme | undefined {
  const s = raw.toLowerCase();
  if (s === "https") return "https";
  if (s === "socks4") return "socks4";
  if (s === "socks5" || s === "socks5h" || s === "socks") return "socks5";
  if (s === "socks4a") return "socks4";
  if (s === "http") return "http";
  return undefined;
}

function decodeCredential(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function validHost(host: string): boolean {
  return host.length <= 253 && !/[\s/@?#\\]/.test(host) &&
    (/^[a-z\d._-]+$/i.test(host) || /^[a-f\d:]+$/i.test(host));
}

function pushPortRange(
  out: ProxyEntry[],
  scheme: ProxyScheme,
  host: string,
  portToken: string,
  user?: string,
  pass?: string,
): void {
  const range = portToken.match(/^(\d{1,5})\s*-\s*(\d{1,5})$/);
  if (range) {
    let start = parseInt(range[1], 10);
    let end = parseInt(range[2], 10);
    if (start > end) [start, end] = [end, start];
    if (end - start > MAX_RANGE) end = start + MAX_RANGE;
    for (let p = start; p <= end; p++) {
      if (p >= 1 && p <= 65535) out.push({ scheme, host, port: p, user, pass });
    }
    return;
  }
  if (!/^\d{1,5}$/.test(portToken)) return;
  const port = parseInt(portToken, 10);
  if (Number.isFinite(port) && port >= 1 && port <= 65535) {
    out.push({ scheme, host, port, user, pass });
  }
}

/**
 * Tek satırı ayrıştır; 0, 1 veya (port aralığında) birden çok giriş döndürür.
 * v18.4.0: `defaultScheme` — satırda şema yoksa kullanılacak tür. Tür bazlı listeler
 * (ör. socks5.txt, "ip:port" satırları) artık HTTP SANILMAZ; kaynağın türü verilir.
 */
export function parseProxyLine(rawLine: string, defaultScheme: ProxyScheme = "http"): ProxyEntry[] {
  let line = (rawLine || "").trim();
  if (!line) return [];
  if (line.startsWith("#") || line.startsWith("//")) return [];
  // Authentication fields can contain punctuation. Never split a password on ; or |.
  if (!line.includes("@") && !/^(?:[a-z0-9]+:\/\/)?(?:\[[^\]]+\]|[^:]+):\d{1,5}:[^:]*:/i.test(line)) line = line.split(/\s|,|\t|\||;/)[0].trim();
  if (!line) return [];

  let scheme: ProxyScheme = defaultScheme;
  const schemeMatch = line.match(/^([a-zA-Z0-9]+):\/\//);
  if (schemeMatch) {
    const normalized = normalizeScheme(schemeMatch[1]);
    if (!normalized) return [];
    scheme = normalized;
    line = line.slice(schemeMatch[0].length);
  }

  // Kimlik bilgisi: son '@' işaretine göre böl (host '@' içermez).
  let user: string | undefined;
  let pass: string | undefined;
  const at = line.lastIndexOf("@");
  if (at >= 0) {
    const cred = line.slice(0, at);
    line = line.slice(at + 1);
    const colon = cred.indexOf(":");
    if (colon >= 0) {
      user = decodeCredential(cred.slice(0, colon));
      pass = decodeCredential(cred.slice(colon + 1));
    } else {
      user = decodeCredential(cred);
    }
    if (user === "") user = undefined;
  }

  // Common provider export: host:port:username:password (password may contain colons).
  const provider = line.match(/^(\[[^\]]+\]|[^:]+):(\d{1,5}):([^:]*):(.*)$/);
  if (at < 0 && provider) {
    line = `${provider[1]}:${provider[2]}`;
    user = provider[3] || undefined; pass = provider[4];
  }
  // IPv6 literals must be bracketed so a missing port is not inferred from the address.
  const lastColon = line.lastIndexOf(":");
  if (lastColon <= 0 || lastColon >= line.length - 1) return [];
  const rawHost = line.slice(0, lastColon).trim();
  if (rawHost.includes(":") && !(rawHost.startsWith("[") && rawHost.endsWith("]"))) return [];
  const host = rawHost.replace(/^\[|\]$/g, "");
  const portToken = line.slice(lastColon + 1).trim();
  if (!host || !portToken || !validHost(host) || /[\r\n\x00]/.test((user || "") + (pass || ""))) return [];

  const out: ProxyEntry[] = [];
  pushPortRange(out, scheme, host, portToken, user, pass);
  return out;
}

/** Tekilleştirme anahtarı (tür + kimlik + host + port). */
export function proxyEntryKey(e: ProxyEntry): string {
  return JSON.stringify([e.scheme, e.host.toLowerCase(), e.port, e.user ?? "", e.pass ?? ""]);
}

/** Çok satırlı metni ayrıştır; tekilleştir (scheme+host+port+user+pass). */
export function parseProxyText(text: string, defaultScheme: ProxyScheme = "http"): ProxyEntry[] {
  const seen = new Set<string>();
  const out: ProxyEntry[] = [];
  const trimmed = (text || "").trim();
  let entries: ProxyEntry[] = [];
  if (/^[\[{]/.test(trimmed) && !/^\[[a-f\d:.]+\]:/i.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.results) ? parsed.results : [parsed];
      for (const row of rows) {
        if (typeof row === "string") { entries.push(...parseProxyLine(row, defaultScheme)); continue; }
        if (!row || typeof row !== "object") continue;
        if (typeof row.proxy === "string" && !row.host && !row.proxy_address) { entries.push(...parseProxyLine(row.proxy, defaultScheme)); continue; }
        const host = String(row.host ?? row.proxy_address ?? row.server ?? "").replace(/^\[|\]$/g, "");
        const scheme = normalizeScheme(String(row.scheme ?? row.protocol ?? defaultScheme));
        const port = Number(row.port);
        const user = row.user ?? row.username; const pass = row.pass ?? row.password;
        if (scheme && validHost(host) && host && Number.isInteger(port) && port >= 1 && port <= 65535 &&
            !/[\r\n\x00]/.test(String(user ?? "") + String(pass ?? ""))) {
          entries.push({ scheme, host, port, user: user == null ? undefined : String(user), pass: pass == null ? undefined : String(pass) });
        }
      }
    } catch { return []; }
  } else {
    for (let line of trimmed.split(/\r?\n/)) {
      // Parse quoted curl proxy options as data; commands are never executed.
      if (/^curl\s/i.test(line.trim())) {
        const token = (flag: string) => line.match(new RegExp(`(?:^|\\s)(?:${flag})(?:=|\\s+)(?:"([^"]*)"|'([^']*)'|(\\S+))`))?.slice(1).find(x => x !== undefined);
        const proxy = token("--proxy|-x"); const auth = token("--proxy-user|-U");
        if (!proxy) continue;
        const scheme = proxy.match(/^([a-z0-9]+):\/\//i)?.[0] || "";
        line = auth ? `${scheme}${auth}@${proxy.slice(scheme.length)}` : proxy;
      }
      entries.push(...parseProxyLine(line, defaultScheme));
    }
  }
  for (const e of entries) {
      const key = proxyEntryKey(e);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
  }
  return out;
}

/** Tür bazında sayım (ekranda "HTTP 20.1k · SOCKS4 3.2k · SOCKS5 24.9k"). */
export function countBySchemeKind(list: ProxyEntry[]): { http: number; socks4: number; socks5: number } {
  const out = { http: 0, socks4: 0, socks5: 0 };
  for (const e of list) {
    if (e.scheme === "socks4") out.socks4++;
    else if (e.scheme === "socks5") out.socks5++;
    else out.http++;
  }
  return out;
}

/** Tanı/gösterim için maskele: kimlik bilgisi gizlenir. */
export function maskProxyEntry(e: ProxyEntry): string {
  const host = e.host.includes(":") ? `[${e.host}]` : e.host;
  return e.user
    ? `${e.scheme}://***:***@${host}:${e.port}`
    : `${e.scheme}://${host}:${e.port}`;
}

/** Hedef panel http:// ise kimlik proxy'ye görünür (P8 uyarısı). */
export function targetExposesCredentials(panelUrl: string): boolean {
  return /^http:\/\//i.test((panelUrl || "").trim());
}
