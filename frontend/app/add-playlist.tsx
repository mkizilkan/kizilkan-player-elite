import {CatalogProgressCards} from "@/src/components/CatalogProgressCards";
import type {RefreshProgress} from "@/src/utils/refreshPlaylist";
import {PanelScopePicker} from "@/src/components/PanelScopePicker";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  SectionList,
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
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
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
import type { Playlist, AccountInfo, ServerCodeBinding, PlaylistContentSelection } from "@/src/types";
import { catalogCategories, applyContentSelection, allContentSelection } from "@/src/utils/contentSelection";
import { playlistIdentityCanonical } from "@/src/utils/playlistManagement";
import { FocusButton } from "@/src/components/FocusButton";
import {
  DEFAULT_CODE_SOURCE,CODE_SOURCE_KEY,filterDirectory,canonicalPanelHost,validPanelHosts,type DirectoryScope,type PanelTarget,
  fetchPanelDirectory, discoverPanelsByCredentials, discoverServerCodeHosts,
  resolvePanelDirectoryItem,
  type PanelDirectoryItem, type PanelCredentialMatch, type ScanExecutionControl,
} from "@/src/utils/serverCode";
import { PanelScan, type NativeScanStartResult } from "@/modules/panel-scan";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import { storage } from "@/src/utils/storage";
import { markTask, recordDiagnostic } from "@/src/utils/diagnostics";
import { clearScanRecoveryIntent } from "@/src/utils/appSession";
import { buildKizilkanAccountArchive } from "@/src/utils/accountArchive";
import {
  BULK_ACCOUNT_EXAMPLE,
  bulkAccountFromManual,
  bulkAccountLocatorLabel,
  parseBulkAccounts,
  type BulkAccountInput,
  type BulkAccountParseResult,
} from "@/src/utils/bulkAccounts";

