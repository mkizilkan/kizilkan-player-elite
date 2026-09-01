import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { xtreamCatchupEpg as xtCatchupLocal } from "@/src/utils/iptv";
import { storage } from "@/src/utils/storage";

const EPISODE_URL_KEY = "kizilkan.episode.url.";

export default function CatchupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ channel: string }>();
  const { activePlaylist, addToRecent } = usePlaylists();
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const channel = activePlaylist?.channels.find(c => c.id === params.channel);

  useEffect(() => {
    if (!activePlaylist || activePlaylist.source !== "xtream" || !channel?.stream_id) {
      setLoading(false);
      return;
    }
    // CİHAZ-İÇİ: backend proxy (emergent) yerine doğrudan Xtream API.
    const cred = {
      server: activePlaylist.xtreamServer!,
      username: activePlaylist.xtreamUsername!,
      password: activePlaylist.xtreamPassword!,
    };
    xtCatchupLocal(cred, String(channel.stream_id))
      .then(r => setPrograms(r.programs || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activePlaylist, channel]);

  const playProgram = async (p: any) => {
    if (!activePlaylist || !channel?.stream_id || activePlaylist.source !== "xtream") return;
    // v9.12.0: Merkezi buildXtreamTimeshiftUrl (iptv.ts) — URL-encode dahil,
    // epg-timeline ile aynı kaynak.
    const startTs = Number(p.start_timestamp);
    const stopTs = Number(p.stop_timestamp);
    if (!Number.isFinite(startTs) || !Number.isFinite(stopTs)) return;
    const { buildXtreamTimeshiftUrl } = await import("@/src/utils/iptv");
    const url = buildXtreamTimeshiftUrl({
      server: String(activePlaylist.xtreamServer || ""),
      username: String(activePlaylist.xtreamUsername || ""),
      password: String(activePlaylist.xtreamPassword || ""),
      startMs: startTs * 1000,
      stopMs: stopTs * 1000,
      streamId: channel.stream_id,
    });
    if (!url) return;

    const syntheticId = `catchup-${channel.id}-${startTs}`;
    await storage.setItem(EPISODE_URL_KEY + syntheticId, JSON.stringify({
      url,
      name: `${channel.name} • ${p.title}`,
      group: "Catch-up",
      container_ext: "ts",
    }));
    addToRecent(channel.id);
    router.replace({ pathname: "/player", params: { id: syntheticId, ext: "true" } });
  };

  const timeStr = (ts: any) => {
    const n = Number(ts);
    if (!Number.isFinite(n)) return "—";
    const d = new Date(n * 1000);
    return `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })} • ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top", "bottom"]} testID="catchup-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>{channel?.name}</Text>
          <Text style={[styles.subtitle, { color: colors.onSurfaceSecondary }]}>Geriye Dönük İzle</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
        {loading && <ActivityIndicator color={colors.brandPrimary} />}
        {error && <Text style={{ color: colors.error }}>{error}</Text>}
        {!loading && !error && programs.length === 0 && (
          <Text style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: SPACING.xl }}>
            Bu kanal için catch-up verisi yok
          </Text>
        )}
        {programs.map((p, idx) => {
          const archived = Number(p.has_archive) === 1;
          const isNow = Number(p.now_playing) === 1;
          return (
            <TouchableOpacity
              key={idx}
              testID={`catchup-prog-${idx}`}
              onPress={() => archived && playProgram(p)}
              disabled={!archived}
              activeOpacity={archived ? 0.7 : 1}
              focusable
              style={[
                styles.progItem,
                { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                !archived && { opacity: 0.4 },
              ]}
            >
              <View style={styles.progInner}>
                <View style={styles.progHead}>
                  <Text style={[styles.progTime, { color: colors.brandPrimary }]}>{timeStr(p.start_timestamp)}</Text>
                  {isNow && (
                    <View style={[styles.liveTag, { backgroundColor: colors.brandPrimary }]}>
                      <Text style={styles.liveTagText}>CANLI</Text>
                    </View>
                  )}
                  {archived && !isNow && (
                    <View style={[styles.archTag, { borderColor: colors.brandPrimary }]}>
                      <Ionicons name="play" size={10} color={colors.brandPrimary} />
                      <Text style={[styles.archTagText, { color: colors.brandPrimary }]}>İZLE</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.progTitle, { color: colors.onSurface }]} numberOfLines={2}>{p.title || "Bilinmeyen"}</Text>
                {p.description ? (
                  <Text style={[styles.progDesc, { color: colors.onSurfaceSecondary }]} numberOfLines={2}>{p.description}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
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
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  subtitle: { fontSize: FONT.size.xs, marginTop: 2 },
  progItem: { borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.sm },
  progInner: { padding: SPACING.md, gap: 4 },
  progHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: 4 },
  progTime: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  liveTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm },
  liveTagText: { color: "#fff", fontSize: 9, fontWeight: FONT.weight.black, letterSpacing: 1 },
  archTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm, borderWidth: 1 },
  archTagText: { fontSize: 9, fontWeight: FONT.weight.black, letterSpacing: 1 },
  progTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  progDesc: { fontSize: FONT.size.sm, lineHeight: 18 },
});
