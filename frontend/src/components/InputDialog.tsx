/**
 * KIZILKAN PLAYER — Metin Giriş Diyaloğu
 * Dosya  : frontend/src/components/InputDialog.tsx
 * Sürüm  : v1.0.0 (v5.0.0)
 *
 * Alert.prompt YALNIZCA iOS'ta çalışır. Android'de de çalışan, tema uyumlu ve
 * TV Box'ta kumanda ile kullanılabilen bir giriş kutusu.
 *
 * Kullanım: yeniden adlandırma, kanal simgesi (logo) adresi, özel grup adı.
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";

interface Props {
  visible: boolean;
  title: string;
  /** Kutunun altında açıklama. */
  description?: string;
  placeholder?: string;
  /** Açılışta dolu gelecek değer. */
  initialValue?: string;
  confirmLabel?: string;
  /** Boş değere izin ver (ör. özelleştirmeyi sıfırlamak için). */
  allowEmpty?: boolean;
  keyboardType?: "default" | "url";
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export function InputDialog({
  visible,
  title,
  description,
  placeholder,
  initialValue = "",
  confirmLabel = "Kaydet",
  allowEmpty = false,
  keyboardType = "default",
  onConfirm,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const [value, setValue] = useState(initialValue);

  // Diyalog her açılışta güncel değerle başlasın.
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const canConfirm = allowEmpty || value.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.center}>
          <Pressable
            style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.title, { color: colors.onSurface }]}>{title}</Text>
            {description ? (
              <Text style={[styles.desc, { color: colors.onSurfaceSecondary }]}>{description}</Text>
            ) : null}

            <TextInput
              testID="input-dialog-field"
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize={keyboardType === "url" ? "none" : "sentences"}
              autoCorrect={false}
              keyboardType={keyboardType === "url" ? "url" : "default"}
              style={[
                styles.input,
                { color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              autoFocus
            />

            <View style={styles.row}>
              <TouchableOpacity
                testID="input-dialog-cancel"
                onPress={onClose}
                focusable
                activeOpacity={0.8}
                style={[styles.btn, styles.ghost, { borderColor: colors.border }]}
              >
                <Text style={[styles.ghostText, { color: colors.onSurface }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="input-dialog-confirm"
                onPress={() => { onConfirm(value.trim()); onClose(); }}
                disabled={!canConfirm}
                focusable
                hasTVPreferredFocus
                activeOpacity={0.8}
                style={[styles.btn, { backgroundColor: colors.brandPrimary, opacity: canConfirm ? 1 : 0.4 }]}
              >
                <Text style={[styles.btnText, { color: colors.onBrandPrimary }]}>{confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: SPACING.lg },
  card: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.lg, gap: SPACING.sm },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  desc: { fontSize: FONT.size.sm },
  input: {
    height: 48, borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: SPACING.md, fontSize: FONT.size.base, marginTop: SPACING.xs,
  },
  row: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.md },
  btn: { flex: 1, height: 48, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  ghost: { borderWidth: 1 },
  ghostText: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
});

export default InputDialog;
