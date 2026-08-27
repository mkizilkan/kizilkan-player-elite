/**
 * KIZILKAN PLAYER — Stalker / MAG Portal (CİHAZ İÇİ)
 * Dosya  : frontend/src/utils/stalker.ts
 * Sürüm  : v1.0.0 (v9.1.0)
 *
 * ===========================================================================
 * MAC adresiyle çalışan Stalker/MAG portallarına DOĞRUDAN CİHAZDAN bağlanır.
 * Bu, projedeki SON backend bağımlılığını kaldırır.
 *
 * PROTOKOL ZİNCİRİ:
 *   1) handshake        -> token
 *   2) get_profile      -> cihazı tanıt (portal varyantlarına göre kimlik alanları değişebilir)
 *   3) get_genres       -> kategoriler
 *   4) get_all_channels -> kanallar
 *   5) create_link      -> OYNATMA ANINDA gerçek adres (adresler GEÇİCİ)
 *
 * KRİTİK NOKTALAR:
 *   • MAC, Cookie başlığında gider
 *   • Token: Authorization: Bearer <token>, SÜRESİ DOLAR -> yenilenir
 *   • Portal yolu sağlayıcıya göre değişir -> 4 yaygın yol sırayla denenir
 *   • User-Agent MAG kutusunu taklit etmeli, aksi halde portal reddeder
 * ===========================================================================
 */

import type { AccountInfo, Channel, SeriesItem, VodItem } from "@/src/types";
import { recordDiagnostic } from "@/src/utils/diagnostics";

/** MAG250 kimliği. Portallar bunu bekler. */
const MAG_UA =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3";

/** Sağlayıcıya göre değişen yaygın endpoint yolları. */
const PORTAL_PATHS = [
  "/portal.php",
  "/load.php",
  "/stalker_portal/server/load.php",
  "/stalker_portal/server/portal.php",
  "/server/load.php",
  "/server/portal.php",
  "/c/portal.php",
];

export interface StalkerCreds {
  portal: string;
  mac: string;
  serial?: string;
  deviceId?: string;
}

export interface StalkerSession {
  token: string;
  endpoint: string;
  profile?: any;
  profileError?: string;
  profileVariant?: string;
  random?: string;
}

const SESSION_TTL_MS = 15 * 60 * 1000;
const stalkerSessionCache = new Map<string, { session: StalkerSession; profile: any; at: number }>();

function sessionKey(cred: StalkerCreds): string { return `${baseOf(cred.portal).toLowerCase()}|${normalizeMac(cred.mac)}|${cred.serial || ""}|${cred.deviceId || ""}`; }
function getCachedSession(cred: StalkerCreds): { session: StalkerSession; profile: any } | null {
  const key = sessionKey(cred); const hit = stalkerSessionCache.get(key); if (!hit) return null;
  if (Date.now() - hit.at > SESSION_TTL_MS) { stalkerSessionCache.delete(key); return null; }
  return { session: hit.session, profile: hit.profile };
}
function cacheSession(cred: StalkerCreds, session: StalkerSession, profile: any) {
  const key = sessionKey(cred); stalkerSessionCache.set(key, { session, profile, at: Date.now() });
  if (stalkerSessionCache.size > 8) { const oldest = [...stalkerSessionCache.entries()].sort((a,b)=>a[1].at-b[1].at)[0]?.[0]; if (oldest) stalkerSessionCache.delete(oldest); }
}
function invalidateSession(cred: StalkerCreds) { stalkerSessionCache.delete(sessionKey(cred)); }

