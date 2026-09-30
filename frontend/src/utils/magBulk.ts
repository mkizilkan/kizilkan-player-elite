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

/** Portal keşfi için yaygın portlar (kullanıcı port vermezse). Verilen port her zaman ilk denenir. */
export const MAG_DISCOVERY_PORTS = [80, 8080, 8000, 2052, 2082, 2086, 2095, 25461, 8880, 2095, 443];

/** Portal keşfi için yaygın yollar (stalker.ts PORTAL_PATHS ile hizalı; /c/ önce). */
export const MAG_DISCOVERY_PATHS = [
  "/c/",
  "/portal.php",
  "/stalker_portal/server/load.php",
  "/server/load.php",
  "/c/portal.php",
  "/stalker_portal/",
  "/load.php",
];

/** MAC güvenli üst sınırı (aralık üretiminde donmayı/istismarı önler). */
export const MAG_MAX_MACS = 1024;

/** Ham metni MAC'e normalleştirir: BÜYÜK harf, iki nokta ayraçlı, yoksa null. */
export function normalizeMacStrict(raw: string): string | null {
  const hex = String(raw || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
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
    const norm = normalizeMacStrict(tok);
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
};

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
      const hasPort = u.port !== "";
      const path = u.pathname.replace(/\/+$/, "");
      const host = `${u.protocol}//${u.host}${path}`;
      const key = host.toLowerCase();
      if (!seen.has(key)) { seen.add(key); hosts.push({ raw: tok, host, hasPort }); }
    } catch { invalid.push(tok); }
  }
  return { hosts, invalid };
}

/**
 * Bir host için portal keşif adayları (adres:port/yol). Kullanıcı port verdiyse yalnız o port;
 * yoksa MAG_DISCOVERY_PORTS. Kullanıcı yol verdiyse (…/c/) o yol ilk sırada. Tekilleştirilir.
 */
export function portalDiscoveryCandidates(entry: MagHostEntry): string[] {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(entry.host) ? entry.host : "http://" + entry.host); }
  catch { return []; }
  const scheme = u.protocol.replace(":", "");
  const userPath = u.pathname.replace(/\/+$/, "");
  const ports = entry.hasPort ? [u.port] : MAG_DISCOVERY_PORTS.map(String);
  const paths = userPath && userPath !== "" ? [userPath, ...MAG_DISCOVERY_PATHS] : MAG_DISCOVERY_PATHS;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const port of Array.from(new Set(ports))) {
    const authority = port ? `${u.hostname}:${port}` : u.hostname;
    for (const p of paths) {
      const full = `${scheme}://${authority}${p.startsWith("/") ? p : "/" + p}`;
      const norm = full.replace(/\/+$/, "");
      if (!seen.has(norm)) { seen.add(norm); out.push(full); }
    }
  }
  return out;
}

export type MagBulkJob = { hostRaw: string; portal: string; mac: string; hasPort: boolean };

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
      jobs.push({ hostRaw: h.raw, portal: h.host, mac, hasPort: h.hasPort });
    }
  }
  return { jobs, capped };
}
