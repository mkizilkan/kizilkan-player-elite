/**
 * KIZILKAN PLAYER v18.7.0 — ÇOKLU MAC (MAG) EKLEME EKRANI.
 * ===========================================================================
 * Xtream combo (çoklu hesap) taramasının MAG karşılığı: kullanıcı birden fazla portal
 * adresini (DNS:port, http/https olmadan da) ve birden fazla MAC'i (liste veya aralık) girer;
 * her (portal × MAC) taranır, yalnız GEÇERLİ hesaplar eklenir.
 *  • Port/portal bilinmiyorsa otomatik keşif (discoverMagPortal).
 *  • Rehberden host: kod / panel adı / tümü (fetchPanelDirectory + filterDirectory).
 *  • Proxy'li tarama (ScanProxyToggleRow → native proxy havuzu, rotasyonlu).
 *  • Duraklat / Devam / İptal.
 * YASAL: yalnız kullanıcının KENDİ MAC adresleri.
 * ===========================================================================
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Switch, Text, TextInput, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT, type ThemePalette } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import { ScanProxyToggleRow, ScanProxyLiveLine } from "@/src/components/ScanProxyControls";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useProfiles } from "@/src/store/ProfileContext";
import { formatAccountExpiry } from "@/src/utils/accountExpiry";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import { haptic } from "@/src/utils/haptic";
import type { Playlist } from "@/src/types";
import {
  parseMacList, expandMacRange, parsePortalHosts, buildMagBulkJobs, MAG_MAX_MACS, MAG_MAX_PARALLEL, magAccountIdentity, formatMagArchiveTxt,
  type MagHostEntry, type MagDiscoveryScope, type MagArchiveEntry,
} from "@/src/utils/magBulk";
import { chooseMagPortals, createMagRequestGate, runMagBulkScan, type MagScanResult } from "@/src/utils/magBulkScan";
import { PanelScan } from "@/modules/panel-scan";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import type { MagPortalDiscovery } from "@/src/utils/magPortalDiscovery";

type HostMode = "manual" | "code" | "name" | "all";

const CATEGORY_META: Record<MagScanResult["category"], { label: string; color: (c: any) => string; icon: any }> = {
  unverified: { label: "Doğrulanamadı", color: c => c.onSurfaceTertiary, icon: "help-circle" },
  valid: { label: "Geçerli", color: c => c.success || "#2ecc71", icon: "checkmark-circle" },
  expired: { label: "Süresi dolmuş", color: c => c.warning || "#f39c12", icon: "time" },
  blocked: { label: "Yetkisiz/bloke", color: c => c.error, icon: "close-circle" },
  protected: { label: "Doğrulama/koruma", color: c => c.warning, icon: "shield" },
  "no-portal": { label: "Portal yok", color: c => c.onSurfaceTertiary, icon: "help-circle" },
  error: { label: "Hata", color: c => c.onSurfaceTertiary, icon: "alert-circle" },
};

// v18.7.2: analiz modları. Turbo hızlı ama portala baskı; Güvenli yavaş ama ban-dostu.
type ScanModeKey = "safe" | "balanced" | "turbo";
// v18.7.2: maxCandidates geniş port listesini kapsar (kapalı port hızlı reddedilir). Yol-öncelikli
// süpürmede /c/ + /portal.php'yi ~50 portta denemek için ~110 aday yeterli.
const SCAN_MODES: Record<ScanModeKey, { label: string; concurrency: number; timeoutMs: number; maxCandidates: number }> = {
  safe: { label: "Güvenli", concurrency: 2, timeoutMs: 8000, maxCandidates: Number.MAX_SAFE_INTEGER },
  balanced: { label: "Dengeli", concurrency: 4, timeoutMs: 6000, maxCandidates: Number.MAX_SAFE_INTEGER },
  turbo: { label: "Turbo", concurrency: 8, timeoutMs: 4000, maxCandidates: Number.MAX_SAFE_INTEGER },
};

const DISCOVERY_MODES: Record<MagDiscoveryScope, { label: string; hint: string }> = {
  exact: { label: "Yalnız girilen", hint: "Girilen port ve kurulum yolu korunur. /c/ arayüzünden aynı kurulumun gerçek API yolu çözülür; başka port denenmez." },
  fallback: { label: "Çalışmazsa diğerleri", hint: "Önce girilen port/yol ailesi keşfedilir. API bulunamazsa diğer adaylar yalnız bir kez denenir; MAC reddi yeniden keşif başlatmaz." },
  all: { label: "Tüm adaylarda keşif", hint: "Girilen ve yaygın port/yollar host başına bir kez keşfedilir. Bulunan API yollarından biri seçilir; MAC listesi yalnız bu yolda doğrulanır." },
};
type ResultFilter = "all" | "valid" | "not_observed" | "present" | "unknown";
function protectionLabel(r: MagScanResult): string {
  if (r.protection?.state === "present") return r.protection.kind === "rate_limit" ? "İstek sınırı gözlendi" : "Koruma gözlendi";
  return r.protection?.state === "not_observed" ? "Koruma görülmedi" : "Koruma belirlenemedi";
}

function stableId(prefix: string, identity: string): string {
  const key = String(identity || "").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `pl-${prefix}-${(h >>> 0).toString(16).padStart(8, "0")}`;
}
function magIdentity(portal: string, mac: string): string {
  return magAccountIdentity(portal, mac);
}

export default function MagBulkScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { playlists, addPlaylist, enrichPlaylistMedia, updatePlaylist } = usePlaylists();
  const { activeProfile } = useProfiles();
  const profileRef = useRef(activeProfile.id);
  const profileEpochRef = useRef(0);
  const resetProfileEpochRef = useRef(0);

  const [hostMode, setHostMode] = useState<HostMode>("manual");
  const [hostText, setHostText] = useState("");
  const [codeText, setCodeText] = useState("");
  const [macListText, setMacListText] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeCount, setRangeCount] = useState("");
  const [useRange, setUseRange] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  // v18.7.2: analiz modu (eşzamanlılık + zaman aşımı + aday sınırı profili) + elle paralel sayı.
  const [scanMode, setScanMode] = useState<ScanModeKey>("balanced");
  const [parallelText, setParallelText] = useState("");   // boş → mod varsayılanı
  const [discoveryScope, setDiscoveryScope] = useState<MagDiscoveryScope>("exact");
  const [portalChoiceMode, setPortalChoiceMode] = useState<"auto" | "manual">("auto");
  const [scanPhase, setScanPhase] = useState<"discovery" | "selection" | "accounts">("discovery");
  const [portalReports, setPortalReports] = useState<MagPortalDiscovery[]>([]);
  const [portalChoices, setPortalChoices] = useState<Record<string, string>>({});
  const portalChoicesRef = useRef<Record<string, string>>({});
  const portalPickerRef = useRef<{ finish: (choices: Record<string, string>) => void; cancel: () => void } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  const [scanning, setScanning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [stageMsg, setStageMsg] = useState("");
  const [results, setResults] = useState<MagScanResult[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionProgress, setActionProgress] = useState("");

  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const scanAbortRef = useRef<AbortController | null>(null);
  const actionAbortRef = useRef<AbortController | null>(null);
  const actionRunRef = useRef(0);
  const runRef = useRef(0);
  const resultBufferRef = useRef<MagScanResult[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Invalidate before passive effects: returning A -> B -> A must not revive
  // callbacks from the previous visit to A, even if their await completes now.
  if (profileRef.current !== activeProfile.id) {
    profileRef.current = activeProfile.id;
    profileEpochRef.current++; actionRunRef.current++; runRef.current++;
  }
  const profileEpoch = profileEpochRef.current;
  const flushResults = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    const batch = resultBufferRef.current.splice(0);
    if (!mountedRef.current || !batch.length) return;
    setResults(prev => [...prev, ...batch]);
    setSelected(prev => { const next = new Set(prev); for (const r of batch) if (r.category === "valid") next.add(magIdentity(r.portal, r.mac)); return next; });
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false; cancelRef.current = true; runRef.current++; actionRunRef.current++;
      scanAbortRef.current?.abort(); actionAbortRef.current?.abort();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      try { KizilkanNativeCore.setKeepScreenOn(false); } catch {}
    };
  }, []);
  useEffect(() => {
    if (profileEpoch !== profileEpochRef.current || resetProfileEpochRef.current === profileEpoch) return;
    resetProfileEpochRef.current = profileEpoch;
    scanAbortRef.current?.abort(); actionAbortRef.current?.abort();
    scanAbortRef.current = null; actionAbortRef.current = null;
    cancelRef.current = true; runRef.current++; busyRef.current = false;
    resultBufferRef.current = []; setResults([]); setSelected(new Set());
    setScanning(false); setAdding(false); setSaving(false); setPaused(false); setActionProgress("");
    setPortalReports([]); setPortalChoices({}); portalChoicesRef.current = {};
  }, [activeProfile.id, profileEpoch]);

  // Girişten iş listesi (önizleme sayıları).
  const parsed = useMemo(() => {
    const macList = parseMacList(macListText);
    const range = useRange ? expandMacRange(rangeStart, { count: Number(rangeCount || 0) }) : { macs: [], capped: false as boolean, error: undefined as string | undefined };
    const macSet = new Set<string>();
    const macs: string[] = [];
    for (const m of [...macList.macs, ...range.macs]) if (!macSet.has(m)) { macSet.add(m); macs.push(m); }
    const hostsParsed = parsePortalHosts(hostText);
    return { macs, invalidMacs: macList.invalid, rangeError: range.error, rangeCapped: range.capped, hosts: hostsParsed.hosts, invalidHosts: hostsParsed.invalid };
  }, [macListText, useRange, rangeStart, rangeCount, hostText]);

  const resolveHosts = useCallback(async (): Promise<MagHostEntry[]> => {
    if (hostMode === "manual") return parsed.hosts;
    // Rehberden host çöz (kod / panel adı / tümü). MAG portalları combo rehberindeki hostlardır.
    const { fetchPanelDirectory, filterDirectory, DEFAULT_CODE_SOURCE, CODE_SOURCE_KEY } = await import("@/src/utils/serverCode");
    const { storage } = await import("@/src/utils/storage");
    const src = (await storage.getItem<string>(CODE_SOURCE_KEY, DEFAULT_CODE_SOURCE)) || DEFAULT_CODE_SOURCE;
    const dir = await fetchPanelDirectory(src);
    const target = hostMode === "code" ? { codes: codeText.split(/[\s,;]+/).filter(Boolean) }
      : hostMode === "name" ? { names: codeText.split(/[\s,;]+/).filter(Boolean) }
      : {};
    const filtered = filterDirectory(dir, "all", target);
    const seen = new Set<string>();
    const out: MagHostEntry[] = [];
    for (const panel of filtered) for (const h of panel.hosts) {
      const key = h.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(...parsePortalHosts(h).hosts); }
    }
    return out;
  }, [hostMode, parsed.hosts, codeText]);

  const startScan = useCallback(async () => {
    if (busyRef.current) return;
    if (parsed.macs.length === 0) { Alert.alert("MAC yok", "En az bir geçerli MAC girin (liste veya aralık)."); return; }
    if (parsed.macs.length > MAG_MAX_MACS) { Alert.alert("Çok fazla MAC", `En fazla ${MAG_MAX_MACS} MAC taranabilir.`); return; }
    busyRef.current = true;
    const controller = new AbortController(); scanAbortRef.current = controller;
    const run = ++runRef.current;
    cancelRef.current = false; pauseRef.current = false;
    const mode = SCAN_MODES[scanMode];
    const parallel = parallelText.trim() ? Math.max(1, Math.min(MAG_MAX_PARALLEL, Number(parallelText) || mode.concurrency)) : mode.concurrency;
    resultBufferRef.current = []; setSelected(new Set()); setResultFilter("all");
    setPortalReports([]); setPortalChoices({}); portalChoicesRef.current = {}; setScanPhase("discovery");
    setPaused(false); setScanning(true); setResults([]); setStageMsg("Portal kaynağı hazırlanıyor…"); setProgress({ done: 0, total: 0, current: "" });
    // v18.7.6 (A2): tarama sürerken ekran/CPU uykuya geçmesin (cihaz uykusu taramayı yarıda
    // kesiyordu). Ayrı keep-awake paketi yok; native pencere bayrağı kullanılır.
    try { KizilkanNativeCore.setKeepScreenOn(true); } catch {}
    try {
      const hosts = await resolveHosts();
      if (controller.signal.aborted || run !== runRef.current) return;
      if (hosts.length === 0) { Alert.alert("Portal yok", hostMode === "manual" ? "En az bir portal adresi girin." : "Rehberde eşleşen host bulunamadı."); return; }
      const { jobs, capped } = buildMagBulkJobs(hosts, parsed.macs);
      if (capped) Alert.alert("Uyarı", "Çok fazla kombinasyon; ilk 8192 iş taranacak.");
      haptic.medium(); setProgress({ done: 0, total: jobs.length, current: "" });
      void recordDiagnostic("scan", "MAG_BULK_UI_START", { jobs: jobs.length, hosts: hosts.length, macs: parsed.macs.length, proxy: useProxy, hostMode, mode: scanMode, scope: discoveryScope, parallel });
      await runMagBulkScan(jobs, {
        concurrency: parallel,
        timeoutMs: mode.timeoutMs,
        maxCandidatesPerHost: mode.maxCandidates,
        scope: discoveryScope,
        useProxy,
        onPhase: next => { if (mountedRef.current && run === runRef.current) setScanPhase(next); },
        onPortalDiscovery: reports => {
          if (!mountedRef.current || run !== runRef.current) return;
          const choices = chooseMagPortals(reports);
          setPortalReports(reports); setPortalChoices(choices); portalChoicesRef.current = choices;
        },
        selectPortals: portalChoiceMode === "manual" ? () => new Promise<Record<string, string>>((resolve, reject) => {
          const stop = () => { controller.signal.removeEventListener("abort", stop); const error: any = new Error("Portal seçimi iptal edildi."); error.kind = "CANCELLED"; reject(error); };
          const finish = (choices: Record<string, string>) => { controller.signal.removeEventListener("abort", stop); portalPickerRef.current = null; resolve(choices); };
          portalPickerRef.current = { finish, cancel: stop };
          controller.signal.addEventListener("abort", stop, { once: true });
          if (controller.signal.aborted) stop();
        }) : undefined,
        onResult: r => {
          if (!mountedRef.current || run !== runRef.current) return;
          resultBufferRef.current.push(r);
          if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flushResults, 150);
        },
        onProgress: (done, total, current) => { if (mountedRef.current && run === runRef.current) setProgress({ done, total, current: current || "" }); },
        onStage: msg => { if (mountedRef.current && run === runRef.current) setStageMsg(msg); },
        control: {
          isCancelled: () => cancelRef.current,
          waitIfPaused: async () => { while (pauseRef.current && !cancelRef.current) await new Promise(r => setTimeout(r, 200)); },
          signal: controller.signal,
        },
      });
    } catch (e: any) {
      if (!controller.signal.aborted && mountedRef.current) Alert.alert("Tarama hatası", String(e?.message || e));
    } finally {
      if (run === runRef.current) {
        portalPickerRef.current = null;
        flushResults(); busyRef.current = false; scanAbortRef.current = null;
        try { KizilkanNativeCore.setKeepScreenOn(false); } catch {}
        if (mountedRef.current) { setScanning(false); setPaused(false); setStageMsg(controller.signal.aborted ? "Analiz iptal edildi. Tamamlanan sonuçlar korunuyor." : ""); }
      }
    }
  }, [parsed.macs, resolveHosts, hostMode, useProxy, scanMode, parallelText, discoveryScope, portalChoiceMode, flushResults]);

  // v18.7.2: dosyadan MAC seç (.txt/.csv) — combo mantığının MAG karşılığı.
  const pickMacFile = useCallback(async () => {
    try {
      const DocumentPicker = await import("expo-document-picker");
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "text/comma-separated-values", "text/csv", "*/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const FileSystem = await import("expo-file-system/legacy");
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri);
      const { macs, invalid } = parseMacList(text);
      if (macs.length === 0) { Alert.alert("MAC bulunamadı", "Dosyada geçerli MAC adresi yok."); return; }
      setMacListText(prev => (prev.trim() ? prev.trim() + "\n" : "") + macs.join("\n"));
      Alert.alert("Eklendi", `${macs.length} MAC dosyadan alındı${invalid.length ? ` · ${invalid.length} geçersiz atlandı` : ""}.`);
    } catch (e: any) { Alert.alert("Dosya okunamadı", String(e?.message || e)); }
  }, []);

  const validResults = useMemo(() => results.filter(r => r.category === "valid"), [results]);
  const selectedResults = useMemo(() => {
    const unique = new Map<string, MagScanResult>();
    for (const r of results) { const key = magIdentity(r.portal, r.mac); if (selected.has(key)) unique.set(key, r); }
    return Array.from(unique.values());
  }, [results, selected]);
  const selectedValid = useMemo(() => selectedResults.filter(r => r.category === "valid"), [selectedResults]);
  const visibleResults = useMemo(() => results.filter(r => resultFilter === "all" || (resultFilter === "valid" ? r.category === "valid" : (r.protection?.state || "unknown") === resultFilter)), [results, resultFilter]);
  const toggleResult = useCallback((r: MagScanResult) => {
    const key = magIdentity(r.portal, r.mac);
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }, []);

  const addValid = useCallback(async () => {
    if (!mountedRef.current || busyRef.current || profileEpoch !== profileEpochRef.current || profileEpoch !== resetProfileEpochRef.current) return;
    const toAdd = selectedValid.filter(r => !playlists.some(pl => pl.stalkerPortal && pl.stalkerMac && magIdentity(pl.stalkerPortal, pl.stalkerMac) === magIdentity(r.portal, r.mac)));
    if (toAdd.length === 0) { Alert.alert("Eklenecek yok", "Geçerli sonuç yok ya da hepsi zaten ekli."); return; }
    busyRef.current = true; setAdding(true);
    const owner = profileRef.current;
    const controller = new AbortController(); actionAbortRef.current = controller;
    const action = ++actionRunRef.current;
    const ownsAction = () => mountedRef.current && owner === profileRef.current && profileEpoch === profileEpochRef.current && action === actionRunRef.current && actionAbortRef.current === controller;
    const stillOwned = () => ownsAction() && !controller.signal.aborted;
    let added = 0, ready = 0;
    const failures: string[] = [];
    try {
    const gate = createMagRequestGate({ signal: controller.signal }, msg => { if (stillOwned()) setActionProgress(msg); });
    const { stalkerLogin, stalkerCatalog, stalkerEnrichment, stalkerVerifyAccount } = await import("@/src/utils/stalker");
    for (const r of toAdd) {
      if (!stillOwned()) break;
      let createdId: string | undefined;
      let latestProtection = r.protection;
      let createdAccountInfo: Playlist["accountInfo"];
      try {
        const id = stableId("mag", magIdentity(r.portal, r.mac));
        if (playlists.some(pl => pl.id === id)) continue;
        setActionProgress(`${added + 1}/${toAdd.length} · ${r.mac} · hesap doğrulanıyor`);
        const cred = { portal: r.portal, mac: r.mac, deviceModel: "MAG320" as const, endpointPolicy: "exact" as const,
          requestScope: { ...gate, transport: useProxy ? "proxy" as const : "direct" as const, signal: controller.signal,
            onObservation: (next: NonNullable<MagScanResult["protection"]>) => { if (latestProtection?.state !== "present" || next.state === "present") latestProtection = next; } } };
        const { session, profile } = await stalkerLogin(cred, { forceFresh: true, signal: controller.signal });
        if (!stillOwned()) break;
        const verification = await stalkerVerifyAccount(cred, session, profile, { signal: controller.signal });
        if (!stillOwned()) break;
        if (verification.state !== "verified") throw new Error(verification.message || "Hesap ve içerik erişimi yeniden doğrulanamadı.");
        const normalizedAccountInfo = verification.accountInfo;
        createdAccountInfo = { ...normalizedAccountInfo, extra: { ...normalizedAccountInfo.extra, magProtection: latestProtection } };
        const shell: Playlist = {
          id, name: `MAG ${r.mac.slice(-8)}`, source: "stalker",
          stalkerPortal: r.portal, stalkerMac: r.mac.toUpperCase(),
          accountInfo: createdAccountInfo,
          channels: [], vod: [], series: [],
          catalogSync: { initialSyncState: "pending", roomVerified: true, updatedAt: new Date().toISOString() },
          createdAt: new Date().toISOString(),
        };
        await addPlaylist(shell);
        added++; createdId = id;
        if (!stillOwned()) throw new Error("İşlem durduruldu.");
        // Canlı katalog arka planda (live-first — §5 MAG kuralı).
            const catalog = await stalkerCatalog(cred, session, { liveOnly: true, signal: controller.signal,
              onProgress: p => { if (stillOwned()) setActionProgress(`${r.mac} · ${p.message}`); } });
            if (!stillOwned()) break;
            await updatePlaylist(id, {
              channels: catalog.channels,
              catalogCapabilities: { live: catalog.channels.length ? "supported" : "empty", vod: "empty", series: "empty", updatedAt: new Date().toISOString() },
              catalogSync: { initialSyncState: "live_ready", roomVerified: true, updatedAt: new Date().toISOString() },
              lastRefreshOk: true, lastRefreshedAt: new Date().toISOString(),
            });
            if (!stillOwned()) throw new Error("İşlem durduruldu.");
            await updatePlaylist(id, { catalogSync: { initialSyncState: "enriching", roomVerified: true, updatedAt: new Date().toISOString() } });
            if (!stillOwned()) throw new Error("İşlem durduruldu.");
            const enriched = await stalkerEnrichment(cred, session, { signal: controller.signal,
              onProgress: p => { if (stillOwned()) setActionProgress(`${r.mac} · ${p.message}`); } });
            if (!stillOwned()) break;
            await enrichPlaylistMedia(id, { vod: enriched.vod, series: enriched.series });
            if (!stillOwned()) throw new Error("İşlem durduruldu.");
            const warnings = [...catalog.diagnostics.warnings, ...enriched.diagnostics.warnings];
            const incomplete = catalog.diagnostics.live === "ERROR" || enriched.diagnostics.vod === "ERROR" || enriched.diagnostics.seriesNative === "ERROR";
            await updatePlaylist(id, {
              accountInfo: { ...createdAccountInfo, extra: { ...createdAccountInfo?.extra, magProtection: latestProtection } },
              catalogCapabilities: { live: catalog.channels.length ? "supported" : "empty",
                vod: enriched.diagnostics.vod === "UNSUPPORTED" ? "unsupported_404" : enriched.diagnostics.vod === "ERROR" ? "error" : enriched.vod.length ? "supported" : "empty",
                series: enriched.diagnostics.seriesNative === "UNSUPPORTED" ? enriched.series.length ? "vod_fallback" : "unsupported_404" : enriched.diagnostics.seriesNative === "ERROR" ? "error" : enriched.series.length ? "supported" : "empty", updatedAt: new Date().toISOString() },
              catalogSync: { initialSyncState: incomplete ? "partial_error" : "ready", initialSyncError: incomplete ? warnings.join(" | ") : undefined, roomVerified: true, updatedAt: new Date().toISOString() },
              lastRefreshOk: !incomplete, lastRefreshedAt: new Date().toISOString(),
            });
            if (incomplete) failures.push(`${r.mac}: ${warnings.join(" | ")}`); else ready++;
      } catch (e: any) {
        if (!stillOwned()) {
          if (createdId && ownsAction() && controller.signal.aborted) await updatePlaylist(createdId, { catalogSync: { initialSyncState: "partial_error", initialSyncError: "İlk katalog senkronu kullanıcı tarafından durduruldu.", roomVerified: true, updatedAt: new Date().toISOString() }, lastRefreshOk: false }).catch(() => {});
          break;
        }
        failures.push(`${r.mac}: ${String(e?.message || e)}`);
        if (createdId) await updatePlaylist(createdId, { accountInfo: { ...createdAccountInfo, extra: { ...createdAccountInfo?.extra, magProtection: latestProtection } }, catalogSync: { initialSyncState: "partial_error", initialSyncError: String(e?.message || e), roomVerified: true, updatedAt: new Date().toISOString() }, lastRefreshOk: false }).catch(() => {});
        void recordDiagnostic("scan", "MAG_BULK_ADD_ERROR", { mac: r.mac.slice(-8), message: String(e?.message || e).slice(0, 120) });
      }
    }
    if (!ownsAction()) return;
    void recordDiagnostic("scan", "MAG_BULK_ADDED", { requested: toAdd.length, added });
    Alert.alert(controller.signal.aborted ? "İşlem durduruldu" : "Ekleme sonucu", `${added}/${toAdd.length} hesap eklendi · ${ready} katalog tamamlandı.${failures.length ? `\n${failures.length} hesapta hata/eksik katalog:\n${failures.slice(0, 5).join("\n")}` : ""}`, [{ text: "Tamam" }, { text: "Listeye Git", onPress: () => { if (mountedRef.current && owner === profileRef.current && profileEpoch === profileEpochRef.current && action === actionRunRef.current) router.replace("/(tabs)"); } }]);
    } catch (e: any) {
      if (stillOwned()) Alert.alert("Ekleme hatası", String(e?.message || e));
    } finally {
      if (ownsAction()) { busyRef.current = false; actionAbortRef.current = null; setAdding(false); setActionProgress(""); }
    }
  }, [selectedValid, playlists, addPlaylist, enrichPlaylistMedia, updatePlaylist, router, useProxy, profileEpoch]);

  /**
   * v18.7.2 — Bulunan geçerli hesapları görünür klasöre kaydet:
   *  • TXT arşivi: portal | mac | durum | bitiş (combo TXT'siyle aynı klasör mantığı).
   *  • Katalog özeti (JSON): her hesabın canlı/VOD/dizi kategori adları + sayıları; kullanıcı
   *    dosya yöneticisinde görüp saklayabilir, sonra hesabı ekleyince tam katalog senkronlanır.
   */
  const saveFound = useCallback(async () => {
    if (!mountedRef.current || busyRef.current || profileEpoch !== profileEpochRef.current || profileEpoch !== resetProfileEpochRef.current) return;
    if (selectedResults.length === 0) { Alert.alert("Kayıt yok", "Kaydetmek istediğiniz hesapları seçin."); return; }
    busyRef.current = true; setSaving(true);
    const owner = profileRef.current;
    const controller = new AbortController(); actionAbortRef.current = controller;
    const action = ++actionRunRef.current;
    const ownsAction = () => mountedRef.current && owner === profileRef.current && profileEpoch === profileEpochRef.current && action === actionRunRef.current && actionAbortRef.current === controller;
    const stillOwned = () => ownsAction() && !controller.signal.aborted;
    try {
      const { KizilkanNativeCore } = await import("@/modules/kizilkan-native-core");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const { stalkerLogin, stalkerCategoryPreview } = await import("@/src/utils/stalker");
      const gate = createMagRequestGate({ signal: controller.signal }, msg => { if (stillOwned()) setActionProgress(msg); });
      const summary: MagArchiveEntry[] = [];
      for (const r of selectedResults) {
        if (!stillOwned()) return;
        setActionProgress(`${summary.length + 1}/${selectedResults.length} · ${r.mac} · kategori özeti`);
        const entry: MagArchiveEntry = { portal: r.portal, mac: r.mac, category: r.category, expiry: r.expiry,
          expiryDisplay: formatAccountExpiry(r.accountInfo || { tariff_expired_date: r.expiry }) || "Bilinmiyor / bildirilmedi",
          status: r.status, username: r.accountInfo?.username, tariffPlan: r.accountInfo?.tariff_plan,
          protection: r.protection, liveCategories: [], vodCategories: [], seriesCategories: [], warnings: [] };
        try {
          if (r.category !== "valid") throw new Error("Analiz sonucu geçerli hesap değil; kategori sorgusu gönderilmedi.");
          const cred = { portal: r.portal, mac: r.mac, deviceModel: "MAG320" as const, endpointPolicy: "exact" as const,
            requestScope: { ...gate, transport: useProxy ? "proxy" as const : "direct" as const, signal: controller.signal,
              onObservation: (next: NonNullable<MagScanResult["protection"]>) => { if (entry.protection?.state !== "present" || next.state === "present") entry.protection = next; } } };
          const { session } = await stalkerLogin(cred, { forceFresh: false });
          if (!stillOwned()) return;
          const prev = await stalkerCategoryPreview(cred, session);
          if (!stillOwned()) return;
          entry.liveCategories = prev.live; entry.vodCategories = prev.vod; entry.seriesCategories = prev.series; entry.warnings = prev.warnings;
        } catch (e: any) {
          if (!stillOwned()) return;
          entry.warnings = [`Kategori özeti: ${String(e?.message || e).slice(0, 240)}`];
        }
        summary.push(entry);
      }
      if (!stillOwned()) return;
      setActionProgress("TXT ve katalog dosyaları doğrulanıyor…");
      const txt = formatMagArchiveTxt(summary, stamp);
      const t = await KizilkanNativeCore.writePublicTextFile("MAG Hesap Arşivi", `mag-hesaplar-${stamp}.txt`, "text/plain", txt, "");
      if (!stillOwned()) return;
      if (!t.ok || !t.uri) throw new Error(`TXT oluşturulamadı: ${t.error || "Dosya sonucu doğrulanamadı"}`);
      const json = await KizilkanNativeCore.writePublicTextFile("MAG Hesap Arşivi", `mag-katalog-${stamp}.json`, "application/json", JSON.stringify(summary, null, 2), "");
      if (!stillOwned()) return;
      void recordDiagnostic("scan", "MAG_BULK_SAVED", { accounts: summary.length, txtOk: t.ok, jsonOk: json.ok, warnings: summary.filter(e => e.warnings.length).length, path: t.path || "" });
      if (stillOwned()) Alert.alert(json.ok && json.uri ? "Kaydedildi" : "TXT kaydedildi · JSON başarısız",
        `${summary.length} seçili hesabın bilgisi ve canlı/film/dizi kategori özeti TXT içinde:\n${t.path || t.uri}${summary.some(e => e.warnings.length) ? "\nAlınamayan kategoriler dosyada uyarıyla belirtildi." : ""}${!json.ok || !json.uri ? `\nJSON: ${json.error || "Dosya sonucu doğrulanamadı"}` : `\nJSON: ${json.path || json.uri}`}`);
    } catch (e: any) {
      if (stillOwned()) Alert.alert("Kaydedilemedi", String(e?.message || e));
    } finally {
      if (ownsAction()) { busyRef.current = false; actionAbortRef.current = null; setSaving(false); setActionProgress(""); }
    }
  }, [selectedResults, useProxy, profileEpoch]);

  const S = makeStyles(colors);
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of results) m[r.category] = (m[r.category] || 0) + 1;
    return m;
  }, [results]);

  return (
    <SafeAreaView style={S.root} edges={["top", "bottom"]}>
      <View style={S.header}>
        <FocusButton testID="mag-bulk-back" onPress={() => router.back()} style={S.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </FocusButton>
        <Text style={S.title}>Çoklu MAC Ekle</Text>
      </View>

      <FlatList data={visibleResults}
        keyExtractor={(r, index) => `${r.hostRaw}|${magIdentity(r.portal, r.mac)}|${index}`}
        keyboardShouldPersistTaps="handled" initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl }}
        ListHeaderComponent={<View style={{ gap: SPACING.md }}>
        <View style={[S.banner]}>
          <Ionicons name="shield-checkmark" size={18} color={colors.brandPrimary} />
          <Text style={S.bannerText}>Yalnız SİZE AİT MAG cihazlarının MAC adreslerini tarayın. Başkasının MAC'ini kullanmak yasadışıdır.</Text>
        </View>

        {/* Host kaynağı */}
        <Text style={S.label}>PORTAL KAYNAĞI</Text>
        <View style={S.chipRow}>
          {([["manual", "Adres gir"], ["code", "Rehber · kod"], ["name", "Rehber · panel adı"], ["all", "Rehber · tümü"]] as [HostMode, string][]).map(([m, lbl]) => (
            <FocusButton key={m} testID={`mag-host-mode-${m}`} onPress={() => setHostMode(m)} style={[S.chip, hostMode === m && S.chipOn]}>
              <Text style={[S.chipText, hostMode === m && S.chipTextOn]}>{lbl}</Text>
            </FocusButton>
          ))}
        </View>

        {hostMode === "manual" ? (
          <>
            <Text style={S.hint}>http/https gerekmez. Virgül, boşluk veya alt alta birden fazla adres. Port/yol keşfi aşağıdaki kapsama göre yapılır.</Text>
            <TextInput testID="mag-hosts-input" value={hostText} onChangeText={setHostText} multiline
              placeholder={"line.saglayici.com:8080\niptv.baska.net"} placeholderTextColor={colors.onSurfaceTertiary}
              editable={!scanning && !adding && !saving} autoCapitalize="none" autoCorrect={false} style={[S.input, S.multilineInput]} />
            {parsed.hosts.length > 0 && <Text style={S.count}>{parsed.hosts.length} geçerli adres{parsed.invalidHosts.length ? ` · ${parsed.invalidHosts.length} geçersiz` : ""}</Text>}
          </>
        ) : hostMode === "all" ? (
          <Text style={S.hint}>Panel rehberindeki TÜM hostlar denenecek (uzun sürebilir).</Text>
        ) : (
          <>
            <Text style={S.hint}>{hostMode === "code" ? "Panel kod(lar)ı" : "Panel ad(lar)ı"} — virgül veya boşlukla ayırın.</Text>
            <TextInput testID="mag-code-input" value={codeText} onChangeText={setCodeText}
              placeholder={hostMode === "code" ? "1234, 5678" : "PANEL ADI"} placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none" autoCorrect={false} style={S.input} />
          </>
        )}

        {/* MAC girişi */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.md }}>
          <Text style={S.label}>MAC ADRESLERİ</Text>
          <FocusButton testID="mag-pick-file" onPress={pickMacFile} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.brandPrimary }}>
            <Ionicons name="document-attach" size={14} color={colors.brandPrimary} />
            <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>Dosyadan seç</Text>
          </FocusButton>
        </View>
        <Text style={S.hint}>Liste: virgül/boşluk/alt alta. Biçim serbest (00:1A:79:.. veya 001A79..). Dosyadan (.txt/.csv) de alınabilir.</Text>
        <TextInput testID="mag-maclist-input" value={macListText} onChangeText={t => setMacListText(t.toUpperCase())} multiline
          placeholder={"00:1A:79:AA:BB:01\n00:1A:79:AA:BB:02"} placeholderTextColor={colors.onSurfaceTertiary}
          editable={!scanning && !adding && !saving} scrollEnabled autoCapitalize="characters" autoCorrect={false} style={[S.input, S.multilineInput]} />

        <View style={S.switchRow}>
          <Text style={S.switchLabel}>MAC aralığı üret</Text>
          <Switch testID="mag-range-switch" value={useRange} onValueChange={setUseRange}
            trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} />
        </View>
        {useRange && (
          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
            <TextInput testID="mag-range-start" value={rangeStart} onChangeText={t => setRangeStart(t.toUpperCase())}
              placeholder="Başlangıç MAC" placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="characters" autoCorrect={false} style={[S.input, { flex: 2 }]} />
            <TextInput testID="mag-range-count" value={rangeCount} onChangeText={t => setRangeCount(t.replace(/[^0-9]/g, ""))}
              placeholder="Adet" placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="number-pad" style={[S.input, { flex: 1 }]} />
          </View>
        )}
        {parsed.rangeError && <Text style={[S.count, { color: colors.error }]}>{parsed.rangeError}</Text>}
        <Text style={S.count}>
          Toplam {parsed.macs.length} MAC{parsed.invalidMacs.length ? ` · ${parsed.invalidMacs.length} geçersiz` : ""}{parsed.rangeCapped ? ` · ${MAG_MAX_MACS}'e kırpıldı` : ""}
        </Text>

        <Text style={[S.label, { marginTop: SPACING.md }]}>PORT / YOL KAPSAMI</Text>
        <View style={S.chipRow}>
          {(Object.keys(DISCOVERY_MODES) as MagDiscoveryScope[]).map(scope => (
            <FocusButton key={scope} testID={`mag-scope-${scope}`} disabled={scanning || adding || saving} onPress={() => setDiscoveryScope(scope)} style={[S.chip, discoveryScope === scope && S.chipOn]}>
              <Text style={[S.chipText, discoveryScope === scope && S.chipTextOn]}>{DISCOVERY_MODES[scope].label}</Text>
            </FocusButton>
          ))}
        </View>
        <Text style={S.hint}>{DISCOVERY_MODES[discoveryScope].hint}</Text>
        <Text style={S.label}>KEŞİFTEN SONRA PORTAL SEÇİMİ</Text>
        <View style={S.chipRow}>
          {([["auto", "Otomatik seç"], ["manual", "Ben seçeyim"]] as const).map(([value, label]) => (
            <FocusButton key={value} testID={`mag-portal-choice-${value}`} disabled={scanning || adding || saving} onPress={() => setPortalChoiceMode(value)} style={[S.chip, portalChoiceMode === value && S.chipOn]}>
              <Text style={[S.chipText, portalChoiceMode === value && S.chipTextOn]}>{label}</Text>
            </FocusButton>
          ))}
        </View>
        <Text style={S.hint}>Önce MAC göndermeden portal/API yolları bulunur. Otomatik seçim API kanıtını, HTTP yanıtını ve gecikmeyi değerlendirir. Ardından her MAC yalnız seçilen API'de doğrulanır.</Text>
        {/* Hız modu kapsamı genişletmez; yalnız eşzamanlılık ve timeout değişir. */}
        <Text style={[S.label, { marginTop: SPACING.md }]}>ANALİZ MODU</Text>
        <Text style={S.hint}>Hız modu kapsamı değiştirmez. Aynı hostta istekler aralıklıdır; 429 gelirse host bekletilir. Hiçbir mod ban bağışıklığı sağlamaz.</Text>
        <View style={S.chipRow}>
          {(Object.keys(SCAN_MODES) as ScanModeKey[]).map(m => (
            <FocusButton key={m} testID={`mag-mode-${m}`} disabled={scanning || adding || saving} onPress={() => setScanMode(m)} style={[S.chip, scanMode === m && S.chipOn]}>
              <Text style={[S.chipText, scanMode === m && S.chipTextOn]}>{SCAN_MODES[m].label} · {SCAN_MODES[m].concurrency}x</Text>
            </FocusButton>
          ))}
        </View>
        <View style={[S.switchRow, { alignItems: "center" }]}>
          <View style={{ flex: 1 }}>
            <Text style={S.switchLabel}>Paralel analiz sayısı</Text>
            <Text style={S.hint}>Boş → mod varsayılanı ({SCAN_MODES[scanMode].concurrency}). 1–{MAG_MAX_PARALLEL} arası.</Text>
          </View>
          <TextInput testID="mag-parallel-input" value={parallelText} onChangeText={t => setParallelText(t.replace(/[^0-9]/g, "").slice(0, 2))}
            placeholder={String(SCAN_MODES[scanMode].concurrency)} placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="number-pad" style={[S.input, { width: 70, textAlign: "center" }]} />
        </View>

        {/* Proxy */}
        <ScanProxyToggleRow onOpenCenter={() => router.push("/scan-proxy")} />
        <View style={S.switchRow}>
          <Text style={S.switchLabel}>Bu taramada proxy kullan</Text>
          <Switch testID="mag-useproxy-switch" value={useProxy} onValueChange={setUseProxy}
            trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} />
        </View>

        {portalReports.length > 0 && <View style={{ gap: SPACING.sm }}>
          <Text style={S.label}>BULUNAN PORTAL / API YOLLARI</Text>
          <ScrollView testID="mag-portal-results" nestedScrollEnabled style={{ maxHeight: 300 }} contentContainerStyle={{ gap: SPACING.sm }}>
            {portalReports.map(report => <View key={report.host.host} style={{ gap: SPACING.xs }}>
              <Text style={S.count}>{report.host.raw} · {report.probes} keşif isteği</Text>
              {report.candidates.length ? report.candidates.map(candidate => <FocusButton
                key={candidate.endpoint} testID="mag-portal-candidate"
                disabled={report.state !== "ready" || candidate.confidence === "protected" || !candidate.selectable || !scanning || scanPhase !== "selection"}
                onPress={() => {
                  const choices = { ...portalChoicesRef.current, [report.host.host]: candidate.endpoint };
                  portalChoicesRef.current = choices; setPortalChoices(choices);
                }}
                style={[S.secondaryBtn, portalChoices[report.host.host] === candidate.endpoint && { borderColor: colors.brandPrimary }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={S.resultSub}>{portalChoices[report.host.host] === candidate.endpoint ? "● " : "○ "}{candidate.endpoint}</Text>
                  <Text style={S.hint}>HTTP {candidate.httpStatus} · {candidate.confidence === "api" ? "API yanıtı doğrulandı" : candidate.confidence === "protected" ? "Koruma / doğrulama gerekli" : "Portal izi; hesap henüz doğrulanmadı"} · {candidate.elapsedMs} ms</Text>
                  <Text style={S.hint}>{candidate.evidence.join(" · ")}</Text>
                </View>
              </FocusButton>) : <Text style={S.hint}>{report.message || "Bu kapsamda API yolu bulunamadı; MAC isteği gönderilmedi."}</Text>}
            </View>)}
          </ScrollView>
          {scanning && scanPhase === "selection" && <FocusButton testID="mag-confirm-portals" style={S.primaryBtn} onPress={() => {
            if (!Object.keys(portalChoicesRef.current).length) { Alert.alert("Portal seçin", "MAC doğrulaması için en az bir API yolu seçin."); return; }
            portalPickerRef.current?.finish({ ...portalChoicesRef.current });
          }}><Text style={S.primaryBtnText}>2. Seçilen API yollarında MAC'leri doğrula</Text></FocusButton>}
        </View>}

        {/* Tara / duraklat / iptal */}
        {!scanning ? (
          <FocusButton testID="mag-scan-btn" onPress={startScan} disabled={adding || saving} style={[S.primaryBtn]}>
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={S.primaryBtnText}>{portalChoiceMode === "manual" ? "1. Portalları keşfet" : "Portalı bul ve MAC’leri doğrula"}</Text>
          </FocusButton>
        ) : (
          <View style={{ gap: SPACING.sm }}>
            <View style={S.progressRow}>
              <ActivityIndicator color={colors.brandPrimary} />
              <Text style={S.progressText} numberOfLines={1}>
                {scanPhase === "discovery" ? "Portal keşfi" : scanPhase === "selection" ? "Portal seçimi bekleniyor" : "MAC doğrulaması"} · {progress.done}/{progress.total} · {progress.current}
              </Text>
            </View>
            {stageMsg ? <Text style={[S.hint, { color: colors.brandPrimary }]} numberOfLines={1}>{stageMsg}</Text> : null}
            <ScanProxyLiveLine active={useProxy} />
            <View style={{ flexDirection: "row", gap: SPACING.sm }}>
              <FocusButton testID="mag-pause-btn" onPress={() => { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); }} style={[S.secondaryBtn, { flex: 1 }]}>
                <Text style={S.secondaryBtnText}>{paused ? "Devam" : "Duraklat"}</Text>
              </FocusButton>
              <FocusButton testID="mag-cancel-btn" onPress={() => { cancelRef.current = true; pauseRef.current = false; scanAbortRef.current?.abort(); }} style={[S.secondaryBtn, { flex: 1, borderColor: colors.error }]}>
                <Text style={[S.secondaryBtnText, { color: colors.error }]}>İptal</Text>
              </FocusButton>
            </View>
          </View>
        )}

        {/* Sonuç özeti */}
        {results.length > 0 && (
          <View style={{ gap: SPACING.xs, marginTop: SPACING.sm }}>
            <View style={S.summaryRow}>
              {(Object.keys(CATEGORY_META) as MagScanResult["category"][]).filter(c => catCounts[c]).map(c => (
                <View key={c} style={S.summaryChip}>
                  <Ionicons name={CATEGORY_META[c].icon} size={14} color={CATEGORY_META[c].color(colors)} />
                  <Text style={[S.summaryChipText, { color: CATEGORY_META[c].color(colors) }]}>{CATEGORY_META[c].label}: {catCounts[c]}</Text>
                </View>
              ))}
            </View>
            <Text style={S.count}>{selectedResults.length} seçili · {selectedValid.length} geçerli · {visibleResults.length} görünen</Text>
            <View style={S.chipRow}>
              {([["all", "Tüm sonuçlar"], ["valid", "Geçerli"], ["not_observed", "Koruma görülmedi"], ["present", "Koruma gözlendi"], ["unknown", "Belirlenemedi"]] as [ResultFilter, string][]).map(([value, label]) => (
                <FocusButton key={value} disabled={adding || saving} onPress={() => setResultFilter(value)} style={[S.chip, resultFilter === value && S.chipOn]}><Text style={[S.chipText, resultFilter === value && S.chipTextOn]}>{label}</Text></FocusButton>
              ))}
            </View>
            <View style={S.chipRow}>
              <FocusButton testID="mag-select-all" disabled={scanning || adding || saving} onPress={() => setSelected(new Set(results.map(r => magIdentity(r.portal, r.mac))))} style={S.chip}><Text style={S.chipText}>Tümünü seç</Text></FocusButton>
              <FocusButton testID="mag-select-valid" disabled={scanning || adding || saving} onPress={() => setSelected(new Set(validResults.map(r => magIdentity(r.portal, r.mac))))} style={S.chip}><Text style={S.chipText}>Geçerlileri seç</Text></FocusButton>
              <FocusButton testID="mag-select-unprotected" disabled={scanning || adding || saving} onPress={() => setSelected(new Set(validResults.filter(r => r.protection?.state === "not_observed").map(r => magIdentity(r.portal, r.mac))))} style={S.chip}><Text style={S.chipText}>Koruma görülmeyen geçerlileri seç</Text></FocusButton>
              <FocusButton testID="mag-clear-selection" disabled={scanning || adding || saving} onPress={() => setSelected(new Set())} style={S.chip}><Text style={S.chipText}>Seçimi kaldır</Text></FocusButton>
            </View>
            <Text style={S.hint}>“Koruma görülmedi” yalnız analiz anındaki endpoint ve bağlantı gözlemidir. Bilinmeyen durum korumasız sayılmaz.</Text>
            {!scanning && (
              <>
                <FocusButton testID="mag-add-valid-btn" onPress={addValid} disabled={adding || saving || !selectedValid.length} style={[S.primaryBtn, { backgroundColor: colors.success || "#2ecc71" }]}>
                  {adding ? <ActivityIndicator color="#fff" /> : <Ionicons name="add-circle" size={18} color="#fff" />}
                  <Text style={S.primaryBtnText}>{adding ? "Ekleniyor…" : `Seçili ${selectedValid.length} geçerli hesabı playliste ekle`}</Text>
                </FocusButton>
                <FocusButton testID="mag-save-valid-btn" onPress={saveFound} disabled={adding || saving || !selectedResults.length} style={[S.secondaryBtn, { marginTop: SPACING.xs }]}>
                  {saving ? <ActivityIndicator color={colors.onSurface} /> : <Ionicons name="save" size={16} color={colors.onSurface} />}
                  <Text style={[S.secondaryBtnText, { marginLeft: 6 }]}>{saving ? "Kaydediliyor…" : `Seçili ${selectedResults.length} hesabı TXT + kategori olarak kaydet`}</Text>
                </FocusButton>
              </>
            )}
          </View>
        )}
        {actionProgress ? <Text style={S.count}>{actionProgress}</Text> : null}
        {(adding || saving) && <FocusButton onPress={() => actionAbortRef.current?.abort()} style={S.secondaryBtn}><Text style={S.secondaryBtnText}>İşlemi durdur</Text></FocusButton>}
        </View>}

        renderItem={({ item: r }) => {
          const meta = CATEGORY_META[r.category];
          return (
            <FocusButton testID={`mag-result-${r.mac.replace(/:/g, "")}`} onPress={() => toggleResult(r)} disabled={scanning || adding || saving} style={S.resultRow} accessibilityLabel={`${r.mac}, ${meta.label}, ${protectionLabel(r)}, ${selected.has(magIdentity(r.portal, r.mac)) ? "seçili" : "seçili değil"}`}>
              <Ionicons name={selected.has(magIdentity(r.portal, r.mac)) ? "checkbox" : "square-outline"} size={22} color={selected.has(magIdentity(r.portal, r.mac)) ? colors.brandPrimary : colors.onSurfaceTertiary} />
              <View style={{ flex: 1 }}>
                <Text style={S.resultMac}>{r.mac}</Text>
                <Text style={S.resultSub} numberOfLines={2}>{r.portal}</Text>
                <Text style={S.resultSub}>{formatAccountExpiry(r.accountInfo || { tariff_expired_date: r.expiry }) || "Bitiş: Bilinmiyor / bildirilmedi"}</Text>
                <Text style={S.resultSub}>{protectionLabel(r)}{r.protection ? ` · ${new Date(r.protection.observedAt).toLocaleString("tr-TR")}` : ""}</Text>
                {r.message ? <Text style={S.resultSub} numberOfLines={3}>{r.message}</Text> : null}
              </View>
              <Text style={[S.resultCat, { color: meta.color(colors) }]}>{meta.label}</Text>
            </FocusButton>
          );
        }}
        ListFooterComponent={!PanelScan.available && useProxy ? <Text style={[S.count, { color: colors.error }]}>Proxy native modülü yok; proxy analizi başlatılamaz.</Text> : null}
      />
    </SafeAreaView>
  );
}

