import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useDownloads, DownloadItem } from "@/src/store/DownloadContext";
import { haptic } from "@/src/utils/haptic";
import { storage } from "@/src/utils/storage";

const EPISODE_URL_KEY = "kizilkan.episode.url.";

function fmtBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function statusLabel(status: DownloadItem["status"]): { text: string; color: string } {
  switch (status) {
    case "queued": return { text: "Bekliyor", color: "#9E9E9E" };
    case "downloading": return { text: "İndiriliyor", color: "#2196F3" };
    case "paused": return { text: "Duraklatıldı", color: "#FFA000" };
    case "completed": return { text: "Tamamlandı", color: "#00C853" };
    case "failed": return { text: "Başarısız", color: "#E53935" };
    case "canceled": return { text: "İptal", color: "#9E9E9E" };
  }
}

export default function DownloadsScreen() {
  /**
   * KAYITLAR (v8.8.0 — kullanıcı bildirimi)
   * Player'dan yapılan DVR kayıtları bu ekranda GÖRÜNMÜYORDU; kullanıcı
   * dosyayı bulamıyordu. Artık kayıt klasörü taranıp listeleniyor.
   */
  const [recordings, setRecordings] = useState<{ name: string; uri: string; size: number }[]>([]);

  const loadRecordings = React.useCallback(async () => {
    try {
      const FS: any = await import("expo-file-system/legacy");
      const dir = `${FS.documentDirectory}recordings/`;
      const info = await FS.getInfoAsync(dir);
      if (!info?.exists) { setRecordings([]); return; }
      const names: string[] = await FS.readDirectoryAsync(dir);
      const out: { name: string; uri: string; size: number }[] = [];
      for (const n of names) {
        const uri = dir + n;
        try {
          const fi = await FS.getInfoAsync(uri);
          out.push({ name: n, uri, size: fi?.size || 0 });
        } catch { /* okunamayan dosyayı atla */ }
      }
      setRecordings(out.sort((a, b) => b.name.localeCompare(a.name)));
    } catch { setRecordings([]); }
  }, []);

  useEffect(() => { loadRecordings(); }, [loadRecordings]);

  const router = useRouter();
  const { colors } = useTheme();
  const { downloads, pause, resume, cancel, remove, clearCompleted } = useDownloads();

  const active = downloads.filter(d => d.status !== "completed");
  const completed = downloads.filter(d => d.status === "completed");

  const openDownloaded = async (item: DownloadItem) => {
    if (!item.localUri) return;
    haptic.medium();
    // Store as a synthetic episode URL playable via /player
    const synth = {
      id: `dl-${item.id}`,
      url: item.localUri,
      name: item.name,
      group: "İndirilenler",
      container_ext: item.ext,
      poster: item.poster,
    };
    await storage.setItem(EPISODE_URL_KEY + synth.id, JSON.stringify(synth));
    router.push({ pathname: "/player", params: { id: synth.id } });
  };

  const confirmRemove = (item: DownloadItem) => {
    Alert.alert(
      "İndirmeyi Sil",
      `"${item.name}" indirilen dosyayı silmek istediğinize emin misiniz?`,
      [
        { text: "İptal", style: "cancel" },
        { text: "Sil", style: "destructive", onPress: () => { haptic.warning(); remove(item.id); } },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="downloads-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="downloads-back-btn" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.onSurface }]}>İndirilenler</Text>
        {completed.length > 0 ? (
          <TouchableOpacity testID="clear-completed-btn" onPress={clearCompleted} hitSlop={10}>
            <Text style={[styles.clearText, { color: colors.brandPrimary }]}>Temizle</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 26 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl, gap: SPACING.md }}>
        {/* ═══ KAYITLAR ═══ */}
        {recordings.length > 0 && (
          <View style={{ gap: SPACING.sm }}>
            <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, fontWeight: "800", letterSpacing: 1 }}>
              KAYITLAR ({recordings.length})
            </Text>
            {recordings.map(r => (
              <TouchableOpacity
                key={r.uri}
                testID={`rec-${r.name}`}
                onPress={() => router.push({ pathname: "/player", params: { localUri: r.uri, title: r.name } })}
                style={{
                  flexDirection: "row", alignItems: "center", gap: SPACING.md,
                  backgroundColor: colors.surfaceSecondary, borderColor: colors.border,
                  borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md,
                }}
              >
                <Ionicons name="videocam" size={22} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface, fontSize: FONT.size.sm }} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs }}>
                    {(r.size / 1048576).toFixed(1)} MB
                  </Text>
                </View>
                <TouchableOpacity
                  hitSlop={10}
                  onPress={() => {
                    Alert.alert("Kaydı sil", r.name, [
                      { text: "Vazgeç", style: "cancel" },
                      {
                        text: "Sil", style: "destructive",
                        onPress: async () => {
                          try {
                            const FS: any = await import("expo-file-system/legacy");
                            await FS.deleteAsync(r.uri, { idempotent: true });
                            loadRecordings();
                          } catch {}
                        },
                      },
                    ]);
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {active.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>AKTİF ({active.length})</Text>
            {active.map(item => {
              const st = statusLabel(item.status);
              return (
                <View key={item.id} style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={[styles.poster, { backgroundColor: colors.surfaceTertiary }]}>
                    {item.poster ? (
                      <Image source={{ uri: item.poster }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    ) : (
                      <Ionicons name={item.kind === "series" || item.kind === "episode" ? "albums" : "film"} size={26} color={colors.onSurfaceSecondary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={2}>{item.name}</Text>
                    <Text style={[styles.meta, { color: st.color }]}>{st.text}</Text>
                    {item.status === "downloading" && (
                      <>
                        <View style={[styles.progBg, { backgroundColor: colors.surfaceTertiary }]}>
                          <View style={[styles.progFill, { backgroundColor: colors.brandPrimary, width: `${item.progress * 100}%` }]} />
                        </View>
                        <Text style={[styles.progText, { color: colors.onSurfaceSecondary }]}>
                          %{Math.round(item.progress * 100)} • {fmtBytes(item.bytesDownloaded)} / {fmtBytes(item.totalBytes)}
                        </Text>
                      </>
                    )}
                    {item.status === "failed" && item.error && (
                      <Text style={[styles.err, { color: colors.error }]} numberOfLines={2}>{item.error}</Text>
                    )}
                  </View>
                  <View style={styles.actions}>
                    {item.status === "downloading" && (
                      <TouchableOpacity testID={`pause-${item.id}`} onPress={() => { haptic.soft(); pause(item.id); }} hitSlop={8}>
                        <Ionicons name="pause" size={22} color={colors.brandPrimary} />
                      </TouchableOpacity>
                    )}
                    {(item.status === "paused" || item.status === "failed") && (
                      <TouchableOpacity testID={`resume-${item.id}`} onPress={() => { haptic.soft(); resume(item.id); }} hitSlop={8}>
                        <Ionicons name="play" size={22} color={colors.brandPrimary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity testID={`cancel-${item.id}`} onPress={() => { haptic.warning(); cancel(item.id); }} hitSlop={8}>
                      <Ionicons name="close-circle" size={22} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {completed.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.onSurfaceTertiary, marginTop: SPACING.lg }]}>
              TAMAMLANAN ({completed.length})
            </Text>
            {completed.map(item => (
              <TouchableOpacity
                key={item.id}
                testID={`play-download-${item.id}`}
                onPress={() => openDownloaded(item)}
                onLongPress={() => confirmRemove(item)}
                delayLongPress={400}
                activeOpacity={0.75}
                style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              >
                <View style={[styles.poster, { backgroundColor: colors.surfaceTertiary }]}>
                  {item.poster ? (
                    <Image source={{ uri: item.poster }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  ) : (
                    <Ionicons name={item.kind === "series" || item.kind === "episode" ? "albums" : "film"} size={26} color={colors.onSurfaceSecondary} />
                  )}
                  <View style={styles.playOverlay}>
                    <Ionicons name="play-circle" size={28} color="#fff" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={2}>{item.name}</Text>
                  <Text style={[styles.meta, { color: colors.onSurfaceSecondary }]}>
                    {fmtBytes(item.totalBytes)} • {item.ext.toUpperCase()} • Çevrimdışı hazır
                  </Text>
                </View>
                <TouchableOpacity testID={`remove-${item.id}`} onPress={() => confirmRemove(item)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={22} color={colors.onSurfaceSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </>
        )}

        {downloads.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="cloud-download-outline" size={60} color={colors.onSurfaceSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>Henüz indirme yok</Text>
            <Text style={[styles.emptySub, { color: colors.onSurfaceSecondary }]}>
              Film veya dizi detay sayfasında “İndir” butonuna basarak başlayın.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  clearText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  section: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1.5 },
  card: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1,
  },
  poster: { width: 60, height: 82, borderRadius: RADIUS.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  playOverlay: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  name: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  meta: { fontSize: FONT.size.xs, marginTop: 4 },
  progBg: { height: 4, borderRadius: 2, marginTop: 8, overflow: "hidden" },
  progFill: { height: "100%", borderRadius: 2 },
  progText: { fontSize: 10, marginTop: 4 },
  err: { fontSize: FONT.size.xs, marginTop: 4 },
  actions: { flexDirection: "row", gap: SPACING.md },
  empty: { alignItems: "center", padding: SPACING.xxxl, gap: SPACING.md },
  emptyTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  emptySub: { fontSize: FONT.size.sm, textAlign: "center", paddingHorizontal: SPACING.xl },
});
