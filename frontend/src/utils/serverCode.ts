/**
 * SUNUCU KODU İLE GİRİŞ — ÇÖZÜCÜ (v9.13.0)
 * ===========================================================================
 * Amaç: DNS adresini unutmuş / DNS'i sık değişen panellerdeki kullanıcılar
 * (özellikle yaşlı kullanıcılar) için kolaylık. Kullanıcı sadece kısa bir
 * "Panel Kodu" + kullanıcı adı + şifre girer; uygulama kodu bir uzak kaynaktan
 * çözer, çalışan DNS'i bulur ve standart Xtream akışına devreder.
 *
 * ÖNEMLİ TASARIM: Kaynak (base URL) KODA SABİT GÖMÜLÜ DEĞİLDİR.
 * Uygulama sahibinin (senin) verdiği bir VARSAYILAN ile gelir ama Ayarlar'dan
 * değiştirilebilir. Böylece belirli bir üçüncü-taraf adresine kilitli değil,
 * uygulamayı yöneten kişinin kontrolündeki kaynağa bakar.
 *
 * Akış:
 *   1) {base}/Master/zeroWebServers/{KOD}.json   -> panel adı (string)
 *   2) {base}/Master/Servers/{panel adı}.json    -> { Hosts: { ad: dns, ... } }
 *   3) Host'lar sırayla xtreamLogin ile denenir; ilk çalışan DNS seçilir.
 * ===========================================================================
 */
import { xtreamLogin } from "@/src/utils/iptv";

/** Uygulama sahibinin verdiği VARSAYILAN kaynak. Ayarlardan değiştirilebilir.
 *  Storage'da değer yoksa bu kullanılır. */
export const DEFAULT_CODE_SOURCE =
  "https://splayer-747601f.asia-southeast1.firebasedatabase.app";

/** Kaynak URL'i storage'da saklamak için anahtar. */
export const CODE_SOURCE_KEY = "kizilkan.codeSource.baseUrl";

function trimBase(u: string): string {
  return String(u || "").trim().replace(/\/+$/, "");
}

async function getJson(url: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Kaynağa bağlanılamadı. İnternet veya kaynak adresini kontrol edin.");
  }
  if (!res.ok) throw new Error(`Kaynak yanıtı hatalı (HTTP ${res.status}).`);
  try {
    return await res.json();
  } catch {
    throw new Error("Kaynaktan beklenmeyen yanıt geldi.");
  }
}

/** Adım A: Panel kodu -> panel adı. */
export async function resolvePanelName(baseUrl: string, code: string): Promise<string> {
  const base = trimBase(baseUrl);
  if (!base) throw new Error("Kod kaynağı adresi boş.");
  const c = String(code || "").trim();
  if (!c) throw new Error("Panel kodu boş.");
  const data = await getJson(`${base}/Master/zeroWebServers/${encodeURIComponent(c)}.json`);
  // Firebase bulunamayan yolda null döner.
  if (data == null || typeof data !== "string" || !data.trim()) {
    throw new Error("Panel kodu bulunamadı. Kodu kontrol edin.");
  }
  return data.trim();
}

/** Adım B: Panel adı -> DNS host listesi. */
export async function resolveHosts(baseUrl: string, panelName: string): Promise<string[]> {
  const base = trimBase(baseUrl);
  const data = await getJson(`${base}/Master/Servers/${encodeURIComponent(panelName)}.json`);
  const hostsObj = data && typeof data === "object" ? (data as any).Hosts : null;
  if (!hostsObj || typeof hostsObj !== "object") {
    throw new Error("Bu panel için sunucu adresi bulunamadı.");
  }
  const hosts = Object.values(hostsObj)
    .map((v) => trimBase(String(v)))
    .filter(Boolean);
  if (hosts.length === 0) throw new Error("Sunucu adresi listesi boş.");
  // Tekilleştir (aynı DNS birden çok ada bağlı olabilir).
  return Array.from(new Set(hosts));
}

