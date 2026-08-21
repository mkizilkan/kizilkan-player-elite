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
 *   2) get_profile      -> cihazı tanıt (ZORUNLU, atlanırsa liste boş gelir)
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

import type { Channel } from "@/src/types";

/** MAG250 kimliği. Portallar bunu bekler. */
const MAG_UA =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3";

/** Sağlayıcıya göre değişen portal yolları — sırayla denenir. */
const PORTAL_PATHS = [
  "/portal.php",
  "/stalker_portal/server/load.php",
  "/server/load.php",
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
}

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

function headersFor(cred: StalkerCreds, token?: string): Record<string, string> {
  const mac = normalizeMac(cred.mac);
  const h: Record<string, string> = {
    "User-Agent": MAG_UA,
    Referer: baseOf(cred.portal) + "/c/",
    Accept: "*/*",
    Cookie: `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=Europe/Istanbul`,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function req(url: string, headers: Record<string, string>, timeoutMs = 20000): Promise<any> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: c.signal });
    const text = await res.text();
    if (!res.ok) {
      const err: any = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch {
      const err: any = new Error("Portal geçersiz yanıt verdi (JSON değil)");
      err.raw = text.slice(0, 200);
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
  const base = baseOf(cred.portal);
  const errors: string[] = [];

  for (const path of PORTAL_PATHS) {
    const endpoint = base + path;
    try {
      const data = await req(
        buildUrl(endpoint, { type: "stb", action: "handshake", token: "", prehash: "0" }),
        headersFor(cred)
      );
      const token = data?.js?.token;
      if (token) return { token, endpoint };
      errors.push(`${path}: token yok`);
    } catch (e: any) {
      errors.push(`${path}: ${e?.message || e}`);
    }
  }

  throw new Error(
    "Portala bağlanılamadı. Denenen yollar:\n" + errors.join("\n") +
      "\n\nPortal adresini ve MAC'i kontrol edin."
  );
}

/** 2) GET_PROFILE — ZORUNLU. Atlanırsa çoğu portal boş liste döndürür. */
export async function stalkerProfile(cred: StalkerCreds, ses: StalkerSession): Promise<any> {
  const mac = normalizeMac(cred.mac);
  const data = await req(
    buildUrl(ses.endpoint, {
      type: "stb",
      action: "get_profile",
      hd: "1",
      ver: "ImageDescription: 0.2.18-r23-250; ImageDate: Wed Aug 29 10:49:53 EEST 2018; PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c",
      device_id: cred.deviceId || "",
      device_id2: cred.deviceId || "",
      sn: cred.serial || "",
      stb_type: "MAG250",
      client_type: "STB",
      image_version: "218",
      video_out: "hdmi",
      num_banks: "2",
      mac,
      auth_second_step: "0",
      hw_version: "1.7-BD-00",
      not_valid_token: "0",
    }),
    headersFor(cred, ses.token)
  );
  return data?.js || null;
}

/** 3) KATEGORİLER */
export async function stalkerGenres(cred: StalkerCreds, ses: StalkerSession): Promise<Map<string, string>> {
  const data = await req(
    buildUrl(ses.endpoint, { type: "itv", action: "get_genres" }),
    headersFor(cred, ses.token)
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

  const data = await req(
    buildUrl(ses.endpoint, { type: "itv", action: "get_all_channels" }),
    headersFor(cred, ses.token),
    120000
  );

  const raw = data?.js?.data;
  const list = Array.isArray(raw) ? raw : [];

  return list.map((c: any) => ({
    id: `stalker-${c.id}`,
    name: c.name || "Kanal",
    group: genres.get(String(c.tv_genre_id)) || "Genel",
    logo: c.logo
      ? String(c.logo).startsWith("http")
        ? c.logo
        : baseOf(cred.portal) + "/stalker_portal/misc/logos/320/" + c.logo
      : null,
    // DİKKAT: bu cmd DOĞRUDAN OYNATILAMAZ; create_link ile çözülür.
    url: String(c.cmd || ""),
    epg_channel_id: c.xmltv_id || undefined,
    tvg_id: c.xmltv_id || undefined,
    source: "stalker",
    stream_id: String(c.id),
  })) as Channel[];
}

/** 5) CREATE_LINK — oynatma anında gerçek (geçici) adres. */
export async function stalkerCreateLink(
  cred: StalkerCreds,
  ses: StalkerSession,
  cmd: string
): Promise<string> {
  const data = await req(
    buildUrl(ses.endpoint, {
      type: "itv",
      action: "create_link",
      cmd,
      series: "",
      forced_storage: "undefined",
      disable_ad: "0",
      download: "0",
    }),
    headersFor(cred, ses.token)
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
  cred: StalkerCreds
): Promise<{ session: StalkerSession; profile: any }> {
  const session = await stalkerHandshake(cred);
  const profile = await stalkerProfile(cred, session).catch(() => null);
  session.profile = profile;
  return { session, profile };
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
  let session = ses;
  if (!session) session = (await stalkerLogin(cred)).session;

  try {
    const url = await stalkerCreateLink(cred, session, cmd);
    return { url, session };
  } catch (e: any) {
    if (e?.status === 401 || e?.status === 403 || /token/i.test(String(e?.message))) {
      const fresh = await stalkerLogin(cred);
      const url = await stalkerCreateLink(cred, fresh.session, cmd);
      return { url, session: fresh.session };
    }
    throw e;
  }
}