type Method = "m3u_url" | "m3u_file" | "xtream" | "stalker" | "code" | "bulk";
type CodeMode = "code" | "directory" | "auto";
type ScanSpeed = "very_safe" | "safe" | "balanced" | "fast" | "turbo";
type BulkResolvedCandidate = {
  sources?:ServerCodeBinding["sources"];
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
const PENDING_BULK_STREAM_KEY = "kizilkan.pendingBulkStream.v17.2.0";
const PENDING_BULK_IMPORT_KEY = "kizilkan.pendingBulkImport.v15.2.3";

function stableScanSourceFingerprint(accounts: BulkAccountInput[], directorySource: string): string {
  // v17.1.0: credential değerlerini telemetry'ye taşımadan aynı kaynak setini ayırt et.
  // FNV-1a benzeri non-cryptographic fingerprint yalnız recovery eşleşmesi içindir.
  let h = 0x811c9dc5;
  const feed = (value: string) => {
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  feed(String(accounts.length));
  feed(directorySource.trim());
  for (const a of accounts) {
    feed(String(a.row)); feed(a.username); feed(a.password);
    feed(a.server || ""); feed(a.serverCode || ""); feed(a.panelName || "");
  }
  return `v171-${accounts.length}-${h.toString(16).padStart(8, "0")}`;
}

function stableStreamingFileFingerprint(uri: string, name: string, size: number, directorySource: string): string {
  let h = 0x811c9dc5;
  const feed = (value: string) => { for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
  feed(uri); feed(name); feed(String(size || 0)); feed(directorySource.trim());
  return `v172-file-${h.toString(16).padStart(8, "0")}`;
}

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

function countTextLines(text: string): number {
  if (!text) return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  return lines;
}

function defaultBulkArchiveBaseName(safe: boolean): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `KIZILKAN-HESAP-ARSIVI-${safe ? "GUVENLI-" : ""}${stamp}`;
}

function normalizeBulkArchiveBaseName(value: string, safe: boolean): string {
  // v17.0.14: SAF createFileAsync dosya adını uzantısız bekler. Kullanıcının
  // girdiği .txt varsa yalnız son uzantıyı ayır; Android/Windows uyumsuz
  // kontrol/ayraç karakterlerini güvenli tireye dönüştür.
  let name = String(value || "").trim().replace(/\.txt$/i, "");
  name = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) name = `_${name}`;
  if (!name) name = defaultBulkArchiveBaseName(safe);
  return name.slice(0, 120).replace(/[. ]+$/g, "") || defaultBulkArchiveBaseName(safe);
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
  const { playlists, addPlaylist, addPreparedPlaylist, enrichPlaylistMedia, updatePlaylist, setActivePlaylist } = usePlaylists();

  // v16.13.6 — Aynı sağlayıcı hesabının yanlışlıkla tekrar eklenmesini görünür kıl.
  // Parola/token fingerprint'e girmez; canonical kimlik yalnız kaynak + normalize endpoint + kullanıcı/MAC bilgisidir.
  type DuplicateDecision = { action: "proceed" | "cancel"; target: Playlist };
  const resolveDuplicateTarget = React.useCallback(async (candidate: Playlist, allowUpdate = true): Promise<DuplicateDecision> => {
    const identity = playlistIdentityCanonical(candidate);
    const duplicate = playlists.find(p => p.id !== candidate.id && playlistIdentityCanonical(p) === identity);
    if (!duplicate) return { action: "proceed", target: candidate };
    return await new Promise(resolve => {
      Alert.alert(
        "Playlist zaten mevcut",
        `“${duplicate.name}” aynı kaynak hesabını kullanıyor. Mevcut kaydı güncelleyebilir, onu açabilir veya ayrı bir playlist olarak ekleyebilirsiniz.`,
        [
          { text: "Vazgeç", style: "cancel", onPress: () => resolve({ action: "cancel", target: candidate }) },
          { text: "Mevcut olanı aç", onPress: async () => { await setActivePlaylist(duplicate.id); router.replace("/(tabs)"); resolve({ action: "cancel", target: candidate }); } },
          { text: "Ayrı ekle", onPress: () => resolve({ action: "proceed", target: candidate }) },
          ...(allowUpdate ? [{ text: "Mevcudu güncelle", onPress: () => resolve({ action: "proceed", target: { ...candidate, id: duplicate.id, createdAt: duplicate.createdAt, manualOrder: duplicate.manualOrder, pinned: duplicate.pinned } }) }] : []),
        ]
      );
    });
  }, [playlists, router, setActivePlaylist]);

  const commitPlaylist = React.useCallback(async (candidate: Playlist): Promise<boolean> => {
    const decision = await resolveDuplicateTarget(candidate);
    if (decision.action === "cancel") return false;
    await addPlaylist(decision.target);
    return true;
  }, [addPlaylist, resolveDuplicateTarget]);

  const commitPreparedPlaylist = React.useCallback(async (candidate: Playlist): Promise<boolean> => {
    const decision = await resolveDuplicateTarget(candidate, false);
    if (decision.action === "cancel") return false;
    await addPreparedPlaylist(decision.target);
    return true;
  }, [addPreparedPlaylist, resolveDuplicateTarget]);
  const playlistServerKeysRef = React.useRef<Set<string>>(new Set());
  const directImportLocksRef = React.useRef<Set<string>>(new Set());
  const restoredImportAdoptedRef = React.useRef<Set<string>>(new Set());
  const bulkImportOwnedByScreenRef = React.useRef(false);
  /** v17.8.0 RC3: kullanıcı "Duraklat" dedi mi (iptalden ayırt etmek için). */
  const bulkPauseRequestedRef = React.useRef(false);
  /** v17.8.0 RC3: devam önerisi bu ekran açılışında gösterildi mi. */
  const resumeOfferShownRef = React.useRef(false);
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
  const [catalogProgress,setCatalogProgress]=useState<RefreshProgress|null>(null);
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
  const [sourceScope,setSourceScope]=useState<DirectoryScope>("all");
  const [panelTarget,setPanelTarget]=useState<PanelTarget>({});
  const directoryRef=React.useRef<PanelDirectoryItem[]>([]);
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
  const [bulkUseAllValidatedHosts, setBulkUseAllValidatedHosts] = useState(true);
  const [showBulkCandidates, setShowBulkCandidates] = useState(false);
  const bulkResultsDismissedRef = React.useRef(false);
  const [bulkScanFinished, setBulkScanFinished] = useState(false);
  const [bulkStreamProgress,setBulkStreamProgress]=useState<{read:number;completed:number;tested:number;found:number;producerDone:boolean}|null>(null);
  const [bulkScanFailures, setBulkScanFailures] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [chooseCategories, setChooseCategories] = useState(false);
  const [categoryPicker, setCategoryPicker] = useState<null | { categories:{live:string[];vod:string[];series:string[]}; selection:PlaylistContentSelection }>(null);
  const categoryResolveRef = React.useRef<((v:PlaylistContentSelection|null)=>void)|null>(null);
  const requestCategorySelection = React.useCallback((catalog:{channels:any[];vod:any[];series:any[]}) => new Promise<PlaylistContentSelection|null>((resolve) => {
    const cats=catalogCategories(catalog as any);
    categoryResolveRef.current=resolve;
    setCategoryPicker({categories:cats,selection:allContentSelection()});
  }), []);
  const finishCategorySelection = React.useCallback((value:PlaylistContentSelection|null) => {
    const resolve=categoryResolveRef.current; categoryResolveRef.current=null; setCategoryPicker(null); resolve?.(value);
  }, []);
  const [scanSpeed, setScanSpeed] = useState<ScanSpeed>("balanced");
  // v17.1.0 ultra-scale: bulk tarama için kullanıcı kontrollü değerler.
  const [bulkCustomConcurrencyEnabled, setBulkCustomConcurrencyEnabled] = useState(false);
  const [bulkRequestedConcurrency, setBulkRequestedConcurrency] = useState("32");
  const [bulkBatchSize, setBulkBatchSize] = useState("15");
  const [error, setError] = useState<string | null>(null);
  const nativeScanTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const nativeScanSeenRef = React.useRef<Set<string>>(new Set());
  const interruptedRecoveryAttemptedRef = React.useRef(false);
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
  const [bulkFileLoaded, setBulkFileLoaded] = useState(false);
  // v17.0.13: Büyük dosyayı ikinci kez parse etme ve ham metni state içinde
  // gereksiz yere tutma. Seçim anındaki tek parse sonucu saklanır.
  const [bulkFileParsed, setBulkFileParsed] = useState<BulkAccountParseResult | null>(null);
  // v17.2.0: büyük Android TXT/CSV kaynakları tam hesap dizisi olarak JS state'e alınmaz.
  const [bulkFileStreamSource, setBulkFileStreamSource] = useState<{ uri:string; name:string; size:number; samples:BulkAccountInput[]; warnings:string[] } | null>(null);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkFilePicking, setBulkFilePicking] = useState(false);
  const [bulkFilePhase, setBulkFilePhase] = useState<"idle"|"selecting"|"reading"|"parsing"|"ready"|"failed"|"cancelled">("idle");
  const bulkFilePickerInFlightRef = React.useRef(false);
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false);
  // v17.0.14: TXT dışa aktarmada kullanıcı dosya adını düzenleyebilir;
  // kaydetme işi ayrı state ile izlenir, ana tarama loading durumuna karışmaz.
  const [bulkArchiveNameOpen, setBulkArchiveNameOpen] = useState(false);
  const [bulkArchiveSafe, setBulkArchiveSafe] = useState(false);
  const [bulkArchiveFileName, setBulkArchiveFileName] = useState("");
  const [bulkArchiveSaving, setBulkArchiveSaving] = useState(false);
  const [bulkManualRows, setBulkManualRows] = useState<Array<{ id: string; name: string; username: string; password: string; locator: string }>>([
    { id: "bulk-row-1", name: "", username: "", password: "", locator: "" },
  ]);


  const bulkParsed = React.useMemo(() => {
    const manual = bulkText.trim() ? parseBulkAccounts(bulkText) : { accounts: [] as BulkAccountInput[], warnings: [] as string[] };
    const file = bulkFileParsed ?? { accounts: [] as BulkAccountInput[], warnings: [] as string[] };
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
  }, [bulkManualRows, bulkText, bulkFileParsed, bulkFileName]);


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

  React.useEffect(() => {
    if (!error || method !== "stalker") return;
    const t = setTimeout(() => {
      const scroll: any = formScrollRef.current;
      scroll?.scrollToEnd?.({ animated: true });
    }, 100);
    return () => clearTimeout(t);
  }, [error, method]); // stalker-error-reveal

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

  const getScanDirectory=async(src:string,options:Parameters<typeof fetchPanelDirectory>[1]={})=>{
    const all=await fetchPanelDirectory(src,options);directoryRef.current=all;
    return filterDirectory(all,sourceScope,panelTarget);
  };

  /**
   * v17.4.0 — 100 PANEL SINIRI KALDIRILDI (P1)
   * ==========================================================================
   * HATA: 792 panelin yalnız ilk 100'ü gösteriliyordu. Kullanıcı adını
   * bilmediği paneli arayamaz, arayamadığı için seçemezdi.
   *
   * ÇÖZÜM: Sınır yok; arama panel adı, kod VE DNS adresleri üzerinde çalışır.
   * Çizim maliyeti "daha fazla göster" ile kademelendirilir (bir anda 792
   * satır çizmek arayüzü dondurur).
   */
  const matchedPanels = React.useMemo(() => {
    const q = panelSearch.trim().toLocaleLowerCase("tr");
    if (!q) return panelDirectory;
    const terms = q.split(/\s+/).filter(Boolean);
    return panelDirectory.filter(p => {
      const hay = [
        p.panelName,
        p.code,
        ...(p.codes || []),
        ...(p.hosts || []),
      ].join(" ").toLocaleLowerCase("tr");
      return terms.every(t => hay.includes(t));
    });
  }, [panelDirectory, panelSearch]);

  /** v17.4.0: kademeli çizim — "daha fazla göster" ile artar. */
  const [panelVisibleCount, setPanelVisibleCount] = React.useState(100);
  React.useEffect(() => { setPanelVisibleCount(100); }, [panelSearch, sourceScope]);

  const filteredPanels = React.useMemo(
    () => matchedPanels.slice(0, panelVisibleCount),
    [matchedPanels, panelVisibleCount],
  );

  /**
   * v17.4.0 — KAPSAM FİLTRESİ ARTIK HER YOLDA UYGULANIR (P0)
   * ==========================================================================
   * HATA (kullanıcı bildirimi): "bir panel seçtiğimde sadece istediğim
   * sunucular için arama yapmıyor, tüm sunucuları deniyor."
   *
   * KÖK NEDEN: Tarama yollarında rehber şöyle alınıyordu:
   *     panelDirectory.length && panelDirectorySource === src
   *       ? filterDirectory(panelDirectory, sourceScope, panelTarget)   <-- filtreli
   *       : await getScanDirectory(src, ...)                            <-- FİLTRESİZ
   * Yani rehber önbellekte yoksa veya kaynak değişmişse kullanıcının panel
   * seçimi SESSİZCE yok sayılıp 792 panelin tamamı taranıyordu.
   *
   * İKİNCİ SONUÇ: Aday listesi devasa oluyor ve native köprüde
   *     TransactionTooLargeException: data parcel size 11.525.580 bytes
   * hatasıyla tarama HİÇ başlamıyordu (Android Binder sınırı ~1 MB).
   * Tek kullanıcı/şifre ile bile bu boyuta çıkması, yükün hesaplardan değil
   * REHBERDEN geldiğini kanıtlıyor.
   *
   * ÇÖZÜM: Rehber nereden gelirse gelsin filtre tek noktadan uygulanır.
   * Tarama yollarında artık doğrudan getScanDirectory ÇAĞRILMAZ.
   */
  const resolveScanDirectory = React.useCallback(async (
    src: string,
    opts: { signal?: AbortSignal; timeoutMs?: number } = {},
  ) => {
    const base = (panelDirectory.length && panelDirectorySource === src)
      ? panelDirectory
      : await getScanDirectory(src, opts);
    const filtered = filterDirectory(base, sourceScope, panelTarget);
    void recordDiagnostic('scan', 'SCAN_DIRECTORY_SCOPE_APPLIED', {
      source: src,
      fromCache: panelDirectory.length > 0 && panelDirectorySource === src,
      total: base.length,
      afterScope: filtered.length,
      scope: sourceScope,
      hasTarget: !!(panelTarget.codes?.length || panelTarget.names?.length || panelTarget.keys?.length || panelTarget.hosts?.length),
    });
    return filtered;
  }, [panelDirectory, panelDirectorySource, sourceScope, panelTarget]);

  const loadPanelDirectory = async (forceRefresh = false) => {
    if (directoryLoading) return;
    setError(null);
    setDirectoryLoading(true);
    try {
      const src = codeSource.trim() || DEFAULT_CODE_SOURCE;
      await storage.setItem(CODE_SOURCE_KEY, src);
      const list=await fetchPanelDirectory(src,{forceRefresh});
      directoryRef.current=list;
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
    validatedHosts:string[]=[server],
    sources?:ServerCodeBinding["sources"],
  ): ServerCodeBinding => ({
    code: String(code).trim(),
    panelName: String(panelName).trim(),
    codeSource:sources?.find(o=>o.hosts.includes(server))?.baseUrl||directoryRef.current.find(p=>p.panelName===panelName&&p.hosts.includes(server))?.sources?.find(o=>o.hosts.includes(server))?.baseUrl||codeSource.trim()||DEFAULT_CODE_SOURCE,
    sources:sources||directoryRef.current.find(p=>p.panelName===panelName&&p.hosts.includes(server))?.sources,
    realCode:code||null,directoryKey:panelName.trim().normalize('NFC').toLocaleLowerCase('tr'),
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

  const confirmBackgroundScanProtection = async (): Promise<void> => {
    if (Platform.OS !== "android" || !PanelScan.available) return;
    const status = PanelScan.getBatteryOptimizationStatus();
    if (!status.supported || status.ignoring) return;
    const choice = await new Promise<"continue" | "request" | "settings" | "cancel">((resolve) => {
      Alert.alert(
        "Arka Planda Tarama",
        "Uzun panel/hesap taramalarının ekran kapalıyken veya başka uygulamadayken daha güvenilir sürmesi için KIZILKAN PLAYER'ı Android pil optimizasyonunda kısıtlanmamış duruma almanız önerilir. Android yine de uygulamayı zorla kapatabilir; tarama sonuçları ayrıca kalıcı snapshot ile korunur.",
        [
          { text: "Vazgeç", style: "cancel", onPress: () => resolve("cancel") },
          { text: "Şimdi Değil", onPress: () => resolve("continue") },
          { text: "Muafiyet İste", onPress: () => resolve("request") },
          { text: "Uygulama Ayarları", onPress: () => resolve("settings") },
        ],
        { cancelable: true, onDismiss: () => resolve("cancel") },
      );
    });
    if (choice === "cancel") throw new Error("Tarama kullanıcı tarafından iptal edildi.");
    if (choice === "request") {
      const opened = await PanelScan.requestBatteryOptimizationExemption();
      if (!opened) await PanelScan.openBatteryOptimizationSettings();
    } else if (choice === "settings") await PanelScan.openBatteryOptimizationSettings();
  };

  const startAcceptedScan = async (starter: () => Promise<NativeScanStartResult | null>): Promise<string> => {
    await confirmBackgroundScanProtection();
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
    candidates: Array<{panelName:string;code:string;server:string;sources?:ServerCodeBinding["sources"]}>,
    title: string,
    subtitle: string,
    cfg: { concurrency:number; timeoutMs:number; accountConcurrency?:number; label:string },
  ): Promise<PanelCredentialMatch[]> => {
    const finishScanTask = markTask("scan:panel-single", { mode: "single" });
    try {
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
    } finally {
      finishScanTask();
    }
  };

  const submitKnownPanelDiscovery = async () => {
    if ((!codeVal.trim()&&!selectedPanelItem) || !xtUser.trim() || !xtPass.trim()) {
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
      const available=await getScanDirectory(src,{signal:prep.signal,timeoutMs:cfg.timeoutMs});
      const panel=selectedMatchesCode?filterDirectory([selectedPanelItem!],sourceScope,panelTarget)[0]:available.find(p=>(p.codes||[p.code]).includes(codeVal.trim()));
      if(!panel)throw new Error("Seçilen kaynak/hedef kapsamında panel bulunamadı.");
      resolvedPanel = panel;
      if (prep.signal.aborted) { const e = new Error("Tarama hazırlığı kullanıcı tarafından durduruldu."); e.name = "AbortError"; throw e; }
      nativePreparationAbortRef.current = null;
      const panelName = panel.panelName;
      const hosts = panel.hosts;
      /**
       * v17.4.1 — PARCEL ŞİŞKİNLİĞİ GİDERİLDİ (P0)
       * ------------------------------------------------------------------
       * `sources` panelin TÜM kaynak bağlarını içerir ve burada HER DNS için
       * ayrı ayrı kopyalanıyordu: 10 DNS'li panelde aynı veri 10 kez. 794
       * panel × ortalama 6 DNS ile yük 5,5 MB'a çıkıyor ve Android'in Binder
       * sınırı (~1 MB) aşıldığı için tarama HİÇ başlamıyordu.
       *
       * Gönderilmesine gerek yok: sonuç işlenirken (bkz. codeSource/sources
       * çözümü) değer zaten directoryRef üzerinden panelName+server ile geri
       * bulunuyor. Bu yüzden köprüden yalnız kimlik alanları geçer.
       */
      const candidates = hosts.map(server => ({panelName,code:panel.code,server}));
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
      // v17.4.0: kapsam filtresi her yolda uygulanır (bkz. resolveScanDirectory)
      const directory = await resolveScanDirectory(src, { signal: prep.signal, timeoutMs: cfg.timeoutMs });
      if (prep.signal.aborted) { const e = new Error("Tarama hazırlığı kullanıcı tarafından durduruldu."); e.name = "AbortError"; throw e; }
      nativePreparationAbortRef.current = null;
      const seen = new Set<string>();
    const candidates: Array<{panelName:string;code:string;server:string;sources?:ServerCodeBinding["sources"]}> = [];
    for (const item of directory) for (const server of item.hosts) {
      const key = `${item.code}\u0000${item.panelName}\u0000${String(server).replace(/\/+$/,"").toLowerCase()}`;
      // v17.4.1: sources köprüden geçmez (bkz. yukarı); sonuçta directoryRef'ten çözülür.
      if (!seen.has(key)) { seen.add(key); candidates.push({panelName:item.panelName,code:item.code,server}); }
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
        cfg.concurrency,cfg.timeoutMs,await resolveScanDirectory(src),   // v17.4.0: filtreli
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
    const publish=()=>{
      const status=(v:string)=>v==='✅'?'done' as const:v==='❌'?'error' as const:'waiting' as const;
      setCatalogProgress({phase:'content',message:'İçerikler yükleniyor…',live:status(state.live),vod:status(state.vod),series:status(state.series),liveCount:state.liveCount,vodCount:state.vodCount,seriesCount:state.seriesCount});
      setProgress(
      `İçerikler paralel yükleniyor...\n` +
      `Canlı ${state.live}${state.liveCount ? ` ${state.liveCount}` : ""} · ` +
      `Film ${state.vod}${state.vodCount ? ` ${state.vodCount}` : ""} · ` +
      `Dizi ${state.series}${state.seriesCount ? ` ${state.seriesCount}` : ""}`
    );
    };
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
    setCatalogProgress({phase:"login",message:"Hesap doğrulanıyor…"});
    try {
      const id = stableXtreamPlaylistId(cred.server, cred.username);

      // v15.2.4 Android: Tek Xtream ekleme de çoklu ekleme ile aynı native
      // foreground importer'ı kullanır. Böylece 50-100 bin içerik JS'e taşınmaz,
      // app arka plana geçse de indirme/normalize/Room transaction devam eder.
      if (KizilkanNativeCore.available && Platform.OS === "android" && !chooseCategories) {
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
          if(row){
            setCatalogProgress({phase:row.state==='completed'?'done':row.state==='failed'?'error':'content',message:row.message||'Katalog yükleniyor…',liveCount:row.channels,vodCount:row.vod,seriesCount:row.series});
            setProgress(`${row.message || "Native playlist ekleniyor"}${row.channels ? `\n${row.channels} kanal · ${row.vod || 0} film · ${row.series || 0} dizi` : ""}`);
            if (row.state === "completed") { completedRow = row; break; }
            if (row.state === "failed") throw new Error(String(row.message || "Native Xtream ekleme başarısız"));
          }
          if (!snap.running && !row) throw new Error("Native Xtream işi beklenmedik biçimde sona erdi.");
          await new Promise(resolve => setTimeout(resolve, 350));
        }
        if (!(await commitPreparedPlaylist({
          id, name: candidate.name, source: "xtream",
          xtreamServer: cred.server, xtreamUsername: cred.username, xtreamPassword: cred.password,
          serverCodeBinding, accountInfo: (completedRow?.userInfo || null) as AccountInfo, serverInfo: completedRow?.serverInfo || null,
          channels: [], vod: [], series: [], channelsCount: Number(completedRow?.channels || 0), vodCount: Number(completedRow?.vod || 0), seriesCount: Number(completedRow?.series || 0),
          createdAt: new Date().toISOString(),
        }))) return false;
        await storage.secureRemove(PENDING_BULK_IMPORT_KEY);
        playlistServerKeysRef.current.add(accountKey);
        setProgress("Playlist Room/SQLite üzerinde hazır.");
        if (navigateAfter) router.replace("/(tabs)");
        return true;
      }

      const login = await xtLoginLocal(cred);
      const { chRes, vodRes, serRes } = await loadXtreamContentWithProgress(cred);
      const isUnsupported404=(r:any)=>r?.status === "rejected" && /HTTP\s+404\b/i.test(String(r.reason?.message || r.reason || ""));
      if (chRes.status === "rejected") throw new Error(`Xtream canlı katalog alınamadı; playlist kaydedilmedi. ${String(chRes.reason?.message || chRes.reason)}`);
      if ((vodRes.status === "rejected" && !isUnsupported404(vodRes)) || (serRes.status === "rejected" && !isUnsupported404(serRes))) {
        const failed=[vodRes.status==="rejected"?`Film: ${String(vodRes.reason?.message||vodRes.reason)}`:"",serRes.status==="rejected"?`Dizi: ${String(serRes.reason?.message||serRes.reason)}`:""].filter(Boolean).join(" · ");
        throw new Error(`Xtream katalog doğrulaması başarısız; playlist kaydedilmedi. ${failed}`);
      }
      let channels = chRes.value;
      let vod = vodRes.status === "fulfilled" ? vodRes.value : [];
      let series = serRes.status === "fulfilled" ? serRes.value : [];
      let contentSelection: PlaylistContentSelection | null = null;
      if (chooseCategories) {
        setProgress("Kategoriler hazır · seçim bekleniyor…");
        contentSelection = await requestCategorySelection({channels,vod,series});
        if (!contentSelection) throw new Error("Kategori seçimi iptal edildi; playlist kaydedilmedi.");
        ({channels,vod,series}=applyContentSelection({channels,vod,series},contentSelection));
      }
      const playlist: Playlist = {
        id, name: displayName?.trim() || name.trim() || "Xtream Codes", source: "xtream",
        xtreamServer: cred.server, xtreamUsername: cred.username, xtreamPassword: cred.password,
        serverCodeBinding,
        catalogCapabilities: { live: "supported", vod: isUnsupported404(vodRes) ? "unsupported_404" : "supported", series: isUnsupported404(serRes) ? "unsupported_404" : "supported", updatedAt: new Date().toISOString() },
        accountInfo: login.user_info as AccountInfo,
        serverInfo: login.server_info || null,
        contentSelection,
        channels, vod, series,
        createdAt: new Date().toISOString(),
      };
      const total = channels.length + vod.length + series.length;
      if (total === 0) throw new Error("Hiç içerik bulunamadı. Kaynağı kontrol edin.");
      setProgress(`Cihaza kaydediliyor...\n${channels.length} kanal · ${vod.length} film · ${series.length} dizi`);
      if (!(await commitPlaylist(playlist))) return false;
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

  /**
   * v17.5.0 — KIZILKAN ARŞİVİNDEN GERİ YÜKLEME (P0)
   * ==========================================================================
   * SORUN: Kullanıcı bulunan hesapları TXT'ye kaydedebiliyor ama geri
   * yükleyemiyordu. Sebep: arşiv insan-okunur rapor biçiminde ("Kullanıcı Adı :
   * xxx"), mevcut dosya okuyucu ise satır bazlı biçim bekliyor. Yani kendi
   * arşivimizi kendimiz okuyamıyorduk.
   *
   * AKIŞ: dosya seç -> arşiv biçimi mi diye sına -> ayrıştır -> hesapları
   * doğrulama listesine koy. Buradan sonrası MEVCUT akıştır: kullanıcı
   * istediklerini seçer, "Doğrula ve Ekle" ile eklenir. Yeniden doğrulama
   * bilinçli bir tercih: arşivdeki bilgi eski olabilir, süresi geçmiş hesaplar
   * böylece ayırt edilir.
   */
  const [archiveRestoring, setArchiveRestoring] = useState(false);

  const restoreFromArchive = async () => {
    if (archiveRestoring || bulkFilePicking) return;
    setArchiveRestoring(true);
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/*", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri);
      const { parseKizilkanAccountArchive, looksLikeKizilkanArchive } = await import("@/src/utils/accountArchive");

      if (!looksLikeKizilkanArchive(text)) {
        Alert.alert(
          "Arşiv tanınmadı",
          "Bu dosya KIZILKAN hesap arşivi biçiminde değil.\n\n" +
          "Kullanıcı adı/şifre listesi içeren normal bir dosya yüklemek istiyorsanız " +
          "\"CSV / TXT / JSON dosyası seç\" düğmesini kullanın.",
        );
        return;
      }

      const parsed = parseKizilkanAccountArchive(text);
      void recordDiagnostic("scan", "ARCHIVE_RESTORE_PARSED", {
        fileName: asset.name || "", records: parsed.accounts.length,
        declared: parsed.declaredCount, safeMode: parsed.safeMode,
        warnings: parsed.warnings.length, masked: parsed.accounts.filter(a => a.masked).length,
      });

      const usable = parsed.accounts.filter(a => !a.masked);
      if (usable.length === 0) {
        Alert.alert(
          "Bu arşivden geri yükleme yapılamaz",
          (parsed.warnings[0] || "Arşivde kullanılabilir hesap bulunamadı.") +
          "\n\nTam arşiv (maskesiz) kaydettiyseniz onu seçin.",
        );
        return;
      }

      // Arşivdeki kayıtları mevcut aday listesine dönüştür: buradan sonrası
      // kullanıcının seçtiği hesapları doğrulayıp ekleyen MEVCUT akış.
      const restored: BulkResolvedCandidate[] = usable.map((a, i) => ({
        key: `archive-${i}-${a.username}-${canonicalPanelHost(a.server) || a.server}`,
        name: a.name,
        username: a.username,
        password: a.password,
        server: canonicalPanelHost(a.server) || a.server,
        panelName: a.panelName || a.name,
        code: a.serverCode || "",
        validatedHosts: a.validatedHosts.map(h => canonicalPanelHost(h) || h).filter(Boolean),
        // v17.5.0: exp_date HAM epoch olarak aktarılır; kart "kalan gün"ü
        // bu alandan hesaplıyor. Daha önce yalnız biçimli metin vardı ve kart
        // "Bitiş: bilinmiyor" yazıyordu.
        login: { user_info: {
          status: a.status,
          max_connections: a.maxConnections,
          exp_date: a.expiryEpoch ?? undefined,
        } },
      } as BulkResolvedCandidate));

      setBulkCandidates(restored);
      setSelectedBulkCandidateKeys([]);           // kullanıcı bilinçli seçsin
      setShowBulkCandidates(true);
      setBulkScanFinished(true);

      const expiredNote = parsed.accounts.some(a => /geçmiş|expired/i.test(a.status))
        ? "\n\nBazı hesapların durumu arşivde \"süresi geçmiş\" görünüyor; doğrulama sırasında kesinleşecek." : "";
      Alert.alert(
        "Arşiv yüklendi",
        `${usable.length} hesap okundu${parsed.accounts.length !== usable.length ? ` (${parsed.accounts.length - usable.length} maskeli kayıt atlandı)` : ""}.\n\n` +
        `Arşiv tarihi: ${parsed.createdAt || "bilinmiyor"}\n\n` +
        `Eklemek istediklerinizi seçin. Seçtikleriniz eklenirken yeniden doğrulanır; ` +
        `böylece süresi dolmuş hesaplar ayırt edilir.${expiredNote}`,
      );
    } catch (e: any) {
      const msg = String(e?.message || e);
      void recordDiagnostic("scan", "ARCHIVE_RESTORE_FAILED", { errorMessage: msg.slice(0, 400) });
      setError(`Arşiv yüklenemedi: ${msg}`);
    } finally {
      setArchiveRestoring(false);
    }
  };

  const pickBulkFile = async () => {
    if (bulkFilePickerInFlightRef.current) {
      void recordDiagnostic("import", "BULK_FILE_PICKER_SUPPRESSED", { reason: "single-flight" }, { stage: "bulk-file-preview", outcome: "suppressed" });
      return;
    }
    bulkFilePickerInFlightRef.current = true;
    setBulkFilePicking(true);
    setBulkFilePhase("selecting");
    const startedAt = Date.now();
    let pickedAt = startedAt;
    let readAt = startedAt;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/*", "application/json", "text/csv", "application/csv", "*/*"],
        // v17.1.1 Android: büyük dosyayı önce cache'e kopyalama; ContentResolver
        // URI'si native streaming parser tarafından doğrudan okunur.
        copyToCacheDirectory: Platform.OS !== "android",
      });
      if (res.canceled || !res.assets?.[0]) { setBulkFilePhase("cancelled"); return; }
      const asset = res.assets[0];
      pickedAt = Date.now();
      setBulkFilePhase("reading");
      const parseStartedAt = Date.now();
      let parsed: { accounts: BulkAccountInput[]; warnings: string[] };
      let textChars = 0;
      let lineCount = 0;
      let nativeStream = false;
      let streamingPreviewCount = 0;
      if (Platform.OS === "android" && PanelScan.available && !/\.json$/i.test(asset.name || "")) {
        const inspected = await PanelScan.inspectBulkAccountsFile(asset.uri, 12);
        readAt = Date.now();
        if (inspected?.supported && Array.isArray(inspected.samples)) {
          nativeStream = true;
          setBulkFilePhase("parsing");
          const samples = inspected.samples as BulkAccountInput[];
          const warnings = Array.isArray(inspected.warnings) ? inspected.warnings.map(String) : [];
          if (!samples.length) throw new Error(warnings[0] || "Dosyada geçerli hesap örneği bulunamadı.");
          streamingPreviewCount = samples.length;
          setBulkFileStreamSource({ uri: asset.uri, name: asset.name || "hesaplar", size: Number((asset as any)?.size || 0), samples, warnings });
          parsed = { accounts: [], warnings };
          lineCount = Number(inspected.lineCountPreviewed || 0);
        } else {
          // Yapılandırılmış JSON/arşiv formatları eski tam parser yolunda kalır.
          const response = await fetch(asset.uri);
          const text = await response.text();
          textChars = text.length; lineCount = countTextLines(text);
          setBulkFilePhase("parsing");
          parsed = parseBulkAccounts(text);
          setBulkFileStreamSource(null);
        }
      } else {
        setBulkFileStreamSource(null);
        const response = await fetch(asset.uri);
        const text = await response.text();
        readAt = Date.now(); textChars = text.length; lineCount = countTextLines(text);
        setBulkFilePhase("parsing");
        parsed = parseBulkAccounts(text);
      }
      const parseFinishedAt = Date.now();
      if (!parsed.accounts.length && !nativeStream) throw new Error(parsed.warnings[0] || "Dosyada geçerli hesap bulunamadı.");
      setBulkFileName(asset.name || "hesaplar");
      setBulkFileLoaded(true);
      setBulkFileParsed(parsed);
      setBulkFilePhase("ready");
      setBulkPreviewOpen(true);
      setError(parsed.warnings.length ? parsed.warnings.join("\n") : null);
      void recordDiagnostic("import", "BULK_FILE_PREVIEW_READY", {
        fileName: asset.name || "hesaplar",
        fileBytes: Number((asset as any)?.size || 0),
        textChars,
        lineCount,
        nativeStream,
        accountCount: nativeStream ? undefined : parsed.accounts.length,
        streamingPreviewCount: nativeStream ? streamingPreviewCount : undefined,
        warningCount: parsed.warnings.length,
        pickMs: pickedAt - startedAt,
        readMs: readAt - pickedAt,
        parseMs: parseFinishedAt - parseStartedAt,
        totalMs: parseFinishedAt - startedAt,
        singleParse: true,
      }, { stage: "bulk-file-preview", outcome: "success", durationMs: parseFinishedAt - startedAt });
    } catch (e: any) {
      void recordDiagnostic("import", "BULK_FILE_PREVIEW_FAILED", {
        message: String(e?.message || e).slice(0, 320),
        pickMs: pickedAt - startedAt,
        readMs: Math.max(0, readAt - pickedAt),
        totalMs: Date.now() - startedAt,
      }, { stage: "bulk-file-preview", outcome: "failed", durationMs: Date.now() - startedAt, errorClass: e?.name || "BulkFileImportError" });
      setBulkFilePhase("failed");
      setError("Toplu hesap dosyası okunamadı: " + String(e?.message || e));
    } finally {
      bulkFilePickerInFlightRef.current = false;
      setBulkFilePicking(false);
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
    if (!incoming.length) {
      if (reveal) setShowBulkCandidates(true);
      return;
    }
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
        const scanTerminal = ["COMPLETED", "CANCELLED", "FAILED"].includes(String(scan.state || ""));

        // v17.0.7: Process gerçekten öldüyse journal'daki şifreli session + konservatif
        // checkpoint kullanılarak tarama yeniden başlatılır. Sonuçlar DB'den korunur.
        if (scan.recoverable && String(scan.terminalReason || "") === "PROCESS_RESTARTED_RECOVERABLE" && !interruptedRecoveryAttemptedRef.current) {
          interruptedRecoveryAttemptedRef.current = true;
          // v17.1.1: Journal başka bir kaynak dosyasına aitse kör resume yok.
          // Şifreli pending hesapların fingerprint'i journal ile birebir eşleşmelidir.
          const pendingStreamRaw = await storage.secureGet<string>(PENDING_BULK_STREAM_KEY, "");
          const pendingStream = pendingStreamRaw ? JSON.parse(pendingStreamRaw) : null;
          const pendingRaw = await storage.secureGet<string>(PENDING_BULK_SCAN_KEY, "");
          const pendingAccounts: BulkAccountInput[] = pendingRaw ? JSON.parse(pendingRaw) : [];
          const expectedFingerprint = pendingStream?.fingerprint || (Array.isArray(pendingAccounts) && pendingAccounts.length ? stableScanSourceFingerprint(pendingAccounts, codeSource.trim() || DEFAULT_CODE_SOURCE) : "");
          if (scan.sourceFingerprint && expectedFingerprint && String(scan.sourceFingerprint) !== expectedFingerprint) {
            setError("Yarım kalan tarama farklı bir kaynak dosyasına ait; güvenlik için otomatik devam ettirilmedi.");
            void recordDiagnostic("scan", "V171_RECOVERY_FINGERPRINT_REJECTED", { journal: String(scan.sourceFingerprint).slice(0,32), expected: expectedFingerprint.slice(0,32) }, { stage: "scan-recovery", outcome: "rejected" });
          } else {
            const resumed = await PanelScan.recoverInterruptedScan();
            if (resumed) { setError(null); setProgress("Yarım kalan tarama güvenli checkpoint'ten devam ediyor…"); return; }
          }
        }

        // v17.0.6: "Sunucuyu bilmiyorum" / tek hesap panel keşfi de bulk ile
        // aynı Activity/process recovery sözleşmesine dahildir. Eski Promise
        // kaybolsa bile native snapshot'taki gerçek sonuçlar yeniden ekrana kurulur.
        if (scan.mode === "single" && (scan.running || scanTerminal || (scan.matches?.length || 0) > 0)) {
          const matches = Array.isArray(scan.matches) ? scan.matches as PanelCredentialMatch[] : [];
          if (!cancelled) {
            setDiscoveryTitle("Panel taraması");
            setDiscoverySubtitle(scan.running ? "Arka plandaki tarama geri yüklendi." : "Tarama sonucu geri yüklendi.");
            setShowDiscoveryMatches(true);
            mergeStreamingMatches(matches, "Panel taraması", scan.running ? "Arka plandaki tarama geri yüklendi." : "Tarama sonucu geri yüklendi.");
            setNativeScanRunning(!!scan.running);
            setNativeScanPaused(!!scan.paused);
            setNativeScanStopping(String(scan.state || "") === "CANCELLING");
            if (scan.running && scan.runId) nativeScanRunIdRef.current = String(scan.runId);
            else if (!scan.running && nativeScanRunIdRef.current === scan.runId) nativeScanRunIdRef.current = "";
            if (!bulkAdding) setLoading(!!scan.running);
            if (scan.error) setError(String(scan.error));
            const tested = Number(scan.tested || 0), total = Number(scan.total || 0), found = Number(scan.found || matches.length);
            setProgress(scan.running
              ? `Native panel taraması geri yüklendi · ${tested}/${total} · ${found} bulundu`
              : `Panel tarama sonucu geri yüklendi · ${found} bulundu`);
          }
        }

        if ((scan.mode === "bulk" || scan.mode === "unified" || scan.mode === "streaming-file-v172") && (scan.running || scanTerminal || (scan.matches?.length || 0) > 0)) {
          const saved = await storage.secureGet<string>(PENDING_BULK_SCAN_KEY, "");
          const accounts: BulkAccountInput[] = saved ? JSON.parse(saved) : [];
          if (!cancelled && (accounts.length || scan.mode === "streaming-file-v172")) {
            const resolved: BulkResolvedCandidate[] = [];
            for (const m of (scan.matches || [])) {
              const ai=Number(m.accountIndex); const a=accounts[ai] || accounts.find(x=>x.row===Number(m.sourceRow)) || (scan.mode === "streaming-file-v172" ? {row:Number(m.sourceRow),name:String(m.name||""),username:String(m.username||""),password:String(m.password||""),server:""} : null); if(!a) continue;
              const server=String(m.server||""); if(!server) continue;
              const panelName=String(m.panelName||"") || hostName(server), code=String(m.code||"");
              resolved.push({ key:bulkCandidateKey(a.row,a.username,code,panelName,server), sourceRow:a.row, name:a.name||panelName, username:a.username, password:a.password, panelName, code, server,login:m.login,sources:m.sources, validatedHosts:[server], direct:!!a.server || panelName === "Doğrudan DNS" });
            }
            // v17.0.3: terminal sonuç kullanıcı onayı olmadan kaybolmaz.
            // COMPLETED/CANCELLED/FAILED snapshot Activity/process restore sonrası tekrar görünür.
            const terminalState = ["COMPLETED", "CANCELLED", "FAILED"].includes(String(scan.state || ""));
            const shouldReveal = !bulkResultsDismissedRef.current && (!!scan.running || terminalState || bulkNativeScanRef.current || resolved.length > 0);
            mergeBulkCandidates(resolved, shouldReveal);
            if (Array.isArray(scan.accountStatuses)) setBulkAccountProgress(scan.accountStatuses);
            setBulkScanPaused(!!scan.paused); setBulkScanFinished(!scan.running); bulkNativeScanRef.current=!!scan.running;
            if(scan.mode === "streaming-file-v172")setBulkStreamProgress({read:Number(scan.accountTotal||0),completed:Number(scan.accountTested||0),tested:Number(scan.tested||0),found:Number(scan.found||0),producerDone:!!scan.producerDone});
            if (scan.running && scan.runId) bulkScanRunIdRef.current = String(scan.runId);
            else if (!scan.running && bulkScanRunIdRef.current === scan.runId) bulkScanRunIdRef.current = "";
            if (!bulkAdding) setLoading(!!scan.running);
            if (scan.error) setError(String(scan.error));
            setProgress(scan.running ? `Native tarama geri yüklendi · ${Number(scan.tested||0)}/${Number(scan.total||0)} · ${Number(scan.found||0)} bulundu` : `Tarama sonucu geri yüklendi · ${Number(scan.found||0)} bulundu`);
          }
        }

        const imp = KizilkanNativeCore.available ? KizilkanNativeCore.getBulkImportSnapshot() : {};
        /**
         * v17.8.0 — BAYAT "ÇALIŞIYOR" BAYRAĞI TESPİTİ (kullanıcı sıkışıyordu)
         * ---------------------------------------------------------------------
         * CİHAZ DURUMU (21.09): toplu ekleme eski sürümde başlatıldı, sonra
         * uygulama güncellendi. Güncelleme süreci öldürdü; native servis
         * `running:false` YAZAMADAN öldü. Snapshot SharedPreferences'ta
         * saklandığı için bayrak `true` olarak KALDI ve uygulamayı kapatıp
         * açmak da onu silmedi. Her "Liste ekle" açılışında katman "3/27"
         * durumuyla otomatik açılıyor ve kapatılamıyordu (onRequestClose boş).
         *
         * ÇÖZÜM: servis çalışırken snapshot'ı sürekli günceller (updatedAt).
         * 90 saniyedir güncellenmeyen bir "running" durumu BAYAT kabul edilir:
         * katman açılmaz, kullanıcıya ne olduğu söylenir ve kalıntı temizlenir.
         */
        const STALE_MS = 90_000;
        const updatedAt = Number(imp.updatedAt || 0);
        // RC3: sahiplik kontrolü bayat tespitine de uygulanır — ekran aktif bir
        // ekleme yürütürken öneri hiçbir koşulda tetiklenmemeli.
        const isStale = !bulkImportOwnedByScreenRef.current && !!imp.running && updatedAt > 0 && (Date.now() - updatedAt) > STALE_MS;
        // v17.8.0: Kullanıcı "Duraklat" dediyse servis running:false yazar;
        // bayat kontrolü bunu yakalamaz. Bekleyen liste duruyorsa ve servis
        // çalışmıyorsa da devam önerilir. (Normal bitişte liste silinir.)
        let hasPending = false;
        if (!imp.running && !bulkImportOwnedByScreenRef.current) {
          try { hasPending = !!(await storage.secureGet<string>(PENDING_BULK_IMPORT_KEY, "")); } catch {}
        }
        // RC3: Öneri ekran başına EN FAZLA BİR KEZ gösterilir. Etki `playlists`
        // her değiştiğinde yeniden çalıştığı için aksi halde öneri tekrar tekrar
        // açılırdı. Kullanıcı bu oturumda duraklattıysa da hemen önerilmez.
        if ((isStale || hasPending) && !resumeOfferShownRef.current && !bulkPauseRequestedRef.current) {
          resumeOfferShownRef.current = true;
          void recordDiagnostic("scan", "BULK_IMPORT_STALE_DETECTED", {
            ageMs: Date.now() - updatedAt,
            completed: Number(imp.completed || 0), total: Number(imp.total || 0),
            jobs: Array.isArray(imp.jobs) ? imp.jobs.length : 0,
          });
          // v17.8.0 RC3: İptal YALNIZ servis hâlâ "çalışıyor" görünüyorsa (bayat)
          // gönderilir. Duraklatılmış işte servis zaten durmuştur; gereksiz bir
          // iptal isteği, kullanıcı hemen yeni ekleme başlatırsa onu vurabilirdi.
          if (isStale) { try { await KizilkanNativeCore.cancelBulkImport(); } catch {} }
          setLoading(false); setBulkAdding(false); setBulkImportStatuses({});
          /**
           * v17.8.0 — YARIDA KALAN EKLEMEYE DEVAM
           * -------------------------------------------------------------------
           * Önceki taslakta bekleyen liste siliniyordu; kullanıcı kalanları
           * eklemek için arşivi yeniden yükleyip ELLE seçmek zorundaydı ve
           * hangilerinin zaten eklendiğini göremiyordu.
           *
           * Artık bekleyen liste KORUNUR. Tamamlananlar (snapshot'ta
           * state=completed) ve zaten ekli olanlar (aynı sunucu + kullanıcı)
           * çıkarılır; KALANLAR seçim ekranına önceden seçili olarak gelir.
           * Kullanıcı isterse seçimi değiştirir, "Doğrula ve Ekle" ile devam eder.
           */
          let pending: BulkResolvedCandidate[] = [];
          try {
            const raw = await storage.secureGet<string>(PENDING_BULK_IMPORT_KEY, "");
            pending = raw ? JSON.parse(raw) : [];
          } catch { pending = []; }
          const doneKeys = new Set(
            (Array.isArray(imp.jobs) ? imp.jobs : [])
              .filter((r: any) => r?.state === "completed")
              .map((r: any) => String(r.jobKey || "")),
          );
          const alreadyAdded = (c: BulkResolvedCandidate) => playlists.some(pl =>
            pl.source === "xtream" &&
            String(pl.xtreamUsername || "") === String(c.username || "") &&
            canonicalPanelHost(String(pl.xtreamServer || "")) === canonicalPanelHost(String(c.server || "")),
          );
          const remaining = pending.filter(c => !doneKeys.has(String(c.key)) && !alreadyAdded(c));
          const doneCount = pending.length - remaining.length;
          void recordDiagnostic("scan", "BULK_IMPORT_RESUME_OFFERED", {
            pending: pending.length, remaining: remaining.length, done: doneCount,
          });

          if (remaining.length === 0) {
            // Bekleyen iş kalmamış: sessizce temizle, kullanıcıyı gereksiz uyarma.
            try { await storage.secureRemove(PENDING_BULK_IMPORT_KEY); } catch {}
            return;
          }
          Alert.alert(
            "Yarıda kalan ekleme bulundu",
            `${pending.length} listeden ${doneCount} tanesi eklendi, ${remaining.length} tanesi bekliyor.\n\n` +
            `Kalanlar seçim ekranında önceden seçili gelecek; isterseniz değiştirip devam edebilirsiniz.`,
            [
              // RC3: "Sonra" bekleyen listeyi KORUR; ekran bir dahaki açılışta yine önerir.
              { text: "Sonra", style: "cancel", onPress: () => {
                  void recordDiagnostic("scan", "BULK_IMPORT_RESUME_DEFERRED", { remaining: remaining.length });
              } },
              { text: "İptal et", style: "destructive", onPress: async () => {
                  void recordDiagnostic("scan", "BULK_IMPORT_RESUME_DECLINED", { remaining: remaining.length });
                  try { await storage.secureRemove(PENDING_BULK_IMPORT_KEY); } catch {}
              } },
              { text: `Kalan ${remaining.length} listeyi göster`, onPress: () => {
                  void recordDiagnostic("scan", "BULK_IMPORT_RESUME_ACCEPTED", { remaining: remaining.length });
                  setMethod("bulk");
                  setBulkCandidates(remaining);
                  setSelectedBulkCandidateKeys(remaining.map(c => c.key));
                  setBulkScanFinished(true);
                  setShowBulkCandidates(true);
              } },
            ],
          );
          return;
        }
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
            if (!(await commitPreparedPlaylist({
              id:String(row.playlistId), name:String(row.displayName||c.name), source:"xtream",
              xtreamServer:c.server, xtreamUsername:c.username, xtreamPassword:c.password,
              serverCodeBinding:c.direct ? undefined : makeBinding(c.code,c.panelName,c.server,c.validatedHosts,c.sources),
              accountInfo:(row.userInfo||c.login?.user_info||null) as AccountInfo, serverInfo:row.serverInfo||c.login?.server_info||null,
              channels:[], vod:[], series:[], channelsCount:Number(row.channels||0), vodCount:Number(row.vod||0), seriesCount:Number(row.series||0), createdAt:new Date().toISOString(),
            }))) return false;
            restoredImportAdoptedRef.current.add(String(row.playlistId));
          }
        }
      } catch (e) { console.warn("[v15.2.3 restore] native job snapshot", e); }
    };

    void syncSnapshots();
    timer = setInterval(() => { void syncSnapshots(); }, 850);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [mergeStreamingMatches, mergeBulkCandidates, addPreparedPlaylist, playlists, bulkAdding]);

  const resolveOneBulkAccount = async (
    account: BulkAccountInput,
    index: number,
    total: number,
    directoryCache: { value?: PanelDirectoryItem[]; promise?: Promise<PanelDirectoryItem[]> },
    control: ScanExecutionControl,
  ): Promise<{ candidates: BulkResolvedCandidate[]; label: string; reason?: string }> => {
    const label = account.name.trim() || `Hesap ${index + 1}`;
    const cfg = scanConfigForSpeed();
    const src = codeSource.trim() || DEFAULT_CODE_SOURCE;
    const progressPrefix = `${index + 1}/${total} · ${label}`;

    try {
      setError(null);
      if(account.server){
        const server=canonicalPanelHost(account.server);
        if(!server)throw new Error("Geçersiz DNS adresi.");
        setProgress(`${progressPrefix}\nDoğrudan Xtream sunucusu doğrulanıyor…`);
        const key=JSON.stringify([server,account.username,account.password]);
        let pending=control.probeCache?.get(key);
        if(!pending){pending=xtLoginLocal({server,username:account.username,password:account.password}).catch(()=>null);control.probeCache?.set(key,pending);}
        const login=await pending;
        if(!login)throw new Error("Sunucu hesabı doğrulanamadı.");
        const panelName = account.name.trim() || hostName(server);
        const c: BulkResolvedCandidate = {
          key: bulkCandidateKey(account.row, account.username, "", panelName, server),
          sourceRow: account.row, name: account.name.trim() || panelName,
          username: account.username, password: account.password, panelName, code: "",
          server, login, validatedHosts: [server], direct: true,
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
          cfg.concurrency,cfg.timeoutMs,control,
          await(async()=>{const d=await getScanDirectory(src,{signal:control.signal});const p=d.find(x=>(x.codes||[x.code]).includes(account.serverCode!));if(!p)throw new Error('Kod seçilen kapsamda bulunamadı.');return p;})(),
        );
      } else if (account.panelName) {
        if (!directoryCache.value) {
          directoryCache.promise ??= getScanDirectory(src, { signal: control.signal, timeoutMs: cfg.timeoutMs });
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
          cfg.concurrency,cfg.timeoutMs,control,panel,
        );
      } else {
        if (!directoryCache.value) {
          directoryCache.promise ??= getScanDirectory(src, { signal: control.signal, timeoutMs: cfg.timeoutMs });
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
          server:m.server,login:m.login,sources:m.sources, validatedHosts: hostsByPanel.get(pk) || [m.server], direct: false,
        };
      });
      mergeBulkCandidates(candidates);
      return { candidates, label };
    } catch (e: any) {
      return { candidates: [], label, reason: String(e?.message || e) };
    }
  };

  const runNativeBulkAccounts = async (accounts: BulkAccountInput[], cfg: { concurrency:number; timeoutMs:number; accountConcurrency:number; label:string; requestedConcurrency?:number; batchSize?:number }, signal?: AbortSignal): Promise<{ found:number; completed:number; cancelled:boolean }> => {
    const finishScanTask = markTask("scan:panel-unified", { mode: "unified", accounts: accounts.length });
    try {
    if (!PanelScan.available || Platform.OS !== "android") throw new Error("__NATIVE_SCAN_UNAVAILABLE__");
    const src = codeSource.trim() || DEFAULT_CODE_SOURCE;
    setProgress(`${cfg.label} · Birleşik native panel rehberi hazırlanıyor…`);
    if (signal?.aborted || bulkScanCancelledRef.current) return { found: 0, completed: 0, cancelled: true };
    // v17.4.0: kapsam filtresi her yolda uygulanır
    const directory = await resolveScanDirectory(src, { signal, timeoutMs: cfg.timeoutMs });
    if (signal?.aborted || bulkScanCancelledRef.current) return { found: 0, completed: 0, cancelled: true };
    const normalizeName = (v:string) => v.trim().toLocaleLowerCase("tr");
    // v17.1.0: Aynı dev panel listesini 50K hesabın her birinde yeniden materialize etme.
    // Hesaplar yalnız candidateSet indeksini taşır; büyük auto-directory dizisi tek kopyadır.
    const candidateSets: Array<Array<{panelName:string;code:string;server:string;sources?:ServerCodeBinding["sources"]}>> = [];
    const candidateSetByKey = new Map<string, number>();
    const compactJobs: Array<{ row:number; name:string; username:string; password:string; candidateSet:number }> = [];
    const missingAccounts: string[] = [];
    /**
     * v17.9.2 — Kullanıcının girdiği doğrudan DNS'ler (virgül/; /satır ile
     * çoklu). Sunucusu belli olmayan combo hesapları için aday sunucu olurlar.
     * canonicalPanelHost geçersizleri eler (kimlik/yol/sorgu içerenler düşer).
     */
    const directTargetHosts = validPanelHosts(panelTarget.hosts || []);
    void recordDiagnostic("scan", "BULK_SCAN_PLAN", {
      accounts: accounts.length,
      directHosts: directTargetHosts.length,
      hasDirectoryRehber: directory.length,
    });
    const getCandidateSet = (key: string, factory: () => Array<{panelName:string;code:string;server:string;sources?:ServerCodeBinding["sources"]}>) => {
      const existing = candidateSetByKey.get(key);
      if (existing !== undefined) return existing;
      const candidates=factory().map(c=>({...c,server:canonicalPanelHost(c.server)||""})).filter(c=>!!c.server);
      if (!candidates.length) return -1;
      const index = candidateSets.length;
      candidateSets.push(candidates);
      candidateSetByKey.set(key, index);
      return index;
    };
    for (const a of accounts) {
      let setKey = "";
      let factory: () => Array<{panelName:string;code:string;server:string;sources?:ServerCodeBinding["sources"]}>;
      if (a.server) {
        const restoredHosts = Array.from(new Set([a.server, ...(a.validatedHosts || [])]));
        setKey = `server:${a.server}|${restoredHosts.join("|")}`;
        factory = () => restoredHosts.map(server => ({ panelName: a.panelName || a.name || hostName(a.server!), code: a.serverCode || "", server }));
      } else if (a.serverCode) {
        setKey = `code:${a.serverCode}`;
        factory = () => {
          const item=directory.find(x=>(x.codes||[x.code]).includes(a.serverCode!));
          return item ? item.hosts.map(server => ({panelName:item.panelName,code:item.code,server,sources:item.sources})) : [];
        };
      } else if (a.panelName) {
        const wanted = normalizeName(a.panelName);
        setKey = `panel:${wanted}`;
        factory = () => {
          const exactCode=directory.find(x=>(x.codes||[x.code]).includes(a.panelName!));
          const byName = directory.filter(x => normalizeName(x.panelName) === wanted);
          const item=exactCode||byName[0];
          return item ? item.hosts.map(server => ({panelName:item.panelName,code:item.code,server,sources:item.sources})) : [];
        };
      } else if (directTargetHosts.length) {
        /**
         * v17.9.2 — DOĞRUDAN DNS COMBO HESAPLARINA BAĞLANIYOR
         * -------------------------------------------------------------------
         * SORUN (kullanıcı): "Doğrudan DNS" alanına adres yazıp rastgele combo
         * (user:pass) dosyası seçilince, hesaplar bu else dalına düşüp TÜM
         * rehberi ("auto:all-directory") deniyordu; girilen DNS hiç
         * kullanılmıyordu. Rehber boşsa hiçbir hesap bulunamıyordu.
         *
         * Artık doğrudan DNS girilmişse, sunucusu belli olmayan her hesap için
         * aday küme GİRİLEN DNS'lerden oluşur. Birden fazla DNS virgül/satır
         * ile girilebilir ve hepsi bu hesap için aday olur. Kümeler hesaptan
         * bağımsız kurulduğu ve native tarayıcı her hesabı paralel yürüttüğü
         * için DNS denemeleri diğer hesaplarla PARALEL ilerler (sıralı bekleme
         * yoktur).
         */
        setKey = `directHosts:${directTargetHosts.join("|")}`;
        factory = () => directTargetHosts.map((server: string) => ({ panelName: hostName(server), code: "", server }));
      } else {
        setKey = "auto:all-directory";
        factory = () => {
          const candidates: Array<{panelName:string;code:string;server:string;sources?:ServerCodeBinding["sources"]}> = [];
          for (const item of directory) for (const server of item.hosts) candidates.push({panelName:item.panelName,code:item.code,server,sources:item.sources});
          return candidates;
        };
      }
      const candidateSet = getCandidateSet(setKey, factory);
      if (candidateSet < 0) {
        if (missingAccounts.length < 5) missingAccounts.push(a.name || a.username);
        continue;
      }
      compactJobs.push({ row:a.row, name:a.name, username:a.username, password:a.password, candidateSet });
    }
    if (compactJobs.length !== accounts.length) {
      throw new Error(`Bazı hesaplar için panel/DNS adayı hazırlanamadı: ${missingAccounts.join(", ")}`);
    }
    const compactPayload = { version: 3 as const, candidateSets, jobs: compactJobs };
    const sourceFingerprint = stableScanSourceFingerprint(accounts, src);
    void recordDiagnostic("scan", "V171_COMPACT_PAYLOAD_READY", {
      accounts: compactJobs.length,
      candidateSetCount: candidateSets.length,
      batchSize: cfg.batchSize || 15,
      requestedConcurrency: cfg.requestedConcurrency || Math.max(1, Math.min(250, cfg.concurrency * Math.max(1, cfg.accountConcurrency))),
      sourceFingerprint,
    }, { stage: "scan-prepare", outcome: "success" });
    await storage.secureSet(PENDING_BULK_SCAN_KEY, JSON.stringify(accounts));
    if (signal?.aborted || bulkScanCancelledRef.current) {
      await storage.secureRemove(PENDING_BULK_SCAN_KEY);
      await storage.secureRemove(PENDING_BULK_STREAM_KEY);
      return { found: 0, completed: 0, cancelled: true };
    }
    bulkPreparationAbortRef.current = null;
    const requestedConcurrency = Math.max(1, Math.min(250, cfg.requestedConcurrency ?? (cfg.concurrency * Math.max(1, cfg.accountConcurrency))));
    const batchSize = Math.max(5, Math.min(50, cfg.batchSize ?? 15));
    bulkNativeScanRef.current = true;
    let runId = "";
    try {
      runId = await startAcceptedScan(() => PanelScan.startUnifiedScanV171(compactPayload, requestedConcurrency, cfg.timeoutMs, batchSize, sourceFingerprint));
      bulkScanRunIdRef.current = runId;
    } catch (e) {
      bulkNativeScanRef.current = false;
      bulkScanRunIdRef.current = "";
      throw e;
    }
    let lastFound=-1, completed=0;
    const snapshotDeadline=Date.now()+30000;
    while (true) {
      const snap=PanelScan.getSnapshot();
      if (snap.runId !== runId) { if(Date.now()>snapshotDeadline)throw new Error("Native tarama 30 saniyede durum bildirmedi; yeniden deneyin.");await new Promise(resolve=>setTimeout(resolve,120)); continue; }
      if (snap.error) throw new Error(snap.error);
      if (Array.isArray(snap.accountStatuses)) setBulkAccountProgress(snap.accountStatuses);
      const raw=Array.isArray(snap.matches)?snap.matches:[];
      if (raw.length !== lastFound) {
        const resolved: BulkResolvedCandidate[]=[];
        for (const m of raw) {
          const ai=Number(m.accountIndex); const account=Number.isInteger(ai)?accounts[ai]:accounts.find(a=>a.row===Number(m.sourceRow)); if(!account) continue;
          const panelName=String(m.panelName||"").trim(), code=String(m.code||"").trim(), server=String(m.server||"").trim(); if(!server) continue;
          resolved.push({ key:bulkCandidateKey(account.row,account.username,code,panelName,server), sourceRow:account.row, name:account.name.trim()||panelName||hostName(server), username:account.username, password:account.password, panelName:panelName||hostName(server), code, server,login:m.login,sources:m.sources, validatedHosts:[server], direct:!!account.server || panelName === "Doğrudan DNS" });
        }
        mergeBulkCandidates(resolved); lastFound=raw.length;
      }
      completed=Number(snap.accountTested||0); const tested=Number(snap.tested||0), total=Number(snap.total||0), pct=total?Math.round(tested/total*100):0;
      const createdAt = Number(snap.createdAt || Date.now());
      setBulkScanPaused(!!snap.paused);
      const foundCount = Number(snap.found ?? raw.length);
      const batchLabel = Number.isFinite(Number(snap.batchIndex)) && Number(snap.batchCount || 0) > 0
        ? ` · Parti ${Math.min(Number(snap.batchCount), Number(snap.batchIndex) + 1)}/${Number(snap.batchCount)}` : "";
      const concurrencyLabel = snap.requestedConcurrency
        ? `\nParalellik: istenen ${snap.requestedConcurrency} · etkin ${snap.effectiveConcurrency || snap.requestedConcurrency} · parti ${snap.batchSize || batchSize}` : "";
      setProgress(`${cfg.label} · NATIVE · %${pct}${batchLabel}\nHesap ${completed}/${accounts.length} · Adres ${tested}/${total} · Kalan ${Math.max(0,total-tested)} · Bulunan ${foundCount}${snap.panelName?`\nŞu an: ${snap.panelName}${snap.currentServer ? ` · ${snap.currentServer}` : ""}`:""}${concurrencyLabel}\nGeçen: ${formatScanDuration(Date.now()-createdAt)} · Tahmini kalan: ${scanEta(createdAt,tested,total)}${snap.paused?"\nDURAKLATILDI":snap.state==="CANCELLING"?"\nDURDURULUYOR — aktif ağ istekleri kapatılıyor":""}`);
      if (!snap.running) {
        // v17.0.3: terminal scan snapshot + account map kullanıcı açıkça kapatana/ekleyene kadar korunur.
        // Activity/process yeniden oluşsa bile bulunan sonuçlar tekrar hydrate edilir.
        bulkNativeScanRef.current = false;
        if (bulkScanRunIdRef.current === runId) bulkScanRunIdRef.current = "";
        return { found:raw.length, completed, cancelled:!!snap.cancelled };
      }
      await new Promise(resolve=>setTimeout(resolve,350));
    }
    } finally {
      finishScanTask();
    }
  };

  const runNativeStreamingBulkFile = async (
    source: { uri:string; name:string; size:number; samples:BulkAccountInput[]; warnings:string[] },
    cfg: { concurrency:number; timeoutMs:number; accountConcurrency:number; label:string; requestedConcurrency?:number; batchSize?:number },
    signal?: AbortSignal,
  ): Promise<{ found:number; completed:number; cancelled:boolean; unmatched?:number }> => {
    const finishScanTask = markTask("scan:panel-stream-v172", { mode: "streaming-file-v172", file: source.name, bytes: source.size });
    try {
      if (!PanelScan.available || Platform.OS !== "android") throw new Error("__NATIVE_SCAN_UNAVAILABLE__");
      const src = codeSource.trim() || DEFAULT_CODE_SOURCE;
      setProgress(`${cfg.label} · Dosya native streaming tarama için hazırlanıyor…`);
      if (signal?.aborted || bulkScanCancelledRef.current) return { found:0, completed:0, cancelled:true };
      // v17.4.0: kapsam filtresi her yolda uygulanır
      const directory = await resolveScanDirectory(src, { signal, timeoutMs: cfg.timeoutMs });
      if (signal?.aborted || bulkScanCancelledRef.current) return { found:0, completed:0, cancelled:true };
      // A direct server in a file may still be valid without a directory;
      // the native scanner reports a precise no-candidate error if none match.
      void recordDiagnostic("scan", "V173_STREAM_DIRECTORY_READY", { panels:directory.length, hosts:directory.reduce((n,p)=>n+p.hosts.length,0), fileBytes:source.size }, { stage:"scan-prepare" });
      const requestedConcurrency = Math.max(1, Math.min(250, cfg.requestedConcurrency ?? (cfg.concurrency * Math.max(1, cfg.accountConcurrency))));
      const batchSize = Math.max(5, Math.min(15, cfg.batchSize ?? 15));
      const sourceFingerprint = stableStreamingFileFingerprint(source.uri, source.name, source.size, src);
      await storage.secureSet(PENDING_BULK_STREAM_KEY, JSON.stringify({ uri:source.uri, name:source.name, size:source.size, fingerprint:sourceFingerprint, directorySource:src }));
      void recordDiagnostic("scan", "V172_STREAMING_FILE_DISPATCH", {
        fileName: source.name, fileBytes: source.size, requestedConcurrency, batchSize, sourceFingerprint,
      }, { stage:"scan-prepare", outcome:"success" });
      bulkPreparationAbortRef.current = null;
      bulkNativeScanRef.current = true;
      let runId = "";
      try {
        runId = await startAcceptedScan(() => PanelScan.startStreamingFileScanV172(source.uri, directory, requestedConcurrency, cfg.timeoutMs, batchSize, sourceFingerprint));
        bulkScanRunIdRef.current = runId;
      } catch (e) {
        bulkNativeScanRef.current = false;
        bulkScanRunIdRef.current = "";
        throw e;
      }
      let lastFound = -1;
      let completed = 0;
      const snapshotDeadline=Date.now()+30000;
      while (true) {
        const snap = PanelScan.getSnapshot();
        if (snap.runId !== runId) { if(Date.now()>snapshotDeadline)throw new Error("Dosya taraması 30 saniyede durum bildirmedi; yeniden deneyin.");await new Promise(resolve => setTimeout(resolve, 120)); continue; }
        if (snap.error) throw new Error(snap.error);
        const raw = Array.isArray(snap.matches) ? snap.matches : [];
        if (raw.length !== lastFound) {
          const resolved: BulkResolvedCandidate[] = [];
          for (const m of raw) {
            const username=String(m.username||"").trim(), password=String(m.password||"");
            const panelName=String(m.panelName||"").trim(), code=String(m.code||"").trim(), server=String(m.server||"").trim();
            const row=Number(m.sourceRow||0); if (!username || !server) continue;
            resolved.push({
              key:bulkCandidateKey(row,username,code,panelName,server), sourceRow:row,
              name:String(m.name||"").trim()||panelName||hostName(server), username, password,
              panelName:panelName||hostName(server), code, server,login:m.login,sources:m.sources,
              validatedHosts:[server], direct:panelName === "Doğrudan DNS",
            });
          }
          mergeBulkCandidates(resolved,!bulkResultsDismissedRef.current); lastFound = raw.length;
        }
        completed = Number(snap.accountTested || 0);
        const tested = Number(snap.tested || 0);
        const accountTotal = Number(snap.accountTotal || 0);
        setBulkStreamProgress({read:accountTotal,completed,tested,found:Number(snap.found||0),producerDone:!!snap.producerDone});
        const createdAt = Number(snap.createdAt || Date.now());
        setBulkScanPaused(!!snap.paused);
        const foundCount = Number(snap.found ?? raw.length);
        const producerLabel = snap.producerDone ? "dosya okuma tamam" : Number(snap.queueCapacity||0) ? `dosya okunuyor · kuyruk ${Number(snap.queueDepth||0)}/${Number(snap.queueCapacity||0)}` : "dosya hazırlanıyor · henüz hesap okunmadı";
        const concurrencyLabel = `\nParalellik: istenen ${snap.requestedConcurrency || requestedConcurrency} · etkin ${snap.effectiveConcurrency || requestedConcurrency} · parti ${snap.batchSize || batchSize}`;
        setProgress(`${cfg.label} · NATIVE STREAM v17.3\nHesap tamamlanan ${completed}${snap.producerDone ? `/${accountTotal}` : ` · okunan ${accountTotal}`} · Adres ${tested} · Bulunan ${foundCount}${Number(snap.skippedNoCandidate||0) ? ` · Hedefsiz ${Number(snap.skippedNoCandidate)}` : ""}\n${producerLabel}${concurrencyLabel}\nGeçen: ${formatScanDuration(Date.now()-createdAt)}${snap.paused?"\nDURAKLATILDI":snap.state==="CANCELLING"?"\nDURDURULUYOR — aktif ağ istekleri kapatılıyor":""}`);
        if (!snap.running) {
          bulkNativeScanRef.current = false;
          if (bulkScanRunIdRef.current === runId) bulkScanRunIdRef.current = "";
          return { found:raw.length, completed, cancelled:!!snap.cancelled, unmatched:Number(snap.skippedNoCandidate||0) };
        }
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    } finally {
      finishScanTask();
    }
  };

  const submitBulkAccounts = async () => {
    const parsed = bulkParsed;
    if (!parsed.accounts.length && !bulkFileStreamSource) throw new Error(parsed.warnings[0] || "Geçerli toplu hesap bulunamadı.");

    setLoading(true);
    setError(null);
    setBulkCandidates([]);
    setSelectedBulkCandidateKeys([]);
    setBulkScanFailures([]);
    setBulkAccountProgress([]);
    setBulkStreamProgress(null);
    setBulkScanFinished(false);
    bulkResultsDismissedRef.current = false;
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
    const baseCfg = scanConfigForSpeed();
    const requestedCustom = Math.max(1, Math.min(250, Number.parseInt(bulkRequestedConcurrency, 10) || 32));
    const configuredBatchSize = Math.max(5, Math.min(15, Number.parseInt(bulkBatchSize, 10) || 15));
    const cfg = bulkCustomConcurrencyEnabled
      ? { ...baseCfg, label: "Özel", requestedConcurrency: requestedCustom, batchSize: configuredBatchSize }
      : { ...baseCfg, requestedConcurrency: Math.max(1, Math.min(250, baseCfg.concurrency * Math.max(1, baseCfg.accountConcurrency))), batchSize: configuredBatchSize };
    let found = 0;
    let completed = 0;
    let cursor = 0;

    const control:ScanExecutionControl={
      probeCache:new Map(),
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
        let cancelledNative = false;
        if (parsed.accounts.length) {
          const nr = await runNativeBulkAccounts(parsed.accounts, cfg, preparationController.signal);
          found += nr.found; completed += nr.completed; cancelledNative = nr.cancelled;
        }
        if (!cancelledNative && bulkFileStreamSource && !bulkScanCancelledRef.current) {
          const sr = await runNativeStreamingBulkFile(bulkFileStreamSource, cfg, preparationController.signal);
          found += sr.found; completed += sr.completed; cancelledNative = sr.cancelled;
          if(sr.unmatched)failures.push(`${sr.unmatched} hesap için dosyadaki panel/kod seçilen DNS hedefleriyle eşleşmedi.`);
        }
        setBulkScanFailures(failures); setBulkScanFinished(true); if(!bulkResultsDismissedRef.current)setShowBulkCandidates(true);
        const manualTotal = parsed.accounts.length;
        setProgress(cancelledNative ? `Tarama durduruldu · ${completed}${manualTotal ? `/${manualTotal}+dosya` : ""} hesap · ${found} sonuç korunuyor.` : `Native tarama tamamlandı · ${completed} hesap işlendi · ${found} kimlik doğrulaması başarılı panel/DNS adayı bulundu${failures.length?` · ${failures.join(' ')}`:''}.`);
        if (!found && !cancelledNative) setError("Kimlik doğrulaması başarılı aday bulunamadı.");
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
      if(!bulkResultsDismissedRef.current)setShowBulkCandidates(true);
      if (bulkScanCancelledRef.current) {
        setProgress(`Tarama durduruldu · ${completed}/${parsed.accounts.length} hesap işlendi · ${found} sonuç korunuyor.`);
      } else {
        setProgress(`Tarama tamamlandı · ${completed}/${parsed.accounts.length} hesap işlendi · ${found} kimlik doğrulaması başarılı panel/DNS adayı bulundu${failures.length ? ` · ${failures.length} hesapta sonuç yok` : ""}`);
      }
      if (!found && !bulkScanCancelledRef.current) setError(failures.join("\n") || "Kimlik doğrulaması başarılı aday bulunamadı.");
    } catch (e: any) {
      setBulkScanFinished(true);
      if(!bulkResultsDismissedRef.current)setShowBulkCandidates(true);
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

  const acknowledgeBulkScanResult = React.useCallback(async () => {
    try {
      const scan = PanelScan.available ? PanelScan.getSnapshot() : {};
      if (scan.runId && !scan.running) PanelScan.acknowledgeSnapshot(String(scan.runId));
      await clearScanRecoveryIntent();
      await storage.secureRemove(PENDING_BULK_SCAN_KEY);
      await storage.secureRemove(PENDING_BULK_STREAM_KEY);
    } catch (e) { console.warn("[v17.0.3 bulk-scan-ack]", e); }
  }, []);

  const acknowledgeDiscoveryResult = React.useCallback(async () => {
    try {
      const scan = PanelScan.available ? PanelScan.getSnapshot() : {};
      if (scan.mode === "single" && scan.runId && !scan.running) PanelScan.acknowledgeSnapshot(String(scan.runId));
      await clearScanRecoveryIntent();
    } catch (e) { console.warn("[v17.0.6 single-scan-ack]", e); }
  }, []);

  const exportBulkCandidatesTxt = React.useCallback(async (safe: boolean, requestedFileName: string) => {
    if (bulkArchiveSaving) return;
    const selected = bulkCandidates.filter(c => selectedBulkCandidateKeys.includes(c.key));
    if (!selected.length) { Alert.alert("Hesap Arşivi", "Önce dışa aktarılacak hesap/DNS satırlarını seçin."); return; }
    const grouped = new Map<string, BulkResolvedCandidate[]>();
    selected.forEach(c => { const k=bulkSubscriptionKey(c); grouped.set(k,[...(grouped.get(k)||[]),c]); });
    const records = Array.from(grouped.values()).map(rows => {
      const preferred=rows.find(isActiveBulkCandidate)||rows[0];
      const allRows=bulkCandidates.filter(c=>bulkSubscriptionKey(c)===bulkSubscriptionKey(preferred));
      const hosts=Array.from(new Set(bulkUseAllValidatedHosts ? allRows.flatMap(c=>c.validatedHosts?.length?c.validatedHosts:[c.server]) : rows.map(c=>c.server)));
      return { name:preferred.name, username:preferred.username, password:preferred.password, server:preferred.server, primaryHost:preferred.server, panelName:preferred.panelName, serverCode:preferred.code, validatedHosts:hosts, login:preferred.login };
    });
    const text=buildKizilkanAccountArchive(records,safe);
    const baseName=normalizeBulkArchiveBaseName(requestedFileName,safe);
    const fileName=`${baseName}.txt`;
    const uri=`${FileSystem.cacheDirectory}${fileName}`;
    setBulkArchiveSaving(true);
    try {
      // Uygulama önbelleğindeki kopya paylaşım/fallback için her platformda korunur.
      await FileSystem.writeAsStringAsync(uri,text,{encoding:FileSystem.EncodingType.UTF8});
      if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
        const perm=await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        /**
         * v17.4.2 — "İNDİRİLENLER KÖKÜ YAZILAMAZ" ÖNCEDEN YAKALANIYOR
         * --------------------------------------------------------------------
         * CİHAZ KANITI: kullanıcı klasör seçiminde İndirilenler'i seçtiğinde
         *   createSAFFileAsync rejected
         *   → java.io.IOException: Location
         *     'content://com.android.providers.downloads.documents/tree/downloads'
         *     isn't writable.
         * Bu Android'in kendi kısıtlamasıdır: Downloads sağlayıcısının KÖKÜNE
         * SAF ağaç izniyle dosya OLUŞTURULAMAZ (alt klasörler yazılabilir).
         * Eskiden bunu yazmayı deneyip ham Java hatasıyla öğreniyorduk; artık
         * denemeden önce tespit edip kullanıcıya ne yapacağını söylüyoruz.
         */
        /**
         * v17.5.0 — TESPİT GENİŞLETİLDİ.
         * v17.4.2'de yalnız ".../tree/downloads" ile bitenler yakalanıyordu;
         * ama Downloads sağlayıcısı farklı ağaç kimlikleri de üretiyor:
         *   content://com.android.providers.downloads.documents/tree/msd%3A1000458734
         * Bu yüzden filtre kaçırdı ve kullanıcı yine ham Java hatası gördü.
         * Artık YOL değil SAĞLAYICININ KENDİSİ yakalanıyor: Downloads
         * sağlayıcısından gelen HER ağaç izni yazılamaz kabul edilir.
         */
        if (perm.granted && /com\.android\.providers\.downloads\.documents/i.test(String(perm.directoryUri||""))) {
          void recordDiagnostic("scan","BULK_TXT_EXPORT_DOWNLOADS_ROOT_BLOCKED",{
            records: records.length, contentChars: text.length, directoryUri: String(perm.directoryUri).slice(0,120),
          },{ stage:"bulk-export", outcome:"blocked" });
          setBulkArchiveSaving(false);
          Alert.alert(
            "Bu klasöre yazılamıyor",
            "Android'in \"İndirilenler\" sağlayıcısı, uygulamaların bu klasöre doğrudan dosya " +
            "oluşturmasına izin vermiyor. Bu bir sistem kısıtlaması.\n\n" +
            "ÇÖZÜM — klasör seçici açıldığında:\n" +
            "1) Sol üstteki menüden telefonunuzun adını seçin (ör. \"Dahili depolama\")\n" +
            "2) Download klasörüne girin\n" +
            "3) Sağ üstten YENİ KLASÖR oluşturun (ör. KIZILKAN)\n" +
            "4) O klasörü seçin\n\n" +
            "Alternatif: Belgeler (Documents) klasörünü seçin ya da " +
            "\"Paylaş / Farklı Kaydet\" ile kaydedin.",
            [
              { text: "Başka Klasör Seç", onPress: () => { void exportBulkCandidatesTxt(safe, requestedFileName); } },
              { text: "Paylaş / Farklı Kaydet", onPress: () => { void (async () => {
                  try { if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri,{mimeType:"text/plain",dialogTitle:"KIZILKAN Hesap Arşivi"}); } catch {}
                })(); } },
              { text: "Kapat", style: "cancel" },
            ],
          );
          return;
        }
        if (perm.granted) {
          // Expo SAF sözleşmesi createFileAsync'e uzantısız ad ister; MIME sağlayıcısı
          // .txt uzantısını üretir. Eski sürüm burada doğrudan "...txt" gönderiyordu.
          const target=await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri,baseName,"text/plain");
          await FileSystem.writeAsStringAsync(target,text,{encoding:FileSystem.EncodingType.UTF8});

          // v17.0.14 WRITE-VERIFY: yalnız Promise resolve olduğu için başarı deme.
          // SAF content URI'yi geri oku ve byte-equivalent metni doğrula.
          const readBack=await FileSystem.readAsStringAsync(target,{encoding:FileSystem.EncodingType.UTF8});
          if (readBack !== text) {
            throw new Error(`SAF_WRITE_VERIFY_FAILED expectedChars=${text.length} actualChars=${readBack.length}`);
          }
          void recordDiagnostic("scan", "BULK_TXT_EXPORT_VERIFIED", {
            safe, records: records.length, contentChars: text.length, verified: true, storage: "android_saf",
          }, { stage: "bulk-export", outcome: "success" });
          Alert.alert("Hesap Arşivi Kaydedildi", `${records.length} abonelik doğrulanmış TXT dosyasına kaydedildi.\n${fileName}`);
          return;
        }
        void recordDiagnostic("scan", "BULK_TXT_EXPORT_DIRECTORY_CANCELLED", {
          safe, records: records.length, contentChars: text.length, storage: "android_saf",
        }, { stage: "bulk-export", outcome: "cancelled" });
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri,{mimeType:"text/plain",dialogTitle:"KIZILKAN Hesap Arşivini Kaydet / Paylaş"});
        return;
      }
      Alert.alert("Hesap Arşivi", `Dosya uygulama önbelleğinde hazırlandı: ${fileName}`);
    } catch (e:any) {
      const message=String(e?.message||e||"Bilinmeyen kayıt hatası");
      void recordDiagnostic("scan", "BULK_TXT_EXPORT_FAILED", {
        safe, records: records.length, contentChars: text.length, storage: Platform.OS === "android" ? "android_saf" : "cache_share",
        errorClass: message.startsWith("SAF_WRITE_VERIFY_FAILED") ? "SAF_WRITE_VERIFY_FAILED" : String(e?.name || "TXT_EXPORT_ERROR"),
        // v17.4.2: Mesajın KENDİSİ eksikti; logda yalnız "errorClass: Error"
        // görünüyordu ve sebebi (Downloads kökü yazılamaz) ancak ekran
        // görüntüsünden anlaşılabiliyordu. Artık teşhis logdan yapılabilir.
        errorMessage: message.slice(0, 400),
      }, { stage: "bulk-export", outcome: "error" });
      Alert.alert("TXT Kaydedilemedi", `Seçilen klasöre TXT yazımı doğrulanamadı. Başarı mesajı verilmedi.\n\n${message}`, [
        { text: "Kapat", style: "cancel" },
        { text: "Paylaş / Farklı Kaydet", onPress: () => { void (async () => {
          try { if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri,{mimeType:"text/plain",dialogTitle:"KIZILKAN Hesap Arşivini Kaydet / Paylaş"}); } catch {}
        })(); } },
      ]);
    } finally {
      setBulkArchiveSaving(false);
    }
  },[bulkArchiveSaving,bulkCandidates,selectedBulkCandidateKeys,bulkUseAllValidatedHosts]);

  const openBulkArchiveName = React.useCallback((safe: boolean) => {
    setBulkArchiveSafe(safe);
    setBulkArchiveFileName(defaultBulkArchiveBaseName(safe));
    setBulkArchiveNameOpen(true);
  },[]);

  const confirmBulkArchiveName = React.useCallback(() => {
    if (bulkArchiveSaving) return;
    const normalized=normalizeBulkArchiveBaseName(bulkArchiveFileName,bulkArchiveSafe);
    setBulkArchiveFileName(normalized);
    setBulkArchiveNameOpen(false);
    void exportBulkCandidatesTxt(bulkArchiveSafe,normalized);
  },[bulkArchiveFileName,bulkArchiveSafe,bulkArchiveSaving,exportBulkCandidatesTxt]);

  const chooseBulkArchiveMode = React.useCallback(() => {
    Alert.alert("TXT Hesap Arşivi","Tam arşiv tekrar içe aktarılabilir ve şifreleri içerir. Güvenli rapor credential alanlarını maskeler.",[
      {text:"Vazgeç",style:"cancel"},
      {text:"Güvenli Rapor",onPress:()=>openBulkArchiveName(true)},
      {text:"Tam Arşiv",onPress:()=>openBulkArchiveName(false)},
    ]);
  },[openBulkArchiveName]);

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
        validatedHosts: Array.from(new Set(bulkUseAllValidatedHosts ? allRows.flatMap(x => x.validatedHosts?.length ? x.validatedHosts : [x.server]) : rows.map(x => x.server))),
      };
    });
    if (!chosen.length) return;
    /**
     * v17.8.0 RC3 — YARIŞ DURUMU DÜZELTMESİ
     * Sahiplik bayrağı eskiden `await secureSet(...)` SONRASINDA alınıyordu.
     * setBulkAdding(true) kurtarma etkisini yeniden tetikliyor; o bekleme
     * sırasında etki çalışıp bayrağı false görüyor, bekleyen listeyi bulup
     * cancelBulkImport() çağırıyordu — yani yeni ekleme KENDİNİ iptal
     * edebiliyordu. Bayrak artık her şeyden önce alınır.
     */
    bulkImportOwnedByScreenRef.current = true;
    bulkPauseRequestedRef.current = false;
    setBulkAdding(true);
    setLoading(true);
    setBulkImportPaused(false);
    setBulkImportStatuses({});

    // v15.2.2-RC1: Android'de katalog indirme + normalize + dosya + Room index
    // tamamen foreground native service'te çalışır. JS arka plana alınsa bile iş
    // devam eder; UI geri geldiğinde kalıcı snapshot'tan kaldığı durumu okur.
    if (Platform.OS === "android" && KizilkanNativeCore.available && !chooseCategories) {
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
        /**
         * v17.8.0 RC3 — SERVİS BOŞA ÇIKANA KADAR BEKLE
         * Native servis ACTION_START'ı yalnız `!running` iken kabul eder;
         * iptal sonrası işçiler bitene kadar running true kalır ve bu aralıkta
         * yeni başlatma SESSİZCE YOK SAYILIR (JS 30 sn sonra "yanıt vermedi"
         * hatası verirdi). Duraklat/iptal sonrası hemen devam edilince tam bu
         * oluyordu. Başlatmadan önce en çok 15 sn servisin durmasını bekleriz.
         */
        {
          const waitStart = Date.now();
          while (Date.now() - waitStart < 15_000) {
            const cur = KizilkanNativeCore.getBulkImportSnapshot() || {};
            const fresh = (Date.now() - Number(cur.updatedAt || 0)) < 90_000;
            if (!cur.running || !fresh) break;   // durmuş ya da bayat: başlatılabilir
            await new Promise(r => setTimeout(r, 300));
          }
          void recordDiagnostic("scan", "BULK_IMPORT_WAIT_IDLE", { waitedMs: Date.now() - waitStart });
        }
        const importRunId = await KizilkanNativeCore.startBulkImport(jobs, Math.min(2, jobs.length));
        if (!importRunId) throw new Error("Native playlist ekleme servisi başlatılamadı.");
        /**
         * v17.8.0 — SONSUZ DÖNGÜ KORUMASI
         * Eskiden runId eşleşmezse döngü 120 ms'de bir SONSUZA kadar dönüyordu;
         * native servis ölmüşse hiçbir zaman çıkamıyordu. Artık iki koruma var:
         *  - runId 30 sn boyunca eşleşmezse servis başlamamış sayılır
         *  - snapshot 90 sn güncellenmezse servis ölmüş sayılır
         * İkisi de kullanıcıya açık bir hatayla sonuçlanır.
         */
        let stoppedByUser = false;
        const loopStartedAt = Date.now();
        let lastProgressAt = Date.now();
        let lastCompleted = -1;
        void recordDiagnostic("scan", "BULK_IMPORT_LOOP_START", { runId: importRunId, jobs: jobs.length });
        while (true) {
          const snap = KizilkanNativeCore.getBulkImportSnapshot() || {};
          if (snap.runId !== importRunId) {
            if (Date.now() - loopStartedAt > 30_000) {
              void recordDiagnostic("scan", "BULK_IMPORT_RUNID_TIMEOUT", { expected: importRunId, got: String(snap.runId || "") });
              throw new Error("Ekleme servisi yanıt vermedi (30 sn). Lütfen tekrar deneyin.");
            }
            await new Promise(resolve => setTimeout(resolve, 120)); continue;
          }
          const nowCompleted = Number(snap.completed || 0);
          if (nowCompleted !== lastCompleted) { lastCompleted = nowCompleted; lastProgressAt = Date.now(); }
          const snapAge = Date.now() - Number(snap.updatedAt || Date.now());
          if (snap.running && snapAge > 90_000) {
            void recordDiagnostic("scan", "BULK_IMPORT_SERVICE_STALLED", {
              runId: importRunId, completed: nowCompleted, total: Number(snap.total || jobs.length),
              snapAgeMs: snapAge, sinceProgressMs: Date.now() - lastProgressAt,
            });
            try { await KizilkanNativeCore.cancelBulkImport(); } catch {}
            throw new Error(`Ekleme servisi 90 saniyedir ilerlemiyor (${nowCompleted}/${Number(snap.total || jobs.length)}). İşlem durduruldu; tamamlanan listeler korundu.`);
          }
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
                serverCodeBinding: c.direct ? undefined : makeBinding(c.code, c.panelName, c.server, c.validatedHosts, c.sources),
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
            stoppedByUser = !!snap.cancelled;
            break;
          }
          await new Promise(r => setTimeout(r, 700));
        }
        /**
         * v17.8.0 RC3 — "DURAKLAT" ARTIK GERÇEKTEN DURAKLATIYOR
         * Eskiden servis iptal edilince döngü `!running` görüp NORMAL BİTİŞ
         * yoluna düşüyordu: bekleyen liste siliniyor, "3/27 eklendi" uyarısı
         * çıkıyor ve ana ekrana dönülüyordu. Duraklatma fiilen iptal oluyordu.
         * Artık kullanıcı durdurduysa normal bitiş kodu ÇALIŞMAZ; duraklatmada
         * bekleyen liste korunur (devam önerisi için).
         */
        if (stoppedByUser) {
          void recordDiagnostic("scan", bulkPauseRequestedRef.current ? "BULK_IMPORT_PAUSED_EXIT" : "BULK_IMPORT_CANCELLED_EXIT", { ok, total: chosen.length });
          return;
        }
        // v17.8.0: İşlem NORMAL bittiyse bekleyen liste temizlenir. Eskiden
        // silinmiyordu; devam özelliği her açılışta bitmiş işi önerirdi.
        void recordDiagnostic("scan", "BULK_IMPORT_FINISHED", { ok, total: chosen.length, failed: failed.length });
        try { await storage.secureRemove(PENDING_BULK_IMPORT_KEY); } catch {}
        Alert.alert("Toplu Hesap Ekleme", `${ok}/${chosen.length} seçili hesap kalıcı olarak eklendi.${failed.length ? `\nEklenemeyenler:\n${failed.slice(0, 6).join("\n")}` : ""}`);
        if (ok > 0) router.replace("/(tabs)");
      } catch (e: any) {
        setError(e?.message || "Native toplu hesap ekleme başarısız.");
      } finally {
        bulkImportOwnedByScreenRef.current = false;
        setBulkAdding(false); setLoading(false); setProgress(""); setBulkImportPaused(false);
        if (ok > 0) { await acknowledgeBulkScanResult(); setShowBulkCandidates(false); setBulkCandidates([]); setSelectedBulkCandidateKeys([]); }
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
          c.direct ? undefined : makeBinding(c.code, c.panelName, c.server, c.validatedHosts, c.sources), false, false,
        );
        if (added) ok++; else failed.push(displayName);
      }
      Alert.alert("Toplu Hesap Ekleme", `${ok}/${chosen.length} seçili hesap eklendi.${failed.length ? `\nEklenemeyen: ${failed.join(", ")}` : ""}`);
      if (ok > 0) router.replace("/(tabs)");
    } finally {
      setBulkAdding(false); setLoading(false); setProgress("");
      if (ok > 0) { await acknowledgeBulkScanResult(); setShowBulkCandidates(false); setBulkCandidates([]); setSelectedBulkCandidateKeys([]); }
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
    setProgress(method === "stalker" ? "MAG Portal hazırlanıyor · bağlantı ve cihaz profili doğrulanacak…" : "");
    try {
      // GPT v10.5.0: "Paneli bilmiyorum" yolunda kullanıcı yalnız kullanıcı
      // adı + şifre verir. Firebase yalnız katalog olarak kullanılır; kimlik
      // bilgileri doğrudan aday Xtream sunucularına gider.
      if (method === "code" && (codeMode === "auto"||!!(panelTarget.codes?.length||panelTarget.names?.length||panelTarget.keys?.length))) {
        await submitAutoDiscovery();
        return;
      }
      if (method === "code" && codeMode === "directory" && !codeVal.trim()&&!selectedPanelItem) {
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

      // v16.14.7: M3U legacy parser çıktısını yalnız gerçekten oluşturulduğu branch içinde
      // commit et. Böylece definite-assignment compiler garantisi ile runtime sahipliği aynı olur.
      const commitLegacyParsedPlaylist = async (candidate: Playlist) => {
        const totalItems = (candidate.channels?.length || 0) + (candidate.vod?.length || 0) + (candidate.series?.length || 0);
        if (totalItems === 0) throw new Error("Hiç kanal/film/dizi bulunamadı. Kaynağı kontrol edin.");
        setProgress("Cihaza kaydediliyor...");
        if (!(await commitPlaylist(candidate))) return false;
        setProgress("Playlist hazır. +18 filtresi arka planda hazırlanıyor...");
        router.replace("/(tabs)");
        return true;
      };
      if (method === "m3u_url") {
        if (!m3uUrl.trim()) throw new Error("M3U URL boş olamaz");
        const canonicalM3u = canonicalUrlIdentity(m3uUrl);
        id = stablePlaylistId("m3u", canonicalM3u);
        if (playlists.some(pl => pl.id === id || (pl.m3uUrl && canonicalUrlIdentity(pl.m3uUrl) === canonicalM3u))) {
          throw new Error("Bu M3U kaynağı zaten ekli.");
        }
        if (Platform.OS === "android" && KizilkanNativeCore.available && !chooseCategories) {
          setProgress("M3U Native Core ile indiriliyor ve Room'a indeksleniyor...");
          const summary = await KizilkanNativeCore.fetchAndImportM3u(id, m3uUrl.trim());
          const total = Number(summary?.channels || 0) + Number(summary?.vod || 0) + Number(summary?.series || 0);
          if (!summary?.roomIndexed || total === 0) throw new Error("M3U kaynağında içerik bulunamadı.");
          if (!(await commitPreparedPlaylist({
            id, name: name.trim() || "M3U Listesi", source: "m3u_url", m3uUrl: m3uUrl.trim(),
            channels: [], vod: [], series: [], channelsCount: Number(summary.channels || 0),
            vodCount: Number(summary.vod || 0), seriesCount: Number(summary.series || 0),
            createdAt: new Date().toISOString(),
          }))) return false;
          router.replace("/(tabs)");
          return;
        }
        setProgress("Kanallar yükleniyor (legacy parser)...");
        const res = await fetchAndParseM3U(m3uUrl.trim());
        let m3uCatalog={channels:res.channels,vod:res.vod || [],series:res.series || []};
        let contentSelection:PlaylistContentSelection|null=null;
        if(chooseCategories){contentSelection=await requestCategorySelection(m3uCatalog);if(!contentSelection)throw new Error("Kategori seçimi iptal edildi; playlist kaydedilmedi.");m3uCatalog=applyContentSelection(m3uCatalog,contentSelection);}
        const m3uPlaylist: Playlist = {
          id, name: name.trim() || "M3U Listesi", source: "m3u_url", m3uUrl: m3uUrl.trim(), contentSelection,
          channels:m3uCatalog.channels, vod:m3uCatalog.vod, series:m3uCatalog.series, createdAt:new Date().toISOString(),
        };
        if (!(await commitLegacyParsedPlaylist(m3uPlaylist))) return false;
        return;
      } else if (method === "m3u_file") {
        if (!fileContent) throw new Error("Lütfen bir M3U dosyası seçin");
        id = stablePlaylistId("file", fileContent);
        if (playlists.some(pl => pl.id === id)) throw new Error("Bu M3U dosyası zaten ekli.");
        if (Platform.OS === "android" && KizilkanNativeCore.available && !chooseCategories) {
          setProgress("M3U dosyası Native Core ile ayrıştırılıyor ve Room'a indeksleniyor...");
          const summary = await KizilkanNativeCore.importM3uText(id, fileContent);
          const total = Number(summary?.channels || 0) + Number(summary?.vod || 0) + Number(summary?.series || 0);
          if (!summary?.roomIndexed || total === 0) throw new Error("M3U dosyasında içerik bulunamadı.");
          if (!(await commitPreparedPlaylist({
            id, name: name.trim() || fileName || "M3U Dosyası", source: "m3u_file",
            channels: [], vod: [], series: [], channelsCount: Number(summary.channels || 0),
            vodCount: Number(summary.vod || 0), seriesCount: Number(summary.series || 0),
            createdAt: new Date().toISOString(),
          }))) return false;
          router.replace("/(tabs)");
          return;
        }
        setProgress("Kanallar ayrıştırılıyor (legacy parser)...");
        const res = parseM3U(fileContent);
        let fileCatalog={channels:res.channels,vod:res.vod || [],series:res.series || []};
        let contentSelection:PlaylistContentSelection|null=null;
        if(chooseCategories){contentSelection=await requestCategorySelection(fileCatalog);if(!contentSelection)throw new Error("Kategori seçimi iptal edildi; playlist kaydedilmedi.");fileCatalog=applyContentSelection(fileCatalog,contentSelection);}
        const filePlaylist: Playlist = {
          id, name: name.trim() || fileName || "M3U Dosyası", source: "m3u_file", contentSelection,
          channels:fileCatalog.channels, vod:fileCatalog.vod, series:fileCatalog.series, createdAt:new Date().toISOString(),
        };
        if (!(await commitLegacyParsedPlaylist(filePlaylist))) return false;
        return;
      } else if (method === "stalker") {
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

        const {
          stalkerLogin: stLogin,
          stalkerCatalog,
          stalkerEnrichment,
          stalkerCategoryPreview,
          normalizeMac,
          normalizeStalkerAccountInfo,
        } = await import("@/src/utils/stalker");
        const cred = {
          portal: stPortal.trim(),
          mac: normalizeMac(stMac.trim()),
          serial: stSerial.trim() || undefined,
          // v15.2.25 RC1: modern varsayılan cihaz. MAG250 yalnız kontrollü
          // compatibility fallback olarak stalker.ts içinde korunur.
          deviceModel: "MAG320" as const,
        };

        setProgress("MAG320 Exact profiliyle native portala bağlanılıyor...");
        const { session, profile: prof } = await stLogin(cred);
        const profile = prof || {};

        // v16.14.5 P0 — VALIDATION/PERSISTENCE ayrımı. Handshake başarılıysa hesap
        // ağır katalog tamamlanmasını beklemeden atomik olarak kaydedilir.
        const shell: Playlist = {
          id, name: name.trim() || "MAG Portal", source: "stalker",
          stalkerPortal: stPortal.trim(), stalkerMac: stMac.trim().toUpperCase(),
          stalkerSerial: stSerial.trim() || undefined,
          accountInfo: normalizeStalkerAccountInfo(profile),
          channels: [], vod: [], series: [],
          catalogSync: { initialSyncState: "pending", roomVerified: true, updatedAt: new Date().toISOString() },
          createdAt: new Date().toISOString(),
        };
        setProgress("Portal doğrulandı · hesap cihaza kaydediliyor...");
        void recordDiagnostic("catalog","STALKER_ACCOUNT_PERSIST_START",{playlistId:id,endpoint:session.endpoint});
        if (!(await commitPlaylist(shell))) return false;
        void recordDiagnostic("catalog","STALKER_ACCOUNT_PERSIST_OK",{playlistId:id,endpoint:session.endpoint});

        const bootstrap = async (interactiveSelection:boolean) => {
          try {
            const catalog = await stalkerCatalog(cred, session, {
              liveOnly: true,
              onProgress: interactiveSelection ? (progress) => setProgress(progress.message) : undefined,
            });
            let contentSelection: PlaylistContentSelection|null = null;
            let liveCatalog={channels:catalog.channels,vod:[] as any[],series:[] as any[]};
            if (interactiveSelection) {
              const preview=await stalkerCategoryPreview(cred,session);
              const pickerCatalog:any={
                channels:catalog.channels,
                vod:preview.vod.map((group,i)=>({id:`preview-vod-${i}`,name:group,group,url:""})),
                series:preview.series.map((group,i)=>({id:`preview-series-${i}`,name:group,group,seasons:[]})),
              };
              contentSelection=await requestCategorySelection(pickerCatalog);
              if(contentSelection) liveCatalog=applyContentSelection(liveCatalog as any,contentSelection) as any;
            }
            await updatePlaylist(id,{
              channels:liveCatalog.channels,
              contentSelection,
              catalogCapabilities:{live:liveCatalog.channels.length?"supported":"empty",vod:"empty",series:"empty",updatedAt:new Date().toISOString()},
              catalogSync:{initialSyncState:"live_ready",roomVerified:true,updatedAt:new Date().toISOString()},
              lastRefreshOk:true,lastRefreshedAt:new Date().toISOString(),
            });
            void recordDiagnostic("catalog","STALKER_LIVE_BOOTSTRAP_COMMIT_OK",{playlistId:id,live:liveCatalog.channels.length});
            await updatePlaylist(id,{catalogSync:{initialSyncState:"enriching",roomVerified:true,updatedAt:new Date().toISOString()}});
            const enrich=await stalkerEnrichment(cred,session);
            const selected=contentSelection ? applyContentSelection({channels:[],vod:enrich.vod,series:enrich.series} as any,contentSelection) : {channels:[],vod:enrich.vod,series:enrich.series};
            await enrichPlaylistMedia(id,{vod:selected.vod,series:selected.series});
            await updatePlaylist(id,{
              catalogCapabilities:{live:liveCatalog.channels.length?"supported":"empty",vod:selected.vod.length?"supported":"empty",series:selected.series.length?"supported":"empty",updatedAt:new Date().toISOString()},
              catalogSync:{initialSyncState:"ready",roomVerified:true,updatedAt:new Date().toISOString()},
              lastRefreshOk:true,lastRefreshedAt:new Date().toISOString(),
            });
            void recordDiagnostic("catalog","STALKER_INITIAL_SYNC_READY",{playlistId:id,live:liveCatalog.channels.length,vod:selected.vod.length,series:selected.series.length});
          } catch(e:any) {
            const message=String(e?.message||e);
            try { await updatePlaylist(id,{catalogSync:{initialSyncState:"partial_error",initialSyncError:message,roomVerified:true,updatedAt:new Date().toISOString()},lastRefreshOk:false,lastRefreshedAt:new Date().toISOString()}); } catch {}
            void recordDiagnostic("catalog","STALKER_INITIAL_SYNC_PARTIAL_ERROR",{playlistId:id,message,status:e?.status,kind:e?.kind});
          }
        };

        if (chooseCategories) {
          setProgress("Hesap kaydedildi · kategori başlıkları hazırlanıyor...");
          await bootstrap(true);
        } else {
          void bootstrap(false);
        }

        await new Promise<void>((resolve)=>Alert.alert(
          "MAG Portal Eklendi",
          "Hesap doğrulandı ve cihaza kaydedildi. Canlı TV, film ve diziler ayrı senkron aşamalarında tamamlanacak; bu işlem hesabın eklenmesini artık engellemez.",
          [{text:"Listeye Git",onPress:()=>resolve()}],
          {cancelable:false},
        ));
        router.replace("/(tabs)");
        return;
      }
    } catch (e: any) {
      const message = e.message || "Bilinmeyen hata";
      if (method === "stalker") void recordDiagnostic("catalog", "STALKER_ADD_ERROR", { message });
      setError(message);
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

          {loading&&<CatalogProgressCards progress={catalogProgress}/>}
          {(method==="code"||method==="bulk")&&<PanelScopePicker scope={sourceScope} target={panelTarget} directory={filterDirectory(panelDirectory,sourceScope)} busy={loading||directoryLoading} onScope={setSourceScope} onTarget={setPanelTarget} onLoad={()=>void loadPanelDirectory()}/>}
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
                      {/* v17.4.0: toplam / gösterilen / seçilen sayıları ayrı ayrı görünür. */}
                      <View style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs }}>
                          {`Toplam ${panelDirectory.length} panel · eşleşen ${matchedPanels.length} · gösterilen ${filteredPanels.length}`}
                        </Text>
                      </View>
                      {filteredPanels.length === 0 ? (
                        <Text style={{ color: colors.onSurfaceSecondary, padding: SPACING.md }}>
                          {panelSearch.trim() ? "Aramanıza uyan panel yok. Farklı bir ad, kod veya DNS deneyin." : "Eşleşen panel bulunamadı."}
                        </Text>
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
                              {item.code?`Sunucu kodu: ${item.code}`:"MasterIPTV · Kod yok"} · {item.hosts.length} adres
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={colors.brandPrimary} />
                        </FocusButton>
                      ))}
                    </View>
                  )}
                  {/**
                    * v17.4.0: Eski metin "İlk 100 panel gösteriliyor" diyordu ve geri
                    * kalanına ulaşmanın tek yolu adını BİLMEKti. Artık kalanlar
                    * kademeli olarak açılır; kumandayla da erişilebilir.
                    */}
                  {matchedPanels.length > filteredPanels.length && (
                    <FocusButton
                      testID="panel-directory-show-more"
                      focusable
                      onPress={() => setPanelVisibleCount(c => c + 200)}
                      style={{ paddingVertical: SPACING.md, alignItems: "center", borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, marginTop: SPACING.sm }}
                    >
                      <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}>
                        {`Daha fazla göster (${matchedPanels.length - filteredPanels.length} panel daha)`}
                      </Text>
                    </FocusButton>
                  )}
                  {matchedPanels.length > 0 && matchedPanels.length === filteredPanels.length && panelDirectory.length > 100 && (
                    <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: SPACING.xs }}>
                      Tüm paneller gösteriliyor. Ad, kod veya DNS yazarak daraltabilirsiniz.
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
              <FocusButton
                testID="bulk-custom-concurrency-toggle"
                focusable
                onPress={() => setBulkCustomConcurrencyEnabled(v => !v)}
                style={[styles.fileBtn, { marginTop: SPACING.md, backgroundColor: bulkCustomConcurrencyEnabled ? colors.brandPrimary + "18" : colors.surfaceSecondary, borderColor: bulkCustomConcurrencyEnabled ? colors.brandPrimary : colors.border }]}
              >
                <Ionicons name="options-outline" size={20} color={bulkCustomConcurrencyEnabled ? colors.brandPrimary : colors.onSurfaceSecondary} />
                <Text style={[styles.fileText, { color: colors.onSurface }]}>Özel paralellik {bulkCustomConcurrencyEnabled ? "açık" : "kapalı"}</Text>
              </FocusButton>
              {bulkCustomConcurrencyEnabled && (
                <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, marginBottom: 5 }}>İstenen paralellik (1–250)</Text>
                    <TextInput
                      testID="bulk-requested-concurrency-input"
                      value={bulkRequestedConcurrency}
                      onChangeText={v => setBulkRequestedConcurrency(v.replace(/[^0-9]/g, "").slice(0, 3))}
                      keyboardType="number-pad"
                      placeholder="32"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, marginBottom: 5 }}>Parti boyutu (5–15)</Text>
                    <TextInput
                      testID="bulk-batch-size-input"
                      value={bulkBatchSize}
                      onChangeText={v => setBulkBatchSize(v.replace(/[^0-9]/g, "").slice(0, 2))}
                      keyboardType="number-pad"
                      placeholder="15"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                    />
                  </View>
                </View>
              )}
              <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: 6, lineHeight: 17 }}>
                v17.1 motoru hesapları varsayılan 15'lik partiler halinde işler. İstenen paralellik 250'ye kadar ayarlanabilir; cihazın bellek sınıfına göre güvenli etkin worker sayısı ayrıca sınırlandırılır ve tarama ekranında gösterilir.
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
              <FocusButton testID="bulk-pick-file-btn" focusable={!bulkFilePicking} disabled={bulkFilePicking} onPress={pickBulkFile} style={[styles.fileBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, opacity: bulkFilePicking ? 0.65 : 1 }]}>
                {bulkFilePicking ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Ionicons name="document-attach" size={22} color={colors.brandPrimary} />}
                <Text style={[styles.fileText, { color: colors.onSurface }]} numberOfLines={1}>{bulkFilePicking ? (bulkFilePhase === "reading" ? "Dosya okunuyor…" : bulkFilePhase === "parsing" ? "Hesaplar ayrıştırılıyor…" : "Dosya seçici açık…") : (bulkFileName || "CSV / TXT / JSON dosyası seç")}</Text>
              </FocusButton>

              {/**
                * v17.5.0 — ARŞİVDEN GERİ YÜKLE.
                * Kaydedilen TXT arşivi buradan okunur; hesaplar seçmeli listeye
                * düşer ve kullanıcı istediği kadarını seçip ekler.
                */}
              <FocusButton
                testID="bulk-restore-archive-btn"
                focusable={!archiveRestoring}
                disabled={archiveRestoring || bulkFilePicking}
                onPress={restoreFromArchive}
                style={[styles.fileBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.brandPrimary, opacity: archiveRestoring ? 0.65 : 1, marginTop: SPACING.sm }]}
              >
                <Ionicons name="archive-outline" size={18} color={colors.brandPrimary} />
                <Text style={[styles.fileText, { color: colors.brandPrimary }]} numberOfLines={1}>
                  {archiveRestoring ? "Arşiv okunuyor…" : "KIZILKAN arşivinden geri yükle (TXT)"}
                </Text>
              </FocusButton>
              {bulkFileLoaded && (
                <FocusButton focusable onPress={() => { setBulkFileLoaded(false); setBulkFileParsed(null); setBulkFileStreamSource(null); setBulkFileName(""); }} style={{ alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 4 }}>
                  <Text style={{ color: colors.error, fontWeight: FONT.weight.semibold }}>Dosyayı kaldır</Text>
                </FocusButton>
              )}
              {bulkFileStreamSource && (
                <View style={[styles.bulkPreview, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <FocusButton focusable onPress={() => setBulkPreviewOpen(v => !v)} style={styles.bulkPreviewHeader}>
                    <Ionicons name="flash" size={20} color={colors.brandPrimary} />
                    <Text style={{ color: colors.onSurface, flex: 1, fontWeight: FONT.weight.bold }}>Native streaming dosya · ilk {bulkFileStreamSource.samples.length} hesap örneği</Text>
                    <Ionicons name={bulkPreviewOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.onSurfaceSecondary} />
                  </FocusButton>
                  {bulkPreviewOpen && <View style={{ gap:7, marginTop:SPACING.sm }}>
                    {bulkFileStreamSource.samples.map(a => <View key={`stream-${a.row}-${a.username}`} style={{ borderTopWidth:StyleSheet.hairlineWidth, borderTopColor:colors.border, paddingTop:7 }}>
                      <Text style={{ color:colors.onSurface, fontWeight:FONT.weight.semibold }}>{a.name || `Hesap ${a.row}`} · {a.username}</Text>
                      <Text style={{ color:colors.onSurfaceSecondary, fontSize:FONT.size.xs, marginTop:2 }}>{bulkAccountLocatorLabel(a)}</Text>
                    </View>)}
                    <Text style={{ color:colors.onSurfaceTertiary, fontSize:FONT.size.xs }}>Dosyanın tamamı JS belleğine alınmayacak; tarama sırasında native olarak satır satır okunacak.</Text>
                    {bulkFileStreamSource.warnings.slice(0,4).map((w,i)=><Text key={i} style={{ color:colors.error, fontSize:FONT.size.xs }}>⚠ {w}</Text>)}
                  </View>}
                </View>
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

          {method === "bulk" && (loading || bulkScanFinished || bulkCandidates.length > 0) && !showBulkCandidates && (
            <FocusButton focusable onPress={() => { bulkResultsDismissedRef.current = false; setShowBulkCandidates(true); }} style={[styles.selectionCard,{backgroundColor:colors.surfaceSecondary,borderColor:colors.brandPrimary}]}>
              <Text style={{color:colors.onSurface,fontWeight:"700"}}>Tarama durumunu ve sonuçlarını aç · {bulkCandidates.length} bulunan</Text>
            </FocusButton>
          )}

          {loading && progress && (
            <View style={[styles.progressBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.brandPrimary} />
              <Text style={[styles.progressText, { color: colors.onSurface }]}>{progress}</Text>
            </View>
          )}

          {method !== "code" && method !== "bulk" && (
            <View style={[styles.selectionCard,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}>
              <View style={{flex:1}}>
                <Text style={[styles.selectionTitle,{color:colors.onSurface}]}>İçerik kategorilerini seç</Text>
                <Text style={[styles.selectionHint,{color:colors.onSurfaceSecondary}]}>İsteğe bağlı. Açılırsa gerçek kategori/gruplardan seçim yapılır; yalnız seçilen içerik kaydedilir. Tercih sonraki yenilemelerde korunur.</Text>
              </View>
              <FocusButton testID="category-selection-toggle" onPress={()=>setChooseCategories(v=>!v)} style={[styles.toggleChip,{borderColor:chooseCategories?colors.brandPrimary:colors.border}]}>
                <Text style={{color:chooseCategories?colors.brandPrimary:colors.onSurfaceSecondary,fontWeight:"700"}}>{chooseCategories?"AÇIK":"KAPALI"}</Text>
              </FocusButton>
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
          /**
           * v16.5.0 — MAG EKLEME "GİZLİ" GÖRÜNÜYORDU.
           * Koşulda !!progress vardı: ilerleme metni henüz üretilmemişken
           * (handshake/ilk istek aşaması) katman AÇILMIYOR, kullanıcı hiçbir
           * şey görmüyor ve "Kaydet ve Yükle"ye tekrar tekrar basabiliyordu.
           * Artık işlem başlar başlamaz görünür; metin gelene kadar
           * "Bağlanılıyor…" yazar.
           */
          visible={loading && method === "stalker"}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.matchModalBackdrop}>
            <View style={[styles.matchModalCard, { backgroundColor: colors.surface, borderColor: colors.border, maxWidth: 520 }]}>
              <View style={{ alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.md }}>
                <ActivityIndicator size="large" color={colors.brandPrimary} />
                <Text style={[styles.matchModalTitle, { color: colors.onSurface, textAlign: "center" }]}>MAG Portal hazırlanıyor</Text>
                <Text style={{ color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 21 }}>{progress || "Portala bağlanılıyor… Lütfen bekleyin, tekrar dokunmayın."}</Text>
                <Text style={{ color: colors.onSurfaceTertiary, textAlign: "center", fontSize: FONT.size.sm }}>Bu ekran bağlantı, katalog ve cihaz kayıt aşamalarını canlı gösterir.</Text>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showBulkCandidates}
          transparent
          animationType="fade"
          onRequestClose={() => { if (!bulkAdding) { bulkResultsDismissedRef.current = true; if (bulkScanFinished) void acknowledgeBulkScanResult(); setShowBulkCandidates(false); } }}
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
                  <Text style={[styles.bulkFoundTotal,{ color: bulkCandidates.length > 0 ? colors.brandPrimary : colors.onSurfaceSecondary }]}>
                    Bulunan {bulkCandidates.length}
                  </Text>
                </View>
                <FocusButton focusable disabled={bulkAdding} onPress={() => { bulkResultsDismissedRef.current = true; if (bulkScanFinished) void acknowledgeBulkScanResult(); setShowBulkCandidates(false); }} style={styles.matchCloseBtn}>
                  <Ionicons name="close" size={24} color={colors.onSurface} />
                </FocusButton>
              </View>

              {!!progress && (loading || bulkAdding || !bulkScanFinished) && (
                <View style={[styles.progressBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginBottom: SPACING.sm }]}>
                  <ActivityIndicator size="small" color={colors.brandPrimary} />
                  <Text style={{ color: colors.onSurfaceSecondary, flex: 1, fontSize: FONT.size.sm, lineHeight: 19 }}>{progress}</Text>
                </View>
              )}
              {bulkStreamProgress && <View accessibilityLiveRegion="polite" style={{marginBottom:SPACING.md,gap:6}}>
                <Text style={{color:colors.onSurface,fontWeight:FONT.weight.bold}}>{bulkStreamProgress.producerDone ? `${bulkStreamProgress.completed}/${bulkStreamProgress.read} hesap tamamlandı` : `${bulkStreamProgress.read} hesap okundu · ${bulkStreamProgress.completed} tamamlandı`}</Text>
                {bulkStreamProgress.producerDone&&bulkStreamProgress.read>0&&<View style={{height:8,borderRadius:5,backgroundColor:colors.surfaceSecondary,overflow:"hidden"}}><View style={{width:`${Math.min(100,Math.round(100*bulkStreamProgress.completed/bulkStreamProgress.read))}%`,height:8,backgroundColor:colors.brandPrimary}}/></View>}
                <Text style={{color:colors.onSurfaceSecondary}}>Denenen adres: {bulkStreamProgress.tested} · Bulunan: {bulkStreamProgress.found}{bulkStreamProgress.producerDone?"":" · Dosya okunurken kesin yüzde gösterilmez"}</Text>
              </View>}

              {/* v17.0.11: critical bulk controls stay outside/above the virtualized data body so account volume cannot clip them. */}
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

              {!bulkScanFinished && (
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

              <View style={{flexDirection:"row",gap:SPACING.sm,marginTop:SPACING.md,flexWrap:"wrap"}}>
                <FocusButton focusable disabled={bulkAdding || bulkCandidates.length===0} onPress={()=>setBulkUseAllValidatedHosts(v=>!v)}
                  style={[styles.bulkBtn,{borderColor:colors.border,backgroundColor:colors.surfaceSecondary}]}>
                  <Text style={{color:colors.onSurface,fontWeight:FONT.weight.bold}}>DNS: {bulkUseAllValidatedHosts?"Tüm Çalışanlar":"Yalnız Seçilenler"}</Text>
                </FocusButton>
                <FocusButton focusable disabled={bulkAdding || selectedBulkCandidateKeys.length===0 || !bulkScanFinished} onPress={chooseBulkArchiveMode}
                  style={[styles.bulkBtn,{borderColor:colors.brandPrimary,backgroundColor:colors.surfaceSecondary,opacity:selectedBulkCandidateKeys.length&&bulkScanFinished?1:0.5}]}>
                  <Text style={{color:colors.brandPrimary,fontWeight:FONT.weight.bold}}>TXT'ye Kaydet</Text>
                </FocusButton>
              </View>

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

              <SectionList
                style={styles.bulkScrollableBody}
                sections={[
                  { title: "accounts", data: bulkAccountProgress.map(a => ({ kind: "account" as const, value: a })) },
                  { title: "candidates", data: bulkCandidates.map(c => ({ kind: "candidate" as const, value: c })) },
                ] as any}
                keyExtractor={(item:any) => item.kind === "account" ? `bulk-progress-${item.value.accountIndex}` : `bulk-candidate-${item.value.key}`}
                initialNumToRender={18}
                maxToRenderPerBatch={24}
                windowSize={7}
                removeClippedSubviews={false}
                contentContainerStyle={{ gap: 6, paddingBottom: SPACING.sm }}
                renderSectionHeader={({section}) => section.title === "candidates" ? (
                  <Text style={[styles.bulkSectionTitle,{color:colors.onSurface}]}>Bulunan Hesaplar ({bulkCandidates.length})</Text>
                ) : bulkAccountProgress.length > 0 ? (
                  <Text style={[styles.bulkSectionTitle,{color:colors.onSurface}]}>Hesap İlerlemesi ({bulkAccountProgress.length})</Text>
                ) : null}
                renderItem={({item,index}:any) => {
                  if (item.kind === "account") {
                    const a = item.value;
                    const pct = a.total ? Math.round((a.tested / a.total) * 100) : 0;
                    const label = a.name || `Hesap ${a.sourceRow || a.accountIndex + 1}`;
                    return <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, borderRadius: RADIUS.md, padding: 9 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                        <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.semibold, flex: 1 }} numberOfLines={1}>{label}</Text>
                        <Text style={{ color: a.state === "completed" ? colors.success : colors.brandPrimary, fontWeight: FONT.weight.bold, fontSize: FONT.size.lg }}>{a.state === "completed" ? "✓" : `${pct}%`}</Text>
                      </View>
                      <View style={styles.bulkAccountMetaRow}>
                        <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, flex: 1 }}>Adres {a.tested}/{a.total} · Kalan {a.remaining} · {a.state === "completed" ? "Tamamlandı" : a.state === "running" ? "Analiz ediliyor" : "Bekliyor"}</Text>
                        <Text style={[styles.bulkFoundBadgeText,{color:a.found > 0 ? colors.brandPrimary : colors.onSurfaceTertiary}]}>Bulunan {a.found}</Text>
                      </View>
                    </View>;
                  }
                  const c = item.value;
                  const selected = selectedBulkCandidateKeys.includes(c.key);
                  const ui = c.login?.user_info || {};
                  const status = String(ui.status || (ui.auth === 1 || ui.auth === "1" ? "Aktif" : "Bilinmiyor"));
                  const importState = bulkImportStatuses[c.key];
                  return <FocusButton focusable autoFocus={index===0} disabled={bulkAdding}
                    onPress={() => setSelectedBulkCandidateKeys(prev => selected ? prev.filter(k=>k!==c.key) : [...prev,c.key])}
                    style={[styles.matchRow,{ backgroundColor:selected?colors.brandPrimary+"14":colors.surfaceSecondary,borderColor:selected?colors.brandPrimary:colors.border }]}>
                    <View style={{flex:1}}>
                      <Text style={{color:colors.onSurface,fontWeight:FONT.weight.bold}}>{c.name || c.panelName}</Text>
                      <Text style={{color:colors.onSurfaceSecondary,marginTop:2}}>Kullanıcı: {c.username} · Durum: {status}</Text>
                      <Text style={{color:colors.onSurfaceSecondary,marginTop:2}}>Panel: {c.panelName}{c.code ? ` · Kod: ${c.code}` : ""}</Text>
                      {/**
                        * v17.4.2 — ABONELİK BİLGİLERİ KARTTA GÖRÜNÜYOR (kullanıcı isteği)
                        * accountSummary() bu değerleri zaten hesaplıyordu (durum, bitiş
                        * tarihi, aktif/maksimum bağlantı) ama YALNIZ tek hesap eşleşme
                        * ekranında kullanılıyordu; çoklu hesap kartlarında yoktu.
                        * Kullanıcı hangi aboneliği seçeceğine karar verebilmek için
                        * bitiş tarihini ve kaç kullanıcılı olduğunu görmek istiyor.
                        * Süresi geçmiş abonelikler kırmızı gösterilir.
                        */}
                      {(() => {
                        const ui = (c as any).login?.user_info || {};
                        const expRaw = ui.exp_date;
                        const expNum = Number(expRaw);
                        const expired = Number.isFinite(expNum) && expNum > 0 && expNum * 1000 < Date.now();
                        const expText = formatExpiry(expRaw);
                        const daysLeft = Number.isFinite(expNum) && expNum > 0
                          ? Math.ceil((expNum * 1000 - Date.now()) / 86400000) : null;
                        const maxCon = ui.max_connections ?? "?";
                        const activeCon = ui.active_cons ?? ui.active_connections ?? "?";
                        const trial = ui.is_trial === "1" || ui.is_trial === 1;
                        return (
                          <Text style={{ color: expired ? colors.error : colors.onSurfaceSecondary, marginTop: 2, fontSize: FONT.size.xs }}>
                            {`Bitiş: ${expText}`}
                            {daysLeft !== null ? (expired ? " · SÜRESİ GEÇMİŞ" : ` · ${daysLeft} gün`) : ""}
                            {` · Bağlantı: ${activeCon}/${maxCon}`}
                            {trial ? " · DENEME" : ""}
                          </Text>
                        );
                      })()}
                      <Text style={{color:colors.onSurfaceTertiary,marginTop:2,fontSize:FONT.size.xs}}>{c.server}</Text>
                      {!!importState && <Text style={{color: importState.state === "failed" ? colors.error : importState.state === "completed" ? colors.success : colors.brandPrimary, marginTop:6, fontSize:FONT.size.xs, fontWeight:FONT.weight.bold}}>{importState.state === "completed" ? "✓ " : importState.state === "failed" ? "✕ " : "• "}{importState.message}{importState.state === "completed" ? ` · ${importState.channels || 0} kanal · ${importState.vod || 0} film · ${importState.series || 0} dizi` : ""}</Text>}
                    </View>
                    <Ionicons name={selected?"checkbox":"square-outline"} size={26} color={selected?colors.brandPrimary:colors.onSurfaceTertiary}/>
                  </FocusButton>;
                }}
                ListFooterComponent={bulkScanFailures.length > 0 ? <View style={[styles.infoBanner,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}><Ionicons name="warning-outline" size={18} color={colors.error}/><Text style={{color:colors.onSurfaceSecondary,flex:1,fontSize:FONT.size.sm}}>Sonuç bulunamayanlar: {bulkScanFailures.slice(0,4).join(" · ")}{bulkScanFailures.length>4?` · +${bulkScanFailures.length-4} kayıt`:""}</Text></View> : null}
              />            </View>
          </View>
        </Modal>

        <Modal
          visible={showDiscoveryMatches}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!nativeScanRunning && !bulkAdding) { void acknowledgeDiscoveryResult(); setShowDiscoveryMatches(false); }
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
                    if (!nativeScanRunning && !bulkAdding) { void acknowledgeDiscoveryResult(); setShowDiscoveryMatches(false); }
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
                          {m.code?`Sunucu kodu: ${m.code}`:"Panel adına bağlı hesap"}
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
                        makeBinding(preferred.code,preferred.panelName,preferred.server,validatedHosts,preferred.sources),
                        false
                      );
                      if(added) ok++; else failed.push(displayName);
                    }
                    void acknowledgeDiscoveryResult(); setShowDiscoveryMatches(false); setDiscoveryMatches([]); setSelectedDiscoveryKeys([]);
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
      {/**
        * v16.1.0 — ENGELLEYİCİ İLERLEME KATMANI
        * -------------------------------------------------------------------
        * SORUN (kullanıcı bildirimi): "MAG portal eklenirken kullanıcıya
        * herhangi bir bilgi verilmiyor, kullanıcı olmadı deyip Kaydet ve
        * Yükle'ye defalarca basabiliyor."
        * Düğmede disabled={loading} vardı ve ilerleme metni yazılıyordu, ama
        * metin sayfanın altında kaldığı için görünmüyordu; kullanıcı işlemin
        * sürdüğünü anlamıyordu. Bu katman EKRANI KAPLAR: hem durumu net
        * gösterir hem de arkadaki düğmelere basılmasını fiziksel olarak
        * engeller (her basış yeni bir ağır MAG işlemi başlatıyordu).
        */}
      <Modal
        visible={bulkArchiveNameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!bulkArchiveSaving) setBulkArchiveNameOpen(false); }}
      >
        <View style={styles.categoryOverlay}>
          <View style={[styles.categoryModal,{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border}]}>
            <Text style={[styles.categoryModalTitle,{color:colors.onSurface}]}>TXT Dosya Adı</Text>
            <Text style={[styles.selectionHint,{color:colors.onSurfaceSecondary,marginBottom:SPACING.md}]}>
              {bulkArchiveSafe ? "Güvenli rapor" : "Tam arşiv"} için dosya adını değiştirebilirsiniz. .txt yazmanız gerekmez; uygulama doğru uzantıyı ekler.
            </Text>
            <TextInput
              value={bulkArchiveFileName}
              onChangeText={setBulkArchiveFileName}
              editable={!bulkArchiveSaving}
              autoCapitalize="none"
              autoCorrect={false}
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={confirmBulkArchiveName}
              placeholder="KIZILKAN-HESAP-ARSIVI"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={{borderWidth:1,borderColor:colors.border,borderRadius:10,paddingHorizontal:12,paddingVertical:11,color:colors.onSurface,backgroundColor:colors.surfaceSecondary,fontSize:FONT.size.base}}
            />
            <Text style={{color:colors.onSurfaceTertiary,fontSize:FONT.size.xs,marginTop:SPACING.xs}}>Kaydedilecek uzantı: .txt</Text>
            <View style={styles.categoryActions}>
              <FocusButton disabled={bulkArchiveSaving} onPress={()=>setBulkArchiveNameOpen(false)} style={[styles.categoryAction,{borderColor:colors.border,opacity:bulkArchiveSaving?0.5:1}]}><Text style={{color:colors.onSurface}}>İptal</Text></FocusButton>
              <FocusButton disabled={bulkArchiveSaving} onPress={confirmBulkArchiveName} style={[styles.categoryAction,{backgroundColor:colors.brandPrimary,opacity:bulkArchiveSaving?0.6:1}]}>
                {bulkArchiveSaving?<ActivityIndicator color={colors.onBrandPrimary}/>:<Text style={{color:colors.onBrandPrimary,fontWeight:"800"}}>Klasör Seç ve Kaydet</Text>}
              </FocusButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* v16.5.0: MAG için üstteki özel katman var; burada çift göstermiyoruz. */}
      <Modal visible={loading && method !== "stalker"} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)", alignItems: "center", justifyContent: "center", padding: SPACING.lg }}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <Text style={{ color: colors.onSurface, fontSize: FONT.size.lg, fontWeight: "700", marginTop: SPACING.lg, textAlign: "center" }}>
            {method === "stalker" ? "MAG Portal ekleniyor" : "Liste ekleniyor"}
          </Text>
          <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm, marginTop: SPACING.sm, textAlign: "center", lineHeight: 20 }}>
            {progress || "Hazırlanıyor…"}
          </Text>
          {/**
            * v17.7.0 — TOPLU EKLEMEDE İLERLEME GÖRÜNÜYOR
            * -------------------------------------------------------------------
            * Kullanıcı bildirimi: "büyük miktarda yedek dosyasından liste
            * eklerken takılı kaldı." Ekranda yalnız "Hazırlanıyor…" yazıyordu;
            * 49 listeden kaçının bittiği görünmediği için işlem sürerken bile
            * takılmış sanılıyordu.
            * Veri zaten vardı (bulkImportStatuses), sadece gösterilmiyordu.
            */}
          {(() => {
            const rows = Object.values(bulkImportStatuses || {}) as any[];
            if (!rows.length) return null;
            const done = rows.filter(r => r?.state === "completed").length;
            const failed = rows.filter(r => r?.state === "failed").length;
            const running = rows.find(r => r?.state === "running" || r?.state === "importing");
            const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
            return (
              <View style={{ marginTop: SPACING.md, width: "100%", maxWidth: 420 }}>
                <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.base, fontWeight: FONT.weight.bold, textAlign: "center" }}>
                  {`${done}/${rows.length} liste tamamlandı`}{failed ? ` · ${failed} başarısız` : ""}
                </Text>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: SPACING.sm, overflow: "hidden" }}>
                  <View style={{ height: "100%", width: `${pct}%`, backgroundColor: colors.brandPrimary }} />
                </View>
                {!!running && (
                  <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, marginTop: SPACING.xs, textAlign: "center" }} numberOfLines={2}>
                    {String(running.message || "İçerik indiriliyor…").slice(0, 90)}
                  </Text>
                )}
              </View>
            );
          })()}
          <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: SPACING.lg, textAlign: "center" }}>
            Lütfen bekleyin — işlem sürerken tekrar dokunmayın.
          </Text>
          {/**
            * v17.8.0 — KAÇIŞ YOLU. Kullanıcı bu katmanda SIKIŞIYORDU: kapatma
            * düğmesi yoktu, geri tuşu hiçbir şey yapmıyordu. Toplu eklemede
            * durdurma düğmesi gösterilir; tamamlanan listeler korunur.
            */}
          {bulkAdding && (
            <FocusButton
              testID="bulk-import-cancel-btn"
              focusable
              onPress={() => {
                const completedNow = Object.values(bulkImportStatuses || {}).filter((r: any) => r?.state === "completed").length;
                /**
                 * v17.8.0 — DURAKLAT / TAMAMEN İPTAL
                 * "Duraklat" bekleyen listeyi KORUR: "Liste ekle" ekranı bir
                 * sonraki açılışta kalanlarla devam etmeyi önerir.
                 * "Tamamen iptal" bekleyen listeyi siler.
                 * Her iki durumda da tamamlanan listeler korunur.
                 */
                Alert.alert("Eklemeyi durdur?", `Tamamlanan ${completedNow} liste korunur.`, [
                  { text: "Devam et", style: "cancel" },
                  { text: "Duraklat", onPress: async () => {
                    void recordDiagnostic("scan", "BULK_IMPORT_USER_PAUSED", { completed: completedNow });
                    bulkPauseRequestedRef.current = true;
                    try { await KizilkanNativeCore.cancelBulkImport(); } catch {}
                    // Bekleyen liste bilerek SİLİNMEZ — sonra devam edilebilir.
                    setLoading(false); setBulkAdding(false);
                    Alert.alert("Duraklatıldı", "\"Liste ekle\" ekranını tekrar açtığınızda kalan listelerle devam edebilirsiniz.");
                  } },
                  { text: "Tamamen iptal", style: "destructive", onPress: async () => {
                    void recordDiagnostic("scan", "BULK_IMPORT_USER_CANCELLED", { completed: completedNow });
                    try { await KizilkanNativeCore.cancelBulkImport(); } catch {}
                    try { await storage.secureRemove(PENDING_BULK_IMPORT_KEY); } catch {}
                    setLoading(false); setBulkAdding(false); setBulkImportStatuses({});
                  } },
                ]);
              }}
              style={{ marginTop: SPACING.lg, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold }}>Eklemeyi Durdur</Text>
            </FocusButton>
          )}
        </View>
      </Modal>
      <Modal visible={!!categoryPicker} transparent animationType="fade" onRequestClose={()=>finishCategorySelection(null)}>
        <View style={styles.categoryOverlay}><View style={[styles.categoryModal,{backgroundColor:colors.surface}]}>
          <Text style={[styles.categoryModalTitle,{color:colors.onSurface}]}>İçerik / Kategori Seçimi</Text>
          <Text style={[styles.selectionHint,{color:colors.onSurfaceSecondary}]}>Varsayılan: tümü. Bir başlığı kapatabilir veya alt kategorileri tek tek değiştirebilirsiniz.</Text>
          <ScrollView style={{maxHeight:460}}>
            {categoryPicker && ([['live','Canlı TV'],['vod','Film'],['series','Dizi']] as const).map(([kind,label])=>{
              const enabled=categoryPicker.selection[kind]; const key=(kind+'Categories') as 'liveCategories'|'vodCategories'|'seriesCategories';
              const selected=categoryPicker.selection[key]; const cats=categoryPicker.categories[kind];
              return <View key={kind} style={styles.categorySection}>
                <FocusButton onPress={()=>setCategoryPicker(p=>p?{...p,selection:{...p.selection,[kind]:!enabled}}:p)} style={styles.categoryHeader}>
                  <Text style={[styles.selectionTitle,{color:enabled?colors.brandPrimary:colors.onSurfaceSecondary}]}>{enabled?'☑':'☐'} {label} ({cats.length})</Text>
                </FocusButton>
                {enabled && cats.map(cat=>{const on=selected===null||selected.includes(cat); return <FocusButton key={kind+cat} onPress={()=>setCategoryPicker(p=>{if(!p)return p; const cur=p.selection[key]===null?[...p.categories[kind]]:[...(p.selection[key]||[])]; const next=cur.includes(cat)?cur.filter(x=>x!==cat):[...cur,cat]; return {...p,selection:{...p.selection,[key]:next,updatedAt:new Date().toISOString()}}})} style={styles.categoryRow}><Text style={{color:on?colors.onSurface:colors.onSurfaceSecondary}}>{on?'☑':'☐'} {cat}</Text></FocusButton>})}
              </View>;
            })}
          </ScrollView>
          <View style={styles.categoryActions}>
            <FocusButton onPress={()=>finishCategorySelection(null)} style={[styles.categoryAction,{borderColor:colors.border}]}><Text style={{color:colors.onSurface}}>İptal</Text></FocusButton>
            <FocusButton onPress={()=>categoryPicker&&finishCategorySelection({...categoryPicker.selection,updatedAt:new Date().toISOString()})} style={[styles.categoryAction,{backgroundColor:colors.brandPrimary}]}><Text style={{color:'#fff',fontWeight:'800'}}>Seçimi Uygula</Text></FocusButton>
          </View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  selectionCard:{flexDirection:"row",alignItems:"center",gap:12,borderWidth:1,borderRadius:12,padding:14,marginTop:16},
  selectionTitle:{fontSize:15,fontWeight:"800"}, selectionHint:{fontSize:12,lineHeight:17,marginTop:4}, toggleChip:{borderWidth:1,borderRadius:10,paddingHorizontal:12,paddingVertical:9},
  categoryOverlay:{flex:1,backgroundColor:"rgba(0,0,0,0.72)",alignItems:"center",justifyContent:"center",padding:18}, categoryModal:{width:"100%",maxWidth:680,borderRadius:16,padding:18}, categoryModalTitle:{fontSize:20,fontWeight:"900",marginBottom:4}, categorySection:{marginTop:14}, categoryHeader:{paddingVertical:8}, categoryRow:{paddingVertical:7,paddingHorizontal:10}, categoryActions:{flexDirection:"row",justifyContent:"flex-end",gap:10,marginTop:16}, categoryAction:{borderWidth:1,borderRadius:10,paddingHorizontal:16,paddingVertical:11},
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
    maxHeight: "92%",
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  bulkScrollableBody: { flexGrow: 0, flexShrink: 1, minHeight: 120, marginTop: SPACING.sm },
  bulkSectionTitle: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold, marginTop: 4, marginBottom: 2 },
  bulkFoundTotal: { marginTop: 7, fontSize: FONT.size.xl, lineHeight: 30, fontWeight: FONT.weight.bold },
  bulkAccountMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  bulkFoundBadgeText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
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
