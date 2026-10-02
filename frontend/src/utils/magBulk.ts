/**
 * KIZILKAN PLAYER v18.7.0 — ÇOKLU MAC (MAG) EKLEME MODELİ.
 * ===========================================================================
 * Kullanıcı birden fazla MAC adresini (liste veya aralık) ve birden fazla portal
 * adresini (DNS:port, http/https olmadan da) tek seferde girer; her (portal × MAC)
 * kombinasyonu taranıp yalnız GEÇERLİ hesaplar eklenir (combo/Xtream çoklu eklemenin
 * MAG karşılığı). Bu dosya SAF'tır (React Native'e bağlı değil): Node ile test edilir
 * (tools/test-mag-bulk.js). Ağ/tarama burada YOK; yalnız ayrıştırma/üretim/planlama.
 *
 * YASAL: yalnız kullanıcının KENDİ MAG cihazlarının MAC adresleri taranmalıdır
 * (UI'da uyarı korunur). Bu model bir kısıt getirmez; sınırları çağıran uygular.
 * ===========================================================================
 */

/**
 * Portal keşfi için portlar (kullanıcı port vermezse). Verilen port her zaman ilk denenir.
 * v18.7.2 — GENİŞLETİLDİ (kullanıcı listesi + yaygın IPTV/stalker portları), EN OLASI ÖNCE sıralı.
 * Kapalı port anında "bağlantı reddedildi" döner (zaman aşımı beklemez), o yüzden geniş liste yavaş
 * değildir; kaç adaya gidileceğini analiz modu (maxCandidates) sınırlar.
 */
export const MAG_DISCOVERY_PORTS = [
  8080, 80, 443, 8000, 2082, 2052, 2086, 2095, 25461, 8880, 8888,
  2083, 2087, 2096, 2053, 8443,
  8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 8095, 8096,
  8001, 8002, 8008, 8010, 8020,
  25462, 25463, 25464, 25465,
  3000, 3001, 5000, 5001, 7000, 7001, 9000, 9090,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
];

/**
 * Portal keşfi için yollar (kullanıcı listesi + yaygın Stalker/Ministra yolları), EN OLASI ÖNCE.
 * v18.7.2: genişletildi. Yol-öncelikli süpürmede /c/, /portal.php, /stalker_portal/c/ öne alınır.
 */
export const MAG_DISCOVERY_PATHS = [
  "/c/",
  "/portal.php",
  "/stalker_portal/c/",
  "/stalker_portal/server/load.php",
  "/stalker_portal/server/",
  "/stalker_portal/",
  "/server/load.php",
  "/portal/",
  "/load.php",
  "/c/portal.php",
  "/ministra/c/",
  "/ministra/portal/c/",
  "/ministra/portal/",
  "/ministra/",
];

/** MAC güvenli üst sınırı (aralık üretiminde donmayı/istismarı önler). */
export const MAG_MAX_MACS = 1024;

/** Ham metni MAC'e normalleştirir: BÜYÜK harf, iki nokta ayraçlı, yoksa null. */
export function normalizeMacStrict(raw: string): string | null {
  const input = String(raw || "").trim();
  if (!/^(?:[0-9a-f]{12}|[0-9a-f]{2}(?::[0-9a-f]{2}){5}|[0-9a-f]{2}(?:-[0-9a-f]{2}){5})$/i.test(input)) return null;
  const hex = input.replace(/[:-]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return (hex.match(/.{2}/g) || []).join(":");
}

/** MAC'i 48-bit sayıya çevirir (aralık üretimi için). Geçersizse null. */
export function macToInt(mac: string): number | null {
  const norm = normalizeMacStrict(mac);
  if (!norm) return null;
  // 48 bit > 2^32; JS number (2^53) güvenli.
  return parseInt(norm.replace(/:/g, ""), 16);
}

/** 48-bit sayıyı MAC metnine çevirir. */
export function intToMac(value: number): string {
  const hex = Math.max(0, Math.floor(value)).toString(16).toUpperCase().padStart(12, "0").slice(-12);
  return (hex.match(/.{2}/g) || []).join(":");
}

/**
 * Serbest metinden MAC listesi. Ayraç: virgül, boşluk, yeni satır, noktalı virgül, sekme.
 * Geçersizler ayıklanır; tekilleştirilir; sıra korunur.
 */
export function parseMacList(text: string): { macs: string[]; invalid: string[] } {
  const tokens = String(text || "").split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
  const macs: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    const norm = normalizeMacStrict(tok.replace(/^MAC[=:]/i, ""));
    if (!norm) { invalid.push(tok); continue; }
    if (!seen.has(norm)) { seen.add(norm); macs.push(norm); }
  }
  return { macs, invalid };
}

/**
 * MAC aralığı: başlangıç + bitiş (dahil) VEYA başlangıç + adet.
 * Dönüş MAG_MAX_MACS ile sınırlanır (fazlası kırpılır, `capped` true).
 */