/** MAC'i portalın beklediği biçime getirir: BÜYÜK harf, iki nokta ayraçlı. */
export function normalizeMac(raw: string): string {
  const hex = (raw || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return (raw || "").trim().toUpperCase();
  return (hex.match(/.{2}/g) || []).join(":");
}

/** Portal adresinin kökünü çıkarır. */
function baseOf(portal: string): string {
  let p = (portal || "").trim();
  if (!/^https?:\/\//i.test(p)) p = "http://" + p;
  try {
    const u = new URL(p);
    return `${u.protocol}//${u.host}`;
  } catch {
    return p.replace(/\/+$/, "");
  }
}

function portalCandidates(portal: string): string[] {
  let p = String(portal || "").trim();
  if (!/^https?:\/\//i.test(p)) p = "http://" + p;
  const out: string[] = [];
  const push = (v: string) => { const x = v.replace(/\?$/, "").replace(/\/+$/, ""); if (x && !out.includes(x)) out.push(x); };
  try {
    const u = new URL(p);
    const origin = `${u.protocol}//${u.host}`;
    const path = u.pathname.replace(/\/+$/, "");
    if (/\.php$/i.test(path)) push(origin + path); // Kullanıcının verdiği gerçek endpoint her zaman ilk aday.
    if (/\/stalker_portal(?:\/c)?$/i.test(path)) {
      push(origin + "/stalker_portal/server/load.php");
      push(origin + "/stalker_portal/server/portal.php");
    } else if (/\/c$/i.test(path)) {
      push(origin + "/portal.php");
      push(origin + "/stalker_portal/server/load.php");
    } else if (path && path !== "/") {
      // Özel alt dizine kurulmuş portallar: /foo/c -> /foo/server/load.php vb.
      const prefix = path.replace(/\/c$/i, "");
      push(origin + prefix + "/server/load.php");
      push(origin + prefix + "/server/portal.php");
      push(origin + prefix + "/portal.php");
      push(origin + prefix + "/load.php");
    }
    PORTAL_PATHS.forEach(x => push(origin + x));
  } catch {
    const base = baseOf(p);
    PORTAL_PATHS.forEach(x => push(base + x));
  }
  return out;
}

function refererFor(cred: StalkerCreds, endpoint?: string): string {
  const ep = String(endpoint || "");
  try {
    const u = new URL(ep || cred.portal);
    if (u.pathname.includes("/stalker_portal/")) return `${u.protocol}//${u.host}/stalker_portal/c/`;
    const path = new URL(cred.portal.startsWith("http") ? cred.portal : `http://${cred.portal}`).pathname;
    if (/\/c\/?$/i.test(path)) return `${u.protocol}//${u.host}${path.replace(/\/?$/, "/")}`;
    return `${u.protocol}//${u.host}/c/`;
  } catch { return baseOf(cred.portal) + "/c/"; }
}

function headersFor(cred: StalkerCreds, token?: string, endpoint?: string): Record<string, string> {
  const mac = normalizeMac(cred.mac);
  const h: Record<string, string> = {
    "User-Agent": MAG_UA,
    Referer: refererFor(cred, endpoint),
    Accept: "*/*",
    "X-User-Agent": "Model: MAG250; Link: Ethernet",
    // MAG portalları MAC cookie'sini klasik iki-noktalı biçimde bekler.
    Cookie: `mac=${mac}; stb_lang=en; timezone=Europe%2FIstanbul`,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function req(url: string, headers: Record<string, string>, timeoutMs = 20000): Promise<any> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  const startedAt = Date.now();
  const requestMeta = (() => {
    try {
      const u = new URL(url);
      return {
        path: u.pathname,
        type: u.searchParams.get("type") || "",
        action: u.searchParams.get("action") || "",
        page: u.searchParams.get("p") || "",
        host: u.host,
      };
    } catch { return { path: "", type: "", action: "", page: "", host: "" }; }
  })();
  try {
    let res: any;
    try {
      res = await fetch(url, { headers, signal: c.signal });
    } catch (cause: any) {
      const err: any = new Error(cause?.name === "AbortError" ? `Bağlantı zaman aşımı (${timeoutMs} ms)` : `Network request failed: ${String(cause?.message || cause || "bilinmeyen ağ hatası")}`);
      err.kind = cause?.name === "AbortError" ? "TIMEOUT" : "NETWORK";
      err.causeName = String(cause?.name || "");
      void recordDiagnostic("mag", "STALKER_HTTP_TRANSPORT_ERROR", { ...requestMeta, elapsedMs: Date.now() - startedAt, timeoutMs, kind: err.kind, causeName: err.causeName, message: err.message });
      throw err;
    }
    const contentType = String(res.headers?.get?.("content-type") || "");
    const finalUrl = String((res as any).url || url);
    const redirected = !!(res as any).redirected;
    const text = await res.text();
    void recordDiagnostic("mag", "STALKER_HTTP_RESPONSE", {
      ...requestMeta, status: Number(res.status || 0), ok: !!res.ok, elapsedMs: Date.now() - startedAt,
      bytes: text.length, contentType: contentType.split(";")[0] || "", redirected,
      finalPath: (() => { try { return new URL(finalUrl).pathname; } catch { return ""; } })(),
    });
    if (!res.ok) {
      const err: any = new Error(`HTTP ${res.status}${contentType ? ` · ${contentType.split(";")[0]}` : ""}`);
      err.status = res.status; err.kind = "HTTP"; err.contentType = contentType; err.finalUrl = finalUrl; err.redirected = redirected;
      throw err;
    }
    try {
      return JSON.parse(text.replace(/^\uFEFF/, "").trim());
    } catch {
      const trimmed = text.replace(/^\uFEFF/, "").trim();
      if (!/^</.test(trimmed)) {
        const first = trimmed.indexOf("{");
        const last = trimmed.lastIndexOf("}");
        if (first >= 0 && last > first) {
          try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {}
        }
      }
      const kind = /^</.test(trimmed) ? "HTML" : "NON_JSON";
      const err: any = new Error(`Portal JSON değil · HTTP ${res.status}${contentType ? ` · ${contentType.split(";")[0]}` : ""}${redirected ? " · yönlendirme var" : ""}`);
      err.kind = kind; err.status = res.status; err.contentType = contentType; err.finalUrl = finalUrl; err.redirected = redirected;
      void recordDiagnostic("mag", "STALKER_HTTP_PARSE_ERROR", { ...requestMeta, elapsedMs: Date.now() - startedAt, status: res.status, kind, bytes: text.length, contentType: contentType.split(";")[0] || "", redirected });
      throw err;
    }
  } finally {
    clearTimeout(t);
  }
}

function buildUrl(endpoint: string, params: Record<string, string>): string {
  const q = new URLSearchParams({ ...params, JsHttpRequest: "1-xml" }).toString();
  return `${endpoint}?${q}`;
}

/** 1) HANDSHAKE — portal yolu bilinmediği için yollar sırayla denenir. */
export async function stalkerHandshake(cred: StalkerCreds): Promise<StalkerSession> {
  const errors: string[] = [];

  for (const endpoint of portalCandidates(cred.portal)) {
    const label = (() => { try { return new URL(endpoint).pathname; } catch { return endpoint; } })();
    const attemptAt = Date.now();
    void recordDiagnostic("catalog", "STALKER_ENDPOINT_ATTEMPT", { endpoint, path: label });
    try {
      const data = await req(
        buildUrl(endpoint, { type: "stb", action: "handshake", token: "", prehash: "0" }),
        headersFor(cred, undefined, endpoint)
      );
      const token = data?.js?.token;
      if (token) {
        void recordDiagnostic("catalog", "STALKER_ENDPOINT_OK", { endpoint, path: label, elapsedMs: Date.now()-attemptAt });
        return { token, endpoint, random: primitiveString(data?.js?.random) };
      }
      errors.push(`${label}: token yok`);
      void recordDiagnostic("catalog", "STALKER_ENDPOINT_ERROR", { endpoint, path: label, elapsedMs: Date.now()-attemptAt, kind:"NO_TOKEN", message:"token yok" });
    } catch (e: any) {
      const detail = [e?.message, e?.finalUrl && e.finalUrl !== endpoint ? `final=${String(e.finalUrl)}` : ""].filter(Boolean).join(" · ");
      errors.push(`${label}: ${detail || e}`);
      void recordDiagnostic("catalog", "STALKER_ENDPOINT_ERROR", { endpoint, path: label, elapsedMs: Date.now()-attemptAt, kind:e?.kind, status:e?.status, contentType:e?.contentType, redirected:e?.redirected, finalUrl:e?.finalUrl, message:String(e?.message || e) });
    }
  }

  throw new Error(
    "Portala bağlanılamadı. Denenen yollar:\n" + errors.join("\n") +
      "\n\nPortal adresini ve MAC'i kontrol edin."
  );
}

/** 2) GET_PROFILE — portal varyantlarına kontrollü uyumluluk. */
type StalkerProfileVariant = { label: string; params: Record<string,string> };

async function derivedMagIdentity(cred: StalkerCreds): Promise<{sn:string; deviceId:string; deviceId2:string; signatureLegacy:string; signatureModern:string; hwVersion2:string}> {
  const Crypto = await import("expo-crypto");
  const mac = normalizeMac(cred.mac);
  const md5 = (value:string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, value);
  const sha1 = (value:string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, value);
  const sha256 = (value:string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
  const serial = String(cred.serial || (await md5(mac)).toUpperCase().slice(13));
  const deviceId = String(cred.deviceId || await sha256(serial)).toUpperCase();
  const deviceId2 = String(await sha256(mac)).toUpperCase();
  return {
    sn: serial,
    deviceId,
    deviceId2,
    signatureLegacy: String(await sha256(serial + mac)).toUpperCase(),
    signatureModern: String(await sha256(mac + serial + deviceId + deviceId2)).toUpperCase(),
    hwVersion2: String(await sha1(mac)).toLowerCase(),
  };
}

function baseProfileParams(mac:string, model:"MAG250"|"MAG254"="MAG250"): Record<string,string> {
  return {
    type: "stb",
    action: "get_profile",
    hd: "1",
    ver: model === "MAG254"
      ? "ImageDescription: 0.2.18-r11-pub-254; ImageDate: Wed Mar 18 18:09:40 EET 2015; PORTAL version: 4.9.14; API Version: JS API version: 331; STB API version: 141; Player Engine version: 0x572"
      : "ImageDescription: 0.2.18-r23-250; ImageDate: Wed Aug 29 10:49:53 EEST 2018; PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c",
    stb_type: model,
    image_version: "218",
    num_banks: "2",
    auth_second_step: "0",
    hw_version: "1.7-BD-00",
    not_valid_token: "0",
    mac,
  };
}

function initialProfileVariants(cred:StalkerCreds): StalkerProfileVariant[] {
  const mac=normalizeMac(cred.mac);
  const base=baseProfileParams(mac);
  const mag254=baseProfileParams(mac,"MAG254");
  return [{
    label:"MAG250-explicit",
    params:{...base, sn:cred.serial || "", device_id:cred.deviceId || "", device_id2:cred.deviceId || "", client_type:"STB", video_out:"hdmi"},
  }, {
    label:"MAG250-legacy-minimal",
    params:{...base, num_banks:"1", sn:cred.serial || "", device_id:"", device_id2:"", signature:""},
  }, {
    label:"MAG254-legacy",
    params:{...mag254, num_banks:"1", hw_version:"2.6-IB-00", sn:cred.serial || "", device_id:cred.deviceId || "", device_id2:cred.deviceId || "", signature:""},
  }];
}

async function derivedProfileVariants(cred:StalkerCreds, random=""): Promise<StalkerProfileVariant[]> {
  try {
    const mac=normalizeMac(cred.mac);
    const base=baseProfileParams(mac);
    const id=await derivedMagIdentity(cred);
    const metrics=JSON.stringify({mac, sn:id.sn, type:"STB", model:"MAG250", uid:"", random});
    return [{
      label:"MAG250-derived-identity",
      params:{...base, sn:id.sn, device_id:id.deviceId, device_id2:id.deviceId2, signature:id.signatureModern, auth_second_step:"1", client_type:"STB", video_out:"hdmi", metrics, hw_version_2:id.hwVersion2, api_signature:"262", prehash:""},
    }, {
      label:"MAG250-derived-legacy-signature",
      params:{...base, sn:id.sn, device_id:id.deviceId, device_id2:id.deviceId2, signature:id.signatureLegacy, auth_second_step:"0"},
    }];
  } catch {
    return [];
  }
}

function profilePayload(data:any): any {
  const js=data?.js;
  if (js && typeof js === "object") return js;
  return null;
}

/**
 * get_profile için ilk olarak mevcut KIZILKAN kimliği kullanılır. Yalnız profil
 * gerçekten reddedilir/geçersiz dönerse sahada görülen iki MAG kimlik modeli
 * kontrollü biçimde denenir. Katalog başarısı yine nihai doğrulamadır; hiçbir
 * varyant sahte başarılı sayılmaz.
 */
export async function stalkerProfile(cred: StalkerCreds, ses: StalkerSession): Promise<any> {
  const errors:string[]=[];
  const tryVariants = async (variants:StalkerProfileVariant[]): Promise<any> => {
  for (const variant of variants) {
    const started=Date.now();
    try {
      const data=await req(buildUrl(ses.endpoint, variant.params), headersFor(cred, ses.token, ses.endpoint));
      const profile=profilePayload(data);
      if (profile) {
        ses.profileVariant=variant.label;
        void recordDiagnostic("catalog","STALKER_PROFILE_VARIANT_OK",{variant:variant.label, elapsedMs:Date.now()-started, endpoint:ses.endpoint});
        return profile;
      }
      errors.push(`${variant.label}: profil boş`);
      void recordDiagnostic("catalog","STALKER_PROFILE_VARIANT_EMPTY",{variant:variant.label, elapsedMs:Date.now()-started, endpoint:ses.endpoint});
    } catch (e:any) {
      errors.push(`${variant.label}: ${String(e?.message || e)}`);
      void recordDiagnostic("catalog","STALKER_PROFILE_VARIANT_ERROR",{variant:variant.label, elapsedMs:Date.now()-started, endpoint:ses.endpoint, status:e?.status, kind:e?.kind, contentType:e?.contentType, redirected:e?.redirected, finalUrl:e?.finalUrl, message:String(e?.message || e)});
    }
  }
  return null;
  };
  const direct=await tryVariants(initialProfileVariants(cred));
  if (direct) return direct;
  const derived=await tryVariants(await derivedProfileVariants(cred, ses.random || ""));
  if (derived) return derived;
  throw new Error("MAG profil doğrulaması başarısız. " + errors.join(" | "));
}

/** v15.2.23-RC2: büyük MAG katalog döngülerinde JS event-loop'a düzenli kontrol ver. */
async function stalkerCatalogYield(index: number, every = 300): Promise<void> {
  if (index > 0 && index % every === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
}

/** 3) KATEGORİLER */
export async function stalkerGenres(cred: StalkerCreds, ses: StalkerSession): Promise<Map<string, string>> {
  const data = await req(
    buildUrl(ses.endpoint, { type: "itv", action: "get_genres" }),
    headersFor(cred, ses.token, ses.endpoint)
  );
  const map = new Map<string, string>();
  const list = Array.isArray(data?.js) ? data.js : [];
  for (const g of list) {
    if (g?.id != null) map.set(String(g.id), String(g.title || "Genel"));
  }
  return map;
}

/** 4) TÜM KANALLAR */
export async function stalkerChannels(cred: StalkerCreds, ses: StalkerSession): Promise<Channel[]> {
  const genres = await stalkerGenres(cred, ses).catch(() => new Map<string, string>());
  let list:any[]=[];
  let source="get_all_channels";
  try {
    const data = await req(
      buildUrl(ses.endpoint, { type: "itv", action: "get_all_channels" }),
      headersFor(cred, ses.token, ses.endpoint),
      120000
    );
    list = Array.isArray(data?.js?.data) ? data.js.data : (Array.isArray(data?.js) ? data.js : []);
    if (!list.length) throw Object.assign(new Error("get_all_channels boş"), { kind:"EMPTY" });
  } catch (first:any) {
    source="get_ordered_list";
    void recordDiagnostic("mag", "STALKER_LIVE_FALLBACK", { from:"get_all_channels", to:"get_ordered_list", status:first?.status, kind:first?.kind, message:String(first?.message || first) });
    const seen=new Set<string>();
    for (let page=0; page<10000; page++) {
      const data=await req(buildUrl(ses.endpoint,{type:"itv",action:"get_ordered_list",fav:"0",sortby:"number",p:String(page)}),headersFor(cred,ses.token,ses.endpoint),120000);
      const rows=rowsFromListShape(data);
      if (!rows.length) {
        if (page===0) continue; // bazı portallar p=1 ile başlar
        break;
      }
      let added=0;
      for (let i=0;i<rows.length;i++) { const row=rows[i]; const key=String(row?.id ?? row?.ch_id ?? `${page}-${i}`); if (!seen.has(key)) { seen.add(key); list.push(row); added++; } await stalkerCatalogYield(i); }
      void recordDiagnostic("mag", "STALKER_LIVE_PAGE", { page, rows:rows.length, added, total:list.length });
      await stalkerCatalogYield(page, 1);
      const total=Number(data?.js?.total_items); if (Number.isFinite(total) && list.length>=total) break;
      if (!added) break;
    }
  }
  void recordDiagnostic("mag", "STALKER_LIVE_CATALOG", { source, count:list.length });
  const out: Channel[] = [];
  for (let i=0; i<list.length; i++) {
    const c:any = list[i];
    out.push({
      id: `stalker-${c.id}`,
      name: c.name || "Kanal",
      group: genres.get(String(c.tv_genre_id ?? c.category_id)) || String(c.category_name || "Genel"),
      logo: c.logo ? (String(c.logo).startsWith("http") ? c.logo : baseOf(cred.portal) + "/stalker_portal/misc/logos/320/" + c.logo) : null,
      url: String(c.cmd || c.url || ""),
      epg_channel_id: c.xmltv_id || undefined,
      tvg_id: c.xmltv_id || undefined,
      source: "stalker",
      stream_id: String(c.id),
    } as Channel);
    await stalkerCatalogYield(i);
  }
  return out;
}


function primitiveString(v: any): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  return String(v);
}

/** Portal get_profile yanıtını uygulama içi sabit tipe çevirir. */
export function normalizeStalkerAccountInfo(profile: any): AccountInfo {
  const p = profile && typeof profile === "object" ? profile : {};
  return {
    username: primitiveString(p.login || p.username),
    status: primitiveString(p.status ?? p.blocked ?? p.active),
    mac: primitiveString(p.mac),
    phone: primitiveString(p.phone),
    tariff_plan: primitiveString(p.tariff_plan || p.tariff_plan_name),
    tariff_expired_date: primitiveString(p.tariff_expired_date || p.exp_billing_date || p.exp_date) || null,
  };
}

type StalkerMediaType = "itv" | "vod" | "series";

function mediaCommand(kind: "vod" | "series", cmd: string, series = ""): string {
  return `kizilkan-stalker://${kind}?cmd=${encodeURIComponent(String(cmd || ""))}&series=${encodeURIComponent(series)}`;
}

function parseMediaCommand(value: string): { kind: "itv" | "vod"; cmd: string; series: string } {
  const raw = String(value || "");
  if (!raw.startsWith("kizilkan-stalker://")) return { kind: "itv", cmd: raw, series: "" };
  try {
    const u = new URL(raw);
    const marker = String(u.hostname || u.pathname.replace(/^\//, "")).toLowerCase();
    return { kind: marker === "vod" || marker === "series" ? "vod" : "itv", cmd: decodeURIComponent(u.searchParams.get("cmd") || ""), series: u.searchParams.get("series") || (marker === "series" ? "1" : "") };
  } catch { return { kind: "itv", cmd: raw, series: "" }; }
}

class StalkerCatalogUnsupportedError extends Error {
  constructor(public readonly mediaType: "vod" | "series", message: string) { super(message); this.name = "StalkerCatalogUnsupportedError"; }
}
function unsupportedStatus(e:any): boolean { return [400,404,405,501].includes(Number(e?.status)); }
function isExplicitListShape(data:any): boolean {
  const js=data?.js;
  return Array.isArray(js) || (!!js && typeof js === "object" && (Array.isArray(js.data) || js.total_items !== undefined || js.max_page_items !== undefined));
}
function rowsFromListShape(data:any): any[] {
  const js=data?.js;
  return Array.isArray(js?.data) ? js.data : (Array.isArray(js) ? js : []);
}

async function stalkerCategories(cred: StalkerCreds, ses: StalkerSession, type: "vod" | "series"): Promise<Map<string,string>> {
  let data:any;
  try { data = await req(buildUrl(ses.endpoint, { type, action: "get_categories" }), headersFor(cred, ses.token, ses.endpoint), 60000); }
  catch (e:any) { if (unsupportedStatus(e)) throw new StalkerCatalogUnsupportedError(type, `${type} kategori endpoint desteklenmiyor`); throw e; }
  const js=data?.js;
  const raw = Array.isArray(js) ? js : (Array.isArray(js?.data) ? js.data : []);
  if (!Array.isArray(raw) || (!Array.isArray(js) && !Array.isArray(js?.data) && js != null)) {
    throw new StalkerCatalogUnsupportedError(type, `${type} kategori yanıt biçimi desteklenmiyor`);
  }
  const out = new Map<string,string>();
  for (const c of raw) {
    const id = c?.id ?? c?.category_id;
    if (id == null) continue;
    out.set(String(id), String(c?.title || c?.name || c?.category_name || "Genel"));
  }
  return out;
}

async function stalkerOrderedList(cred: StalkerCreds, ses: StalkerSession, type: "vod" | "series", extra: Record<string,string> = {}): Promise<any[]> {
  const out:any[]=[]; const seen=new Set<string>();
  let total=Number.POSITIVE_INFINITY; let page=0; let firstNonEmptyPage:number|null=null;
  while (page <= 10000 && out.length < total) {
    let data:any;
    try { data = await req(buildUrl(ses.endpoint, { type, action:"get_ordered_list", p:String(page), ...extra }), headersFor(cred, ses.token, ses.endpoint), 120000); }
    catch (e:any) { if (unsupportedStatus(e)) throw new StalkerCatalogUnsupportedError(type, `${type} ordered-list endpoint desteklenmiyor`); throw e; }
    if (!isExplicitListShape(data)) throw new StalkerCatalogUnsupportedError(type, `${type} ordered-list yanıt biçimi desteklenmiyor`);
    const js=data?.js; const rows=rowsFromListShape(data);
    const declared=Number(js?.total_items);
    if (Number.isFinite(declared) && declared >= 0) total=declared;
    if (!rows.length) {
      // Gerçek dünyada hem p=0 hem p=1 başlangıç kullanan Ministra/Stalker fork'ları var.
      if (firstNonEmptyPage === null && page === 0) { page=1; continue; }
      break;
    }
    if (firstNonEmptyPage === null) firstNonEmptyPage=page;
    let added=0;
    for (let ri=0; ri<rows.length; ri++) {
      const row=rows[ri]; const key=String(row?.id ?? row?.movie_id ?? row?.series_id ?? `${page}-${ri}`);
      if (seen.has(key)) continue; seen.add(key); out.push(row); added++;
      await stalkerCatalogYield(ri);
    }
    await stalkerCatalogYield(page, 1);
    if (!added && firstNonEmptyPage === 0 && page === 1) { page=2; continue; }
    if (!added) break;
    page++;
  }
  return out;
}

function isSeriesCategoryTitle(title: string): boolean {
  return /\b(series|tv[ ._-]*shows?|serials?|dizi|diziler|sezon|season)\b/i.test(String(title || ""));
}
function truthyPortalFlag(v:any): boolean {
  const x=String(v ?? "").trim().toLowerCase(); return x === "1" || x === "true" || x === "yes" || x === "on";
}
function rowLooksSeries(v:any, group:string): boolean {
  return truthyPortalFlag(v?.is_series) || Array.isArray(v?.series) || isSeriesCategoryTitle(group) || /\b(series|serial|dizi)\b/i.test(String(v?.type || v?.stream_type || ""));
}
function mapVodRow(v:any, i:number, cats:Map<string,string>): VodItem {
  const sid=String(v?.id ?? v?.movie_id ?? v?.video_id ?? i);
  const cmd=String(v?.cmd || v?.url || ""); const ext=String(v?.container_extension || v?.file_type || "mp4").replace(/^\./, "") || "mp4";
  const catId=v?.category_id ?? v?.category; const group=cats.get(String(catId)) || String(v?.category_name || "Genel");
  return { id:`st-vod-${sid}`, stream_id:sid, name:String(v?.name || v?.title || "Film"), group, poster:v?.screenshot_uri || v?.cover || v?.logo || null,
    rating:v?.rating || v?.rating_imdb || null, year:v?.year || null, duration:v?.time || v?.duration || null, added:primitiveString(v?.added), genre:primitiveString(v?.genre),
    container_ext:ext, url:mediaCommand("vod", cmd || `/media/file_${sid}.${ext}`) } as VodItem;
}
function mapSeriesRow(v:any, i:number, cats:Map<string,string>): SeriesItem {
  const sid=String(v?.id ?? v?.series_id ?? v?.movie_id ?? i); const catId=v?.category_id ?? v?.category;
  return { id:`st-series-${sid}`, series_id:sid, name:String(v?.name || v?.title || "Dizi"), group:cats.get(String(catId)) || String(v?.category_name || "Genel"),
    poster:v?.screenshot_uri || v?.cover || v?.logo || null, plot:primitiveString(v?.description || v?.plot), genre:primitiveString(v?.genre), rating:v?.rating || v?.rating_imdb || null,
    release_date:primitiveString(v?.year || v?.release_date) } as SeriesItem;
}

type VodPartition = { vod:VodItem[]; fallbackSeries:SeriesItem[]; supported:boolean; rawCount:number; seriesFlagged:number };
async function stalkerVodPartition(cred:StalkerCreds, ses:StalkerSession): Promise<VodPartition> {
  let cats=new Map<string,string>();
  try { cats=await stalkerCategories(cred,ses,"vod"); } catch (e) { if (!(e instanceof StalkerCatalogUnsupportedError)) throw e; }
  let raw:any[];
  try { raw=await stalkerOrderedList(cred,ses,"vod"); }
  catch (e) { if (e instanceof StalkerCatalogUnsupportedError) return {vod:[],fallbackSeries:[],supported:false,rawCount:0,seriesFlagged:0}; throw e; }
  const vod:VodItem[]=[]; const fallbackSeries:SeriesItem[]=[];
  for (let i=0; i<raw.length; i++) {
    const v=raw[i];
    const group=cats.get(String(v?.category_id ?? v?.category)) || String(v?.category_name || "Genel");
    if (rowLooksSeries(v,group)) fallbackSeries.push(mapSeriesRow(v,i,cats)); else vod.push(mapVodRow(v,i,cats));
    await stalkerCatalogYield(i);
  }
  return {vod,fallbackSeries,supported:true,rawCount:raw.length,seriesFlagged:fallbackSeries.length};
}

async function nativeStalkerSeries(cred:StalkerCreds, ses:StalkerSession): Promise<{items:SeriesItem[]; supported:boolean}> {
  let cats=new Map<string,string>();
  try { cats=await stalkerCategories(cred,ses,"series"); } catch (e) { if (!(e instanceof StalkerCatalogUnsupportedError)) throw e; }
  let raw:any[];
  try { raw=await stalkerOrderedList(cred,ses,"series"); }
  catch (e) { if (e instanceof StalkerCatalogUnsupportedError) return {items:[],supported:false}; throw e; }
  const items: SeriesItem[] = [];
  for (let i=0; i<raw.length; i++) { items.push(mapSeriesRow(raw[i],i,cats)); await stalkerCatalogYield(i); }
  return {items, supported:true};
}

export async function stalkerVod(cred: StalkerCreds, ses: StalkerSession): Promise<VodItem[]> { return (await stalkerVodPartition(cred,ses)).vod; }
export async function stalkerSeries(cred: StalkerCreds, ses: StalkerSession): Promise<SeriesItem[]> {
  const [vodPart,nativePart]=await Promise.all([stalkerVodPartition(cred,ses), nativeStalkerSeries(cred,ses)]);
  const merged=new Map<string,SeriesItem>();
  for (const x of [...nativePart.items,...vodPart.fallbackSeries]) {
    const key=String((x as any).series_id || x.id || x.name); if (!merged.has(key)) merged.set(key,x);
  }
  return Array.from(merged.values());
}

function asEpisode(v:any, fallbackId:string) {
  const id=String(v?.id ?? v?.video_id ?? v?.episode_id ?? fallbackId);
  const ext=String(v?.container_extension || v?.file_type || "mp4").replace(/^\./, "") || "mp4";
  const cmd=String(v?.cmd || v?.url || `/media/file_${id}.${ext}`);
  return { ...v, id, title:String(v?.name || v?.title || `Bölüm ${v?.series_number || v?.episode || id}`), container_ext:ext, url:mediaCommand("series",cmd,"1") };
}
function isSeasonDescriptor(v:any):boolean { return truthyPortalFlag(v?.is_season) || (!!(v?.season_id ?? v?.season) && !v?.cmd && !v?.url && !v?.episode && !v?.series_number); }
function rowLooksEpisode(v:any): boolean {
  return !!(v?.cmd || v?.url) && (v?.episode !== undefined || v?.episode_id !== undefined || v?.series_number !== undefined || v?.season !== undefined || v?.season_number !== undefined || v?.season_id !== undefined);
}

export async function stalkerSeriesInfo(cred: StalkerCreds, ses: StalkerSession, seriesId: string): Promise<{ info:any; seasons:{season:string; episodes:any[]}[] }> {
  const grouped=new Map<string,any[]>(); let lastError:any=null;
  const addEpisode=(e:any, idx:number, forcedSeason?:string)=>{
    const season=String(forcedSeason ?? e?.season ?? e?.season_number ?? 1); const arr=grouped.get(season)||[]; arr.push(asEpisode(e,`${season}-${idx}`)); grouped.set(season,arr);
  };
  // Önce ayrı type=series kullanan portalları dene.
  // Explicit Record tipi, heterojen object literal dizisinin `string | undefined`
  // union olarak genişleyip stalkerOrderedList sözleşmesini bozmasını engeller.
  const seriesLookupVariants: Record<string,string>[] = [
    {series_id:String(seriesId)},
    {movie_id:String(seriesId)},
  ];
  for (const extra of seriesLookupVariants) {
    try {
      const rows=await stalkerOrderedList(cred,ses,"series",extra);
      if (rows.length) {
        for (let i=0;i<rows.length;i++) {
          const r=rows[i];
          if (Array.isArray(r?.series)) r.series.forEach((e:any,j:number)=>addEpisode(e,j,String(r?.season ?? r?.season_number ?? 1)));
          else if (rowLooksEpisode(r)) addEpisode(r,i);
        }
        if (grouped.size) return {info:{},seasons:Array.from(grouped.entries()).map(([season,episodes])=>({season,episodes}))};
      }
    } catch (e) { if (!(e instanceof StalkerCatalogUnsupportedError)) lastError=e; }
  }
  // Ministra VOD-series: movie_id -> season descriptors -> season_id -> episodes.
  let roots:any[]=[];
  try { roots=await stalkerOrderedList(cred,ses,"vod",{movie_id:String(seriesId),season_id:"0",episode_id:"0"}); }
  catch (e) { if (!(e instanceof StalkerCatalogUnsupportedError)) lastError=e; }
  if (!roots.length) {
    try { roots=await stalkerOrderedList(cred,ses,"vod",{movie_id:String(seriesId)}); }
    catch (e) { if (!(e instanceof StalkerCatalogUnsupportedError)) lastError=e; }
  }
  const descriptors=roots.filter(isSeasonDescriptor);
  if (descriptors.length) {
    for (let si=0;si<descriptors.length;si++) {
      const d=descriptors[si]; const seasonId=String(d?.season_id ?? d?.id ?? d?.season ?? si+1); const seasonName=String(d?.season ?? d?.season_number ?? si+1);
      let episodes:any[]=[];
      try { episodes=await stalkerOrderedList(cred,ses,"vod",{movie_id:String(seriesId),season_id:seasonId,episode_id:"0"}); }
      catch (e) { if (!(e instanceof StalkerCatalogUnsupportedError)) lastError=e; }
      episodes.filter(x=>!isSeasonDescriptor(x)).forEach((e,i)=>addEpisode(e,i,seasonName));
    }
  } else {
    roots.forEach((r,i)=>{
      if (Array.isArray(r?.series)) r.series.forEach((e:any,j:number)=>addEpisode(e,j,String(r?.season ?? r?.season_number ?? 1)));
      else if (rowLooksEpisode(r) || (roots.length === 1 && (r?.cmd || r?.url))) addEpisode(r,i);
    });
  }
  if (!grouped.size && lastError) throw lastError;
  return { info:{}, seasons:Array.from(grouped.entries()).sort((a,b)=>Number(a[0])-Number(b[0])).map(([season,episodes])=>({season,episodes})) };
}

export type StalkerCatalogDiagnostics = {
  live: "OK"|"EMPTY"|"ERROR";
  vod: "OK"|"EMPTY"|"UNSUPPORTED";
  seriesNative: "OK"|"EMPTY"|"UNSUPPORTED";
  seriesFromVod: number;
  warnings: string[];
};

async function retryCatalogPart<T>(label:string, fn:()=>Promise<T>):Promise<T> {
  let last:any;
  for (let i=0;i<2;i++) {
    try { return await fn(); }
    catch (e) { if (e instanceof StalkerCatalogUnsupportedError) throw e; last=e; if (i===0) await new Promise(r=>setTimeout(r,350)); }
  }
  void recordDiagnostic("catalog", "STALKER_CATALOG_PART_ERROR", { label, kind:last?.kind, status:last?.status, contentType:last?.contentType, redirected:last?.redirected, finalUrl:last?.finalUrl, message:String(last?.message || last) });
  const err:any=new Error(`${label} kataloğu alınamadı: ${last?.message || last}`); err.cause=last; err.kind=last?.kind; err.status=last?.status; err.contentType=last?.contentType; err.redirected=last?.redirected; err.finalUrl=last?.finalUrl; throw err;
}

export async function stalkerCatalog(cred: StalkerCreds, ses: StalkerSession): Promise<{channels:Channel[]; vod:VodItem[]; series:SeriesItem[]; diagnostics:StalkerCatalogDiagnostics}> {
  const catalogStarted = Date.now();
  void recordDiagnostic("catalog", "STALKER_CATALOG_START", { endpoint: ses.endpoint, profileError: ses.profileError || "" });
  let channels:Channel[]=[];
  let liveError="";
  try { channels=await retryCatalogPart("MAG Live",()=>stalkerChannels(cred,ses)); }
  catch (e:any) { liveError=String(e?.message || e); void recordDiagnostic("mag","STALKER_LIVE_PARTIAL_FAILURE",{message:liveError,status:e?.status,kind:e?.kind}); }
  let vodPart:VodPartition;
  let vodError="";
  try { vodPart=await retryCatalogPart("MAG VOD",()=>stalkerVodPartition(cred,ses)); }
  catch (e:any) { vodError=String(e?.message || e); vodPart={vod:[],fallbackSeries:[],supported:!(e instanceof StalkerCatalogUnsupportedError),rawCount:0,seriesFlagged:0}; void recordDiagnostic("mag","STALKER_VOD_PARTIAL_FAILURE",{message:vodError,status:e?.status,kind:e?.kind}); }
  let nativeSeries:{items:SeriesItem[];supported:boolean};
  let seriesError="";
  try { nativeSeries=await retryCatalogPart("MAG Series",()=>nativeStalkerSeries(cred,ses)); }
  catch (e:any) { seriesError=String(e?.message || e); nativeSeries={items:[],supported:!(e instanceof StalkerCatalogUnsupportedError)}; void recordDiagnostic("mag","STALKER_SERIES_PARTIAL_FAILURE",{message:seriesError,status:e?.status,kind:e?.kind}); }

  // type=series boş dönse bile VOD is_series/kategori fallback'i HER ZAMAN birleştirilir.
  const merged=new Map<string,SeriesItem>();
  for (const x of [...nativeSeries.items,...vodPart.fallbackSeries]) {
    const key=String((x as any).series_id || x.id || x.name); if (!merged.has(key)) merged.set(key,x);
  }
  const series=Array.from(merged.values());
  const warnings:string[]=[];
  if (!vodPart.supported) warnings.push("Portal VOD ordered-list endpointini desteklemiyor.");
  if (!nativeSeries.supported) warnings.push("Portal ayrı Series endpointini desteklemiyor; VOD is_series fallback kullanıldı.");
  if (liveError) warnings.push(`Canlı katalog alınamadı: ${liveError}`);
  if (vodError) warnings.push(`VOD katalog sorunu: ${vodError}`);
  if (seriesError) warnings.push(`Series katalog sorunu: ${seriesError}`);
  const diagnostics:StalkerCatalogDiagnostics={
    live:liveError?"ERROR":(channels.length?"OK":"EMPTY"),
    vod:!vodPart.supported?"UNSUPPORTED":(vodPart.vod.length?"OK":"EMPTY"),
    seriesNative:!nativeSeries.supported?"UNSUPPORTED":(nativeSeries.items.length?"OK":"EMPTY"),
    seriesFromVod:vodPart.fallbackSeries.length,
    warnings,
  };
  if (!channels.length && !vodPart.vod.length && !series.length && (liveError || vodError || seriesError)) {
    throw new Error(`MAG katalog alınamadı. ${[liveError,vodError,seriesError].filter(Boolean).join(" | ")}`);
  }
  console.info('[StalkerCatalog]' , {live:channels.length,vod:vodPart.vod.length,series:series.length,diagnostics});
  void recordDiagnostic("catalog", "STALKER_CATALOG_DONE", { elapsedMs: Date.now()-catalogStarted, live: channels.length, vod: vodPart.vod.length, series: series.length, diagnostics });
  return {channels,vod:vodPart.vod,series,diagnostics};
}

/** 5) CREATE_LINK — oynatma anında gerçek (geçici) adres. */
export async function stalkerCreateLink(
  cred: StalkerCreds,
  ses: StalkerSession,
  cmd: string,
  mediaType: "itv" | "vod" = "itv",
  series = ""
): Promise<string> {
  const data = await req(
    buildUrl(ses.endpoint, {
      type: mediaType,
      action: "create_link",
      cmd,
      series,
      forced_storage: "undefined",
      disable_ad: "0",
      download: "0",
    }),
    headersFor(cred, ses.token, ses.endpoint)
  );

  const raw = String(data?.js?.cmd || "");
  if (!raw) throw new Error("Portal yayın adresi vermedi (create_link boş).");

  // Yanıt "ffmpeg http://..." ya da "http://..." biçimindedir.
  const m = raw.match(/https?:\/\/\S+/);
  if (!m) throw new Error("Yayın adresi çözümlenemedi: " + raw.slice(0, 120));
  return m[0];
}

/** Tam oturum: handshake + profil. */
export async function stalkerLogin(
  cred: StalkerCreds,
  opts: { forceFresh?: boolean } = {}
): Promise<{ session: StalkerSession; profile: any }> {
  if (!opts.forceFresh) { const cached = getCachedSession(cred); if (cached) { void recordDiagnostic("catalog", "STALKER_SESSION_CACHE_HIT", { portal: cred.portal }); return cached; } }
  const started = Date.now();
  void recordDiagnostic("catalog", "STALKER_HANDSHAKE_START", { portal: cred.portal });
  const session = await stalkerHandshake(cred);
  void recordDiagnostic("catalog", "STALKER_HANDSHAKE_OK", { endpoint: session.endpoint, elapsedMs: Date.now()-started });
  let profile: any = null;
  try {
    profile = await stalkerProfile(cred, session);
    void recordDiagnostic("catalog", "STALKER_PROFILE_OK", { endpoint: session.endpoint, elapsedMs: Date.now()-started });
  } catch (e: any) {
    session.profileError = String(e?.message || e);
    void recordDiagnostic("catalog", "STALKER_PROFILE_ERROR", { endpoint: session.endpoint, message: session.profileError, status: e?.status, kind:e?.kind, contentType:e?.contentType, redirected:e?.redirected, finalUrl:e?.finalUrl });
    // Bazı eski Ministra/Stalker varyantları get_profile alanlarının bir kısmını
    // reddederken katalog çağrılarını kabul eder. Uyumluluğu bozmak yerine hata
    // session üzerinde taşınır; katalog da başarısız/boşsa kullanıcıya aşama bilgisi verilir.
  }
  session.profile = profile; cacheSession(cred, session, profile); return { session, profile };
}

/**
 * Oynatma adresini güvenle alır. Token süresi dolmuşsa BİR KEZ yeniden
 * oturum açıp tekrar dener; kullanıcı bu yenilemeyi fark etmez.
 */
export async function stalkerResolveStream(
  cred: StalkerCreds,
  ses: StalkerSession | null,
  cmd: string
): Promise<{ url: string; session: StalkerSession }> {
  const started = Date.now();
  let session = ses || getCachedSession(cred)?.session || null;
  const cacheHit = !!session;
  if (!session) session = (await stalkerLogin(cred)).session;
  const parsed = parseMediaCommand(cmd);
  try {
    const url = await stalkerCreateLink(cred, session, parsed.cmd, parsed.kind, parsed.series);
    void recordDiagnostic("player", "STALKER_RESOLVE_DONE", { elapsedMs: Date.now()-started, cacheHit, mediaType: parsed.kind });
    return { url, session };
  } catch (e: any) {
    const message = String(e?.message || e);
    void recordDiagnostic("player", "STALKER_RESOLVE_ERROR", { elapsedMs: Date.now()-started, cacheHit, message, status: e?.status });
    if (e?.status === 401 || e?.status === 403 || /token|auth/i.test(message)) {
      invalidateSession(cred);
      const fresh = await stalkerLogin(cred, { forceFresh: true });
      const url = await stalkerCreateLink(cred, fresh.session, parsed.cmd, parsed.kind, parsed.series);
      void recordDiagnostic("player", "STALKER_RESOLVE_REFRESHED", { elapsedMs: Date.now()-started, mediaType: parsed.kind });
      return { url, session: fresh.session };
    }
    throw e;
  }
}
