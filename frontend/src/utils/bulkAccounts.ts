/**
 * GPT KIZILKAN PLAYER ELITE — Çoklu IPTV Hesap İçe Aktarma
 * Sürüm: v14.2.0
 *
 * Amaç: Aynı aile/ebeveyn için birden fazla Xtream hesabını tek işlemde
 * hazırlamak. Dosya cihazda okunur; kullanıcı adı/şifre Firebase'e gönderilmez.
 *
 * Desteklenen girişler:
 * - JSON array (alan adları Türkçe/İngilizce alias kabul eder)
 * - CSV / TSV / noktalı virgül / pipe ayrımlı TXT
 * - Başlıksız satırlar:
 *     ad|kullanici|sifre|sunucu-veya-kod-veya-panel
 *     kullanici|sifre|sunucu-veya-kod-veya-panel
 *     kullanici|sifre   -> panel bilinmiyor / otomatik arama
 *     kullanici:sifre   -> panel bilinmiyor / otomatik arama
 */

export type BulkAccountInput = {
  row: number;
  name: string;
  username: string;
  password: string;
  server?: string;
  serverCode?: string;
  panelName?: string;
};

export type BulkAccountParseResult = {
  accounts: BulkAccountInput[];
  warnings: string[];
};

const NAME_KEYS = ["ad", "adi", "isim", "liste", "listeadi", "playlist", "playlistname", "name", "displayname"];
const USER_KEYS = ["kullanici", "kullaniciadi", "user", "username", "login"];
const PASS_KEYS = ["sifre", "parola", "pass", "password"];
const SERVER_KEYS = ["sunucu", "server", "dns", "url", "host", "portal"];
const CODE_KEYS = ["kod", "panelkodu", "sunucukodu", "servercode", "code"];
const PANEL_KEYS = ["panel", "paneladi", "panelname"];

function normKey(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

function first(obj: Record<string, unknown>, aliases: string[]): string {
  for (const [k, v] of Object.entries(obj)) {
    if (aliases.includes(normKey(k))) {
      const val = String(v ?? "").trim();
      if (val) return val;
    }
  }
  return "";
}

function looksLikeServer(v: string): boolean {
  return /^https?:\/\//i.test(v) || /^[a-z0-9.-]+:\d+(?:\/.*)?$/i.test(v) || /\.[a-z]{2,}(?::\d+)?(?:\/|$)/i.test(v);
}

function looksLikeCode(v: string): boolean {
  return /^\d{2,12}$/.test(v.trim());
}

function normalizeServer(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, "");
  return `http://${s.replace(/\/+$/, "")}`;
}

function fromObject(raw: Record<string, unknown>, row: number): BulkAccountInput | null {
  const username = first(raw, USER_KEYS);
  const password = first(raw, PASS_KEYS);
  if (!username || !password) return null;
  const server = first(raw, SERVER_KEYS);
  const serverCode = first(raw, CODE_KEYS);
  const panelName = first(raw, PANEL_KEYS);
  return {
    row,
    name: first(raw, NAME_KEYS),
    username,
    password,
    ...(server ? { server: normalizeServer(server) } : {}),
    ...(serverCode ? { serverCode } : {}),
    ...(panelName ? { panelName } : {}),
  };
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cur.trim()); cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function guessDelimiter(line: string): string {
  const choices = ["\t", "|", ";", ","];
  let best = "|", count = -1;
  for (const d of choices) {
    const n = parseDelimitedLine(line, d).length;
    if (n > count) { count = n; best = d; }
  }
  return best;
}

function rowObject(headers: string[], values: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  headers.forEach((h, i) => { out[h] = values[i] ?? ""; });
  return out;
}

function headerLooksValid(headers: string[]): boolean {
  const keys = headers.map(normKey);
  return keys.some(k => USER_KEYS.includes(k)) && keys.some(k => PASS_KEYS.includes(k));
}

/**
 * Tek satırlık `kullanici:sifre` hızlı girişini güvenli biçimde ayırır.
 * URL (`http://...`) ve alan etiketi (`username: foo`) satırlarını bu biçim
 * sanmamak için sol tarafı daraltıyoruz. Şifrede ek `:` karakterleri olabilir;
 * yalnız ilk iki nokta ayırıcı kabul edilir.
 */
