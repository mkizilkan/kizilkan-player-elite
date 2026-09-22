/**
 * KIZILKAN PLAYER ELITE v17.0.5 — taşınabilir, insan-okunur hesap arşivi.
 * Tam arşiv tekrar içe aktarılabilir; güvenli rapor credential alanlarını maskeler.
 */
export type AccountArchiveRecord = {
  name?: string; username: string; password: string; server: string;
  panelName?: string; serverCode?: string; primaryHost?: string; validatedHosts?: string[];
  login?: any;
};

function field(v: any, fallback = "Sunucu bildirmedi"): string {
  return v === undefined || v === null || String(v).trim() === "" ? fallback : String(v);
}
function dateFromEpoch(v: any): string {
  const n = Number(v); if (!Number.isFinite(n) || n <= 0) return field(v);
  try { return new Date(n * 1000).toLocaleString("tr-TR"); } catch { return String(v); }
}
function mask(v: string, keep = 2): string {
  const s = String(v || ""); if (!s) return ""; if (s.length <= keep * 2) return "*".repeat(s.length);
  return `${s.slice(0, keep)}${"*".repeat(Math.max(4, s.length - keep * 2))}${s.slice(-keep)}`;
}
function xtreamLink(server: string, username: string, password: string): string {
  const base = String(server || "").replace(/\/+$/, "");
  return `${base}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`;
}

export function buildKizilkanAccountArchive(records: AccountArchiveRecord[], safe = false): string {
  const stamp = new Date().toLocaleString("tr-TR");
  const lines: string[] = [
    "KIZILKAN PLAYER ELITE — HESAP ARŞİVİ", "Sürüm                : 17.0.5", `Oluşturulma           : ${stamp}`,
    `Kayıt Sayısı          : ${records.length}`, `Mod                   : ${safe ? "GÜVENLİ RAPOR (MASKELİ)" : "TAM ARŞİV / YENİDEN İÇE AKTARILABİLİR"}`, "",
  ];
  records.forEach((r, i) => {
    const ui = r.login?.user_info || r.login || {};
    const username = safe ? mask(r.username) : r.username;
    const password = safe ? "********" : r.password;
    const server = r.primaryHost || r.server;
    const link = safe ? `${server}/get.php?username=${mask(r.username)}&password=********&type=m3u_plus&output=ts` : xtreamLink(server, r.username, r.password);
    const hosts = Array.from(new Set((r.validatedHosts?.length ? r.validatedHosts : [server]).filter(Boolean)));
    lines.push(
      "============================================================", `KIZILKAN PLAYER ELITE — HESAP #${String(i + 1).padStart(6, "0")}`,
      "============================================================", `Hesap Adı             : ${field(r.name, "Adsız Hesap")}`, "Tür                   : XTREAM",
      `Durum                 : ${field(ui.status, ui.auth === 1 || ui.auth === "1" ? "Active" : "Bilinmiyor")}`,
      `Sunucu Kodu           : ${field(r.serverCode, "Yok / doğrudan sunucu")}`, `Panel Adı              : ${field(r.panelName)}`,
      `Hesap Linki           : ${link}`, `Panel / Sunucu         : ${server}`, `Kullanıcı Adı          : ${username}`, `Şifre                  : ${password}`,
      `Maksimum Kullanıcı    : ${field(ui.max_connections)}`, `Aktif Bağlantı         : ${field(ui.active_cons ?? ui.active_connections)}`,
      `Oluşturulma Tarihi    : ${dateFromEpoch(ui.created_at)}`, `Bitiş Tarihi           : ${dateFromEpoch(ui.exp_date)}`,
      // v17.5.0: Biçimli tarihin yanına MAKİNE-OKUNUR değer. Geri yüklemede
      // kalan gün hesabı bu alandan yapılır; biçimli metin yalnız okuma içindir.
      `Bitiş (epoch)          : ${field(ui.exp_date)}`,
      `Birincil Sunucu       : ${server}`, `Doğrulanmış Sunucular  : ${hosts.length}`,
      ...hosts.map((h, hi) => `  [${hi + 1}] ${h}`), ""
    );
  });
  return lines.join("\n") + "\n";
}

