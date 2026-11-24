/**
 * KIZILKAN — Link Test & Ekle (v18.7.40)
 * ===========================================================================
 * HITHUNTER tarzı M3U/Xtream link testi: kullanıcı kirli/temiz TXT dosyası seçer
 * veya metin yapıştırır → içindeki get.php linkleri çıkarılır → HIZLI test
 * (durum/bitiş/maks bağlantı + kategori sayıları) → karta tıklayınca TAM
 * (Live/VOD/Series stream sayısı + kategori listeleri) → tek/çoklu/tümü seç → ekle.
 * MAC Portal sekmesi, aynı işi yapan mevcut "Çoklu MAC" motorunu açar.
 */
import React, { useState, useRef, useCallback } from "react";
import { View, Text, TextInput, ScrollView, Modal, ActivityIndicator, StyleSheet, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useProfiles } from "@/src/store/ProfileContext";
import { importHitRecord } from "@/src/utils/importHitRecord";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import {
  extractXtreamLinks, fastTestXtream, fullCountsXtream,
  type ExtractedLink, type FastTestResult, type FullCounts,
} from "@/src/utils/linkTest";

const linkKey = (l: ExtractedLink) => `${l.server}\u0000${l.username}\u0000${l.password}`;

export default function LinkTestScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { playlists, addPlaylist, addPreparedPlaylist, updatePlaylist } = usePlaylists();
  const { activeProfile } = useProfiles();

  const [tab, setTab] = useState<"m3u" | "mac">("m3u");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState("");
  const [links, setLinks] = useState<ExtractedLink[]>([]);
  const [extractInfo, setExtractInfo] = useState<{ found: number; dup: number } | null>(null);
  const [results, setResults] = useState<Record<string, FastTestResult | "testing">>({});
  const [fullCounts, setFullCounts] = useState<Record<string, FullCounts | "loading">>({});
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"live" | "vod" | "series">("live");
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState("");
  const [parallelText, setParallelText] = useState("6"); // v18.7.40: paralel test sayısı 1–50
  const abortRef = useRef<AbortController | null>(null);
  const parallelN = Math.max(1, Math.min(50, Number(parallelText) || 6));

  const resetResults = () => { setResults({}); setFullCounts({}); setSelected(new Set()); setTested(0); };

  const applyExtract = (text: string) => {
    const { links: found, duplicates } = extractXtreamLinks(text);
    setLinks(found);
    setExtractInfo({ found: found.length, dup: duplicates });
    resetResults();
    void recordDiagnostic("import", "LINK_TEST_EXTRACT", { found: found.length, duplicates, chars: text.length });
  };

  const onPaste = (text: string) => { setPasteText(text); setFileName(""); applyExtract(text); };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/*", "application/octet-stream"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri);
      setFileName(asset.name || "dosya.txt");
      setPasteText("");
      applyExtract(text);
    } catch (e: any) { Alert.alert("Dosya okunamadı", String(e?.message || e)); }
  };

  // Sınırlı paralellik havuzu
  const runPool = async <T,>(items: T[], worker: (item: T, index: number) => Promise<void>, concurrency = 6) => {
    let i = 0;
    const run = async () => { while (i < items.length) { const idx = i++; await worker(items[idx], idx); } };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  };

  const startTest = async () => {
    if (!links.length || testing) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setTesting(true); setTested(0); resetResults();
    const started = Date.now();
    const init: Record<string, "testing"> = {};
    links.forEach(l => { init[linkKey(l)] = "testing"; });
    setResults({ ...init });
    let done = 0;
    await runPool(links, async (link) => {
      if (ctrl.signal.aborted) return;
      const r = await fastTestXtream(link, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setResults(prev => ({ ...prev, [linkKey(link)]: r }));
      done++; setTested(done);
    }, parallelN);
    setTesting(false);
    void recordDiagnostic("import", "LINK_TEST_DONE", { total: links.length, durationMs: Date.now() - started, parallel: parallelN });
  };

  const loadFull = async (link: ExtractedLink) => {
    const key = linkKey(link);
    if (fullCounts[key]) return;
    setFullCounts(prev => ({ ...prev, [key]: "loading" }));
    try {
      const fc = await fullCountsXtream(link);
      setFullCounts(prev => ({ ...prev, [key]: fc }));
    } catch { setFullCounts(prev => { const n = { ...prev }; delete n[key]; return n; }); }
  };

  const openDetail = (link: ExtractedLink) => { setDetailKey(linkKey(link)); setDetailTab("live"); void loadFull(link); };

  const toggle = (key: string) => setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const okLinks = links.filter(l => { const r = results[linkKey(l)]; return r && r !== "testing" && r.ok; });
  const selectAll = () => setSelected(new Set(okLinks.map(linkKey)));
  const selectActive = () => setSelected(new Set(okLinks.filter(l => (results[linkKey(l)] as FastTestResult).active).map(linkKey)));
  const clearSel = () => setSelected(new Set());

  const addSelected = async () => {
    const chosen = links.filter(l => selected.has(linkKey(l)));
    if (!chosen.length || adding) return;
    setAdding(true);
    const ctrl = new AbortController();
    const owner = activeProfile.id;
    let ok = 0, failed = 0;
    const known = [...playlists];
    const started = Date.now();
    try {
      for (const link of chosen) {
        if (ctrl.signal.aborted) break;
        const r = results[linkKey(link)] as FastTestResult | undefined;
        const name = (r?.username || link.username) + " · " + link.server.replace(/^https?:\/\//, "");
        setProgress(`${ok + failed + 1}/${chosen.length} · ${name} ekleniyor…`);
        try {
          const t0 = Date.now();
          await importHitRecord(
            { id: "", kind: "xtream", name, server: link.server, username: link.username, password: link.password, sources: [], warnings: [] },
            {
              signal: ctrl.signal, ownerId: owner, owns: () => true, playlists: known,
              commit: async (pl, prepared) => { await (prepared ? addPreparedPlaylist : addPlaylist)(pl); known.push(pl); return true; },
              update: async (id, patch) => { await updatePlaylist(id, patch); const i = known.findIndex(p => p.id === id); if (i >= 0) known[i] = { ...known[i], ...patch }; },
              progress: (txt) => setProgress(txt),
            },
          );
          // C-telemetri: her hesabın ekleme süresi
          void recordDiagnostic("import", "LINK_TEST_ADD_ONE", { server: link.server.replace(/^https?:\/\//, ""), durationMs: Date.now() - t0 });
          ok++;
        } catch (e: any) { failed++; setProgress(`${name}: ${String(e?.message || e)}`); }
      }
      void recordDiagnostic("import", "LINK_TEST_ADD_DONE", { selected: chosen.length, added: ok, failed, durationMs: Date.now() - started });
      setProgress(`Tamamlandı: ${ok} eklendi · ${failed} eklenemedi/mevcut.`);
      if (ok > 0) { setSelected(new Set()); Alert.alert("Eklendi", `${ok} liste eklendi.${failed ? ` ${failed} eklenemedi/zaten mevcut.` : ""}`); }
    } finally { setAdding(false); }
  };

  const statusColor = (r: FastTestResult) => r.ok ? (r.active ? colors.success : colors.error) : colors.error;
  const detailLink = detailKey ? links.find(l => linkKey(l) === detailKey) : null;
  const detailResult = detailKey ? (results[detailKey] as FastTestResult | undefined) : undefined;
  const detailFull = detailKey ? fullCounts[detailKey] : undefined;

  const okCount = okLinks.length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top", "bottom"]} testID="link-test-screen">
      <View style={styles.header}>
        <FocusButton testID="link-test-back" autoFocus onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </FocusButton>
        <Text style={[styles.title, { color: colors.onSurface }]}>Link Test & Ekle</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Sekmeler */}
      <View style={[styles.tabs, { borderColor: colors.border }]}>
        {(["m3u", "mac"] as const).map(t => (
          <FocusButton key={t} onPress={() => setTab(t)} style={[styles.tab, { backgroundColor: tab === t ? colors.brandPrimary : "transparent" }]}>
            <Text style={{ color: tab === t ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontWeight: FONT.weight.bold }}>{t === "m3u" ? "M3U Linkleri" : "MAC Portal"}</Text>
          </FocusButton>
        ))}
      </View>

      {tab === "mac" ? (
        <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
          <Text style={{ color: colors.onSurface, fontSize: FONT.size.base, fontWeight: FONT.weight.bold }}>MAC Portal Testi</Text>
          <Text style={{ color: colors.onSurfaceSecondary, lineHeight: 20 }}>
            Portal adresi + MAC adreslerini (liste/aralık/dosya) girip test etmek, geçerli olanları seçip eklemek için
            mevcut "Çoklu MAC" ekranı kullanılır — aynı akış: test → seç → ekle. Paralel test sayısı (1–100) o ekranda ayarlanır.
          </Text>
          <FocusButton testID="open-mag-bulk" onPress={() => router.push("/mag-bulk")} style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary }]}>
            <Ionicons name="hardware-chip-outline" size={20} color={colors.onBrandPrimary} />
            <Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>Çoklu MAC / Portal Testini Aç</Text>
          </FocusButton>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl }} keyboardShouldPersistTaps="handled">
          {/* Giriş */}
          <Text style={[styles.sectionLabel, { color: colors.onSurfaceSecondary }]}>LİNKLERİ GİR</Text>
          <FocusButton testID="link-test-pick" onPress={pickFile} style={[styles.fileBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name="document-attach-outline" size={20} color={colors.brandPrimary} />
            <Text style={{ color: colors.onSurface }} numberOfLines={1}>{fileName || "TXT dosyası seç (kirli olsa da linkleri bulur)"}</Text>
          </FocusButton>
          <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginVertical: 6, textAlign: "center" }}>— veya metni buraya yapıştır —</Text>
          <TextInput
            testID="link-test-paste" value={pasteText} onChangeText={onPaste} multiline
            placeholder="get.php linklerini içeren metni yapıştır… (başka yazılar olsa da linkler ayıklanır)"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.paste, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
          />
          {extractInfo && (
            <Text style={{ color: extractInfo.found ? colors.success : colors.onSurfaceSecondary, marginTop: 8, fontWeight: FONT.weight.bold }}>
              {extractInfo.found} link bulundu{extractInfo.dup ? ` · ${extractInfo.dup} yinelenen atlandı` : ""}
            </Text>
          )}

          {links.length > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.md }}>
              <Text style={{ color: colors.onSurfaceSecondary }}>Paralel test (1–50):</Text>
              <TextInput testID="link-test-parallel" value={parallelText} onChangeText={t => setParallelText(t.replace(/[^0-9]/g, "").slice(0, 2))}
                keyboardType="number-pad" placeholder="6" placeholderTextColor={colors.onSurfaceTertiary}
                style={{ width: 60, textAlign: "center", borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, paddingVertical: 6 }} />
              <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, flex: 1 }}>Yüksek = hızlı ama ban riski artar</Text>
            </View>
          )}
          {links.length > 0 && (
            <FocusButton testID="link-test-start" disabled={testing} onPress={startTest} style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary, marginTop: SPACING.sm, opacity: testing ? 0.6 : 1 }]}>
              {testing ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="flash" size={20} color={colors.onBrandPrimary} />}
              <Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>{testing ? `Test ediliyor… ${tested}/${links.length}` : `Testi Başlat (${links.length})`}</Text>
            </FocusButton>
          )}

          {/* Seçim çubuğu */}
          {okCount > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.md }}>
              <FocusButton onPress={selectAll} style={[styles.chip, { borderColor: colors.border }]}><Text style={{ color: colors.brandPrimary }}>Tümünü Seç ({okCount})</Text></FocusButton>
              <FocusButton onPress={selectActive} style={[styles.chip, { borderColor: colors.border }]}><Text style={{ color: colors.brandPrimary }}>Aktifleri Seç</Text></FocusButton>
              {selected.size > 0 && <FocusButton onPress={clearSel} style={[styles.chip, { borderColor: colors.border }]}><Text style={{ color: colors.error }}>Seçimi Kaldır</Text></FocusButton>}
            </View>
          )}

          {/* Sonuç kartları */}
          {links.map(link => {
            const key = linkKey(link);
            const r = results[key];
            const sel = selected.has(key);
            return (
              <FocusButton key={key} onPress={() => { if (r && r !== "testing" && r.ok) openDetail(link); }}
                style={[styles.card, { borderColor: sel ? colors.brandPrimary : colors.border, backgroundColor: colors.surfaceSecondary }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
                  {r && r !== "testing" && r.ok && (
                    <FocusButton onPress={() => toggle(key)} hitSlop={10} style={{ padding: 2 }}>
                      <Ionicons name={sel ? "checkbox" : "square-outline"} size={22} color={sel ? colors.brandPrimary : colors.onSurfaceTertiary} />
                    </FocusButton>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold }} numberOfLines={1}>
                      {r && r !== "testing" ? (r.username || link.username) : link.username}
                    </Text>
                    <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }} numberOfLines={1}>{link.server.replace(/^https?:\/\//, "")}</Text>
                  </View>
                  {r === "testing" ? <ActivityIndicator color={colors.brandPrimary} /> :
                    r ? <View style={[styles.badge, { backgroundColor: statusColor(r) + "22" }]}><Text style={{ color: statusColor(r), fontWeight: FONT.weight.bold, fontSize: FONT.size.xs }}>{r.ok ? r.status : "HATA"}</Text></View> : null}
                </View>
                {r && r !== "testing" && r.ok && (
                  <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs }}>📅 {r.expDate}</Text>
                    <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs }}>🔌 {r.activeCons}/{r.maxConnections}</Text>
                    <Text style={{ color: colors.success, fontSize: FONT.size.xs }}>Live: {r.liveCats.length}</Text>
                    <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs }}>VOD: {r.vodCats.length}</Text>
                    <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs }}>Series: {r.seriesCats.length}</Text>
                  </View>
                )}
                {r && r !== "testing" && !r.ok && <Text style={{ color: colors.error, fontSize: FONT.size.xs, marginTop: 4 }}>{r.error}</Text>}
              </FocusButton>
            );
          })}
        </ScrollView>
      )}

      {/* Alt ekle çubuğu */}
      {tab === "m3u" && selected.size > 0 && (
        <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {!!progress && <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, marginBottom: 6 }} numberOfLines={2}>{progress}</Text>}
          <FocusButton testID="link-test-add" disabled={adding} onPress={addSelected} style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary, opacity: adding ? 0.6 : 1 }]}>
            {adding ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="add-circle-outline" size={20} color={colors.onBrandPrimary} />}
            <Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>{adding ? "Ekleniyor…" : `${selected.size} Listeyi Ekle`}</Text>
          </FocusButton>
        </View>
      )}

      {/* Detay modalı */}
      <Modal visible={!!detailKey} transparent animationType="slide" onRequestClose={() => setDetailKey(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, maxHeight: "85%" }}>
            <View style={{ padding: SPACING.lg }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold, fontSize: FONT.size.lg }} numberOfLines={1}>{detailResult?.username || detailLink?.username}</Text>
                <FocusButton onPress={() => setDetailKey(null)} hitSlop={10}><Ionicons name="close" size={24} color={colors.onSurface} /></FocusButton>
              </View>
              {detailResult && (
                <Text style={{ color: colors.onSurfaceSecondary, marginTop: 4, fontSize: FONT.size.sm }}>
                  {detailResult.status} · Bitiş {detailResult.expDate} · {detailResult.activeCons}/{detailResult.maxConnections} bağlantı{detailResult.timezone ? ` · ${detailResult.timezone}` : ""}
                </Text>
              )}
              {/* Tam sayım */}
              <View style={{ flexDirection: "row", gap: SPACING.md, marginTop: SPACING.md }}>
                {(["live", "vod", "series"] as const).map(k => {
                  const full = detailFull && detailFull !== "loading" ? detailFull : null;
                  const n = full ? (k === "live" ? full.liveCount : k === "vod" ? full.vodCount : full.seriesCount) : null;
                  const label = k === "live" ? "Live" : k === "vod" ? "VOD" : "Series";
                  return (
                    <View key={k} style={{ flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: "center" }}>
                      <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold, fontSize: FONT.size.lg }}>{detailFull === "loading" ? "…" : (n ?? "-")}</Text>
                      <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }}>{label}</Text>
                    </View>
                  );
                })}
              </View>
              {/* Kategori sekmeleri */}
              <View style={{ flexDirection: "row", marginTop: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                {(["live", "vod", "series"] as const).map(k => {
                  const cats = detailResult ? (k === "live" ? detailResult.liveCats : k === "vod" ? detailResult.vodCats : detailResult.seriesCats) : [];
                  return (
                    <FocusButton key={k} onPress={() => setDetailTab(k)} style={{ flex: 1, paddingVertical: SPACING.sm, borderBottomWidth: 2, borderBottomColor: detailTab === k ? colors.brandPrimary : "transparent" }}>
                      <Text style={{ color: detailTab === k ? colors.brandPrimary : colors.onSurfaceSecondary, textAlign: "center", fontWeight: FONT.weight.bold }}>
                        {(k === "live" ? "Live" : k === "vod" ? "VOD" : "Series")} ({cats.length})
                      </Text>
                    </FocusButton>
                  );
                })}
              </View>
            </View>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg }}>
              {(detailResult ? (detailTab === "live" ? detailResult.liveCats : detailTab === "vod" ? detailResult.vodCats : detailResult.seriesCats) : []).map(c => (
                <View key={String(c.category_id)} style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                  <View style={{ backgroundColor: colors.brandPrimary + "22", borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>#{c.category_id}</Text>
                  </View>
                  <Text style={{ color: colors.onSurface, flex: 1 }} numberOfLines={1}>{c.category_name}</Text>
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  tabs: { flexDirection: "row", marginHorizontal: SPACING.lg, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md, overflow: "hidden" },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: "center" },
  sectionLabel: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1, marginBottom: SPACING.sm },
  fileBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md },
  paste: { minHeight: 110, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, textAlignVertical: "top" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.pill },
  card: { padding: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, marginTop: SPACING.sm },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm },
  footer: { padding: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
});