/** Adım C: Host'ları sırayla dener, İLK çalışan (kimlik doğrulayan) DNS'i döner. */
export async function pickWorkingHost(
  hosts: string[],
  username: string,
  password: string
): Promise<{ server: string; login: { user_info: any; server_info: any } }> {
  let lastErr: Error | null = null;
  for (const server of hosts) {
    try {
      const login = await xtreamLogin({ server, username, password });
      return { server, login };
    } catch (e: any) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  // Hepsi denendi, hiçbiri çalışmadı.
  throw lastErr || new Error("Hiçbir sunucu adresi çalışmadı.");
}



export type PanelDirectoryItem = {
  code: string;
  panelName: string;
  hosts: string[];
};

/**
 * Firebase kataloğunu tek seferde okur ve kullanıcıya gösterilecek panel rehberini
 * üretir. Kullanıcı adı/şifre BU İŞLEMDE KULLANILMAZ ve Firebase'e gönderilmez.
 */
export async function fetchPanelDirectory(baseUrl: string): Promise<PanelDirectoryItem[]> {
  const base = trimBase(baseUrl);
  if (!base) throw new Error("Kod kaynağı adresi boş.");

  const [codesRaw, serversRaw] = await Promise.all([
    getJson(`${base}/Master/zeroWebServers.json`),
    getJson(`${base}/Master/Servers.json`),
  ]);

  const codes = codesRaw && typeof codesRaw === "object" ? codesRaw as Record<string, any> : {};
  const servers = serversRaw && typeof serversRaw === "object" ? serversRaw as Record<string, any> : {};
  const out: PanelDirectoryItem[] = [];

  for (const [code, rawName] of Object.entries(codes)) {
    const panelName = typeof rawName === "string" ? rawName.trim() : "";
    if (!panelName) continue;
    const rec = servers[panelName];
    const hostsObj = rec && typeof rec === "object" ? (rec as any).Hosts : null;
    const hosts = hostsObj && typeof hostsObj === "object"
      ? Array.from(new Set(Object.values(hostsObj).map(v => trimBase(String(v))).filter(Boolean)))
      : [];
    if (hosts.length === 0) continue;
    out.push({ code: String(code), panelName, hosts });
  }

  out.sort((a, b) => a.panelName.localeCompare(b.panelName, "tr", { sensitivity: "base" }) || a.code.localeCompare(b.code));
  if (out.length === 0) throw new Error("Panel rehberinde kullanılabilir kayıt bulunamadı.");
  return out;
}

function makeTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Hızlı keşif doğrulaması. Kimlik bilgileri yalnız aday IPTV sunucusunun
 * player_api.php adresine gönderilir; Firebase'e gönderilmez.
 */
async function probeXtreamHost(
  server: string,
  username: string,
  password: string,
  timeoutMs = 12000,
): Promise<{ user_info: any; server_info: any } | null> {
  const base = trimBase(server);
  const { signal, cancel } = makeTimeoutSignal(timeoutMs);
  try {
    const url = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const ui = data?.user_info;
    if (!ui) return null;
    if (ui.auth === 0 || ui.auth === "0") return null;
    return { user_info: ui, server_info: data?.server_info || {} };
  } catch {
    return null;
  } finally {
    cancel();
  }
}

export type AutoDiscoveryProgress = {
  tested: number;
  total: number;
  panelTested: number;
  panelTotal: number;
  found: number;
  panelName?: string;
};

export type PanelCredentialMatch = {
  panelName: string;
  code: string;
  server: string;
  login: { user_info: any; server_info: any };
};

export type HostDiscoveryProgress = { tested: number; total: number; found: number; server?: string };

export type ScanExecutionControl = {
  isCancelled?: () => boolean;
  waitIfPaused?: () => Promise<void>;
};

/**
 * GPT ELITE v12.5.0 — belirli bir panel/kod için TÜM DNS adreslerini sınar.
 * İlk başarılı hostta durmaz. Kullanıcı adı/şifre yalnız IPTV hostlarına gider.
 */
export async function discoverServerCodeHosts(
  baseUrl: string,
  code: string,
  username: string,
  password: string,
  onProgress?: (p: HostDiscoveryProgress) => void,
  concurrency = 6,
  timeoutMs = 8000,
  control?: ScanExecutionControl,
): Promise<PanelCredentialMatch[]> {
  const panelName = await resolvePanelName(baseUrl, code);
  const hosts = await resolveHosts(baseUrl, panelName);
  const user = String(username || "").trim();
  const pass = String(password || "").trim();
  if (!user || !pass) throw new Error("Kullanıcı adı ve şifre gereklidir.");

  let cursor = 0;
  let tested = 0;
  const matches: PanelCredentialMatch[] = [];
  const workers = Math.max(1, Math.min(Number(concurrency) || 1, 20, hosts.length));
  const runWorker = async () => {
    while (true) {
      if (control?.isCancelled?.()) return;
      if (control?.waitIfPaused) await control.waitIfPaused();
      if (control?.isCancelled?.()) return;
      const i = cursor++;
      if (i >= hosts.length) return;
      const server = hosts[i];
      onProgress?.({ tested, total: hosts.length, found: matches.length, server });
      const login = await probeXtreamHost(server, user, pass, timeoutMs);
      tested += 1;
      if (login) matches.push({ panelName, code: String(code).trim(), server, login });
      onProgress?.({ tested, total: hosts.length, found: matches.length, server });
    }
  };
  await Promise.all(Array.from({ length: workers }, () => runWorker()));
  if (!matches.length && !control?.isCancelled?.()) throw new Error("Bu panelin DNS adreslerinde kullanıcı adı/şifre doğrulanamadı.");
  matches.sort((a,b) => a.server.localeCompare(b.server));
  return matches;
}

function matchKey(m: Pick<PanelCredentialMatch, "panelName" | "code" | "server">): string {
  return `${m.code}\u0000${m.panelName}\u0000${trimBase(m.server).toLowerCase()}`;
}

/**
 * Kullanıcı panel kodunu/adını bilmiyorsa TÜM adayları tarar.
 *
 * GPT v10.5.1 güvenlik kuralı:
 * - İlk başarılı hostta DURMAZ.
 * - Aynı kullanıcı/şifre birden fazla panelde geçerliyse tüm panel eşleşmeleri
 *   döner; UI kullanıcıya seçim yaptırır.
 * - Kimlik bilgileri Firebase'e gönderilmez; yalnız cihaz -> aday IPTV sunucusu.
 *
 * Aynı DNS farklı panel kayıtlarında bulunabiliyorsa panel kimliği kaybolmasın
 * diye adaylar panel-kodu + panel-adı + host üçlüsü olarak tutulur.
 */
export async function discoverPanelsByCredentials(
  baseUrl: string,
  username: string,
  password: string,
  onProgress?: (p: AutoDiscoveryProgress) => void,
  concurrency = 5,
  timeoutMs = 12000,
  directoryOverride?: PanelDirectoryItem[],
  control?: ScanExecutionControl,
): Promise<PanelCredentialMatch[]> {
  const user = String(username || "").trim();
  const pass = String(password || "").trim();
  if (!user || !pass) throw new Error("Kullanıcı adı ve şifre gereklidir.");

  const directory = directoryOverride?.length ? directoryOverride : await fetchPanelDirectory(baseUrl);
  const candidates: Array<{ panelName: string; code: string; server: string }> = [];
  const seenCandidates = new Set<string>();

  for (const item of directory) {
    for (const server of item.hosts) {
      const candidate = { panelName: item.panelName, code: item.code, server };
      const key = matchKey(candidate);
      if (seenCandidates.has(key)) continue;
      seenCandidates.add(key);
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) throw new Error("Denenebilecek sunucu bulunamadı.");

  let cursor = 0;
  let tested = 0;
  const matches: PanelCredentialMatch[] = [];
  const matchSeen = new Set<string>();
  const panelTotal = new Set(candidates.map(c => `${c.code}\u0000${c.panelName}`)).size;
  const remainingByPanel = new Map<string, number>();
  for (const c of candidates) {
    const k = `${c.code}\u0000${c.panelName}`;
    remainingByPanel.set(k, (remainingByPanel.get(k) || 0) + 1);
  }
  let panelTested = 0;
  const workers = Math.max(1, Math.min(Number(concurrency) || 1, 20, candidates.length));

  const runWorker = async () => {
    while (true) {
      if (control?.isCancelled?.()) return;
      if (control?.waitIfPaused) await control.waitIfPaused();
      if (control?.isCancelled?.()) return;
      const i = cursor++;
      if (i >= candidates.length) return;
      const c = candidates[i];

      onProgress?.({ tested, total: candidates.length, panelTested, panelTotal, found: matches.length, panelName: c.panelName });
      const login = await probeXtreamHost(c.server, user, pass, timeoutMs);
      tested += 1;
      const panelKey = `${c.code}\u0000${c.panelName}`;
      const left = Math.max(0, (remainingByPanel.get(panelKey) || 1) - 1);
      remainingByPanel.set(panelKey, left);
      if (left === 0) panelTested += 1;

      if (login) {
        const m: PanelCredentialMatch = { ...c, login };
        const key = matchKey(m);
        if (!matchSeen.has(key)) {
          matchSeen.add(key);
          matches.push(m);
        }
      }
      onProgress?.({ tested, total: candidates.length, panelTested, panelTotal, found: matches.length, panelName: c.panelName });
    }
  };

  await Promise.all(Array.from({ length: workers }, () => runWorker()));

  if (matches.length === 0 && !control?.isCancelled?.()) {
    throw new Error("Bu kullanıcı adı ve şifre panel rehberindeki sunucularda bulunamadı.");
  }

  // GPT ELITE v12.5.0: Aynı panelin birden fazla DNS'i başarılıysa ARTIK
  // birleştirilmez. Kullanıcı tüm doğrulanmış DNS hesaplarını görür ve seçer.
  matches.sort((a, b) =>
    a.panelName.localeCompare(b.panelName, "tr", { sensitivity: "base" }) ||
    a.code.localeCompare(b.code) ||
    a.server.localeCompare(b.server)
  );
  return matches;
}

/**
 * Geriye dönük tek-eşleşme yardımcı API'si.
 * Yeni UI discoverPanelsByCredentials kullanır; bu fonksiyon yalnız mevcut
 * dış çağrıları kırmamak için korunur.
 */
export async function discoverPanelByCredentials(
  baseUrl: string,
  username: string,
  password: string,
  onProgress?: (p: AutoDiscoveryProgress) => void,
  concurrency = 5,
): Promise<PanelCredentialMatch> {
  const matches = await discoverPanelsByCredentials(
    baseUrl, username, password, onProgress, concurrency
  );
  const panelIds = new Set(matches.map(m => `${m.code}\u0000${m.panelName}`));
  if (panelIds.size > 1) {
    throw new Error("Bu bilgiler birden fazla panelde bulundu. Panel seçimi gereklidir.");
  }
  // Aynı panelin birden fazla DNS'i geçerliyse geriye dönük API ilkini döndürür.
  return matches[0];
}

export type BoundPanelResolution = {
  panelName: string;
  code: string;
  server: string;
  login: { user_info: any; server_info: any };
  hosts: string[];
};

/**
 * Daha önce kullanıcı tarafından seçilip playlist'e bağlanmış panelin güncel
 * DNS'ini çöz.
 *
 * Güvenlik:
 * - Önce KAYITLI panelName'in Hosts kaydı kullanılır.
 * - Kod bugün başka bir panel adına dönüyorsa otomatik olarak o yeni panele
 *   geçilmez. Kullanıcı yanlış aboneliğe kaydırılmaz.
 * - Kullanıcı adı/şifre Firebase'e gönderilmez; yalnız aday IPTV hostlarına.
 */
export async function resolveBoundPanel(
  baseUrl: string,
  binding: { code: string; panelName: string; preferredServer?: string; validatedHosts?: string[] },
  username: string,
  password: string,
): Promise<BoundPanelResolution> {
  const expectedPanel = String(binding.panelName || "").trim();
  const code = String(binding.code || "").trim();
  if (!expectedPanel || !code) throw new Error("Kayıtlı panel kimliği eksik.");

  let hosts: string[] = [];
  try {
    hosts = await resolveHosts(baseUrl, expectedPanel);
  } catch (directErr) {
    // Panel adı kaydı taşınmış/yenilenmiş olabilir. Kodu kontrol et ama
    // güvenlik nedeniyle farklı bir panel adına otomatik bağlanma.
    const currentName = await resolvePanelName(baseUrl, code);
    const normalize = (x: string) => x.trim().toLocaleLowerCase("tr");
    if (normalize(currentName) !== normalize(expectedPanel)) {
      throw new Error(
        `Sunucu kodu artık farklı bir panele ait görünüyor (${currentName}). Güvenlik için otomatik geçiş yapılmadı.`
      );
    }
    hosts = await resolveHosts(baseUrl, currentName);
  }

  const preferred = trimBase(binding.preferredServer || "");
  const validated = (binding.validatedHosts || []).map(trimBase).filter(Boolean);
  const directoryHosts = hosts.map(trimBase).filter(Boolean);
  const currentSet = new Set(directoryHosts.map(h => h.toLowerCase()));

  /**
   * GPT ELITE v14.1.0 — DNS SELF-HEAL ÖNCELİĞİ
   * Firebase/rehberde panel DNS listesi değişmişse artık rehberde bulunmayan
   * eski preferredServer ilk sırada denenmez. Güncel rehber hostları önce,
   * eski doğrulanmış adresler yalnız fallback olarak kullanılır.
   * Preferred hâlâ güncel rehberdeyse kullanıcı tercihi korunur.
   */
  const preferredIsCurrent = !!preferred && currentSet.has(preferred.toLowerCase());
  const currentOrdered = preferredIsCurrent
    ? [preferred, ...directoryHosts.filter(h => h.toLowerCase() !== preferred.toLowerCase())]
    : directoryHosts;
  const legacyFallbacks = [preferred, ...validated].filter(
    h => h && !currentSet.has(h.toLowerCase())
  );
  const ordered = Array.from(new Set([...currentOrdered, ...legacyFallbacks].filter(Boolean)));
  const { server, login } = await pickWorkingHost(ordered, username, password);
  return { panelName: expectedPanel, code, server, login, hosts: ordered };
}

/**
 * Tümü bir arada: panel kodu + kullanıcı bilgileri -> çalışan DNS + login.
 * Çözülen DNS, standart Xtream listesi oluşturmak için kullanılır (iptv.ts).
 */
export async function resolveServerCode(
  baseUrl: string,
  code: string,
  username: string,
  password: string
): Promise<{ panelName: string; server: string; login: { user_info: any; server_info: any }; hosts: string[] }> {
  const panelName = await resolvePanelName(baseUrl, code);
  const hosts = await resolveHosts(baseUrl, panelName);
  const { server, login } = await pickWorkingHost(hosts, username, password);
  return { panelName, server, login, hosts };
}
