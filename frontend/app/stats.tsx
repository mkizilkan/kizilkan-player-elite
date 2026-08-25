import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useLibrary } from "@/src/store/LibraryContext";
import { useProfiles } from "@/src/store/ProfileContext";
import { FocusButton } from "@/src/components/FocusButton";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import { PanelScan } from "@/modules/panel-scan";
import { clearDiagnostics, exportDiagnosticReport, loadDiagnostics, summarizePlayerDiagnostics, type DiagnosticEvent } from "@/src/utils/diagnostics";

export default function StatsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activePlaylist, favorites, recent, clearRecent, ensureHeavyLoaded } = usePlaylists();
  const nativeData = Platform.OS === "android" && KizilkanNativeCore.available;
  const [nativeFavs, setNativeFavs] = useState<any[]>([]);
  const [nativeRecent, setNativeRecent] = useState<any[]>([]);
  const [storageFootprint, setStorageFootprint] = useState<Record<string, any>>({});
  const [runtimeMemory, setRuntimeMemory] = useState<Record<string, any>>({});
  const [lastExitInfo, setLastExitInfo] = useState<Record<string, any>>({});
  const [exitHistory, setExitHistory] = useState<Record<string, any>[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEvent[]>([]);
  const [scanDiagnostics, setScanDiagnostics] = useState<any[]>([]);

  // v15.2.4: İstatistik ekranı yalnız birkaç favori/son kanal için artık
  // on binlerce kanalı hydrate etmez. Native Core varsa ID bazlı Room sorgusu.
  useEffect(() => {
    let cancelled = false;
    if (!activePlaylist?.id) { setNativeFavs([]); setNativeRecent([]); return; }
    if (!nativeData) { void ensureHeavyLoaded(activePlaylist.id); return; }
    void (async () => {
      const [favRows, recentRows, footprint] = await Promise.all([
        KizilkanNativeCore.getItemsByIds(activePlaylist.id, "live", favorites.slice(0, 5)),
        KizilkanNativeCore.getItemsByIds(activePlaylist.id, "live", recent.slice(0, 5)),
        KizilkanNativeCore.getStorageFootprint(),
      ]);
      if (cancelled) return;
      const orderBy = (ids: string[], rows: any[]) => {
        const map = new Map(rows.map((r: any) => [String(r.id), r]));
        return ids.map(id => map.get(id)).filter(Boolean);
      };
      setNativeFavs(orderBy(favorites.slice(0, 5), favRows));
      setNativeRecent(orderBy(recent.slice(0, 5), recentRows));
      setStorageFootprint(footprint || {});
      setRuntimeMemory(KizilkanNativeCore.getRuntimeMemory());
      setLastExitInfo(KizilkanNativeCore.getLastExitInfo());
      setExitHistory(KizilkanNativeCore.getExitHistory(5));
      setScanDiagnostics(PanelScan.getDiagnosticEvents().slice(0, 12));
      setDiagnostics(await loadDiagnostics(120));
    })();
    return () => { cancelled = true; };
  }, [activePlaylist?.id, ensureHeavyLoaded, favorites, nativeData, recent]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const d = await loadDiagnostics(120);
      if (!live) return;
      setDiagnostics(d);
      if (nativeData) {
        setRuntimeMemory(KizilkanNativeCore.getRuntimeMemory());
        setLastExitInfo(KizilkanNativeCore.getLastExitInfo());
        setExitHistory(KizilkanNativeCore.getExitHistory(5));
        setScanDiagnostics(PanelScan.getDiagnosticEvents().slice(0, 12));
      }
    })();
    return () => { live = false; };
  }, [nativeData]);

  const playerDiag = useMemo(() => summarizePlayerDiagnostics(diagnostics), [diagnostics]);
  const exitScanCorrelation = useMemo(() => {
    const exitAt = Number(lastExitInfo.timestamp || 0);
    if (!exitAt) return null;
    return scanDiagnostics.find((x:any) => {
      const at = Number(x?.at || 0);
      return at > 0 && at <= exitAt && exitAt - at <= 120000;
    }) || null;
  }, [lastExitInfo.timestamp, scanDiagnostics]);

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
      if (nativeData) return nativeFavs;
      const map = new Map(activePlaylist.channels.map(c => [c.id, c]));
      return favorites.slice(0, 5).map(id => map.get(id)).filter(Boolean) as any[];
    })();

    const topRecent = (() => {
      if (!activePlaylist) return [];
      if (nativeData) return nativeRecent;
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
  }, [activePlaylist, favorites, nativeData, nativeFavs, nativeRecent, recent, watchProgress, watchlist]);

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
          <StatCard icon="tv" label="Toplam Kanal" value={activePlaylist?.channelsCount ?? activePlaylist?.channels.length ?? 0} color="#2196F3" />
          <StatCard icon="film" label="Toplam Film" value={activePlaylist?.vodCount ?? activePlaylist?.vod?.length ?? 0} color="#FF6D00" />
          <StatCard icon="albums" label="Toplam Dizi" value={activePlaylist?.seriesCount ?? activePlaylist?.series?.length ?? 0} color="#00BCD4" />
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

        {nativeData && (Object.keys(storageFootprint).length > 0 || Object.keys(runtimeMemory).length > 0) && (
          <>
            <SectionTitle icon="hardware-chip" label="Native Core Telemetri" />
            <View style={[styles.telemetry, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Text style={[styles.telemetryLine, { color: colors.onSurface }]}>RAM PSS: {formatKb(runtimeMemory.totalPssKb)}</Text>
              <Text style={[styles.telemetryLine, { color: colors.onSurfaceSecondary }]}>Native: {formatKb(runtimeMemory.nativePssKb)} · ART/Java: {formatKb(runtimeMemory.dalvikPssKb)}</Text>
              <Text style={[styles.telemetryLine, { color: colors.onSurfaceSecondary }]}>Room DB: {formatBytes(storageFootprint.databaseBytes)} · WAL: {formatBytes(storageFootprint.walBytes)}</Text>
              <Text style={[styles.telemetryLine, { color: colors.onSurfaceSecondary }]}>Legacy playlist: {formatBytes(storageFootprint.legacyPlaylistBytes)} ({storageFootprint.legacyPlaylistFiles || 0} dosya)</Text>
              <Text style={[styles.telemetryLine, { color: colors.onSurfaceSecondary }]}>Sistem RAM: {formatBytes(runtimeMemory.systemAvailMemBytes)} boş / {formatBytes(runtimeMemory.systemTotalMemBytes)} · Düşük bellek: {runtimeMemory.systemLowMemory ? "EVET" : "Hayır"}</Text>
              {lastExitInfo.reasonLabel ? (
                <Text style={[styles.telemetryLine, { color: colors.onSurfaceSecondary }]}>Son süreç çıkışı: {String(lastExitInfo.reasonLabel)} · {lastExitInfo.description ? String(lastExitInfo.description) : `kod ${String(lastExitInfo.reason)}`} · status {String(lastExitInfo.status ?? "—")} · PSS {formatKb(lastExitInfo.pssKb)} · RSS {formatKb(lastExitInfo.rssKb)} · {formatDate(lastExitInfo.timestamp)}</Text>
              ) : null}
              {exitHistory.slice(1,5).map((x:any, i:number) => (
                <Text key={`exit-${i}`} style={[styles.telemetryLine, { color: colors.onSurfaceTertiary }]}>Önceki {i+2}: {String(x.reasonLabel || x.reason)} · {formatDate(x.timestamp)} · PSS {formatKb(x.pssKb)}{x.traceAvailable ? " · trace var" : ""}</Text>
              ))}
              {exitScanCorrelation ? <Text style={[styles.telemetryLine, { color: colors.brandPrimary }]}>Çıkıştan hemen önce tarama: {String(exitScanCorrelation.state || "?")} · {Number(exitScanCorrelation.tested||0)}/{Number(exitScanCorrelation.total||0)} · PSS {formatKb(exitScanCorrelation.pssKb)}</Text> : null}
            </View>
          </>
        )}

        <SectionTitle icon="speedometer" label="Player Tanılama" />
        <View style={[styles.telemetry, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Text style={[styles.telemetryLine, { color: colors.onSurface }]}>İlk görüntü örneği: {playerDiag.firstFrameCount} · Ortalama: {playerDiag.avgFirstFrameMs ? `${playerDiag.avgFirstFrameMs} ms` : "—"}</Text>
          <Text style={[styles.telemetryLine, { color: colors.onSurfaceSecondary }]}>MAG çözümleme ort.: {playerDiag.avgStalkerResolveMs ? `${playerDiag.avgStalkerResolveMs} ms` : "—"} · Player hatası: {playerDiag.errors} · Rebuffer: {playerDiag.rebuffers}</Text>
          {diagnostics.filter(x => x.domain === "player").slice(0,6).map((x) => (
            <Text key={x.id} style={[styles.telemetryLine, { color: colors.onSurfaceTertiary }]}>{formatTime(x.at)} · {x.event}{x.data?.totalFromSelectionMs ? ` · ${x.data.totalFromSelectionMs} ms` : ""}{x.data?.errorKind ? ` · ${x.data.errorKind}` : ""}</Text>
          ))}
        </View>

        <SectionTitle icon="pulse" label="Tarama Tanılama" />
        <View style={[styles.telemetry, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          {scanDiagnostics.length ? scanDiagnostics.slice(0,6).map((x:any, i:number) => (
            <Text key={`scan-${i}`} style={[styles.telemetryLine, { color: colors.onSurfaceSecondary }]}>{formatTime(x.at)} · {x.state || "?"} · {x.tested || 0}/{x.total || 0} · PSS {formatKb(x.pssKb)}{x.error ? ` · ${x.error}` : ""}</Text>
          )) : <Text style={[styles.telemetryLine, { color: colors.onSurfaceTertiary }]}>Henüz kalıcı tarama olayı yok.</Text>}
        </View>

        <View style={{ flexDirection: "row", gap: SPACING.sm }}>
          <FocusButton testID="diagnostics-share-btn" style={[styles.diagButton, { backgroundColor: colors.brandPrimary }]} onPress={async () => {
            try { await exportDiagnosticReport({ runtimeMemory, storageFootprint, exitHistory, scanDiagnostics }); }
            catch (e:any) { Alert.alert("Tanılama", e?.message || "Rapor oluşturulamadı."); }
          }}>
            <Ionicons name="share-social" size={18} color="#fff" /><Text style={styles.diagButtonText}>Tanılama Raporunu Paylaş</Text>
          </FocusButton>
          <FocusButton testID="diagnostics-clear-btn" style={[styles.diagButton, { borderWidth:1, borderColor: colors.border }]} onPress={() => Alert.alert("Tanılama geçmişi", "Player ve uygulama tanılama geçmişi silinsin mi?", [{text:"Vazgeç",style:"cancel"},{text:"Sil",style:"destructive",onPress:async()=>{await clearDiagnostics();setDiagnostics([]);}}])}>
            <Ionicons name="trash-outline" size={18} color={colors.onSurface} /><Text style={[styles.diagButtonText,{color:colors.onSurface}]}>Geçmişi Temizle</Text>
          </FocusButton>
        </View>

        <Text style={[styles.footer, { color: colors.onSurfaceTertiary }]}>
          İstatistikler sadece cihazınızda saklanır. Profile göre değişir.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatTime(value: any): string { const n=Number(value||0); if(!n) return "—"; try{return new Date(n).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});}catch{return "—";} }
function formatDate(value: any): string { const n=Number(value||0); if(!n) return "—"; try{return new Date(n).toLocaleString("tr-TR");}catch{return "—";} }

function formatBytes(value: any): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 MB";
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatKb(value: any): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 MB";
  return `${(n / 1024).toFixed(1)} MB`;
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
  telemetry: { padding: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, gap: 5 },
  telemetryLine: { fontSize: FONT.size.sm },
  diagButton: { flex: 1, minHeight: 46, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, paddingHorizontal: SPACING.sm },
  diagButtonText: { color: "#fff", fontWeight: FONT.weight.bold, fontSize: FONT.size.xs, textAlign: "center" },
  footer: { textAlign: "center", fontSize: FONT.size.xs, marginTop: SPACING.lg },
});
