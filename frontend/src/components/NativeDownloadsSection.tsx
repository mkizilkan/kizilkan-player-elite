/**
 * KIZILKAN PLAYER v18.6.0 — İndirilenler ekranı: native (parçalı) indirmeler.
 * İlerleme · hız · kalan süre · parça sayısı · Duraklat/Devam/İptal · Oynat · dosya yolu.
 */
import React from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { FONT, RADIUS, SPACING } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import { formatBytes } from "@/src/components/DownloadDialog";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import { fmtEta, fmtSpeed, useNativeDownloads } from "@/src/utils/nativeDownloads";
import { storage } from "@/src/utils/storage";

const EPISODE_URL_KEY = "kizilkan.episode.url.";

export function NativeDownloadsSection() {
  const { colors } = useTheme();
  const router = useRouter();
  const list = useNativeDownloads(true);
  if (!KizilkanNativeCore.available || list.length === 0) return null;

  const play = async (d: typeof list[number]) => {
    const synth = { id: `ndlplay-${d.id}`, url: d.uri, name: d.fileName.replace(/\.[^.]+$/, ""), group: "İndirilenler", container_ext: d.fileName.split(".").pop() || "mp4", poster: null };
    await storage.setItem(EPISODE_URL_KEY + synth.id, JSON.stringify(synth));
    router.push({ pathname: "/player", params: { id: synth.id, ext: "true" } });
  };

  return (
    <View style={{ gap: SPACING.sm }}>
      <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, fontWeight: "800", letterSpacing: 1 }}>
        İNDİRMELER ({list.length}) · İndirilenler/KIZILKAN PLAYER ELITE
      </Text>
      {list.map(d => {
        const pct = d.total > 0 ? Math.min(1, d.received / d.total) : 0;
        const running = d.state === "running" || d.state === "queued";
        const stateLabel = { queued: "Sırada", running: "İndiriliyor", paused: "Duraklatıldı", completed: "Tamamlandı", failed: "Başarısız", cancelled: "İptal" }[d.state];
        const stateColor = d.state === "completed" ? colors.success : d.state === "failed" ? colors.error : d.state === "paused" ? "#FFA000" : colors.brandPrimary;
        return (
          <View key={d.id} style={{ backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, gap: 6 }}>
            <Text style={{ color: colors.onSurface, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold }} numberOfLines={2}>{d.fileName}</Text>
            <Text style={{ color: stateColor, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>
              {stateLabel}{d.parts > 1 ? ` · ${d.parts} parça` : " · tek parça"}{d.state === "failed" && d.error ? ` · ${d.error}` : ""}
            </Text>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
              <View style={{ height: 6, width: `${pct * 100}%`, backgroundColor: stateColor }} />
            </View>
            <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }}>
              {`${formatBytes(d.received)} / ${d.total > 0 ? formatBytes(d.total) : "?"}${d.total > 0 ? ` (%${Math.round(pct * 100)})` : ""}`}
              {running && d.speed > 0 ? ` · ${fmtSpeed(d.speed)}${d.etaSec > 0 ? ` · kalan ${fmtEta(d.etaSec)}` : ""}` : ""}
            </Text>
            {d.path ? <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }} numberOfLines={2}>📁 {d.path}</Text> : null}
            <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: 2 }}>
              {d.state === "completed" && d.uri ? (
                <FocusButton focusable onPress={() => void play(d)} style={btn(colors.brandPrimary, true)}>
                  <Ionicons name="play" size={14} color={colors.onBrandPrimary} /><Text style={{ color: colors.onBrandPrimary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>Oynat</Text>
                </FocusButton>
              ) : null}
              {running ? (
                <FocusButton focusable onPress={() => void KizilkanNativeCore.downloadPause(d.id)} style={btn(colors.border)}>
                  <Ionicons name="pause" size={14} color={colors.onSurface} /><Text style={{ color: colors.onSurface, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>Duraklat</Text>
                </FocusButton>
              ) : null}
              {(d.state === "paused" || d.state === "failed") ? (
                <FocusButton focusable onPress={() => void KizilkanNativeCore.downloadResume(d.id)} style={btn(colors.brandPrimary)}>
                  <Ionicons name="play" size={14} color={colors.brandPrimary} /><Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>Devam</Text>
                </FocusButton>
              ) : null}
              <FocusButton focusable onPress={() => {
                Alert.alert(d.state === "completed" ? "Listeden kaldır ve sil" : "İndirmeyi iptal et", d.state === "completed" ? "Dosya cihazdan silinecek." : "Yarım dosya silinecek.", [
                  { text: "Vazgeç", style: "cancel" },
                  { text: d.state === "completed" ? "Sil" : "İptal et", style: "destructive", onPress: () => void KizilkanNativeCore.downloadCancel(d.id) },
                ]);
              }} style={btn(colors.error)}>
                <Ionicons name="trash" size={14} color={colors.error} /><Text style={{ color: colors.error, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>{d.state === "completed" ? "Sil" : "İptal"}</Text>
              </FocusButton>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function btn(color: string, filled = false) {
  return {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1,
    borderColor: color, backgroundColor: filled ? color : "transparent",
  };
}
