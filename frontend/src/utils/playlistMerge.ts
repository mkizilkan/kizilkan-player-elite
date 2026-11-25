/**
 * KIZILKAN PLAYER — Aynı hesabı tek listede birleştirme (v18.7.41, #1)
 * ==========================================================================
 * Combo'dan defalarca eklenen AYNI hesap, her biri tam katalog kopyasıyla ayrı
 * playlist olarak duruyor (DB şişmesi). Bunları TEK hesapta toplar; farklı DNS'ler
 * YEDEK DNS olur (oynatıcı biri ölünce 2.,3.,4.'yü otomatik dener — PlayerHost
 * playbackCandidates zaten var). KOPYALAR silinir (katalog + liste).
 *
 * "Tamamen aynı hesap" ölçütü: aynı kaynak + aynı kimlik (Xtream: kullanıcı adı+şifre,
 * MAG: MAC) + aynı panel (serverCodeBinding.panelName varsa). SADECE user:pass'e
 * bakılmaz — aynı user:pass farklı panelde olabilir (kullanıcı uyarısı). Son karar
 * kullanıcıda: önizleme ekranı grubu gösterir, kullanıcı onaylar/seçer (seçenek A).
 */
import type { Playlist } from "@/src/types";
import { normalizeHost } from "@/src/player/hostFailover";

const norm = (s: unknown) => String(s ?? "").trim();
const lc = (s: unknown) => norm(s).toLocaleLowerCase("tr");

/** Bir hesabın birleştirme grup anahtarı. Boş/yetersiz kimlik → null (gruplanmaz). */
export function accountMergeKey(pl: Playlist): string | null {
  if (pl.source === "stalker") {
    const mac = lc(pl.stalkerMac);
    if (!mac) return null;
    return `mag|${mac}|${lc((pl as any).serverCodeBinding?.panelName)}`;
  }
  // Xtream / hit / sunucu-kodu
  const u = lc(pl.xtreamUsername), p = norm(pl.xtreamPassword);
  if (!u || !p) return null;
  // Panel kimliği varsa anahtara dahil → farklı panel yanlışlıkla birleşmez.
  const panel = lc((pl as any).serverCodeBinding?.panelName);
  return `xt|${u}|${p}|${panel}`;
}

export type MergeGroup = { key: string; members: Playlist[]; primary: Playlist };

/** Aynı hesaba ait 2+ listeyi grupla. Birincil = en çok yedek DNS'i / en güncel olan. */
export function findDuplicateGroups(playlists: Playlist[]): MergeGroup[] {
  const byKey = new Map<string, Playlist[]>();
  for (const pl of playlists) {
    const key = accountMergeKey(pl);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) || []), pl]);
  }
  const groups: MergeGroup[] = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    // Birincil: en çok doğrulanmış host'u olan, eşitse en son yenilenen.
    const score = (pl: Playlist) => hostsOf(pl).length * 1e9 + Number((pl as any).lastRefreshedAt ? Date.parse(String((pl as any).lastRefreshedAt)) || 0 : 0);
    const primary = [...members].sort((a, b) => score(b) - score(a))[0];
    groups.push({ key, members, primary });
  }
  return groups;
}

/** Bir listenin bildiği tüm DNS/sunucu adresleri (birincil + yedek + doğrulanmış + MAG portalları). */
export function hostsOf(pl: Playlist): string[] {
  const out = new Set<string>();
  const add = (h: unknown) => { const n = normalizeHost(String(h || "")); if (n) out.add(n); };
  if (pl.source === "stalker") {
    add(pl.stalkerPortal);
    (pl.stalkerBackupPortals || []).forEach(add);
  } else {
    add(pl.xtreamServer);
    (pl.backupHosts || []).forEach(add);
    ((pl as any).serverCodeBinding?.validatedHosts || []).forEach(add);
  }
  return Array.from(out);
}

/**
 * Birleştirmede birincile yazılacak YEDEK host listesi: gruptaki TÜM üyelerin
 * tüm DNS'leri (birincilin birincil adresi hariç — o "primary" olarak kalır).
 * SINIRSIZ (kullanıcı isteği). Biri çalışmazsa oynatıcı sırayla diğerlerini dener.
 */
export function mergedBackupHosts(group: MergeGroup): string[] {
  const all = new Set<string>();
  for (const m of group.members) hostsOf(m).forEach(h => all.add(h));
  const primaryHost = group.primary.source === "stalker"
    ? normalizeHost(String(group.primary.stalkerPortal || ""))
    : normalizeHost(String(group.primary.xtreamServer || ""));
  all.delete(primaryHost);
  return Array.from(all);
}