function fromUserPasswordLine(line: string, row: number): BulkAccountInput | null {
  const raw = String(line || "").trim();
  if (!raw || raw.includes("://") || /[|;\t,]/.test(raw)) return null;
  const idx = raw.indexOf(":");
  if (idx <= 0 || idx >= raw.length - 1) return null;
  const username = raw.slice(0, idx).trim();
  const password = raw.slice(idx + 1).trim();
  if (!username || !password || /\s/.test(username)) return null;
  const key = normKey(username);
  if ([...USER_KEYS, ...PASS_KEYS, ...SERVER_KEYS, ...CODE_KEYS, ...PANEL_KEYS].includes(key)) return null;
  return { row, name: "", username, password };
}

function fromHeaderless(values: string[], row: number): BulkAccountInput | null {
  const vals = values.map(v => v.trim()).filter((v, i, a) => !(i === a.length - 1 && !v));
  if (vals.length < 2) return null;

  let name = "", username = "", password = "", locator = "";
  if (vals.length >= 4) {
    [name, username, password, locator] = vals;
  } else if (vals.length === 3) {
    [username, password, locator] = vals;
  } else {
    [username, password] = vals;
  }
  if (!username || !password) return null;
  const base: BulkAccountInput = { row, name, username, password };
  if (locator) {
    if (looksLikeServer(locator)) base.server = normalizeServer(locator);
    else if (looksLikeCode(locator)) base.serverCode = locator;
    else base.panelName = locator;
  }
  return base;
}

export function parseBulkAccounts(text: string): BulkAccountParseResult {
  const raw = String(text || "").replace(/^\uFEFF/, "").trim();
  const warnings: string[] = [];
  if (!raw) return { accounts: [], warnings: ["İçe aktarılacak hesap verisi boş."] };

  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.accounts) ? parsed.accounts : [parsed];
      const accounts: BulkAccountInput[] = [];
      list.forEach((item: unknown, i: number) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          warnings.push(`JSON kayıt ${i + 1}: nesne değil, atlandı.`); return;
        }
        const account = fromObject(item as Record<string, unknown>, i + 1);
        if (account) accounts.push(account);
        else warnings.push(`JSON kayıt ${i + 1}: kullanıcı adı veya şifre eksik, atlandı.`);
      });
      return { accounts, warnings };
    } catch (e: any) {
      warnings.push(`JSON okunamadı (${e?.message || "geçersiz JSON"}); metin satırları olarak denendi.`);
    }
  }

  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#"));
  if (!lines.length) return { accounts: [], warnings: ["Geçerli satır bulunamadı."] };
  const delimiter = guessDelimiter(lines[0]);
  const firstValues = parseDelimitedLine(lines[0], delimiter);
  const hasHeader = headerLooksValid(firstValues);
  const headers = hasHeader ? firstValues : [];
  const start = hasHeader ? 1 : 0;
  const accounts: BulkAccountInput[] = [];

  for (let i = start; i < lines.length; i++) {
    const quickPair = !hasHeader ? fromUserPasswordLine(lines[i], i + 1) : null;
    const values = parseDelimitedLine(lines[i], delimiter);
    const account = quickPair || (hasHeader
      ? fromObject(rowObject(headers, values), i + 1)
      : fromHeaderless(values, i + 1));
    if (account) accounts.push(account);
    else warnings.push(`Satır ${i + 1}: kullanıcı adı/şifre bulunamadı, atlandı.`);
  }

  return { accounts, warnings };
}


export function bulkAccountFromManual(
  input: { name?: string; username?: string; password?: string; locator?: string },
  row = 1,
): BulkAccountInput | null {
  const username = String(input.username || "").trim();
  const password = String(input.password || "").trim();
  if (!username || !password) return null;
  const locator = String(input.locator || "").trim();
  const out: BulkAccountInput = {
    row,
    name: String(input.name || "").trim(),
    username,
    password,
  };
  if (locator) {
    if (looksLikeServer(locator)) out.server = normalizeServer(locator);
    else if (looksLikeCode(locator)) out.serverCode = locator;
    else out.panelName = locator;
  }
  return out;
}

export function bulkAccountLocatorLabel(a: BulkAccountInput): string {
  if (a.server) return `Sunucu: ${a.server}`;
  if (a.serverCode) return `Sunucu kodu: ${a.serverCode}`;
  if (a.panelName) return `Panel: ${a.panelName}`;
  return "Panel bilinmiyor — otomatik aranacak";
}

export const BULK_ACCOUNT_EXAMPLE = `ad,kullanici,sifre,sunucu_kodu\nAnnem,ali123,abc987,22722\nBabam,mehmet55,xyz456,7765\n\n# Hızlı biçim (panel otomatik aranır)\nali123:abc987`;
