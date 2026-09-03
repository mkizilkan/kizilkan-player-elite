/**
 * KIZILKAN PLAYER ELITE v17.0.4 — taşınabilir, insan-okunur hesap arşivi.
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
    "KIZILKAN PLAYER ELITE — HESAP ARŞİVİ", "Sürüm                : 17.0.4", `Oluşturulma           : ${stamp}`,
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
      `Birincil Sunucu       : ${server}`, `Doğrulanmış Sunucular  : ${hosts.length}`,
      ...hosts.map((h, hi) => `  [${hi + 1}] ${h}`), ""
    );
  });
  return lines.join("\n") + "\n";
}
