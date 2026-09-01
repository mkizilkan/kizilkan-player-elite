import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { api } from "@/src/utils/api";

export default function EpgScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { channel: chanId } = useLocalSearchParams<{ channel: string }>();
  const { activePlaylist } = usePlaylists();
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channel = activePlaylist?.channels.find(c => c.id === chanId);
  const epgId = channel?.epg_channel_id || channel?.tvg_id || "";

  useEffect(() => {
    if (!activePlaylist || !epgId) return;
    setLoading(true);
    // CİHAZ-İÇİ XMLTV (backend YOK)
    import("@/src/utils/epg")
      .then(({ getChannelPrograms }) => getChannelPrograms(activePlaylist.id, epgId, activePlaylist.epgUrl))
      .then(res => setPrograms(res.programs))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activePlaylist?.id, epgId]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>
          {channel?.name || "Program Rehberi"}
        </Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
        {loading && <ActivityIndicator color={colors.brandPrimary} />}
        {error && <Text style={{ color: colors.error }}>{error}</Text>}
        {!loading && !error && programs.length === 0 && (
          <Text style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: SPACING.xl }}>
            Bu kanal için EPG verisi yok
          </Text>
        )}
        {programs.map((p, idx) => (
          <View key={idx} style={[styles.progItem, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={[styles.progTime, { color: colors.brandPrimary }]}>
              {new Date(p.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.progTitle, { color: colors.onSurface }]}>{p.title}</Text>
              {p.desc ? <Text style={[styles.progDesc, { color: colors.onSurfaceSecondary }]} numberOfLines={3}>{p.desc}</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: SPACING.lg,
  },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold, flex: 1, textAlign: "center" },
  progItem: {
    flexDirection: "row",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  progTime: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, width: 56 },
  progTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  progDesc: { fontSize: FONT.size.sm, marginTop: 4, lineHeight: 18 },
});
