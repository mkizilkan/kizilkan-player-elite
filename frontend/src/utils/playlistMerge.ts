/**
 * KIZILKAN PLAYER — Aynı hesabı tek listede birleştirme (v18.7.42, #1 yeniden tasarım)
 * ==========================================================================
 * Combo/yedek/çoklu eklemeden gelen AYNI hesap, her biri tam katalog kopyasıyla ayrı
 * playlist olarak duruyor (DB şişmesi). Bunları TEK hesapta toplar; farklı DNS'ler
 * YEDEK DNS olur (oynatıcı biri ölünce 2.,3.,4.'yü otomatik dener — PlayerHost
 * playbackCandidates zaten var). KOPYALAR silinir (katalog + liste).
 *
 * v18.7.42 — "TAMAMEN AYNI HESAP" ölçütü artık panelName DEĞİL, hesabın GERÇEK
 * kimliği: Xtream `accountInfo.exp_date + created_at`, MAG `MAC + exp_date`. Aynı
 * kullanıcı adı/şifre farklı panelde FARKLI hesap olabilir → ayırt edici bu iki
 * zaman damgasıdır (panelName sadece mağaza etiketidir, aynı abonelik 11 farklı adla
 * gelebilir). Kimlik bilgisi yoksa (hiç doğrulanmamış liste) kullanıcı+şifre'ye düşer.
 * Son karar kullanıcıda: önizleme ekranı grubu gösterir, kullanıcı onaylar/seçer (SEÇENEK A).
 *
 * v18.7.42 — Birleştirmede her panelin SUNUCU KODU korunur: birincilin
 * `serverCodeBinding.sources` dizisi tüm üyelerin kaynaklarının BİRLEŞİMİ olur →
 * DNS ölünce `resolveBoundPanel` 11 panelin hepsini paralel sorup hangisi önce taze
 * adres yayınlarsa oradan çeker. Tek panel yerine tüm panel kodları arkada çalışır.
 */
import type { Playlist, ServerCodeBinding } from "@/src/types";
import type { PanelOrigin } from "@/src/utils/panelDirectoryModel";
import { normalizeHost } from "@/src/player/hostFailover";

const norm = (s: unknown) => String(s ?? "").trim();
const lc = (s: unknown) => norm(s).toLocaleLowerCase("tr");

/**
 * Hesabın GERÇEK kimlik imzası: Xtream exp_date+created_at, MAG exp_date.
 * accountInfo yoksa boş string (kimlik bilinmiyor) döner.
 */
export function accountIdentitySig(pl: Playlist): string {
  const ai = (pl as any).accountInfo || {};
  const exp = norm(ai.exp_date ?? ai.expiry ?? ai.expiryDate);
  const cre = norm(ai.created_at ?? ai.createdAt);
  if (exp || cre) return `${exp}|${cre}`;
  return "";
}

/** Sunucu/DNS'ten bağımsız kimlik kovası: Xtream user+pass, MAG MAC. Yetersiz → null. */
export function credentialKey(pl: Playlist): string | null {
  if (pl.source === "stalker") {
    const mac = lc(pl.stalkerMac);
    return mac ? `mag|${mac}` : null;
  }
  const u = lc(pl.xtreamUsername), p = norm(pl.xtreamPassword);
  if (!u || !p) return null;
  return `xt|${u}|${p}`;
}

/**
 * Tam birleştirme anahtarı = kimlik kovası + gerçek kimlik imzası.
 * panelName ARTIK KULLANILMAZ (aynı abonelik farklı mağaza adıyla gelebilir).
 * Kimlik imzası yoksa yalnız kullanıcı+şifre'ye (yedek) düşer.
 */
export function accountMergeKey(pl: Playlist): string | null {
  const base = credentialKey(pl);
  if (!base) return null;
  const sig = accountIdentitySig(pl);
  return sig ? `${base}#${sig}` : base;
}

export type MergeGroup = { key: string; members: Playlist[]; primary: Playlist };

/** Katalog zenginliği (canlı+film+dizi). Birincil seçiminde en zengin tutulur → içerik kaybolmaz. */
function catalogScore(pl: Playlist): number {
  return (Number((pl as any).channelsCount) || 0) + (Number((pl as any).vodCount) || 0) + (Number((pl as any).seriesCount) || 0);
}

/** Birincil = en zengin katalog → en çok DNS → en güncel. (Dizi=0 kopya birincil kalıp içerik kaybetmesin.) */
function makeGroup(key: string, members: Playlist[]): MergeGroup {
  const primary = [...members].sort((a, b) => {
    const c = catalogScore(b) - catalogScore(a); if (c) return c;
    const h = hostsOf(b).length - hostsOf(a).length; if (h) return h;
    const ta = Date.parse(String((a as any).lastRefreshedAt || "")) || 0;
    const tb = Date.parse(String((b as any).lastRefreshedAt || "")) || 0;
    return tb - ta;
  })[0];
  return { key, members, primary };
}