export function expandMacRange(startRaw: string, opts: { end?: string; count?: number }): { macs: string[]; capped: boolean; error?: string } {
  const start = macToInt(startRaw);
  if (start === null) return { macs: [], capped: false, error: "Başlangıç MAC geçersiz." };
  let end: number;
  if (opts.end != null && String(opts.end).trim() !== "") {
    const e = macToInt(opts.end);
    if (e === null) return { macs: [], capped: false, error: "Bitiş MAC geçersiz." };
    end = e;
  } else {
    const count = Math.max(1, Math.floor(Number(opts.count || 1)));
    end = start + count - 1;
  }
  if (end < start) return { macs: [], capped: false, error: "Bitiş MAC başlangıçtan küçük." };
  if (!Number.isSafeInteger(end) || end > 0xffffffffffff) return { macs: [], capped: false, error: "MAC aralığı 48 bit adres sınırını aşıyor." };
  let capped = false;
  let last = end;
  if (last - start + 1 > MAG_MAX_MACS) { last = start + MAG_MAX_MACS - 1; capped = true; }
  const macs: string[] = [];
  for (let v = start; v <= last; v++) macs.push(intToMac(v));
  return { macs, capped };
}

export type MagHostEntry = {
  /** Kullanıcının yazdığı ham değer (görüntüleme). */
  raw: string;
  /** Şema+host+port (varsa) — örn. "http://line.example.com:8080". */
  host: string;
  /** Kullanıcı açıkça port verdi mi (keşif portları denenmesin). */
  hasPort: boolean;
  /** URL.port normalleştirse bile kullanıcının açıkça yazdığı 80/443 korunur. */
  explicitPort?: string;
  hasPath?: boolean;
};

export type MagDiscoveryScope = "exact" | "fallback" | "all";
export const MAG_MAX_PARALLEL = 16;

export type MagArchiveEntry = {
  portal: string; mac: string; category: string; status?: string; expiry?: string | null;
  expiryDisplay?: string; username?: string; tariffPlan?: string;
  protection?: { state: string; kind: string; evidence: string[]; observedAt: string; endpoint: string; transport: string };
  liveCategories: string[]; vodCategories: string[]; seriesCategories: string[]; warnings: string[];
};
/** İnsan tarafından okunabilir TXT, JSON ile aynı hesap/kategori bilgisini taşır. */
export function formatMagArchiveTxt(entries: MagArchiveEntry[], stamp: string): string {
  const clean = (value: unknown) => String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  const blocks = entries.map((entry, index) => {
    const p = entry.protection;
    const protection = p?.state === "present" ? "Koruma / istek sınırı gözlendi" : p?.state === "not_observed" ? "Koruma görülmedi" : "Belirlenemedi";
    const cats = (label: string, names: string[], warningPrefix: string) => {
      const failed = entry.warnings.some(w => w.startsWith(warningPrefix) || w.startsWith("Kategori özeti:"));
      return `${label} (${names.length} kategori): ${names.length ? names.map(clean).join(" | ") : failed ? "Alınamadı / desteklenmiyor (uyarılara bakın)" : "Boş"}`;
    };
    return [
      `=== HESAP ${index + 1} ===`, `PORTAL=${clean(entry.portal)}`, `MAC=${clean(entry.mac)}`,
      `SONUC=${clean(entry.category)} · DURUM=${clean(entry.status) || "Bilinmiyor"}`,
      `BITIS=${clean(entry.expiryDisplay || entry.expiry) || "Bilinmiyor / bildirilmedi"}`,
      `KULLANICI=${clean(entry.username) || "Bildirilmedi"}`, `TARIFE=${clean(entry.tariffPlan) || "Bildirilmedi"}`,
      `KORUMA=${protection}${p ? ` · ${clean(p.kind)} · ${clean(p.observedAt)} · ${clean(p.transport)}` : ""}`,
      p?.evidence.length ? `KORUMA_KANITI=${p.evidence.map(clean).join(" | ")}` : "",
      cats("CANLI", entry.liveCategories, "Canlı"), cats("FILM", entry.vodCategories, "VOD"), cats("DIZI", entry.seriesCategories, "Series"),
      entry.warnings.length ? `UYARILAR=${entry.warnings.map(clean).join(" | ")}` : "",
    ].filter(Boolean).join("\n");
  });
  return `# KIZILKAN MAG hesap arşivi · ${clean(stamp)}\n# ${entries.length} seçili analiz sonucu\n# Koruma bilgisi yalnız belirtilen zamanda ve bağlantıda gözlenmiştir.\n\n${blocks.join("\n\n")}\n`;
}

