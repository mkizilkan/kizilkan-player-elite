import React, { useEffect, useMemo, useState, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, Modal, Pressable, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import * as ScreenOrientation from "expo-screen-orientation";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useTv } from "@/src/store/TvContext";
import { useProfiles } from "@/src/store/ProfileContext";
import { useParental } from "@/src/store/ParentalContext";
import { isAdultContent } from "@/src/utils/adult";
import { categoryAccess } from "@/src/player/categoryAccess";
import { resolveLivePlayback } from "@/src/player/resolveLivePlayback";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import type { PlaybackRequest } from "@/src/player/v2/types";

type Layout = 2 | 4;

const MAX_SLOTS = 4;

export default function MultiView() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activePlaylist, playlists } = usePlaylists();
  const { isTv } = useTv();
  const { activeProfile } = useProfiles();
  const { settings: parental, isCategoryLocked, isUnlockedInSession } = useParental();
  const [layout, setLayout] = useState<Layout>(2);
  const [slotUrls, setSlotUrls] = useState<(string | null)[]>([null, null, null, null]);
  const [slotNames, setSlotNames] = useState<(string | null)[]>([null, null, null, null]);
  const [slotRequests, setSlotRequests] = useState<(PlaybackRequest | null)[]>([null, null, null, null]);
  const slotItemsRef = useRef<any[]>([null, null, null, null]);
  const [nativeChannels, setNativeChannels] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [resolvingSlot, setResolvingSlot] = useState<number | null>(null);
  const selectionGeneration = useRef(0);
  const selectionScope = useRef("");
  selectionScope.current = activeProfile.id;
  const allowItemRef = useRef<(item: any) => boolean>(() => true);
  allowItemRef.current = item => (!parental.adultHidden || !isAdultContent(item)) && categoryAccess(item.group, !!activeProfile.isKids, isCategoryLocked, isUnlockedInSession) === "allowed";
  const [audioSlot, setAudioSlot] = useState<number>(0);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  /** true: tüm listelerden seç, false: yalnızca aktif liste (v8.0.0) */
  const [allChannelsMode, setAllChannelsMode] = useState(true);

  useEffect(() => {
    if (isTv) return;
    (async () => { try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE); } catch {} })();
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {}); };
  }, [isTv]);
  useEffect(() => {
    selectionGeneration.current += 1;
    setSlotUrls([null, null, null, null]); setSlotNames([null, null, null, null]); setSlotRequests([null, null, null, null]); setResolvingSlot(null);
  }, [activeProfile.id]);
  useEffect(() => () => { selectionGeneration.current += 1; }, []);

  const pickerSources = useMemo(() => allChannelsMode ? playlists : activePlaylist ? [activePlaylist] : [], [allChannelsMode, playlists, activePlaylist]);
  useEffect(() => {
    let cancelled = false;
    setNativeChannels([]);
    if (!KizilkanNativeCore.available || pickerFor === null) { setPickerLoading(false); return; }
    setPickerLoading(true);
    const timer = setTimeout(() => {
      // Fair shares keep every selected provider discoverable within the small
      // picker window; a search is queried against each complete Room catalog.
      const limit = Math.max(1, Math.ceil(300 / Math.max(1, pickerSources.length)));
      void Promise.all(pickerSources.map(async pl => {
        const page = await KizilkanNativeCore.queryItems<any>(pl.id, "live", { offset: 0, limit, search: search.trim() });
        return (page.items || []).map(item => ({ ...item, __plId: pl.id, __plName: pl.name }));
      })).then(rows => { if (!cancelled) setNativeChannels(rows.flat().slice(0, 300)); })
        .catch((e: any) => { if (!cancelled) Alert.alert("Kanallar yüklenemedi", String(e?.message || e)); })
        .finally(() => { if (!cancelled) setPickerLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pickerSources, search, pickerFor === null, activeProfile.id]);

  const activeSlots = layout === 2 ? [0, 1] : [0, 1, 2, 3];
  useEffect(() => { if (audioSlot >= layout) setAudioSlot(0); }, [layout, audioSlot]);
  /**
   * ÇOKLU LİSTE DESTEĞİ (v8.0.0 — kullanıcı isteği)
   * Kanallar artık YALNIZCA aktif listeden değil, TÜM listelerden seçilebilir.
   * Böylece 4 pencereye farklı sağlayıcılardan kanal konulabiliyor.
   * Her kanalın yanında hangi listeden geldiği yazıyor.
   *
   * NOT: Yalnızca BELLEĞE YÜKLÜ listelerin kanalları görünür. Ağır veriler
   * (kanal dizileri) tembel yüklendiği için, hiç açılmamış bir listenin
   * kanalları burada listelenmez — o listeyi bir kez açmak yeterlidir.
   */
  const filteredChannels = useMemo(() => {
    const t = search.trim().toLocaleLowerCase("tr");
    const out: any[] = [];
    const allowed = (item: any) => (!parental.adultHidden || !isAdultContent(item)) && categoryAccess(item.group, !!activeProfile.isKids, isCategoryLocked, isUnlockedInSession) !== "blocked";
    if (KizilkanNativeCore.available) return nativeChannels.filter(allowed);

    const sources = allChannelsMode
      ? playlists
      : (activePlaylist ? [activePlaylist] : []);

    for (const pl of sources) {
      const chans = (pl as any).channels as any[] | undefined;
      if (!chans || chans.length === 0) continue;   // henüz yüklenmemiş liste
      for (const c of chans) {
        if (!allowed(c)) continue;
        if (t && !String(c.name || "").toLocaleLowerCase("tr").includes(t)) continue;
        out.push({ ...c, __plName: pl.name, __plId: pl.id });
        if (out.length >= 300) break;
      }
      if (out.length >= 300) break;
    }
    return out;
  }, [allChannelsMode, playlists, activePlaylist, search, nativeChannels, parental.adultHidden, activeProfile.isKids, isCategoryLocked, isUnlockedInSession]);

  const pickChannel = async (slot: number, candidate: any) => {
    const access = categoryAccess(candidate.group, !!activeProfile.isKids, isCategoryLocked, isUnlockedInSession);
    if (access === "blocked") return;
    if (access === "pin") { setPickerFor(null); router.push({ pathname: "/pin-entry", params: { category: String(candidate.group) } }); return; }
    const playlist = playlists.find(pl => pl.id === candidate.__plId);
    if (!playlist || resolvingSlot !== null) return;
    const generation = ++selectionGeneration.current;
    const profileId = selectionScope.current;
    setResolvingSlot(slot);
    try {
      const { item, request } = await resolveLivePlayback(playlist, candidate, { allowItem: item => profileId === selectionScope.current && allowItemRef.current(item) });
      if (generation !== selectionGeneration.current || profileId !== selectionScope.current) return;
      const resolvedAccess = categoryAccess(item.group, !!activeProfile.isKids, isCategoryLocked, isUnlockedInSession);
      if (resolvedAccess !== "allowed" || !allowItemRef.current(item)) throw new Error("Bu kanal ebeveyn kontrolü nedeniyle açılamaz.");
      setSlotRequests(prev => prev.map((r, i) => i === slot ? request : r));
      slotItemsRef.current[slot] = item;
      setSlotUrls(prev => prev.map((url, i) => i === slot ? request.url : url));
      setSlotNames(prev => prev.map((name, i) => i === slot ? String(item.name) : name));
      setPickerFor(null);
    } catch (e: any) { if (generation === selectionGeneration.current) Alert.alert("Kanal açılamadı", String(e?.message || e)); }
    finally { if (generation === selectionGeneration.current) setResolvingSlot(null); }
  };

  const clearSlot = (slot: number) => {
    selectionGeneration.current += 1; setResolvingSlot(null);
    slotItemsRef.current[slot] = null;
    setSlotRequests(prev => prev.map((r, i) => i === slot ? null : r));
    const nextUrls = [...slotUrls]; nextUrls[slot] = null; setSlotUrls(nextUrls);
    const nextNames = [...slotNames]; nextNames[slot] = null; setSlotNames(nextNames);
  };
  const dismissPicker = () => { selectionGeneration.current += 1; setResolvingSlot(null); setPickerFor(null); };

  const goBack = async () => {
    if (!isTv) { try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT); } catch {} }
    router.back();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: "#000" }]} /**
       * GÜVENLİ ALAN (v8.7.0 — kullanıcı bildirimi)
       * edges={[]} idi: hiçbir kenar korunmuyordu, bu yüzden 2/4 ekran
       * düzeni telefonun bildirim çubuğu ve gezinme çubuğuyla ÇAKIŞIYORDU.
       * Artık üst ve alt kenarlar korunuyor; yatayda tam genişlik kalıyor.
       */
      edges={["top", "bottom"]} testID="multi-view-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="mv-back-btn" onPress={goBack} hitSlop={12} style={styles.hBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Çoklu Ekran</Text>
        <View style={styles.layoutSwitch}>
          <TouchableOpacity testID="mv-layout-2" onPress={() => setLayout(2)} style={[styles.layoutBtn, layout === 2 && { backgroundColor: colors.brandPrimary }]}>
            <Text style={[styles.layoutText, { color: layout === 2 ? colors.onBrandPrimary : "#fff" }]}>2 Ekran</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="mv-layout-4" onPress={() => setLayout(4)} style={[styles.layoutBtn, layout === 4 && { backgroundColor: colors.brandPrimary }]}>
            <Text style={[styles.layoutText, { color: layout === 4 ? colors.onBrandPrimary : "#fff" }]}>4 Ekran</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.grid, layout === 2 ? styles.grid2 : styles.grid4]}>
        {activeSlots.map((slot) => (
          <Slot
            key={slot}
            index={slot}
            url={slotItemsRef.current[slot] && allowItemRef.current(slotItemsRef.current[slot]) ? slotUrls[slot] : null}
            name={slotNames[slot]}
            request={slotItemsRef.current[slot] && allowItemRef.current(slotItemsRef.current[slot]) ? slotRequests[slot] : null}
            isAudio={audioSlot === slot}
            onPickChannel={() => setPickerFor(slot)}
            onSetAudio={() => setAudioSlot(slot)}
            onClear={() => clearSlot(slot)}
          />
        ))}
      </View>

      {/* Channel picker modal */}
      <Modal visible={pickerFor !== null} transparent animationType="fade" onRequestClose={dismissPicker}>
        <Pressable style={styles.pickerBg} onPress={dismissPicker}>
          <Pressable style={[styles.pickerCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.pickerTitle, { color: colors.onSurface }]}>Ekran {(pickerFor ?? 0) + 1} için kanal seç</Text>

            {/* KAYNAK SEÇİMİ (v8.0.0): tüm listeler mi, sadece aktif liste mi */}
            {playlists.length > 1 && (
              <TouchableOpacity
                testID="mv-source-toggle"
                onPress={() => setAllChannelsMode(v => !v)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8,
                  borderRadius: 10, backgroundColor: colors.surfaceSecondary,
                  borderWidth: 1, borderColor: colors.border,
                }}
              >
                <Ionicons
                  name={allChannelsMode ? "layers" : "layers-outline"}
                  size={16}
                  color={colors.brandPrimary}
                />
                <Text style={{ color: colors.onSurface, fontSize: 13, flex: 1 }}>
                  {allChannelsMode
                    ? `Tüm listeler (${playlists.length})`
                    : `Yalnızca: ${activePlaylist?.name || "-"}`}
                </Text>
                <Text style={{ color: colors.brandPrimary, fontSize: 12, fontWeight: "700" }}>DEĞİŞTİR</Text>
              </TouchableOpacity>
            )}
            <View style={[styles.searchWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.onSurfaceSecondary} />
              <TextInput
                testID="mv-picker-search"
                value={search}
                onChangeText={setSearch}
                placeholder="Kanal ara..."
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.searchInput, { color: colors.onSurface }]}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.onSurfaceSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <FlatList
                data={filteredChannels}
                keyExtractor={c => `${c.__plId}:${c.id}`}
                initialNumToRender={12}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    testID={`mv-pick-${item.id}`}
                    onPress={() => { if (pickerFor !== null) void pickChannel(pickerFor, item); }}
                    style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                  >
                    <Ionicons name="tv-outline" size={18} color={colors.onSurfaceSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerRowText, { color: colors.onSurface }]} numberOfLines={1}>{item.name}</Text>
                      {/* Hangi listeden geldiği (v8.0.0) — farklı sağlayıcılar karışmasın */}
                      {allChannelsMode && item.__plName ? (
                        <Text style={{ color: colors.onSurfaceTertiary, fontSize: 11 }} numberOfLines={1}>
                          {item.__plName}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.pickerRowGroup, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{item.group}</Text>
                  </TouchableOpacity>
                )}
              />
              {(pickerLoading || resolvingSlot !== null) && <ActivityIndicator color={colors.brandPrimary} />}
            </View>
            <TouchableOpacity onPress={dismissPicker} style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold }}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Slot({ index, url, name, request, isAudio, onPickChannel, onSetAudio, onClear }: {
  index: number; url: string | null; name: string | null; isAudio: boolean;
  request: PlaybackRequest | null;
  onPickChannel: () => void; onSetAudio: () => void; onClear: () => void;
}) {
  const { colors } = useTheme();
  const mediaSource = useMemo(() => request ? { uri: request.url, headers: request.headers, contentType: request.contentType === "auto" ? undefined : request.contentType } : null, [request]);
  const player = useVideoPlayer(mediaSource, (p) => { p.loop = false; if (request) p.play(); });
  useEffect(() => { if (request) { try { player.play(); } catch {} } }, [player, request]);

  useEffect(() => {
    if (!player) return;
    try { (player as any).muted = !isAudio; } catch {}
  }, [isAudio, player]);

  return (
    <View testID={`mv-slot-${index}`} style={[styles.slot, { borderColor: isAudio ? colors.brandPrimary : "#222" }]}>
      {url ? (
        <>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
          <View style={styles.slotOverlay} pointerEvents="box-none">
            <View style={styles.slotTop}>
              <Text style={styles.slotName} numberOfLines={1}>{name}</Text>
              <TouchableOpacity testID={`mv-clear-${index}`} onPress={onClear} style={styles.slotBtn} hitSlop={8}>
                <Ionicons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.slotBottom}>
              <TouchableOpacity testID={`mv-audio-${index}`} onPress={onSetAudio} style={[styles.audioBtn, isAudio && { backgroundColor: colors.brandPrimary }]}>
                <Ionicons name={isAudio ? "volume-high" : "volume-mute"} size={14} color="#fff" />
                <Text style={styles.audioText}>{isAudio ? "SES AÇIK" : "SESSİZ"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        <TouchableOpacity testID={`mv-add-${index}`} onPress={onPickChannel} style={styles.emptySlot}>
          <Ionicons name="add-circle-outline" size={38} color="#666" />
          <Text style={styles.emptyText}>Kanal Seç</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: "rgba(0,0,0,0.7)",
  },
  hBtn: { padding: 4 },
  title: { color: "#fff", fontSize: FONT.size.lg, fontWeight: FONT.weight.bold, flex: 1 },
  layoutSwitch: { flexDirection: "row", backgroundColor: "#222", borderRadius: RADIUS.pill, padding: 2 },
  layoutBtn: { paddingHorizontal: SPACING.md, height: 32, borderRadius: RADIUS.pill, justifyContent: "center" },
  layoutText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  grid: { flex: 1, padding: SPACING.xs, gap: SPACING.xs },
  grid2: { flexDirection: "row" },
  grid4: { flexDirection: "row", flexWrap: "wrap" },
  slot: {
    flex: 1, minWidth: "48%", minHeight: "48%",
    backgroundColor: "#000",
    borderWidth: 2,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    position: "relative",
  },
  slotOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between", padding: SPACING.sm },
  slotTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  slotName: { color: "#fff", flex: 1, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 3 },
  slotBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  slotBottom: { flexDirection: "row" },
  audioBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: RADIUS.sm, backgroundColor: "rgba(0,0,0,0.6)" },
  audioText: { color: "#fff", fontSize: 9, fontWeight: FONT.weight.black, letterSpacing: 1 },
  emptySlot: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyText: { color: "#666", fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  pickerBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: SPACING.lg },
  pickerCard: { flex: 1, maxHeight: "80%", padding: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1 },
  pickerTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold, marginBottom: SPACING.md },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    height: 44, borderRadius: RADIUS.pill, borderWidth: 1,
    paddingHorizontal: SPACING.md, marginBottom: SPACING.md,
  },
  searchInput: { flex: 1, fontSize: FONT.size.base, height: "100%" },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  pickerRowText: { flex: 1, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  pickerRowGroup: { fontSize: FONT.size.xs },
  closeBtn: { height: 44, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginTop: SPACING.md },
});