/**
 * Aynı hesaba ait 2+ listeyi grupla.
 * 1) Kullanıcı+şifre (veya MAC) kovasına ayır — sunucu/DNS hiç bakılmaz.
 * 2) Kova içinde FARKLI (exp_date,created_at) imzaları varsa gerçekten farklı
 *    hesaplardır → imzaya göre alt gruplara böl; kimliği BİLİNMEYEN üye (imza yok)
 *    hiçbir imzaya atanamaz → tek başına kalır (kanıtsız birleştirilmez).
 * 3) Kovada tek (veya hiç) imza varsa → hepsi tek grup (aynı hesap).
 */
export function findDuplicateGroups(playlists: Playlist[]): MergeGroup[] {
  const byCred = new Map<string, Playlist[]>();
  for (const pl of playlists) {
    const c = credentialKey(pl);
    if (!c) continue;
    byCred.set(c, [...(byCred.get(c) || []), pl]);
  }
  const groups: MergeGroup[] = [];
  for (const [cred, members] of byCred) {
    if (members.length < 2) continue;
    const sigs = new Set(members.map(accountIdentitySig).filter(Boolean));
    if (sigs.size <= 1) {
      // Aynı creds + tek/boş kimlik → aynı hesap.
      groups.push(makeGroup(cred, members));
    } else {
      // Aynı creds AMA ≥2 farklı kimlik → farklı hesaplar; imzaya göre böl.
      const bySig = new Map<string, Playlist[]>();
      for (const m of members) {
        const s = accountIdentitySig(m);
        if (!s) continue; // kimlik bilinmiyor → kanıtsız birleştirme
        bySig.set(s, [...(bySig.get(s) || []), m]);
      }
      for (const [s, subs] of bySig) {
        if (subs.length >= 2) groups.push(makeGroup(`${cred}#${s}`, subs));
      }
    }
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

/**
 * Gruptaki TÜM üyelerin `serverCodeBinding.sources`'larını tekilleştirip birleştirir
 * (baseUrl + panelName + realCode anahtarıyla). sources yoksa codeSource+panelName'den
 * bir origin türetir. Böylece her panelin SUNUCU KODU korunur; DNS ölünce hepsi denenir.
 */
export function mergedServerCodeSources(group: MergeGroup): PanelOrigin[] {
  const seen = new Map<string, PanelOrigin>();
  for (const m of group.members) {
    const scb = (m as any).serverCodeBinding as ServerCodeBinding | undefined;
    if (!scb) continue;
    const srcs = scb.sources;
    if (srcs?.length) {
      for (const s of srcs) {
        if (!s || !norm(s.baseUrl)) continue;
        const k = `${lc(s.baseUrl)}|${lc(s.panelName)}|${lc(s.realCode)}`;
        if (!seen.has(k)) seen.set(k, s);
      }
    } else if (norm(scb.codeSource) && norm(scb.panelName)) {
      const k = `${lc(scb.codeSource)}|${lc(scb.panelName)}|${lc(scb.code)}`;
      if (!seen.has(k)) {
        seen.set(k, {
          source: "splayer",
          baseUrl: scb.codeSource,
          panelName: scb.panelName,
          realCode: scb.code || null,
          hosts: (scb.validatedHosts || []).map(String),
        });
      }
    }
  }
  return Array.from(seen.values());
}

/**
 * Birleştirilen tek listenin `serverCodeBinding`'i: birincilin (yoksa herhangi bir
 * üyenin) binding'i tohum, `sources` tüm panellerin birleşimi, `validatedHosts` tüm
 * doğrulanmış hostların birleşimi, otomatik tazeleme AÇIK. Hiç kod yoksa undefined.
 */
export function buildMergedServerCodeBinding(group: MergeGroup): ServerCodeBinding | undefined {
  const sources = mergedServerCodeSources(group);
  const seed = ((group.primary as any).serverCodeBinding
    || group.members.map(m => (m as any).serverCodeBinding).find(Boolean)) as ServerCodeBinding | undefined;
  if (!sources.length && !seed) return undefined;
  const validated = new Set<string>();
  for (const m of group.members) {
    const b = (m as any).serverCodeBinding as ServerCodeBinding | undefined;
    (b?.validatedHosts || []).forEach(h => { const n = normalizeHost(String(h || "")); if (n) validated.add(n); });
    hostsOf(m).forEach(h => validated.add(h));
  }
  return {
    ...(seed || ({ code: "", panelName: "", codeSource: "" } as ServerCodeBinding)),
    sources,
    autoResolve: true,
    allowDirectoryAlternatives: true,
    validatedHosts: Array.from(validated),
  };
}
