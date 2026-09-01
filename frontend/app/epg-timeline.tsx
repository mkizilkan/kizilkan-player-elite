import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useRemoteKeys } from "@/src/hooks/useRemoteKeys";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { storage } from "@/src/utils/storage";
import { xtreamShortEpg } from "@/src/utils/iptv";
import { haptic } from "@/src/utils/haptic";

const HOUR_WIDTH = 180;
const CHANNEL_HEIGHT = 68;
const CHANNEL_COL_WIDTH = 140;
const HOURS_TO_SHOW = 168; // 7 days
const EPISODE_URL_KEY = "kizilkan.episode.url.";
const ALL_GROUP = "__all__";

export default function EpgTimeline() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activePlaylist, addToRecent } = usePlaylists();
  const [programs, setPrograms] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [nowLine, setNowLine] = useState(0);
  const [dayNotice, setDayNotice] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>(ALL_GROUP);
  const [timelineStart, setTimelineStart] = useState<Date>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - 2);
    return d;
  });

  /**
   * 24 SAAT ATLAMA (v7.6.0) — TiviMate deseni
   * Rehberde yukarı/aşağı tuşlarıyla bir gün ileri/geri atlanır.
   * Uzun rehberde saatlerce yatay kaydırmak yerine tek tuşla gün değişir.
   */
  const jumpDay = useCallback((days: 1 | -1) => {
    setTimelineStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + days);
      return d;
    });
    haptic.soft();
    setDayNotice(days > 0 ? "▲ 24 saat ileri" : "▼ 24 saat geri");
    setTimeout(() => setDayNotice(null), 1500);
  }, []);

  useRemoteKeys({
    dpadUp: () => jumpDay(1),
    dpadDown: () => jumpDay(-1),
  });

  const allChannels = activePlaylist?.channels || [];
  const groups = useMemo(() => {
    const s = new Set<string>();
    allChannels.forEach(c => { if (c.group) s.add(c.group); });
    return Array.from(s).sort();
  }, [allChannels]);

  const channels = useMemo(() => {
    if (selectedGroup === ALL_GROUP) return allChannels;
    return allChannels.filter(c => (c.group || "Diğer") === selectedGroup);
  }, [allChannels, selectedGroup]);

  const channelIds = useMemo(
    () => channels.map(c => c.epg_channel_id || c.tvg_id || c.stream_id).filter(Boolean).slice(0, 60) as string[],
    [channels],
  );

  const isXtream = activePlaylist?.source === "xtream";
  const hasXmltv = !!activePlaylist?.epgUrl;

  // Load EPG programs based on source; re-run when group changes (channels change).
  useEffect(() => {
    if (!activePlaylist) return;
    if (channels.length === 0) return;
    if (!isXtream && !hasXmltv) {
      setPrograms({});
      return;
    }
    setLoading(true);
    setPrograms({});
    let cancelled = false;

    (async () => {
      const result: Record<string, any[]> = {};

      if (isXtream && activePlaylist.xtreamServer && activePlaylist.xtreamUsername && activePlaylist.xtreamPassword) {
        // Client-side Xtream EPG per stream (short_epg)
        const cred = {
          server: activePlaylist.xtreamServer,
          username: activePlaylist.xtreamUsername,
          password: activePlaylist.xtreamPassword,
        };
        const CONC = 6;
        const batch = channels.slice(0, 40);
        const queue = [...batch];
        await Promise.all(
          Array.from({ length: CONC }, async () => {
            while (queue.length) {
              const ch = queue.shift();
              if (!ch || cancelled) return;
              const sid = ch.stream_id || ch.epg_channel_id || ch.tvg_id;
              if (!sid) continue;
              try {
                const eps = await xtreamShortEpg(cred, String(sid), 30);
                const key = String(ch.epg_channel_id || ch.tvg_id || ch.stream_id);
                if (eps.length && !cancelled) {
                  result[key] = eps.map(p => {
                    // Normalize timestamps into ISO
                    const startISO = p.start_timestamp
                      ? new Date(p.start_timestamp * 1000).toISOString()
                      : p.start;
                    const stopISO = p.stop_timestamp
                      ? new Date(p.stop_timestamp * 1000).toISOString()
                      : p.stop;
                    return { title: p.title, description: p.description, start: startISO, stop: stopISO };
                  });
                }
              } catch { /* ignore */ }
            }
          })
        );
      } else if (hasXmltv) {
        // CİHAZ-İÇİ XMLTV (backend YOK)
        const { getChannelPrograms } = await import("@/src/utils/epg");
        const batch = channelIds.slice(0, 60);
        await Promise.all(batch.map(async (chid) => {
          try {
            const res = await getChannelPrograms(activePlaylist.id, chid, activePlaylist.epgUrl);
            if (!cancelled) result[chid] = res.programs || [];
          } catch { if (!cancelled) result[chid] = []; }
        }));
      }
      if (!cancelled) {
        setPrograms(result);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activePlaylist?.id, activePlaylist, isXtream, hasXmltv, selectedGroup, channels, channelIds]);

  // Now line updates every 30s
  useEffect(() => {
    const update = () => {
      const diff = (Date.now() - timelineStart.getTime()) / (1000 * 60 * 60);
      setNowLine(diff * HOUR_WIDTH);
    };
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [timelineStart]);

  const hours = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < HOURS_TO_SHOW; i++) {
      const d = new Date(timelineStart);
      d.setHours(d.getHours() + i);
      arr.push(d);
    }
    return arr;
  }, [timelineStart]);

  const positionFor = useCallback((iso: string) => {
    if (!iso) return { left: 0, width: 0 };
    const t = new Date(iso).getTime();
    const start = timelineStart.getTime();
    const left = ((t - start) / (1000 * 60 * 60)) * HOUR_WIDTH;
    return { left, width: 0 };
  }, [timelineStart]);

  const durationWidth = useCallback((startIso: string, stopIso: string) => {
    const dur = (new Date(stopIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60);
    return Math.max(28, dur * HOUR_WIDTH);
  }, []);

  const openProgram = async (channel: any, prog: any) => {
    haptic.medium();
    // Live if already now-ish
    const start = new Date(prog.start).getTime();
    const stop = new Date(prog.stop).getTime();
    const now = Date.now();
    if (start <= now && now <= stop) {
      addToRecent(channel.id);
      router.push({ pathname: "/player", params: { id: channel.id } });
      return;
    }
    // Catch-up if past
    if (stop < now && activePlaylist?.source === "xtream") {
      /**
       * v9.12.0: Merkezi buildXtreamTimeshiftUrl (iptv.ts) kullanılıyor —
       * catchup.tsx ile AYNI kaynak, URL-encode dahil. Eskiden burada kopya,
       * encode'suz bir URL kuruluyordu (GPT tespiti).
       */
      try {
        const { buildXtreamTimeshiftUrl } = await import("@/src/utils/iptv");
        const url = buildXtreamTimeshiftUrl({
          server: String((activePlaylist as any).xtreamServer || ""),
          username: String((activePlaylist as any).xtreamUsername || ""),
          password: String((activePlaylist as any).xtreamPassword || ""),
          startMs: start,
          stopMs: stop,
          streamId: channel.stream_id || "",
        });
        if (url) {
          const synth = {
            id: `epplay-${nano()}`,
            url, name: `${channel.name} • ${prog.title}`, group: "Catch-up", container_ext: "ts",
          };
          await storage.setItem(EPISODE_URL_KEY + synth.id, JSON.stringify(synth));
          router.push({ pathname: "/player", params: { id: synth.id, ext: "true" } });
        }
      } catch {
        // ignore
      }
    }
  };

  if (!activePlaylist || allChannels.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top", "bottom"]}>
        {dayNotice ? (
          <View style={{
            position: "absolute", top: 70, alignSelf: "center", zIndex: 100,
            backgroundColor: colors.brandPrimary, paddingHorizontal: 16,
            paddingVertical: 8, borderRadius: 20,
          }}>
            <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>{dayNotice}</Text>
          </View>
        ) : null}

        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[styles.title, { color: colors.onSurface }]}>TV Rehberi</Text>
            {/* HANGİ GÜN (v7.6.0): 24 saat atlarken kullanıcı kaybolmasın */}
            <Text style={{ color: colors.onSurfaceSecondary, fontSize: 11 }}>
              {timelineStart.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
              {"  •  ▲▼ gün değiştir"}
            </Text>
          </View>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={60} color={colors.onSurfaceSecondary} />
          <Text style={[styles.emptyText, { color: colors.onSurfaceSecondary }]}>Kanal yok</Text>
        </View>
      </SafeAreaView>
    );
  }

  const noEpgSource = !isXtream && !hasXmltv;
  const anyPrograms = Object.values(programs).some(p => p && p.length > 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top", "bottom"]} testID="epg-timeline-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="epg-close-btn">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.onSurface }]}>TV Rehberi (7 Gün)</Text>
        {loading ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <View style={{ width: 26 }} />}
      </View>

      {/* Group filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip
          label={`Tümü (${allChannels.length})`}
          active={selectedGroup === ALL_GROUP}
          onPress={() => { haptic.soft(); setSelectedGroup(ALL_GROUP); }}
          testID="epg-chip-all"
        />
        {groups.map(g => {
          const cnt = allChannels.filter(c => (c.group || "Diğer") === g).length;
          return (
            <Chip
              key={g}
              label={`${g} (${cnt})`}
              active={selectedGroup === g}
              onPress={() => { haptic.soft(); setSelectedGroup(g); }}
              testID={`epg-chip-${g}`}
            />
          );
        })}
      </ScrollView>

      {noEpgSource ? (
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={54} color={colors.onSurfaceSecondary} />
          <Text style={[styles.emptyText, { color: colors.onSurfaceSecondary, textAlign: "center", paddingHorizontal: SPACING.xl }]}>
            Bu liste için EPG kaynağı yok.
            {"\n"}Xtream Codes veya EPG URL&apos;li M3U kullanın.
          </Text>
        </View>
      ) : !loading && !anyPrograms && channels.length > 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={54} color={colors.onSurfaceSecondary} />
          <Text style={[styles.emptyText, { color: colors.onSurfaceSecondary, textAlign: "center", paddingHorizontal: SPACING.xl }]}>
            {selectedGroup === ALL_GROUP ? "EPG verisi yok" : `"${selectedGroup}" grubunda EPG verisi yok`}
            {"\n"}Sağlayıcınız EPG göndermiyor olabilir.
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View>
            <View style={[styles.hourStrip, { borderBottomColor: colors.border }]}>
              <View style={{ width: CHANNEL_COL_WIDTH }} />
              <View style={{ flexDirection: "row" }}>
                {hours.map((h, i) => (
                  <View key={i} style={[styles.hourCell, { width: HOUR_WIDTH, borderColor: colors.border }]}>
                    <Text style={[styles.hourText, { color: colors.onSurfaceSecondary }]}>
                      {h.getHours().toString().padStart(2, "0")}:00
                    </Text>
                    <Text style={[styles.dayText, { color: colors.onSurfaceTertiary }]}>
                      {h.getDate()}/{h.getMonth() + 1}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {channels.slice(0, 60).map(ch => {
                const chid = String(ch.epg_channel_id || ch.tvg_id || ch.stream_id || "");
                const progs = programs[chid] || [];
                return (
                  <View key={ch.id} style={[styles.row, { borderBottomColor: colors.border, height: CHANNEL_HEIGHT }]}>
                    <View style={[styles.chCol, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, width: CHANNEL_COL_WIDTH }]}>
                      {ch.logo ? (
                        <Image source={{ uri: ch.logo }} style={styles.chLogo} resizeMode="contain" />
                      ) : (
                        <Ionicons name="tv-outline" size={24} color={colors.onSurfaceSecondary} />
                      )}
                      <Text style={[styles.chName, { color: colors.onSurface }]} numberOfLines={2}>{ch.name}</Text>
                    </View>
                    <View style={styles.timelineRow}>
                      {progs.map((p: any, i: number) => {
                        const { left } = positionFor(p.start);
                        const width = durationWidth(p.start, p.stop);
                        if (left + width < 0 || left > HOUR_WIDTH * HOURS_TO_SHOW) return null;
                        const now = Date.now();
                        const isNow = new Date(p.start).getTime() <= now && now <= new Date(p.stop).getTime();
                        return (
                          <TouchableOpacity
                            key={i}
                            testID={`epg-cell-${ch.id}-${i}`}
                            onPress={() => openProgram(ch, p)}
                            focusable
                            activeOpacity={0.7}
                            style={[
                              styles.prog,
                              {
                                left, width,
                                backgroundColor: isNow ? colors.brandPrimary : colors.surfaceSecondary,
                                borderColor: isNow ? colors.brandPrimary : colors.border,
                              },
                            ]}
                          >
                            <Text
                              style={[styles.progTitle, { color: isNow ? colors.onBrandPrimary : colors.onSurface }]}
                              numberOfLines={2}
                            >
                              {p.title}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            {/* Now line */}
            <View
              style={[styles.nowLine, { left: CHANNEL_COL_WIDTH + nowLine, backgroundColor: colors.brandPrimary }]}
              pointerEvents="none"
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      focusable
      style={[
        styles.chip,
        { backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary, borderColor: active ? colors.brandPrimary : colors.border },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? colors.onBrandPrimary : colors.onSurfaceSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function nano() { return Math.random().toString(36).slice(2, 10); }

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.md },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  chipRow: { gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, alignItems: "center" },
  chip: {
    height: 32, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, borderWidth: 1,
    alignItems: "center", justifyContent: "center", maxWidth: 220,
  },
  chipText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.md, padding: SPACING.xl },
  emptyText: { fontSize: FONT.size.base, lineHeight: 22 },
  hourStrip: { flexDirection: "row", borderBottomWidth: 1, backgroundColor: "rgba(0,0,0,0.2)" },
  hourCell: { height: 42, justifyContent: "center", alignItems: "center", borderRightWidth: StyleSheet.hairlineWidth, gap: 2 },
  hourText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  dayText: { fontSize: FONT.size.xs },
  row: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  chCol: {
    borderRightWidth: 1,
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: SPACING.sm,
    position: "sticky" as any,
  },
  chLogo: { width: 32, height: 32 },
  chName: { flex: 1, fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },
  timelineRow: { position: "relative" },
  prog: {
    position: "absolute", top: 8, height: CHANNEL_HEIGHT - 16,
    borderRadius: RADIUS.sm, borderWidth: 1, paddingHorizontal: 8, justifyContent: "center",
  },
  progTitle: { fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },
  nowLine: { position: "absolute", top: 42, bottom: 0, width: 2 },
});
