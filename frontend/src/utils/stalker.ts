/**
 * KIZILKAN PLAYER — Stalker / MAG Portal (CİHAZ İÇİ)
 * Dosya  : frontend/src/utils/stalker.ts
 * Sürüm  : v16.12.2 (PCAP-first + learned migration + rate-limit-aware interoperability)
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
 *   • v15.2.25: varsayılan cihaz MAG254; MAG250 yalnız uyumluluk fallback'idir
 *   • Başarılı endpoint/profil öğrenilir; 401/403/429/512 durumunda path fırtınası kesilir
 *   • Live katalog ilk güvenli commit için ayrı alınabilir; VOD/Series enrichment ayrıdır
 *   • User-Agent / X-User-Agent / get_profile stb_type aynı cihaz profiliyle tutarlı kalır
 * ===========================================================================
 */

import type { AccountInfo, Channel, SeriesItem, VodItem } from "@/src/types";
import { markTask, recordDiagnostic } from "@/src/utils/diagnostics";
import { storage } from "@/src/utils/storage";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";

const startDiagnosticTask = (label: string, meta: Record<string, any> = {}) =>
  typeof markTask === "function" ? markTask(label, meta) : (() => {});

const MAG250_UA =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3";
const MAG254_UA =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG254 stbapp ver: 4 rev: 2721 Safari/533.3";
/** v16.12.0 — 30.08.2026 PCAPdroid kaydında HKPREMIUM tarafından kabul edilen gerçek istemci kimliği. */
const MAG320_UA =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG320 stbapp ver: 2 rev: 250 Safari/533.3";

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
  deviceModel?: "MAG320" | "MAG254" | "MAG250";
}


export interface StalkerPlaybackContext {
  url: string;
  headers: Record<string, string>;
  session: StalkerSession;
  mediaType: "itv" | "vod";
  refreshed: boolean;
}

export interface StalkerSession {
  token: string;
  endpoint: string;
  profile?: any;
  profileError?: string;
  profileVariant?: string;
  random?: string;
  /**
   * v16.1.0 — TİP TAKMA ADI KULLANILIR.
   * Burada birleşim ELLE yazılmıştı; "golden" profili eklenince bu alan
   * güncellenmediği için CI'da TS2322 hatası çıktı (yerelde node_modules
   * olmadığı için tam tip kontrolü çalışmıyordu). Artık MagCompatProfile'a
   * bağlı: yeni bir profil eklendiğinde burası kendiliğinden uyumlu kalır.
   */
  compatProfile?: MagCompatProfile;
  /** v16.12.0: başarılı handshake query biçimi; learned-first tekrarında kullanılır. */
  handshakeVariant?: string;
}

const SESSION_TTL_MS = 15 * 60 * 1000;
const stalkerSessionCache = new Map<string, { session: StalkerSession; profile: any; at: number }>();

// v15.2.24: Aynı portal/MAC için pahalı MAG katalog indirmesini tek uçuşta birleştir.
// Telemetride 29 MB get_all_channels yanıtının aynı oturumda tekrar tekrar indirildiği
// kanıtlandığı için hem eşzamanlı istek deduplication hem kısa ömürlü katalog cache'i kullanılır.
const CATALOG_CACHE_TTL_MS = 3 * 60 * 1000;
type StalkerCatalogResult = { channels:Channel[]; vod:VodItem[]; series:SeriesItem[]; diagnostics:StalkerCatalogDiagnostics };
export type StalkerCatalogProgress = {
  stage: "live" | "vod" | "series" | "final";
  message: string;
  page?: number;
  loaded?: number;
  total?: number;
};
type StalkerCatalogOptions = {
  forceFresh?: boolean;
  liveOnly?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: StalkerCatalogProgress) => void;
};
const stalkerCatalogCache = new Map<string, { result: StalkerCatalogResult; at: number }>();
const stalkerCatalogInFlight = new Map<string, Promise<StalkerCatalogResult>>();

// v16.14.8 PERFORMANCE: create_link çıktıları çok kısa süreli bellek önbelleği.
// Amaç aynı kanala hızlı geri dönüşte gereksiz 0.5-4 sn resolver gecikmesini
// kaldırmaktır. Stalker linkleri geçici olduğundan TTL özellikle kısa tutulur;
// forceFresh/401/403/444/456/520 recovery invalidateSession üzerinden temizler.
const PLAYBACK_LINK_CACHE_TTL_MS = 8_000;
const PLAYBACK_LINK_CACHE_MAX = 24;
const stalkerPlaybackLinkCache = new Map<string, { url: string; at: number }>();

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
function invalidateSession(cred: StalkerCreds) {
  const key = sessionKey(cred);
  stalkerSessionCache.delete(key);
  for (const catalogKey of [...stalkerCatalogCache.keys()]) if (catalogKey.startsWith(key + "|")) stalkerCatalogCache.delete(catalogKey);
  for (const playbackKey of [...stalkerPlaybackLinkCache.keys()]) if (playbackKey.startsWith(key + "|")) stalkerPlaybackLinkCache.delete(playbackKey);
}
function catalogKey(cred: StalkerCreds, ses: StalkerSession, scope = "full"): string {
  return `${sessionKey(cred)}|${String(ses.endpoint || "").toLowerCase()}|${scope}`;
}
function emitCatalogProgress(opts: StalkerCatalogOptions | undefined, progress: StalkerCatalogProgress) {
  try { opts?.onProgress?.(progress); } catch {}
}

/**
 * v16.1.0 — YAYIN ADRESİ ÖNEK TEMİZLEYİCİ
 * ---------------------------------------------------------------------------
 * Stalker portalları komutu "ffmpeg http://...", "auto http://...",
 * "extension http://..." gibi ÖNEKLİ döndürebilir. Bu değer temizlenmeden
 * oynatıcıya verilirse Media3 şu hatayı verir (cihaz kaydında 5 kez görüldü):
 *     java.net.MalformedURLException: no protocol: ffmpeg http://...
 * create_link yolu öneği zaten ayıklıyordu, fakat kanal listesine HAM cmd
 * yazıldığı için (url alanı) doğrudan oynatılan yollarda hata çıkıyordu.
 */
