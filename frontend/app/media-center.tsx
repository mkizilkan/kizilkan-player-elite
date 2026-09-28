/**
 * KIZILKAN PLAYER v18.4.0 → v18.5.0 — Medya Merkezi
 * ===========================================================================
 * Cihazdaki TÜM müzik / video / fotoğraflar (MediaStore) tek ekranda:
 *  • Sekmeler: Müzik · Video · Fotoğraf · Klasörler (klasör gezgini = eski ekran, korunur)
 *  • Anlık arama (Türkçe duyarsız: ı/i, ş/s…; ad + sanatçı + albüm + klasör)
 *  • Sıralama (tarih/ad/boyut/süre/tür, artan-azalan) + gruplama (albüm/sanatçı/klasör/ay)
 *  • Akıllı filtreler (kısa/uzun video, ekran kaydı, kısa sesleri gizle, ekran görüntüleri)
 *  • "Devam et" şeridi, HD/FHD/4K rozeti, izleme ilerleme çubuğu, küçük resimler
 *  • Tümünü çal / Karıştır; uzun basış → Bilgi / Paylaş / Sıraya ekle
 *  • Fotoğraf → tam ekran görüntüleyici (yakınlaştırma, kaydırma, slayt gösterisi)
 *  • TV: her öğe odaklanabilir; oynatıcıdan dönüşte son öğe ortada ve odaklı
 *
 * v18.5.0 — PERFORMANS (cihaz gözlemi: 1.103 videoda sekme geçişi "donmuş gibi", liste
 * 50–60 öğe gösterip uzun süre sonra doluyordu):
 *  • Satırlar önbellekli bileşen (React.memo) + sabit geri çağrılar → küçük resim gelince
 *    yalnız o satır yeniden çizilir (eskiden TÜM liste yeniden çiziliyordu).
 *  • Küçük resim güncellemeleri 250 ms'lik gruplar hâlinde uygulanır.
 *  • Sabit satır yükseklikleri + getItemLayout → liste ölçüm beklemeden doğru yerleşir.
 *  • Fotoğraf ızgarası tam boy fotoğraf yerine native küçük resim (≤256 px) kullanır.
 *  • Arama anahtarları yüklemede bir kez hesaplanır; arama 150 ms gecikmeli.
 *  • Sekme geçişi useTransition ile — arayüz kilitlenmez. Geçiş süresi telemetriye yazılır.
 * Oynatma yerel medya ile AYNI akış (kuyruk + local- kimliği + dosya URI'si).
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, View, useWindowDimensions, type ViewToken } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
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
  addLocalRecent, fmtSize, loadLocalProgressMap, loadLocalQueue, saveLocalQueue, writeLocalPayload,
  type LocalProgress, type LocalQueueItem,
} from "@/src/utils/localMedia";
import {
  checkMediaPermission, requestMediaPermission, loadDeviceMedia, invalidateDeviceMedia, toQueueItem,
  setPhotoViewerList, shareMediaItem, type PermissionState,
} from "@/src/utils/deviceMedia";
import {
  applySmartFilter, extOf, fmtMs, groupItems, matchesQuery, qualityBadge, sortItems,
  type MediaGroupMode, type MediaItem, type MediaSortKey, type SmartFilter,
} from "@/src/utils/deviceMediaModel";

type Tab = "audio" | "video" | "image" | "folders";
type MediaKind = "audio" | "video";
type Row =
  | { t: "header"; key: string; title: string; count: number }
  | { t: "item"; key: string; item: MediaItem }
  | { t: "grid"; key: string; items: MediaItem[] };

const SCOPE = "media-center";
const PREFS_KEY = "kizilkan.mediacenter.prefs.v1";
const THUMB_CONCURRENCY = 4;
// Sabit yükseklikler (getItemLayout ile birebir aynı olmalı).
const HEADER_H = 40;
const VROW_H = 81;
const AROW_H = 74;
const ROW_GAP = SPACING.sm;
const GRID_GAP = 4;

const SORTS: Record<Exclude<Tab, "folders">, { k: MediaSortKey; t: string }[]> = {
  audio: [{ k: "date", t: "Tarih" }, { k: "name", t: "Ad" }, { k: "duration", t: "Süre" }, { k: "size", t: "Boyut" }, { k: "type", t: "Tür" }],
  video: [{ k: "date", t: "Tarih" }, { k: "name", t: "Ad" }, { k: "duration", t: "Süre" }, { k: "size", t: "Boyut" }, { k: "type", t: "Tür" }],
  image: [{ k: "date", t: "Tarih" }, { k: "name", t: "Ad" }, { k: "size", t: "Boyut" }, { k: "type", t: "Tür" }],
};
const GROUPS: Record<Exclude<Tab, "folders">, { k: MediaGroupMode; t: string }[]> = {
  audio: [{ k: "none", t: "Şarkılar" }, { k: "album", t: "Albümler" }, { k: "artist", t: "Sanatçılar" }, { k: "folder", t: "Klasörler" }],
  video: [{ k: "none", t: "Tümü" }, { k: "folder", t: "Klasörler" }],
  image: [{ k: "month", t: "Zaman" }, { k: "folder", t: "Albümler" }, { k: "none", t: "Tümü" }],
};
const FILTERS: Record<Exclude<Tab, "folders">, { k: SmartFilter; t: string }[]> = {
  audio: [{ k: "all", t: "Tümü" }, { k: "hideShortAudio", t: "Kısa sesleri gizle" }],
  video: [{ k: "all", t: "Tümü" }, { k: "short", t: "Kısa (<1 dk)" }, { k: "long", t: "Uzun (>20 dk)" }, { k: "screen", t: "Ekran kayıtları" }],
  image: [{ k: "all", t: "Tümü" }, { k: "screen", t: "Ekran görüntüleri" }],
};

type TabPrefs = { sort: MediaSortKey; desc: boolean; group: MediaGroupMode; filter: SmartFilter };
const DEFAULT_PREFS: Record<Exclude<Tab, "folders">, TabPrefs> = {
  audio: { sort: "date", desc: true, group: "none", filter: "hideShortAudio" },
  video: { sort: "date", desc: true, group: "none", filter: "all" },
  image: { sort: "date", desc: true, group: "month", filter: "all" },
};

function shuffled<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Oynatıcı kimliği öğe başına bir kez hesaplanır (dosya adresinin özeti). */
function localIdOf(it: MediaItem, kind: MediaKind): string {
  const anyIt = it as any;
  if (!anyIt._lid) anyIt._lid = toQueueItem(it, kind).id;
  return anyIt._lid;
}

