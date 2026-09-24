import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { xtreamCatchupEpg as xtCatchupLocal, buildM3UCatchupUrl } from "@/src/utils/iptv";
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

  /**
   * v17.9.1 — KANAL ARTIK ROOM'DAN BULUNUYOR (catchup Native Core'da çalışmıyordu)
   * ---------------------------------------------------------------------------
   * Eskiden kanal `activePlaylist.channels.find(...)` ile aranıyordu. Native
   * Core modunda bu dizi bellekte BOŞTUR (içerik Room'da, bilerek JS'e
   * taşınmaz). Sonuç: kanal bulunamıyor, ekran erken çıkıyor ve catchup hiç
   * listelenmiyordu. Aynı kök neden yenileme fark raporundaki "önce=0"
   * hatasını da üretmişti.
   * Artık önce bellekteki dizi (web/legacy yol), bulunamazsa Room'dan tek öğe
   * (getItem) okunur. 16 bin kanal JS'e taşınmaz, yalnız istenen kanal gelir.
   */
  // Parametre ayrı bir adla tutulur; aşağıdaki `channel` değişkeniyle karışmaz.
  const requestedChannelId = String(params.channel || "");
  const memoryChannel = activePlaylist?.channels?.find(c => c.id === requestedChannelId);
  const [roomChannel, setRoomChannel] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    if (memoryChannel || !activePlaylist?.id || !requestedChannelId) return;
    (async () => {
      try {
        const { KizilkanNativeCore } = await import("@/modules/kizilkan-native-core");
        if (!KizilkanNativeCore.available) return;
        const item = await KizilkanNativeCore.getItem(activePlaylist.id, "live", requestedChannelId);
        if (alive) setRoomChannel(item || null);
      } catch { /* bulunamazsa ekran mevcut "kullanılamıyor" durumunu gösterir */ }
    })();
    return () => { alive = false; };
  }, [activePlaylist?.id, requestedChannelId, memoryChannel]);
  const channel = memoryChannel || roomChannel;

  useEffect(() => {
    let alive=true;
    setLoading(true); setError(null);
    if (!activePlaylist || !channel) { setLoading(false); return; }
    if(activePlaylist.source === "xtream" && channel?.stream_id){
      const cred = { server: activePlaylist.xtreamServer!, username: activePlaylist.xtreamUsername!, password: activePlaylist.xtreamPassword! };
      xtCatchupLocal(cred, String(channel.stream_id))
        .then(r => {if(alive)setPrograms(r.programs || []);})
        .catch(e => {if(alive)setError(e.message);})
        .finally(() => {if(alive)setLoading(false);});
      return ()=>{alive=false;};
    }
    if(activePlaylist.source === "stalker" && channel?.stream_id){
      import("@/src/utils/stalker").then(async ({stalkerCredsFromPlaylist,stalkerLogin,stalkerArchiveEpg})=>{
        const cred=stalkerCredsFromPlaylist(activePlaylist as any);
        const {session}=await stalkerLogin(cred);
        return stalkerArchiveEpg(cred,session,String(channel.stream_id),Number(channel.tv_archive_duration||7)||7);
      }).then(r=>{if(alive)setPrograms(r.programs||[]);}).catch(e=>{if(alive)setError(String(e?.message||e));}).finally(()=>{if(alive)setLoading(false);});
      return ()=>{alive=false;};
    }
        if((activePlaylist.source === "m3u_url" || activePlaylist.source === "m3u_file") && channel?.catchup_source){
      const epgId=String(channel.epg_channel_id||channel.tvg_id||"");
      if(!epgId){ setPrograms([]); setLoading(false); return; }
      import("@/src/utils/epg")
        .then(({getChannelPrograms})=>getChannelPrograms(activePlaylist.id,epgId,activePlaylist.epgUrl))
        .then(r=>{if(alive)setPrograms((r.programs||[]).filter((p:any)=>Number(p.stop_timestamp||0)<Math.floor(Date.now()/1000)).map((p:any)=>({...p,has_archive:1,now_playing:0})).reverse());})
        .catch(e=>{if(alive)setError(String(e?.message||e));})
        .finally(()=>{if(alive)setLoading(false);});
      return ()=>{alive=false;};
    }
    setPrograms([]); setLoading(false);
    return ()=>{alive=false;};
  }, [activePlaylist?.id, activePlaylist?.source, activePlaylist?.epgUrl, channel?.id, channel?.stream_id, channel?.catchup_source]);

  const playProgram = async (p: any) => {
    if (!activePlaylist || !channel) return;
    // v9.12.0: Merkezi buildXtreamTimeshiftUrl (iptv.ts) — URL-encode dahil,
    // epg-timeline ile aynı kaynak.
    const startTs = Number(p.start_timestamp);
    const stopTs = Number(p.stop_timestamp);
    if (!Number.isFinite(startTs) || !Number.isFinite(stopTs)) return;
    let variants:string[]=[];
    if(activePlaylist.source === "xtream" && channel.stream_id){
      const { buildXtreamTimeshiftVariants } = await import("@/src/utils/iptv");
      variants = buildXtreamTimeshiftVariants({
        server: String(activePlaylist.xtreamServer || ""), username: String(activePlaylist.xtreamUsername || ""), password: String(activePlaylist.xtreamPassword || ""),
        startMs: startTs * 1000, stopMs: stopTs * 1000, streamId: channel.stream_id,
        timeZone: String((activePlaylist as any)?.serverInfo?.timezone || "") || null,
      });
    } else if(activePlaylist.source === "stalker" && p?.archive_cmd){
      const {stalkerCredsFromPlaylist,stalkerLogin,stalkerCreateLink}=await import("@/src/utils/stalker");
      const cred=stalkerCredsFromPlaylist(activePlaylist as any);
      const {session}=await stalkerLogin(cred);
      const archiveUrl=await stalkerCreateLink(cred,session,String(p.archive_cmd),"itv");
      if(archiveUrl) variants=[archiveUrl];
    } else if((activePlaylist.source === "m3u_url" || activePlaylist.source === "m3u_file") && channel.catchup_source){
      const m3uUrl=buildM3UCatchupUrl(channel,startTs,stopTs);
      if(m3uUrl) variants=[m3uUrl];
    }
    const url=variants[0]; if(!url){ setError("Bu sağlayıcının catch-up şablonu desteklenmiyor veya eksik."); return; }

    const syntheticId = `catchup-${channel.id}-${startTs}`;
    await storage.setItem(EPISODE_URL_KEY + syntheticId, JSON.stringify({
      url,
      name: `${channel.name} • ${p.title}`,
      group: "Catch-up",
      container_ext: "ts",
      fallbackUrls: variants.slice(1),
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
