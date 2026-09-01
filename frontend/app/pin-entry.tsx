import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useParental } from "@/src/store/ParentalContext";
import { FocusButton } from "@/src/components/FocusButton";
import { useTv } from "@/src/store/TvContext";

export default function PinEntry() {
  // PDF Bulgu 5: TV'de klavye otomatik açılmamalı, odağı kaçırıyor.
  const { isTv } = useTv();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ category?: string; returnTo?: string }>();
  const { verifyPinAsync, unlockCategoryForSession } = useParental();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (await verifyPinAsync(pin)) {
      if (params.category) unlockCategoryForSession(params.category);
      router.back();
    } else {
      setErr("Yanlış PIN");
      setPin("");
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} testID="pin-entry-screen">
      <View style={styles.wrap}>
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSecondary, borderColor: colors.brandPrimary }]}>
          <Ionicons name="lock-closed" size={40} color={colors.brandPrimary} />
        </View>
        <Text style={[styles.title, { color: colors.onSurface }]}>Ebeveyn Kontrolü</Text>
        <Text style={[styles.sub, { color: colors.onSurfaceSecondary }]}>
          {params.category ? `"${params.category}" kategorisi kilitli` : "PIN girin"}
        </Text>

        <TextInput
          testID="parental-pin-input"
          value={pin}
          onChangeText={t => { setPin(t.replace(/\D/g, "").slice(0, 4)); setErr(null); }}
          placeholder="••••"
          placeholderTextColor={colors.onSurfaceTertiary}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={10}
          autoFocus={!isTv}
          style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
        />
        {err && <Text style={[styles.err, { color: colors.error }]}>{err}</Text>}

        <View style={styles.row}>
          <FocusButton
            testID="pin-cancel-btn"
            onPress={() => router.back()}
            style={[styles.btn, styles.cancel, { borderColor: colors.border }]}
          >
            <Text style={[styles.btnText, { color: colors.onSurface }]}>İptal</Text>
          </FocusButton>
          <FocusButton
            testID="pin-submit-btn"
            onPress={submit}
            disabled={pin.length < 4}
            style={[styles.btn, { backgroundColor: colors.brandPrimary, opacity: pin.length < 4 ? 0.5 : 1 }]}
          >
            <Text style={[styles.btnText, { color: colors.onBrandPrimary }]}>Onayla</Text>
          </FocusButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl, gap: SPACING.md },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, marginBottom: SPACING.md,
  },
  title: { fontSize: FONT.size.xxl, fontWeight: FONT.weight.black },
  sub: { fontSize: FONT.size.base, textAlign: "center", marginBottom: SPACING.xl },
  input: {
    width: 240, height: 64, borderWidth: 1, borderRadius: RADIUS.md,
    fontSize: 28, fontWeight: FONT.weight.black,
    letterSpacing: 12, textAlign: "center",
  },
  err: { fontSize: FONT.size.sm, marginTop: SPACING.sm },
  row: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xl, width: "100%", maxWidth: 320 },
  btn: {
    flex: 1, height: 52, borderRadius: RADIUS.pill,
    alignItems: "center", justifyContent: "center",
  },
  cancel: { borderWidth: 1 },
  btnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
});
