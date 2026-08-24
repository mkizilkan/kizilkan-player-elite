import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { api } from "@/src/utils/api";
import {
  fetchAndParseM3U, parseM3U,
  xtreamLogin as xtLoginLocal,
  xtreamLiveStreams, xtreamVod as xtVodLocal, xtreamSeries as xtSeriesLocal,
  detectXtreamFromM3U,
} from "@/src/utils/iptv";
import type { Playlist, AccountInfo, ServerCodeBinding } from "@/src/types";
import { FocusButton } from "@/src/components/FocusButton";
import {
  DEFAULT_CODE_SOURCE, CODE_SOURCE_KEY,
  fetchPanelDirectory, discoverPanelsByCredentials, discoverServerCodeHosts,
  resolvePanelDirectoryItem,
  type PanelDirectoryItem, type PanelCredentialMatch, type ScanExecutionControl,
} from "@/src/utils/serverCode";
import { PanelScan, type NativeScanStartResult } from "@/modules/panel-scan";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import { storage } from "@/src/utils/storage";
import {
  BULK_ACCOUNT_EXAMPLE,
  bulkAccountFromManual,
  bulkAccountLocatorLabel,
  parseBulkAccounts,
  type BulkAccountInput,
} from "@/src/utils/bulkAccounts";

type Method = "m3u_url" | "m3u_file" | "xtream" | "stalker" | "code" | "bulk";
type CodeMode = "code" | "directory" | "auto";
type ScanSpeed = "very_safe" | "safe" | "balanced" | "fast" | "turbo";
type BulkResolvedCandidate = {
  key: string;
  sourceRow: number;
  name: string;
  username: string;
  password: string;
  panelName: string;
  code: string;
  server: string;
  login: any;
  validatedHosts: string[];
  direct: boolean;
};

const PENDING_BULK_SCAN_KEY = "kizilkan.pendingBulkScan.v15.2.3";
const PENDING_BULK_IMPORT_KEY = "kizilkan.pendingBulkImport.v15.2.3";

function stablePlaylistId(prefix: string, identity: string): string {
  const key = String(identity || "").trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `pl-${prefix}-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function stableXtreamPlaylistId(server: string, username: string): string {
  return stablePlaylistId("xt", `${String(server).replace(/\/+$/, "").toLowerCase()}\u0000${username}`);
}


function formatScanDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return min > 0 ? `${min} dk ${rem} sn` : `${rem} sn`;
}

function scanEta(createdAt: number, tested: number, total: number): string {
  if (!createdAt || tested <= 0 || total <= tested) return total <= tested && total > 0 ? "0 sn" : "hesaplanıyor";
  const elapsed = Math.max(1, Date.now() - createdAt);
  return formatScanDuration((elapsed / tested) * (total - tested));
}

function canonicalUrlIdentity(value: string): string {
  const raw = String(value || "").trim();
  const m = raw.match(/^(https?):\/\/([^/]+)(.*)$/i);
  if (!m) return raw.replace(/\/+$/, "").toLowerCase();
  const protocol = m[1].toLowerCase();
  let authority = m[2].toLowerCase();
  if ((protocol === "http" && authority.endsWith(":80")) || (protocol === "https" && authority.endsWith(":443"))) {
    authority = authority.replace(/:(80|443)$/, "");
  }
  const suffix = (m[3] || "").replace(/\/+$/, "");
  return `${protocol}://${authority}${suffix}`;
}

function canonicalMagIdentity(portal: string, mac: string): string {
  return `${canonicalUrlIdentity(portal)}\u0000${String(mac || "").trim().replace(/-/g, ":").toUpperCase()}`;
}

