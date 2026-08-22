import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ScrollView, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useLibrary } from "@/src/store/LibraryContext";
import { useParental } from "@/src/store/ParentalContext";
import { isAdultContent } from "@/src/utils/adult";
import { useProfiles } from "@/src/store/ProfileContext";
import { ChannelRow } from "@/src/components/ChannelRow";
import { fuzzySearch, normalize } from "@/src/utils/fuzzy";
import { haptic } from "@/src/utils/haptic";
import type { Channel, VodItem, SeriesItem } from "@/src/types";
import { FocusButton } from "@/src/components/FocusButton";

type Scope = "all" | "live" | "vod" | "series";

export default function SearchTab() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activePlaylist, toggleFavorite, isFavorite, addToRecent, favorites, recent, ensureHeavyLoaded } = usePlaylists();

  // v15.2 Native Core: legacy ekran tam koleksiyon ister.
  useEffect(() => {
    if (activePlaylist?.id) void ensureHeavyLoaded(activePlaylist.id);
  }, [activePlaylist?.id, ensureHeavyLoaded]);
  const { searchHistory, pushSearch, clearSearchHistory, isItemHidden, isGroupHidden, hiddenModeUnlocked } = useLibrary();
  const { settings: parental, isCategoryLocked, isUnlockedInSession } = useParental();
  const { activeProfile } = useProfiles();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");

  const requiresPin = (group?: string | null) => {
    if (!group) return false;
    if (!isCategoryLocked(group)) return false;
    return !isUnlockedInSession(group);
  };

  // Filter out hidden items & (for kids) locked categories
  const applyBaseFilter = <T extends { id: string; group?: string | null }>(list: T[]) => {
    return list.filter(x => {
      if (parental.adultHidden && isAdultContent(x)) return false;
      if (activeProfile?.isKids && isCategoryLocked(x.group || "")) return false;
      if (!hiddenModeUnlocked) {
        if (isItemHidden(x.id)) return false;
        if (x.group && isGroupHidden(x.group)) return false;
      }
      return true;
    });
  };

  const liveChannels = useMemo<Channel[]>(() => applyBaseFilter(activePlaylist?.channels || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePlaylist?.channels, activeProfile?.isKids, hiddenModeUnlocked, parental.adultHidden]);
  const vodItems = useMemo<VodItem[]>(() => applyBaseFilter(activePlaylist?.vod || []) as VodItem[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePlaylist?.vod, activeProfile?.isKids, hiddenModeUnlocked, parental.adultHidden]);
  const seriesItems = useMemo<SeriesItem[]>(() => applyBaseFilter(activePlaylist?.series || []) as SeriesItem[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePlaylist?.series, activeProfile?.isKids, hiddenModeUnlocked, parental.adultHidden]);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ARAMA PERFORMANSI (v9.2.0 — kullanıcı bildirimi: "geç tepki veriyor")
   * ═══════════════════════════════════════════════════════════════════════
   * SORUN: Her tuş vuruşunda 40.000+ öğede (7.265 kanal + 27.761 film +
   * 5.486 dizi) bulanık arama çalışıyordu. Sekme değiştirmek de aynı ağır
   * hesabı tetikliyordu.
   *
   * ÇÖZÜM — İKİ KATMAN:
   *  1) GECİKME (debounce): kullanıcı yazmayı bıraktıktan 220 ms sonra aranır.
   *     Hızlı yazarken ara sonuçlar hesaplanmaz.
   *  2) ÖN ELEME: önce hızlı "içeriyor mu" süzgeci ile aday küme daraltılır,
   *     bulanık arama YALNIZCA bu küçük kümede çalışır.
   *     40.000 öğe -> genelde birkaç yüz aday.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 220);
    return () => clearTimeout(t);
  }, [q]);

  /** Hızlı ön eleme: bulanık aramadan önce adayları daraltır.
   * v9.13.0 DÜZELTME: v9.12'de subsequence yapılmıştı; çok gevşek olduğu için
   * "sakin" → "Şaka Bi' Yana" gibi ALAKASIZ sonuçlar çıkıyordu (kullanıcı
   * bildirdi). Normalize edilmiş SUBSTRING'e döndürüldü: Türkçe toleransı korunur
   * (türkiye↔turkiye), alaka geri gelir, çöp gider. fuzzySearch adayları sıralar.
   * (Eksik-harf toleransı ileride ön-normalize indeksiyle güvenle eklenir.) */
  const preFilter = useCallback(<T,>(list: T[], getText: (x: T) => (string | undefined | null)[]) => {
    const needle = normalize(debouncedQ.trim());
    if (!needle) return [] as T[];
    const out: T[] = [];
    for (const item of list) {
      const fields = getText(item);
      for (const f of fields) {
        if (f && normalize(String(f)).includes(needle)) { out.push(item); break; }
      }
      if (out.length >= 1500) break;
    }
    return out;
  }, [debouncedQ]);

  const liveResults = useMemo(() => {
    if (!debouncedQ.trim() || (scope !== "all" && scope !== "live")) return [];
    const cand = preFilter(liveChannels, (c: any) => [c.name, c.group, c.tvg_name]);
    return fuzzySearch(cand, debouncedQ, (c) => [c.name, c.group, c.tvg_name], 60);
  }, [liveChannels, debouncedQ, scope, preFilter]);

  const vodResults = useMemo(() => {
    if (!debouncedQ.trim() || (scope !== "all" && scope !== "vod")) return [];
    const cand = preFilter(vodItems, (v: any) => [v.name, v.group, String(v.year || "")]);
    return fuzzySearch(cand, debouncedQ, (v) => [v.name, v.group, String(v.year || "")], 60);
  }, [vodItems, debouncedQ, scope, preFilter]);

  const seriesResults = useMemo(() => {
    if (!debouncedQ.trim() || (scope !== "all" && scope !== "series")) return [];
    const cand = preFilter(seriesItems, (x: any) => [x.name, x.group, x.cast, x.director, x.genre]);
    return fuzzySearch(cand, debouncedQ, (s) => [s.name, s.group, s.cast, s.director, s.genre], 60);
  }, [seriesItems, debouncedQ, scope, preFilter]);

  const totalResults = liveResults.length + vodResults.length + seriesResults.length;

  const openChannel = (ch: Channel) => {
    haptic.light();
    if (requiresPin(ch.group)) {
      router.push({ pathname: "/pin-entry", params: { category: ch.group } });
      return;
    }
    pushSearch(q);
    addToRecent(ch.id);
    router.push({ pathname: "/player", params: { id: ch.id } });
  };
  const openDetail = (item: { id: string; group?: string | null }, type: "vod" | "series") => {
    haptic.light();
    if (requiresPin(item.group)) {
      router.push({ pathname: "/pin-entry", params: { category: item.group } });
      return;
    }
    pushSearch(q);
    router.push({ pathname: "/detail", params: { type, id: item.id } });
  };

  const trending = useMemo(() => {
    // top favorites first, then recent
    if (!activePlaylist) return [] as Channel[];
    const map = new Map(activePlaylist.channels.map(c => [c.id, c]));
    const ids = Array.from(new Set([...favorites, ...recent])).slice(0, 8);
    return ids.map(id => map.get(id)).filter(Boolean) as Channel[];
  }, [activePlaylist, favorites, recent]);

  const commitSearch = useCallback(() => {
    if (q.trim()) pushSearch(q);
  }, [q, pushSearch]);

  const scopeChips: { key: Scope; label: string; icon: string; count?: number }[] = [
    { key: "all", label: "Tümü", icon: "apps", count: totalResults || undefined },
    { key: "live", label: "Kanallar", icon: "tv", count: liveResults.length || undefined },
    { key: "vod", label: "Filmler", icon: "film", count: vodResults.length || undefined },
    { key: "series", label: "Diziler", icon: "albums", count: seriesResults.length || undefined },
  ];

  const showResults = q.trim().length > 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="search-screen">
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Ara</Text>
        {showResults && (
          <Text style={[styles.count, { color: colors.onSurfaceSecondary }]}>{totalResults} sonuç</Text>
        )}
      </View>

      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.onSurfaceSecondary} />
          <TextInput
            testID="search-input"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={commitSearch}
            placeholder="Kanal, film, dizi, oyuncu..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.searchInput, { color: colors.onSurface }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {q.length > 0 && (
            <FocusButton onPress={() => setQ("")} hitSlop={10} testID="search-clear-btn">
              <Ionicons name="close-circle" size={20} color={colors.onSurfaceSecondary} />
            </FocusButton>
          )}
        </View>
      </View>

      <View style={styles.chipRowContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {scopeChips.map(c => {
            const active = scope === c.key;
            return (
              <FocusButton
                key={c.key}
                testID={`search-scope-${c.key}`}
                onPress={() => { haptic.soft(); setScope(c.key); }}
                style={[
                  styles.chip,
                  { backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary, borderColor: active ? colors.brandPrimary : colors.border },
                ]}
              >
                <Ionicons name={c.icon as any} size={13} color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
                <Text style={[styles.chipText, { color: active ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>
                  {c.label}{c.count ? ` (${c.count})` : ""}
                </Text>
              </FocusButton>
            );
          })}
        </ScrollView>
      </View>

      {!showResults ? (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl }}>
          {searchHistory.length > 0 && (
            <>
              <View style={styles.sectionHead}>
                <Ionicons name="time-outline" size={16} color={colors.onSurfaceSecondary} />
                <Text style={[styles.sectionTitle, { color: colors.onSurfaceSecondary }]}>Son Aramalar</Text>
                <FocusButton testID="clear-search-history-btn" onPress={clearSearchHistory} hitSlop={8}>
                  <Text style={[styles.clearText, { color: colors.brandPrimary }]}>Temizle</Text>
                </FocusButton>
              </View>
              <View style={styles.tagRow}>
                {searchHistory.map(term => (
                  <FocusButton
                    key={term}
                    testID={`search-history-${term}`}
                    onPress={() => setQ(term)}
                    style={[styles.tag, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  >
                    <Ionicons name="return-up-back" size={12} color={colors.onSurfaceSecondary} />
                    <Text style={[styles.tagText, { color: colors.onSurface }]} numberOfLines={1}>{term}</Text>
                  </FocusButton>
                ))}
              </View>
            </>
          )}

          {trending.length > 0 && (
            <>
              <View style={styles.sectionHead}>
                <Ionicons name="flame" size={16} color={colors.brandPrimary} />
                <Text style={[styles.sectionTitle, { color: colors.onSurfaceSecondary }]}>Popüler / Son İzlenen</Text>
              </View>
              <View style={styles.trendGrid}>
                {trending.map(ch => (
                  <FocusButton
                    key={ch.id}
                    testID={`trend-${ch.id}`}
                    onPress={() => openChannel(ch)}
                    style={[styles.trendCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  >
                    <View style={[styles.trendLogo, { backgroundColor: colors.surfaceTertiary }]}>
                      {ch.logo ? (
                        <Image source={{ uri: ch.logo }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                      ) : (
                        <Ionicons name="tv-outline" size={20} color={colors.onSurfaceSecondary} />
                      )}
                    </View>
                    <Text style={[styles.trendName, { color: colors.onSurface }]} numberOfLines={1}>{ch.name}</Text>
                  </FocusButton>
                ))}
              </View>
            </>
          )}

          {searchHistory.length === 0 && trending.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={54} color={colors.onSurfaceSecondary} />
              <Text style={[styles.emptyText, { color: colors.onSurfaceSecondary }]}>
                Kanal, film, dizi veya oyuncu adı yazın
              </Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={[]}
          renderItem={() => null}
          keyExtractor={() => ""}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              {liveResults.length > 0 && (
                <>
                  <SectionHeader icon="tv" label={`Kanallar (${liveResults.length})`} />
                  {liveResults.map(r => (
                    <ChannelRow
                      key={r.item.id}
                      channel={r.item}
                      isFavorite={isFavorite(r.item.id)}
                      onToggleFavorite={() => { haptic.soft(); toggleFavorite(r.item.id); }}
                      onPress={() => openChannel(r.item)}
                    />
                  ))}
                </>
              )}
              {vodResults.length > 0 && (
                <>
                  <SectionHeader icon="film" label={`Filmler (${vodResults.length})`} />
                  {vodResults.map(r => (
                    <SearchPosterRow
                      key={r.item.id}
                      testID={`search-vod-${r.item.id}`}
                      poster={r.item.poster}
                      name={r.item.name}
                      meta={[r.item.year && String(r.item.year), r.item.group].filter(Boolean).join(" • ")}
                      rating={r.item.rating_5based}
                      onPress={() => openDetail(r.item, "vod")}
                    />
                  ))}
                </>
              )}
              {seriesResults.length > 0 && (
                <>
                  <SectionHeader icon="albums" label={`Diziler (${seriesResults.length})`} />
                  {seriesResults.map(r => (
                    <SearchPosterRow
                      key={r.item.id}
                      testID={`search-series-${r.item.id}`}
                      poster={r.item.poster}
                      name={r.item.name}
                      meta={[r.item.genre, r.item.director].filter(Boolean).join(" • ")}
                      rating={r.item.rating_5based}
                      onPress={() => openDetail(r.item, "series")}
                    />
                  ))}
                </>
              )}
              {totalResults === 0 && (
                <View style={styles.empty}>
                  <Ionicons name="sad-outline" size={54} color={colors.onSurfaceSecondary} />
                  <Text style={[styles.emptyText, { color: colors.onSurfaceSecondary }]}>
                    &quot;{q}&quot; için sonuç bulunamadı
                  </Text>
                </View>
              )}
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xxxl }}
        />
      )}
    </SafeAreaView>
  );
}

function SectionHeader({ icon, label }: { icon: any; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.md, marginBottom: SPACING.sm }}>
      <Ionicons name={icon} size={14} color={colors.brandPrimary} />
      <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1.5 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function SearchPosterRow({
  testID, poster, name, meta, rating, onPress,
}: {
  testID: string; poster?: string | null; name: string; meta: string; rating?: number | null; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <FocusButton
      testID={testID}
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.pRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
    >
      <View style={[styles.pPoster, { backgroundColor: colors.surfaceTertiary }]}>
        {poster ? (
          <Image source={{ uri: poster }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <Ionicons name="film-outline" size={22} color={colors.onSurfaceSecondary} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.pName, { color: colors.onSurface }]} numberOfLines={1}>{name}</Text>
        {meta ? <Text style={[styles.pMeta, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>{meta}</Text> : null}
        {rating ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
            <Ionicons name="star" size={11} color="#FFD700" />
            <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs }}>{Number(rating).toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
    </FocusButton>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.sm },
  title: { fontSize: FONT.size.xxl, fontWeight: FONT.weight.black },
  count: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  searchWrap: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    height: 48, borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: SPACING.lg,
  },
  searchInput: { flex: 1, fontSize: FONT.size.base, height: "100%" },
  chipRowContainer: { height: 44, justifyContent: "center" },
  chipRow: { gap: SPACING.sm, paddingHorizontal: SPACING.lg, alignItems: "center" },
  chip: {
    height: 32, borderRadius: RADIUS.pill, borderWidth: 1,
    paddingHorizontal: SPACING.md, flexDirection: "row", alignItems: "center", gap: 4,
  },
  chipText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.sm, marginTop: SPACING.md },
  sectionTitle: { flex: 1, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1.5 },
  clearText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.md },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: RADIUS.pill, borderWidth: 1,
    paddingHorizontal: SPACING.md, paddingVertical: 8, maxWidth: 200,
  },
  tagText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  trendGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  trendCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1,
    padding: SPACING.sm, paddingRight: SPACING.md,
    width: "48%",
  },
  trendLogo: { width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  trendName: { flex: 1, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: SPACING.xxxl, gap: SPACING.md },
  emptyText: { fontSize: FONT.size.base, textAlign: "center", paddingHorizontal: SPACING.xl },
  pRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.sm, paddingRight: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.sm,
  },
  pPoster: { width: 52, height: 72, borderRadius: RADIUS.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  pName: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  pMeta: { fontSize: FONT.size.xs, marginTop: 2 },
});
