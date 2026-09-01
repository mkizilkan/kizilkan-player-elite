/**
 * KIZILKAN PLAYER — Cihaz-içi XMLTV EPG (Elektronik Program Rehberi)
 * Dosya   : frontend/src/utils/epg.ts
 * Sürüm   : v1.0.0
 * Faz     : Paket 1 / XMLTV EPG cihaz-içi (emergent bağımlılığı kaldırma)
 *
 * ===========================================================================
 * NE İŞE YARIYOR?
 * ===========================================================================
 * M3U listeleri harici bir XMLTV EPG URL'i ile gelir (app.json'da epgUrl).
 * ESKİ: Bu XMLTV backend'de (emergent) indirilip ayrıştırılıyordu.
 * YENİ: Tamamen cihazda — indir, ayrıştır, sakla, oku. Backend GEREKMEZ.
 *
 * XMLTV formatı:
 *   <tv>
 *     <channel id="trt1.tr"><display-name>TRT 1</display-name></channel>
 *     <programme start="20260726090000 +0300" stop="20260726100000 +0300" channel="trt1.tr">
 *       <title>Diriliş Ertuğrul</title>
 *       <desc>Açıklama...</desc>
 *     </programme>
 *   </tv>
 *
 * ===========================================================================
 * TASARIM
 * ===========================================================================
 * - fetchAndCacheEpg(url, playlistId): XMLTV indir, ayrıştır, bigStore'a sakla.
 *   Ağır veri (binlerce program) olduğu için dosya sistemine yazılır.
 * - getNowNext(playlistId, channelIds): şu an/sıradaki programları döndürür.
 * - getChannelPrograms(playlistId, channelId): bir kanalın tüm programları.
 * Cache 6 saat geçerli; süresi dolunca otomatik yeniden indirilir.
 *
 * XML AYRIŞTIRMA: RN'de DOMParser yok. Bu yüzden regex tabanlı, XMLTV'ye özel
 * hafif bir ayrıştırıcı kullanıyoruz — tam XML parser'a göre çok daha hızlı
 * ve büyük dosyalarda (10MB+) bellek dostu.
 * ===========================================================================
 */

import { bigStore } from "./storage/bigStore";
import { storage } from "./storage";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";

export interface EpgProgram {
  title: string;
  description: string | null;
  start: string;              // ISO 8601
  stop: string;               // ISO 8601
  start_timestamp: number;    // saniye
  stop_timestamp: number;     // saniye
  channel: string;            // XMLTV channel id
}

export interface NowNext {
  now?: EpgProgram | null;
  next?: EpgProgram | null;
}

const EPG_META_PREFIX = "kizilkan.epg.meta.";   // { url, fetchedAt }
const EPG_DATA_PREFIX = "epg-";                   // bigStore anahtarı (dosya)
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;          // 6 saat

/**
 * XMLTV zaman damgasını ("20260726090000 +0300") saniyeye çevirir.
 */
function parseXmltvTime(s: string): number {
  if (!s) return 0;
  // Biçim: YYYYMMDDHHMMSS [+HHMM]
  const m = s.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
  if (!m) return 0;
  const [, y, mo, d, h, mi, se, tz] = m;
  // ISO'ya çevir; tz varsa uygula, yoksa UTC varsay.
  let iso = `${y}-${mo}-${d}T${h}:${mi}:${se}`;
  if (tz) {
    iso += `${tz.slice(0, 3)}:${tz.slice(3)}`; // +0300 -> +03:00
  } else {
    iso += "Z";
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

/** XML özel karakterlerini çözer (&amp; &lt; &gt; &quot; &#39; &#NNN;). */
function decodeXmlEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return _; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); } catch { return _; }
    })
    .replace(/&amp;/g, "&"); // en son (çift çözmeyi önler)
}

/** Bir <programme> bloğundan alt etiket içeriğini çeker. */
function extractTag(block: string, tag: string): string | null {
  // <title ...>içerik</title>  (dil attribute'lu olabilir)
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  if (!m) return null;
  return decodeXmlEntities(m[1].trim());
}

/**
 * XMLTV metnini ayrıştırıp program listesine çevirir.
 * Regex tabanlı — büyük dosyalarda DOMParser'dan çok daha hızlı ve hafif.
 */
export function parseXmltv(xml: string): EpgProgram[] {
  const programs: EpgProgram[] = [];
  if (!xml) return programs;

  // Her <programme ...>...</programme> bloğunu yakala.
  const progRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let match: RegExpExecArray | null;

  while ((match = progRe.exec(xml)) !== null) {
    const attrs = match[1];
    const body = match[2];

    const startAttr = /start="([^"]*)"/i.exec(attrs)?.[1] || "";
    const stopAttr = /stop="([^"]*)"/i.exec(attrs)?.[1] || "";
    const channel = /channel="([^"]*)"/i.exec(attrs)?.[1] || "";

    const startTs = parseXmltvTime(startAttr);
    const stopTs = parseXmltvTime(stopAttr);

    const title = extractTag(body, "title") || "Program";
    const description = extractTag(body, "desc");

    programs.push({
      title,
      description,
      start: startTs ? new Date(startTs * 1000).toISOString() : "",
      stop: stopTs ? new Date(stopTs * 1000).toISOString() : "",
      start_timestamp: startTs,
      stop_timestamp: stopTs,
      channel,
    });
  }

  return programs;
}

