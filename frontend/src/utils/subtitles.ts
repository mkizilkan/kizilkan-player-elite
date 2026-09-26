/**
 * KIZILKAN PLAYER — Dış altyazı (SRT / WebVTT) yükleyici (v18.2.0)
 *
 * Yerel videonun yanındaki aynı adlı altyazı dosyası (film.srt, film.tr.srt…)
 * okunur ve zaman damgalı satırlara (cue) çevrilir. Oynatıcı bu satırları
 * motor bağımsız bir katmanda çizer (Media3 / VLC / MPV üçünde de aynı).
 *
 * KODLAMA: Türkçe altyazıların çoğu Windows-1254'tür. Dosya ham bayt (base64)
 * okunur; geçerli UTF-8 ise UTF-8, değilse Windows-1254 olarak çözülür
 * (ş/ğ/ı/İ bozulmaz). Hermes'te TextDecoder'a güvenilmediği için çözücü burada.
 */
import * as FileSystem from "expo-file-system/legacy";

export type SubtitleCue = { start: number; end: number; text: string };

const MAX_BYTES = 3 * 1024 * 1024;
export const SUBTITLE_EXT = ["srt", "vtt"];

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0, buf = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 0xff; }
  }
  return out.subarray(0, o);
}

/** Katı UTF-8 çözümü; geçersiz dizi görürse null döner. */
function decodeUtf8Strict(b: Uint8Array): string | null {
  let s = "";
  let i = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  const parts: string[] = [];
  while (i < b.length) {
    const c = b[i];
    let cp: number;
    if (c < 0x80) { cp = c; i += 1; }
    else if ((c & 0xe0) === 0xc0) {
      if (i + 1 >= b.length || (b[i + 1] & 0xc0) !== 0x80) return null;
      cp = ((c & 0x1f) << 6) | (b[i + 1] & 0x3f); i += 2;
      if (cp < 0x80) return null;
    } else if ((c & 0xf0) === 0xe0) {
      if (i + 2 >= b.length || (b[i + 1] & 0xc0) !== 0x80 || (b[i + 2] & 0xc0) !== 0x80) return null;
      cp = ((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f); i += 3;
    } else if ((c & 0xf8) === 0xf0) {
      if (i + 3 >= b.length || (b[i + 1] & 0xc0) !== 0x80 || (b[i + 2] & 0xc0) !== 0x80 || (b[i + 3] & 0xc0) !== 0x80) return null;
      cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f); i += 4;
    } else return null;
    s += String.fromCodePoint(cp);
    if (s.length > 4096) { parts.push(s); s = ""; }
  }
  parts.push(s);
  return parts.join("");
}

/** Windows-1254 (Türkçe) 0x80–0x9F ve 0xD0/0xDD/0xDE/0xF0/0xFD/0xFE farkları. */
const CP1254_80_9F = [0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x8e, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x9e, 0x178];
function decodeCp1254(b: Uint8Array): string {
  const parts: string[] = [];
  let s = "";
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    let cp = c;
    if (c >= 0x80 && c <= 0x9f) cp = CP1254_80_9F[c - 0x80];
    else if (c === 0xd0) cp = 0x11e; // Ğ
    else if (c === 0xdd) cp = 0x130; // İ
    else if (c === 0xde) cp = 0x15e; // Ş
    else if (c === 0xf0) cp = 0x11f; // ğ
    else if (c === 0xfd) cp = 0x131; // ı
    else if (c === 0xfe) cp = 0x15f; // ş
    s += String.fromCharCode(cp);
    if (s.length > 4096) { parts.push(s); s = ""; }
  }
  parts.push(s);
  return parts.join("");
}

function parseTime(t: string): number {
  // 00:01:02,345  |  00:01:02.345  |  01:02.345 (VTT kısa biçim)
  const m = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/.exec(t.trim());
  if (!m) return NaN;
  const h = Number(m[1] || 0), mi = Number(m[2]), se = Number(m[3]), ms = Number(m[4].padEnd(3, "0"));
  return h * 3600 + mi * 60 + se + ms / 1000;
}

function cleanText(t: string): string {
  return t
    .replace(/<\/?(?:i|b|u|font|c|v)[^>]*>/gi, "")
    .replace(/\{\\[^}]*\}/g, "") // ASS etiketleri {\an8}
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}

export function parseSubtitleText(raw: string): SubtitleCue[] {
  const text = raw.replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter(l => l.trim().length);
    const ti = lines.findIndex(l => l.includes("-->"));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split("-->");
    const start = parseTime(a);
    const end = parseTime(String(b || "").split(/\s+/).filter(Boolean)[0] || "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const body = cleanText(lines.slice(ti + 1).join("\n"));
    if (body) cues.push({ start, end, text: body });
  }
  cues.sort((x, y) => x.start - y.start);
  return cues;
}

export async function loadSubtitleCues(uri: string): Promise<{ cues: SubtitleCue[]; encoding: "utf-8" | "windows-1254"; bytes: number }> {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToBytes(b64);
  if (bytes.length > MAX_BYTES) throw new Error(`Altyazı dosyası çok büyük (${Math.round(bytes.length / 1024)} KB)`);
  const utf8 = decodeUtf8Strict(bytes);
  const text = utf8 ?? decodeCp1254(bytes);
  return { cues: parseSubtitleText(text), encoding: utf8 != null ? "utf-8" : "windows-1254", bytes: bytes.length };
}

/** İkili arama: verilen saniyede görünmesi gereken satır(lar). */
export function cueAt(cues: SubtitleCue[], t: number): string {
  let lo = 0, hi = cues.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (idx < 0) return "";
  const out: string[] = [];
  // Çakışan satırlar (aynı anda iki konuşmacı) için geriye doğru kısa tarama.
  for (let i = idx; i >= 0 && i >= idx - 3; i--) {
    if (cues[i].start <= t && t < cues[i].end) out.unshift(cues[i].text);
  }
  return out.join("\n");
}

/** v18.2.0: Chromecast metin izi için WebVTT (alıcı SRT okumaz). */
export function cuesToVtt(cues: SubtitleCue[]): string {
  const ts = (t: number) => {
    const ms = Math.max(0, Math.round(t * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
  };
  return "WEBVTT\n\n" + cues.map(c => `${ts(c.start)} --> ${ts(c.end)}\n${c.text}`).join("\n\n") + "\n";
}
