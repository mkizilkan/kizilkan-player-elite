/**
 * KIZILKAN PLAYER — Yerel Medya (v18.1.0)
 *
 * v17'deki ekran korunarak genişletildi (tek dosya seçme, klasör/USB/SD, son
 * klasörü hatırlama, üst klasör — hepsi duruyor):
 *  • HIZ     : Klasör tek native DocumentsContract sorgusuyla listelenir (eskiden her
 *              alt öğe için ayrı SAF çağrısı). Native yoksa eski yol; o da artık yalnız
 *              uzantısız öğeleri klasör diye yoklar.
 *  • SES     : mp3/flac/aac/m4a/ogg/opus/wav/wma/amr… listelenir ve çalınır.
 *  • GÖRSEL  : Kapak (ses: gömülü kapak, video: bir kare), süre, boyut, tarih,
 *              sanatçı/albüm; görünen satırlar için arka planda, önbellekli.
 *  • DÜZEN   : Tümü/Video/Müzik filtresi, ad/tarih/boyut sıralama, arama.
 *  • OYNATMA : Klasör sırası oynatıcıya kuyruk olarak gider (önceki/sonraki +
 *              otomatik geçiş), "Tümünü çal" / "Karışık çal", kaldığın yerden devam.
 *  • TV      : Tüm düğmeler odak çerçeveli; oynatıcıdan dönüşte son dosya ortada ve odaklı.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, FlatList, Image, Platform, StyleSheet, Text, TextInput, View, type ViewToken } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { storage } from "@/src/utils/storage";
import { FocusButton } from "@/src/components/FocusButton";
import { useTv } from "@/src/store/TvContext";
import { TvFocusScope, useTvFocusMemory } from "@/src/store/TvFocusMemoryContext";
import { useFocusScroll } from "@/src/hooks/useFocusScroll";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import {
  LOCAL_LAST_DIR_KEY, LOCAL_PREFS_KEY, addLocalRecent, clearLocalRecent, extOfName, fmtDuration, fmtSize,
  isSubtitleName, kindOfName, loadLocalInfoCache, loadLocalProgressMap, loadLocalRecent, localIdForUri, matchSubtitles, saveLocalInfoCache,
  saveLocalProgress, saveLocalQueue, uriDisplayName, writeLocalPayload,
  type LocalInfoLite, type LocalKind, type LocalProgress, type LocalQueueItem, type LocalRecent,
} from "@/src/utils/localMedia";

type Entry = {
  uri: string;
  name: string;
  isDirectory: boolean;
  kind: LocalKind | "dir";
  ext: string;
  size: number;
  modified: number;
};
type Filter = "all" | "video" | "audio";
type SortKey = "name" | "date" | "size";
type ViewMode = "folder" | "recent";

const SCOPE = "local-media";
const INFO_CONCURRENCY = 2;

function entryToItem(e: Entry, subtitles?: Map<string, string>): LocalQueueItem {
  const subtitleUri = e.kind === "video" ? subtitles?.get(e.name) : undefined;
  return { id: localIdForUri(e.uri), uri: e.uri, name: e.name, ext: e.ext, kind: e.kind === "audio" ? "audio" : "video", ...(subtitleUri ? { subtitleUri } : {}) };
}

function shuffled<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export default function LocalMediaScreen() {
  return (
    <TvFocusScope scope={SCOPE}>
      <LocalMediaInner />
    </TvFocusScope>
  );
}

function LocalMediaInner() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isTv } = useTv();
  const returnFocus = useTvFocusMemory(SCOPE);
  const { listRef, onScrollToIndexFailed, centerIndex } = useFocusScroll<Entry>();

  const [directoryUri, setDirectoryUri] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("folder");
  const [recent, setRecent] = useState<LocalRecent[]>([]);
  const [progress, setProgress] = useState<Record<string, LocalProgress>>({});
  const [info, setInfo] = useState<Record<string, LocalInfoLite>>({});
  const [listingSource, setListingSource] = useState<"native" | "saf" | "">("");
  /** v18.2.0: video adı → aynı klasördeki altyazı (.srt/.vtt) adresi. */
  const [subtitleMap, setSubtitleMap] = useState<Map<string, string>>(new Map());

  const SAF: any = (FileSystem as any).StorageAccessFramework;
  const infoRef = useRef<Record<string, LocalInfoLite>>({});
  const infoQueueRef = useRef<string[]>([]);
  const infoActiveRef = useRef(0);
  const infoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const infoFailedRef = useRef(new Set<string>());

  // ── Tercihler + önbellekler ─────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const [prefsRaw, cache, prog, rec] = await Promise.all([
        storage.getItem<string>(LOCAL_PREFS_KEY, ""), loadLocalInfoCache(), loadLocalProgressMap(), loadLocalRecent(),
      ]);
      try {
        const p = prefsRaw ? JSON.parse(String(prefsRaw)) : null;
        if (p?.filter) setFilter(p.filter);
        if (p?.sortKey) setSortKey(p.sortKey);
        if (typeof p?.sortDesc === "boolean") setSortDesc(p.sortDesc);
      } catch { /* bozuk tercih: varsayılan */ }
      infoRef.current = cache;
      setInfo(cache);
      setProgress(prog);
      setRecent(rec);
    })();
  }, []);
  useEffect(() => {
    void storage.setItem(LOCAL_PREFS_KEY, JSON.stringify({ filter, sortKey, sortDesc }));
  }, [filter, sortKey, sortDesc]);

  const refreshProgressAndRecent = useCallback(async () => {
    const [prog, rec] = await Promise.all([loadLocalProgressMap(), loadLocalRecent()]);
    setProgress(prog);
    setRecent(rec);
  }, []);

  // ── Klasör okuma ────────────────────────────────────────────────────────
  const listViaSafFallback = useCallback(async (dir: string): Promise<{ entries: Entry[]; subs: Array<{ name: string; uri: string }> }> => {
    const uris: string[] = await SAF.readDirectoryAsync(dir);
    const out: Entry[] = [];
    const subs: Array<{ name: string; uri: string }> = [];
    for (const uri of uris) {
      const name = uriDisplayName(uri);
      if (isSubtitleName(name)) { subs.push({ name, uri }); continue; }
      const kind = kindOfName(name);
      if (kind) { out.push({ uri, name, isDirectory: false, kind, ext: extOfName(name), size: -1, modified: 0 }); continue; }
      // Uzantısı olan ama medya olmayan dosya: klasör yoklaması gereksiz (v18.1.0 hız).
      if (extOfName(name)) continue;
      try {
        await SAF.readDirectoryAsync(uri);
        out.push({ uri, name, isDirectory: true, kind: "dir", ext: "", size: -1, modified: 0 });
      } catch { /* dosya */ }
    }
    return { entries: out, subs };
  }, [SAF]);

  const inspectEntries = useCallback(async (dir: string) => {
    if (!dir) return;
    setBusy(true);
    const startedAt = Date.now();
    try {
      let out: Entry[] | null = null;
      let subs: Array<{ name: string; uri: string }> = [];
      let source: "native" | "saf" = "native";
      let nativeError = "";
      if (KizilkanNativeCore.available) {
        const listing = await KizilkanNativeCore.listLocalMediaChildren(dir).catch((e: any) => ({ ok: false, error: String(e?.message || e), entries: [], elapsedMs: 0 }));
        if (listing?.ok) {
          subs = listing.entries.filter(e => e.kind === "subtitle").map(e => ({ name: e.name, uri: e.uri }));
          out = listing.entries.filter(e => e.kind !== "subtitle").map(e => ({
            uri: e.uri, name: e.name, isDirectory: e.kind === "dir", kind: e.kind as Entry["kind"], ext: e.ext,
            size: Number(e.size ?? -1), modified: Number(e.modified || 0),
          }));
        } else nativeError = String(listing?.error || "native-unavailable");
      }
      if (!out) {
        if (!SAF?.readDirectoryAsync) throw new Error(nativeError || "SAF_UNAVAILABLE");
        source = "saf";
        const fb = await listViaSafFallback(dir);
        out = fb.entries;
        subs = fb.subs;
      }
      const subMap = matchSubtitles(out.filter(e => e.kind === "video").map(e => e.name), subs);
      setSubtitleMap(subMap);
      setEntries(out);
      setDirectoryUri(dir);
      setListingSource(source);
      setViewMode("folder");
      await storage.setItem(LOCAL_LAST_DIR_KEY, dir);
      void recordDiagnostic("import", "LOCAL_MEDIA_LIST", {
        source, count: out.length, dirs: out.filter(e => e.isDirectory).length,
        audio: out.filter(e => e.kind === "audio").length, video: out.filter(e => e.kind === "video").length,
        subtitles: subs.length, subtitleMatched: subMap.size,
        elapsedMs: Date.now() - startedAt, nativeError: nativeError.slice(0, 120),
      }, { stage: "local-media", outcome: "success", durationMs: Date.now() - startedAt });
    } catch (e: any) {
      void recordDiagnostic("import", "LOCAL_MEDIA_LIST_FAILED", { error: String(e?.message || e).slice(0, 200) }, { stage: "local-media", outcome: "failed" });
      Alert.alert("Klasör açılamadı", String(e?.message || e));
    } finally { setBusy(false); }
  }, [SAF, listViaSafFallback]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    storage.getItem<string>(LOCAL_LAST_DIR_KEY, "").then(last => {
      if (last) void inspectEntries(String(last));
    }).catch(() => {});
  }, [inspectEntries]);

  const chooseDirectory = useCallback(async () => {
    if (Platform.OS !== "android" || !SAF?.requestDirectoryPermissionsAsync) {
      Alert.alert("Klasör seçimi", "USB/SD klasör tarama Android'de kullanılabilir. Tek dosya seçimi bu cihazda yine çalışır.");
      return;
    }
    try {
      const p = await SAF.requestDirectoryPermissionsAsync(directoryUri || undefined);
      if (!p?.granted || !p?.directoryUri) return;
      setHistory([]);
      await inspectEntries(p.directoryUri);
    } catch (e: any) { Alert.alert("Klasör seçilemedi", String(e?.message || e)); }
  }, [SAF, directoryUri, inspectEntries]);

  // ── Görünüm: filtre + arama + sıralama ─────────────────────────────────
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    const list = entries.filter(e => {
      if (!e.isDirectory && filter !== "all" && e.kind !== filter) return false;
      if (q && !e.name.toLocaleLowerCase("tr").includes(q)) return false;
      return true;
    });
    const dir = sortDesc ? -1 : 1;
    list.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1; // klasörler her zaman üstte
      if (sortKey === "date") return ((a.modified || 0) - (b.modified || 0)) * dir || a.name.localeCompare(b.name, "tr");
      if (sortKey === "size") return ((a.size || 0) - (b.size || 0)) * dir || a.name.localeCompare(b.name, "tr");
      return a.name.localeCompare(b.name, "tr", { numeric: true, sensitivity: "base" }) * dir;
    });
    return list;
  }, [entries, filter, query, sortKey, sortDesc]);

  const mediaInView = useMemo(() => visible.filter(e => !e.isDirectory), [visible]);
  const counts = useMemo(() => ({
    video: entries.filter(e => e.kind === "video").length,
    audio: entries.filter(e => e.kind === "audio").length,
    dirs: entries.filter(e => e.isDirectory).length,
  }), [entries]);

  // ── Kapak / süre bilgisi (görünen satırlar, 2 eşzamanlı, önbellekli) ──
  const pumpInfo = useCallback(() => {
    if (!KizilkanNativeCore.available) return;
    while (infoActiveRef.current < INFO_CONCURRENCY && infoQueueRef.current.length) {
      const uri = infoQueueRef.current.shift()!;
      if (infoRef.current[uri] || infoFailedRef.current.has(uri)) continue;
      infoActiveRef.current += 1;
      void KizilkanNativeCore.getLocalMediaInfo(uri).then(res => {
        if (!res?.ok) { infoFailedRef.current.add(uri); return; }
        const lite: LocalInfoLite = {
          durationMs: res.durationMs, title: res.title, artist: res.artist, album: res.album,
          width: res.width, height: res.height, artPath: res.artPath, hasVideo: res.hasVideo, at: Date.now(),
        };
        infoRef.current = { ...infoRef.current, [uri]: lite };
        setInfo(infoRef.current);
        if (infoSaveTimerRef.current) clearTimeout(infoSaveTimerRef.current);
        infoSaveTimerRef.current = setTimeout(() => { void saveLocalInfoCache(infoRef.current); }, 1500);
      }).catch(() => { infoFailedRef.current.add(uri); }).finally(() => {
        infoActiveRef.current -= 1;
        pumpInfo();
      });
    }
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const wanted: string[] = [];
    for (const v of viewableItems) {
      const e = v.item as Entry | LocalRecent | undefined;
      const uri = (e as any)?.uri;
      const isDir = (e as any)?.isDirectory;
      if (!uri || isDir || infoRef.current[uri] || infoFailedRef.current.has(uri)) continue;
      wanted.push(uri);
    }
    if (!wanted.length) return;
    // Görünenler öne: eski sıradaki (artık görünmeyen) istekler arkaya düşer.
    infoQueueRef.current = [...wanted, ...infoQueueRef.current.filter(u => !wanted.includes(u))].slice(0, 60);
    pumpInfo();
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10, minimumViewTime: 120 }).current;

  useEffect(() => () => { if (infoSaveTimerRef.current) clearTimeout(infoSaveTimerRef.current); void saveLocalInfoCache(infoRef.current); }, []);

  // ── Oynatma ─────────────────────────────────────────────────────────────
  const playItem = useCallback(async (item: LocalQueueItem, queue: LocalQueueItem[], opts?: { fromStart?: boolean; label?: string; dirUri?: string }) => {
    try {
      const art = infoRef.current[item.uri]?.artPath;
      await writeLocalPayload(item, art ? `file://${art}` : null);
      await saveLocalQueue({ items: queue.length ? queue : [item], dirUri: opts?.dirUri, label: opts?.label });
      await addLocalRecent(item, opts?.dirUri);
      const saved = opts?.fromStart ? undefined : progress[item.id];
      const resumeAt = saved && saved.current > 10 && saved.duration > 0 && saved.current / saved.duration < 0.95 ? Math.floor(saved.current) : 0;
      const focusKey = `local:${item.id}`;
      returnFocus.remember(focusKey);
      void recordDiagnostic("player", "LOCAL_MEDIA_OPEN", { kind: item.kind, ext: item.ext, queueSize: queue.length, resumeAt, hasArt: !!art }, { stage: "local-media", outcome: "started" });
      router.push({ pathname: "/player", params: { id: item.id, ext: "true", ...(resumeAt > 0 ? { resumeAt: String(resumeAt) } : {}), navOrigin: "local-media", focusKey } });
      setTimeout(() => { void refreshProgressAndRecent(); }, 400);
    } catch (e: any) {
      Alert.alert("Dosya açılamadı", String(e?.message || e));
    }
  }, [progress, returnFocus.remember, router, refreshProgressAndRecent]);

  const folderLabel = useMemo(() => directoryUri ? uriDisplayName(directoryUri) : "", [directoryUri]);

  const playFromFolder = useCallback((entry: Entry, opts?: { fromStart?: boolean }) => {
    const queue = mediaInView.map(e => entryToItem(e, subtitleMap));
    return playItem(entryToItem(entry, subtitleMap), queue, { ...opts, dirUri: directoryUri, label: folderLabel });
  }, [mediaInView, playItem, directoryUri, folderLabel, subtitleMap]);

  const playAll = useCallback((shuffle: boolean) => {
    const queue = (shuffle ? shuffled(mediaInView) : mediaInView).map(e => entryToItem(e, subtitleMap));
    if (!queue.length) return;
    return playItem(queue[0], queue, { fromStart: true, dirUri: directoryUri, label: folderLabel });
  }, [mediaInView, playItem, directoryUri, folderLabel, subtitleMap]);

  const chooseFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["video/*", "audio/*"], copyToCacheDirectory: false, multiple: true });
      if (result.canceled || !result.assets?.length) return;
      const items: LocalQueueItem[] = result.assets.map(a => {
        const name = a.name || uriDisplayName(a.uri);
        const kind = kindOfName(name, a.mimeType || "") || (String(a.mimeType || "").startsWith("audio/") ? "audio" : "video");
        return { id: localIdForUri(a.uri), uri: a.uri, name, ext: extOfName(name) || (kind === "audio" ? "mp3" : "mp4"), kind };
      });
      await playItem(items[0], items, { label: items.length > 1 ? `${items.length} dosya` : undefined });
    } catch (e: any) { Alert.alert("Dosya açılamadı", String(e?.message || e)); }
  }, [playItem]);

  const openEntry = useCallback(async (entry: Entry) => {
    if (!entry.isDirectory) return playFromFolder(entry);
    setHistory(prev => [...prev, directoryUri]);
    setQuery("");
    await inspectEntries(entry.uri);
  }, [directoryUri, inspectEntries, playFromFolder]);

  const entryActions = useCallback((entry: Entry) => {
    if (entry.isDirectory) return;
    const id = localIdForUri(entry.uri);
    const p = progress[id];
    Alert.alert(entry.name, [fmtSize(entry.size), fmtDuration(info[entry.uri]?.durationMs)].filter(Boolean).join(" · ") || undefined, [
      { text: "Baştan oynat", onPress: () => { void playFromFolder(entry, { fromStart: true }); } },
      ...(p ? [{ text: "Kaldığın yeri sil", onPress: () => {
        void (async () => {
          await saveLocalProgress(id, p.duration, p.duration); // ≥%95 → kayıt silinir
          await refreshProgressAndRecent();
        })();
      } }] : []),
      { text: "Kapat", style: "cancel" as const },
    ]);
  }, [progress, info, playFromFolder, refreshProgressAndRecent]);

  const goParent = useCallback(async () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(h => h.slice(0, -1));
    setQuery("");
    await inspectEntries(prev);
  }, [history, inspectEntries]);

  // Geri tuşu: önce arama, sonra üst klasör, sonra ekrandan çık.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (query) { setQuery(""); return true; }
      if (viewMode === "recent" && directoryUri) { setViewMode("folder"); return true; }
      if (history.length) { void goParent(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [query, viewMode, directoryUri, history.length, goParent]);

  const clearCaches = useCallback(() => {
    Alert.alert("Önbelleği temizle", "Kapak resimleri ve süre bilgileri silinsin mi? (Dosyalarınıza dokunulmaz.)", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Temizle", style: "destructive", onPress: () => {
        void (async () => {
          const n = await KizilkanNativeCore.clearLocalMediaArtCache().catch(() => 0);
          infoRef.current = {};
          infoFailedRef.current.clear();
          setInfo({});
          await saveLocalInfoCache({});
          void recordDiagnostic("import", "LOCAL_MEDIA_CACHE_CLEARED", { artFiles: n }, { stage: "local-media", outcome: "success" });
        })();
      } },
    ]);
  }, []);

  // ── Oynatıcıdan dönüş: son dosya ortada + (TV) odaklı ───────────────────
  const listData: (Entry | LocalRecent)[] = viewMode === "recent" ? recent : visible;
  useEffect(() => {
    const req = returnFocus.restoreRequest;
    if (!req) return;
    void refreshProgressAndRecent();
    const m = /^local:(local-.+)$/.exec(req.key);
    if (!m) return;
    const idx = listData.findIndex((e: any) => (e.id || localIdForUri(e.uri)) === m[1]);
    if (idx < 0) {
      void recordDiagnostic("navigation", "FOCUS_RESTORE_SKIP", { surface: "local-media", reason: "target-not-in-list", loaded: listData.length, viewMode }, { stage: "focus-restore", outcome: "skipped" });
      return;
    }
    centerIndex(idx, {
      onResult: r => {
        void recordDiagnostic("navigation", "FOCUS_RESTORE_CENTER", { surface: "local-media", index: idx, ok: r.ok, attempts: r.attempts, elapsedMs: r.elapsedMs, reason: r.reason, isTv }, { stage: "focus-restore", outcome: r.ok ? "centered" : "failed", durationMs: r.elapsedMs });
        if (!isTv) returnFocus.clearRestore(req.nonce, "centered");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnFocus.restoreRequest?.nonce]);

  const subtitle = viewMode === "recent"
    ? `${recent.length} son açılan dosya`
    : directoryUri
      ? `${folderLabel} · ${counts.video} video · ${counts.audio} müzik · ${counts.dirs} klasör`
      : "Telefon, tablet, USB veya SD karttan video ve müzik açın";

  const renderRow = ({ item }: { item: Entry | LocalRecent }) => {
    const isRecent = viewMode === "recent";
    const e = item as any;
    const isDir = !isRecent && !!e.isDirectory;
    const id = isRecent ? e.id : (isDir ? "" : localIdForUri(e.uri));
    const kind: LocalKind | "dir" = isDir ? "dir" : (e.kind === "audio" ? "audio" : "video");
    const meta = info[e.uri];
    const prog = id ? progress[id] : undefined;
    const pct = prog && prog.duration > 0 ? Math.min(1, prog.current / prog.duration) : 0;
    const artUri = meta?.artPath ? `file://${meta.artPath}` : "";
    const line2 = isDir
      ? "Klasör"
      : [
          (e.ext || "").toUpperCase(),
          (isRecent ? e.subtitleUri : subtitleMap.get(e.name)) ? "CC" : "",
          fmtDuration(meta?.durationMs),
          kind === "audio" ? [meta?.artist, meta?.album].filter(Boolean).join(" — ") : (meta?.height ? `${meta.height}p` : ""),
          !isRecent ? fmtSize(e.size) : "",
          !isRecent && e.modified ? new Date(e.modified).toLocaleDateString("tr-TR") : "",
        ].filter(Boolean).join(" · ");
    const title = kind === "audio" && meta?.title ? meta.title : e.name;
    return (
      <FocusButton
        testID={isDir ? `local-dir-${e.name}` : `local-file-${id}`}
        focusKey={isDir ? `local:dir:${e.uri}` : `local:${id}`}
        focusScope={SCOPE}
        onPress={() => {
          if (isRecent) {
            const queue = recent.map(r => ({ id: r.id, uri: r.uri, name: r.name, ext: r.ext, kind: r.kind, ...(r.subtitleUri ? { subtitleUri: r.subtitleUri } : {}) }));
            void playItem(queue.find(q => q.id === id) || queue[0], queue, { label: "Son açılanlar" });
          } else void openEntry(e as Entry);
        }}
        onLongPress={!isRecent && !isDir ? () => entryActions(e as Entry) : undefined}
        delayLongPress={400}
        focusRadius={RADIUS.md}
        style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, isTv && styles.rowTv]}
      >
        <View style={[styles.thumb, isTv && styles.thumbTv, { backgroundColor: colors.surfaceTertiary }]}>
          {artUri ? (
            <Image source={{ uri: artUri }} style={styles.thumbImg} resizeMode="cover" />
          ) : (
            <Ionicons
              name={isDir ? "folder" : kind === "audio" ? "musical-notes" : "film-outline"}
              size={isTv ? 22 : 26}
              color={isDir ? colors.brandPrimary : colors.onSurfaceSecondary}
            />
          )}
          {!isDir && artUri && kind === "video" ? (
            <View style={styles.thumbBadge}><Ionicons name="play" size={10} color="#fff" /></View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.semibold, fontSize: isTv ? FONT.size.sm : FONT.size.base }} numberOfLines={isTv ? 1 : 2}>{title}</Text>
          {line2 ? <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }} numberOfLines={1}>{line2}</Text> : null}
          {pct > 0 ? (
            <View style={[styles.progressBg, { backgroundColor: colors.surfaceTertiary }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.brandPrimary, width: `${Math.max(3, pct * 100)}%` }]} />
            </View>
          ) : null}
        </View>
        <Ionicons name={isDir ? "chevron-forward" : prog ? "play-forward-circle-outline" : "play-circle-outline"} size={22} color={colors.onSurfaceSecondary} />
      </FocusButton>
    );
  };

  const sortLabel = sortKey === "name" ? "Ad" : sortKey === "date" ? "Tarih" : "Boyut";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="local-media-screen">
      <View style={styles.header}>
        <FocusButton testID="local-close" onPress={() => router.back()} hitSlop={12} focusRadius={20} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </FocusButton>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Yerel Medya</Text>
          <Text style={[styles.sub, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>{subtitle}</Text>
        </View>
        {KizilkanNativeCore.available ? (
          <FocusButton testID="local-clear-cache" onPress={clearCaches} hitSlop={10} focusRadius={20} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.onSurfaceSecondary} />
          </FocusButton>
        ) : null}
      </View>

      <View style={styles.actions}>
        <FocusButton testID="local-pick-file" onPress={() => void chooseFiles()} focusRadius={RADIUS.md} style={[styles.action, { backgroundColor: colors.brandPrimary }]}>
          <Ionicons name="document-outline" size={20} color={colors.onBrandPrimary} />
          <Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>Dosya seç</Text>
        </FocusButton>
        {Platform.OS === "android" && (
          <FocusButton testID="local-pick-dir" onPress={() => void chooseDirectory()} focusRadius={RADIUS.md} style={[styles.action, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}>
            <Ionicons name="folder-open-outline" size={20} color={colors.brandPrimary} />
            <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold }}>Klasör / USB / SD</Text>
          </FocusButton>
        )}
      </View>

      <View style={styles.chipRow}>
        <Chip testID="local-view-folder" label="Klasör" icon="folder-outline" active={viewMode === "folder"} onPress={() => setViewMode("folder")} />
        <Chip testID="local-view-recent" label={`Son açılanlar (${recent.length})`} icon="time-outline" active={viewMode === "recent"} onPress={() => { setViewMode("recent"); void refreshProgressAndRecent(); }} />
      </View>

      {viewMode === "folder" && directoryUri ? (
        <>
          <View style={styles.chipRow}>
            <Chip testID="local-filter-all" label="Tümü" active={filter === "all"} onPress={() => setFilter("all")} />
            <Chip testID="local-filter-video" label={`Video (${counts.video})`} icon="film-outline" active={filter === "video"} onPress={() => setFilter("video")} />
            <Chip testID="local-filter-audio" label={`Müzik (${counts.audio})`} icon="musical-notes-outline" active={filter === "audio"} onPress={() => setFilter("audio")} />
            <Chip
              testID="local-sort"
              label={`${sortLabel} ${sortDesc ? "↓" : "↑"}`}
              icon="swap-vertical"
              active={false}
              onPress={() => {
                // Döngü: Ad↑ → Ad↓ → Tarih↓ → Tarih↑ → Boyut↓ → Boyut↑ → Ad↑
                if (sortKey === "name" && !sortDesc) setSortDesc(true);
                else if (sortKey === "name") { setSortKey("date"); setSortDesc(true); }
                else if (sortKey === "date" && sortDesc) setSortDesc(false);
                else if (sortKey === "date") { setSortKey("size"); setSortDesc(true); }
                else if (sortDesc) setSortDesc(false);
                else { setSortKey("name"); setSortDesc(false); }
              }}
            />
          </View>
          <View style={styles.toolsRow}>
            <View style={[styles.search, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.onSurfaceTertiary} />
              <TextInput
                testID="local-search"
                value={query}
                onChangeText={setQuery}
                placeholder="Bu klasörde ara…"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoFocus={false}
                style={{ flex: 1, color: colors.onSurface, paddingVertical: 6 }}
              />
            </View>
            {mediaInView.length > 0 && (
              <>
                <FocusButton testID="local-play-all" onPress={() => void playAll(false)} focusRadius={RADIUS.md} style={[styles.smallBtn, { backgroundColor: colors.brandPrimary }]}>
                  <Ionicons name="play" size={16} color={colors.onBrandPrimary} />
                  <Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold, fontSize: FONT.size.sm }}>Tümünü çal</Text>
                </FocusButton>
                <FocusButton testID="local-shuffle" onPress={() => void playAll(true)} focusRadius={RADIUS.md} style={[styles.smallBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}>
                  <Ionicons name="shuffle" size={16} color={colors.brandPrimary} />
                </FocusButton>
              </>
            )}
          </View>
          {history.length > 0 && (
            <FocusButton testID="local-parent" onPress={() => void goParent()} focusRadius={RADIUS.md} style={styles.parent}>
              <Ionicons name="arrow-up" size={18} color={colors.brandPrimary} />
              <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}>Üst klasör</Text>
            </FocusButton>
          )}
        </>
      ) : null}

      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={{ color: colors.onSurfaceSecondary }}>Klasör okunuyor…</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef as any}
          data={listData as any[]}
          keyExtractor={(e: any) => e.uri || e.id}
          renderItem={renderRow as any}
          onScrollToIndexFailed={onScrollToIndexFailed}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          contentContainerStyle={styles.list}
          initialNumToRender={14}
          windowSize={7}
          maxToRenderPerBatch={10}
          removeClippedSubviews={!isTv}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={viewMode === "recent" ? "time-outline" : "folder-open-outline"} size={52} color={colors.onSurfaceTertiary} />
              <Text style={{ color: colors.onSurfaceSecondary, textAlign: "center" }}>
                {viewMode === "recent"
                  ? "Henüz açılan dosya yok."
                  : directoryUri
                    ? (query ? "Aramaya uyan dosya yok." : "Bu klasörde video veya müzik yok.")
                    : "Videolar ve müzikler için bir klasör seçin ya da doğrudan dosya açın."}
              </Text>
            </View>
          }
          ListFooterComponent={viewMode === "recent" && recent.length > 0 ? (
            <FocusButton testID="local-clear-recent" onPress={() => { void clearLocalRecent().then(refreshProgressAndRecent); }} focusRadius={RADIUS.md} style={styles.parent}>
              <Ionicons name="close-circle-outline" size={18} color={colors.onSurfaceSecondary} />
              <Text style={{ color: colors.onSurfaceSecondary }}>Listeyi temizle</Text>
            </FocusButton>
          ) : (listingSource === "saf" && directoryUri ? (
            <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, textAlign: "center", padding: SPACING.md }}>Uyumluluk modu ile listelendi.</Text>
          ) : null)}
        />
      )}
    </SafeAreaView>
  );
}