// ── Önbellekli satır bileşenleri ───────────────────────────────────────────
type MediaRowProps = {
  item: MediaItem; kind: MediaKind; thumb: string; pct: number; isTv: boolean; colors: any;
  onPress: (it: MediaItem) => void; onLongPress: (it: MediaItem) => void;
};
const MediaRow = memo(function MediaRow({ item: it, kind, thumb, pct, isTv, colors, onPress, onLongPress }: MediaRowProps) {
  const id = localIdOf(it, kind);
  const badge = kind === "video" ? qualityBadge(it.width, it.height) : null;
  const line2 = kind === "audio"
    ? [it.artist && it.artist !== "<unknown>" ? it.artist : "", it.album && it.album !== "<unknown>" ? it.album : "", fmtMs(it.duration)].filter(Boolean).join(" · ")
    : [it.folder, fmtSize(it.size), it.dateModified ? new Date(it.dateModified * 1000).toLocaleDateString("tr-TR") : ""].filter(Boolean).join(" · ");
  return (
    <FocusButton
      testID={`mc-${kind}-${it.id}`}
      focusKey={`local:${id}`}
      focusScope={SCOPE}
      onPress={() => onPress(it)}
      onLongPress={() => onLongPress(it)}
      delayLongPress={400}
      focusRadius={RADIUS.md}
      style={[styles.row, { height: kind === "video" ? VROW_H : AROW_H, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
    >
      <View style={[kind === "video" ? styles.vthumb : styles.athumb, { backgroundColor: colors.surfaceTertiary }]}>
        {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} recyclingKey={String(it.id)} /> :
          <Ionicons name={kind === "audio" ? "musical-notes" : "film-outline"} size={24} color={colors.onSurfaceSecondary} />}
        {kind === "video" && it.duration ? <View style={styles.durBadge}><Text style={styles.durText}>{fmtMs(it.duration)}</Text></View> : null}
        {badge ? <View style={[styles.qBadge, { backgroundColor: colors.brandPrimary }]}><Text style={styles.durText}>{badge}</Text></View> : null}
        {pct > 0 ? <View style={styles.progTrack}><View style={[styles.progFill, { width: `${pct * 100}%`, backgroundColor: colors.brandPrimary }]} /></View> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.semibold, fontSize: isTv ? FONT.size.sm : FONT.size.base }} numberOfLines={2}>{it.name.replace(/\.[^.]+$/, "")}</Text>
        {line2 ? <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }} numberOfLines={1}>{line2}</Text> : null}
      </View>
    </FocusButton>
  );
});