function makeStyles(c: ThemePalette) {
  return StyleSheet.create({
    // v18.7.2: palette'te `background` YOK (`surface` var). Eskiden c.background undefined'dı →
    // ekran açık/ters renkti. makeStyles artık ThemePalette tipli (any değil) → tsc yakalar.
    root: { flex: 1, backgroundColor: c.surface },
    header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: c.border },
    iconBtn: { padding: SPACING.xs, borderRadius: RADIUS.pill },
    title: { color: c.onSurface, fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
    banner: { flexDirection: "row", gap: SPACING.sm, alignItems: "center", backgroundColor: c.brandPrimary + "22", borderColor: c.brandPrimary, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm },
    bannerText: { flex: 1, color: c.onSurface, fontSize: FONT.size.xs },
    label: { color: c.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 0.5 },
    hint: { color: c.onSurfaceTertiary, fontSize: FONT.size.xs },
    count: { color: c.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },
    input: { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, fontSize: FONT.size.sm, textAlignVertical: "top" },
    multilineInput: { height: 128, maxHeight: 160 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
    chip: { paddingVertical: 6, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
    chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
    chipText: { color: c.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },
    chipTextOn: { color: "#fff" },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.xs },
    switchLabel: { color: c.onSurface, fontSize: FONT.size.sm },
    primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, backgroundColor: c.brandPrimary, paddingVertical: SPACING.md, borderRadius: RADIUS.md, marginTop: SPACING.sm },
    primaryBtnText: { color: "#fff", fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
    secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.border },
    secondaryBtnText: { color: c.onSurface, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
    progressRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
    progressText: { flex: 1, color: c.onSurfaceSecondary, fontSize: FONT.size.sm },
    summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
    summaryChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.pill, backgroundColor: c.surfaceSecondary },
    summaryChipText: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold },
    resultRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: c.border },
    resultMac: { color: c.onSurface, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
    resultSub: { color: c.onSurfaceTertiary, fontSize: FONT.size.xs },
    resultCat: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold },
  });
}
