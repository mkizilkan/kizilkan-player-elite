import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useParental } from "@/src/store/ParentalContext";
import { useLibrary } from "@/src/store/LibraryContext";
import { haptic } from "@/src/utils/haptic";
import { KizilkanLogo } from "@/src/components/KizilkanLogo";
import { FocusButton } from "@/src/components/FocusButton";
import { useTv } from "@/src/store/TvContext";

/**
 * PIN entry that unlocks the hidden items session (in-memory).
 * Redirects to /hidden-manager on success.
 */
export default function HiddenPinScreen() {
  // PDF Bulgu 5: TV'de klavye otomatik açılmamalı, odağı kaçırıyor.
  const { isTv } = useTv();
  const router = useRouter();
  const { colors } = useTheme();
  const { settings, verifyPinAsync } = useParental();
  const { unlockHiddenSession } = useLibrary();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 200); return () => clearTimeout(t); }, []);

  const submit = async (val: string) => {
    // v5.5.0: PIN 4-10 hane olabilir (eskiden 4 sabitti).
    if (val.length < 4 || val.length > 10) return;
    if (!settings.enabled) {
      setErr("PIN henüz oluşturulmadı. Ayarlar'dan oluşturun.");
      haptic.error();
      return;
    }
    if (await verifyPinAsync(val)) {
      haptic.success();
      unlockHiddenSession();
      router.replace("/hidden-manager");
    } else {
      setErr("PIN yanlış");
      setPin("");
      setAttempts(a => a + 1);
      haptic.error();
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="hidden-pin-screen">
      <View style={styles.header}>
        <FocusButton testID="hidden-pin-cancel-btn" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </FocusButton>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.content}>
        <View style={{ opacity: 0.9 }}>
          <KizilkanLogo size="md" showSubtitle={false} />
        </View>
        <View style={[styles.iconBadge, { backgroundColor: colors.brandPrimary + "22", borderColor: colors.brandPrimary }]}>
          <Ionicons name="eye-off" size={44} color={colors.brandPrimary} />
        </View>
        <Text style={[styles.title, { color: colors.onSurface }]}>Gizli İçerikler</Text>
        <Text style={[styles.subtitle, { color: colors.onSurfaceSecondary }]}>
          Devam etmek için PIN&apos;i girin (4-10 rakam)
        </Text>

        <View style={styles.dotsRow}>
          {[0, 1, 2, 3].map(i => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: pin.length > i ? colors.brandPrimary : "transparent", borderColor: pin.length > i ? colors.brandPrimary : colors.border },
              ]}
            />
          ))}
        </View>

        <TextInput
          ref={inputRef}
          testID="hidden-pin-input"
          value={pin}
          onChangeText={(t) => {
            const clean = t.replace(/\D/g, "").slice(0, 4);
            setPin(clean);
            setErr(null);
            if (clean.length >= 4) { /* otomatik gönderme yok; kullanıcı onaylar */ }
          }}
          keyboardType="number-pad"
          maxLength={10}
          secureTextEntry
          style={styles.hiddenInput}
          autoFocus={!isTv}
        />

        <FocusButton onPress={() => inputRef.current?.focus()} style={styles.tapArea}>
          <Text style={[styles.tapHint, { color: colors.brandPrimary }]}>Tuş takımını göster</Text>
        </FocusButton>

        {err && (
          <Text style={[styles.err, { color: colors.error }]}>
            {err}{attempts >= 3 ? ` (${attempts} yanlış deneme)` : ""}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", padding: SPACING.lg },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.xl, gap: SPACING.lg },
  iconBadge: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  title: { fontSize: FONT.size.xxl, fontWeight: FONT.weight.black },
  subtitle: { fontSize: FONT.size.base, textAlign: "center" },
  dotsRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.lg },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
  tapArea: { padding: SPACING.md },
  tapHint: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  err: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, marginTop: SPACING.sm },
});