/** Ekran dışında tanımlı: her render'da yeniden oluşup TV odağını düşürmesin. */
function Chip({ label, active, onPress, icon, testID }: { label: string; active: boolean; onPress: () => void; icon?: any; testID: string }) {
  const { colors } = useTheme();
  return (
    <FocusButton
      testID={testID}
      onPress={onPress}
      focusRadius={RADIUS.pill}
      style={[styles.chip, { backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary, borderColor: active ? colors.brandPrimary : colors.border }]}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary} /> : null}
      <Text style={{ color: active ? colors.onBrandPrimary : colors.onSurface, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold }}>{label}</Text>
    </FocusButton>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  iconBtn: { padding: 6 },
  title: { fontSize: FONT.size.xl, fontWeight: FONT.weight.black },
  sub: { fontSize: FONT.size.sm, marginTop: 2 },
  actions: { flexDirection: "row", gap: SPACING.sm, paddingHorizontal: SPACING.lg, flexWrap: "wrap" },
  action: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginTop: SPACING.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  toolsRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginTop: SPACING.sm },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  parent: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, alignSelf: "flex-start" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.sm },
  list: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.xxxl },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm },
  rowTv: { paddingVertical: 4 },
  thumb: { width: 64, height: 64, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbTv: { width: 48, height: 48 },
  thumbImg: { width: "100%", height: "100%" },
  thumbBadge: { position: "absolute", right: 3, bottom: 3, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8, padding: 2 },
  progressBg: { height: 3, borderRadius: 2, overflow: "hidden", marginTop: 4 },
  progressFill: { height: "100%", borderRadius: 2 },
  empty: { alignItems: "center", justifyContent: "center", gap: SPACING.md, paddingTop: SPACING.xxxl, paddingHorizontal: SPACING.xl },
});
