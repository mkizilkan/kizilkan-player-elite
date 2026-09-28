/**
 * KIZILKAN PLAYER v18.5.0 — Tarama ekranı proxy denetimleri.
 *  • ScanProxyToggleRow : "Proxy'li tarama / Normal tarama" anahtarı + havuz özeti + merkeze git
 *  • ScanProxyLiveLine  : tarama sürerken proxy'nin GERÇEKTEN kullanıldığını gösteren canlı satır
 *    (cihaz gözlemi: "tarama esnasında proxy kullanılmıyor gibi, hiç bilgi yoktu").
 */
import React, { useCallback, useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { FONT, SPACING } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import { PanelScan, type NativeScanProxyStatus } from "@/modules/panel-scan";
import { setScanProxyUse, human } from "@/src/utils/scanProxy";

function readStatus(): NativeScanProxyStatus | null {
  try { return PanelScan.available ? PanelScan.getScanProxyStatus() : null; } catch { return null; }
}

export function ScanProxyToggleRow({ onOpenCenter }: { onOpenCenter: () => void }) {
  const { colors } = useTheme();
  const [st, setSt] = useState<NativeScanProxyStatus | null>(() => readStatus());
  useFocusEffect(useCallback(() => { setSt(readStatus()); }, []));
  if (!PanelScan.available) return null;
  const alive = st?.alive ?? 0;
  const summary = !st ? "" : st.enabled
    ? (alive > 0
        ? `Havuz ${human(alive)} canlı${st.poolByAnon?.elite ? ` · elite ${st.poolByAnon.elite}` : ""}${st.good ? ` · iyi ${st.good}` : ""}`
        : "Havuz BOŞ — başlatınca sorulacak")
    : "Normal tarama (kendi bağlantınız)";
  return (
    <View style={{ marginTop: SPACING.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: SPACING.sm, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
        <Ionicons name="git-network-outline" size={18} color={colors.brandPrimary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onSurface, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold }}>
            {st?.enabled ? "Proxy'li tarama" : "Normal tarama"}
          </Text>
          <Text style={{ color: st?.enabled && alive === 0 ? colors.error : colors.onSurfaceTertiary, fontSize: FONT.size.xs }}>{summary}</Text>
        </View>
        <Switch
          testID="scan-proxy-toggle"
          value={!!st?.enabled}
          onValueChange={v => { void setScanProxyUse(v).then(s => setSt(s)); }}
          trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
        />
      </View>
      <FocusButton testID="scan-proxy-link" focusable onPress={onOpenCenter}
        style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs, paddingVertical: 4 }}>
        <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>Proxy merkezi (indir · test · anonimlik)</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.brandPrimary} />
      </FocusButton>
    </View>
  );
}

/** Tarama sürerken 1 sn'de bir native havuz durumunu okur. */
export function ScanProxyLiveLine({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const [st, setSt] = useState<NativeScanProxyStatus | null>(() => readStatus());
  useEffect(() => {
    if (!active) return;
    setSt(readStatus());
    const t = setInterval(() => setSt(readStatus()), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!active || !st) return null;
  if (!st.enabled) {
    return <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginBottom: SPACING.xs }}>Proxy kapalı — tarama kendi bağlantınızla yapılıyor.</Text>;
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: SPACING.xs }}>
      <Ionicons name="git-network" size={14} color={st.alive > 0 ? colors.success : colors.error} />
      <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, flex: 1 }} numberOfLines={2}>
        {`Proxy: ${human(st.alive)} canlı · ${human(st.dead)} elendi · ${st.inUse || 0} istek sürüyor · panel yanıtı ${human(st.panelSuccess || 0)}`}
        {st.lastProxy ? `\nŞu an: ${st.lastProxy}` : ""}
      </Text>
    </View>
  );
}
