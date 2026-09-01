/**
 * KIZILKAN PLAYER — İndirme Onay Diyaloğu
 * Dosya   : frontend/src/components/DownloadDialog.tsx
 * Sürüm   : v1.0.0
 * Faz     : Paket 2 / profesyonel indirme
 *
 * İndir'e basınca açılır: dosya adı, tahmini boyut (HEAD isteğiyle), hedef
 * klasör seçimi gösterir. Kullanıcı onaylayınca indirme başlar.
 *
 * HEDEF SEÇENEKLERİ:
 *  - "app": Uygulama içi (varsayılan, en güvenli, izin gerektirmez)
 *  - "downloads": Cihaz İndirilenler klasörü (tamamlanınca kopyalanır)
 *  - "gallery": Galeri/Filmler (medya kütüphanesine eklenir)
 *
 * Not: Android'de "her klasöre yaz" (SAF) karmaşık ve indirme kütüphanesiyle
 * çakışır. Bu yüzden önce uygulama klasörüne indirilir, tamamlanınca seçilen
 * hedefe KOPYALANIR. Bu yaklaşım hem güvenli hem de resume (kaldığı yerden
 * devam) ile uyumludur.
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";

export type SaveTarget = "app" | "downloads";

interface Props {
  visible: boolean;
  fileName: string;
  sourceUrl: string;
  /** Kullanıcının seçtiği varsayılan hedef (ayarlardan). */
  defaultTarget?: SaveTarget;
  onConfirm: (target: SaveTarget, rememberDefault: boolean) => void;
  onClose: () => void;
}

/** Baytı okunur biçime çevirir (1.5 GB gibi). */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "Bilinmiyor";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const TARGETS: { key: SaveTarget; icon: keyof typeof Ionicons.glyphMap; label: string; desc: string }[] = [
  { key: "app", icon: "phone-portrait", label: "Uygulama içi", desc: "En güvenli, uygulama içinden izlenir" },
  { key: "downloads", icon: "download", label: "İndirilenler klasörü", desc: "Diğer uygulamalarla da açılabilir" },
];

export function DownloadDialog({ visible, fileName, sourceUrl, defaultTarget = "app", onConfirm, onClose }: Props) {
  const { colors } = useTheme();
  const [size, setSize] = useState<number | null>(null);
  const [loadingSize, setLoadingSize] = useState(false);
  const [target, setTarget] = useState<SaveTarget>(defaultTarget);
  const [remember, setRemember] = useState(false);

  // Diyalog açılınca dosya boyutunu HEAD isteğiyle öğren.
  useEffect(() => {
    if (!visible || !sourceUrl) return;
    setSize(null);
    setLoadingSize(true);
    setTarget(defaultTarget);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(sourceUrl, { method: "HEAD" });
        const len = res.headers.get("content-length");
        if (!cancelled) setSize(len ? Number(len) : null);
      } catch {
        if (!cancelled) setSize(null);
      } finally {
        if (!cancelled) setLoadingSize(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, sourceUrl, defaultTarget]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <Text style={[styles.title, { color: colors.onSurface }]}>İndirme</Text>

          {/* Dosya bilgisi */}
          <View style={[styles.infoBox, { backgroundColor: colors.surfaceTertiary }]}>
            <View style={styles.infoRow}>
              <Ionicons name="document" size={18} color={colors.onSurfaceSecondary} />
              <Text style={[styles.infoName, { color: colors.onSurface }]} numberOfLines={2}>{fileName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="server" size={18} color={colors.onSurfaceSecondary} />
              <Text style={[styles.infoSize, { color: colors.onSurfaceSecondary }]}>
                {loadingSize ? "Boyut hesaplanıyor..." : `Boyut: ${formatBytes(size || 0)}`}
              </Text>
              {loadingSize && <ActivityIndicator size="small" color={colors.brandPrimary} style={{ marginLeft: 8 }} />}
            </View>
          </View>

          {/* Hedef seçimi */}
          <Text style={[styles.sectionLabel, { color: colors.onSurfaceTertiary }]}>NEREYE KAYDEDİLSİN?</Text>
          {TARGETS.map((t) => {
            const selected = target === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                activeOpacity={0.7}
                focusable
                onPress={() => setTarget(t.key)}
                style={[
                  styles.targetRow,
                  { borderColor: selected ? colors.brandPrimary : colors.border,
                    backgroundColor: selected ? colors.brandPrimary + "22" : "transparent" },
                ]}
              >
                <Ionicons name={t.icon} size={22} color={selected ? colors.brandPrimary : colors.onSurface} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.targetLabel, { color: colors.onSurface }]}>{t.label}</Text>
                  <Text style={[styles.targetDesc, { color: colors.onSurfaceTertiary }]}>{t.desc}</Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
              </TouchableOpacity>
            );
          })}

          {/* Varsayılan yap */}
          <TouchableOpacity
            activeOpacity={0.7}
            focusable
            onPress={() => setRemember(!remember)}
            style={styles.rememberRow}
          >
            <Ionicons
              name={remember ? "checkbox" : "square-outline"}
              size={22}
              color={remember ? colors.brandPrimary : colors.onSurfaceSecondary}
            />
            <Text style={[styles.rememberText, { color: colors.onSurfaceSecondary }]}>
              Bu hedefi varsayılan yap (bir daha sorma)
            </Text>
          </TouchableOpacity>

          {/* Butonlar */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              focusable
              onPress={onClose}
              style={[styles.button, styles.buttonGhost, { borderColor: colors.border }]}
            >
              <Text style={[styles.buttonGhostText, { color: colors.onSurface }]}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              focusable
              hasTVPreferredFocus
              onPress={() => { onConfirm(target, remember); onClose(); }}
              style={[styles.button, { backgroundColor: colors.brandPrimary }]}
            >
              <Ionicons name="cloud-download" size={18} color={colors.onBrandPrimary} />
              <Text style={[styles.buttonText, { color: colors.onBrandPrimary }]}>İndirmeyi Başlat</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1,
    padding: SPACING.lg, paddingBottom: SPACING.xl, maxHeight: "88%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: SPACING.md },
  title: { fontSize: FONT.size.xl, fontWeight: FONT.weight.bold, marginBottom: SPACING.md },
  infoBox: { borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.lg },
  infoRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  infoName: { flex: 1, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  infoSize: { fontSize: FONT.size.sm },
  sectionLabel: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1, marginBottom: SPACING.sm },
  targetRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm,
  },
  targetLabel: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  targetDesc: { fontSize: FONT.size.xs, marginTop: 2 },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.md },
  rememberText: { fontSize: FONT.size.sm, flex: 1 },
  buttonRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm },
  button: {
    flex: 1, height: 52, borderRadius: RADIUS.pill, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: SPACING.sm,
  },
  buttonText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  buttonGhost: { borderWidth: 1 },
  buttonGhostText: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
});

export default DownloadDialog;