type GridRowProps = {
  items: MediaItem[]; srcs: string[]; cols: number; size: number; colors: any;
  onPress: (it: MediaItem) => void; onLongPress: (it: MediaItem) => void;
};
const GridRow = memo(function GridRow({ items, srcs, cols, size, colors, onPress, onLongPress }: GridRowProps) {
  return (
    <View style={{ flexDirection: "row", gap: GRID_GAP, height: size, marginBottom: GRID_GAP }}>
      {items.map((it, i) => (
        <FocusButton key={it.id} testID={`mc-img-${it.id}`} focusKey={`img:${it.id}`} focusScope={SCOPE}
          onPress={() => onPress(it)} onLongPress={() => onLongPress(it)} delayLongPress={400} focusRadius={4}
          style={{ width: size, height: size, backgroundColor: colors.surfaceTertiary, borderRadius: 4, overflow: "hidden" }}>
          {srcs[i] ? <Image source={{ uri: srcs[i] }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={String(it.id)} transition={100} /> : null}
        </FocusButton>
      ))}
      {Array.from({ length: cols - items.length }).map((_, i) => <View key={`pad${i}`} style={{ width: size }} />)}
    </View>
  );
}, (a, b) => a.items === b.items && a.size === b.size && a.cols === b.cols && a.colors === b.colors && a.srcs.join("|") === b.srcs.join("|"));

export default function MediaCenterScreen() {
  return (
    <TvFocusScope scope={SCOPE}>
      <MediaCenterInner />
    </TvFocusScope>
  );
}

function MediaCenterInner() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isTv } = useTv();
  const { width } = useWindowDimensions();
  const returnFocus = useTvFocusMemory(SCOPE);
  const { listRef, onScrollToIndexFailed, centerIndex } = useFocusScroll<Row>();
  const [pendingTab, startTransition] = useTransition();

  const [tab, setTab] = useState<Tab>("video");
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [perm, setPerm] = useState<Record<string, PermissionState>>({});
  const [data, setData] = useState<Record<string, MediaItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState<Record<string, LocalProgress>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [headerH, setHeaderH] = useState(0);
  const thumbsRef = useRef<Record<string, string>>({});
  const pendingThumbsRef = useRef<Record<string, string>>({});
  const flushTimerRef = useRef<any>(null);
  const thumbQueueRef = useRef<string[]>([]);
  const thumbActiveRef = useRef(0);
  const thumbFailedRef = useRef<Set<string>>(new Set());
  const tabSwitchRef = useRef<{ tab: Tab; at: number } | null>(null);

  const mediaTab = tab === "folders" ? null : tab;
  const tp = mediaTab ? prefs[mediaTab] : null;
  const cols = isTv ? 6 : width > 700 ? 5 : 3;
  const cellSize = Math.max(40, Math.floor((width - SPACING.lg * 2 - GRID_GAP * (cols - 1)) / cols));

  // Arama gecikmeli (her tuşta 1000+ öğe yeniden süzülmesin).
  useEffect(() => { const t = setTimeout(() => setQuery(queryInput), 150); return () => clearTimeout(t); }, [queryInput]);

  // Tercihler
  useEffect(() => {
    void storage.getItem<string>(PREFS_KEY, "").then(raw => {
      try { const p = raw ? JSON.parse(String(raw)) : null; if (p?.prefs) setPrefs({ ...DEFAULT_PREFS, ...p.prefs }); if (p?.tab) setTab(p.tab); } catch {}
    });
    void loadLocalProgressMap().then(setProgress);
  }, []);
  useEffect(() => { void storage.setItem(PREFS_KEY, JSON.stringify({ prefs, tab })); }, [prefs, tab]);
  const patchPrefs = (p: Partial<TabPrefs>) => { if (mediaTab) setPrefs(prev => ({ ...prev, [mediaTab]: { ...prev[mediaTab], ...p } })); };

  // İzin + yükleme
  const load = useCallback(async (kind: "audio" | "video" | "image", force = false) => {
    const st = await checkMediaPermission(kind);
    setPerm(prev => ({ ...prev, [kind]: st }));
    if (st !== "granted" && st !== "partial") return;
    setLoading(true);
    try {
      if (force) invalidateDeviceMedia(kind);
      const res = await loadDeviceMedia(kind, force);
      setData(prev => ({ ...prev, [kind]: res.items }));
      if (res.error) Alert.alert("Medya okunamadı", res.error);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (mediaTab && !data[mediaTab]) void load(mediaTab); }, [mediaTab, data, load]);

  const askPermission = async () => {
    if (!mediaTab) return;
    const st = await requestMediaPermission(mediaTab);
    setPerm(prev => ({ ...prev, [mediaTab]: st }));
    if (st === "granted" || st === "partial") void load(mediaTab, true);
    else Alert.alert("İzin verilmedi", "Ayarlar → Uygulamalar → KIZILKAN → İzinler'den medya erişimini açabilir veya 'Klasörler' sekmesinden klasör seçebilirsiniz.");
  };

  const switchTab = (k: Tab) => {
    if (k === tab) return;
    tabSwitchRef.current = { tab: k, at: Date.now() };
    startTransition(() => { setTab(k); setQueryInput(""); setQuery(""); });
  };

  // Görünür liste
  const items = useMemo(() => {
    if (!mediaTab || !tp) return [] as MediaItem[];
    const base = data[mediaTab] || [];
    const filtered = applySmartFilter(base, tp.filter);
    const searched = query ? filtered.filter(i => matchesQuery(i, query)) : filtered;
    return sortItems(searched, tp.sort, tp.desc);
  }, [mediaTab, tp, data, query]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const rows = useMemo<Row[]>(() => {
    if (!mediaTab || !tp) return [];
    const sections = groupItems(items, tp.group);
    const out: Row[] = [];
    for (const s of sections) {
      if (s.title) out.push({ t: "header", key: `h:${s.key}`, title: s.title, count: s.items.length });
      if (mediaTab === "image") {
        for (let i = 0; i < s.items.length; i += cols) out.push({ t: "grid", key: `g:${s.key}:${i}`, items: s.items.slice(i, i + cols) });
      } else {
        for (const it of s.items) out.push({ t: "item", key: `i:${it.id}`, item: it });
      }
    }
    return out;
  }, [items, mediaTab, tp, cols]);

  // Sekme geçiş süresi (kanıt için telemetri).
  useEffect(() => {
    const sw = tabSwitchRef.current;
    if (!sw || sw.tab !== tab) return;
    tabSwitchRef.current = null;
    void recordDiagnostic("player", "MEDIA_CENTER_TAB_SWITCH", { tab, items: items.length, rows: rows.length, ms: Date.now() - sw.at }, { stage: "media-center", outcome: "success" });
  }, [rows, tab, items.length]);

  // Sabit yükseklik düzeni
  const layout = useMemo(() => {
    const lens: number[] = []; const offs: number[] = [];
    let off = SPACING.sm + headerH;
    const itemLen = (mediaTab === "audio" ? AROW_H : VROW_H) + ROW_GAP;
    for (const r of rows) {
      const len = r.t === "header" ? HEADER_H : r.t === "grid" ? cellSize + GRID_GAP : itemLen;
      lens.push(len); offs.push(off); off += len;
    }
    return { lens, offs };
  }, [rows, headerH, cellSize, mediaTab]);
  const getItemLayout = useCallback((_: any, i: number) => ({ length: layout.lens[i] ?? 0, offset: layout.offs[i] ?? 0, index: i }), [layout]);

  // "Devam et" şeridi (yarım kalan videolar) — ilerleme kayıtlarından (tüm listeyi taramadan).
  const videoById = useMemo(() => {
    const m = new Map<string, MediaItem>();
    for (const it of data.video || []) m.set(localIdOf(it, "video"), it);
    return m;
  }, [data.video]);
  const continueList = useMemo(() => {
    if (mediaTab !== "video") return [] as MediaItem[];
    return Object.entries(progress)
      .filter(([id, p]) => videoById.has(id) && p.current > 10 && p.duration > 0 && p.current / p.duration < 0.95)
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
      .slice(0, 12)
      .map(([id]) => videoById.get(id)!);
  }, [mediaTab, videoById, progress]);

  // Küçük resimler: görünenler önce, eşzamanlılık sınırlı, güncellemeler 250 ms'lik gruplar.
  const flushThumbs = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      const add = pendingThumbsRef.current;
      pendingThumbsRef.current = {};
      if (Object.keys(add).length) { thumbsRef.current = { ...thumbsRef.current, ...add }; setThumbs(thumbsRef.current); }
    }, 250);
  }, []);
  useEffect(() => () => { if (flushTimerRef.current) clearTimeout(flushTimerRef.current); }, []);
  const pumpThumbs = useCallback(() => {
    while (thumbActiveRef.current < THUMB_CONCURRENCY && thumbQueueRef.current.length) {
      const uri = thumbQueueRef.current.shift()!;
      if (thumbsRef.current[uri] !== undefined || pendingThumbsRef.current[uri] !== undefined || thumbFailedRef.current.has(uri)) continue;
      thumbActiveRef.current++;
      void KizilkanNativeCore.getDeviceMediaThumbnail(uri, 256).then(path => {
        if (path) { pendingThumbsRef.current[uri] = path; flushThumbs(); }
        else { thumbFailedRef.current.add(uri); pendingThumbsRef.current[uri] = ""; flushThumbs(); }
      }).finally(() => { thumbActiveRef.current--; pumpThumbs(); });
    }
  }, [flushThumbs]);
  const enqueueThumbs = useCallback((uris: string[]) => {
    const want = uris.filter(u => thumbsRef.current[u] === undefined && pendingThumbsRef.current[u] === undefined && !thumbFailedRef.current.has(u));
    if (!want.length) return;
    thumbQueueRef.current = [...want, ...thumbQueueRef.current.filter(u => !want.includes(u))].slice(0, 120);
    pumpThumbs();
  }, [pumpThumbs]);
  const enqueueRef = useRef(enqueueThumbs);
  enqueueRef.current = enqueueThumbs;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const wanted: string[] = [];
    for (const v of viewableItems) {
      const r = v.item as Row;
      if (r?.t === "item") wanted.push(r.item.uri);
      else if (r?.t === "grid") for (const it of r.items) wanted.push(it.uri);
    }
    enqueueRef.current(wanted);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10, minimumViewTime: 80 }).current;
  useEffect(() => { enqueueThumbs(continueList.map(i => i.uri)); }, [continueList, enqueueThumbs]);

  // Oynatma
  const play = useCallback(async (item: MediaItem, list: MediaItem[], opts?: { label?: string; fromStart?: boolean }) => {
    if (!mediaTab || mediaTab === "image") return;
    const kind = mediaTab;
    try {
      const q = toQueueItem(item, kind);
      const idx = list.findIndex(x => x.id === item.id);
      const win = list.slice(Math.max(0, idx - 1000), idx + 1000).map(x => toQueueItem(x, kind));
      const art = thumbsRef.current[item.uri];
      await writeLocalPayload(q, art || null);
      await saveLocalQueue({ items: win.length ? win : [q], label: opts?.label || (kind === "audio" ? "Müzik" : "Videolar") });
      await addLocalRecent(q);
      const saved = opts?.fromStart ? undefined : progress[q.id];
      const resumeAt = saved && saved.current > 10 && saved.duration > 0 && saved.current / saved.duration < 0.95 ? Math.floor(saved.current) : 0;
      const focusKey = `local:${q.id}`;
      returnFocus.remember(focusKey);
      void recordDiagnostic("player", "LOCAL_MEDIA_OPEN", { kind, ext: q.ext, queueSize: win.length, resumeAt, hasArt: !!art, from: "media-center" }, { stage: "local-media", outcome: "started" });
      router.push({ pathname: "/player", params: { id: q.id, ext: "true", ...(resumeAt > 0 ? { resumeAt: String(resumeAt) } : {}), navOrigin: "media-center", focusKey } });
      setTimeout(() => { void loadLocalProgressMap().then(setProgress); }, 500);
    } catch (e: any) { Alert.alert("Dosya açılamadı", String(e?.message || e)); }
  }, [mediaTab, progress, returnFocus.remember, router]);

  const openPhoto = useCallback((item: MediaItem) => {
    const list = itemsRef.current;
    const idx = list.findIndex(x => x.id === item.id);
    setPhotoViewerList(list, idx < 0 ? 0 : idx);
    returnFocus.remember(`img:${item.id}`);
    router.push("/photo-viewer");
  }, [returnFocus.remember, router]);

  const addToQueue = useCallback(async (item: MediaItem) => {
    if (!mediaTab || mediaTab === "image") return;
    const q = toQueueItem(item, mediaTab);
    const cur = await loadLocalQueue();
    const next: LocalQueueItem[] = cur?.items?.length ? [...cur.items.filter(x => x.id !== q.id), q] : [q];
    await writeLocalPayload(q, thumbsRef.current[item.uri] || null);
    await saveLocalQueue({ items: next, label: cur?.label || "Kuyruk", dirUri: cur?.dirUri });
    Alert.alert("Sıraya eklendi", `${item.name}\nKuyrukta ${next.length} öğe var.`);
  }, [mediaTab]);

  const showInfo = (item: MediaItem) => {
    const lines = [
      item.name,
      item.folder ? `Klasör: ${item.folder}` : "",
      `Boyut: ${fmtSize(item.size)}`,
      item.duration ? `Süre: ${fmtMs(item.duration)}` : "",
      item.width && item.height ? `Çözünürlük: ${item.width}×${item.height}${qualityBadge(item.width, item.height) ? ` (${qualityBadge(item.width, item.height)})` : ""}` : "",
      item.artist ? `Sanatçı: ${item.artist}` : "",
      item.album ? `Albüm: ${item.album}` : "",
      `Tür: ${(extOf(item.name) || item.mime).toUpperCase()}`,
      item.dateModified ? `Tarih: ${new Date(item.dateModified * 1000).toLocaleString("tr-TR")}` : "",
    ].filter(Boolean).join("\n");
    Alert.alert("Bilgi", lines);
  };

  const itemActions = (item: MediaItem) => {
    const buttons: any[] = [{ text: "Bilgi", onPress: () => showInfo(item) }, { text: "Paylaş", onPress: () => void shareMediaItem(item) }];
    if (mediaTab !== "image") buttons.push({ text: "Sıraya ekle", onPress: () => void addToQueue(item) });
    buttons.push({ text: "İptal", style: "cancel" });
    Alert.alert(item.name, undefined, buttons);
  };

  // Sabit kimlikli geri çağrılar (önbellekli satırlar yeniden çizilmesin).
  const handlersRef = useRef({ play: (_: MediaItem) => {}, photo: (_: MediaItem) => {}, actions: (_: MediaItem) => {} });
  handlersRef.current = {
    play: it => { void play(it, itemsRef.current); },
    photo: openPhoto,
    actions: itemActions,
  };
  const onPressMedia = useCallback((it: MediaItem) => handlersRef.current.play(it), []);
  const onPressPhoto = useCallback((it: MediaItem) => handlersRef.current.photo(it), []);
  const onLongPressItem = useCallback((it: MediaItem) => handlersRef.current.actions(it), []);

  // Oynatıcıdan dönüş: son öğe ortada + (TV) odaklı
  useEffect(() => {
    const req = returnFocus.restoreRequest;
    if (!req) return;
    void loadLocalProgressMap().then(setProgress);
    const m = /^local:(local-.+)$/.exec(req.key);
    if (!m || !mediaTab || mediaTab === "image") return;
    const idx = rows.findIndex(r => r.t === "item" && localIdOf(r.item, mediaTab) === m[1]);
    if (idx < 0) {
      void recordDiagnostic("navigation", "FOCUS_RESTORE_SKIP", { surface: "media-center", reason: "target-not-in-list", loaded: rows.length }, { stage: "focus-restore", outcome: "skipped" });
      return;
    }
    centerIndex(idx, {
      onResult: r => {
        void recordDiagnostic("navigation", "FOCUS_RESTORE_CENTER", { surface: "media-center", index: idx, ok: r.ok, attempts: r.attempts, elapsedMs: r.elapsedMs, reason: r.reason, isTv }, { stage: "focus-restore", outcome: r.ok ? "centered" : "failed", durationMs: r.elapsedMs });
        if (!isTv) returnFocus.clearRestore(req.nonce, "centered");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnFocus.restoreRequest?.nonce]);

  // ── Çizim ──────────────────────────────────────────────────────────────
  const chip = (active: boolean) => ({
    paddingVertical: 6, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, borderWidth: 1,
    backgroundColor: active ? colors.brandPrimary + "22" : colors.surfaceSecondary,
    borderColor: active ? colors.brandPrimary : colors.border,
  });
  const chipText = (active: boolean) => ({ color: active ? colors.brandPrimary : colors.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold });

  const renderRow = ({ item: r }: { item: Row }) => {
    if (r.t === "header") return (
      <View style={[styles.header2, { height: HEADER_H }]}>
        <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold, fontSize: FONT.size.sm, flex: 1 }} numberOfLines={1}>{r.title}</Text>
        <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }}>{r.count}</Text>
      </View>
    );
    if (r.t === "grid") {
      const srcs = r.items.map(it => thumbs[it.uri] || (thumbFailedRef.current.has(it.uri) ? it.uri : ""));
      return <GridRow items={r.items} srcs={srcs} cols={cols} size={cellSize} colors={colors} onPress={onPressPhoto} onLongPress={onLongPressItem} />;
    }
    const kind: MediaKind = mediaTab === "audio" ? "audio" : "video";
    const p = progress[localIdOf(r.item, kind)];
    const pct = p && p.duration > 0 ? Math.min(1, p.current / p.duration) : 0;
    return <MediaRow item={r.item} kind={kind} thumb={thumbs[r.item.uri] || ""} pct={pct} isTv={isTv} colors={colors} onPress={onPressMedia} onLongPress={onLongPressItem} />;
  };

  const counts = { audio: data.audio?.length, video: data.video?.length, image: data.image?.length };
  const TABS: { k: Tab; icon: any; t: string }[] = [
    { k: "audio", icon: "musical-notes", t: "Müzik" },
    { k: "video", icon: "film", t: "Video" },
    { k: "image", icon: "images", t: "Fotoğraf" },
    { k: "folders", icon: "folder-open", t: "Klasörler" },
  ];
  const curPerm = mediaTab ? perm[mediaTab] : undefined;

  const listHeader = mediaTab && tp && (curPerm === "granted" || curPerm === "partial") ? (
    <View style={{ gap: SPACING.sm, marginBottom: SPACING.sm }} onLayout={e => { const h = Math.round(e.nativeEvent.layout.height + SPACING.sm); if (h !== headerH) setHeaderH(h); }}>
      {curPerm === "partial" && (
        <FocusButton focusKey="mc-perm-more" onPress={() => void askPermission()} style={[styles.note, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
          <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs }}>Yalnız seçtiğiniz öğeler görünüyor. Tümüne erişim için dokunun.</Text>
        </FocusButton>
      )}
      <View style={[styles.search, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
        <TextInput value={queryInput} onChangeText={setQueryInput} placeholder={mediaTab === "audio" ? "Şarkı, sanatçı, albüm ara" : mediaTab === "video" ? "Video veya klasör ara" : "Fotoğraf veya albüm ara"}
          placeholderTextColor={colors.onSurfaceTertiary} autoCorrect={false} style={{ flex: 1, color: colors.onSurface, fontSize: FONT.size.sm, paddingVertical: 0 }} />
        {queryInput ? <FocusButton focusKey="mc-clear" onPress={() => { setQueryInput(""); setQuery(""); }} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.onSurfaceTertiary} /></FocusButton> : null}
      </View>
      <FlatList horizontal showsHorizontalScrollIndicator={false} data={SORTS[mediaTab]} keyExtractor={s => s.k}
        contentContainerStyle={{ gap: SPACING.xs }}
        renderItem={({ item: s }) => {
          const active = tp.sort === s.k;
          return (
            <FocusButton focusKey={`mc-sort-${s.k}`} onPress={() => patchPrefs(active ? { desc: !tp.desc } : { sort: s.k, desc: s.k === "name" || s.k === "type" ? false : true })} style={chip(active)}>
              <Text style={chipText(active)}>{s.t}{active ? (tp.desc ? " ↓" : " ↑") : ""}</Text>
            </FocusButton>
          );
        }} />
      <FlatList horizontal showsHorizontalScrollIndicator={false} data={[...GROUPS[mediaTab].map(g => ({ id: `g:${g.k}`, t: g.t, on: tp.group === g.k, act: () => patchPrefs({ group: g.k }) })), ...FILTERS[mediaTab].filter(f => f.k !== "all").map(f => ({ id: `f:${f.k}`, t: f.t, on: tp.filter === f.k, act: () => patchPrefs({ filter: tp.filter === f.k ? "all" : f.k }) }))]}
        keyExtractor={x => x.id} contentContainerStyle={{ gap: SPACING.xs }}
        renderItem={({ item: x }) => (
          <FocusButton focusKey={`mc-${x.id}`} onPress={x.act} style={chip(x.on)}><Text style={chipText(x.on)}>{x.t}</Text></FocusButton>
        )} />
      {mediaTab !== "image" && items.length > 0 && (
        <View style={{ flexDirection: "row", gap: SPACING.sm }}>
          <FocusButton focusKey="mc-play-all" onPress={() => void play(items[0], items, { label: "Tümü", fromStart: true })} style={[styles.action, { backgroundColor: colors.brandPrimary }]}>
            <Ionicons name="play" size={16} color={colors.onBrandPrimary} /><Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold, fontSize: FONT.size.sm }}>Tümünü oynat</Text>
          </FocusButton>
          <FocusButton focusKey="mc-shuffle" onPress={() => { const s = shuffled(items); void play(s[0], s, { label: "Karışık", fromStart: true }); }} style={[styles.action, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}>
            <Ionicons name="shuffle" size={16} color={colors.onSurface} /><Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold, fontSize: FONT.size.sm }}>Karıştır</Text>
          </FocusButton>
        </View>
      )}
      {mediaTab === "image" && items.length > 0 && (
        <FocusButton focusKey="mc-slideshow" onPress={() => { setPhotoViewerList(items, 0); router.push({ pathname: "/photo-viewer", params: { slideshow: "1" } }); }} style={[styles.action, { backgroundColor: colors.brandPrimary, alignSelf: "flex-start" }]}>
          <Ionicons name="play-circle" size={16} color={colors.onBrandPrimary} /><Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold, fontSize: FONT.size.sm }}>Slayt gösterisi</Text>
        </FocusButton>
      )}
      {continueList.length > 0 && !query && (
        <View>
          <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold, fontSize: FONT.size.sm, marginBottom: SPACING.xs }}>Devam et</Text>
          <FlatList horizontal showsHorizontalScrollIndicator={false} data={continueList} keyExtractor={x => `c${x.id}`} contentContainerStyle={{ gap: SPACING.sm }}
            renderItem={({ item: it }) => {
              const p = progress[localIdOf(it, "video")];
              const pct = p ? Math.min(1, p.current / p.duration) : 0;
              return (
                <FocusButton focusKey={`mc-cont-${it.id}`} onPress={() => onPressMedia(it)} focusRadius={RADIUS.sm} style={{ width: 150 }}>
                  <View style={[styles.contThumb, { backgroundColor: colors.surfaceTertiary }]}>
                    {thumbs[it.uri] ? <Image source={{ uri: thumbs[it.uri] }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="film-outline" size={22} color={colors.onSurfaceSecondary} />}
                    <View style={styles.progTrack}><View style={[styles.progFill, { width: `${pct * 100}%`, backgroundColor: colors.brandPrimary }]} /></View>
                  </View>
                  <Text style={{ color: colors.onSurface, fontSize: FONT.size.xs, marginTop: 4 }} numberOfLines={1}>{it.name.replace(/\.[^.]+$/, "")}</Text>
                </FocusButton>
              );
            }} />
        </View>
      )}
      <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }}>{items.length} öğe{query ? ` · "${query}"` : ""}</Text>
    </View>
  ) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="media-center-screen">
      <View style={styles.topbar}>
        <FocusButton testID="mc-back" focusKey="mc-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </FocusButton>
        <Text style={[styles.title, { color: colors.onSurface }]}>Medya Merkezi</Text>
        <FocusButton testID="mc-refresh" focusKey="mc-refresh" onPress={() => { if (mediaTab) void load(mediaTab, true); }} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={colors.onSurface} />
        </FocusButton>
      </View>

      <View style={styles.tabs}>
        {TABS.map(t => {
          const active = tab === t.k;
          const c = t.k !== "folders" ? counts[t.k] : undefined;
          return (
            <FocusButton key={t.k} testID={`mc-tab-${t.k}`} focusKey={`mc-tab-${t.k}`} onPress={() => switchTab(t.k)}
              style={[styles.tab, { backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary, borderColor: active ? colors.brandPrimary : colors.border }]}>
              <Ionicons name={t.icon} size={18} color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
              <Text style={{ color: active ? colors.onBrandPrimary : colors.onSurface, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }} numberOfLines={1}>{t.t}{c ? ` ${c}` : ""}</Text>
            </FocusButton>
          );
        })}
      </View>
      {pendingTab ? <ActivityIndicator size="small" color={colors.brandPrimary} style={{ marginBottom: SPACING.xs }} /> : null}

      {tab === "folders" ? (
        <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
          <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm }}>
            USB bellek, SD kart veya belirli bir klasörü gezmek, tek dosya açmak ve klasör sırasıyla oynatmak için klasör gezginini kullanın.
          </Text>
          <FocusButton focusKey="mc-open-folders" autoFocus onPress={() => router.push("/local-media")} style={[styles.action, { backgroundColor: colors.brandPrimary, alignSelf: "flex-start" }]}>
            <Ionicons name="folder-open" size={18} color={colors.onBrandPrimary} /><Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>Klasör gezginini aç</Text>
          </FocusButton>
        </View>
      ) : curPerm === "denied" || curPerm === "unavailable" ? (
        <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
          <Ionicons name="lock-open-outline" size={40} color={colors.brandPrimary} />
          <Text style={{ color: colors.onSurface, fontSize: FONT.size.lg, fontWeight: FONT.weight.bold }}>Cihazdaki {mediaTab === "audio" ? "müzikleri" : mediaTab === "video" ? "videoları" : "fotoğrafları"} bul</Text>
          <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm }}>
            Tüm cihazı taramak için medya erişim izni gerekir. İzin vermek istemezseniz "Klasörler" sekmesinden tek tek klasör seçebilirsiniz.
          </Text>
          <FocusButton focusKey="mc-perm" autoFocus onPress={() => void askPermission()} style={[styles.action, { backgroundColor: colors.brandPrimary, alignSelf: "flex-start" }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.onBrandPrimary} /><Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>İzin ver ve tara</Text>
          </FocusButton>
        </View>
      ) : (
        <FlatList
          ref={listRef as any}
          data={rows}
          keyExtractor={r => r.key}
          renderItem={renderRow}
          getItemLayout={getItemLayout}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: SPACING.xl }} color={colors.brandPrimary} /> :
            <Text style={{ color: colors.onSurfaceTertiary, textAlign: "center", marginTop: SPACING.xl }}>{query ? "Aramaya uyan öğe yok." : "Bu türde medya bulunamadı."}</Text>}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.xxxl }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScrollToIndexFailed={onScrollToIndexFailed}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={40}
          windowSize={11}
          removeClippedSubviews
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: FONT.size.xl, fontWeight: "700" },
  tabs: { flexDirection: "row", gap: SPACING.xs, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1 },
  search: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1 },
  note: { padding: SPACING.sm, borderRadius: RADIUS.sm, borderWidth: 1 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md },
  header2: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: ROW_GAP, overflow: "hidden" },
  vthumb: { width: 112, height: 63, borderRadius: RADIUS.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  athumb: { width: 56, height: 56, borderRadius: RADIUS.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  contThumb: { width: 150, height: 84, borderRadius: RADIUS.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  durBadge: { position: "absolute", right: 4, bottom: 6, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 3, paddingHorizontal: 4 },
  qBadge: { position: "absolute", left: 4, top: 4, borderRadius: 3, paddingHorizontal: 4 },
  durText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  progTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  progFill: { height: 3 },
});