/* ===========================================================================
 * v17.5.0 — ARŞİVDEN GERİ YÜKLEME (P0)
 * ---------------------------------------------------------------------------
 * SORUN: Kullanıcı bulunan hesapları TXT'ye kaydedebiliyordu ama GERİ
 * YÜKLEYEMİYORDU. Sebep: arşiv insan-okunur rapor biçiminde yazılıyor
 * ("Kullanıcı Adı : xxx"), mevcut dosya okuyucu ise satır bazlı biçim
 * (user:pass) bekliyor. Yani kendi ürettiğimiz dosyayı kendimiz okuyamıyorduk.
 *
 * Bu ayrıştırıcı buildKizilkanAccountArchive'ın ÜRETTİĞİ biçimi okur.
 * Maskeli (güvenli) arşivler içe aktarılamaz — şifre "********" olduğu için
 * kullanılamaz; bu durum ayrıca bildirilir ki kullanıcı neden olmadığını
 * anlasın.
 * =========================================================================== */

export interface ParsedArchiveAccount {
  name: string;
  username: string;
  password: string;
  server: string;
  panelName: string;
  serverCode: string;
  validatedHosts: string[];
  /** Arşivdeki bilgilendirme alanları (yeniden doğrulanana kadar gösterilir). */
  status: string;
  maxConnections: string;
  expiryText: string;
  /**
   * v17.5.0 — Bitiş tarihinin UNIX zaman damgası (saniye), yoksa null.
   * Yeni arşivlerde "Bitiş (epoch)" alanından okunur; ESKİ arşivlerde
   * "31.03.2026 23:33:20" biçimli metinden çözülür. Kartlarda "kalan gün"
   * hesabı bu değere dayanır — daha önce bu alan olmadığı için "bilinmiyor"
   * yazıyordu.
   */
  expiryEpoch: number | null;
  /** Şifre maskeliyse bu kayıt içe aktarılamaz. */
  masked: boolean;
}

export interface ParsedArchive {
  accounts: ParsedArchiveAccount[];
  /** Arşiv başlığındaki mod bilgisi ("GÜVENLİ RAPOR" ise şifreler maskeli). */
  safeMode: boolean;
  createdAt: string;
  declaredCount: number;
  warnings: string[];
}

/** "Etiket   : değer" satırından değeri alır. Türkçe etiketler eşleşir. */
function labelValue(line: string): { key: string; value: string } | null {
  const i = line.indexOf(":");
  if (i < 0) return null;
  const key = line.slice(0, i).trim();
  const value = line.slice(i + 1).trim();
  if (!key) return null;
  return { key, value };
}

const MASK_RE = /^\*+$|\*{4,}/;

/**
 * "31.03.2026 23:33:20" veya "31.03.2026" biçimini UNIX saniyeye çevirir.
 * Eski arşivlerde ham epoch bulunmadığı için geriye dönük çözüm.
 */
function epochFromTrDate(text: string): number | null {
  const m = String(text || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, d, mo, y, hh, mi, ss] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh || 0), Number(mi || 0), Number(ss || 0));
  const t = Math.floor(dt.getTime() / 1000);
  return Number.isFinite(t) && t > 0 ? t : null;
}

