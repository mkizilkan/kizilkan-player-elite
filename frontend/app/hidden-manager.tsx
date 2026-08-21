import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useLibrary } from "@/src/store/LibraryContext";
import { useParental } from "@/src/store/ParentalContext";
import { fuzzySearch } from "@/src/utils/fuzzy";
import { haptic } from "@/src/utils/haptic";

type Kind = "channels" | "vod" | "series" | "groups";

export default function HiddenManagerScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activePlaylist } = usePlaylists();
  const { hiddenItems, hiddenGroups, toggleHiddenItem, toggleHiddenGroup, hiddenModeUnlocked, lockHiddenSession } = useLibrary();
  const { settings } = useParental();
  const [kind, setKind] = useState<Kind>("channels");
  const [q, setQ] = useState("");

  const allChannels = activePlaylist?.channels || [];
  const allVod = activePlaylist?.vod || [];
  const allSeries = activePlaylist?.series || [];
  const allGroups = useMemo(() => {
    const s = new Set<string>();
    allChannels.forEach(c => { if (c.group) s.add(c.group); });
    allVod.forEach(v => { if (v.group) s.add(v.group); });
    allSeries.forEach(sr => { if (sr.group) s.add(sr.group); });
    return Array.from(s).sort();
  }, [allChannels, allVod, allSeries]);

  const data = useMemo(() => {
    let list: any[] = [];
    if (kind === "channels") list = allChannels.map(c => ({ id: c.id, name: c.name, group: c.group, logo: c.logo }));
    else if (kind === "vod") list = allVod.map(v => ({ id: v.id, name: v.name, group: v.group, logo: v.poster }));
    else if (kind === "series") list = allSeries.map(s => ({ id: s.id, name: s.name, group: s.group, logo: s.poster }));
    else list = allGroups.map(g => ({ id: g, name: g, group: null, logo: null }));

    if (q.trim()) {
      const res = fuzzySearch(list, q, (x: any) => [x.name, x.group], 500, 0.3);
      return res.map(r => r.item);
    }
    return list;
  }, [kind, q, allChannels, allVod, allSeries, allGroups]);

  const isHidden = (id: string) => {
    if (kind === "groups") return hiddenGroups.includes(id);
    return hiddenItems.includes(id);
  };

  const toggle = (id: string) => {
    haptic.soft();
    if (kind === "groups") toggleHiddenGroup(id);
    else toggleHiddenItem(id);
  };

  const totalHidden = hiddenItems.length + hiddenGroups.length;

  const kindDefs: { key: Kind; label: string; icon: any; count: number }[] = [
    { key: "channels", label: "Kanal", icon: "tv", count: allChannels.length },
    { key: "vod", label: "Film", icon: "film", count: allVod.length },
    { key: "series", label: "Dizi", icon: "albums", count: allSeries.length },
    { key: "groups", label: "Grup", icon: "folder", count: allGroups.length },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="hidden-manager-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="hidden-back-btn" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Gizli İçerikler</Text>
          <Text style={[styles.subtitle, { color: colors.onSurfaceSecondary }]}>
            {totalHidden} öğe gizli • PIN {settings.enabled ? "aktif" : "yok"}
          </Text>
        </View>
        {hiddenModeUnlocked ? (
          <TouchableOpacity
            testID="lock-hidden-btn"
            onPress={() => { haptic.warning(); lockHiddenSession(); }}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Ionicons name="lock-closed" size={22} color={colors.brandPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 30 }} />
        )}
      </View>

      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
          <TextInput
            testID="hidden-search-input"
            value={q}
            onChangeText={setQ}
            placeholder="Ara..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.searchInput, { color: colors.onSurface }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {kindDefs.map(k => {
          const active = kind === k.key;
          return (
            <TouchableOpacity
              key={k.key}
              testID={`hidden-tab-${k.key}`}
              onPress={() => { haptic.soft(); setKind(k.key); }}
              style={[
                styles.chip,
                { backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary, borderColor: active ? colors.brandPrimary : colors.border },
              ]}
            >
              <Ionicons name={k.icon} size={13} color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
              <Text style={[styles.chipText, { color: active ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>
                {k.label} ({k.count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={data}
        keyExtractor={i => i.id}
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xxxl }}
        renderItem={({ item }) => {
          const hidden = isHidden(item.id);
          return (
            <TouchableOpacity
              testID={`hidden-item-${item.id}`}
              onPress={() => toggle(item.id)}
              activeOpacity={0.75}
              style={[
                styles.row,
                { backgroundColor: hidden ? colors.brandPrimary + "22" : colors.surfaceSecondary, borderColor: hidden ? colors.brandPrimary : colors.border },
              ]}
            >
              {kind !== "groups" && (
                <View style={[styles.logoWrap, { backgroundColor: colors.surfaceTertiary }]}>
                  {item.logo ? (
                    <Image source={{ uri: item.logo }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                  ) : (
                    <Ionicons name={kind === "channels" ? "tv-outline" : "film-outline"} size={20} color={colors.onSurfaceSecondary} />
                  )}
                </View>
              )}
              {kind === "groups" && (
                <View style={[styles.logoWrap, { backgroundColor: colors.surfaceTertiary }]}>
                  <Ionicons name="folder" size={22} color={colors.onSurfaceSecondary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>{item.name}</Text>
                {item.group && (
                  <Text style={[styles.meta, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>{item.group}</Text>
                )}
              </View>
              <Ionicons
                name={hidden ? "eye-off" : "eye"}
                size={22}
                color={hidden ? colors.brandPrimary : colors.onSurfaceTertiary}
              />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search" size={40} color={colors.onSurfaceSecondary} />
            <Text style={[styles.emptyText, { color: colors.onSurfaceSecondary }]}>Sonuç yok</Text>
          </View>
        }
      />

      <View style={[styles.footer, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Ionicons name="information-circle" size={16} color={colors.onSurfaceSecondary} />
        <Text style={[styles.footerText, { color: colors.onSurfaceSecondary }]}>
          Gizli öğeler, PIN doğrulanana kadar listelerde görünmez.
          {!settings.enabled ? " PIN ayarlamak için Ayarlar → Ebeveyn Kontrolü." : ""}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  subtitle: { fontSize: FONT.size.xs, marginTop: 2 },
  iconBtn: { padding: 4 },
  searchWrap: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    height: 44, borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: SPACING.md,
  },
  searchInput: { flex: 1, fontSize: FONT.size.sm, height: "100%" },
  chipRow: { gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  chip: {
    height: 32, borderRadius: RADIUS.pill, borderWidth: 1,
    paddingHorizontal: SPACING.md, flexDirection: "row", alignItems: "center", gap: 4,
  },
  chipText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  row: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.sm, paddingRight: SPACING.md,
    borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.xs,
  },
  logoWrap: { width: 44, height: 44, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  name: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  meta: { fontSize: FONT.size.xs, marginTop: 2 },
  empty: { alignItems: "center", padding: SPACING.xxxl, gap: SPACING.md },
  emptyText: { fontSize: FONT.size.base },
  footer: {
    flexDirection: "row", gap: SPACING.sm,
    padding: SPACING.md, borderTopWidth: 1,
  },
  footerText: { flex: 1, fontSize: FONT.size.xs, lineHeight: 16 },
});
