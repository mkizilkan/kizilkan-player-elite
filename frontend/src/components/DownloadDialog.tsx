/**
 * KIZILKAN PLAYER — İndirme Onay Diyaloğu
 * Dosya   : frontend/src/components/DownloadDialog.tsx
 * Sürüm   : v1.0.0 → v18.6.0
 *
 * İndir'e basınca açılır: dosya adı, boyut, hedef klasör, parça sayısı.
 *
 * HEDEF SEÇENEKLERİ:
 *  - "public" (v18.6.0, VARSAYILAN): Dosya yöneticisinde görünen
 *     İndirilenler/KIZILKAN PLAYER ELITE/<Filmler|Diziler/...> klasörü. Native parçalı motor.
 *  - "custom" (v18.6.0): Kullanıcının seçtiği klasör (Android klasör seçici), native motor.
 *  - "app": Uygulama içi (eski yol, korunur) — tek parça, uygulama içinden izlenir.
 *  - "downloads": Eski "Cihaza aktar" (uygulama içine iner, bitince SAF ile kopyalanır) — korunur.
 *
 * v18.6.0 — PARÇALI İNDİRME (IDM tarzı): 1/2/4/8/16 parça. Boyut ve Range desteği
 * native ön sorguyla (fetch HEAD bazı IPTV sunucularında yanıt vermiyordu). Hesabın
 * bağlantı sınırı biliniyorsa varsayılan parça sayısı onu geçmez; fazlası seçilirse uyarı.
 */

import React, { useEffect, useState } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ActivityIndicator, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";

export type SaveTarget = "app" | "downloads" | "public" | "custom";

export type DownloadOptions = { parts: number; treeUri?: string; size?: number };

interface Props {
  visible: boolean;
  fileName: string;
  sourceUrl: string;
  /** Kullanıcının seçtiği varsayılan hedef (ayarlardan). */
  defaultTarget?: SaveTarget;
  /** v18.6.0: Hesabın aynı anda izin verdiği bağlantı (Xtream max_connections), bilinmiyorsa undefined. */
  maxConnections?: number;
  /** v18.6.0: Görünür klasör altındaki alt klasör (ör. "Filmler" veya "Diziler/Dizi Adı"). */
  subdirLabel?: string;
  onConfirm: (target: SaveTarget, rememberDefault: boolean, opts: DownloadOptions) => void;
  onClose: () => void;
}