/** Aynı default port tek kimliktir; farklı portal yolları farklı hesaptır. */
export function magAccountIdentity(portal: string, mac: string): string {
  let endpoint = String(portal || "").trim();
  try {
    const u = new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`);
    endpoint = `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {}
  return `${endpoint}\u0000${String(mac || "").toUpperCase()}`;
}

/**
 * Serbest metinden portal/DNS listesi. http/https olmadan da kabul (http:// eklenir).
 * Ayraç: virgül, boşluk, yeni satır, noktalı virgül. Yol içeren adres (…/c/) korunur.
 * Geçersizler ayıklanır.
 */
export function parsePortalHosts(text: string): { hosts: MagHostEntry[]; invalid: string[] } {
  const tokens = String(text || "").split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
  const hosts: MagHostEntry[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    let v = tok;
    if (!/^https?:\/\//i.test(v)) v = "http://" + v;
    try {
      const u = new URL(v);
      if (!/^https?:$/i.test(u.protocol) || !u.hostname) { invalid.push(tok); continue; }
      // Konak adı en az bir nokta veya IPv6 köşeli parantez içermeli.
      if (!(u.hostname.includes(".") || /^\[[0-9a-f:]+\]$/i.test(u.hostname))) { invalid.push(tok); continue; }
      const authority = v.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0];
      const explicitPort = /:(\d+)$/.exec(authority)?.[1];
      const hasPort = explicitPort !== undefined;
      const path = u.pathname.replace(/\/+$/, "");
      const host = `${u.protocol}//${u.hostname}${explicitPort ? `:${explicitPort}` : ""}${path}`;
      const key = host.toLowerCase();
      if (!seen.has(key)) { seen.add(key); hosts.push({ raw: tok, host, hasPort, explicitPort, hasPath: path !== "" }); }
    } catch { invalid.push(tok); }
  }
  return { hosts, invalid };
}

/**
 * Bir host için portal keşif adayları (adres:port/yol). Kullanıcı port verdiyse yalnız o port;
 * yoksa MAG_DISCOVERY_PORTS. Kullanıcı yol verdiyse (…/c/) o yol ilk sırada.
 *
 * v18.7.2 — AKILLI SIRALAMA (kanıt: portsuz keşif 8080'e ulaşamadan takılıyordu). En olası
 * kombinasyonlar (yaygın portlar 8080/80 × en yaygın yollar /c/ ve /portal.php) EN ÖNE alınır;
 * geri kalan port×yol matrisi arkadan gelir. Böylece kısa zaman aşımıyla doğru portal ilk
 * birkaç denemede bulunur. Tekilleştirilir.
 */
export function portalDiscoveryCandidates(entry: MagHostEntry, options: { allPorts?: boolean } = {}): string[] {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(entry.host) ? entry.host : "http://" + entry.host); }
  catch { return []; }
  const scheme = u.protocol.replace(":", "");
  const userPath = u.pathname.replace(/\/+$/, "");
  const givenPort = entry.explicitPort || u.port || (u.protocol === "https:" ? "443" : "80");
  const ports = (options.allPorts
    ? [givenPort, ...MAG_DISCOVERY_PORTS.map(String)]
    : entry.hasPort ? [givenPort] : MAG_DISCOVERY_PORTS.map(String)).filter((p, i, a) => a.indexOf(p) === i);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (port: string, p: string) => {
    const authority = port ? `${u.hostname}:${port}` : u.hostname;
    const candidateScheme = port === givenPort ? scheme : ["443", "8443", "2053", "2083", "2087", "2096"].includes(port) ? "https" : "http";
    const full = `${candidateScheme}://${authority}${p.startsWith("/") ? p : "/" + p}`;
    const norm = full.replace(/\/+$/, "");
    if (!seen.has(norm)) { seen.add(norm); out.push(full); }
  };
  // v18.7.2 — YOL-ÖNCELİKLİ SÜPÜRME: doğru PORT'u hızlı bulmak için en olası yol (kullanıcı yolu →
  // /c/ → /portal.php) TÜM portlarda süpürülür, sonra kalan yollar. Böylece maxCandidates sınırı
  // içinde çok sayıda port en olası yolla denenir (8080//c/, 80//c/, 443//c/, …).
  const topPaths = [userPath && userPath !== "" ? userPath : "", "/c/", "/portal.php", "/stalker_portal/c/"].filter((p, i, a) => p !== "" && a.indexOf(p) === i);
  const restPaths = MAG_DISCOVERY_PATHS.filter(p => !topPaths.includes(p));
  for (const p of topPaths) for (const port of ports) add(port, p);
  for (const p of restPaths) for (const port of ports) add(port, p);
  return out;
}

export type MagBulkJob = { hostRaw: string; portal: string; mac: string; hasPort: boolean; explicitPort?: string; hasPath?: boolean };

/**
 * (host × MAC) kartezyeni → tarama işleri. Toplam iş MAG_MAX_MACS×host sayısıyla değil,
 * makul bir tavanla (maxJobs) sınırlanır; fazlası kırpılır (`capped`).
 */
export function buildMagBulkJobs(hosts: MagHostEntry[], macs: string[], maxJobs = 8192): { jobs: MagBulkJob[]; capped: boolean } {
  const jobs: MagBulkJob[] = [];
  let capped = false;
  outer:
  for (const h of hosts) {
    for (const mac of macs) {
      if (jobs.length >= maxJobs) { capped = true; break outer; }
      jobs.push({ hostRaw: h.raw, portal: h.host, mac, hasPort: h.hasPort, ...(h.explicitPort ? { explicitPort: h.explicitPort } : {}), ...(h.hasPath !== undefined ? { hasPath: h.hasPath } : {}) });
    }
  }
  return { jobs, capped };
}
