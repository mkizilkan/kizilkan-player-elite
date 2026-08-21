/**
 * KIZILKAN PLAYER — Grup Seçici
 * Dosya  : frontend/src/components/GroupDialog.tsx
 * Sürüm  : v1.0.0 (v5.0.1)
 *
 * ===========================================================================
 * NE SORUNU ÇÖZÜYOR?
 * ===========================================================================
 * v5.0.0'da "Gruba Ekle / Çıkar" düz bir metin kutusuydu. Daha önce
 * oluşturduğun grupları GÖSTERMİYORDU; ikinci bir kanalı aynı gruba eklemek
 * için grup adını harfi harfine tekrar yazman gerekiyordu (yazım hatası =
 * yeni grup).
 *
 * YENİ: Mevcut grupların listesi, kanalın hangilerinde olduğu işaretli olarak
 * gösterilir. Dokununca ekler/çıkarır. Altta "yeni grup oluştur" alanı var.
 * ===========================================================================
 */

import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";

interface Props {
  visible: boolean;
  /** Öğenin adı (başlıkta gösterilir). */
  itemName: string;
  /** Kullanıcının daha önce oluşturduğu tüm gruplar. */
  allGroups: string[];
  /** Bu öğenin şu an içinde olduğu gruplar. */
  memberGroups: string[];
  /** Bir gruba ekle/çıkar. */
  onToggle: (group: string) => void;
  /** Bir grubu tamamen sil (tüm kanallardan). */
  onDeleteGroup?: (group: string) => void;
  onClose: () => void;
}

export function GroupDialog({
  visible,
  itemName,
  allGroups,
  memberGroups,
  onToggle,
  onDeleteGroup,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const [newGroup, setNewGroup] = useState("");

  const createNew = () => {
    const name = newGroup.trim();
    if (!name) return;
    onToggle(name);
    setNewGroup("");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.bottom}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <Text style={[styles.title, { color: colors.onSurface }]}>Gruplarım</Text>
            <Text style={[styles.sub, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>
              {itemName}
            </Text>

            {/* Mevcut gruplar */}
            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {allGroups.length === 0 ? (
                <Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>
                  Henüz grup oluşturmadınız. Aşağıdan ilk grubunuzu oluşturun.
                </Text>
              ) : (
                allGroups.map((g) => {
                  const member = memberGroups.includes(g);
                  return (
                    <View key={g} style={styles.rowWrap}>
                      <TouchableOpacity
                        testID={`group-toggle-${g}`}
                        focusable
                        activeOpacity={0.7}
                        onPress={() => onToggle(g)}
                        style={[
                          styles.row,
                          {
                            borderColor: member ? colors.brandPrimary : colors.border,
                            backgroundColor: member ? colors.brandPrimary + "1A" : "transparent",
                          },
                        ]}
                      >
                        <Ionicons
                          name={member ? "checkbox" : "square-outline"}
                          size={22}
                          color={member ? colors.brandPrimary : colors.onSurfaceSecondary}
                        />
                        <Text
                          style={[styles.rowText, { color: member ? colors.brandPrimary : colors.onSurface }]}
                          numberOfLines={1}
                        >
                          {g}
                        </Text>
                      </TouchableOpacity>

                      {onDeleteGroup && (
                        <TouchableOpacity
                          testID={`group-delete-${g}`}
                          focusable
                          onPress={() => onDeleteGroup(g)}
                          hitSlop={8}
                          style={styles.deleteBtn}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.error ?? "#D32F2F"} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Yeni grup */}
            <View style={[styles.newRow, { borderTopColor: colors.border }]}>
              <TextInput
                testID="group-new-input"
                value={newGroup}
                onChangeText={setNewGroup}
                placeholder="Yeni grup adı..."
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[
                  styles.input,
                  { color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
                onSubmitEditing={createNew}
                returnKeyType="done"
              />
              <TouchableOpacity
                testID="group-create-btn"
                focusable
                onPress={createNew}
                disabled={!newGroup.trim()}
                style={[
                  styles.addBtn,
                  { backgroundColor: colors.brandPrimary, opacity: newGroup.trim() ? 1 : 0.4 },
                ]}
              >
                <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              testID="group-close-btn"
              focusable
              onPress={onClose}
              style={[styles.close, { backgroundColor: colors.surfaceTertiary }]}
            >
              <Text style={[styles.closeText, { color: colors.onSurface }]}>Tamam</Text>
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, paddingTop: SPACING.sm, maxHeight: "88%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: SPACING.md },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  sub: { fontSize: FONT.size.sm, marginBottom: SPACING.md },
  empty: { fontSize: FONT.size.sm, textAlign: "center", paddingVertical: SPACING.lg },
  rowWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.sm },
  row: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderRadius: RADIUS.md, borderWidth: 1,
  },
  rowText: { flex: 1, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  deleteBtn: { padding: 8 },
  newRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    borderTopWidth: 1, paddingTop: SPACING.md, marginTop: SPACING.sm,
  },
  input: {
    flex: 1, height: 46, borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: SPACING.md, fontSize: FONT.size.base,
  },
  addBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  close: {
    height: 48, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center",
    marginTop: SPACING.md,
  },
  closeText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
});

export default GroupDialog;
