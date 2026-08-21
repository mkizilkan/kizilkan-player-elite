import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useLibrary } from "@/src/store/LibraryContext";
import { useProfiles } from "@/src/store/ProfileContext";
import { FocusButton } from "@/src/components/FocusButton";

export default function StatsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activePlaylist, favorites, recent, clearRecent } = usePlaylists();
  const { watchProgress, watchlist, clearAllProgress } = useLibrary();
  const { activeProfile } = useProfiles();

  const stats = useMemo(() => {
    const totalSec = Object.values(watchProgress).reduce((sum, p) => sum + (p.current || 0), 0);
    const totalMin = Math.floor(totalSec / 60);
    const totalHr = Math.floor(totalMin / 60);
    const remainMin = totalMin % 60;

    // top favorites (by name)
    const topFavs = (() => {
      if (!activePlaylist) return [];
      const map = new Map(activePlaylist.channels.map(c => [c.id, c]));
      return favorites.slice(0, 5).map(id => map.get(id)).filter(Boolean) as any[];
    })();

    // top recent (also viewed count intrinsically)
    const topRecent = (() => {
      if (!activePlaylist) return [];
      const map = new Map(activePlaylist.channels.map(c => [c.id, c]));
      return recent.slice(0, 5).map(id => map.get(id)).filter(Boolean) as any[];
    })();

    return {
      totalWatchHours: totalHr,
      totalWatchMinutes: remainMin,
      totalWatchLabel: totalHr > 0 ? `${totalHr}s ${remainMin}dk` : `${totalMin} dk`,
      inProgressCount: Object.keys(watchProgress).length,
      favoritesCount: favorites.length,
      watchlistCount: watchlist.length,
      recentCount: recent.length,
      topFavs,
      topRecent,
    };
  }, [activePlaylist, favorites, recent, watchProgress, watchlist]);

  const StatCard = ({ icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) => (
    <View style={[styles.statCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.statValue, { color: colors.onSurface }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: colors.onSurfaceSecondary }]}>{label}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="stats-screen">
      <View style={styles.header}>
        <FocusButton testID="stats-back-btn" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </FocusButton>
        <Text style={[styles.title, { color: colors.onSurface }]}>İstatistikler</Text>
        {/* İSTATİSTİK/GEÇMİŞ SİLME (v5.5.0 — kullanıcı isteği) */}
        <FocusButton
          testID="stats-clear-btn"
          hitSlop={12}
          focusable
          onPress={() => {
            Alert.alert(
              "İstatistikleri sıfırla",
              "İzleme süresi, devam eden içerikler ve son izlenenler SİLİNECEK.\n\n" +
                "Favorileriniz, izleme listeniz ve gruplarınız SİLİNMEZ.",
              [
                { text: "Vazgeç", style: "cancel" },
                {
                  text: "Sıfırla",
                  style: "destructive",
                  onPress: async () => {
                    await Promise.all([clearAllProgress(), clearRecent()]);
                    Alert.alert("Tamam", "İstatistikler ve izleme geçmişi sıfırlandı.");
                  },
                },
              ]
            );
          }}
        >
          <Ionicons name="trash-outline" size={24} color={colors.error ?? "#D32F2F"} />
        </FocusButton>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl, gap: SPACING.md }}>
        <View style={[styles.profileHead, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: activeProfile?.color || colors.brandPrimary }]}>
            <Text style={styles.avatarText}>{activeProfile?.name?.slice(0, 1)?.toUpperCase() || "?"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.onSurface }]}>{activeProfile?.name || "Profil"}</Text>
            <Text style={[styles.profileSub, { color: colors.onSurfaceSecondary }]}>
              {activePlaylist?.name || "Liste yok"}
            </Text>
          </View>
          <Ionicons name="trophy" size={30} color="#FFD700" />
        </View>

        <View style={styles.grid}>
          <StatCard icon="time" label="Toplam İzleme" value={stats.totalWatchLabel} color={colors.brandPrimary} />
          <StatCard icon="play-circle" label="Devam Eden" value={stats.inProgressCount} color="#7C4DFF" />
          <StatCard icon="heart" label="Favori Kanal" value={stats.favoritesCount} color="#E91E63" />
          <StatCard icon="bookmark" label="İzleyeceğim" value={stats.watchlistCount} color="#00C853" />
          <StatCard icon="tv" label="Toplam Kanal" value={activePlaylist?.channels.length || 0} color="#2196F3" />
          <StatCard icon="film" label="Toplam Film" value={activePlaylist?.vod?.length || 0} color="#FF6D00" />
          <StatCard icon="albums" label="Toplam Dizi" value={activePlaylist?.series?.length || 0} color="#00BCD4" />
          <StatCard icon="hourglass" label="Son İzlenen" value={stats.recentCount} color="#9E9E9E" />
        </View>

        {stats.topFavs.length > 0 && (
          <>
            <SectionTitle icon="heart" label="En Çok Favorilenen Kanallar" />
            {stats.topFavs.map((ch, i) => (
              <View key={ch.id} style={[styles.rankRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <Text style={[styles.rank, { color: colors.brandPrimary }]}>#{i + 1}</Text>
                <View style={[styles.chLogo, { backgroundColor: colors.surfaceTertiary }]}>
                  {ch.logo ? <Image source={{ uri: ch.logo }} style={{ width: "100%", height: "100%" }} resizeMode="contain" /> : <Ionicons name="tv-outline" size={20} color={colors.onSurfaceSecondary} />}
                </View>
                <Text style={[styles.chName, { color: colors.onSurface }]} numberOfLines={1}>{ch.name}</Text>
              </View>
            ))}
          </>
        )}

        {stats.topRecent.length > 0 && (
          <>
            <SectionTitle icon="time" label="Son İzlenen Kanallar" />
            {stats.topRecent.map((ch, i) => (
              <View key={ch.id} style={[styles.rankRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <Text style={[styles.rank, { color: colors.onSurfaceSecondary }]}>#{i + 1}</Text>
                <View style={[styles.chLogo, { backgroundColor: colors.surfaceTertiary }]}>
                  {ch.logo ? <Image source={{ uri: ch.logo }} style={{ width: "100%", height: "100%" }} resizeMode="contain" /> : <Ionicons name="tv-outline" size={20} color={colors.onSurfaceSecondary} />}
                </View>
                <Text style={[styles.chName, { color: colors.onSurface }]} numberOfLines={1}>{ch.name}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={[styles.footer, { color: colors.onSurfaceTertiary }]}>
          İstatistikler sadece cihazınızda saklanır. Profile göre değişir.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ icon, label }: { icon: any; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.md, marginBottom: 4 }}>
      <Ionicons name={icon} size={14} color={colors.brandPrimary} />
      <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1.5 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  profileHead: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1,
  },
  avatar: { width: 48, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: FONT.size.xl, fontWeight: FONT.weight.black },
  profileName: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  profileSub: { fontSize: FONT.size.sm, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  statCard: {
    width: "48%",
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1,
  },
  statIcon: { width: 40, height: 40, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: FONT.size.lg, fontWeight: FONT.weight.black },
  statLabel: { fontSize: FONT.size.xs, marginTop: 2 },
  rankRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1,
  },
  rank: { fontSize: FONT.size.lg, fontWeight: FONT.weight.black, width: 40, textAlign: "center" },
  chLogo: { width: 36, height: 36, borderRadius: RADIUS.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  chName: { flex: 1, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  footer: { textAlign: "center", fontSize: FONT.size.xs, marginTop: SPACING.lg },
});
