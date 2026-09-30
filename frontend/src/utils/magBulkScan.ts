/**
 * KIZILKAN PLAYER v18.7.0 — ÇOKLU MAC TARAMA ORKESTRATÖRÜ.
 * ===========================================================================
 * magBulk.ts'in ürettiği işleri (host × MAC) sırayla/eşzamanlı tarar:
 *   1. Host portu/portalı bilinmiyorsa discoverMagPortal ile bulunur (host başına BİR kez, önbellek).
 *   2. stalkerLogin ile MAC denenir; sonuç sınıflandırılır (geçerli/dolmuş/bloke/hata).
 *   3. Yalnız GEÇERLİ sonuçlar UI'da eklenmeye aday olur.
 * Proxy açıksa setMagProxyRouting ile taranan hostlar proxy havuzuna yönlendirilir; bitince temizlenir.
 * Ban-güvenli: düşük eşzamanlılık (MAG portalları çoğu "1 kullanıcı"), duraklat/devam/iptal.
 *
 * YASAL: yalnız kullanıcının KENDİ MAC adresleri (UI uyarısı). Bu modül kısıt getirmez.
 * ===========================================================================
 */
// v18.7.1: stalker.ts projenin her yerinde TEMBEL yüklenir (açılış yükü); bu dosya da mag-bulk
// ekranı üzerinden açılışta yüklendiği için aynı kurala uyar (yalnız tip içe aktarımı statik).
import type { StalkerCreds } from "@/src/utils/stalker";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import { portalDiscoveryCandidates, type MagBulkJob, type MagHostEntry } from "@/src/utils/magBulk";

export type MagScanCategory = "valid" | "expired" | "blocked" | "no-portal" | "error";

export type MagScanResult = {
  hostRaw: string;
  portal: string;           // keşfedilen/kullanılan tam portal adresi
  mac: string;
  category: MagScanCategory;
  status?: string;          // portal profil durumu (ham)
  expiry?: string | null;   // bitiş tarihi (varsa)
  liveCount?: number;       // biliniyorsa canlı sayısı
  message?: string;         // hata/açıklama
};

export type MagScanControl = {
  isCancelled?: () => boolean;
  waitIfPaused?: () => Promise<void>;
  signal?: AbortSignal;
};

export type MagScanOptions = {
  concurrency?: number;
  useProxy?: boolean;
  /** Host başına keşif aday sınırı (ban-güvenli). */
  maxCandidatesPerHost?: number;
  onResult?: (r: MagScanResult) => void;
  onProgress?: (done: number, total: number, current?: string) => void;
  control?: MagScanControl;
};

/** Portal profil durumundan kategori. Aktif + gelecekte bitiş → geçerli. */
function classifyStatus(status: string | undefined, expiry: string | null | undefined): MagScanCategory {
  const s = String(status || "").toLowerCase();
  if (/block|ban|disable|deakt|kapal/.test(s)) return "blocked";
  if (/expire|süre|bitti|dol/.test(s)) return "expired";
  if (expiry) {
    const t = Date.parse(expiry);
    if (Number.isFinite(t) && t < Date.now()) return "expired";
  }
  // "Active", "1", "OK", boş (bazı portallar durum vermez ama login başarılı) → geçerli.
  return "valid";
}

/** Tek işi tarar (portal keşfi + login + sınıflandırma). portalCache host başına keşfi paylaşır. */
async function scanOne(
  job: MagBulkJob,
  portalCache: Map<string, string | null>,
  opts: MagScanOptions,
): Promise<MagScanResult> {
  const base: MagScanResult = { hostRaw: job.hostRaw, portal: job.portal, mac: job.mac, category: "error" };
  const signal = opts.control?.signal;
  const { discoverMagPortal, normalizeStalkerAccountInfo, stalkerLogin } = await import("@/src/utils/stalker");
  try {
    // 1) Portal adresi: kullanıcı port verdiyse doğrudan; yoksa host başına bir kez keşif.
    let portal = job.portal;
    if (!job.hasPort) {
      const cacheKey = job.portal.toLowerCase();
      if (!portalCache.has(cacheKey)) {
        const entry: MagHostEntry = { raw: job.hostRaw, host: job.portal, hasPort: false };
        const cands = portalDiscoveryCandidates(entry);
        const found = await discoverMagPortal({ portal: job.portal, mac: job.mac }, cands, { signal, maxCandidates: opts.maxCandidatesPerHost });
        portalCache.set(cacheKey, found?.endpoint || null);
      }
      const discovered = portalCache.get(cacheKey);
      if (!discovered) return { ...base, category: "no-portal", message: "MAG/stalker destekli portal bulunamadı." };
      portal = discovered;
    }
    base.portal = portal;

    // 2) Login (portal doğrulaması + profil).
    const cred: StalkerCreds = { portal, mac: job.mac };
    const { session, profile } = await stalkerLogin(cred, { forceFresh: true, signal });
    const info = normalizeStalkerAccountInfo(profile);
    const category = session.profileError && !profile ? "error" : classifyStatus(info.status, info.tariff_expired_date);
    return {
      ...base,
      portal,
      category,
      status: info.status,
      expiry: info.tariff_expired_date,
      message: session.profileError || undefined,
    };
  } catch (e: any) {
    const kind = String(e?.kind || "");
    const status = Number(e?.status || 0);
    // MAC tanınmadı / yetki reddi → bloke (geçersiz MAC). Rate-limit/ağ → hata.
    if (status === 401 || status === 403 || /authorization|not authorized|unauthori/i.test(String(e?.snippet || e?.message || ""))) {
      return { ...base, category: "blocked", message: "MAC yetkili değil ya da başka cihaza kilitli." };
    }
    return { ...base, category: "error", message: `${kind || "HATA"}: ${String(e?.message || e).slice(0, 140)}` };
  }
}

/**
 * İş listesini tarar. Eşzamanlılık düşük tutulur (MAG portalları çoğu tek kullanıcı).
 * Proxy açıksa taranan tüm hostlar proxy havuzuna yönlendirilir (bitince temizlenir).
 */
export async function runMagBulkScan(jobs: MagBulkJob[], opts: MagScanOptions = {}): Promise<MagScanResult[]> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 8));
  const results: MagScanResult[] = [];
  const portalCache = new Map<string, string | null>();
  const total = jobs.length;
  let done = 0;
  let cursor = 0;

  const uniqueHosts = Array.from(new Set(jobs.map(j => j.portal)));
  const { setMagProxyRouting } = await import("@/src/utils/stalker");
  if (opts.useProxy) setMagProxyRouting(uniqueHosts, true);
  void recordDiagnostic("scan", "MAG_BULK_SCAN_START", { jobs: total, hosts: uniqueHosts.length, concurrency, proxy: !!opts.useProxy });

  const worker = async () => {
    while (true) {
      if (opts.control?.isCancelled?.()) return;
      await opts.control?.waitIfPaused?.();
      const i = cursor++;
      if (i >= jobs.length) return;
      const job = jobs[i];
      opts.onProgress?.(done, total, `${job.hostRaw} · ${job.mac}`);
      const r = await scanOne(job, portalCache, opts);
      results.push(r);
      done++;
      opts.onResult?.(r);
      opts.onProgress?.(done, total, `${job.hostRaw} · ${job.mac}`);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  } finally {
    if (opts.useProxy) setMagProxyRouting(uniqueHosts, false);
  }
  const valid = results.filter(r => r.category === "valid").length;
  void recordDiagnostic("scan", "MAG_BULK_SCAN_DONE", { jobs: total, scanned: done, valid });
  return results;
}
