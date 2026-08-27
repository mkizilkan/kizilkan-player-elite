/**
 * KIZILKAN PLAYER — Kanal/İçerik Uzun-Bas Menüsü (Action Sheet)
 * Dosya   : frontend/src/components/ChannelActionSheet.tsx
 * Sürüm   : v1.0.0
 * Faz     : Paket 1 / B2 — IPTV Extreme tarzı uzun-bas menüsü
 *
 * ===========================================================================
 * NE İŞE YARIYOR?
 * ===========================================================================
 * Bir kanala/filme/diziye uzun basınca (TV Box'ta kumanda ile) IPTV Extreme
 * Pro'daki gibi zengin bir işlem menüsü açar: Oynat, Bilgi, EPG, Catch-up,
 * Favori, İzleme listesi, Gizle, Kanal simgesi vb.
 *
 * ESKİ: Basit Alert.alert (3-4 buton, sınırlı, iOS'ta kötü görünüyordu).
 * YENİ: Alttan açılan tam menü (bottom sheet), her öğe ikonlu, TV Box için
 * focusable (kumanda ile gezilebilir).
 *
 * Menü öğeleri DIŞARIDAN veriliyor (actions prop) — böylece canlı/vod/dizi
 * için farklı öğeler gösterilebilir. Bu bileşen sadece SUNUM yapar.
 * ===========================================================================
 */

import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useTVFocus, focusStyle } from "@/src/hooks/useTVFocus";

export interface ActionItem {
  /** Ionicons adı */
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Yıkıcı işlem (kırmızı) — gizle, sil vb. */
  destructive?: boolean;
  /** Aktif/işaretli durum (favori ekli gibi) */
  active?: boolean;
}

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Alt başlıkta gösterilecek küçük logo/afiş URL'i (opsiyonel) */
  imageUri?: string | null;
  actions: ActionItem[];
  onClose: () => void;
}

export function ChannelActionSheet({ visible, title, subtitle, actions, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Arka plana dokununca kapat */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* İç panele dokunuş kapatmayı tetiklemesin */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Tutamaç */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Başlık */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {actions.map((a, idx) => {
              const color = a.destructive
                ? colors.error ?? "#D32F2F"
                : a.active
                ? colors.brandPrimary
                : colors.onSurface;
              return (
                <ActionRow
                  key={idx}
                  index={idx}
                  action={a}
                  color={color}
                  accent={colors.brandPrimary}
                  onDone={onClose}
                />
              );
            })}
          </ScrollView>

          {/* İptal */}
          <TouchableOpacity
            testID="action-cancel"
            activeOpacity={0.7}
            focusable
            style={[styles.cancel, { backgroundColor: colors.surfaceTertiary }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelText, { color: colors.onSurface }]}>İptal</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Tek işlem satırı — TV kumanda odağı destekli (v5.2.0). */
function ActionRow({
  index, action, color, accent, onDone,
}: {
  index: number;
  action: ActionItem;
  color: string;
  accent: string;
  onDone: () => void;
}) {
  const { isFocused, onFocus, onBlur } = useTVFocus();
  return (
    <TouchableOpacity
      testID={`action-${index}`}
      activeOpacity={0.7}
      focusable
      hasTVPreferredFocus={index === 0}
      onFocus={onFocus}
      onBlur={onBlur}
      style={[styles.row, focusStyle(accent, isFocused)]}
      onPress={() => { action.onPress(); onDone(); }}
    >
      <Ionicons name={action.icon} size={22} color={color} style={styles.rowIcon} />
      <Text style={[styles.rowLabel, { color }]}>{action.label}</Text>
      {action.active ? <Ionicons name="checkmark" size={18} color={accent} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    // v15.0.1 BUILD FIX: eski `xl ?? 20` fiilen 20 idi; geçerli lg tokenı da 20, görsel davranış değişmez.
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderWidth: 1,
    paddingBottom: SPACING.xl,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
  },
  subtitle: {
    fontSize: FONT.size.sm,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: SPACING.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.md,
  },
  rowIcon: {
    width: 26,
    textAlign: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.medium,
  },
  cancel: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    height: 50,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.bold,
  },
});

export default ChannelActionSheet;