export function stripStreamPrefix(raw: string): string {
  const v = String(raw || "").trim();
  if (!v) return "";
  const m = v.match(/https?:\/\/\S+/);        // ilk gerçek adresi al
  if (m) return m[0];
  // Adres yoksa (ör. saklı komut biçimi) değeri OLDUĞU GİBİ bırak.
  return v;
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
      /**
       * v16.8.0 — /c/ PORTALLARINDA ADAY LİSTESİ GENİŞLETİLDİ.
       * Cihaz kaydı (29.08): hkpremiumtv.xyz:2095/c/ için yalnız 3 yol
       * denenmiş; /portal.php "Authorization failed." vermiş, diğer ikisi 404.
       * /server/load.php ve /c/portal.php HİÇ DENENMEMİŞTİ — oysa daha önceki
       * kayıtlarda /server/load.php yanıt veriyordu. Ministra kurulumlarında
       * doğru uç nokta bunlardan biri olabiliyor.
       */
      push(origin + "/portal.php");
      push(origin + "/c/portal.php");
      push(origin + "/server/load.php");
      push(origin + "/stalker_portal/server/load.php");
      push(origin + "/c/server/load.php");
      push(origin + "/portal.php?");
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

/**
 * v16.1.0 — "ALTIN PROFİL" (golden)
 * ---------------------------------------------------------------------------
 * KANIT: v9.6.0'da MAG portalı ÇALIŞIYORDU (SURUM-NOTU-v9.7.0.md, kullanıcı
 * testi: "MAG düzenle/yenile çalışıyor"). O sürümün stalker.ts'i 270 satırdı ve
 * isteği SADE idi. Bugünkü 1250+ satırlık istemci portaldan 403 alıyor;
 * hatanın geldiği profil "mag254-raw", yani v9.6.0'da çalışan yapılandırmanın
 * TAM TERSİ (MAG254 kimliği + HAM mac).
 *
 * v9.6.0'da OLMAYAN ama bugün gönderilen başlıklar:
 *   • X-User-Agent      • Accept-Language      • Accept-Encoding
 *   • timezone KODLANMIŞ (Europe%2FIstanbul)  <- v9.6.0'da ham: Europe/Istanbul
 *
 * "golden" profili v9.6.0'ın başlıklarını BİREBİR üretir ve listenin BAŞINDA
 * denenir. Diğer profiller yedek olarak korunur (regresyon yok).
 */
type MagDeviceModel = "MAG320" | "MAG254" | "MAG250";
type MagCompatProfile = "pcap320-minimal" | "wire250" | "fulldevice" | "fulldevice-macid" | "golden" | "mag254-encoded" | "mag254-raw" | "mag250-encoded" | "mag250-raw";
const MAG_COMPAT_PROFILES: MagCompatProfile[] = ["pcap320-minimal", "wire250", "fulldevice", "fulldevice-macid", "golden", "mag254-encoded", "mag254-raw", "mag250-encoded", "mag250-raw"];
const MAG_LEARNED_KEY = "kizilkan.mag.compat.v15225"; // v16.12.0: mevcut öğrenilmiş portal profillerini kaybetme; şema geriye uyumlu.

type LearnedMagCompat = { endpoint:string; profile:MagCompatProfile; model:MagDeviceModel; handshakeVariant?:string; at:number; failures:number };
const learnedCompatMemory = new Map<string, LearnedMagCompat>();

function compatModel(profile: MagCompatProfile): MagDeviceModel {
  if (profile === "pcap320-minimal") return "MAG320";
  if (profile === "wire250") return "MAG250";   // v16.10.0: gerçek paket kaydı
  if (profile === "fulldevice" || profile === "fulldevice-macid") return "MAG254";   // v16.7.0/16.8.0
  if (profile === "golden") return "MAG250";   // v16.1.0: v9.6.0 kimliği
  return profile.startsWith("mag254") ? "MAG254" : "MAG250";
}
function compatEncoded(profile: MagCompatProfile): boolean {
  if (profile === "pcap320-minimal") return true;
  if (profile === "wire250") return false;     // v16.10.0: HAM mac (paket kaydındaki gibi)
  if (profile === "fulldevice" || profile === "fulldevice-macid") return true;   // v16.7.0/16.8.0
  if (profile === "golden") return true;       // v16.1.0: mac HER ZAMAN kodlanır
  return profile.endsWith("-encoded");
}
function preferredCompatProfiles(cred: StalkerCreds, learned?: LearnedMagCompat | null): MagCompatProfile[] {
  /**
   * v16.1.0 — "golden" HER ZAMAN İLK SIRADA.
   * v9.6.0'da portalın kabul ettiği birebir istek budur; önce o denenir.
   * Diğer profiller yedek olarak korunur (mevcut davranış bozulmaz).
   * NOT: golden listeye eklenmezse headersFor'daki altın dal HİÇ çalışmaz —
   * bu fonksiyon profilleri belirleyen tek yerdir.
   */
  /**
   * v16.12.0 — PCAP-KANITLI ÖNCELİK.
   * 30.08.2026 HKPREMIUM kaydında çalışan istemci MAG320 + Ethernet +
   * encoded MAC + Europe/Paris + no-JsHttp handshake kullandı. Bu profil
   * sağlayıcı adına bağlı değildir; genel, minimal MAG320 uyumluluk yoludur.
   * Learned profil varsa yine en öne alınır.
   */
  const ordered: MagCompatProfile[] = cred.deviceModel === "MAG250"
    ? ["pcap320-minimal","wire250","mag250-raw","mag250-encoded","golden","mag254-raw","mag254-encoded","fulldevice","fulldevice-macid"]
    : ["pcap320-minimal","mag254-raw","mag254-encoded","wire250","golden","mag250-raw","mag250-encoded","fulldevice","fulldevice-macid"];
  /**
   * v16.12.2 — PCAP-first kesin öncelik.
   * v16.12.1 cihaz logunda eski learned=golden kaydı MAG320 PCAP profilinin
   * önüne geçti ve temiz ilk handshake bozuldu. Artık kanıtlı minimal MAG320
   * HER ZAMAN ilk profildir; learned profil (farklıysa) ikinci sırada korunur.
   */
  if (learned?.profile && learned.profile !== "pcap320-minimal" && ordered.includes(learned.profile)) {
    return ["pcap320-minimal", learned.profile, ...ordered.filter(x => x !== "pcap320-minimal" && x !== learned.profile)];
  }
  return ordered;
}
function learnedCompatKey(cred: StalkerCreds): string {
  return `${baseOf(cred.portal).toLowerCase()}|${normalizeMac(cred.mac)}`;
}
type LearnedMagCompatStore = Record<string, LearnedMagCompat>;

function parseLearnedCompatStore(raw: string | null): LearnedMagCompatStore {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: LearnedMagCompatStore = {};
    for (const [key, candidate] of Object.entries(parsed as Record<string, unknown>)) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const value = candidate as Partial<LearnedMagCompat>;
      if (
        typeof value.endpoint === "string" && value.endpoint.length > 0 &&
        typeof value.profile === "string" && MAG_COMPAT_PROFILES.includes(value.profile as MagCompatProfile) &&
        (value.model === "MAG320" || value.model === "MAG254" || value.model === "MAG250") &&
        typeof value.at === "number" && Number.isFinite(value.at) &&
        typeof value.failures === "number" && Number.isFinite(value.failures)
      ) {
        out[key] = {
          endpoint: value.endpoint,
          profile: value.profile as MagCompatProfile,
          model: value.model,
          at: value.at,
          handshakeVariant: typeof value.handshakeVariant === "string" ? value.handshakeVariant : undefined,
          failures: Math.max(0, Math.trunc(value.failures)),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function readLearnedCompatStore(): Promise<LearnedMagCompatStore> {
  const raw = await storage.getItem(MAG_LEARNED_KEY, "");
  return parseLearnedCompatStore(raw);
}

async function writeLearnedCompatStore(all: LearnedMagCompatStore): Promise<void> {
  await storage.setItem(MAG_LEARNED_KEY, JSON.stringify(all));
}

async function loadLearnedCompat(cred: StalkerCreds): Promise<LearnedMagCompat | null> {
  const key=learnedCompatKey(cred);
  const memory=learnedCompatMemory.get(key);
  if (memory) return memory;
  try {
    const all = await readLearnedCompatStore();
    const hit=all[key];
    if (hit?.endpoint && hit?.profile) { learnedCompatMemory.set(key,hit); return hit; }
  } catch {}
  return null;
}
async function saveLearnedCompat(cred: StalkerCreds, value: LearnedMagCompat): Promise<void> {
  const key=learnedCompatKey(cred);
  learnedCompatMemory.set(key,value);
  try {
    const all=await readLearnedCompatStore();
    all[key]=value;
    const entries=Object.entries(all).sort((a,b)=>(b[1]?.at||0)-(a[1]?.at||0)).slice(0,24);
    await writeLearnedCompatStore(Object.fromEntries(entries));
  } catch {}
}
async function markLearnedFailure(cred: StalkerCreds, learned: LearnedMagCompat | null): Promise<void> {
  if (!learned) return;
  const key=learnedCompatKey(cred);
  const next={...learned,failures:Number(learned.failures||0)+1,at:Date.now()};
  if (next.failures >= 3) {
    learnedCompatMemory.delete(key);
    try {
      const all=await readLearnedCompatStore();
      delete all[key];
      await writeLearnedCompatStore(all);
    } catch {}
  } else await saveLearnedCompat(cred,next);
}

/**
 * v16.7.0 — TAM CİHAZ ÇEREZİ (MAG portal "Authorization failed." kök çözümü)
 * ---------------------------------------------------------------------------
 * CİHAZ KANITI (29.08 kaydı, v16.3.0'da eklediğim gövde kaydı sayesinde):
 *     action: handshake · HTTP 200 · text/javascript · 21 bayt
 *     snippet: "Authorization failed."
 * ve bu hata TÜM profillerde (golden dahil) çıkıyor.
 *
 * Sebep: bizim çerezimiz yalnız `mac; stb_lang; timezone` gönderiyordu. Gerçek
 * MAG kutuları çerezte cihaz parmak izinin TAMAMINI taşır:
 *     adid, device_id, device_id2, hw_version, sn, mac, stb_lang, timezone
 * Anti-korsan katmanı olan portallar bu alanları handshake AŞAMASINDA
 * doğrular; eksikse "Authorization failed." döner. (Kullanıcının aynı MAC ve
 * portalla IPTV Loader Pro'da bağlanabilmesi, farkın istemcide olduğunu
 * gösteriyordu.)
 *
 * Kimlik türetimi asenkron (md5/sha256) olduğu, headersFor ise eşzamanlı
 * çalıştığı için kimlik istekten ÖNCE hesaplanıp burada önbelleğe alınır.
 */
const identityCache = new Map<string, {sn:string; deviceId:string; deviceId2:string; signatureLegacy:string; signatureModern:string; hwVersion2:string; adid:string}>();

function identityKey(cred: StalkerCreds): string {
  return `${normalizeMac(cred.mac)}|${cred.serial || ""}|${cred.deviceId || ""}`;
}

/**
 * Kimliği hesaplayıp önbelleğe alır. İstek göndermeden ÖNCE çağrılmalı.
 *
 * v16.8.0 — SERİDEN BAĞIMSIZ VARYANT DA HAZIRLANIR.
 * derivedMagIdentity'de device_id = sha256(serial) olduğu için, kullanıcının
 * girdiği seri numarası TÜM cihaz parmak izini belirliyor. Seri gerçek MAG
 * kutusununkiyle uyuşmuyorsa portal parmak izini tanımayıp reddedebiliyor.
 * Bu yüzden ikinci bir kimlik daha üretilir: seri YOK SAYILIP yalnız MAC'ten
 * türetilen kimlik. "fulldevice-macid" profili bunu kullanır.
 */
export async function primeMagIdentity(cred: StalkerCreds): Promise<void> {
  // Seriden bağımsız ikinci kimlik (aynı MAC, serial yok)
  const macOnlyCred = { ...cred, serial: undefined, deviceId: undefined } as StalkerCreds;
  const macOnlyKey = identityKey(macOnlyCred);
  if (!identityCache.has(macOnlyKey)) {
    try {
      const id2 = await derivedMagIdentity(macOnlyCred);
      const C2 = await import("expo-crypto");
      const adid2 = String(await C2.digestStringAsync(C2.CryptoDigestAlgorithm.MD5, String(id2.sn) + normalizeMac(cred.mac))).toLowerCase();
      identityCache.set(macOnlyKey, { ...id2, adid: adid2 });
    } catch { /* üretilemezse bu varyant sade çereze düşer */ }
  }
  const key = identityKey(cred);
  if (identityCache.has(key)) return;
  try {
    const id = await derivedMagIdentity(cred);
    // adid: gerçek MAG kutularında cihaza özel bir tanımlayıcı. md5 yardımcı
    // fonksiyonu derivedMagIdentity içinde YEREL olduğundan burada expo-crypto
    // doğrudan kullanılır (aynı algoritma).
    const Crypto = await import("expo-crypto");
    const adid = String(
      await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, String(id.sn) + normalizeMac(cred.mac))
    ).toLowerCase();
    identityCache.set(key, { ...id, adid });
  } catch { /* kimlik üretilemezse tam çerez atlanır, eski davranış sürer */ }
}

/** Tam MAG çerezi; kimlik yoksa sade çereze düşer. macOnly=true ise seri yok sayılır. */
function fullDeviceCookie(cred: StalkerCreds, encodedMac: string, tz: string, macOnly = false): string {
  const lookupCred = macOnly ? ({ ...cred, serial: undefined, deviceId: undefined } as StalkerCreds) : cred;
  const id = identityCache.get(identityKey(lookupCred));
  if (!id) return `mac=${encodedMac}; stb_lang=en; timezone=${tz}`;
  const sn = macOnly ? id.sn : (cred.serial || id.sn);
  return [
    `adid=${id.adid}`,
    `debug=1`,
    `device_id=${id.deviceId}`,
    `device_id2=${id.deviceId2}`,
    `hw_version=${id.hwVersion2 || "1.7-BD-00"}`,
    `mac=${encodedMac}`,
    `sn=${sn}`,
    `stb_lang=en`,
    `timezone=${tz}`,
  ].join("; ");
}

function headersFor(cred: StalkerCreds, token?: string, endpoint?: string, profile: MagCompatProfile = "mag254-encoded"): Record<string, string> {
  const mac = normalizeMac(cred.mac);
  const encodedMac = encodeURIComponent(mac);
  const model=compatModel(profile);
  const encoded=compatEncoded(profile);
  /**
   * v16.1.0 — ALTIN PROFİL: v9.6.0'ın BİREBİR başlıkları.
   * Fazladan hiçbir başlık gönderilmez (X-User-Agent / Accept-Language /
   * Accept-Encoding YOK), timezone HAM eğik çizgiyle yazılır ve Referer
   * her zaman "<host>/c/" olur — v9.6.0'da portal bu istekle çalışıyordu.
   */
  /**
   * v16.7.0 — TAM CİHAZ PROFİLİ.
   * Gerçek MAG kutusunun gönderdiği çerezin tamamı (adid, device_id,
   * device_id2, hw_version, sn, mac) + MAG254 kimliği. Portal handshake
   * aşamasında cihaz parmak izi doğruluyorsa çalışan tek profil budur.
   */
  /**
   * v16.10.0 — "WIRE250": GERÇEK MAG250 PAKET KAYDININ BİREBİR KOPYASI
   * -------------------------------------------------------------------------
   * Kaynak: sahada alınmış bir MAG250 kutusunun handshake isteği (HTTP 206 ile
   * token dönmüş, yani portal kabul etmiş). Bizim isteğimizde OLMAYAN üç şey
   * vardı ve bazı portallar bunları doğruluyor olabilir:
   *   1) Range: bytes=0-            (kutu daima gönderiyor; yanıt 206 geliyor)
   *   2) Accept-Charset: UTF-8,*;q=0.8
   *   3) Cookie'de HAM mac (iki nokta üst üste kodlanmamış)
   * Ayrıca X-User-Agent'ta "Link: WiFi" (bizde Ethernet yazıyordu) ve
   * Cache-Control/Connection başlıkları da kayıtta mevcut.
   */
  if (profile === "pcap320-minimal") {
    /**
     * v16.12.0 — PCAP gerçek-wire profili.
     * Host/Connection fetch/OkHttp tarafından yönetilir; uygulama yalnız
     * protokol açısından anlamlı ve PCAP'ta gözlenen başlıkları üretir.
     */
    const p: Record<string, string> = {
      "User-Agent": MAG320_UA,
      Accept: "application/json",
      Referer: baseOf(cred.portal) + "/c/",
      "X-User-Agent": "Model: MAG320; Link: Ethernet",
      Cookie: `mac=${encodedMac}; stb_lang=en; timezone=Europe%2FParis;`,
      "Accept-Encoding": "gzip",
    };
    if (token) p.Authorization = `Bearer ${token}`;
    return p;
  }

  if (profile === "wire250") {
    const w: Record<string, string> = {
      "User-Agent": MAG250_UA,
      Accept: "*/*",
      Referer: baseOf(cred.portal) + "/c/",
      Cookie: `mac=${mac}; stb_lang=en; timezone=Europe/Kiev`,
      "Accept-Charset": "UTF-8,*;q=0.8",
      "X-User-Agent": "Model: MAG250; Link: WiFi",
      Range: "bytes=0-",
      "Cache-Control": "no-cache",
    };
    if (token) w.Authorization = `Bearer ${token}`;
    return w;
  }

  if (profile === "fulldevice" || profile === "fulldevice-macid") {
    // v16.8.0: -macid varyantı kullanıcının girdiği seriyi YOK SAYAR (parmak izi
    // yalnız MAC'ten türetilir); yanlış seri girilmişse kurtarır.
    const macOnly = profile === "fulldevice-macid";
    const f: Record<string, string> = {
      "User-Agent": MAG254_UA,
      Referer: baseOf(cred.portal) + "/c/",
      Accept: "*/*",
      "X-User-Agent": "Model: MAG254; Link: WiFi",
      Cookie: fullDeviceCookie(cred, encodedMac, "Europe/Istanbul", macOnly),
    };
    if (token) f.Authorization = `Bearer ${token}`;
    return f;
  }

  if (profile === "golden") {
    const g: Record<string, string> = {
      "User-Agent": MAG250_UA,
      Referer: baseOf(cred.portal) + "/c/",
      Accept: "*/*",
      Cookie: `mac=${encodedMac}; stb_lang=en; timezone=Europe/Istanbul`,
    };
    if (token) g.Authorization = `Bearer ${token}`;
    return g;
  }

  const h: Record<string, string> = {
    "User-Agent": model === "MAG320" ? MAG320_UA : model === "MAG254" ? MAG254_UA : MAG250_UA,
    Referer: refererFor(cred, endpoint),
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "X-User-Agent": `Model: ${model}; Link: Ethernet`,
    Cookie: `mac=${encoded ? encodedMac : mac}; stb_lang=en; timezone=Europe%2FIstanbul`,
  };
  if (encoded) h["Accept-Encoding"] = "gzip, deflate";
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}


function normalizePlaybackHost(hostname: string): string {
  return String(hostname || "").trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function isIpLiteral(hostname: string): boolean {
  const h = normalizePlaybackHost(hostname);
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) || h.includes(":");
}

/**
 * Credential taşıma sınırı bilerek sıkıdır: yalnız aynı host veya doğrudan
 * parent/subdomain ilişkisi. "son iki label aynı" yaklaşımı co.uk gibi
 * public-suffix alanlarında ilgisiz sitelere credential sızdırabileceği için
 * kullanılmaz. Farklı CDN hostuna yalnız zararsız uyumluluk header'ları gider.
 */
function normalizedOriginPort(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : "";
}
function isTrustedPlaybackTarget(endpoint: string, playbackUrl: string): boolean {
  try {
    const portal = new URL(endpoint);
    const target = new URL(playbackUrl);
    if (portal.protocol !== target.protocol) return false;
    // v16.12.0 PCAP SECURITY/FIX: aynı hostname üzerindeki farklı port ayrı origin'dir.
    // HKPREMIUM kaydında portal :2095 iken medya :8080'e geçiyor ve Loader
    // Bearer/MAC cookie taşımıyor. Hassas portal kimliği ancak aynı portta kalabilir.
    if (normalizedOriginPort(portal) !== normalizedOriginPort(target)) return false;
    const p = normalizePlaybackHost(portal.hostname);
    const t = normalizePlaybackHost(target.hostname);
    if (!p || !t) return false;
    if (p === t) return true;
    if (isIpLiteral(p) || isIpLiteral(t)) return false;
    return t.endsWith(`.${p}`) || p.endsWith(`.${t}`);
  } catch {
    return false;
  }
}

/**
 * create_link sonrası gerçek medya isteğinin MAG cihaz kimliğini kaybetmesini
 * önler. Hassas token/MAC yalnız portal ile aynı sağlayıcı ailesindeki hedefe
 * gönderilir; üçüncü taraf CDN/redirect hostuna körlemesine credential sızdırılmaz.
 */
function playbackHeadersFor(cred: StalkerCreds, ses: StalkerSession, playbackUrl: string): Record<string, string> {
  const apiHeaders = headersFor(cred, ses.token, ses.endpoint, ses.compatProfile);
  const trusted = isTrustedPlaybackTarget(ses.endpoint, playbackUrl);
  // v16.12.0 PCAP FIX: MAG320-minimal oturumunda medya farklı origin'e
  // taşındığında MAG API parmak izini de zorlamıyoruz. Native player kendi UA'sını
  // kullanır; bu, kayıttaki Exo/Loader medya isteğiyle aynı güvenlik sınırıdır.
  const pcapDetachedMedia = ses.compatProfile === "pcap320-minimal" && !trusted;
  const out: Record<string, string> = pcapDetachedMedia ? { Accept: "*/*" } : {
    "User-Agent": apiHeaders["User-Agent"],
    "X-User-Agent": apiHeaders["X-User-Agent"],
    Referer: apiHeaders.Referer,
    Accept: "*/*",
  };
  if (trusted) {
    if (apiHeaders.Cookie) out.Cookie = apiHeaders.Cookie;
    if (apiHeaders.Authorization) out.Authorization = apiHeaders.Authorization;
  }
  void recordDiagnostic("player", "STALKER_PLAYBACK_CONTEXT", {
    targetTrusted: trusted,
    targetHost: (() => { try { return new URL(playbackUrl).host; } catch { return ""; } })(),
    portalHost: (() => { try { return new URL(ses.endpoint).host; } catch { return ""; } })(),
    headerNames: Object.keys(out).sort(),
    hasAuthorization: !!out.Authorization,
    hasCookie: !!out.Cookie,
  });
  return out;
}

type ReqOptions = { timeoutMs?: number; signal?: AbortSignal; allowNon2xxParsed?: (parsed:any, status:number)=>boolean; postForm?: boolean };
function parseStalkerBody(text:string): { parsed:any|null; bodyKind:"json"|"html"|"empty"|"other" } {
  const trimmed=String(text||"").replace(/^\uFEFF/,"").trim();
  if (!trimmed) return {parsed:null,bodyKind:"empty"};
  if (/^</.test(trimmed)) return {parsed:null,bodyKind:"html"};
  try { return {parsed:JSON.parse(trimmed),bodyKind:"json"}; } catch {}
  const first=trimmed.indexOf("{"), last=trimmed.lastIndexOf("}");
  if (first>=0 && last>first) {
    try { return {parsed:JSON.parse(trimmed.slice(first,last+1)),bodyKind:"json"}; } catch {}
  }
  return {parsed:null,bodyKind:"other"};
}
function sanitizeBodySnippet(text:string): string {
  return String(text||"").replace(/mac=[^;&\s<]+/ig,"mac=<redacted>").replace(/token["'=:\s]+[^,;}\s<]+/ig,"token=<redacted>").replace(/\s+/g," ").trim().slice(0,128);
}


function magPcapShapeParity(nr:any, requestMeta:{action:string;type:string}) {
  const isHandshake = requestMeta.action === 'handshake';
  const seq = String(nr.wireHeaderSequence || '').toLowerCase().split(',').map((x:string)=>x.trim()).filter(Boolean);
  const has = (name:string) => seq.includes(name.toLowerCase());
  const checks:Record<string,boolean> = {
    http11: /http[\/_-]?1[._]1/i.test(String(nr.httpProtocol || '')),
    userAgent: String(nr.userAgent || '') === MAG320_UA,
    cookie: !!nr.cookiePresent,
    cookieTrailingSemicolon: !!nr.cookieTrailingSemicolon,
    encodedMac: !!nr.cookieHasEncodedMac,
    refererC: (()=>{ try { return new URL(String(nr.referer||'')).pathname === '/c/'; } catch { return false; } })(),
    xUserAgent: /Model:\s*MAG320/i.test(String(nr.xUserAgent || '')),
    acceptJson: /application\/json/i.test(String(nr.acceptHeader || '')),
    keepAlive: /keep-alive/i.test(String(nr.connectionHeader || '')),
    gzip: /gzip/i.test(String(nr.acceptEncodingHeader || '')),
    headerPresence: ['user-agent','cookie','referer','x-user-agent','accept','connection','accept-encoding'].every(has),
    handshakeNoAuthorization: !isHandshake || !nr.authorizationPresent,
  };
  const failed = Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
  return { checks, failed, parity: failed.length === 0, profile: isHandshake ? 'HKPREMIUM_PCAP_HANDSHAKE' : 'MAG320_PCAP_SHAPE' };
}

async function req(url: string, headers: Record<string, string>, options: number | ReqOptions = 20000): Promise<any> {
  const opts:ReqOptions=typeof options === "number" ? {timeoutMs:options} : (options || {});
  const timeoutMs=opts.timeoutMs ?? 20000;
  const c = new AbortController();
  const abortFromParent=()=>c.abort();
  if (opts.signal) {
    if (opts.signal.aborted) c.abort();
    else opts.signal.addEventListener("abort",abortFromParent,{once:true});
  }
  const t = setTimeout(() => c.abort(), timeoutMs);
  const startedAt = Date.now();
  const requestMeta = (() => {
    try {
      const u = new URL(url);
      return { path:u.pathname,type:u.searchParams.get("type")||"",action:u.searchParams.get("action")||"",page:u.searchParams.get("p")||"",host:u.host };
    } catch { return { path:"",type:"",action:"",page:"",host:"" }; }
  })();
  try {
    let res:any;
    // v16.13.8 — PCAP/Loader MAG320 profili Android'de RN fetch yerine native
    // OkHttp exact transport kullanır. Böylece Cookie/UA/X-UA/Referer'ın native
    // request üzerinde gerçekten var olduğu güvenli fingerprint telemetrisiyle
    // kanıtlanır. Native modül yoksa eski fetch yolu regresyonsuz korunur.
    const useNativeExact = !opts.postForm && KizilkanNativeCore.available
      && headers["User-Agent"] === MAG320_UA
      && /timezone=Europe%2FParis/i.test(String(headers.Cookie || ""));
    if (useNativeExact) {
      try {
        const nr:any = await KizilkanNativeCore.magExactRequest(url, headers, timeoutMs);
        if (!nr) throw new Error("Native MAG transport boş yanıt döndürdü");
        const headerMap = new Map<string,string>([["content-type",String(nr.contentType||"")]]);
        res = {
          status:Number(nr.status||0), ok:Number(nr.status||0)>=200 && Number(nr.status||0)<300,
          url:String(nr.finalUrl||url), redirected:Number(nr.redirectCount||0)>0,
          headers:{get:(name:string)=>headerMap.get(String(name).toLowerCase())||""},
          text:async()=>String(nr.body||""),
        };
        const wireParity = magPcapShapeParity(nr, requestMeta);
        void recordDiagnostic("mag","MAG_NATIVE_WIRE",{
          ...requestMeta,transport:"NATIVE_OKHTTP",status:Number(nr.status||0),elapsedMs:Number(nr.elapsedMs||0),
          pcapShapeProfile:wireParity.profile,pcapShapeParity:wireParity.parity,pcapShapeFailed:wireParity.failed,
          redirectCount:Number(nr.redirectCount||0),wireHeaderNames:String(nr.wireHeaderNames||""),
          wireHeaderSequence:String(nr.wireHeaderSequence||""),httpProtocol:String(nr.httpProtocol||""),
          connectionKey:String(nr.connectionKey||""),connectionReused:!!nr.connectionReused,routeAddressFamily:String(nr.routeAddressFamily||""),
          tlsVersion:String(nr.tlsVersion||""),cipherSuite:String(nr.cipherSuite||""),
          addressFamilies:String(nr.addressFamilies||""),contentEncoding:String(nr.contentEncoding||""),
          bodyBytes:Number(nr.bodyBytes||0),connectionHeader:String(nr.connectionHeader||""),
          acceptHeader:String(nr.acceptHeader||""),acceptEncodingHeader:String(nr.acceptEncodingHeader||""),
          cookieLength:Number(nr.cookieLength||0),cookieTrailingSemicolon:!!nr.cookieTrailingSemicolon,
          cookieHasEncodedMac:!!nr.cookieHasEncodedMac,
          cookiePresent:!!nr.cookiePresent,cookieFingerprint:String(nr.cookieFingerprint||""),
          authorizationPresent:!!nr.authorizationPresent,authorizationFingerprint:String(nr.authorizationFingerprint||""),
          userAgentProfile:String(nr.userAgent||"")===MAG320_UA?"MAG320-PCAP":"other",
          refererPath:(()=>{try{return new URL(String(nr.referer||"")).pathname}catch{return""}})(),
          xUserAgentModel:/Model:\s*([^;]+)/i.exec(String(nr.xUserAgent||""))?.[1]||"",
        });
      } catch (cause:any) {
        const err:any=new Error(`Native MAG transport failed: ${String(cause?.message||cause)}`); err.kind="NETWORK"; throw err;
      }
    } else
    /**
     * v16.9.0 — POST YEDEĞİ + ÇEREZ TELEMETRİSİ
     * Bazı Xtream/OpenXC MAG köprüleri parametreleri yalnız $_POST içinden
     * okur; GET query'yi görmezden gelip düz metin "Authorization failed."
     * döndürebiliyor. opts.postForm=true ise aynı başlıklarla POST edilir.
     * (404 durumunda POST denemenin anlamı yoktur; çağıran taraf karar verir.)
     *
     * Ayrıca Cookie başlığının GERÇEKTEN gönderilip gönderilmediği kaydedilir:
     * React Native/OkHttp elle yazılan Cookie'yi bazen düşürür ve portal MAC'i
     * göremeyip tam bu 21 baytlık reddi döndürür. MAC değerinin KENDİSİ
     * kaydedilmez, yalnız var/yok ve biçim bilgisi.
     */
    try {
      if ((opts as any).postForm) {
        const u = new URL(url);
        const body = u.searchParams.toString();
        res = await fetch(u.origin + u.pathname, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal: c.signal,
        });
      } else {
        res = await fetch(url, { headers, signal: c.signal });
      }
    }
    catch (cause:any) {
      const parentAbort=!!opts.signal?.aborted;
      const err:any=new Error(cause?.name==="AbortError"
        ? (parentAbort ? "İşlem kullanıcı/üst seviye tarafından iptal edildi" : `Bağlantı zaman aşımı (${timeoutMs} ms)`)
        : `Network request failed: ${String(cause?.message || cause || "bilinmeyen ağ hatası")}`);
      err.kind=cause?.name==="AbortError" ? (parentAbort ? "CANCELLED" : "TIMEOUT") : "NETWORK";
      err.causeName=String(cause?.name||"");
      void recordDiagnostic("mag","STALKER_HTTP_TRANSPORT_ERROR",{...requestMeta,elapsedMs:Date.now()-startedAt,timeoutMs,kind:err.kind,causeName:err.causeName,message:err.message});
      throw err;
    }
    const contentType=String(res.headers?.get?.("content-type")||"");
    const finalUrl=String((res as any).url||url);
    const redirected=!!(res as any).redirected;
    const text=await res.text();
    const decoded=parseStalkerBody(text);
    void recordDiagnostic("mag","STALKER_HTTP_RESPONSE",{
      ...requestMeta,status:Number(res.status||0),ok:!!res.ok,elapsedMs:Date.now()-startedAt,
      bytes:text.length,contentType:contentType.split(";")[0]||"",redirected,parsedJs:!!decoded.parsed?.js,bodyKind:decoded.bodyKind,
      finalPath:(()=>{try{return new URL(finalUrl).pathname}catch{return""}})(),
    });
    if (res.ok && decoded.parsed != null) return decoded.parsed;
    if (!res.ok && decoded.parsed != null && opts.allowNon2xxParsed?.(decoded.parsed,Number(res.status||0))) {
      void recordDiagnostic("mag","STALKER_HTTP_COMPAT_ACCEPTED",{...requestMeta,status:Number(res.status||0),bodyKind:decoded.bodyKind});
      return decoded.parsed;
    }
    if (!res.ok) {
      const err:any=new Error(`HTTP ${res.status}${contentType?` · ${contentType.split(";")[0]}`:""}`);
      err.status=res.status; err.kind="HTTP"; err.contentType=contentType; err.finalUrl=finalUrl; err.redirected=redirected; err.bodyKind=decoded.bodyKind;
      err.snippet=sanitizeBodySnippet(text);
      void recordDiagnostic("mag","STALKER_HTTP_REJECTED",{...requestMeta,status:Number(res.status||0),bodyKind:decoded.bodyKind,snippet:err.snippet});
      throw err;
    }
    const kind=decoded.bodyKind==="html" ? "HTML" : "NON_JSON";
    const err:any=new Error(`Portal JSON değil · HTTP ${res.status}${contentType?` · ${contentType.split(";")[0]}`:""}${redirected?" · yönlendirme var":""}`);
    err.kind=kind; err.status=res.status; err.contentType=contentType; err.finalUrl=finalUrl; err.redirected=redirected; err.bodyKind=decoded.bodyKind;
    /**
     * v16.3.0 — GÖVDE ÖRNEĞİ KAYDA EKLENDİ (telemetri boşluğu)
     * Bu hatada şimdiye kadar YALNIZ boyut ve içerik türü kaydediliyordu
     * ("21 bayt · text/javascript"), gövdenin KENDİSİ görünmüyordu; bu yüzden
     * portalın ne dediği anlaşılamıyordu. Artık ilk 200 karakter kaydedilir ve
     * kullanıcıya gösterilen mesaja da eklenir — portal "Authorization failed."
     * gibi bir metin döndürüyorsa doğrudan görülür.
     */
    err.snippet=sanitizeBodySnippet(text);
    err.message=`${err.message}${err.snippet?` · yanıt: ${err.snippet}`:""}`;
    void recordDiagnostic("mag","STALKER_HTTP_PARSE_ERROR",{...requestMeta,elapsedMs:Date.now()-startedAt,status:res.status,kind,bytes:text.length,contentType:contentType.split(";")[0]||"",redirected,snippet:err.snippet});
    throw err;
  } finally {
    clearTimeout(t);
    if (opts.signal) opts.signal.removeEventListener("abort",abortFromParent);
  }
}

/**
 * v16.11.0 — JsHttpRequest ARTIK ZORUNLU DEĞİL
 * ---------------------------------------------------------------------------
 * Sahada alınmış gerçek MAG250 paket kaydında handshake şöyleydi:
 *     GET /stalker_portal/server/load.php?type=stb&action=handshake
 *     -> HTTP 206, Content-Type: application/json, token döndü
 * Yani JsHttpRequest parametresi YOKTU ve yanıt düz JSON'du.
 * Bizim isteğimizde bu parametre HER ZAMAN ekleniyordu ve portal
 * "text/javascript" + "Authorization failed." döndürüyordu. Bu, JsHttpRequest
 * sarmalayıcı katmanının devrede olduğunu ve hatayı o katmanın ürettiğini
 * gösteriyor. Artık parametresiz biçim de denenebiliyor.
 */
function buildUrl(endpoint: string, params: Record<string, string>, withJsHttp = true): string {
  const q = new URLSearchParams(withJsHttp ? { ...params, JsHttpRequest: "1-xml" } : { ...params }).toString();
  return `${endpoint}?${q}`;
}

function handshakeRejectedStatus(status:number): boolean { return status===401 || status===403 || status===429 || status===512; }
function endpointPath(endpoint:string):string { try{return new URL(endpoint).pathname}catch{return endpoint} }

/**
 * v16.8.0 — HANDSHAKE PARAMETRE VARYANTLARI
 * ---------------------------------------------------------------------------
 * Bazı Ministra kurulumları isteği "token" parametresi BOŞ olarak gönderildiği
 * için reddedip düz metin "Authorization failed." döndürüyor. Gerçek MAG
 * kutuları ilk handshake'te bu parametreyi hiç göndermeyebiliyor.
 * Cihaz kaydı (29.08) bu yanıtı tüm profillerde gösterdiğinden, tek bir
 * parametre biçimine bağlı kalmıyoruz: sırayla üç biçim denenir ve ilk
 * çalışan kullanılır. Uç nokta başına ek istek sayısı sınırlıdır.
 */
type HandshakeParamVariant = {label:string; params:Record<string,string>; post?:boolean; noJs?:boolean};
const HANDSHAKE_PARAM_VARIANTS: HandshakeParamVariant[] = [
  // v16.11.0: EN BAŞTA gerçek MAG paket kaydının birebir biçimi — JsHttpRequest YOK.
  { label: "wire-nojs",            params: { type:"stb", action:"handshake" }, noJs: true },
  { label: "wire-nojs-token",      params: { type:"stb", action:"handshake", token:"" }, noJs: true },
  { label: "token-empty-prehash0", params: { type:"stb", action:"handshake", token:"", prehash:"0" } },
  { label: "bare",                 params: { type:"stb", action:"handshake" } },
  { label: "token-empty",          params: { type:"stb", action:"handshake", token:"" } },
  // v16.9.0: GET reddedilirse aynı başlıklarla POST (bazı MAG köprüleri
  // parametreleri yalnız $_POST içinden okur).
  { label: "post-bare",            params: { type:"stb", action:"handshake" }, post: true },
  { label: "post-token-empty",     params: { type:"stb", action:"handshake", token:"", prehash:"0" }, post: true },
];

type HandshakeAttemptGuard = {
  networkAttempts:number;
  authRejects:number;
  lastAttemptAt:number;
  rejectionFingerprints:Map<string,number>;
};

const HANDSHAKE_MAX_NETWORK_ATTEMPTS = 12; // v16.13.5: bounded fallback genişletildi; sonsuz döngü yok
const HANDSHAKE_MAX_AUTH_REJECTS = 8; // v16.13.5: AUTH_REJECT kalıcı/erken self-ban değildir
const HANDSHAKE_MIN_SPACING_MS = 650; // v16.13.5: portal 429 vermiyorsa gereksiz bekleme azaltıldı
const HANDSHAKE_COOLDOWN_MS = 5 * 60_000;
const MAG_HANDSHAKE_GUARD_KEY = "kizilkan.mag.guard.v16122"; // v16.12.2: eski auth-only cooldown state yeni sürümü kilitlemesin.
const handshakeInFlight = new Map<string, Promise<StalkerSession>>();
const handshakeCooldownMemory = new Map<string, number>();

function handshakeProtectionKey(cred:StalkerCreds): string {
  return `${baseOf(cred.portal).toLowerCase()}|${normalizeMac(cred.mac)}`;
}
type HandshakeGuardStore = Record<string,{cooldownUntil:number;at:number}>;
async function loadHandshakeCooldown(key:string): Promise<number> {
  const memory=handshakeCooldownMemory.get(key)||0;
  if (memory>Date.now()) return memory;
  try {
    const raw=await storage.getItem(MAG_HANDSHAKE_GUARD_KEY, "");
    const parsed=raw ? JSON.parse(raw) as HandshakeGuardStore : {};
    const until=Number(parsed?.[key]?.cooldownUntil||0);
    if (until>Date.now()) { handshakeCooldownMemory.set(key,until); return until; }
  } catch {}
  return 0;
}
async function persistHandshakeCooldown(key:string, until:number): Promise<void> {
  handshakeCooldownMemory.set(key,until);
  try {
    const raw=await storage.getItem(MAG_HANDSHAKE_GUARD_KEY, "");
    const parsed:HandshakeGuardStore=raw ? JSON.parse(raw) : {};
    parsed[key]={cooldownUntil:until,at:Date.now()};
    const compact=Object.fromEntries(Object.entries(parsed).filter(([,v])=>Number(v?.cooldownUntil||0)>Date.now()-HANDSHAKE_COOLDOWN_MS).sort((a,b)=>(b[1]?.at||0)-(a[1]?.at||0)).slice(0,24));
    await storage.setItem(MAG_HANDSHAKE_GUARD_KEY,JSON.stringify(compact));
  } catch {}
}
async function clearHandshakeCooldown(key:string): Promise<void> {
  handshakeCooldownMemory.delete(key);
  try {
    const raw=await storage.getItem(MAG_HANDSHAKE_GUARD_KEY, "");
    if (!raw) return;
    const parsed:HandshakeGuardStore=JSON.parse(raw);
    if (parsed?.[key]) { delete parsed[key]; await storage.setItem(MAG_HANDSHAKE_GUARD_KEY,JSON.stringify(parsed)); }
  } catch {}
}
function isRateLimitRejection(e:any): boolean {
  const status=Number(e?.status||0);
  const text=String(e?.snippet||e?.message||"").toLowerCase();
  return status===429 || /too many requests|rate.?limit|retry[- ]?after|request limit/.test(text);
}
function isAuthRejection(e:any): boolean {
  if (isRateLimitRejection(e)) return false;
  const status=Number(e?.status||0);
  const text=String(e?.snippet||e?.message||"").toLowerCase();
  return status===401 || status===403 || status===512 || /authorization failed|not authorized|unauthori[sz]ed/.test(text);
}
function rejectionFingerprint(endpoint:string, e:any): string {
  return `${endpointPath(endpoint)}|${Number(e?.status||0)}|${sanitizeBodySnippet(String(e?.snippet||e?.message||"")).toLowerCase()}`.slice(0,240);
}
async function paceHandshakeAttempt(guard:HandshakeAttemptGuard): Promise<void> {
  if (guard.networkAttempts >= HANDSHAKE_MAX_NETWORK_ATTEMPTS) {
    const err:any=new Error("MAG güvenli deneme bütçesi doldu; portalı korumak için ek istek gönderilmedi.");
    err.kind="MAG_SAFE_BUDGET"; throw err;
  }
  if (guard.authRejects >= HANDSHAKE_MAX_AUTH_REJECTS) {
    const err:any=new Error("Portal ardışık yetkilendirme reddi verdi; bu işlem için kontrollü uyumluluk deneme sınırına ulaşıldı. Yeni manuel deneme engellenmez.");
    err.kind="MAG_AUTH_GOVERNOR"; throw err;
  }
  // v16.12.1 — sabit 450 ms yerine auth reddi arttıkça kademeli bekleme.
  // İlk isteği geciktirme; sonraki isteklerde en az 1.25 sn ve her auth reddinde
  // +1.25 sn ek bekleme uygula. Böylece aynı MAC/portal birkaç saniyede
  // bombardımana tutulmaz; yine de meşru fallback yolları tamamen kapanmaz.
  const adaptiveSpacing = HANDSHAKE_MIN_SPACING_MS * Math.min(3, Math.max(1, Math.ceil((guard.authRejects + 1) / 2)));
  const wait=Math.max(0,adaptiveSpacing-(Date.now()-guard.lastAttemptAt));
  if (wait>0) await new Promise<void>(resolve=>setTimeout(resolve,wait));
  guard.lastAttemptAt=Date.now(); guard.networkAttempts+=1;
}

function variantsForProfile(profile:MagCompatProfile, learnedVariant?:string): HandshakeParamVariant[] {
  if (profile === "pcap320-minimal") return [HANDSHAKE_PARAM_VARIANTS[0]];
  const ordered=learnedVariant
    ? [...HANDSHAKE_PARAM_VARIANTS.filter(v=>v.label===learnedVariant), ...HANDSHAKE_PARAM_VARIANTS.filter(v=>v.label!==learnedVariant)]
    : HANDSHAKE_PARAM_VARIANTS;
  // Eski varyantlar korunur; global güvenli bütçe hangilerinin gerçekten ağa çıkacağını sınırlar.
  return ordered;
}

function handshakeRequestFingerprint(targetUrl:string, hdrs:Record<string,string>, compatProfile:MagCompatProfile, variant:HandshakeParamVariant) {
  let queryKeys:string[]=[];
  try { queryKeys=Array.from(new URL(targetUrl).searchParams.keys()).sort(); } catch {}
  const cookie=String(hdrs.Cookie||"");
  return {
    compatProfile, variant:variant.label,
    method: variant.post ? "POST" : "GET",
    jsHttpPresent: queryKeys.includes("JsHttpRequest"),
    tokenQueryPresent: queryKeys.includes("token"),
    prehashPresent: queryKeys.includes("prehash"),
    queryKeys,
    userAgentProfile: hdrs["User-Agent"]===MAG320_UA ? "MAG320-PCAP" : hdrs["User-Agent"]===MAG250_UA ? "MAG250" : hdrs["User-Agent"]===MAG254_UA ? "MAG254" : "other",
    accept: hdrs.Accept||"",
    acceptEncoding: hdrs["Accept-Encoding"]||"",
    refererPath: (()=>{ try { return new URL(hdrs.Referer||"").pathname; } catch { return ""; } })(),
    xUserAgentModel: /Model:\s*([^;]+)/i.exec(hdrs["X-User-Agent"]||"")?.[1]||"",
    cookieMacShape: /mac=[^;]*%3A/i.test(cookie) ? "encoded" : /mac=[^;]*:/i.test(cookie) ? "raw" : "none",
    cookieHasStbLang: /(?:^|;\s*)stb_lang=/i.test(cookie),
    cookieTimezone: /(?:^|;\s*)timezone=([^;]+)/i.exec(cookie)?.[1]||"",
    cookieHasDeviceId: /(?:^|;\s*)device_id=/i.test(cookie),
    headerNames: Object.keys(hdrs).sort(),
  };
}

async function handshakeAttempt(
  cred:StalkerCreds, endpoint:string, compatProfile:MagCompatProfile, guard:HandshakeAttemptGuard, learnedVariant?:string
):Promise<StalkerSession|null> {
  let lastErr:any=null;
  for (const variant of variantsForProfile(compatProfile, learnedVariant)) {
    try {
      await paceHandshakeAttempt(guard);
      const hdrs=headersFor(cred,undefined,endpoint,compatProfile);
      void recordDiagnostic("mag","STALKER_HANDSHAKE_TRY",{
        endpoint, compatProfile, variant: variant.label,
        method: variant.post ? "POST" : "GET",
        jsHttp: variant.noJs ? "off" : "on",
        attempt: guard.networkAttempts, maxAttempts: HANDSHAKE_MAX_NETWORK_ATTEMPTS,
        hdrSessionPresent: !!hdrs.Cookie,
        hdrSessionShape: hdrs.Cookie ? (hdrs.Cookie.includes("device_id") ? "fulldevice" : (hdrs.Cookie.includes("%3A") ? "encoded" : "raw")) : "none",
        hdrCount: Object.keys(hdrs).length,
      });
      const targetUrl=buildUrl(endpoint,variant.params,!variant.noJs);
      void recordDiagnostic("mag","STALKER_HANDSHAKE_REQUEST_FINGERPRINT",handshakeRequestFingerprint(targetUrl,hdrs,compatProfile,variant));
      const data=await req(
        targetUrl,
        hdrs,
        {timeoutMs:20000, postForm: !!variant.post} as any,
      );
      const token=String(data?.js?.token||"").trim();
      if (token) {
        void recordDiagnostic("mag","STALKER_HANDSHAKE_VARIANT_OK",{endpoint,compatProfile,variant:variant.label,attempt:guard.networkAttempts});
        return {token,endpoint,random:primitiveString(data?.js?.random),compatProfile,handshakeVariant:variant.label} as StalkerSession;
      }
    } catch (e:any) {
      lastErr=e;
      if (e?.kind === "MAG_SAFE_BUDGET" || e?.kind === "MAG_AUTH_GOVERNOR" || e?.kind === "MAG_RATE_LIMIT") throw e;
      const status=Number(e?.status||0);
      if (isRateLimitRejection(e)) {
        e.kind="MAG_RATE_LIMIT";
        void recordDiagnostic("mag","STALKER_HANDSHAKE_RATE_LIMIT",{endpoint,compatProfile,variant:variant.label,status,message:String(e?.snippet||e?.message||"").slice(0,160)});
        throw e;
      }
      if (isAuthRejection(e)) {
        const fp=rejectionFingerprint(endpoint,e);
        const seen=(guard.rejectionFingerprints.get(fp)||0)+1;
        guard.rejectionFingerprints.set(fp,seen);
        guard.authRejects+=1;
        void recordDiagnostic("mag","STALKER_HANDSHAKE_AUTH_REJECT",{endpoint,compatProfile,variant:variant.label,authRejects:guard.authRejects,duplicateCount:seen});
        // Aynı red cevabını aynı profil içinde farklı query biçimleriyle bombardımana tutma.
        if (seen>=2 || compatProfile === "pcap320-minimal") break;
        continue;
      }
      const snip=String(e?.snippet||e?.message||"").toLowerCase();
      if (status===404) throw e;
      if (!/authorization|auth|json değil|non_json/.test(snip)) throw e;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

/** 1) HANDSHAKE — v16.13.10: MAG320 PCAP/Loader Exact varsayılan; MAG254/MAG250 yalnız compatibility fallback. */
async function stalkerHandshakeInternal(cred: StalkerCreds): Promise<StalkerSession> {
  const finishTask=startDiagnosticTask("mag:handshake",{portal:cred.portal});
  const errors:string[]=[];
  const guard:HandshakeAttemptGuard={networkAttempts:0,authRejects:0,lastAttemptAt:0,rejectionFingerprints:new Map()};
  try {
    /**
     * v16.7.0: Cihaz kimliğini İSTEKTEN ÖNCE hesapla.
     * headersFor eşzamanlı çalıştığı için tam çerez (adid/device_id/sn) ancak
     * önbellek doluysa üretilebilir. Bu satır olmadan "fulldevice" profili
     * sessizce sade çereze düşer ve düzeltme etkisiz kalır.
     */
    await primeMagIdentity(cred);
    const learned=await loadLearnedCompat(cred);
    const all=portalCandidates(cred.portal);
    const plan:string[]=[];
    const push=(x?:string)=>{if(x && !plan.includes(x)) plan.push(x)};
    // v16.12.2: temiz ilk deneme kullanıcının/primer portal endpoint'inde başlar.
    // Eski learned endpoint korunur fakat primer endpoint'in önüne geçemez.
    push(all[0]);
    push(learned?.endpoint);
    /**
     * v16.8.0: Plan 3 uç noktayla sınırlıydı; doğru uç nokta 4-5. sırada
     * kalırsa HİÇ denenmiyordu (cihaz kaydında tam olarak bu oldu). Sınır 6'ya
     * çıkarıldı — her uç nokta yine tek deneme alır, IP güvenliği korunur.
     */
    for (const x of all) { if (plan.length>=6) break; push(x); }
    const profiles=preferredCompatProfiles(cred,learned);
    void recordDiagnostic("catalog","STALKER_HANDSHAKE_PLAN",{
      strategy:learned?"pcap-first-learned-second":"pcap-first-bounded",candidateCount:plan.length,
      firstPath:endpointPath(plan[0]||""),preferredProfile:profiles[0],defaultModel:cred.deviceModel||"MAG320",
    });

    for (let ei=0; ei<plan.length; ei++) {
      const endpoint=plan[ei], label=endpointPath(endpoint), attemptAt=Date.now();
      void recordDiagnostic("catalog","STALKER_ENDPOINT_ATTEMPT",{endpoint,path:label,index:ei});
      let endpointRejected=false;
      for (let pi=0; pi<profiles.length; pi++) {
        /**
         * v16.9.0 — PROFİL LİMİTİ GENİŞLETİLDİ (kritik).
         * Eski satır: ilk uç noktada 3, sonrakilerde 2 profil deneniyordu.
         * Sonuç: HAM MAC kullanan profiller (mag254-raw / mag250-raw) fiilen
         * HİÇ çalışmıyordu — cihaz kaydında her uç noktada yalnız "golden" ve
         * "fulldevice" görünüyor. Portal çerezde ham MAC bekliyorsa bunu asla
         * deneyemiyorduk.
         * Artık gerçekten YANIT VEREN uç noktalarda (HTTP 200) tüm profiller
         * denenir; 404 dönen uç noktalarda erken çıkılır (aşağıdaki
         * endpointRejected mantığı zaten bunu yapıyor).
         */
        if (pi >= (ei===0 ? profiles.length : 4)) break;
        const compatProfile=profiles[pi], profileAttemptAt=Date.now();
        void recordDiagnostic("catalog","STALKER_COMPAT_ATTEMPT",{endpoint,path:label,compatProfile,model:compatModel(compatProfile)});
        try {
          const session=await handshakeAttempt(cred,endpoint,compatProfile,guard, learned?.profile===compatProfile ? learned.handshakeVariant : undefined);
          if (session) {
            await saveLearnedCompat(cred,{endpoint,profile:compatProfile,model:compatModel(compatProfile),handshakeVariant:session.handshakeVariant,at:Date.now(),failures:0});
            void recordDiagnostic("catalog","STALKER_COMPAT_OK",{endpoint,path:label,compatProfile,elapsedMs:Date.now()-profileAttemptAt});
            void recordDiagnostic("catalog","STALKER_ENDPOINT_OK",{endpoint,path:label,elapsedMs:Date.now()-attemptAt,compatProfile,model:compatModel(compatProfile)});
            return session;
          }
          errors.push(`${label}/${compatProfile}: token yok`);
          void recordDiagnostic("catalog","STALKER_COMPAT_ERROR",{endpoint,path:label,compatProfile,elapsedMs:Date.now()-profileAttemptAt,kind:"NO_TOKEN"});
        } catch (e:any) {
          if (e?.kind === "MAG_SAFE_BUDGET" || e?.kind === "MAG_AUTH_GOVERNOR" || e?.kind === "MAG_RATE_LIMIT") throw e;
          errors.push(`${label}/${compatProfile}: ${String(e?.message||e)}`);
          void recordDiagnostic("catalog","STALKER_COMPAT_ERROR",{endpoint,path:label,compatProfile,elapsedMs:Date.now()-profileAttemptAt,kind:e?.kind,status:e?.status,bodyKind:e?.bodyKind,message:String(e?.message||e)});
          // v16.12.2: learned profil auth reddi alırsa confidence/failure sayacı gerçekten düşsün.
          // v16.12.1'de HTTP 200 + Authorization failed bu noktada learned kaydı bayatlatmıyordu.
          if (learned?.profile===compatProfile && isAuthRejection(e)) await markLearnedFailure(cred,learned);
          if (handshakeRejectedStatus(Number(e?.status||0))) {
            endpointRejected=true;
            if (pi>=1) break;
          }
        }
      }
      const learnedEndpoint = endpoint===learned?.endpoint;
      if (learnedEndpoint && endpointRejected) await markLearnedFailure(cred,learned);
      // Öğrenilmiş endpoint bayatlamış olabilir; kullanıcı path'ine bir şans ver.
      // Kullanıcının/primer path'in kendisi reddedilirse aynı hostta geniş taramayı durdur.
      if (ei===0 && endpointRejected && (!learnedEndpoint || endpoint===all[0])) {
        void recordDiagnostic("catalog","STALKER_HANDSHAKE_STOPPED",{reason:"HTTP_REJECT",path:label,statusClass:"401/403/429/512"});
        throw new Error(`Portal bu MAG isteğini reddetti (${errors.at(-1)||"HTTP ret"}). Aynı host üzerinde geniş endpoint taraması güvenlik nedeniyle durduruldu.`);
      }
    }
    /**
     * v16.11.0 — ANLAŞILIR HATA MESAJI.
     * Eskiden 30+ satırlık "yol/profil: hata" dökümü basılıyordu; kullanıcı
     * için okunaksızdı ve 404'ler (o panelde var olmayan yollar) asıl sorunu
     * gizliyordu. Artık ÖZET verilir: hangi uç noktalar gerçekten yanıt verdi,
     * portal ne dedi ve kullanıcı ne yapabilir. Tam döküm kayıtta zaten var.
     */
    const live = errors.filter(e => /HTTP 200/.test(e));
    const authFail = live.filter(e => /Authorization failed/i.test(e));
    const livePaths = Array.from(new Set(live.map(e => (e.split("/").slice(0,4).join("/") || "").split(":")[0]).filter(Boolean)));
    if (authFail.length > 0) {
      throw new Error(
        "Portal isteği reddetti (HTTP 200 · \"Authorization failed\").\n\n" +
        `Portal bulundu ve yanıt verdi (${livePaths.slice(0,3).join(", ") || "/portal.php"}), ` +
        `güvenli deneme bütçesindeki cihaz profilleri aynı cevabı aldı.\n\n` +
        "Olası nedenler:\n" +
        "• MAC bu portala kayıtlı değil veya başka bir cihaza kilitli\n" +
        "• Aynı MAC şu an başka bir uygulamada açık — o uygulamayı kapatıp tekrar deneyin\n" +
        "• Portal bu istemciyi tanımıyor (sağlayıcıdan MAC'in yetkilendirilmesini isteyin)\n\n" +
        "Not: 404 dönen yollar bu panelde mevcut değildir, sorunun sebebi onlar değil."
      );
    }
    throw new Error("Portala bağlanılamadı.\n"+errors.slice(0,6).join("\n")+(errors.length>6?`\n… (+${errors.length-6} deneme)`:"")+"\n\nPortal adresini ve MAC'i kontrol edin.");
  } finally { finishTask(); }
}

/**
 * v16.12.2 — BAN-SAFE SINGLE-FLIGHT + RATE-LIMIT-AWARE COOLDOWN.
 * Aynı portal/MAC için eşzamanlı handshake çağrıları tek network uçuşunu paylaşır.
 * Authorization failed mevcut zinciri güvenli bütçede durdurur; 5 dakikalık
 * kalıcı cooldown yalnız gerçek rate-limit (örn. HTTP 429 / açık rate-limit mesajı)
 * halinde uygulanır.
 */
export async function stalkerHandshake(cred: StalkerCreds): Promise<StalkerSession> {
  const key=handshakeProtectionKey(cred);
  const cooldownUntil=await loadHandshakeCooldown(key);
  if (cooldownUntil>Date.now()) {
    const seconds=Math.max(1,Math.ceil((cooldownUntil-Date.now())/1000));
    throw new Error(`Portal koruma bekleme süresi aktif (${seconds} sn). Ban/rate-limit riskini azaltmak için yeni handshake gönderilmedi.`);
  }
  const existing=handshakeInFlight.get(key);
  if (existing) return existing;
  const task=stalkerHandshakeInternal(cred).then(async session=>{
    await clearHandshakeCooldown(key);
    return session;
  }).catch(async (e:any)=>{
    /**
     * v16.12.2 — uzun persistent cooldown yalnız GERÇEK rate-limit sinyalinde.
     * HTTP 200 + "Authorization failed." mevcut deneme zincirini güvenli biçimde
     * durdurabilir fakat kullanıcıyı 5 dakika kilitlemez. Böylece manuel retry
     * yeni bir kontrollü PCAP-first handshake başlatabilir.
     */
    if (e?.kind === "MAG_RATE_LIMIT") {
      await persistHandshakeCooldown(key,Date.now()+HANDSHAKE_COOLDOWN_MS);
      void recordDiagnostic("mag","STALKER_HANDSHAKE_COOLDOWN",{durationMs:HANDSHAKE_COOLDOWN_MS,reason:"MAG_RATE_LIMIT"});
    }
    throw e;
  }).finally(()=>{
    if (handshakeInFlight.get(key)===task) handshakeInFlight.delete(key);
  });
  handshakeInFlight.set(key,task);
  return task;
}

/** 2) GET_PROFILE — portal varyantlarına kontrollü uyumluluk. */
type StalkerProfileVariant = { label: string; params: Record<string,string>; noJs?: boolean };

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

function baseProfileParams(mac:string, model:"MAG250"|"MAG254"="MAG254"): Record<string,string> {
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

function initialProfileVariants(cred:StalkerCreds, preferredModel:MagDeviceModel="MAG320"): StalkerProfileVariant[] {
  const mac=normalizeMac(cred.mac);
  if (preferredModel === "MAG320") {
    // PCAP: GET /portal.php?action=get_profile&type=stb — JsHttpRequest ve fingerprint query yok.
    return [{label:"MAG320-pcap-minimal",params:{type:"stb",action:"get_profile"},noJs:true}];
  }
  const mag254=baseProfileParams(mac,"MAG254");
  const mag250=baseProfileParams(mac,"MAG250");
  const mag254Variants:StalkerProfileVariant[]=[{
    label:"MAG254-explicit",
    params:{...mag254,num_banks:"1",hw_version:"2.6-IB-00",sn:cred.serial||"",device_id:cred.deviceId||"",device_id2:cred.deviceId||"",signature:"",client_type:"STB",video_out:"hdmi"},
  },{
    label:"MAG254-legacy",
    params:{...mag254,num_banks:"1",hw_version:"2.6-IB-00",sn:cred.serial||"",device_id:"",device_id2:"",signature:""},
  }];
  const mag250Variants:StalkerProfileVariant[]=[{
    label:"MAG250-explicit",
    params:{...mag250,sn:cred.serial||"",device_id:cred.deviceId||"",device_id2:cred.deviceId||"",client_type:"STB",video_out:"hdmi"},
  },{
    label:"MAG250-legacy-minimal",
    params:{...mag250,num_banks:"1",sn:cred.serial||"",device_id:"",device_id2:"",signature:""},
  }];
  return preferredModel==="MAG250" ? [...mag250Variants,...mag254Variants] : [...mag254Variants,...mag250Variants];
}

async function derivedProfileVariants(cred:StalkerCreds, random="", preferredModel:MagDeviceModel="MAG320"): Promise<StalkerProfileVariant[]> {
  if (preferredModel === "MAG320") return [];
  try {
    const mac=normalizeMac(cred.mac);
    const base=baseProfileParams(mac,preferredModel);
    const id=await derivedMagIdentity(cred);
    const metrics=JSON.stringify({mac,sn:id.sn,type:"STB",model:preferredModel,uid:"",random});
    const hwVersion=preferredModel==="MAG254" ? "2.6-IB-00" : base.hw_version;
    return [{
      label:`${preferredModel}-derived-identity`,
      params:{...base,hw_version:hwVersion,sn:id.sn,device_id:id.deviceId,device_id2:id.deviceId2,signature:id.signatureModern,auth_second_step:"1",client_type:"STB",video_out:"hdmi",metrics,hw_version_2:id.hwVersion2,api_signature:"262",prehash:""},
    },{
      label:`${preferredModel}-derived-legacy-signature`,
      params:{...base,hw_version:hwVersion,sn:id.sn,device_id:id.deviceId,device_id2:id.deviceId2,signature:id.signatureLegacy,auth_second_step:"0"},
    }];
  } catch {
    return [];
  }
}

function profilePayload(data:any): any {
  const js=data?.js;
  if (!js || typeof js !== "object" || Array.isArray(js)) return null;
  // "{}" veya yalnız protokol zarfı cihaz kimliğini doğrulamaz.
  const meaningfulKeys=["id","mac","login","status","blocked","tariff_plan","expire_billing_date","phone","name","stb_type"];
  return meaningfulKeys.some(k => js[k] !== undefined && js[k] !== null && String(js[k]) !== "") ? js : null;
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
      const data=await req(buildUrl(ses.endpoint, variant.params, !variant.noJs), headersFor(cred, ses.token, ses.endpoint, ses.compatProfile));
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
  const preferredModel=ses.compatProfile ? compatModel(ses.compatProfile) : (cred.deviceModel || "MAG320");
  const direct=await tryVariants(initialProfileVariants(cred,preferredModel));
  if (direct) return direct;
  const derived=await tryVariants(await derivedProfileVariants(cred,ses.random || "",preferredModel));
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
    headersFor(cred, ses.token, ses.endpoint, ses.compatProfile)
  );
  const map = new Map<string, string>();
  const list = Array.isArray(data?.js) ? data.js : [];
  for (const g of list) {
    if (g?.id != null) map.set(String(g.id), String(g.title || "Genel"));
  }
  return map;
}

/** 4) TÜM KANALLAR */
export async function stalkerChannels(cred: StalkerCreds, ses: StalkerSession, signal?: AbortSignal): Promise<Channel[]> {
  const genres = await stalkerGenres(cred, ses).catch(() => new Map<string, string>());
  let list:any[]=[];
  let source="get_all_channels";
  try {
    const data = await req(
      buildUrl(ses.endpoint, { type: "itv", action: "get_all_channels" }),
      headersFor(cred, ses.token, ses.endpoint, ses.compatProfile),
      {timeoutMs:60000,signal}
    );
    list = Array.isArray(data?.js?.data) ? data.js.data : (Array.isArray(data?.js) ? data.js : []);
    if (!list.length) throw Object.assign(new Error("get_all_channels boş"), { kind:"EMPTY" });
  } catch (first:any) {
    source="get_ordered_list";
    void recordDiagnostic("mag", "STALKER_LIVE_FALLBACK", { from:"get_all_channels", to:"get_ordered_list", status:first?.status, kind:first?.kind, message:String(first?.message || first) });
    const seen=new Set<string>();
    let previousFingerprint="", noNew=0, maxPages=ORDERED_LIST_ABSOLUTE_MAX_PAGES;
    for (let page=0; page<maxPages; page++) {
      if (signal?.aborted) break;
      const data=await req(
        buildUrl(ses.endpoint,{type:"itv",action:"get_ordered_list",fav:"0",sortby:"number",p:String(page)}),
        headersFor(cred,ses.token,ses.endpoint,ses.compatProfile),
        {timeoutMs:60000,signal},
      );
      const rows=rowsFromListShape(data);
      if (!rows.length) {
        if (page===0) continue;
        break;
      }
      const fingerprint=pageFingerprint(rows);
      if (fingerprint===previousFingerprint) break;
      previousFingerprint=fingerprint;
      const declared=Number(data?.js?.total_items);
      if (page<=1) maxPages=expectedPageLimit(declared,rows.length);
      let added=0;
      for (let i=0;i<rows.length;i++) {
        const row=rows[i], key=String(row?.id ?? row?.ch_id ?? `${page}-${i}`);
        if (!seen.has(key)) { seen.add(key); list.push(row); added++; }
        await stalkerCatalogYield(i);
      }
      void recordDiagnostic("mag","STALKER_LIVE_PAGE",{page,rows:rows.length,added,total:list.length,maxPages});
      await stalkerCatalogYield(page,1);
      if (Number.isFinite(declared) && list.length>=declared) break;
      noNew=added ? 0 : noNew+1;
      if (noNew>=ORDERED_LIST_NO_NEW_LIMIT) break;
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
      // v16.1.0: "ffmpeg http://..." öneki BURADA temizlenir (MalformedURLException kökü)
      url: stripStreamPrefix(String(c.cmd || c.url || "")),
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
  try { data = await req(buildUrl(ses.endpoint, { type, action: "get_categories" }), headersFor(cred, ses.token, ses.endpoint, ses.compatProfile), 30000); }
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

export async function stalkerCategoryPreview(cred: StalkerCreds, ses: StalkerSession): Promise<{vod:string[];series:string[];warnings:string[]}> {
  const warnings:string[]=[];
  const [vodRes,seriesRes]=await Promise.allSettled([stalkerCategories(cred,ses,"vod"),stalkerCategories(cred,ses,"series")]);
  const names=(r:PromiseSettledResult<Map<string,string>>,label:string):string[]=>{
    if(r.status==="rejected"){ warnings.push(`${label}: ${String((r.reason as any)?.message || r.reason)}`); return []; }
    return Array.from(new Set(Array.from(r.value.values()).map(v=>String(v||"Genel").trim()||"Genel"))).sort((a,b)=>a.localeCompare(b,"tr"));
  };
  const vod=names(vodRes,"VOD kategori önizleme");
  const series=names(seriesRes,"Series kategori önizleme");
  void recordDiagnostic("catalog","STALKER_CATEGORY_PREVIEW",{vod:vod.length,series:series.length,warnings});
  return {vod,series,warnings};
}

const ORDERED_LIST_ABSOLUTE_MAX_PAGES = 120;
const ORDERED_LIST_NO_NEW_LIMIT = 2;
function pageFingerprint(rows:any[]):string {
  if (!rows.length) return "empty";
  const ids=rows.slice(0,8).map((r:any)=>String(r?.id ?? r?.movie_id ?? r?.series_id ?? r?.ch_id ?? "")).join("|");
  const tail=rows.slice(-3).map((r:any)=>String(r?.id ?? r?.movie_id ?? r?.series_id ?? r?.ch_id ?? "")).join("|");
  return `${rows.length}:${ids}:${tail}`;
}
function expectedPageLimit(total:number, rowsPerPage:number):number {
  if (!Number.isFinite(total) || total < 0 || rowsPerPage <= 0) return ORDERED_LIST_ABSOLUTE_MAX_PAGES;
  return Math.min(ORDERED_LIST_ABSOLUTE_MAX_PAGES, Math.max(4, Math.ceil(total / rowsPerPage) + 3));
}

async function stalkerOrderedList(
  cred: StalkerCreds,
  ses: StalkerSession,
  type: "vod" | "series",
  extra: Record<string,string> = {},
  onPage?: (page: number, loaded: number, total?: number) => void,
  signal?: AbortSignal,
): Promise<any[]> {
  const out:any[]=[]; const seen=new Set<string>();
  let total=Number.POSITIVE_INFINITY, page=0, firstNonEmptyPage:number|null=null;
  let maxPages=ORDERED_LIST_ABSOLUTE_MAX_PAGES, consecutiveNoNew=0, previousFingerprint="";
  let effectivePageBase: 0 | 1 | null = null;
  let stopReason="TOTAL_OR_END";
  /**
   * v16.6.0 — ZAMAN BÜTÇESİ (kritik)
   * -------------------------------------------------------------------------
   * CİHAZ KANITI (29.08): bir portal 103.662 film bildiriyor ve sayfa başına
   * yalnız 14 satır veriyor. 120 sayfalık üst sınırla bile bu iş 100 SANİYEDEN
   * uzun sürüyor ve ANR üretiyordu (16 donma kaydı). Sayfa sayısı tek başına
   * yeterli koruma değil: yavaş portalda 120 sayfa dakikalarca sürebiliyor.
   * Bu yüzden duvar saati bütçesi ekliyoruz: süre dolunca elde ne varsa onunla
   * dönülür (kısmi liste, boş listeden iyidir).
   */
  const PAGE_BUDGET_MS = 45000;
  const budgetStartedAt = Date.now();
  while (page < maxPages && out.length < total) {
    if (signal?.aborted) { stopReason="CANCELLED"; break; }
    if (Date.now() - budgetStartedAt > PAGE_BUDGET_MS) {
      stopReason="TIME_BUDGET";
      void recordDiagnostic("mag","STALKER_PAGINATION_BUDGET",{type,page,loaded:out.length,total,elapsedMs:Date.now()-budgetStartedAt});
      break;
    }
    let data:any;
    try {
      data=await req(
        buildUrl(ses.endpoint,{type,action:"get_ordered_list",p:String(page),...extra}),
        headersFor(cred,ses.token,ses.endpoint,ses.compatProfile),
        {timeoutMs:60000,signal},
      );
    } catch (e:any) {
      if (e?.kind==="CANCELLED") { stopReason="CANCELLED"; break; }
      if (unsupportedStatus(e)) throw new StalkerCatalogUnsupportedError(type,`${type} ordered-list endpoint desteklenmiyor`);
      throw e;
    }
    if (!isExplicitListShape(data)) throw new StalkerCatalogUnsupportedError(type,`${type} ordered-list yanıt biçimi desteklenmiyor`);
    const js=data?.js, rows=rowsFromListShape(data);
    const declared=Number(js?.total_items);
    const declaredPageItems=Number(js?.max_page_items);
    if (Number.isFinite(declared) && declared>=0) total=declared;
    if (Number.isFinite(declaredPageItems) && declaredPageItems > 0 && Number.isFinite(total)) {
      maxPages=Math.min(ORDERED_LIST_ABSOLUTE_MAX_PAGES, Math.max(4, Math.ceil(total / declaredPageItems) + 3));
    }
    if (!rows.length) {
      if (firstNonEmptyPage===null && page===0) { page=1; continue; }
      stopReason="EMPTY_PAGE"; break;
    }
    if (firstNonEmptyPage===null) firstNonEmptyPage=page;
    const fingerprint=pageFingerprint(rows);
    if (fingerprint===previousFingerprint) {
      // Bazı Ministra/Stalker portalları p=0 isteğini p=1 alias'ı gibi döndürür.
      // Eski kod burada katalogu 14 öğede kesiyordu. İlk 0/1 çifti aynıysa
      // 1-based portal olarak öğren ve gerçek ikinci sayfa olan p=2'yi dene.
      if (effectivePageBase === null && firstNonEmptyPage === 0 && page === 1) {
        effectivePageBase = 1;
        void recordDiagnostic("mag", "STALKER_PAGINATION_BASE_DETECTED", { type, effectivePageBase, reason: "P0_EQUALS_P1", nextPage: 2 });
        page = 2;
        continue;
      }
      stopReason="DUPLICATE_PAGE"; break;
    }
    if (effectivePageBase === null && firstNonEmptyPage === 0 && page === 1) {
      effectivePageBase = 0;
      void recordDiagnostic("mag", "STALKER_PAGINATION_BASE_DETECTED", { type, effectivePageBase, reason: "P0_DIFFERS_P1" });
    } else if (effectivePageBase === null && firstNonEmptyPage === 1) {
      effectivePageBase = 1;
    }
    previousFingerprint=fingerprint;
    if (page===firstNonEmptyPage && maxPages===ORDERED_LIST_ABSOLUTE_MAX_PAGES) maxPages=expectedPageLimit(total,rows.length);

    let added=0;
    for (let ri=0; ri<rows.length; ri++) {
      const row=rows[ri], key=String(row?.id ?? row?.movie_id ?? row?.series_id ?? `${page}-${ri}`);
      if (seen.has(key)) continue;
      seen.add(key); out.push(row); added++;
      await stalkerCatalogYield(ri);
    }
    await stalkerCatalogYield(page,1);
    const progressTotal=Number.isFinite(total)?total:undefined;
    try { onPage?.(page,out.length,progressTotal); } catch {}
    void recordDiagnostic("mag","STALKER_PAGINATION_PAGE",{type,page,rows:rows.length,added,loaded:out.length,total:progressTotal,maxPages,effectivePageBase,maxPageItems:Number(js?.max_page_items)||undefined});
    if (!added) consecutiveNoNew++; else consecutiveNoNew=0;
    if (consecutiveNoNew>=ORDERED_LIST_NO_NEW_LIMIT) { stopReason="NO_NEW_IDS"; break; }
    page++;
  }
  if (page>=maxPages && out.length<total) stopReason="PAGE_GOVERNOR";
  void recordDiagnostic("mag","STALKER_PAGINATION_STOP",{type,stopReason,page,loaded:out.length,total:Number.isFinite(total)?total:undefined,maxPages,effectivePageBase});
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
async function stalkerVodPartition(cred:StalkerCreds, ses:StalkerSession, opts?: StalkerCatalogOptions): Promise<VodPartition> {
  let cats=new Map<string,string>();
  try { cats=await stalkerCategories(cred,ses,"vod"); } catch (e) { if (!(e instanceof StalkerCatalogUnsupportedError)) throw e; }
  let raw:any[];
  try { raw=await stalkerOrderedList(cred,ses,"vod",{},(page,loaded,total)=>emitCatalogProgress(opts,{stage:"vod",message:`Film kataloğu yükleniyor · sayfa ${page} · ${loaded}${total != null ? `/${total}` : ""}`,page,loaded,total}),opts?.signal); }
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

async function nativeStalkerSeries(cred:StalkerCreds, ses:StalkerSession, opts?: StalkerCatalogOptions): Promise<{items:SeriesItem[]; supported:boolean}> {
  let cats=new Map<string,string>();
  try { cats=await stalkerCategories(cred,ses,"series"); } catch (e) { if (!(e instanceof StalkerCatalogUnsupportedError)) throw e; }
  let raw:any[];
  try { raw=await stalkerOrderedList(cred,ses,"series",{},(page,loaded,total)=>emitCatalogProgress(opts,{stage:"series",message:`Dizi kataloğu yükleniyor · sayfa ${page} · ${loaded}${total != null ? `/${total}` : ""}`,page,loaded,total}),opts?.signal); }
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
  vod: "OK"|"EMPTY"|"UNSUPPORTED"|"ERROR";
  seriesNative: "OK"|"EMPTY"|"UNSUPPORTED"|"ERROR";
  seriesFromVod: number;
  warnings: string[];
};

/**
 * v16.3.0 — YETKİLENDİRME HATASINDA OTURUM TAZELEME
 * ---------------------------------------------------------------------------
 * Cihaz kaydı (28.08): portal HTTP 200 döndürüyor ama gövde JSON değil ve
 * yalnızca 21 bayt (text/javascript). Bu, Stalker portallarının bayat/geçersiz
 * oturumda döndürdüğü kısa metin yanıtının imzasıdır ("Authorization failed."
 * tam 21 karakterdir). Eski akış aynı BAYAT token ile iki kez deniyor ve ikisi
 * de aynı yanıtı alıyordu.
 * Artık bu imzada oturum geçersiz kılınıp handshake yenilenerek son bir kez
 * denenir. (Gövde artık kayda da yazılıyor; bir sonraki kayıtta portalın tam
 * olarak ne dediği görülecek.)
 */
function looksLikeAuthFailure(e:any): boolean {
  const kind=String(e?.kind||""); const snip=String(e?.snippet||e?.message||"").toLowerCase();
  if (kind!=="NON_JSON" && kind!=="HTTP") return false;
  return /authorization|auth failed|not authorized|access denied|invalid token|token/.test(snip)
      || (Number(e?.bytes||0)>0 && Number(e?.bytes||0)<64);
}

async function retryCatalogPart<T>(label:string, fn:()=>Promise<T>, onAuthFailure?:()=>Promise<void>):Promise<T> {
  let last:any;
  for (let i=0;i<2;i++) {
    try { return await fn(); }
    catch (e) { if (e instanceof StalkerCatalogUnsupportedError) throw e; last=e; if (i===0) await new Promise(r=>setTimeout(r,350)); }
  }
  // v16.3.0: yetkilendirme imzası -> oturumu tazeleyip SON bir deneme.
  if (onAuthFailure && looksLikeAuthFailure(last)) {
    void recordDiagnostic("catalog","STALKER_CATALOG_AUTH_RETRY",{label,bytes:last?.bytes,snippet:last?.snippet||""});
    try {
      await onAuthFailure();
      return await fn();
    } catch (e2) { last=e2; }
  }
  void recordDiagnostic("catalog", "STALKER_CATALOG_PART_ERROR", { label, kind:last?.kind, status:last?.status, contentType:last?.contentType, redirected:last?.redirected, finalUrl:last?.finalUrl, message:String(last?.message || last) });
  const err:any=new Error(`${label} kataloğu alınamadı: ${last?.message || last}`); err.cause=last; err.kind=last?.kind; err.status=last?.status; err.contentType=last?.contentType; err.redirected=last?.redirected; err.finalUrl=last?.finalUrl; throw err;
}

async function runStalkerCatalog(cred: StalkerCreds, ses: StalkerSession, opts: StalkerCatalogOptions = {}): Promise<StalkerCatalogResult> {
  const catalogStarted = Date.now();
  /**
   * v16.3.0: Yetkilendirme imzasında oturumu tazeler.
   * Handshake yeniden yapılır ve yeni token mevcut oturum nesnesine yazılır;
   * böylece bundan sonraki istekler taze token kullanır.
   */
  const refreshSession = async () => {
    invalidateSession(cred);
    const fresh = await stalkerHandshake({ ...cred });
    if (fresh?.token) {
      (ses as any).token = fresh.token;
      (ses as any).endpoint = fresh.endpoint || ses.endpoint;
      (ses as any).random = fresh.random ?? (ses as any).random;
      (ses as any).compatProfile = fresh.compatProfile ?? (ses as any).compatProfile;
    }
  };
  void recordDiagnostic("catalog", "STALKER_CATALOG_START", { endpoint: ses.endpoint, profileError: ses.profileError || "" });

  emitCatalogProgress(opts,{stage:"live",message:"Canlı TV kataloğu yükleniyor..."});
  const liveStageStarted=Date.now();
  let channels:Channel[]=[];
  let liveError="";
  const finishLiveTask = startDiagnosticTask("mag:catalog-live");
  try { channels=await retryCatalogPart("MAG Live",()=>stalkerChannels(cred,ses,opts.signal),refreshSession); }
  catch (e:any) { liveError=String(e?.message || e); void recordDiagnostic("mag","STALKER_LIVE_PARTIAL_FAILURE",{message:liveError,status:e?.status,kind:e?.kind}); }
  finally { finishLiveTask(); }
  void recordDiagnostic("catalog","STALKER_CATALOG_STAGE_DONE",{stage:"live",elapsedMs:Date.now()-liveStageStarted,count:channels.length,error:liveError});
  emitCatalogProgress(opts,{stage:"live",message:`Canlı TV tamamlandı · ${channels.length} kanal`,loaded:channels.length,total:channels.length});

  if (opts.liveOnly) {
    const diagnostics:StalkerCatalogDiagnostics={
      live:liveError?"ERROR":(channels.length?"OK":"EMPTY"),
      vod:"EMPTY",seriesNative:"EMPTY",seriesFromVod:0,
      warnings:[...(liveError?[`Canlı katalog alınamadı: ${liveError}`]:[]),"VOD/Series live-first commit sonrası enrichment işine bırakıldı."],
    };
    if (!channels.length && liveError) throw new Error(`MAG Live katalog alınamadı. ${liveError}`);
    const result={channels,vod:[] as VodItem[],series:[] as SeriesItem[],diagnostics};
    void recordDiagnostic("catalog","STALKER_LIVE_READY",{elapsedMs:Date.now()-catalogStarted,live:channels.length,endpoint:ses.endpoint});
    emitCatalogProgress(opts,{stage:"final",message:`Canlı katalog hazır · ${channels.length} kanal · film/dizi sonra tamamlanacak`,loaded:channels.length,total:channels.length});
    return result;
  }

  emitCatalogProgress(opts,{stage:"vod",message:"Film kataloğu yükleniyor..."});
  const vodStageStarted=Date.now();
  let vodPart:VodPartition;
  let vodError="";
  const finishVodTask = startDiagnosticTask("mag:catalog-vod");
  try { vodPart=await retryCatalogPart("MAG VOD",()=>stalkerVodPartition(cred,ses,opts),refreshSession); }
  catch (e:any) { vodError=String(e?.message || e); vodPart={vod:[],fallbackSeries:[],supported:!(e instanceof StalkerCatalogUnsupportedError),rawCount:0,seriesFlagged:0}; void recordDiagnostic("mag","STALKER_VOD_PARTIAL_FAILURE",{message:vodError,status:e?.status,kind:e?.kind}); }
  finally { finishVodTask(); }
  void recordDiagnostic("catalog","STALKER_CATALOG_STAGE_DONE",{stage:"vod",elapsedMs:Date.now()-vodStageStarted,count:vodPart.vod.length,seriesFlagged:vodPart.fallbackSeries.length,error:vodError});
  emitCatalogProgress(opts,{stage:"vod",message:`Film kataloğu tamamlandı · ${vodPart.vod.length} film`,loaded:vodPart.vod.length,total:vodPart.vod.length});

  emitCatalogProgress(opts,{stage:"series",message:"Dizi kataloğu yükleniyor..."});
  const seriesStageStarted=Date.now();
  let nativeSeries:{items:SeriesItem[];supported:boolean};
  let seriesError="";
  const finishSeriesTask = startDiagnosticTask("mag:catalog-series");
  try { nativeSeries=await retryCatalogPart("MAG Series",()=>nativeStalkerSeries(cred,ses,opts),refreshSession); }
  catch (e:any) { seriesError=String(e?.message || e); nativeSeries={items:[],supported:!(e instanceof StalkerCatalogUnsupportedError)}; void recordDiagnostic("mag","STALKER_SERIES_PARTIAL_FAILURE",{message:seriesError,status:e?.status,kind:e?.kind}); }
  finally { finishSeriesTask(); }

  // type=series boş dönse bile VOD is_series/kategori fallback'i HER ZAMAN birleştirilir.
  const merged=new Map<string,SeriesItem>();
  for (const x of [...nativeSeries.items,...vodPart.fallbackSeries]) {
    const key=String((x as any).series_id || x.id || x.name); if (!merged.has(key)) merged.set(key,x);
  }
  const series=Array.from(merged.values());
  void recordDiagnostic("catalog","STALKER_CATALOG_STAGE_DONE",{stage:"series",elapsedMs:Date.now()-seriesStageStarted,count:series.length,nativeCount:nativeSeries.items.length,fromVod:vodPart.fallbackSeries.length,error:seriesError});
  emitCatalogProgress(opts,{stage:"series",message:`Dizi kataloğu tamamlandı · ${series.length} dizi`,loaded:series.length,total:series.length});

  const warnings:string[]=[];
  if (!vodPart.supported) warnings.push("Portal VOD ordered-list endpointini desteklemiyor.");
  if (!nativeSeries.supported) warnings.push("Portal ayrı Series endpointini desteklemiyor; VOD is_series fallback kullanıldı.");
  if (liveError) warnings.push(`Canlı katalog alınamadı: ${liveError}`);
  if (vodError) warnings.push(`VOD katalog sorunu: ${vodError}`);
  if (seriesError) warnings.push(`Series katalog sorunu: ${seriesError}`);
  const diagnostics:StalkerCatalogDiagnostics={
    live:liveError?"ERROR":(channels.length?"OK":"EMPTY"),
    vod:!vodPart.supported?"UNSUPPORTED":(vodError?"ERROR":(vodPart.vod.length?"OK":"EMPTY")),
    seriesNative:!nativeSeries.supported?"UNSUPPORTED":(seriesError?"ERROR":(nativeSeries.items.length?"OK":"EMPTY")),
    seriesFromVod:vodPart.fallbackSeries.length,
    warnings,
  };
  if (!channels.length && !vodPart.vod.length && !series.length && (liveError || vodError || seriesError)) {
    throw new Error(`MAG katalog alınamadı. ${[liveError,vodError,seriesError].filter(Boolean).join(" | ")}`);
  }
  const result={channels,vod:vodPart.vod,series,diagnostics};
  console.info('[StalkerCatalog]' , {live:channels.length,vod:vodPart.vod.length,series:series.length,diagnostics});
  void recordDiagnostic("catalog", "STALKER_CATALOG_DONE", { elapsedMs: Date.now()-catalogStarted, live: channels.length, vod: vodPart.vod.length, series: series.length, diagnostics });
  emitCatalogProgress(opts,{stage:"final",message:`MAG katalog hazır · ${channels.length} kanal · ${vodPart.vod.length} film · ${series.length} dizi`});
  return result;
}

export type StalkerEnrichmentResult = { vod:VodItem[]; series:SeriesItem[]; diagnostics:StalkerCatalogDiagnostics };

export async function stalkerEnrichment(cred:StalkerCreds, ses:StalkerSession, opts:StalkerCatalogOptions = {}):Promise<StalkerEnrichmentResult> {
  const finish=startDiagnosticTask("mag:enrichment",{endpoint:ses.endpoint});
  const started=Date.now();
  /**
   * v16.3.0: Zenginleştirme akışının KENDİ oturum yenileyicisi.
   * (runStalkerCatalog'daki yerel yenileyici burada kapsam dışıdır.)
   */
  const refreshSession = async () => {
    invalidateSession(cred);
    const fresh = await stalkerHandshake({ ...cred });
    if (fresh?.token) {
      (ses as any).token = fresh.token;
      (ses as any).endpoint = fresh.endpoint || ses.endpoint;
      (ses as any).random = fresh.random ?? (ses as any).random;
      (ses as any).compatProfile = fresh.compatProfile ?? (ses as any).compatProfile;
    }
  };
  try {
    emitCatalogProgress(opts,{stage:"vod",message:"Film kataloğu arka planda tamamlanıyor..."});
    let vodPart:VodPartition, vodError="";
    try { vodPart=await retryCatalogPart("MAG VOD",()=>stalkerVodPartition(cred,ses,opts),refreshSession); }
    catch (e:any) { vodError=String(e?.message||e); vodPart={vod:[],fallbackSeries:[],supported:!(e instanceof StalkerCatalogUnsupportedError),rawCount:0,seriesFlagged:0}; }

    emitCatalogProgress(opts,{stage:"series",message:"Dizi kataloğu arka planda tamamlanıyor..."});
    let nativeSeries:{items:SeriesItem[];supported:boolean}, seriesError="";
    try { nativeSeries=await retryCatalogPart("MAG Series",()=>nativeStalkerSeries(cred,ses,opts),refreshSession); }
    catch (e:any) { seriesError=String(e?.message||e); nativeSeries={items:[],supported:!(e instanceof StalkerCatalogUnsupportedError)}; }

    const merged=new Map<string,SeriesItem>();
    for (const x of [...nativeSeries.items,...vodPart.fallbackSeries]) {
      const key=String((x as any).series_id||x.id||x.name); if(!merged.has(key)) merged.set(key,x);
    }
    const series=Array.from(merged.values());
    const warnings:string[]=[];
    if (!vodPart.supported) warnings.push("Portal VOD ordered-list endpointini desteklemiyor.");
    if (!nativeSeries.supported) warnings.push("Portal ayrı Series endpointini desteklemiyor; VOD is_series fallback kullanıldı.");
    if (vodError) warnings.push(`VOD katalog sorunu: ${vodError}`);
    if (seriesError) warnings.push(`Series katalog sorunu: ${seriesError}`);
    const diagnostics:StalkerCatalogDiagnostics={live:"EMPTY",vod:!vodPart.supported?"UNSUPPORTED":(vodError?"ERROR":(vodPart.vod.length?"OK":"EMPTY")),seriesNative:!nativeSeries.supported?"UNSUPPORTED":(seriesError?"ERROR":(nativeSeries.items.length?"OK":"EMPTY")),seriesFromVod:vodPart.fallbackSeries.length,warnings};
    void recordDiagnostic("catalog","STALKER_ENRICH_DONE",{elapsedMs:Date.now()-started,vod:vodPart.vod.length,series:series.length,warnings});
    emitCatalogProgress(opts,{stage:"final",message:`Film/dizi tamamlandı · ${vodPart.vod.length} film · ${series.length} dizi`});
    return {vod:vodPart.vod,series,diagnostics};
  } finally { finish(); }
}

export async function stalkerCatalog(cred: StalkerCreds, ses: StalkerSession, opts: StalkerCatalogOptions = {}): Promise<StalkerCatalogResult> {
  const finishCatalogTask = startDiagnosticTask("mag:catalog", { endpoint: ses.endpoint });
  try {
  const key=catalogKey(cred,ses,opts.liveOnly?"live":"full");
  const now=Date.now();
  const cached=stalkerCatalogCache.get(key);
  if (!opts.forceFresh && cached && now-cached.at <= CATALOG_CACHE_TTL_MS) {
    void recordDiagnostic("catalog","STALKER_CATALOG_CACHE_HIT",{ageMs:now-cached.at,endpoint:ses.endpoint,live:cached.result.channels.length,vod:cached.result.vod.length,series:cached.result.series.length});
    emitCatalogProgress(opts,{stage:"final",message:`Önbellekteki MAG katalog kullanılıyor · ${cached.result.channels.length} kanal · ${cached.result.vod.length} film · ${cached.result.series.length} dizi`});
    return cached.result;
  }
  const active=stalkerCatalogInFlight.get(key);
  if (active) {
    void recordDiagnostic("catalog","STALKER_CATALOG_SINGLEFLIGHT_JOIN",{endpoint:ses.endpoint,forceFresh:!!opts.forceFresh});
    emitCatalogProgress(opts,{stage:"live",message:"Aynı MAG katalog isteği zaten çalışıyor; mevcut işleme bağlanılıyor..."});
    return active;
  }
  const promise=runStalkerCatalog(cred,ses,opts)
    .then(result=>{
      stalkerCatalogCache.set(key,{result,at:Date.now()});
      if (stalkerCatalogCache.size>6) {
        const oldest=[...stalkerCatalogCache.entries()].sort((a,b)=>a[1].at-b[1].at)[0]?.[0];
        if (oldest) stalkerCatalogCache.delete(oldest);
      }
      return result;
    })
    .finally(()=>{ stalkerCatalogInFlight.delete(key); });
  stalkerCatalogInFlight.set(key,promise);
  return promise;
  } finally {
    finishCatalogTask();
  }
}

/** 5) CREATE_LINK — oynatma anında gerçek (geçici) adres. */
export async function stalkerCreateLink(
  cred: StalkerCreds,
  ses: StalkerSession,
  cmd: string,
  mediaType: "itv" | "vod" = "itv",
  series = "",
  opts: { recovery?: boolean } = {},
): Promise<string> {
  // İlk deneme eski/stabil create_link sözleşmesini korur. Yalnız gerçek medya
  // isteği 401/403/456 ile reddedilip fresh-session recovery tetiklenirse sahada
  // kullanılan Ministra varyantlarındaki sn/token/long_lived alanları eklenir.
  // v15.2.27-RC3 FIX: buildUrl yalnız Record<string,string> kabul eder.
  // Opsiyonel serial alanını ternary-spread ile birleştirmek TypeScript'in
  // `sn?: undefined` üretmesine ve gerçek CI'da TS2345'e yol açıyordu.
  // Recovery parametreleri artık açıkça string map olarak kuruluyor; boş
  // opsiyonel değerler request'e hiç eklenmiyor.
  const recoveryParams: Record<string, string> = {};
  if (opts.recovery) {
    const serial = String(cred.serial ?? "").trim();
    const token = String(ses.token ?? "").trim();
    if (serial) recoveryParams.sn = serial;
    if (token) recoveryParams.token = token;
    recoveryParams.long_lived = "1";
  }
  const data = await req(
    buildUrl(ses.endpoint, {
      type: mediaType,
      action: "create_link",
      cmd,
      series,
      forced_storage: "undefined",
      disable_ad: "0",
      download: "0",
      ...recoveryParams,
    }),
    headersFor(cred, ses.token, ses.endpoint, ses.compatProfile)
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
  cmd: string,
  opts: { forceFresh?: boolean } = {},
): Promise<StalkerPlaybackContext> {
  const started = Date.now();
  let session = opts.forceFresh ? null : (ses || getCachedSession(cred)?.session || null);
  const cacheHit = !!session;
  let refreshed = !!opts.forceFresh;
  if (opts.forceFresh) invalidateSession(cred);
  if (!session) session = (await stalkerLogin(cred, { forceFresh: !!opts.forceFresh })).session;
  const parsed = parseMediaCommand(cmd);
  const resolveWithSession = async (activeSession: StalkerSession, didRefresh: boolean): Promise<StalkerPlaybackContext> => {
    const playbackKey = `${sessionKey(cred)}|${String(activeSession.endpoint || "").toLowerCase()}|${parsed.kind}|${parsed.series}|${parsed.cmd}`;
    const cachedLink = !didRefresh ? stalkerPlaybackLinkCache.get(playbackKey) : undefined;
    if (cachedLink && Date.now() - cachedLink.at <= PLAYBACK_LINK_CACHE_TTL_MS) {
      const headers = playbackHeadersFor(cred, activeSession, cachedLink.url);
      void recordDiagnostic("player", "STALKER_PLAYBACK_LINK_CACHE_HIT", {
        elapsedMs: Date.now() - started, ageMs: Date.now() - cachedLink.at, mediaType: parsed.kind,
      });
      return { url: cachedLink.url, headers, session: activeSession, mediaType: parsed.kind, refreshed: false };
    }
    if (cachedLink) stalkerPlaybackLinkCache.delete(playbackKey);
    const url = await stalkerCreateLink(cred, activeSession, parsed.cmd, parsed.kind, parsed.series, { recovery: didRefresh });
    stalkerPlaybackLinkCache.set(playbackKey, { url, at: Date.now() });
    if (stalkerPlaybackLinkCache.size > PLAYBACK_LINK_CACHE_MAX) {
      const oldest = [...stalkerPlaybackLinkCache.entries()].sort((a,b)=>a[1].at-b[1].at)[0]?.[0];
      if (oldest) stalkerPlaybackLinkCache.delete(oldest);
    }
    const headers = playbackHeadersFor(cred, activeSession, url);
    void recordDiagnostic("player", "STALKER_RESOLVE_DONE", {
      elapsedMs: Date.now()-started, cacheHit, linkCacheHit: false, mediaType: parsed.kind, refreshed: didRefresh,
      headerNames: Object.keys(headers).sort(),
    });
    return { url, headers, session: activeSession, mediaType: parsed.kind, refreshed: didRefresh };
  };
  try {
    return await resolveWithSession(session, refreshed);
  } catch (e: any) {
    const message = String(e?.message || e);
    void recordDiagnostic("player", "STALKER_RESOLVE_ERROR", { elapsedMs: Date.now()-started, cacheHit, message, status: e?.status });
    if (e?.status === 401 || e?.status === 403 || e?.status === 456 || /token|auth/i.test(message)) {
      invalidateSession(cred);
      const fresh = await stalkerLogin(cred, { forceFresh: true });
      refreshed = true;
      const result = await resolveWithSession(fresh.session, true);
      void recordDiagnostic("player", "STALKER_RESOLVE_REFRESHED", { elapsedMs: Date.now()-started, mediaType: parsed.kind });
      return result;
    }
    throw e;
  }
}
