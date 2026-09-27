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
};

const MAX_RANGE = 512; // Tek satırda port aralığı patlamasını engelle.

function normalizeScheme(raw: string): ProxyScheme {
  const s = raw.toLowerCase();
  if (s === "https") return "https";
  if (s === "socks4") return "socks4";
  if (s === "socks5" || s === "socks") return "socks5";
  return "http";
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
  // Satır sonundaki fazladan sütunları at (ör. "1.2.3.4:8080  US  elite").
  line = line.split(/\s|,|\t|\||;/)[0].trim();
  if (!line) return [];

  let scheme: ProxyScheme = defaultScheme;
  const schemeMatch = line.match(/^([a-zA-Z0-9]+):\/\//);
  if (schemeMatch) {
    scheme = normalizeScheme(schemeMatch[1]);
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
      user = cred.slice(0, colon);
      pass = cred.slice(colon + 1);
    } else {
      user = cred;
    }
    if (user === "") user = undefined;
  }

  // host:port — port en sondaki ':' sonrası (IPv6 desteklenmiyor).
  const lastColon = line.lastIndexOf(":");
  if (lastColon <= 0 || lastColon >= line.length - 1) return [];
  const host = line.slice(0, lastColon).trim();
  const portToken = line.slice(lastColon + 1).trim();
  if (!host || !portToken) return [];

  const out: ProxyEntry[] = [];
  pushPortRange(out, scheme, host, portToken, user, pass);
  return out;
}

/** Tekilleştirme anahtarı (tür + kimlik + host + port). */
export function proxyEntryKey(e: ProxyEntry): string {
  return `${e.scheme}://${e.user || ""}:${e.pass || ""}@${e.host.toLowerCase()}:${e.port}`;
}

/** Çok satırlı metni ayrıştır; tekilleştir (scheme+host+port+user+pass). */
export function parseProxyText(text: string, defaultScheme: ProxyScheme = "http"): ProxyEntry[] {
  const seen = new Set<string>();
  const out: ProxyEntry[] = [];
  for (const line of (text || "").split(/\r?\n/)) {
    for (const e of parseProxyLine(line, defaultScheme)) {
      const key = proxyEntryKey(e);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
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
  return e.user
    ? `${e.scheme}://***:***@${e.host}:${e.port}`
    : `${e.scheme}://${e.host}:${e.port}`;
}

/** Hedef panel http:// ise kimlik proxy'ye görünür (P8 uyarısı). */
export function targetExposesCredentials(panelUrl: string): boolean {
  return /^http:\/\//i.test((panelUrl || "").trim());
}