/** Baytı okunur biçime çevirir (1.5 GB gibi). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "Bilinmiyor";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const NATIVE = Platform.OS === "android" && KizilkanNativeCore.available;
const PART_CHOICES = [1, 2, 4, 8, 16];

export function DownloadDialog({ visible, fileName, sourceUrl, defaultTarget = "public", maxConnections, subdirLabel = "Filmler", onConfirm, onClose }: Props) {
  const { colors } = useTheme();
  const [size, setSize] = useState<number | null>(null);
  const [ranges, setRanges] = useState<boolean | null>(null);
  const [loadingSize, setLoadingSize] = useState(false);
  const [target, setTarget] = useState<SaveTarget>(defaultTarget);
  const [remember, setRemember] = useState(false);
  const [parts, setParts] = useState(1);
  const [treeUri, setTreeUri] = useState<string | undefined>(undefined);
  const [treeLabel, setTreeLabel] = useState("");

  const limit = maxConnections && maxConnections > 0 ? maxConnections : undefined;
  const defaultParts = Math.max(1, Math.min(4, limit ?? 2));

  const TARGETS: { key: SaveTarget; icon: keyof typeof Ionicons.glyphMap; label: string; desc: string; native?: boolean }[] = [
    { key: "public", icon: "folder", label: "İndirilenler (görünür)", desc: `İndirilenler/KIZILKAN PLAYER ELITE/${subdirLabel} — dosya yöneticisinde görünür`, native: true },
    { key: "custom", icon: "folder-open", label: "Başka klasör seç", desc: treeLabel ? `Seçilen: ${treeLabel}` : "Android klasör seçici ile istediğiniz yere", native: true },
    { key: "app", icon: "phone-portrait", label: "Uygulama içi", desc: "Yalnız uygulama içinden izlenir (tek parça)" },
  ];
  const visibleTargets = TARGETS.filter(t => !t.native || NATIVE);

  // Diyalog açılınca boyut + Range desteği (native ön sorgu; yoksa HEAD).
  useEffect(() => {
    if (!visible || !sourceUrl) return;
    setSize(null); setRanges(null); setLoadingSize(true);
    const effDefault: SaveTarget = !NATIVE && (defaultTarget === "public" || defaultTarget === "custom") ? "app" : defaultTarget;
    setTarget(effDefault);
    setParts(defaultParts);
    let cancelled = false;
    (async () => {
      try {
        if (NATIVE) {
          const r = await KizilkanNativeCore.downloadProbe(sourceUrl);
          if (!cancelled) { setSize(r.size > 0 ? r.size : null); setRanges(!!r.acceptRanges); }
        } else {
          const res = await fetch(sourceUrl, { method: "HEAD" });
          const len = res.headers.get("content-length");
          if (!cancelled) setSize(len ? Number(len) : null);
        }
      } catch {
        if (!cancelled) setSize(null);
      } finally {
        if (!cancelled) setLoadingSize(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sourceUrl, defaultTarget]);

  const pickFolder = async () => {
    try {
      const FS: any = await import("expo-file-system/legacy");
      const perm = await FS.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (perm?.granted && perm.directoryUri) {
        setTreeUri(perm.directoryUri);
        setTreeLabel(decodeURIComponent(String(perm.directoryUri).split("%3A").pop() || "klasör"));
        setTarget("custom");
      }
    } catch { /* kullanıcı vazgeçti */ }
  };

  const nativeTarget = target === "public" || target === "custom";
  const multiOk = nativeTarget && ranges !== false;
  const overLimit = !!limit && parts > limit;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <ScrollView>
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
                  {!loadingSize && ranges != null ? (ranges ? " · parçalı indirme destekleniyor" : " · sunucu parçalı indirmeyi desteklemiyor (tek parça)") : ""}
                </Text>
                {loadingSize && <ActivityIndicator size="small" color={colors.brandPrimary} style={{ marginLeft: 8 }} />}
              </View>
              {limit ? (
                <View style={styles.infoRow}>
                  <Ionicons name="git-branch" size={18} color={colors.onSurfaceSecondary} />
                  <Text style={[styles.infoSize, { color: colors.onSurfaceSecondary }]}>Hesabın bağlantı sınırı: {limit}</Text>
                </View>
              ) : null}
            </View>

            {/* Hedef seçimi */}
            <Text style={[styles.sectionLabel, { color: colors.onSurfaceTertiary }]}>NEREYE KAYDEDİLSİN?</Text>
            {visibleTargets.map((t) => {
              const selected = target === t.key;
              return (
                <TouchableOpacity key={t.key} activeOpacity={0.7} focusable
                  onPress={() => { if (t.key === "custom") void pickFolder(); else setTarget(t.key); }}
                  style={[styles.targetRow, { borderColor: selected ? colors.brandPrimary : colors.border, backgroundColor: selected ? colors.brandPrimary + "22" : "transparent" }]}>
                  <Ionicons name={t.icon} size={22} color={selected ? colors.brandPrimary : colors.onSurface} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.targetLabel, { color: colors.onSurface }]}>{t.label}</Text>
                    <Text style={[styles.targetDesc, { color: colors.onSurfaceTertiary }]}>{t.desc}</Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
                </TouchableOpacity>
              );
            })}

            {/* Parça sayısı */}
            {nativeTarget && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.onSurfaceTertiary, marginTop: SPACING.sm }]}>PARÇA SAYISI (PARALEL İNDİRME)</Text>
                <View style={{ flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" }}>
                  {PART_CHOICES.map(n => {
                    const on = parts === n;
                    const disabled = !multiOk && n > 1;
                    return (
                      <TouchableOpacity key={n} focusable disabled={disabled} onPress={() => setParts(n)}
                        style={[styles.partChip, { borderColor: on ? colors.brandPrimary : colors.border, backgroundColor: on ? colors.brandPrimary + "22" : "transparent", opacity: disabled ? 0.4 : 1 }]}>
                        <Text style={{ color: on ? colors.brandPrimary : colors.onSurface, fontWeight: FONT.weight.bold }}>{n === 1 ? "Tek" : `${n}`}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[styles.targetDesc, { color: overLimit ? colors.error : colors.onSurfaceTertiary, marginTop: SPACING.xs }]}>
                  {overLimit
                    ? `Uyarı: hesabınız aynı anda ${limit} bağlantıya izin veriyor. ${parts} parça sunucu tarafından reddedilebilir veya hesap geçici kilitlenebilir; reddedilirse parça sayısı otomatik düşürülür.`
                    : "Her parça sunucuya ayrı bir bağlantıdır. İzlerken indirmek de bir bağlantı daha kullanır."}
                </Text>
              </>
            )}

            {/* Varsayılan yap */}
            <TouchableOpacity activeOpacity={0.7} focusable onPress={() => setRemember(!remember)} style={styles.rememberRow}>
              <Ionicons name={remember ? "checkbox" : "square-outline"} size={22} color={remember ? colors.brandPrimary : colors.onSurfaceSecondary} />
              <Text style={[styles.rememberText, { color: colors.onSurfaceSecondary }]}>Bu hedefi varsayılan yap (bir daha sorma)</Text>
            </TouchableOpacity>

            {/* Butonlar */}
            <View style={styles.buttonRow}>
              <TouchableOpacity activeOpacity={0.8} focusable onPress={onClose} style={[styles.button, styles.buttonGhost, { borderColor: colors.border }]}>
                <Text style={[styles.buttonGhostText, { color: colors.onSurface }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} focusable hasTVPreferredFocus
                disabled={target === "custom" && !treeUri}
                onPress={() => { onConfirm(target, remember, { parts: multiOk ? parts : 1, treeUri: target === "custom" ? treeUri : undefined, size: size || undefined }); onClose(); }}
                style={[styles.button, { backgroundColor: colors.brandPrimary, opacity: target === "custom" && !treeUri ? 0.5 : 1 }]}>
                <Ionicons name="cloud-download" size={18} color={colors.onBrandPrimary} />
                <Text style={[styles.buttonText, { color: colors.onBrandPrimary }]}>İndirmeyi Başlat</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: SPACING.lg, paddingBottom: SPACING.xl, maxHeight: "92%" },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: SPACING.md },
  title: { fontSize: FONT.size.xl, fontWeight: FONT.weight.bold, marginBottom: SPACING.md },
  infoBox: { borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.lg },
  infoRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  infoName: { flex: 1, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  infoSize: { fontSize: FONT.size.sm, flex: 1 },
  sectionLabel: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1, marginBottom: SPACING.sm },
  targetRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  targetLabel: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  targetDesc: { fontSize: FONT.size.xs, marginTop: 2 },
  partChip: { minWidth: 52, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: 1, alignItems: "center" },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.md },
  rememberText: { fontSize: FONT.size.sm, flex: 1 },
  buttonRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm },
  button: { flex: 1, height: 52, borderRadius: RADIUS.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm },
  buttonText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  buttonGhost: { borderWidth: 1 },
  buttonGhostText: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
});

export default DownloadDialog;