export default function AddPlaylist() {
  /**
   * ALAN ARASI GEÇİŞ (v9.3.0 — kullanıcı isteği)
   * Telefon/tablette klavyedeki "İleri" tuşu, TV'de kumanda OK tuşu bir
   * sonraki alana geçirir. Eskiden her alanı elle seçmek gerekiyordu.
   */
  const refXtUser = React.useRef<any>(null);
  const refXtPass = React.useRef<any>(null);
  const refStMac = React.useRef<any>(null);
  const refStSerial = React.useRef<any>(null);
  const refM3uUrl = React.useRef<any>(null);
  const refXtServer = React.useRef<any>(null);
  const refStPortal = React.useRef<any>(null);
  const formScrollRef = React.useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const router = useRouter();
  const { colors } = useTheme();
  const { playlists, addPlaylist, addPreparedPlaylist } = usePlaylists();
  const playlistServerKeysRef = React.useRef<Set<string>>(new Set());
  const directImportLocksRef = React.useRef<Set<string>>(new Set());
  const restoredImportAdoptedRef = React.useRef<Set<string>>(new Set());
  const bulkImportOwnedByScreenRef = React.useRef(false);
  React.useEffect(() => {
    playlistServerKeysRef.current = new Set(
      playlists
        .filter((pl:any) => pl.source === "xtream" && pl.xtreamServer && pl.xtreamUsername)
        .map((pl:any) => `${String(pl.xtreamUsername)}\u0000${String(pl.xtreamServer).replace(/\/+$/, "").toLowerCase()}`)
    );
  }, [playlists]);

  const [method, setMethod] = useState<Method>("m3u_url");
  const [name, setName] = useState("");
  const [m3uUrl, setM3uUrl] = useState("");
  const [xtServer, setXtServer] = useState("");
  const [xtUser, setXtUser] = useState("");
  const [xtPass, setXtPass] = useState("");
  const [stPortal, setStPortal] = useState("");
  const [stMac, setStMac] = useState("");
  const [stSerial, setStSerial] = useState("");
  // v9.13.0: Sunucu Kodu ile giriş
  const [codeVal, setCodeVal] = useState("");
  const [codeSource, setCodeSource] = useState(DEFAULT_CODE_SOURCE);
  const [showCodeSource, setShowCodeSource] = useState(false);
  // GPT v10.5.0: Yaşlı/teknik olmayan kullanıcılar için üç kolay sunucu-kodu yolu.
  const [codeMode, setCodeMode] = useState<CodeMode>("code");
  const [panelDirectory, setPanelDirectory] = useState<PanelDirectoryItem[]>([]);
  const [panelDirectorySource, setPanelDirectorySource] = useState("");
  const [panelSearch, setPanelSearch] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [selectedPanelName, setSelectedPanelName] = useState("");
  const [selectedPanelItem, setSelectedPanelItem] = useState<PanelDirectoryItem | null>(null);
  // GPT v10.5.1: aynı kullanıcı/şifre birden fazla panelde bulunursa
  // otomatik karar VERME; kullanıcı doğru aboneliği seçsin.
  const [discoveryMatches, setDiscoveryMatches] = useState<PanelCredentialMatch[]>([]);
  const [showDiscoveryMatches, setShowDiscoveryMatches] = useState(false);
  const [discoveryTitle, setDiscoveryTitle] = useState("Hesap / DNS Eşleşmeleri Bulundu");
  const [discoverySubtitle, setDiscoverySubtitle] = useState("Geçerli hesapları seçin.");
  const [selectedDiscoveryKeys, setSelectedDiscoveryKeys] = useState<string[]>([]);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkImportPaused, setBulkImportPaused] = useState(false);
  const [bulkImportStatuses, setBulkImportStatuses] = useState<Record<string, { state: string; message: string; channels?: number; vod?: number; series?: number }>>({});
  const [bulkAccountProgress, setBulkAccountProgress] = useState<Array<{ accountIndex:number; sourceRow?:number; name?:string; state:string; tested:number; total:number; remaining:number; found:number }>>([]);
  const [bulkCandidates, setBulkCandidates] = useState<BulkResolvedCandidate[]>([]);
  const [selectedBulkCandidateKeys, setSelectedBulkCandidateKeys] = useState<string[]>([]);
  const [showBulkCandidates, setShowBulkCandidates] = useState(false);
  const [bulkScanFinished, setBulkScanFinished] = useState(false);
  const [bulkScanFailures, setBulkScanFailures] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [scanSpeed, setScanSpeed] = useState<ScanSpeed>("balanced");
  const [error, setError] = useState<string | null>(null);
  const nativeScanTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const nativeScanSeenRef = React.useRef<Set<string>>(new Set());
  const nativeScanRunIdRef = React.useRef<string>("");
  const bulkScanRunIdRef = React.useRef<string>("");
  const [nativeScanRunning, setNativeScanRunning] = useState(false);
  const [nativeScanPaused, setNativeScanPaused] = useState(false);
  const [nativeScanStopping, setNativeScanStopping] = useState(false);
  const nativePreparationAbortRef = React.useRef<AbortController | null>(null);
  const [bulkScanPaused, setBulkScanPaused] = useState(false);
  const [bulkScanStopping, setBulkScanStopping] = useState(false);
  const bulkPreparationAbortRef = React.useRef<AbortController | null>(null);
  const bulkScanPausedRef = React.useRef(false);
  const bulkScanCancelledRef = React.useRef(false);
  const bulkNativeScanRef = React.useRef(false);
  // GPT ELITE v14.2.0 — çoklu hesap: manuel ve dosya birlikte kullanılabilir.
  // Ham dosya içeriği ayrı state'te tutulur; farklı CSV/TXT/JSON biçimleri
  // birbirine metin olarak yapıştırılıp parser'ı bozmaz.
  const [bulkText, setBulkText] = useState("");
  const [bulkFileText, setBulkFileText] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false);
  const [bulkManualRows, setBulkManualRows] = useState<Array<{ id: string; name: string; username: string; password: string; locator: string }>>([
    { id: "bulk-row-1", name: "", username: "", password: "", locator: "" },
  ]);


  const bulkParsed = React.useMemo(() => {
    const manual = bulkText.trim() ? parseBulkAccounts(bulkText) : { accounts: [] as BulkAccountInput[], warnings: [] as string[] };
    const file = bulkFileText.trim() ? parseBulkAccounts(bulkFileText) : { accounts: [] as BulkAccountInput[], warnings: [] as string[] };
    const formAccounts = bulkManualRows
      .map((r, i) => bulkAccountFromManual(r, i + 1))
      .filter((a): a is BulkAccountInput => !!a);
    const incompleteFormRows = bulkManualRows.filter(r => (r.username.trim() || r.password.trim()) && (!r.username.trim() || !r.password.trim()));
    const warnings = [
      ...manual.warnings.map(w => `Hızlı giriş: ${w}`),
      ...file.warnings.map(w => `${bulkFileName || "Dosya"}: ${w}`),
      ...incompleteFormRows.map((_, i) => `Form satırı ${i + 1}: kullanıcı adı ve şifre birlikte girilmelidir.`),
    ];
    const seen = new Set<string>();
    const accounts: BulkAccountInput[] = [];
    for (const a of [...formAccounts, ...manual.accounts, ...file.accounts]) {
      const locator = a.server || a.serverCode || a.panelName || "auto";
      const key = `${a.username}\u0000${a.password}\u0000${locator}`.toLocaleLowerCase("tr");
      if (seen.has(key)) {
        warnings.push(`${a.name || a.username}: aynı hesap/konum birden fazla kez girildi; tek kez işlenecek.`);
        continue;
      }
      seen.add(key);
      accounts.push(a);
    }
    return { accounts, warnings };
  }, [bulkManualRows, bulkText, bulkFileText, bulkFileName]);


  // v9.13.0: Kaydedilmiş "kod kaynağı" URL'ini yükle (yoksa varsayılan = senin adresin).
  React.useEffect(() => () => {
    if (nativeScanTimerRef.current) clearInterval(nativeScanTimerRef.current);
  }, []);

  React.useEffect(() => {
    storage.getItem<string>(CODE_SOURCE_KEY, "").then((v) => {
      if (v && v.trim()) setCodeSource(v.trim());
    }).catch(() => {});
  }, []);

  // GPT v10.5.2 — Android klavye güvenliği. Edge-to-edge cihazlarda yalnız
  // KeyboardAvoidingView yeterli olmayabiliyor; gerçek klavye yüksekliğini
  // içerik alt boşluğuna ekleyip odaklanan kimlik alanını görünür bölgeye kaydır.
  React.useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const revealCredentialFields = React.useCallback((event: any) => {
    // GPT v11.5.1: scrollToEnd tüm formu gereğinden fazla yukarı fırlatıyordu.
    // Yalnız odaklanan TextInput'u klavyenin hemen üstüne getir.
    if (Platform.OS === "web") return;
    const target = event?.target;
    if (!target) return;
    setTimeout(() => {
      const scroll: any = formScrollRef.current;
      scroll?.scrollResponderScrollNativeHandleToKeyboard?.(target, 48, true);
    }, 80);
  }, []);

  const formatExpiry = (raw: any): string => {
    if (raw == null || raw === "") return "Bilinmiyor";
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return String(raw);
    try {
      return new Date(n * 1000).toLocaleDateString("tr-TR");
    } catch {
      return String(raw);
    }
  };

  const accountSummary = (m: PanelCredentialMatch) => {
    const ui = m.login?.user_info || {};
    const status = String(ui.status || (ui.auth === 1 || ui.auth === "1" ? "Aktif" : "Bilinmiyor"));
    const exp = formatExpiry(ui.exp_date);
    const active = ui.active_cons ?? ui.active_connections ?? "?";
    const max = ui.max_connections ?? "?";
    return { status, exp, active, max };
  };

  const filteredPanels = React.useMemo(() => {
    const q = panelSearch.trim().toLocaleLowerCase("tr");
    if (!q) return panelDirectory.slice(0, 100);
    return panelDirectory
      .filter(p => p.panelName.toLocaleLowerCase("tr").includes(q) || p.code.toLocaleLowerCase("tr").includes(q))
      .slice(0, 100);
  }, [panelDirectory, panelSearch]);

  const loadPanelDirectory = async (forceRefresh = false) => {
    if (directoryLoading) return;
    setError(null);
    setDirectoryLoading(true);
    try {
      const src = codeSource.trim() || DEFAULT_CODE_SOURCE;
      await storage.setItem(CODE_SOURCE_KEY, src);
      const list = await fetchPanelDirectory(src, { forceRefresh });
      setPanelDirectory(list);
      setPanelDirectorySource(src);
      if (list.length === 0) throw new Error("Panel rehberi boş.");
    } catch (e: any) {
      setError(e?.message || "Panel rehberi yüklenemedi.");
    } finally {
      setDirectoryLoading(false);
    }
  };

  const choosePanel = (item: PanelDirectoryItem) => {
    // v15.2.9: kullanıcının seçtiği hosts[] kaybolmaz; submit sırasında Firebase'e
    // ikinci kez gidilmeden doğrudan bu candidate set native scan'e verilir.
    setSelectedPanelItem(item);
    setCodeVal(item.code);
    setSelectedPanelName(item.panelName);
    if (!name.trim()) setName(item.panelName);
    setCodeMode("code");
    setError(null);
    setTimeout(() => refXtUser.current?.focus?.(), 50);
  };

  const makeBinding = (
    code: string,
    panelName: string,
    server: string,
    validatedHosts: string[] = [server],
  ): ServerCodeBinding => ({
    code: String(code).trim(),
    panelName: String(panelName).trim(),
    codeSource: codeSource.trim() || DEFAULT_CODE_SOURCE,
    autoResolve: true,
    preferredServer: server,
    validatedHosts: Array.from(new Set(validatedHosts)),
    lastResolvedServer: server,
    lastResolvedAt: new Date().toISOString(),
  });

  const discoveryKey = (m: PanelCredentialMatch) => `${m.code}\u0000${m.panelName}\u0000${m.server}`;
  const isActiveDiscoveryMatch = (m: PanelCredentialMatch) => String(m.login?.user_info?.status || "").toLowerCase() === "active";

  const hostName = (server: string) => {
    try { return new URL(server).hostname || server; } catch { return server.replace(/^https?:\/\//i, "").replace(/\/$/, ""); }
  };

  const presentMatches = (
    matches: PanelCredentialMatch[],
    title: string,
    subtitle: string,
  ) => {
    const sortedMatches = [...matches].sort((a, b) => {
      const sa = String(a.login?.user_info?.status || "").toLowerCase() === "active" ? 0 : 1;
      const sb = String(b.login?.user_info?.status || "").toLowerCase() === "active" ? 0 : 1;
      return sa - sb || a.panelName.localeCompare(b.panelName, "tr") || a.server.localeCompare(b.server);
    });
    setDiscoveryTitle(title);
    setDiscoverySubtitle(subtitle);
    setDiscoveryMatches(sortedMatches);
    // v15.2.10: sonuç bulundu diye otomatik seçim yapılmaz. Kullanıcı açıkça
    // hangi abonelikleri ekleyeceğini seçer; tarama hiçbir zaman importu tetiklemez.
    setSelectedDiscoveryKeys([]);
    setShowDiscoveryMatches(true);
    setLoading(false);
    setProgress(`Tarama tamamlandı · ${sortedMatches.length} geçerli DNS bulundu.`);
  };

  const scanConfigForSpeed = () => {
    switch (scanSpeed) {
      case "very_safe": return { concurrency: 2, timeoutMs: 16000, accountConcurrency: 1, label: "Çok Güvenli" };
      case "safe": return { concurrency: 3, timeoutMs: 12000, accountConcurrency: 2, label: "Güvenli" };
      case "fast": return { concurrency: 10, timeoutMs: 5000, accountConcurrency: 4, label: "Hızlı" };
      case "turbo": return { concurrency: 16, timeoutMs: 3500, accountConcurrency: 6, label: "Turbo" };
      default: return { concurrency: 6, timeoutMs: 8000, accountConcurrency: 3, label: "Dengeli" };
    }
  };

  const mergeStreamingMatches = React.useCallback((incoming: PanelCredentialMatch[], title: string, subtitle: string) => {
    if (!incoming.length) return;
    setDiscoveryTitle(title);
    setDiscoverySubtitle(subtitle);
    setDiscoveryMatches(prev => {
      const map = new Map(prev.map(m => [discoveryKey(m), m]));
      for (const m of incoming) map.set(discoveryKey(m), m);
      return Array.from(map.values()).sort((a,b) => {
        const sa = String(a.login?.user_info?.status || "").toLowerCase() === "active" ? 0 : 1;
        const sb = String(b.login?.user_info?.status || "").toLowerCase() === "active" ? 0 : 1;
        return sa - sb || a.panelName.localeCompare(b.panelName, "tr") || a.server.localeCompare(b.server);
      });
    });
    // Canlı sonuçlar seçim durumunu değiştirmez. Kullanıcının mevcut seçimleri
    // korunur ve yeni bulunan adaylar kendiliğinden seçilmez.
    for (const m of incoming) nativeScanSeenRef.current.add(discoveryKey(m));
    setShowDiscoveryMatches(true);
  }, []);

  const askReplaceRunningScan = (activeRunId?: string): Promise<boolean> =>
    new Promise(resolve => {
      Alert.alert(
        "Devam eden tarama var",
        "Başka bir panel taraması hâlâ çalışıyor. Onu durdurup yeni taramayı başlatmak ister misiniz?",
        [
          { text: "Vazgeç", style: "cancel", onPress: () => resolve(false) },
          { text: "Durdur ve Yeni Tara", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });

  const waitForScanRelease = async (runId: string, timeoutMs = 25000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (PanelScan.getActiveRunId() !== runId) return;
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    throw new Error("Önceki tarama güvenli biçimde kapatılamadı. Ağ işçileri hâlâ aktif; yeni tarama başlatılmadı.");
  };

  const startAcceptedScan = async (starter: () => Promise<NativeScanStartResult | null>): Promise<string> => {
    let result = await starter();
    if (!result) throw new Error("Native tarama başlatılamadı.");
    if (!result.accepted && result.state === "BUSY") {
      const active = String(result.activeRunId || "");
      const replace = await askReplaceRunningScan(active);
      if (!replace) throw new Error("Yeni tarama başlatılmadı; mevcut tarama çalışmaya devam ediyor.");
      if (!active) throw new Error("Devam eden taramanın kimliği alınamadı.");
      setProgress("Önceki tarama durduruluyor… Açık ağ bağlantıları kapatılıyor ve worker havuzu boşaltılıyor.");
      await PanelScan.cancelScan(active);
      await waitForScanRelease(active);
      result = await starter();
    }
    if (!result?.accepted || !result.runId) {
      throw new Error(result?.state === "BUSY" ? "Panel tarama motoru hâlâ meşgul." : "Native tarama isteği reddedildi.");
    }
    return result.runId;
  };

  const isScanAbort = (e: any) => e?.name === "AbortError" || /kullanıcı tarafından durduruldu/i.test(String(e?.message || e || ""));

  const beginDiscoveryPreparation = (title: string, subtitle: string, progressText: string) => {
    nativePreparationAbortRef.current?.abort();
    const controller = new AbortController();
    nativePreparationAbortRef.current = controller;
    setDiscoveryMatches([]);
    setSelectedDiscoveryKeys([]);
    setDiscoveryTitle(title);
    setDiscoverySubtitle(subtitle);
    setShowDiscoveryMatches(true);
    setNativeScanRunning(true);
    setNativeScanPaused(false);
    setNativeScanStopping(false);
    setLoading(true);
    setProgress(progressText);
    return controller;
  };

  const runNativeBackgroundScan = async (
    candidates: Array<{panelName:string; code:string; server:string}>,
    title: string,
    subtitle: string,
    cfg: { concurrency:number; timeoutMs:number; accountConcurrency?:number; label:string },
  ): Promise<PanelCredentialMatch[]> => {
    if (!PanelScan.available || Platform.OS !== "android") {
      throw new Error("__NATIVE_SCAN_UNAVAILABLE__");
    }
    if (nativeScanTimerRef.current) clearInterval(nativeScanTimerRef.current);
    nativeScanSeenRef.current = new Set();
    setDiscoveryMatches([]);
    setSelectedDiscoveryKeys([]);
    setDiscoveryTitle(title);
    setDiscoverySubtitle("Tarama hazırlanıyor. Bulunan sonuçlar canlı eklenecek; seçim yapılmadan hiçbir playlist eklenmez.");
    setShowDiscoveryMatches(true);
    setNativeScanRunning(true);
    setNativeScanStopping(false);
    setLoading(true);
    nativePreparationAbortRef.current = null;
    let runId = "";
    try {
      runId = await startAcceptedScan(() => PanelScan.startScan(candidates, xtUser.trim(), xtPass.trim(), cfg.concurrency, cfg.timeoutMs));
      nativeScanRunIdRef.current = runId;
      setProgress(`${cfg.label} · NATIVE\nTarama başlatıldı · Adres 0/${candidates.length} · Bulunan 0\nGeçen: 0 sn · Tahmini kalan: hesaplanıyor`);
    } catch (e) {
      setNativeScanRunning(false); setNativeScanPaused(false); setNativeScanStopping(false); setLoading(false);
      throw e;
    }

    return await new Promise<PanelCredentialMatch[]>((resolve, reject) => {
      let settled = false;
      nativeScanTimerRef.current = setInterval(() => {
        const snap = PanelScan.getSnapshot();
        if (snap.runId !== runId) return; // eski/stale snapshot yeni işi tamamlayamaz
        if (snap.error) {
          if (nativeScanTimerRef.current) clearInterval(nativeScanTimerRef.current);
          nativeScanTimerRef.current = null;
          setNativeScanRunning(false); setNativeScanPaused(false); setNativeScanStopping(false); setLoading(false);
          if (nativeScanRunIdRef.current === runId) nativeScanRunIdRef.current = "";
          if (!settled) { settled = true; reject(new Error(snap.error)); }
          return;
        }
        const matches = Array.isArray(snap.matches) ? snap.matches as PanelCredentialMatch[] : [];
        setNativeScanPaused(!!snap.paused);
        mergeStreamingMatches(matches, title, subtitle);
        const pct = snap.total ? Math.round(((snap.tested || 0) / snap.total) * 100) : 0;
        const createdAt = Number(snap.createdAt || Date.now());
        const testedNow = Number(snap.tested || 0);
        const totalNow = Number(snap.total || candidates.length);
        setProgress(
          `${cfg.label} · NATIVE · %${pct}\n` +
          `Panel ${snap.panelTested || 0}/${snap.panelTotal || 0} · Adres ${testedNow}/${totalNow} · Kalan ${Math.max(0,totalNow-testedNow)} · Bulunan ${snap.found || matches.length}` +
          (snap.panelName ? `\nŞu an: ${snap.panelName}${snap.currentServer ? ` · ${snap.currentServer}` : ""}` : "") +
          `\nGeçen: ${formatScanDuration(Date.now()-createdAt)} · Tahmini kalan: ${scanEta(createdAt,testedNow,totalNow)}` +
          (snap.paused ? `\nDURAKLATILDI` : snap.state === "CANCELLING" ? `\nDURDURULUYOR — aktif ağ istekleri kapatılıyor` : "")
        );
        if (snap.running === false && (snap.total || 0) > 0) {
          if (nativeScanTimerRef.current) clearInterval(nativeScanTimerRef.current);
          nativeScanTimerRef.current = null;
          setNativeScanRunning(false); setNativeScanPaused(false); setNativeScanStopping(false); setLoading(false);
          if (nativeScanRunIdRef.current === runId) nativeScanRunIdRef.current = "";
          if (!settled) {
            settled = true;
            setDiscoverySubtitle(snap.cancelled
              ? `Tarama kullanıcı tarafından durduruldu. ${matches.length} sonuç korundu; seçim yapmadan hiçbir playlist eklenmez.`
              : matches.length
                ? `Tarama tamamlandı. ${matches.length} aday bulundu. Eklemek istediklerinizi seçin.`
                : "Tarama tamamlandı. Eşleşme bulunamadı; hiçbir playlist eklenmedi.");
            setProgress(snap.cancelled ? `Tarama durduruldu · ${matches.length} sonuç korundu.` : `Tarama tamamlandı · ${matches.length} aday bulundu.`);
            resolve(matches);
          }
        }
      }, 450);
    });
  };

  const submitKnownPanelDiscovery = async () => {
    if (!codeVal.trim() || !xtUser.trim() || !xtPass.trim()) {
      throw new Error("Panel kodu, kullanıcı adı ve şifre gereklidir");
    }
    const src = codeSource.trim() || DEFAULT_CODE_SOURCE;
    await storage.setItem(CODE_SOURCE_KEY, src);
    const cfg = scanConfigForSpeed();
    const prep = beginDiscoveryPreparation(
      "Panel / DNS Hesapları Bulundu",
      "Panel/DNS adayları hazırlanıyor. Durdur derseniz hazırlık da iptal edilir; seçim yapılmadan hiçbir playlist eklenmez.",
      "Panelin DNS adayları hazırlanıyor…",
    );
    let resolvedPanel: PanelDirectoryItem | null = null;

    try {
      const selectedMatchesCode = selectedPanelItem && selectedPanelItem.code.trim().toLocaleLowerCase("tr") === codeVal.trim().toLocaleLowerCase("tr");
      const panel = selectedMatchesCode ? selectedPanelItem! : await resolvePanelDirectoryItem(src, codeVal.trim(), { signal: prep.signal, timeoutMs: cfg.timeoutMs });
      resolvedPanel = panel;
      if (prep.signal.aborted) { const e = new Error("Tarama hazırlığı kullanıcı tarafından durduruldu."); e.name = "AbortError"; throw e; }
      nativePreparationAbortRef.current = null;
      const panelName = panel.panelName;
      const hosts = panel.hosts;
      const candidates = hosts.map(server => ({ panelName, code: panel.code, server }));
      const matches = await runNativeBackgroundScan(
        candidates,
        `${panelName} · DNS Hesapları`,
        "Geçerli DNS hesapları bulundukça anında listelenir. Eklemek istediklerinizi seçin.",
        cfg,
      );
      mergeStreamingMatches(matches, `${panelName} · DNS Hesapları`,
        `${matches.length} kimlik doğrulaması başarılı DNS adayı bulundu. Eklemek istediklerinizi seçin.`);
    } catch (e:any) {
      if (isScanAbort(e)) {
        nativePreparationAbortRef.current = null;
        setNativeScanRunning(false); setNativeScanPaused(false); setNativeScanStopping(false); setLoading(false);
        setDiscoverySubtitle("Tarama kullanıcı tarafından hazırlık aşamasında durduruldu. Hiçbir playlist eklenmedi.");
        setProgress("Tarama durduruldu · hazırlık iptal edildi.");
        return;
      }
      if (e?.message !== "__NATIVE_SCAN_UNAVAILABLE__") throw e;
      nativePreparationAbortRef.current = null;
      const matches = await discoverServerCodeHosts(
        src, codeVal.trim(), xtUser.trim(), xtPass.trim(),
        (p) => {
          const pct = p.total ? Math.round((p.tested / p.total) * 100) : 0;
          setProgress(`${cfg.label} · %${pct} · DNS ${p.tested}/${p.total} · Bulunan ${p.found}${p.server ? `\nŞu an: ${p.server}` : ""}`);
        },
        cfg.concurrency, cfg.timeoutMs, undefined, resolvedPanel || undefined,
      );
      const fallbackPanelName = resolvedPanel?.panelName || selectedPanelName || codeVal.trim();
      presentMatches(matches, `${fallbackPanelName} · DNS Hesapları`,
        `${matches.length} kimlik doğrulaması başarılı DNS adayı bulundu. Eklemek istediklerinizi seçin.`);
    }
  };


  const submitAutoDiscovery = async () => {
    if (!xtUser.trim() || !xtPass.trim()) throw new Error("Kullanıcı adı ve şifre gereklidir");

    const src = codeSource.trim() || DEFAULT_CODE_SOURCE;
    await storage.setItem(CODE_SOURCE_KEY, src);
    const cfg = scanConfigForSpeed();
    const prep = beginDiscoveryPreparation(
      "Panel / DNS Hesapları Bulundu",
      "Panel rehberi hazırlanıyor. Durdur derseniz hazırlık da iptal edilir; seçim yapılmadan hiçbir playlist eklenmez.",
      "Panel rehberi yükleniyor…",
    );

    try {
      const directory = panelDirectory.length && panelDirectorySource === src
        ? panelDirectory
        : await fetchPanelDirectory(src, { signal: prep.signal, timeoutMs: cfg.timeoutMs });
      if (prep.signal.aborted) { const e = new Error("Tarama hazırlığı kullanıcı tarafından durduruldu."); e.name = "AbortError"; throw e; }
      nativePreparationAbortRef.current = null;
      const seen = new Set<string>();
    const candidates: Array<{panelName:string; code:string; server:string}> = [];
    for (const item of directory) for (const server of item.hosts) {
      const key = `${item.code}\u0000${item.panelName}\u0000${String(server).replace(/\/+$/,"").toLowerCase()}`;
      if (!seen.has(key)) { seen.add(key); candidates.push({panelName:item.panelName, code:item.code, server}); }
    }

      const matches = await runNativeBackgroundScan(
        candidates,
        "Panel / DNS Hesapları Bulundu",
        "Sonuçlar tarama tamamlanmadan anında görünür. İsterseniz bulunan hesabı hemen seçebilirsiniz.",
        cfg,
      );
      mergeStreamingMatches(matches, "Panel / DNS Hesapları Bulundu",
        "Tarama tamamlandı. Geçerli panel/DNS hesaplarını seçin.");
    } catch (e:any) {
      if (isScanAbort(e)) {
        nativePreparationAbortRef.current = null;
        setNativeScanRunning(false); setNativeScanPaused(false); setNativeScanStopping(false); setLoading(false);
        setDiscoverySubtitle("Tarama kullanıcı tarafından hazırlık aşamasında durduruldu. Hiçbir playlist eklenmedi.");
        setProgress("Tarama durduruldu · hazırlık iptal edildi.");
        return;
      }
      if (e?.message !== "__NATIVE_SCAN_UNAVAILABLE__") throw e;
      nativePreparationAbortRef.current = null;
      const matches = await discoverPanelsByCredentials(
        src, xtUser.trim(), xtPass.trim(),
        (p) => {
          const pct = p.total > 0 ? Math.round((p.tested / p.total) * 100) : 0;
          setProgress(`${cfg.label} · %${pct}\nPanel: ${p.panelTested}/${p.panelTotal} · Adres: ${p.tested}/${p.total} · Bulunan: ${p.found}${p.panelName ? `\nŞu an: ${p.panelName}` : ""}`);
        },
        cfg.concurrency, cfg.timeoutMs,
      );
      presentMatches(matches, "Panel / DNS Hesapları Bulundu",
        "Aynı bilgiler birden fazla panel veya DNS adresinde geçerli. Satın aldığınız hesapları seçin.");
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setFileName(asset.name);
      const response = await fetch(asset.uri);
      const text = await response.text();
      setFileContent(text);
    } catch (e: any) {
      setError("Dosya seçilemedi: " + e.message);
    }
  };

  const useDemo = () => {
    setMethod("m3u_url");
    setName("iptv-org (Demo)");
    setM3uUrl("https://iptv-org.github.io/iptv/countries/tr.m3u");
  };

  const loadXtreamContentWithProgress = async (cred: { server: string; username: string; password: string }) => {
    const state = { live: "⏳", vod: "⏳", series: "⏳", liveCount: 0, vodCount: 0, seriesCount: 0 };
    const publish = () => setProgress(
      `İçerikler paralel yükleniyor...\n` +
      `Canlı ${state.live}${state.liveCount ? ` ${state.liveCount}` : ""} · ` +
      `Film ${state.vod}${state.vodCount ? ` ${state.vodCount}` : ""} · ` +
      `Dizi ${state.series}${state.seriesCount ? ` ${state.seriesCount}` : ""}`
    );
    publish();
    const liveP = xtreamLiveStreams(cred).then(v => { state.live = "✅"; state.liveCount = v.length; publish(); return v; }).catch(e => { state.live = "❌"; publish(); throw e; });
    const vodP = xtVodLocal(cred).then(v => { state.vod = "✅"; state.vodCount = v.length; publish(); return v; }).catch(e => { state.vod = "❌"; publish(); throw e; });
    const seriesP = xtSeriesLocal(cred).then(v => { state.series = "✅"; state.seriesCount = v.length; publish(); return v; }).catch(e => { state.series = "❌"; publish(); throw e; });
    const [chRes, vodRes, serRes] = await Promise.allSettled([liveP, vodP, seriesP]);
    return { chRes, vodRes, serRes };
  };

  /**
   * Algılanan Xtream bilgileriyle DOĞRUDAN yükler.
   * (setState asenkron olduğu için state'e güvenmeden yerel değerlerle çalışır.)
   */
  const submitXtreamDirect = async (
    cred: { server: string; username: string; password: string },
    displayName?: string,
    serverCodeBinding?: ServerCodeBinding,
    navigateAfter = true,
    manageLoading = true,
  ): Promise<boolean> => {
    const normalizedServer = cred.server.replace(/\/+$/, "").toLowerCase();
    const accountKey = `${cred.username}\u0000${normalizedServer}`;
    if (playlistServerKeysRef.current.has(accountKey)) {
      setError(`${displayName?.trim() || "Bu hesap"} zaten ekli.`);
      return false;
    }
    if (directImportLocksRef.current.has(accountKey)) {
      setError("Bu hesap için ekleme işlemi zaten devam ediyor.");
      return false;
    }
    directImportLocksRef.current.add(accountKey);
    if (manageLoading) setLoading(true);
    setProgress("Kimlik doğrulanıyor (Xtream)...");
    try {
      const id = stableXtreamPlaylistId(cred.server, cred.username);

      // v15.2.4 Android: Tek Xtream ekleme de çoklu ekleme ile aynı native
      // foreground importer'ı kullanır. Böylece 50-100 bin içerik JS'e taşınmaz,
      // app arka plana geçse de indirme/normalize/Room transaction devam eder.
      if (KizilkanNativeCore.available && Platform.OS === "android") {
        const jobKey = `direct-${id}`;
        const candidate: BulkResolvedCandidate = {
          key: jobKey, sourceRow: 1, name: displayName?.trim() || name.trim() || "Xtream Codes",
          username: cred.username, password: cred.password,
          panelName: serverCodeBinding?.panelName || hostName(cred.server), code: serverCodeBinding?.code || "",
          server: cred.server, login: {}, validatedHosts: serverCodeBinding?.validatedHosts || [cred.server], direct: !serverCodeBinding,
        };
        await storage.secureSet(PENDING_BULK_IMPORT_KEY, JSON.stringify([candidate]));
        bulkImportOwnedByScreenRef.current = true;
        const importRunId = await KizilkanNativeCore.startBulkImport([{
          jobKey, playlistId: id, displayName: candidate.name, server: cred.server, username: cred.username, password: cred.password,
        }], 1);
        if (!importRunId) throw new Error("Native Xtream işi başlatılamadı.");
        let completedRow: any = null;
        while (true) {
          const snap = KizilkanNativeCore.getBulkImportSnapshot();
          if (snap.runId !== importRunId) { await new Promise(resolve => setTimeout(resolve, 120)); continue; }
          if (snap.error) throw new Error(String(snap.error));
          const row = (Array.isArray(snap.jobs) ? snap.jobs : []).find((r:any) => String(r.jobKey) === jobKey);
          if (row) {
            setProgress(`${row.message || "Native playlist ekleniyor"}${row.channels ? `\n${row.channels} kanal · ${row.vod || 0} film · ${row.series || 0} dizi` : ""}`);
            if (row.state === "completed") { completedRow = row; break; }
            if (row.state === "failed") throw new Error(String(row.message || "Native Xtream ekleme başarısız"));
          }
          if (!snap.running && !row) throw new Error("Native Xtream işi beklenmedik biçimde sona erdi.");
          await new Promise(resolve => setTimeout(resolve, 350));
        }
        await addPreparedPlaylist({
          id, name: candidate.name, source: "xtream",
          xtreamServer: cred.server, xtreamUsername: cred.username, xtreamPassword: cred.password,
          serverCodeBinding, accountInfo: (completedRow?.userInfo || null) as AccountInfo, serverInfo: completedRow?.serverInfo || null,
          channels: [], vod: [], series: [], channelsCount: Number(completedRow?.channels || 0), vodCount: Number(completedRow?.vod || 0), seriesCount: Number(completedRow?.series || 0),
          createdAt: new Date().toISOString(),
        });
        await storage.secureRemove(PENDING_BULK_IMPORT_KEY);
        playlistServerKeysRef.current.add(accountKey);
        setProgress("Playlist Room/SQLite üzerinde hazır.");
        if (navigateAfter) router.replace("/(tabs)");
        return true;
      }

      const login = await xtLoginLocal(cred);
      const { chRes, vodRes, serRes } = await loadXtreamContentWithProgress(cred);
      const channels = chRes.status === "fulfilled" ? chRes.value : [];
      const vod = vodRes.status === "fulfilled" ? vodRes.value : [];
      const series = serRes.status === "fulfilled" ? serRes.value : [];
      if (chRes.status === "rejected" && vod.length === 0 && series.length === 0) {
        throw new Error("İçerik yüklenemedi. Sunucu veya bilgileri kontrol edin.");
      }
      const playlist: Playlist = {
        id, name: displayName?.trim() || name.trim() || "Xtream Codes", source: "xtream",
        xtreamServer: cred.server, xtreamUsername: cred.username, xtreamPassword: cred.password,
        serverCodeBinding,
        accountInfo: login.user_info as AccountInfo,
        serverInfo: login.server_info || null,
        channels, vod, series,
        createdAt: new Date().toISOString(),
      };
      const total = channels.length + vod.length + series.length;
      if (total === 0) throw new Error("Hiç içerik bulunamadı. Kaynağı kontrol edin.");
      setProgress(`Cihaza kaydediliyor...\n${channels.length} kanal · ${vod.length} film · ${series.length} dizi`);
      await addPlaylist(playlist);
      setProgress("Playlist hazır. +18 filtresi arka planda hazırlanıyor...");
      playlistServerKeysRef.current.add(`${cred.username}\u0000${normalizedServer}`);
      if (navigateAfter) router.replace("/(tabs)");
      return true;
    } catch (e: any) {
      setError(e.message || "Bilinmeyen hata");
      return false;
    } finally {
      directImportLocksRef.current.delete(accountKey);
      bulkImportOwnedByScreenRef.current = false;
      if (manageLoading) {
        setLoading(false);
        setProgress("");
      }
    }
  };

  const pickBulkFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/*", "application/json", "text/csv", "application/csv", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const response = await fetch(asset.uri);
      const text = await response.text();
      const parsed = parseBulkAccounts(text);
      if (!parsed.accounts.length) throw new Error(parsed.warnings[0] || "Dosyada geçerli hesap bulunamadı.");
      setBulkFileName(asset.name || "hesaplar");
      setBulkFileText(text);
      setBulkPreviewOpen(true);
      setError(parsed.warnings.length ? parsed.warnings.join("\n") : null);
    } catch (e: any) {
      setError("Toplu hesap dosyası okunamadı: " + String(e?.message || e));
    }
  };

  const normalizePanelName = (v: string) => v.trim().toLocaleLowerCase("tr");

  const bulkCandidateKey = (row: number, username: string, code: string, panelName: string, server: string) =>
    `${row}\u0000${username}\u0000${code}\u0000${panelName}\u0000${String(server).replace(/\/+$/, "").toLowerCase()}`;

  const bulkSubscriptionKey = (c: BulkResolvedCandidate) => c.direct
    ? `${c.sourceRow}\u0000${c.username}\u0000direct\u0000${String(c.server).replace(/\/+$/, "").toLowerCase()}`
    : `${c.sourceRow}\u0000${c.username}\u0000panel\u0000${c.code}\u0000${c.panelName}`;

  const isActiveBulkCandidate = (c: BulkResolvedCandidate) => String(c.login?.user_info?.status || "").toLowerCase() === "active";

  const mergeBulkCandidates = React.useCallback((incoming: BulkResolvedCandidate[], reveal = true) => {
    if (!incoming.length) return;
    setBulkCandidates(prev => {
      const map = new Map(prev.map(x => [x.key, x]));
      incoming.forEach(x => map.set(x.key, x));
      return Array.from(map.values());
    });
    // v15.2.4: tamamlanmış eski snapshot ekran/activity restore olduğunda
    // modalı zorla diriltmesin. Canlı tarama veya bu ekranın sahip olduğu iş
    // sonuçları kullanıcıya anlık gösterilir.
    if (reveal) setShowBulkCandidates(true);
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== "android") return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const syncSnapshots = async () => {
      try {
        const scan = PanelScan.available ? PanelScan.getSnapshot() : {};
        if ((scan.mode === "bulk" || scan.mode === "unified") && (scan.running || (scan.matches?.length || 0) > 0)) {
          const saved = await storage.secureGet<string>(PENDING_BULK_SCAN_KEY, "");
          const accounts: BulkAccountInput[] = saved ? JSON.parse(saved) : [];
          if (!cancelled && accounts.length) {
            const resolved: BulkResolvedCandidate[] = [];
            for (const m of (scan.matches || [])) {
              const ai=Number(m.accountIndex); const a=accounts[ai] || accounts.find(x=>x.row===Number(m.sourceRow)); if(!a) continue;
              const server=String(m.server||""); if(!server) continue;
              const panelName=String(m.panelName||"") || hostName(server), code=String(m.code||"");
              resolved.push({ key:bulkCandidateKey(a.row,a.username,code,panelName,server), sourceRow:a.row, name:a.name||panelName, username:a.username, password:a.password, panelName, code, server, login:m.login, validatedHosts:[server], direct:!!a.server });
            }
            const shouldReveal = !!scan.running || bulkNativeScanRef.current;
            mergeBulkCandidates(resolved, shouldReveal);
            setBulkScanPaused(!!scan.paused); setBulkScanFinished(!scan.running); bulkNativeScanRef.current=!!scan.running;
            if (scan.running && scan.runId) bulkScanRunIdRef.current = String(scan.runId);
            else if (!scan.running && bulkScanRunIdRef.current === scan.runId) bulkScanRunIdRef.current = "";
            if (!scan.running) await storage.secureRemove(PENDING_BULK_SCAN_KEY);
            if (!bulkAdding) setLoading(!!scan.running);
            setProgress(scan.running ? `Native tarama geri yüklendi · ${Number(scan.tested||0)}/${Number(scan.total||0)} · ${Number(scan.found||0)} bulundu` : `Tarama sonucu geri yüklendi · ${Number(scan.found||0)} bulundu`);
          }
        }

        const imp = KizilkanNativeCore.available ? KizilkanNativeCore.getBulkImportSnapshot() : {};
        if (!bulkImportOwnedByScreenRef.current && !cancelled && (imp.running || (imp.jobs?.length || 0) > 0)) {
          const rows:any[] = Array.isArray(imp.jobs) ? imp.jobs : [];
          const statusObj:Record<string,any> = {};
          rows.forEach(r => statusObj[String(r.jobKey||"")] = { state:String(r.state||"waiting"), message:String(r.message||""), channels:Number(r.channels||0), vod:Number(r.vod||0), series:Number(r.series||0) });
          setBulkImportStatuses(statusObj); setBulkImportPaused(!!imp.paused); setBulkAdding(!!imp.running); setLoading(!!imp.running);

          const chosenRaw = await storage.secureGet<string>(PENDING_BULK_IMPORT_KEY, "");
          const chosen: BulkResolvedCandidate[] = chosenRaw ? JSON.parse(chosenRaw) : [];
          const byKey = new Map(chosen.map(c => [c.key, c]));
          for (const row of rows) {
            if (row.state !== "completed" || !row.playlistId || restoredImportAdoptedRef.current.has(String(row.playlistId))) continue;
            if (playlists.some(pl => pl.id === String(row.playlistId))) { restoredImportAdoptedRef.current.add(String(row.playlistId)); continue; }
            const c = byKey.get(String(row.jobKey || "")); if (!c) continue;
            await addPreparedPlaylist({
              id:String(row.playlistId), name:String(row.displayName||c.name), source:"xtream",
              xtreamServer:c.server, xtreamUsername:c.username, xtreamPassword:c.password,
              serverCodeBinding:c.direct ? undefined : makeBinding(c.code,c.panelName,c.server,c.validatedHosts),
              accountInfo:(row.userInfo||c.login?.user_info||null) as AccountInfo, serverInfo:row.serverInfo||c.login?.server_info||null,
              channels:[], vod:[], series:[], channelsCount:Number(row.channels||0), vodCount:Number(row.vod||0), seriesCount:Number(row.series||0), createdAt:new Date().toISOString(),
            });
            restoredImportAdoptedRef.current.add(String(row.playlistId));
          }
        }
      } catch (e) { console.warn("[v15.2.3 restore] native job snapshot", e); }
    };

    void syncSnapshots();
    timer = setInterval(() => { void syncSnapshots(); }, 850);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [mergeBulkCandidates, addPreparedPlaylist, playlists, bulkAdding]);

  const resolveOneBulkAccount = async (
    account: BulkAccountInput,
    index: number,
    total: number,
    directoryCache: { value?: PanelDirectoryItem[]; promise?: Promise<PanelDirectoryItem[]> },
    control?: ScanExecutionControl,
  ): Promise<{ candidates: BulkResolvedCandidate[]; label: string; reason?: string }> => {
    const label = account.name.trim() || `Hesap ${index + 1}`;
    const cfg = scanConfigForSpeed();
    const src = codeSource.trim() || DEFAULT_CODE_SOURCE;
    const progressPrefix = `${index + 1}/${total} · ${label}`;

    try {
      setError(null);
      if (account.server) {
        setProgress(`${progressPrefix}\nDoğrudan Xtream sunucusu doğrulanıyor…`);
        const login = await xtLoginLocal({ server: account.server, username: account.username, password: account.password });
        const panelName = account.name.trim() || hostName(account.server);
        const c: BulkResolvedCandidate = {
          key: bulkCandidateKey(account.row, account.username, "", panelName, account.server),
          sourceRow: account.row, name: account.name.trim() || panelName,
          username: account.username, password: account.password, panelName, code: "",
          server: account.server, login, validatedHosts: [account.server], direct: true,
        };
        mergeBulkCandidates([c]);
        return { candidates: [c], label };
      }

      let matches: PanelCredentialMatch[] = [];
      if (account.serverCode) {
        setProgress(`${progressPrefix}\nSunucu kodu ${account.serverCode} için tüm DNS adresleri deneniyor…`);
        matches = await discoverServerCodeHosts(
          src, account.serverCode, account.username, account.password,
          (pr) => setProgress(`${progressPrefix}\nDNS ${pr.tested}/${pr.total} · Kalan ${Math.max(0, pr.total-pr.tested)} · Bulunan ${pr.found}${pr.server ? `\nŞu an: ${pr.server}` : ""}`),
          cfg.concurrency, cfg.timeoutMs, control,
        );
      } else if (account.panelName) {
        if (!directoryCache.value) {
          directoryCache.promise ??= fetchPanelDirectory(src, { signal: control.signal, timeoutMs: cfg.timeoutMs });
          directoryCache.value = await directoryCache.promise;
        }
        const wanted = normalizePanelName(account.panelName);
        const rawPanel = account.panelName.trim();
        const exactCode = directoryCache.value.find(x => x.code === rawPanel);
        const sameName = directoryCache.value.filter(x => normalizePanelName(x.panelName) === wanted);
        if (!exactCode && sameName.length > 1) {
          throw new Error(`Panel adı rehberde ${sameName.length} kez geçiyor: ${account.panelName}. Güvenli seçim için sunucu kodunu belirtin.`);
        }
        const panel = exactCode || sameName[0];
        if (!panel) throw new Error(`Panel rehberinde bulunamadı: ${account.panelName}`);
        setProgress(`${progressPrefix}\n${panel.panelName} panelinin ${panel.hosts.length} DNS adresi deneniyor…`);
        matches = await discoverServerCodeHosts(
          src, panel.code, account.username, account.password,
          (pr) => setProgress(`${progressPrefix}\nDNS ${pr.tested}/${pr.total} · Kalan ${Math.max(0, pr.total-pr.tested)} · Bulunan ${pr.found}${pr.server ? `\nŞu an: ${pr.server}` : ""}`),
          cfg.concurrency, cfg.timeoutMs, control,
        );
      } else {
        if (!directoryCache.value) {
          directoryCache.promise ??= fetchPanelDirectory(src, { signal: control.signal, timeoutMs: cfg.timeoutMs });
          directoryCache.value = await directoryCache.promise;
        }
        setProgress(`${progressPrefix}\nPanel bilinmiyor; tüm panel rehberi taranıyor…`);
        matches = await discoverPanelsByCredentials(
          src, account.username, account.password,
          (pr) => {
            const pct = pr.total ? Math.round((pr.tested / pr.total) * 100) : 0;
            setProgress(`${progressPrefix} · %${pct}\nPanel ${pr.panelTested}/${pr.panelTotal} · Adres ${pr.tested}/${pr.total} · Kalan ${Math.max(0,pr.total-pr.tested)} · Bulunan ${pr.found}${pr.panelName ? `\nŞu an: ${pr.panelName}` : ""}`);
          },
          cfg.concurrency, cfg.timeoutMs, directoryCache.value, control,
        );
      }

      if (!matches.length) throw new Error("Geçerli panel/DNS hesabı bulunamadı.");
      const hostsByPanel = new Map<string, string[]>();
      for (const m of matches) {
        const pk = `${m.code}\u0000${m.panelName}`;
        hostsByPanel.set(pk, Array.from(new Set([...(hostsByPanel.get(pk) || []), m.server])));
      }
      const candidates = matches.map((m): BulkResolvedCandidate => {
        const pk = `${m.code}\u0000${m.panelName}`;
        return {
          key: bulkCandidateKey(account.row, account.username, m.code, m.panelName, m.server),
          sourceRow: account.row, name: account.name.trim() || m.panelName,
          username: account.username, password: account.password, panelName: m.panelName, code: m.code,
          server: m.server, login: m.login, validatedHosts: hostsByPanel.get(pk) || [m.server], direct: false,
        };
      });
      mergeBulkCandidates(candidates);
      return { candidates, label };
    } catch (e: any) {
      return { candidates: [], label, reason: String(e?.message || e) };
    }
  };

  const runNativeBulkAccounts = async (accounts: BulkAccountInput[], cfg: { concurrency:number; timeoutMs:number; accountConcurrency:number; label:string }, signal?: AbortSignal): Promise<{ found:number; completed:number; cancelled:boolean }> => {
    if (!PanelScan.available || Platform.OS !== "android") throw new Error("__NATIVE_SCAN_UNAVAILABLE__");
    const src = codeSource.trim() || DEFAULT_CODE_SOURCE;
    setProgress(`${cfg.label} · Birleşik native panel rehberi hazırlanıyor…`);
    if (signal?.aborted || bulkScanCancelledRef.current) return { found: 0, completed: 0, cancelled: true };
    const directory = panelDirectory.length && panelDirectorySource === src
      ? panelDirectory
      : await fetchPanelDirectory(src, { signal, timeoutMs: cfg.timeoutMs });
    if (signal?.aborted || bulkScanCancelledRef.current) return { found: 0, completed: 0, cancelled: true };
    const normalizeName = (v:string) => v.trim().toLocaleLowerCase("tr");
    const jobs = accounts.map((a) => {
      let candidates: Array<{panelName:string; code:string; server:string}> = [];
      if (a.server) {
        candidates = [{ panelName: a.panelName || a.name || hostName(a.server), code: a.serverCode || "", server: a.server }];
      } else if (a.serverCode) {
        const item = directory.find(x => x.code === a.serverCode);
        if (item) candidates = item.hosts.map(server => ({ panelName:item.panelName, code:item.code, server }));
      } else if (a.panelName) {
        const wanted = normalizeName(a.panelName);
        const exactCode = directory.find(x => x.code === a.panelName);
        const byName = directory.filter(x => normalizeName(x.panelName) === wanted);
        const item = exactCode || (byName.length === 1 ? byName[0] : undefined);
        if (item) candidates = item.hosts.map(server => ({ panelName:item.panelName, code:item.code, server }));
      } else {
        for (const item of directory) for (const server of item.hosts) candidates.push({ panelName:item.panelName, code:item.code, server });
      }
      return { row:a.row, name:a.name, username:a.username, password:a.password, candidates };
    });
    if (jobs.some(j => !j.candidates.length)) {
      const missing = jobs.filter(j => !j.candidates.length).map(j => j.name || j.username).slice(0,5).join(", ");
      throw new Error(`Bazı hesaplar için panel/DNS adayı hazırlanamadı: ${missing}`);
    }
    await storage.secureSet(PENDING_BULK_SCAN_KEY, JSON.stringify(accounts));
    if (signal?.aborted || bulkScanCancelledRef.current) {
      await storage.secureRemove(PENDING_BULK_SCAN_KEY);
      return { found: 0, completed: 0, cancelled: true };
    }
    bulkPreparationAbortRef.current = null;
    const nativeConcurrency = Math.max(1, Math.min(32, cfg.concurrency * Math.max(1, cfg.accountConcurrency)));
    bulkNativeScanRef.current = true;
    let runId = "";
    try {
      runId = await startAcceptedScan(() => PanelScan.startUnifiedScan(jobs, nativeConcurrency, cfg.timeoutMs));
      bulkScanRunIdRef.current = runId;
    } catch (e) {
      bulkNativeScanRef.current = false;
      bulkScanRunIdRef.current = "";
      throw e;
    }
    let lastFound=-1, completed=0;
    while (true) {
      const snap=PanelScan.getSnapshot();
      if (snap.runId !== runId) { await new Promise(resolve=>setTimeout(resolve,120)); continue; }
      if (snap.error) throw new Error(snap.error);
      if (Array.isArray(snap.accountStatuses)) setBulkAccountProgress(snap.accountStatuses);
      const raw=Array.isArray(snap.matches)?snap.matches:[];
      if (raw.length !== lastFound) {
        const resolved: BulkResolvedCandidate[]=[];
        for (const m of raw) {
          const ai=Number(m.accountIndex); const account=Number.isInteger(ai)?accounts[ai]:accounts.find(a=>a.row===Number(m.sourceRow)); if(!account) continue;
          const panelName=String(m.panelName||"").trim(), code=String(m.code||"").trim(), server=String(m.server||"").trim(); if(!server) continue;
          resolved.push({ key:bulkCandidateKey(account.row,account.username,code,panelName,server), sourceRow:account.row, name:account.name.trim()||panelName||hostName(server), username:account.username, password:account.password, panelName:panelName||hostName(server), code, server, login:m.login, validatedHosts:[server], direct:!!account.server });
        }
        mergeBulkCandidates(resolved); lastFound=raw.length;
      }
      completed=Number(snap.accountTested||0); const tested=Number(snap.tested||0), total=Number(snap.total||0), pct=total?Math.round(tested/total*100):0;
      const createdAt = Number(snap.createdAt || Date.now());
      setBulkScanPaused(!!snap.paused);
      setProgress(`${cfg.label} · NATIVE · %${pct}\nHesap ${completed}/${accounts.length} · Adres ${tested}/${total} · Kalan ${Math.max(0,total-tested)} · Bulunan ${raw.length}${snap.panelName?`\nŞu an: ${snap.panelName}${snap.currentServer ? ` · ${snap.currentServer}` : ""}`:""}\nGeçen: ${formatScanDuration(Date.now()-createdAt)} · Tahmini kalan: ${scanEta(createdAt,tested,total)}${snap.paused?"\nDURAKLATILDI":snap.state==="CANCELLING"?"\nDURDURULUYOR — aktif ağ istekleri kapatılıyor":""}`);
      if (!snap.running) {
        await storage.secureRemove(PENDING_BULK_SCAN_KEY);
        bulkNativeScanRef.current = false;
        if (bulkScanRunIdRef.current === runId) bulkScanRunIdRef.current = "";
        return { found:raw.length, completed, cancelled:!!snap.cancelled };
      }
      await new Promise(resolve=>setTimeout(resolve,350));
    }
  };

  const submitBulkAccounts = async () => {
    const parsed = bulkParsed;
    if (!parsed.accounts.length) throw new Error(parsed.warnings[0] || "Geçerli toplu hesap bulunamadı.");

    setLoading(true);
    setError(null);
    setBulkCandidates([]);
    setSelectedBulkCandidateKeys([]);
    setBulkScanFailures([]);
    setBulkAccountProgress([]);
    setBulkScanFinished(false);
    setShowBulkCandidates(true);
    setBulkScanPaused(false);
    bulkScanPausedRef.current = false;
    bulkScanCancelledRef.current = false;
    setBulkScanStopping(false);
    bulkPreparationAbortRef.current?.abort();
    const preparationController = new AbortController();
    bulkPreparationAbortRef.current = preparationController;
    const directoryCache: { value?: PanelDirectoryItem[]; promise?: Promise<PanelDirectoryItem[]> } = {};
    const failures: string[] = [];
    const cfg = scanConfigForSpeed();
    let found = 0;
    let completed = 0;
    let cursor = 0;

    const control: ScanExecutionControl = {
      isCancelled: () => bulkScanCancelledRef.current,
      signal: preparationController.signal,
      waitIfPaused: async () => {
        while (bulkScanPausedRef.current && !bulkScanCancelledRef.current) {
          await new Promise(resolve => setTimeout(resolve, 120));
        }
      },
    };

    try {
      if (PanelScan.available && Platform.OS === "android") {
        const nr = await runNativeBulkAccounts(parsed.accounts, cfg, preparationController.signal); found=nr.found; completed=nr.completed;
        setBulkScanFailures([]); setBulkScanFinished(true); setShowBulkCandidates(true);
        setProgress(nr.cancelled ? `Tarama durduruldu · ${completed}/${parsed.accounts.length} hesap · ${found} sonuç korunuyor.` : `Native tarama tamamlandı · ${completed}/${parsed.accounts.length} hesap · ${found} kimlik doğrulaması başarılı panel/DNS adayı bulundu.`);
        if (!found && !nr.cancelled) setError("Kimlik doğrulaması başarılı aday bulunamadı.");
        return;
      }
      const workerCount = Math.max(1, Math.min(cfg.accountConcurrency, parsed.accounts.length));
      const runAccountWorker = async () => {
        while (!bulkScanCancelledRef.current) {
          await control.waitIfPaused?.();
          if (bulkScanCancelledRef.current) return;
          const i = cursor++;
          if (i >= parsed.accounts.length) return;
          const r = await resolveOneBulkAccount(parsed.accounts[i], i, parsed.accounts.length, directoryCache, control);
          found += r.candidates.length;
          completed += 1;
          if (!r.candidates.length && !bulkScanCancelledRef.current) failures.push(`${r.label}: ${r.reason || "Eşleşme bulunamadı."}`);
          setProgress(`${cfg.label} · ${completed}/${parsed.accounts.length} hesap tamamlandı · ${found} kimlik doğrulaması başarılı panel/DNS adayı bulundu` + (bulkScanPausedRef.current ? " · DURAKLATILDI" : ""));
        }
      };
      await Promise.all(Array.from({ length: workerCount }, () => runAccountWorker()));
      setBulkScanFailures(failures);
      setBulkScanFinished(true);
      setShowBulkCandidates(true);
      if (bulkScanCancelledRef.current) {
        setProgress(`Tarama durduruldu · ${completed}/${parsed.accounts.length} hesap işlendi · ${found} sonuç korunuyor.`);
      } else {
        setProgress(`Tarama tamamlandı · ${completed}/${parsed.accounts.length} hesap işlendi · ${found} kimlik doğrulaması başarılı panel/DNS adayı bulundu${failures.length ? ` · ${failures.length} hesapta sonuç yok` : ""}`);
      }
      if (!found && !bulkScanCancelledRef.current) setError(failures.join("\n") || "Kimlik doğrulaması başarılı aday bulunamadı.");
    } catch (e: any) {
      setBulkScanFinished(true);
      setShowBulkCandidates(true);
      if (isScanAbort(e) || bulkScanCancelledRef.current) {
        setProgress(`Tarama durduruldu · ${completed}/${parsed.accounts.length} hesap işlendi · ${found} sonuç korunuyor.`);
        setError(null);
        return;
      }
      setProgress(`Tarama tamamlanamadı: ${String(e?.message || e)}`);
      setError(String(e?.message || e));
      throw e;
    } finally {
      if (bulkPreparationAbortRef.current === preparationController) bulkPreparationAbortRef.current = null;
      setLoading(false);
      setBulkScanPaused(false);
      setBulkScanStopping(false);
      bulkScanPausedRef.current = false;
      bulkNativeScanRef.current = false;
    }
  };

  const addSelectedBulkCandidates = async () => {
    const selectedRaw = bulkCandidates.filter(c => selectedBulkCandidateKeys.includes(c.key));
    if (!selectedRaw.length) return;

    // v15.2.11: aynı hesap+panelin birden fazla çalışan DNS'i ayrı playlist
    // değildir. Seçim DNS satırlarından yapılsa bile import tek abonelik olarak
    // gruplanır; bütün çalışan DNS'ler validatedHosts yedeği olarak korunur.
    const allBySubscription = new Map<string, BulkResolvedCandidate[]>();
    for (const c of bulkCandidates) {
      const k = bulkSubscriptionKey(c);
      allBySubscription.set(k, [...(allBySubscription.get(k) || []), c]);
    }
    const selectedGroups = new Map<string, BulkResolvedCandidate[]>();
    for (const c of selectedRaw) {
      const k = bulkSubscriptionKey(c);
      selectedGroups.set(k, [...(selectedGroups.get(k) || []), c]);
    }
    const chosen: BulkResolvedCandidate[] = Array.from(selectedGroups.entries()).map(([k, rows]) => {
      const allRows = allBySubscription.get(k) || rows;
      const preferred = rows.find(isActiveBulkCandidate) || rows[0];
      return {
        ...preferred,
        validatedHosts: Array.from(new Set(allRows.flatMap(x => x.validatedHosts?.length ? x.validatedHosts : [x.server]))),
      };
    });
    if (!chosen.length) return;
    setBulkAdding(true);
    setLoading(true);
    setBulkImportPaused(false);
    setBulkImportStatuses({});

    // v15.2.2-RC1: Android'de katalog indirme + normalize + dosya + Room index
    // tamamen foreground native service'te çalışır. JS arka plana alınsa bile iş
    // devam eder; UI geri geldiğinde kalıcı snapshot'tan kaldığı durumu okur.
    if (Platform.OS === "android" && KizilkanNativeCore.available) {
      await storage.secureSet(PENDING_BULK_IMPORT_KEY, JSON.stringify(chosen));
      bulkImportOwnedByScreenRef.current = true;
      const jobs = chosen.map((c) => ({
        jobKey: c.key,
        playlistId: stableXtreamPlaylistId(c.server, c.username),
        displayName: chosen.length === 1 ? c.name : `${c.name} · ${hostName(c.server)}`,
        server: c.server, username: c.username, password: c.password,
      }));
      const byKey = new Map(chosen.map(c => [c.key, c]));
      const adopted = new Set<string>();
      let ok = 0;
      const failed: string[] = [];
      try {
        const importRunId = await KizilkanNativeCore.startBulkImport(jobs, Math.min(2, jobs.length));
        if (!importRunId) throw new Error("Native playlist ekleme servisi başlatılamadı.");
        while (true) {
          const snap = KizilkanNativeCore.getBulkImportSnapshot() || {};
          if (snap.runId !== importRunId) { await new Promise(resolve => setTimeout(resolve, 120)); continue; }
          const rows: any[] = Array.isArray(snap.jobs) ? snap.jobs : [];
          const statusObj: Record<string, any> = {};
          for (const row of rows) {
            const key = String(row.jobKey || "");
            statusObj[key] = {
              state: String(row.state || "waiting"), message: String(row.message || ""),
              channels: Number(row.channels || 0), vod: Number(row.vod || 0), series: Number(row.series || 0),
            };
            if (row.state === "completed" && row.playlistId && !adopted.has(row.playlistId)) {
              const c = byKey.get(key);
              if (!c) continue;
              const playlist: Playlist = {
                id: row.playlistId,
                name: String(row.displayName || c.name),
                source: "xtream",
                xtreamServer: c.server, xtreamUsername: c.username, xtreamPassword: c.password,
                serverCodeBinding: c.direct ? undefined : makeBinding(c.code, c.panelName, c.server, c.validatedHosts),
                accountInfo: (row.userInfo || c.login?.user_info || null) as AccountInfo,
                serverInfo: row.serverInfo || c.login?.server_info || null,
                channels: [], vod: [], series: [],
                channelsCount: Number(row.channels || 0), vodCount: Number(row.vod || 0), seriesCount: Number(row.series || 0),
                createdAt: new Date().toISOString(),
              };
              await addPreparedPlaylist(playlist);
              playlistServerKeysRef.current.add(`${c.username}\u0000${String(c.server).replace(/\/+$/, "").toLowerCase()}`);
              adopted.add(row.playlistId);
              ok++;
            }
          }
          setBulkImportStatuses(statusObj);
          setBulkImportPaused(!!snap.paused);
          setProgress(`Native ekleme · ${Number(snap.completed || 0)}/${Number(snap.total || jobs.length)} tamamlandı · ${Number(snap.failed || 0)} hata` + (snap.paused ? " · DURAKLATILDI" : ""));
          if (!snap.running) {
            for (const row of rows) if (row.state === "failed") failed.push(`${row.displayName || "Hesap"}: ${row.message || "Ekleme hatası"}`);
            break;
          }
          await new Promise(r => setTimeout(r, 700));
        }
        Alert.alert("Toplu Hesap Ekleme", `${ok}/${chosen.length} seçili hesap kalıcı olarak eklendi.${failed.length ? `\nEklenemeyenler:\n${failed.slice(0, 6).join("\n")}` : ""}`);
        if (ok > 0) router.replace("/(tabs)");
      } catch (e: any) {
        setError(e?.message || "Native toplu hesap ekleme başarısız.");
      } finally {
        bulkImportOwnedByScreenRef.current = false;
        setBulkAdding(false); setLoading(false); setProgress(""); setBulkImportPaused(false);
        if (ok > 0) { setShowBulkCandidates(false); setBulkCandidates([]); setSelectedBulkCandidateKeys([]); }
      }
      return;
    }

    // Web / native modül bulunmayan ortam için eski işlevsel fallback korunur.
    let ok = 0;
    const failed: string[] = [];
    try {
      for (let i = 0; i < chosen.length; i++) {
        const c = chosen[i];
        const displayName = chosen.length === 1 ? c.name : `${c.name} · ${hostName(c.server)}`;
        setProgress(`${i + 1}/${chosen.length} · ${displayName} yeniden doğrulanıyor ve ekleniyor…`);
        const added = await submitXtreamDirect(
          { server: c.server, username: c.username, password: c.password }, displayName,
          c.direct ? undefined : makeBinding(c.code, c.panelName, c.server, c.validatedHosts), false, false,
        );
        if (added) ok++; else failed.push(displayName);
      }
      Alert.alert("Toplu Hesap Ekleme", `${ok}/${chosen.length} seçili hesap eklendi.${failed.length ? `\nEklenemeyen: ${failed.join(", ")}` : ""}`);
      if (ok > 0) router.replace("/(tabs)");
    } finally {
      setBulkAdding(false); setLoading(false); setProgress("");
      if (ok > 0) { setShowBulkCandidates(false); setBulkCandidates([]); setSelectedBulkCandidateKeys([]); }
    }
  };

  /** Kullanıcıya Evet/Hayır sorar (Promise tabanlı). */
  const askYesNo = (title: string, message: string): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        title,
        message,
        [
          { text: "Hayır, M3U olarak ekle", onPress: () => resolve(false), style: "cancel" },
          { text: "Evet, Xtream olarak ekle", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });

  const submit = async () => {
    setError(null);
    if (method === "bulk") {
      try { await submitBulkAccounts(); } catch (e: any) { setError(e?.message || "Toplu hesap eklenemedi."); }
      return;
    }

    // XTREAM OTOMATİK ALGILAMA (kullanıcı isteği):
    // M3U URL'i aslında bir Xtream portalı (get.php / player_api.php) ise,
    // kullanıcıya sor. Kabul ederse Xtream moduna geçir — kategoriler, EPG ve
    // hesap bilgisi gibi çok daha zengin veri gelir.
    if (method === "m3u_url" && m3uUrl.trim()) {
      const detected = detectXtreamFromM3U(m3uUrl.trim());
      if (detected) {
        const useXtream = await askYesNo(
          "Xtream Portalı Algılandı",
          "Girdiğiniz bağlantı bir Xtream Codes portalı gibi görünüyor. Xtream olarak eklerseniz kategoriler, EPG ve hesap bilgileri de yüklenir. Nasıl eklemek istersiniz?"
        );
        if (useXtream) {
          // Alanları doldur ve Xtream moduna geç, sonra normal akış devam etsin.
          setMethod("xtream");
          setXtServer(detected.server);
          setXtUser(detected.username);
          setXtPass(detected.password);
          // Not: state güncellemesi asenkron; bu yüzden aşağıda yerel değişkenlerle
          // devam etmek için doğrudan Xtream yükleme akışını burada tetikliyoruz.
          await submitXtreamDirect(detected);
          return;
        }
        // Hayır dediyse normal M3U akışıyla devam eder.
      }
    }

    setLoading(true);
    setProgress("");
    try {
      // GPT v10.5.0: "Paneli bilmiyorum" yolunda kullanıcı yalnız kullanıcı
      // adı + şifre verir. Firebase yalnız katalog olarak kullanılır; kimlik
      // bilgileri doğrudan aday Xtream sunucularına gider.
      if (method === "code" && codeMode === "auto") {
        await submitAutoDiscovery();
        return;
      }
      if (method === "code" && codeMode === "directory" && !codeVal.trim()) {
        throw new Error("Panel rehberinden bir panel seçin veya 'Kodum var' seçeneğine dönün.");
      }
      if (method === "code" && codeMode !== "auto") {
        await submitKnownPanelDiscovery();
        return;
      }
      if (method === "xtream") {
        if (!xtServer.trim() || !xtUser.trim() || !xtPass.trim()) throw new Error("Sunucu, kullanıcı adı ve şifre gereklidir");
        await submitXtreamDirect({ server: xtServer.trim(), username: xtUser.trim(), password: xtPass.trim() });
        return;
      }

      let id = "";
      let playlist: Playlist;

      if (method === "m3u_url") {
        if (!m3uUrl.trim()) throw new Error("M3U URL boş olamaz");
        const canonicalM3u = canonicalUrlIdentity(m3uUrl);
        id = stablePlaylistId("m3u", canonicalM3u);
        if (playlists.some(pl => pl.id === id || (pl.m3uUrl && canonicalUrlIdentity(pl.m3uUrl) === canonicalM3u))) {
          throw new Error("Bu M3U kaynağı zaten ekli.");
        }
        if (Platform.OS === "android" && KizilkanNativeCore.available) {
          setProgress("M3U Native Core ile indiriliyor ve Room'a indeksleniyor...");
          const summary = await KizilkanNativeCore.fetchAndImportM3u(id, m3uUrl.trim());
          const total = Number(summary?.channels || 0) + Number(summary?.vod || 0) + Number(summary?.series || 0);
          if (!summary?.roomIndexed || total === 0) throw new Error("M3U kaynağında içerik bulunamadı.");
          await addPreparedPlaylist({
            id, name: name.trim() || "M3U Listesi", source: "m3u_url", m3uUrl: m3uUrl.trim(),
            channels: [], vod: [], series: [], channelsCount: Number(summary.channels || 0),
            vodCount: Number(summary.vod || 0), seriesCount: Number(summary.series || 0),
            createdAt: new Date().toISOString(),
          });
          router.replace("/(tabs)");
          return;
        }
        setProgress("Kanallar yükleniyor (legacy parser)...");
        const res = await fetchAndParseM3U(m3uUrl.trim());
        playlist = {
          id, name: name.trim() || "M3U Listesi", source: "m3u_url",
          m3uUrl: m3uUrl.trim(),
          channels: res.channels,
          vod: res.vod,
          series: res.series,
          createdAt: new Date().toISOString(),
        };
      } else if (method === "m3u_file") {
        if (!fileContent) throw new Error("Lütfen bir M3U dosyası seçin");
        id = stablePlaylistId("file", fileContent);
        if (playlists.some(pl => pl.id === id)) throw new Error("Bu M3U dosyası zaten ekli.");
        if (Platform.OS === "android" && KizilkanNativeCore.available) {
          setProgress("M3U dosyası Native Core ile ayrıştırılıyor ve Room'a indeksleniyor...");
          const summary = await KizilkanNativeCore.importM3uText(id, fileContent);
          const total = Number(summary?.channels || 0) + Number(summary?.vod || 0) + Number(summary?.series || 0);
          if (!summary?.roomIndexed || total === 0) throw new Error("M3U dosyasında içerik bulunamadı.");
          await addPreparedPlaylist({
            id, name: name.trim() || fileName || "M3U Dosyası", source: "m3u_file",
            channels: [], vod: [], series: [], channelsCount: Number(summary.channels || 0),
            vodCount: Number(summary.vod || 0), seriesCount: Number(summary.series || 0),
            createdAt: new Date().toISOString(),
          });
          router.replace("/(tabs)");
          return;
        }
        setProgress("Kanallar ayrıştırılıyor (legacy parser)...");
        const res = parseM3U(fileContent);
        playlist = {
          id, name: name.trim() || fileName || "M3U Dosyası", source: "m3u_file",
          channels: res.channels,
          vod: res.vod,
          series: res.series,
          createdAt: new Date().toISOString(),
        };
      } else {
        /**
         * STALKER / MAG — ARTIK CİHAZ İÇİ (v9.1.0)
         * Eskiden backend proxy'ye bağımlıydı (emergent kalıntısı). Protokolün
         * tamamı src/utils/stalker.ts içinde cihazda çalışıyor:
         *   handshake -> get_profile -> get_genres -> get_all_channels
         * Yayın adresleri GEÇİCİ olduğu için oynatma anında create_link ile
         * ayrıca çözülür (player tarafında).
         */
        if (!stPortal.trim() || !stMac.trim())
          throw new Error("Portal adresi ve MAC adresi gereklidir");
        const canonicalMag = canonicalMagIdentity(stPortal, stMac);
        id = stablePlaylistId("mag", canonicalMag);
        if (playlists.some(pl => pl.id === id || (pl.stalkerPortal && pl.stalkerMac && canonicalMagIdentity(pl.stalkerPortal, pl.stalkerMac) === canonicalMag))) {
          throw new Error("Bu MAG/Portal hesabı zaten ekli.");
        }

        const { stalkerLogin: stLogin, stalkerChannels, normalizeMac } = await import("@/src/utils/stalker");
        const cred = {
          portal: stPortal.trim(),
          mac: normalizeMac(stMac.trim()),
          serial: stSerial.trim() || undefined,
        };

        setProgress("Portala bağlanılıyor...");
        const { session, profile: prof } = await stLogin(cred);

        setProgress("Kanallar yükleniyor...");
        const chans = await stalkerChannels(cred, session);
        if (chans.length === 0) {
          throw new Error(
            "Portal bağlandı ama kanal listesi BOŞ.\n\n" +
              "Olası sebepler:\n" +
              "• MAC adresi bu portalda kayıtlı değil\n" +
              "• Abonelik süresi dolmuş\n" +
              "• Portal bu cihaz türünü kabul etmiyor"
          );
        }
        const load = { channels: chans };
        const profile = prof || {};
        playlist = {
          id, name: name.trim() || "MAG Portal", source: "stalker",
          stalkerPortal: stPortal.trim(), stalkerMac: stMac.trim().toUpperCase(),
          stalkerSerial: stSerial.trim() || undefined,
          accountInfo: {
            username: profile.login,
            status: profile.status,
            mac: profile.mac,
            phone: profile.phone,
            tariff_plan: profile.tariff_plan,
            tariff_expired_date: profile.tariff_expired_date || profile.exp_billing_date,
          },
          channels: load.channels, createdAt: new Date().toISOString(),
        };
      }

      const totalItems = (playlist.channels?.length || 0) + (playlist.vod?.length || 0) + (playlist.series?.length || 0);
      if (totalItems === 0) throw new Error("Hiç kanal/film/dizi bulunamadı. Kaynağı kontrol edin.");
      setProgress("Cihaza kaydediliyor...");
      await addPlaylist(playlist);
      setProgress("Playlist hazır. +18 filtresi arka planda hazırlanıyor...");
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Bilinmeyen hata");
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const methods: { key: Method; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "m3u_url", label: "M3U URL", icon: "link" },
    { key: "m3u_file", label: "M3U Dosya", icon: "document-attach" },
    { key: "xtream", label: "Xtream", icon: "server" },
    { key: "code", label: "Sunucu Kodu", icon: "keypad" },
    { key: "stalker", label: "MAG", icon: "hardware-chip" },
    { key: "bulk", label: "Çoklu Hesap", icon: "people" },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top", "bottom"]} testID="add-playlist-screen">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 16}
      >
        <View style={styles.header}>
          <FocusButton testID="close-btn" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </FocusButton>
          <Text style={[styles.title, { color: colors.onSurface }]}>Oynatma Listesi Ekle</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView
          ref={formScrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          contentContainerStyle={{
            padding: SPACING.lg,
            paddingBottom: SPACING.xxxl + (keyboardHeight > 0 ? SPACING.xxl : 0),
          }}
        >
          <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary }]}>KAYNAK TÜRÜ</Text>
          <View style={styles.methodGrid}>
            {methods.map(m => {
              const active = method === m.key;
              return (
                <FocusButton
                  key={m.key}
                  testID={`method-${m.key}-btn`}
                  onPress={() => setMethod(m.key)}
                  activeOpacity={0.85}
                  focusable
                  style={[
                    styles.methodCard,
                    { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                    active && { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceTertiary },
                  ]}
                >
                  <Ionicons name={m.icon} size={26} color={active ? colors.brandPrimary : colors.onSurfaceSecondary} />
                  <Text style={[styles.methodLabel, { color: active ? colors.onSurface : colors.onSurfaceSecondary }]}>{m.label}</Text>
                </FocusButton>
              );
            })}
          </View>

          {method !== "code" && method !== "bulk" && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>LİSTE ADI (isteğe bağlı)</Text>
              <TextInput
                testID="playlist-name-input"
                value={name}
                onChangeText={setName}
                placeholder="Örn: MAG254 Aboneliğim"
                placeholderTextColor={colors.onSurfaceTertiary}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  (refM3uUrl.current || refXtServer.current || refStPortal.current)?.focus();
                }}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
            </>
          )}

          {method === "m3u_url" && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>M3U URL</Text>
              <TextInput
                testID="m3u-url-input"
                ref={refM3uUrl}
                value={m3uUrl}
                onChangeText={setM3uUrl}
                placeholder="https://example.com/playlist.m3u"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                blurOnSubmit
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
              <FocusButton testID="use-demo-btn" onPress={useDemo} style={styles.demoRow}>
                <Ionicons name="flash" size={16} color={colors.brandPrimary} />
                <Text style={[styles.demoText, { color: colors.brandPrimary }]}>Demo listeyi kullan (iptv-org TR)</Text>
              </FocusButton>
            </>
          )}

          {method === "m3u_file" && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>M3U DOSYASI</Text>
              <FocusButton
                testID="pick-file-btn"
                onPress={pickFile}
                style={[styles.fileBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              >
                <Ionicons name="cloud-upload-outline" size={22} color={colors.brandPrimary} />
                <Text style={[styles.fileText, { color: colors.onSurface }]} numberOfLines={1}>
                  {fileName || "Dosya seç (.m3u / .m3u8)"}
                </Text>
              </FocusButton>
            </>
          )}

          {method === "xtream" && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>SUNUCU</Text>
              <TextInput
                testID="xtream-server-input"
                ref={refXtServer}
                value={xtServer}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => refXtUser.current?.focus()}
                onChangeText={setXtServer}
                placeholder="http://sunucu.com:8080"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.md }]}>KULLANICI ADI</Text>
              <TextInput
                testID="xtream-username-input"
                ref={refXtUser}
                onFocus={revealCredentialFields}
                value={xtUser}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => refXtPass.current?.focus()}
                onChangeText={setXtUser}
                placeholder="kullanici_adiniz"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.md }]}>ŞİFRE</Text>
              <TextInput
                testID="xtream-password-input"
                ref={refXtPass}
                onFocus={revealCredentialFields}
                value={xtPass}
                returnKeyType="done"
                onChangeText={setXtPass}
                placeholder="••••••••"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
            </>
          )}

          {method === "code" && (
            <>
              <View style={[styles.infoBanner, { backgroundColor: colors.brandPrimary + "22", borderColor: colors.brandPrimary }]}>
                <Ionicons name="people" size={18} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurface, flex: 1, fontSize: FONT.size.sm }}>
                  Panel kodunu bilmiyorsanız sorun değil. Panel adından seçebilir veya yalnız kullanıcı adı ve şifre ile hesabınızı otomatik aratabilirsiniz.
                </Text>
              </View>

              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>NASIL EKLEMEK İSTİYORSUNUZ?</Text>
              <View style={styles.codeModeGrid}>
                {([
                  { key: "code" as CodeMode, label: "Kodum var", icon: "keypad" as const },
                  { key: "directory" as CodeMode, label: "Paneli biliyorum", icon: "list" as const },
                  { key: "auto" as CodeMode, label: "Paneli bilmiyorum", icon: "search" as const },
                ]).map(opt => {
                  const active = codeMode === opt.key;
                  return (
                    <FocusButton
                      key={opt.key}
                      testID={`code-mode-${opt.key}`}
                      focusable
                      onPress={() => {
                        setCodeMode(opt.key);
                        setError(null);
                        if (opt.key === "directory" && panelDirectory.length === 0) void loadPanelDirectory(false);
                      }}
                      style={[
                        styles.codeModeCard,
                        { backgroundColor: colors.surfaceSecondary, borderColor: active ? colors.brandPrimary : colors.border },
                        active && { backgroundColor: colors.surfaceTertiary },
                      ]}
                    >
                      <Ionicons name={opt.icon} size={22} color={active ? colors.brandPrimary : colors.onSurfaceSecondary} />
                      <Text style={{ color: active ? colors.onSurface : colors.onSurfaceSecondary, fontWeight: FONT.weight.semibold, textAlign: "center" }}>
                        {opt.label}
                      </Text>
                    </FocusButton>
                  );
                })}
              </View>

              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>OYNATMA LİSTESİ ADI (isteğe bağlı)</Text>
              <TextInput
                testID="server-playlist-name-input"
                value={name}
                onFocus={revealCredentialFields}
                onChangeText={setName}
                placeholder="Örn: Annemin TV'si"
                placeholderTextColor={colors.onSurfaceTertiary}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  if (codeMode === "auto") refXtUser.current?.focus?.();
                  else if (codeMode === "code" && codeVal.trim()) refXtUser.current?.focus?.();
                }}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
              <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: SPACING.xs, lineHeight: 18 }}>
                Boş bırakırsanız panel adı otomatik kullanılır. Bu görünen adı sonradan değiştirmek DNS/panel eşleştirmesini bozmaz.
              </Text>

              {codeMode === "directory" && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>PANEL / SUNUCU REHBERİ</Text>
                  <TextInput
                    testID="panel-directory-search"
                    value={panelSearch}
                    onChangeText={setPanelSearch}
                    placeholder="Panel adı veya sunucu kodu ara"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                  />
                  <FocusButton
                    testID="panel-directory-refresh"
                    onPress={() => void loadPanelDirectory(true)}
                    disabled={directoryLoading}
                    style={[styles.directoryRefresh, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                  >
                    {directoryLoading ? <ActivityIndicator color={colors.brandPrimary} /> : <Ionicons name="refresh" size={18} color={colors.brandPrimary} />}
                    <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.semibold }}>
                      {directoryLoading ? "Rehber yükleniyor..." : `Rehberi Yenile${panelDirectory.length ? ` (${panelDirectory.length})` : ""}`}
                    </Text>
                  </FocusButton>

                  {panelDirectory.length > 0 && (
                    <View style={[styles.directoryBox, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                      {filteredPanels.length === 0 ? (
                        <Text style={{ color: colors.onSurfaceSecondary, padding: SPACING.md }}>Eşleşen panel bulunamadı.</Text>
                      ) : filteredPanels.map(item => (
                        <FocusButton
                          key={`${item.code}-${item.panelName}`}
                          testID={`panel-directory-${item.code}`}
                          focusable
                          onPress={() => choosePanel(item)}
                          style={[styles.directoryRow, { borderBottomColor: colors.border }]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold, fontSize: FONT.size.base }}>{item.panelName}</Text>
                            <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm }}>
                              Sunucu kodu: {item.code} · {item.hosts.length} adres
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={colors.brandPrimary} />
                        </FocusButton>
                      ))}
                    </View>
                  )}
                  {panelDirectory.length > 100 && !panelSearch.trim() && (
                    <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: SPACING.xs }}>
                      İlk 100 panel gösteriliyor. Panel adını yazarak tüm rehberde arayabilirsiniz.
                    </Text>
                  )}
                </>
              )}

              {codeMode === "auto" && (
                <>
                  <View style={[styles.infoBanner, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <Ionicons name="shield-checkmark" size={18} color={colors.brandPrimary} />
                    <Text style={{ color: colors.onSurface, flex: 1, fontSize: FONT.size.sm }}>
                      Kullanıcı adı ve şifreniz Firebase'e gönderilmez. Uygulama Firebase'den yalnız panel/sunucu rehberini alır ve giriş bilgilerini cihazınızdan doğrudan aday IPTV sunucularında dener.
                    </Text>
                  </View>
                  <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>KULLANICI ADI</Text>
                  <TextInput
                    testID="auto-panel-user-input"
                    ref={refXtUser}
                    onFocus={revealCredentialFields}
                    value={xtUser}
                    onChangeText={setXtUser}
                    placeholder="Kullanıcı adı"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => refXtPass.current?.focus()}
                    style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                  />
                  <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.md }]}>ŞİFRE</Text>
                  <TextInput
                    testID="auto-panel-pass-input"
                    ref={refXtPass}
                    onFocus={revealCredentialFields}
                    value={xtPass}
                    onChangeText={setXtPass}
                    placeholder="Şifre"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    returnKeyType="done"
                    style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                  />
                  <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: SPACING.sm, lineHeight: 18 }}>
                    Otomatik arama tüm panel rehberini tarar. Tek eşleşme varsa doğrudan ekler; birden fazla panelde aynı kullanıcı adı/şifre geçerliyse doğru aboneliği sizin seçmenizi ister.
                  </Text>
                </>
              )}

              {codeMode === "code" && (
                <>
                  {selectedPanelName ? (
                    <View style={[styles.selectedPanel, { backgroundColor: colors.brandPrimary + "18", borderColor: colors.brandPrimary }]}>
                      <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold }}>{selectedPanelName}</Text>
                        <Text style={{ color: colors.onSurfaceSecondary }}>Sunucu kodu: {codeVal}</Text>
                      </View>
                      <FocusButton onPress={() => { setSelectedPanelItem(null); setSelectedPanelName(""); setCodeVal(""); setCodeMode("directory"); }}>
                        <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}>Değiştir</Text>
                      </FocusButton>
                    </View>
                  ) : (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>PANEL KODU</Text>
                      <TextInput
                        testID="code-value-input"
                        value={codeVal}
                        onChangeText={t => { setCodeVal(t); setSelectedPanelItem(null); setSelectedPanelName(""); }}
                        placeholder="Örn: 0001"
                        placeholderTextColor={colors.onSurfaceTertiary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="default"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={() => refXtUser.current?.focus()}
                        style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                      />
                    </>
                  )}

                  <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.md }]}>KULLANICI ADI</Text>
                  <TextInput
                    testID="code-user-input"
                    ref={refXtUser}
                    onFocus={revealCredentialFields}
                    value={xtUser}
                    onChangeText={setXtUser}
                    placeholder="Kullanıcı adı"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => refXtPass.current?.focus()}
                    style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                  />

                  <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.md }]}>ŞİFRE</Text>
                  <TextInput
                    testID="code-pass-input"
                    ref={refXtPass}
                    onFocus={revealCredentialFields}
                    value={xtPass}
                    onChangeText={setXtPass}
                    placeholder="Şifre"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    returnKeyType="done"
                    style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                  />
                </>
              )}

              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.md }]}>TARAMA HIZI</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
                {([
                  ["very_safe", "Çok Güvenli", "En uzun timeout"],
                  ["safe", "Güvenli", "Yavaş sunucuları kaçırmaz"],
                  ["balanced", "Dengeli", "Önerilen"],
                  ["fast", "Hızlı", "Yüksek paralellik"],
                  ["turbo", "Turbo", "En hızlı kontrollü tarama"],
                ] as const).map(([key, label, hint]) => {
                  const active = scanSpeed === key;
                  return (
                    <FocusButton key={`code-speed-${key}`} focusable onPress={() => setScanSpeed(key)}
                      style={[styles.scanSpeedBtn, { borderColor: active ? colors.brandPrimary : colors.border, backgroundColor: active ? colors.brandPrimary + "18" : colors.surfaceSecondary }]}>
                      <Text style={{ color: active ? colors.brandPrimary : colors.onSurface, fontWeight: FONT.weight.bold }}>{label}</Text>
                      <Text numberOfLines={2} style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, textAlign: "center" }}>{hint}</Text>
                    </FocusButton>
                  );
                })}
              </View>
              <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: SPACING.sm, lineHeight: 18 }}>
                Bu hız profili Kodum var, Paneli biliyorum ve Paneli bilmiyorum taramalarının tamamında aynıdır.
              </Text>

              {/* Kaynak URL — varsayılan uygulama sahibinindir; gelişmiş kullanıcı değiştirebilir. */}
              <FocusButton
                testID="code-source-toggle"
                onPress={() => setShowCodeSource(v => !v)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, marginTop: SPACING.sm }}
              >
                <Ionicons name={showCodeSource ? "chevron-down" : "chevron-forward"} size={16} color={colors.onSurfaceSecondary} />
                <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm }}>Kod kaynağı (gelişmiş)</Text>
              </FocusButton>
              {showCodeSource && (
                <>
                  <TextInput
                    testID="code-source-input"
                    value={codeSource}
                    onChangeText={t => {
                      setCodeSource(t);
                      setPanelDirectory([]);
                      setPanelDirectorySource("");
                      setSelectedPanelItem(null);
                      setSelectedPanelName("");
                    }}
                    placeholder={DEFAULT_CODE_SOURCE}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                  />
                  <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: -4, marginBottom: 4 }}>
                    Boş bırakılırsa varsayılan kaynak kullanılır.
                  </Text>
                </>
              )}
            </>
          )}

          {method === "bulk" && (
            <>
              <View style={[styles.infoBanner, { backgroundColor: colors.brandPrimary + "16", borderColor: colors.brandPrimary }]}> 
                <Ionicons name="shield-checkmark" size={20} color={colors.brandPrimary} />
                <Text style={[styles.infoBannerText, { color: colors.onSurface }]}> 
                  Birden fazla Xtream hesabını tek işlemde ekleyin. Kullanıcı adı ve şifreler Firebase'e gönderilmez; yalnız cihazınızdan aday IPTV sunucularında doğrulanır.
                </Text>
              </View>
              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>TARAMA HIZI</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
                {([
                  ["very_safe", "Çok Güvenli", "En uzun timeout"],
                  ["safe", "Güvenli", "Yavaş sunucuları kaçırmaz"],
                  ["balanced", "Dengeli", "Önerilen"],
                  ["fast", "Hızlı", "Yüksek paralellik"],
                  ["turbo", "Turbo", "En hızlı kontrollü tarama"],
                ] as const).map(([key, label, hint]) => {
                  const active = scanSpeed === key;
                  return (
                    <FocusButton key={`bulk-speed-${key}`} focusable onPress={() => setScanSpeed(key)}
                      style={[styles.scanSpeedBtn, { borderColor: active ? colors.brandPrimary : colors.border, backgroundColor: active ? colors.brandPrimary + "18" : colors.surfaceSecondary }]}>
                      <Text style={{ color: active ? colors.brandPrimary : colors.onSurface, fontWeight: FONT.weight.bold }}>{label}</Text>
                      <Text numberOfLines={2} style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, textAlign: "center" }}>{hint}</Text>
                    </FocusButton>
                  );
                })}
              </View>
              <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: SPACING.sm, lineHeight: 18 }}>
                Aynı profil tüm hesapların panel/DNS worker sayısını ve timeout değerini birlikte yönetir.
              </Text>

              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>FORM İLE HESAP EKLE</Text>
              {bulkManualRows.map((row, rowIndex) => (
                <View key={row.id} style={{ backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, gap: 9 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold }}>Hesap {rowIndex + 1}</Text>
                    {bulkManualRows.length > 1 && (
                      <FocusButton focusable onPress={() => setBulkManualRows(rows => rows.filter(x => x.id !== row.id))} style={{ padding: 6 }}>
                        <Ionicons name="trash-outline" size={20} color={colors.error} />
                      </FocusButton>
                    )}
                  </View>
                  <TextInput value={row.name} onChangeText={v => setBulkManualRows(rows => rows.map(x => x.id === row.id ? { ...x, name: v } : x))} onFocus={revealCredentialFields} placeholder="Liste adı (örn. Annem)" placeholderTextColor={colors.onSurfaceTertiary} style={[styles.input, { backgroundColor: colors.surface, color: colors.onSurface, borderColor: colors.border }]} />
                  <TextInput value={row.username} onChangeText={v => setBulkManualRows(rows => rows.map(x => x.id === row.id ? { ...x, username: v } : x))} onFocus={revealCredentialFields} placeholder="Kullanıcı adı" autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.onSurfaceTertiary} style={[styles.input, { backgroundColor: colors.surface, color: colors.onSurface, borderColor: colors.border }]} />
                  <TextInput value={row.password} onChangeText={v => setBulkManualRows(rows => rows.map(x => x.id === row.id ? { ...x, password: v } : x))} onFocus={revealCredentialFields} placeholder="Şifre" secureTextEntry autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.onSurfaceTertiary} style={[styles.input, { backgroundColor: colors.surface, color: colors.onSurface, borderColor: colors.border }]} />
                  <TextInput value={row.locator} onChangeText={v => setBulkManualRows(rows => rows.map(x => x.id === row.id ? { ...x, locator: v } : x))} onFocus={revealCredentialFields} placeholder="Sunucu kodu / panel adı / DNS (isteğe bağlı)" autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.onSurfaceTertiary} style={[styles.input, { backgroundColor: colors.surface, color: colors.onSurface, borderColor: colors.border }]} />
                </View>
              ))}
              <FocusButton focusable onPress={() => setBulkManualRows(rows => [...rows, { id: `bulk-row-${Date.now()}-${rows.length}`, name: "", username: "", password: "", locator: "" }])} style={[styles.fileBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <Ionicons name="person-add" size={21} color={colors.brandPrimary} />
                <Text style={[styles.fileText, { color: colors.onSurface }]}>Yeni hesap satırı ekle</Text>
              </FocusButton>

              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>HIZLI YAPIŞTIRMA (İSTEĞE BAĞLI)</Text>
              <TextInput
                testID="bulk-accounts-input"
                value={bulkText}
                onChangeText={setBulkText}
                onFocus={revealCredentialFields}
                placeholder={BULK_ACCOUNT_EXAMPLE}
                placeholderTextColor={colors.onSurfaceTertiary}
                multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false}
                style={[styles.bulkTextInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
              <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, lineHeight: 17, marginTop: 6 }}>
                CSV/TXT yanında her satıra kullanıcı:şifre biçimini de yapıştırabilirsiniz. Sunucu bilgisi yoksa panel otomatik aranır. Form, hızlı yapıştırma ve dosya aynı işlemde birlikte kullanılabilir.
              </Text>
              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>DOSYADAN EKLE (İSTEĞE BAĞLI)</Text>
              <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, lineHeight: 17, marginBottom: 7 }}>
                Manuel giriş ve dosya aynı anda kullanılabilir; hesaplar tek önizlemede birleştirilir.
              </Text>
              <FocusButton testID="bulk-pick-file-btn" focusable onPress={pickBulkFile} style={[styles.fileBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <Ionicons name="document-attach" size={22} color={colors.brandPrimary} />
                <Text style={[styles.fileText, { color: colors.onSurface }]} numberOfLines={1}>{bulkFileName || "CSV / TXT / JSON dosyası seç"}</Text>
              </FocusButton>
              {!!bulkFileText && (
                <FocusButton focusable onPress={() => { setBulkFileText(""); setBulkFileName(""); }} style={{ alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 4 }}>
                  <Text style={{ color: colors.error, fontWeight: FONT.weight.semibold }}>Dosyayı kaldır</Text>
                </FocusButton>
              )}
              {(bulkParsed.accounts.length || bulkParsed.warnings.length) ? (() => {
                const parsed = bulkParsed;
                return (
                  <View style={[styles.bulkPreview, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}> 
                    <FocusButton focusable onPress={() => setBulkPreviewOpen(v => !v)} style={styles.bulkPreviewHeader}>
                      <Ionicons name={parsed.accounts.length ? "checkmark-circle" : "alert-circle"} size={20} color={parsed.accounts.length ? colors.brandPrimary : colors.error} />
                      <Text style={{ color: colors.onSurface, flex: 1, fontWeight: FONT.weight.bold }}>{parsed.accounts.length} hesap algılandı</Text>
                      <Ionicons name={bulkPreviewOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.onSurfaceSecondary} />
                    </FocusButton>
                    {bulkPreviewOpen && <View style={{ gap: 7, marginTop: SPACING.sm }}>
                      {parsed.accounts.slice(0, 12).map(a => <View key={`${a.row}-${a.username}`} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 7 }}>
                        <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.semibold }}>{a.name || `Hesap ${a.row}`} · {a.username}</Text>
                        <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, marginTop: 2 }}>{bulkAccountLocatorLabel(a)}</Text>
                      </View>)}
                      {parsed.accounts.length > 12 && <Text style={{ color: colors.onSurfaceTertiary }}>+ {parsed.accounts.length - 12} hesap daha</Text>}
                      {parsed.warnings.slice(0, 4).map((w, i) => <Text key={i} style={{ color: colors.error, fontSize: FONT.size.xs }}>⚠ {w}</Text>)}
                    </View>}
                  </View>
                );
              })() : null}
            </>
          )}

          {method === "stalker" && (
            <>
              <View style={[styles.infoBanner, { backgroundColor: colors.brandPrimary + "22", borderColor: colors.brandPrimary }]}>
                <Ionicons name="information-circle" size={18} color={colors.brandPrimary} />
                <Text style={[styles.infoBannerText, { color: colors.onSurface }]}>
                  Sadece SİZE AİT MAG cihazının MAC adresini girin. Başkasının MAC adresini kullanmak yasadışıdır.
                </Text>
              </View>

              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>PORTAL URL</Text>
              <TextInput
                testID="stalker-portal-input"
                ref={refStPortal}
                value={stPortal}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => refStMac.current?.focus()}
                onChangeText={setStPortal}
                placeholder="http://portal.saglayici.com"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.md }]}>MAC ADRESİ</Text>
              <TextInput
                testID="stalker-mac-input"
                ref={refStMac}
                value={stMac}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => refStSerial.current?.focus()}
                onChangeText={t => setStMac(t.toUpperCase())}
                placeholder="00:1A:79:AA:BB:CC"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
              <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.md }]}>
                SERIAL NUMBER (isteğe bağlı)
              </Text>
              <TextInput
                testID="stalker-serial-input"
                ref={refStSerial}
                value={stSerial}
                returnKeyType="done"
                onChangeText={setStSerial}
                placeholder="062015N001999"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
            </>
          )}

          {error && (
            <View testID="error-box" style={[styles.errorBox, { backgroundColor: colors.error + "22", borderColor: colors.error }]}>
              <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "flex-start" }}>
                <Ionicons name="alert-circle" size={18} color={colors.error} style={{ marginTop: 2 }} />
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
              {/sunucu|ulaş|network|erişil|internet/i.test(error) && (
                <FocusButton
                  testID="error-diagnostic-btn"
                  onPress={() => router.push("/diagnostic")}
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "center",
                    gap: 6, marginTop: SPACING.sm, paddingVertical: SPACING.sm,
                    borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.error,
                  }}
                >
                  <Ionicons name="pulse" size={16} color={colors.error} />
                  <Text style={{ color: colors.error, fontWeight: FONT.weight.bold }}>Bağlantıyı Test Et</Text>
                </FocusButton>
              )}
            </View>
          )}

          {loading && progress && (
            <View style={[styles.progressBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.brandPrimary} />
              <Text style={[styles.progressText, { color: colors.onSurface }]}>{progress}</Text>
            </View>
          )}

          <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border, marginTop: SPACING.lg, marginBottom: keyboardHeight > 0 ? SPACING.sm : SPACING.lg }]}>
            <FocusButton testID="submit-playlist-btn" onPress={submit} disabled={loading} activeOpacity={0.85} style={[styles.cta, { backgroundColor: colors.brandPrimary, opacity: loading ? 0.7 : 1 }]}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <>
                <Ionicons name={method === "bulk" || method === "code" ? "search" : "checkmark-circle"} size={22} color={colors.onBrandPrimary} />
                <Text style={[styles.ctaText, { color: colors.onBrandPrimary }]}>{method === "bulk" ? "Hesapları Analiz Et" : method === "code" ? "Hesabımı Analiz Et" : "Kaydet ve Yükle"}</Text>
              </>}
            </FocusButton>
          </View>
        </ScrollView>

        <Modal
          visible={showBulkCandidates}
          transparent
          animationType="fade"
          onRequestClose={() => { if (!bulkAdding && bulkScanFinished) setShowBulkCandidates(false); }}
        >
          <View style={styles.matchModalBackdrop}>
            <View style={[styles.matchModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.matchModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.matchModalTitle, { color: colors.onSurface }]}>Bulunan Çoklu Hesaplar</Text>
                  <Text style={{ color: colors.onSurfaceSecondary, marginTop: 4, lineHeight: 18 }}>
                    {bulkScanFinished
                      ? `${bulkCandidates.length} kimlik doğrulaması başarılı panel/DNS adayı bulundu. Eklemek istediklerinizi seçin.`
                      : `Tarama sürüyor. Bulunan sonuçlar canlı ekleniyor; seçimleriniz korunur.`}
                  </Text>
                </View>
                <FocusButton focusable disabled={bulkAdding || !bulkScanFinished} onPress={() => { if (bulkScanFinished) setShowBulkCandidates(false); }} style={[styles.matchCloseBtn, { opacity: bulkScanFinished ? 1 : 0.35 }]}>
                  <Ionicons name="close" size={24} color={colors.onSurface} />
                </FocusButton>
              </View>

              {!!progress && (loading || bulkAdding || !bulkScanFinished) && (
                <View style={[styles.progressBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginBottom: SPACING.sm }]}>
                  <ActivityIndicator size="small" color={colors.brandPrimary} />
                  <Text style={{ color: colors.onSurfaceSecondary, flex: 1, fontSize: FONT.size.sm, lineHeight: 19 }}>{progress}</Text>
                </View>
              )}

              {bulkAccountProgress.length > 0 && !bulkScanFinished && (
                <View style={{ gap: 6, marginBottom: SPACING.sm }}>
                  {bulkAccountProgress.map((a) => {
                    const pct = a.total ? Math.round((a.tested / a.total) * 100) : 0;
                    const label = a.name || `Hesap ${a.sourceRow || a.accountIndex + 1}`;
                    return (
                      <View key={`bulk-progress-${a.accountIndex}`} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, borderRadius: RADIUS.md, padding: 9 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                          <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.semibold, flex: 1 }} numberOfLines={1}>{label}</Text>
                          <Text style={{ color: a.state === "completed" ? colors.success : colors.brandPrimary, fontWeight: FONT.weight.bold }}>{a.state === "completed" ? "✓" : `${pct}%`}</Text>
                        </View>
                        <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, marginTop: 3 }}>
                          Adres {a.tested}/{a.total} · Kalan {a.remaining} · Bulunan {a.found} · {a.state === "completed" ? "Tamamlandı" : a.state === "running" ? "Analiz ediliyor" : "Bekliyor"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <ScrollView style={{ maxHeight: 430 }} contentContainerStyle={{ gap: SPACING.sm, paddingBottom: SPACING.sm }}>
                {bulkCandidates.length === 0 ? (
                  <View style={[styles.infoBanner,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}>
                    <ActivityIndicator size="small" color={colors.brandPrimary} />
                    <Text style={{ color: colors.onSurface, flex: 1 }}>Henüz kimlik doğrulaması başarılı aday bulunmadı.</Text>
                  </View>
                ) : bulkCandidates.map((c,index) => {
                  const selected = selectedBulkCandidateKeys.includes(c.key);
                  const ui = c.login?.user_info || {};
                  const status = String(ui.status || (ui.auth === 1 || ui.auth === "1" ? "Aktif" : "Bilinmiyor"));
                  const importState = bulkImportStatuses[c.key];
                  return (
                    <FocusButton key={c.key} focusable autoFocus={index===0} disabled={bulkAdding}
                      onPress={() => setSelectedBulkCandidateKeys(prev => selected ? prev.filter(k=>k!==c.key) : [...prev,c.key])}
                      style={[styles.matchRow,{ backgroundColor:selected?colors.brandPrimary+"14":colors.surfaceSecondary,borderColor:selected?colors.brandPrimary:colors.border }]}>
                      <View style={{flex:1}}>
                        <Text style={{color:colors.onSurface,fontWeight:FONT.weight.bold}}>{c.name || c.panelName}</Text>
                        <Text style={{color:colors.onSurfaceSecondary,marginTop:2}}>Kullanıcı: {c.username} · Durum: {status}</Text>
                        <Text style={{color:colors.onSurfaceSecondary,marginTop:2}}>Panel: {c.panelName}{c.code ? ` · Kod: ${c.code}` : ""}</Text>
                        <Text style={{color:colors.onSurfaceTertiary,marginTop:2,fontSize:FONT.size.xs}}>{c.server}</Text>
                        {!!importState && (
                          <Text style={{color: importState.state === "failed" ? colors.error : importState.state === "completed" ? colors.success : colors.brandPrimary, marginTop:6, fontSize:FONT.size.xs, fontWeight:FONT.weight.bold}}>
                            {importState.state === "completed" ? "✓ " : importState.state === "failed" ? "✕ " : "• "}{importState.message}
                            {importState.state === "completed" ? ` · ${importState.channels || 0} kanal · ${importState.vod || 0} film · ${importState.series || 0} dizi` : ""}
                          </Text>
                        )}
                      </View>
                      <Ionicons name={selected?"checkbox":"square-outline"} size={26} color={selected?colors.brandPrimary:colors.onSurfaceTertiary}/>
                    </FocusButton>
                  );
                })}
                {bulkScanFailures.length > 0 && (
                  <View style={[styles.infoBanner,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}>
                    <Ionicons name="warning-outline" size={18} color={colors.error}/>
                    <Text style={{color:colors.onSurfaceSecondary,flex:1,fontSize:FONT.size.sm}}>
                      Sonuç bulunamayanlar: {bulkScanFailures.slice(0,4).join(" · ")}{bulkScanFailures.length>4?` · +${bulkScanFailures.length-4} kayıt`:""}
                    </Text>
                  </View>
                )}
              </ScrollView>

              {bulkAdding && Platform.OS === "android" && KizilkanNativeCore.available && (
                <View style={{flexDirection:"row",gap:SPACING.sm,marginTop:SPACING.md}}>
                  <FocusButton focusable onPress={async () => {
                    const next = !bulkImportPaused;
                    if (next) await KizilkanNativeCore.pauseBulkImport(); else await KizilkanNativeCore.resumeBulkImport();
                    setBulkImportPaused(next);
                  }} style={[styles.bulkBtn,{borderColor:colors.border,backgroundColor:colors.surfaceSecondary}]}>
                    <Text style={{color:colors.onSurface,fontWeight:FONT.weight.bold}}>{bulkImportPaused ? "Eklemeye Devam Et" : "Eklemeyi Duraklat"}</Text>
                  </FocusButton>
                  <FocusButton focusable onPress={async () => {
                    await KizilkanNativeCore.cancelBulkImport();
                    setProgress(prev => `${prev || "Native ekleme"}\nDurdurma isteği gönderildi. Tamamlanan hesaplar cihazda korunur.`);
                  }} style={[styles.bulkBtn,{borderColor:colors.error,backgroundColor:colors.surfaceSecondary}]}>
                    <Text style={{color:colors.error,fontWeight:FONT.weight.bold}}>Eklemeyi Durdur</Text>
                  </FocusButton>
                </View>
              )}

              {!bulkScanFinished && (loading || bulkScanPaused) && (
                <View style={{flexDirection:"row",gap:SPACING.sm,marginTop:SPACING.md}}>
                  <FocusButton focusable disabled={bulkAdding || bulkScanStopping || !bulkScanRunIdRef.current} onPress={async () => {
                    const next = !bulkScanPausedRef.current;
                    bulkScanPausedRef.current = next;
                    setBulkScanPaused(next);
                    if (bulkScanRunIdRef.current) { if (next) await PanelScan.pauseScan(bulkScanRunIdRef.current); else await PanelScan.resumeScan(bulkScanRunIdRef.current); }
                    setProgress(prev => `${prev || "Çoklu hesap taraması"}\n${next ? "DURAKLATILDI — aktif istekler tamamlanır, yeni iş başlatılmaz." : "Tarama devam ediyor…"}`);
                  }} style={[styles.bulkBtn,{borderColor:colors.border,backgroundColor:colors.surfaceSecondary,opacity:bulkScanRunIdRef.current && !bulkScanStopping ? 1 : 0.5}]}>
                    <Text style={{color:colors.onSurface,fontWeight:FONT.weight.bold}}>{!bulkScanRunIdRef.current ? "Hazırlanıyor" : bulkScanPaused ? "Devam Et" : "Duraklat"}</Text>
                  </FocusButton>
                  <FocusButton focusable disabled={bulkAdding || bulkScanStopping} onPress={async () => {
                    if (bulkScanStopping) return;
                    setBulkScanStopping(true);
                    bulkScanCancelledRef.current = true;
                    bulkScanPausedRef.current = false;
                    setBulkScanPaused(false);
                    bulkPreparationAbortRef.current?.abort();
                    if (bulkScanRunIdRef.current) await PanelScan.cancelScan(bulkScanRunIdRef.current);
                    setProgress("DURDURULUYOR — katalog hazırlığı/ağ istekleri kesiliyor; bulunan sonuçlar korunacak.");
                  }} style={[styles.bulkBtn,{borderColor:colors.error,backgroundColor:colors.surfaceSecondary,opacity:bulkScanStopping?0.55:1}]}>
                    <Text style={{color:colors.error,fontWeight:FONT.weight.bold}}>{bulkScanStopping ? "Durduruluyor…" : "Durdur"}</Text>
                  </FocusButton>
                </View>
              )}

              <View style={{flexDirection:"row",gap:SPACING.sm,marginTop:SPACING.md}}>
                <FocusButton focusable disabled={bulkAdding || bulkCandidates.length===0}
                  onPress={() => setSelectedBulkCandidateKeys(selectedBulkCandidateKeys.length===bulkCandidates.length?[]:bulkCandidates.map(c=>c.key))}
                  style={[styles.bulkBtn,{borderColor:colors.border,backgroundColor:colors.surfaceSecondary}]}>
                  <Text style={{color:colors.onSurface,fontWeight:FONT.weight.bold}}>{selectedBulkCandidateKeys.length===bulkCandidates.length && bulkCandidates.length?"Seçimi Kaldır":"Tümünü Seç"}</Text>
                </FocusButton>
                <FocusButton focusable disabled={bulkAdding || selectedBulkCandidateKeys.length===0 || !bulkScanFinished} onPress={addSelectedBulkCandidates}
                  style={[styles.bulkBtn,{backgroundColor:colors.brandPrimary,opacity:selectedBulkCandidateKeys.length && bulkScanFinished?1:0.5}]}>
                  {bulkAdding?<ActivityIndicator color={colors.onBrandPrimary}/>:<Text style={{color:colors.onBrandPrimary,fontWeight:FONT.weight.bold}}>{!bulkScanFinished ? "Taramanın Bitmesini Bekleyin" : `${new Set(bulkCandidates.filter(c=>selectedBulkCandidateKeys.includes(c.key)).map(bulkSubscriptionKey)).size} Aboneliği Doğrula ve Ekle`}</Text>}
                </FocusButton>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showDiscoveryMatches}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!nativeScanRunning && !bulkAdding) setShowDiscoveryMatches(false);
          }}
        >
          <View style={styles.matchModalBackdrop}>
            <View style={[styles.matchModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.matchModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.matchModalTitle, { color: colors.onSurface }]}>
                    {discoveryTitle}
                  </Text>
                  <Text style={{ color: colors.onSurfaceSecondary, marginTop: 4, lineHeight: 18 }}>
                    {discoverySubtitle}
                  </Text>
                </View>
                <FocusButton
                  testID="discovery-match-close"
                  focusable
                  disabled={nativeScanRunning || bulkAdding}
                  onPress={() => {
                    if (!nativeScanRunning && !bulkAdding) setShowDiscoveryMatches(false);
                  }}
                  style={[styles.matchCloseBtn, { opacity: nativeScanRunning || bulkAdding ? 0.35 : 1 }]}
                >
                  <Ionicons name="close" size={24} color={colors.onSurface} />
                </FocusButton>
              </View>

              {!!progress && (nativeScanRunning || loading || bulkAdding) && (
                <View style={[styles.progressBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginBottom: SPACING.sm }]}>
                  <ActivityIndicator size="small" color={colors.brandPrimary} />
                  <Text style={{ color: colors.onSurfaceSecondary, flex: 1, fontSize: FONT.size.sm, lineHeight: 19 }}>{progress}</Text>
                  {nativeScanRunning && (
                    <View style={{ gap: 6 }}>
                      <FocusButton focusable disabled={nativeScanStopping || !nativeScanRunIdRef.current} onPress={async () => {
                        if (!nativeScanRunIdRef.current) return;
                        if (nativeScanPaused) await PanelScan.resumeScan(nativeScanRunIdRef.current); else await PanelScan.pauseScan(nativeScanRunIdRef.current);
                        setNativeScanPaused(!nativeScanPaused);
                      }} style={[styles.bulkBtn,{borderColor:colors.border,backgroundColor:colors.surface,opacity:nativeScanRunIdRef.current && !nativeScanStopping ? 1 : 0.5}]}>
                        <Text style={{color:colors.onSurface,fontWeight:FONT.weight.bold}}>{!nativeScanRunIdRef.current ? "Hazırlanıyor" : nativeScanPaused ? "Devam" : "Duraklat"}</Text>
                      </FocusButton>
                      <FocusButton focusable disabled={nativeScanStopping} onPress={async () => {
                        if (nativeScanStopping) return;
                        setNativeScanStopping(true);
                        nativePreparationAbortRef.current?.abort();
                        if (nativeScanRunIdRef.current) await PanelScan.cancelScan(nativeScanRunIdRef.current);
                        setProgress("DURDURULUYOR — katalog hazırlığı/ağ istekleri kesiliyor; bulunan sonuçlar korunacak.");
                      }} style={[styles.bulkBtn,{borderColor:colors.error,backgroundColor:colors.surface,opacity:nativeScanStopping?0.55:1}]}>
                        <Text style={{color:colors.error,fontWeight:FONT.weight.bold}}>{nativeScanStopping ? "Durduruluyor…" : "Durdur"}</Text>
                      </FocusButton>
                    </View>
                  )}
                </View>
              )}

              <ScrollView
                style={{ maxHeight: 480 }}
                contentContainerStyle={{ gap: SPACING.sm, paddingBottom: SPACING.sm }}
                keyboardShouldPersistTaps="handled"
              >
                {discoveryMatches.map((m, index) => {
                  const info = accountSummary(m);
                  const key = discoveryKey(m);
                  const selected = selectedDiscoveryKeys.includes(key);
                  return (
                    <FocusButton
                      key={`${m.code}-${m.panelName}-${m.server}`}
                      testID={`discovery-match-${index}`}
                      focusable
                      autoFocus={index === 0}
                      onPress={() => setSelectedDiscoveryKeys(prev => selected ? prev.filter(k => k !== key) : [...prev, key])}
                      style={[styles.matchRow,{ backgroundColor: selected ? colors.brandPrimary + "14" : colors.surfaceSecondary, borderColor: selected ? colors.brandPrimary : colors.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold, fontSize: FONT.size.base }}>
                          {m.panelName}
                        </Text>
                        <Text style={{ color: colors.onSurfaceSecondary, marginTop: 2 }}>
                          Sunucu kodu: {m.code}
                        </Text>
                        <Text style={{ color: colors.onSurfaceSecondary, marginTop: 2 }}>
                          Durum: {info.status} · Bitiş: {info.exp}
                        </Text>
                        <Text style={{ color: colors.onSurfaceTertiary, marginTop: 2, fontSize: FONT.size.xs }}>
                          Bağlantı: {info.active}/{info.max} · {m.server}
                        </Text>
                      </View>
                      <Ionicons name={selected ? "checkbox" : "square-outline"} size={26} color={selected ? colors.brandPrimary : colors.onSurfaceTertiary} />
                    </FocusButton>
                  );
                })}
              </ScrollView>

              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
                <FocusButton focusable onPress={() => {
                  const activeKeys = discoveryMatches.filter(isActiveDiscoveryMatch).map(discoveryKey);
                  setSelectedDiscoveryKeys(activeKeys.length > 0 && activeKeys.every(k => selectedDiscoveryKeys.includes(k)) ? [] : activeKeys);
                }} style={[styles.bulkBtn,{borderColor:colors.border,backgroundColor:colors.surfaceSecondary}]}>
                  <Text style={{color:colors.onSurface,fontWeight:FONT.weight.bold}}>Aktifleri Seç / Kaldır</Text>
                </FocusButton>
                <FocusButton testID="discovery-add-selected" focusable disabled={bulkAdding || selectedDiscoveryKeys.length===0 || nativeScanRunning} onPress={async()=>{
                  const chosen=discoveryMatches.filter(m=>selectedDiscoveryKeys.includes(discoveryKey(m))); setBulkAdding(true); let ok=0; const failed:string[]=[];
                  try {
                    const hostsByPanel = new Map<string, string[]>();
                    for (const all of discoveryMatches) {
                      const panelKey = `${all.code}\u0000${all.panelName}`;
                      hostsByPanel.set(panelKey, [...(hostsByPanel.get(panelKey) || []), all.server]);
                    }
                    // Aynı panelin birden fazla çalışan DNS'i ayrı abonelik değildir.
                    // Seçilen DNS'leri panel bazında grupla; tek playlist + validatedHosts yaz.
                    const grouped = new Map<string, PanelCredentialMatch[]>();
                    for (const m of chosen) {
                      const panelKey = `${m.code}\u0000${m.panelName}`;
                      grouped.set(panelKey, [...(grouped.get(panelKey) || []), m]);
                    }
                    const panelGroups = Array.from(grouped.entries());
                    for(let i=0;i<panelGroups.length;i++){
                      const [panelKey, group] = panelGroups[i];
                      const preferred = group.find(isActiveDiscoveryMatch) || group[0];
                      const customBase = name.trim();
                      const displayName = customBase
                        ? (panelGroups.length === 1 ? customBase : `${customBase} · ${preferred.panelName}`)
                        : preferred.panelName;
                      const validatedHosts = Array.from(new Set(hostsByPanel.get(panelKey) || group.map(x => x.server)));
                      setProgress(`${i+1}/${panelGroups.length} · ${displayName} doğrulanıyor ve ekleniyor...`);
                      const added=await submitXtreamDirect(
                        {server:preferred.server,username:xtUser.trim(),password:xtPass.trim()},
                        displayName,
                        makeBinding(preferred.code,preferred.panelName,preferred.server,validatedHosts),
                        false
                      );
                      if(added) ok++; else failed.push(displayName);
                    }
                    setShowDiscoveryMatches(false); setDiscoveryMatches([]); setSelectedDiscoveryKeys([]);
                    Alert.alert("Panel Ekleme",`${ok}/${panelGroups.length} playlist eklendi.`+(failed.length?`\nEklenemeyen: ${failed.join(", ")}`:""));
                    if(ok>0) router.replace("/(tabs)");
                  } finally { setBulkAdding(false); setLoading(false); setProgress(""); }
                }} style={[styles.bulkBtn,{backgroundColor:colors.brandPrimary,opacity:selectedDiscoveryKeys.length && !nativeScanRunning?1:0.5}]}>
                  {bulkAdding?<ActivityIndicator color={colors.onBrandPrimary}/>:<Text style={{color:colors.onBrandPrimary,fontWeight:FONT.weight.bold}}>{nativeScanRunning ? "Taramanın Bitmesini Bekleyin" : `${new Set(discoveryMatches.filter(m=>selectedDiscoveryKeys.includes(discoveryKey(m))).map(m=>`${m.code}\u0000${m.panelName}`)).size} Seçileni Doğrula ve Ekle`}</Text>}
                </FocusButton>
              </View>

              <View style={[styles.infoBanner, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginTop: SPACING.md }]}>
                <Ionicons name="shield-checkmark" size={18} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurface, flex: 1, fontSize: FONT.size.sm }}>
                  Aynı aboneliğin birden fazla çalışan DNS’i tek playlist altında gruplanır. Seçiminizden sonra yalnız seçilen abonelikler yeniden doğrulanır ve eklenir; diğer çalışan DNS’ler yedek validatedHosts olarak saklanır.
                </Text>
              </View>
            </View>
          </View>
        </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  sectionLabel: {
    fontSize: FONT.size.xs,
    fontWeight: FONT.weight.bold,
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  methodGrid: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
  methodCard: {
    width: "23%",
    minWidth: 74,
    flexGrow: 1,
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
    gap: SPACING.xs,
  },
  methodLabel: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    fontSize: FONT.size.lg,
  },
  demoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.sm },
  demoText: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  fileBtn: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    height: 52, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg,
  },
  fileText: { fontSize: FONT.size.base, flex: 1 },
  codeModeGrid: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
  codeModeCard: {
    flex: 1,
    minWidth: 120,
    minHeight: 78,
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
  },
  directoryRefresh: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    minHeight: 46,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  directoryBox: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    marginTop: SPACING.sm,
  },
  directoryRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  selectedPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
  },
  infoBanner: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1,
    marginTop: SPACING.md,
  },
  infoBannerText: { flex: 1, fontSize: FONT.size.sm, lineHeight: 18 },
  errorBox: {
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg,
  },
  errorText: { flex: 1, fontSize: FONT.size.base, lineHeight: 20 },
  progressBox: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg,
  },
  progressText: { fontSize: FONT.size.base },
  matchModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  matchModalCard: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "86%",
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  matchModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  matchModalTitle: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
  },
  matchCloseBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.pill,
  },
  matchRow: {
    minHeight: 92,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  scanSpeedBtn: { flexGrow: 1, flexBasis: "30%", minWidth: 96, minHeight: 68, borderWidth: 1, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, paddingVertical: 8, gap: 3 },
  bulkBtn: { flex: 1, minHeight: 46, borderRadius: RADIUS.pill, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.sm },
  matchSelectBadge: {
    minWidth: 54,
    minHeight: 36,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.sm,
  },
  bulkTextInput: { minHeight: 180, maxHeight: 320, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, fontSize: FONT.size.base, lineHeight: 21 },
  bulkPreview: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.md },
  bulkPreviewHeader: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  footer: { padding: SPACING.lg, borderTopWidth: 1 },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
    height: 56, borderRadius: RADIUS.pill,
  },
  ctaText: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
});