/** Arşiv metnini ayrıştırır. Biçim tanınmazsa accounts boş döner. */
export function parseKizilkanAccountArchive(text: string): ParsedArchive {
  const warnings: string[] = [];
  const lines = String(text || "").split(/\r?\n/);
  const out: ParsedArchiveAccount[] = [];
  let safeMode = false;
  let createdAt = "";
  let declaredCount = 0;

  // --- Başlık ---
  for (const line of lines.slice(0, 10)) {
    const kv = labelValue(line);
    if (!kv) continue;
    if (/^Mod$/i.test(kv.key)) safeMode = /GÜVENL|MASKEL/i.test(kv.value);
    if (/^Oluşturulma$/i.test(kv.key)) createdAt = kv.value;
    if (/^Kayıt Sayısı$/i.test(kv.key)) declaredCount = Number(kv.value) || 0;
  }

  // --- Kayıtlar ---
  let cur: Partial<ParsedArchiveAccount> | null = null;
  let collectingHosts = false;
  const hosts: string[] = [];

  const flush = () => {
    if (!cur) return;
    const username = String(cur.username || "").trim();
    const password = String(cur.password || "").trim();
    const server = String(cur.server || "").trim();
    if (username && server) {
      const masked = !password || MASK_RE.test(password) || MASK_RE.test(username);
      out.push({
        name: String(cur.name || cur.panelName || "Adsız Hesap"),
        username, password, server,
        panelName: String(cur.panelName || ""),
        serverCode: String(cur.serverCode || ""),
        validatedHosts: hosts.length ? [...hosts] : [server],
        status: String(cur.status || ""),
        maxConnections: String(cur.maxConnections || ""),
        expiryText: String(cur.expiryText || ""),
        // Önce ham alan (yeni arşiv), yoksa biçimli metinden çöz (eski arşiv).
        expiryEpoch: (() => {
          const raw = Number(cur.expiryEpoch);
          if (Number.isFinite(raw) && raw > 0) return raw;
          return epochFromTrDate(String(cur.expiryText || ""));
        })(),
        masked,
      });
    }
    cur = null; hosts.length = 0; collectingHosts = false;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^KIZILKAN PLAYER ELITE — HESAP #/i.test(line.trim())) { flush(); cur = {}; continue; }
    if (/^=+$/.test(line.trim())) continue;
    if (!cur) continue;

    // Doğrulanmış sunucu satırları:  "  [1] http://host:8080"
    const hostMatch = line.match(/^\s*\[\d+\]\s*(\S+)/);
    if (collectingHosts && hostMatch) { hosts.push(hostMatch[1]); continue; }

    const kv = labelValue(line);
    if (!kv) continue;
    const k = kv.key.replace(/\s+/g, " ").trim();

    if (/^Hesap Adı$/i.test(k)) cur.name = kv.value;
    else if (/^Durum$/i.test(k)) cur.status = kv.value;
    else if (/^Sunucu Kodu$/i.test(k)) cur.serverCode = /^Yok/i.test(kv.value) ? "" : kv.value;
    else if (/^Panel Adı$/i.test(k)) cur.panelName = kv.value;
    else if (/^Panel \/ Sunucu$/i.test(k) || /^Birincil Sunucu$/i.test(k)) { if (!cur.server) cur.server = kv.value; }
    else if (/^Kullanıcı Adı$/i.test(k)) cur.username = kv.value;
    else if (/^Şifre$/i.test(k)) cur.password = kv.value;
    else if (/^Maksimum Kullanıcı$/i.test(k)) cur.maxConnections = kv.value;
    else if (/^Bitiş Tarihi$/i.test(k)) cur.expiryText = kv.value;
    else if (/^Bitiş \(epoch\)$/i.test(k)) { const n = Number(kv.value); if (Number.isFinite(n) && n > 0) (cur as any).expiryEpoch = n; }
    else if (/^Doğrulanmış Sunucular$/i.test(k)) collectingHosts = true;
  }
  flush();

  if (out.length === 0) warnings.push("Dosya KIZILKAN hesap arşivi biçiminde değil veya hiç kayıt içermiyor.");
  if (safeMode) warnings.push("Bu arşiv GÜVENLİ RAPOR modunda kaydedilmiş; şifreler maskeli olduğu için hesaplar içe aktarılamaz.");
  if (declaredCount && out.length !== declaredCount) {
    warnings.push(`Arşiv ${declaredCount} kayıt bildiriyor, ${out.length} kayıt okunabildi.`);
  }
  return { accounts: out, safeMode, createdAt, declaredCount, warnings };
}

/** Dosyanın arşiv biçiminde olup olmadığını hızlı sınar (tam ayrıştırma yapmadan). */
export function looksLikeKizilkanArchive(text: string): boolean {
  const head = String(text || "").slice(0, 2000);
  return /KIZILKAN PLAYER ELITE — HESAP ARŞİVİ/i.test(head) || /KIZILKAN PLAYER ELITE — HESAP #/i.test(head);
}