/**
 * XMLTV EPG'yi indirir, ayrıştırır ve cihazda saklar.
 * Kanal id'sine göre gruplar (hızlı arama için).
 */
export async function fetchAndCacheEpg(url: string, playlistId: string): Promise<{ count: number }> {
  /**
   * UA TUTARLILIĞI (v9.1.0)
   * "KizilkanPlayer/1.0" bazı sağlayıcılar tarafından REDDEDİLİYOR
   * (bilinmeyen istemci). Yayın adreslerinde zaten VLC kimliği kullanıyoruz;
   * EPG indirmede de aynısını kullanmak reddedilme riskini azaltır.
   */
  const { DEFAULT_USER_AGENT } = await import("./streamTest");
  // v15.2.4 Android: XMLTV indirme + parse + indeksleme tamamen native worker
  // üzerinde ve Room'da. Kanal ekranı artık 10MB+ XML'i JS regex ile işlemez.
  if (KizilkanNativeCore.available) {
    const result = await KizilkanNativeCore.fetchAndCacheEpg(url, playlistId, DEFAULT_USER_AGENT);
    if (!result) throw new Error("Native EPG Core yanıt vermedi.");
    await storage.setItem(EPG_META_PREFIX + playlistId, JSON.stringify({ url, fetchedAt: Date.now(), native: true }));
    return { count: Number(result.count || 0) };
  }
  const res = await fetch(url, {
    headers: { "User-Agent": DEFAULT_USER_AGENT, Accept: "*/*" },
  });
  if (!res.ok) throw new Error(`EPG indirilemedi (HTTP ${res.status})`);
  const xml = await res.text();

  const programs = parseXmltv(xml);

  // Kanal id'sine göre grupla: { channelId: EpgProgram[] }
  const byChannel: Record<string, EpgProgram[]> = {};
  for (const p of programs) {
    if (!p.channel) continue;
    (byChannel[p.channel] ||= []).push(p);
  }
  // Her kanalın programlarını başlangıca göre sırala.
  for (const ch of Object.keys(byChannel)) {
    byChannel[ch].sort((a, b) => a.start_timestamp - b.start_timestamp);
  }

  const ok = await bigStore.write(EPG_DATA_PREFIX + playlistId, byChannel);
  if (!ok) throw new Error("EPG cihaza kaydedilemedi.");

  await storage.setItem(EPG_META_PREFIX + playlistId, JSON.stringify({ url, fetchedAt: Date.now() }));

  return { count: programs.length };
}

/** Cache geçerli mi? (6 saat) Değilse yeniden indirilmeli. */
async function ensureFresh(url: string, playlistId: string): Promise<void> {
  try {
    const metaRaw = await storage.getItem<string>(EPG_META_PREFIX + playlistId, "");
    const meta = metaRaw ? JSON.parse(metaRaw) : null;
    const fresh = meta && meta.url === url && Date.now() - meta.fetchedAt < CACHE_TTL_MS;
    if (!fresh) {
      await fetchAndCacheEpg(url, playlistId);
    }
  } catch {
    // Cache okunamadıysa yeniden indir.
    await fetchAndCacheEpg(url, playlistId);
  }
}

/** Bir kanalın tüm programlarını döndürür. */
export async function getChannelPrograms(
  playlistId: string,
  channelId: string,
  epgUrl?: string
): Promise<{ programs: EpgProgram[] }> {
  if (epgUrl) await ensureFresh(epgUrl, playlistId);
  if (KizilkanNativeCore.available) {
    const programs = await KizilkanNativeCore.getEpgChannelPrograms(playlistId, channelId);
    return { programs: (programs || []) as EpgProgram[] };
  }
  const byChannel = await bigStore.read<Record<string, EpgProgram[]>>(EPG_DATA_PREFIX + playlistId, {});
  return { programs: byChannel[channelId] || [] };
}

/** Birden fazla kanal için şu an / sıradaki programı döndürür. */
export async function getNowNext(
  playlistId: string,
  channelIds: string[],
  epgUrl?: string
): Promise<{ data: Record<string, NowNext> }> {
  if (epgUrl) await ensureFresh(epgUrl, playlistId);
  const nowSec = Math.floor(Date.now() / 1000);
  if (KizilkanNativeCore.available) {
    const data = await KizilkanNativeCore.getEpgNowNext(playlistId, channelIds, nowSec);
    return { data: (data || {}) as Record<string, NowNext> };
  }
  const byChannel = await bigStore.read<Record<string, EpgProgram[]>>(EPG_DATA_PREFIX + playlistId, {});
  const data: Record<string, NowNext> = {};

  for (const chId of channelIds) {
    const list = byChannel[chId];
    if (!list || list.length === 0) continue;

    let now: EpgProgram | null = null;
    let next: EpgProgram | null = null;

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.start_timestamp <= nowSec && p.stop_timestamp > nowSec) {
        now = p;
        next = list[i + 1] || null;
        break;
      }
      if (p.start_timestamp > nowSec) {
        next = p;
        break;
      }
    }

    if (now || next) data[chId] = { now, next };
  }

  return { data };
}
