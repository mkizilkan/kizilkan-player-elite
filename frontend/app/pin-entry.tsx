import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useParental } from "@/src/store/ParentalContext";
import { FocusButton } from "@/src/components/FocusButton";
import { useTv } from "@/src/store/TvContext";
import { useProfiles } from "@/src/store/ProfileContext";
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH } from "@/src/utils/pin";
import { isCatalogRestoreActive } from "@/src/utils/catalogOperations";

export default function PinEntry() {
  // PDF Bulgu 5: TV'de klavye otomatik açılmamalı, odağı kaçırıyor.
  const { isTv } = useTv();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ category?: string; returnTo?: string }>();
  const { settings, isLoading: parentalLoading, loadError: parentalError, verifyPinAsync, unlockCategoryForSession } = useParental();
  const { activeProfile, isLoading: profileLoading, loadError: profileError } = useProfiles();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const submission = useRef(0);
  const owner = JSON.stringify([activeProfile.id, activeProfile.pin || "", settings.pin, settings.enabled, params.category || "", params.returnTo || ""]);
  const ready = !parentalLoading && !profileLoading && !parentalError && !profileError;
  const currentOwner = useRef({ key: owner, ready });
  currentOwner.current = { key: owner, ready };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; submission.current += 1; busy.current = false; };
  }, []);
  useEffect(() => {
    submission.current += 1;
    busy.current = false;
    setPinBusy(false);
    setPin("");
    setErr(null);
  }, [owner]);

  const submit = async () => {
    if (busy.current || currentOwner.current.key !== owner || !currentOwner.current.ready || isCatalogRestoreActive() || pin.length < PIN_MIN_LENGTH) return;
    const key = owner;
    const attempt = ++submission.current;
    const stillMine = () => mounted.current && submission.current === attempt && currentOwner.current.key === key && currentOwner.current.ready && !isCatalogRestoreActive();
    busy.current = true;
    setPinBusy(true);
    setErr(null);
    try {
      const accepted = await verifyPinAsync(pin);
      if (!stillMine()) return;
      if (accepted) {
        if (params.category) unlockCategoryForSession(params.category);
        router.back();
      } else {
        setErr("Yanlış PIN");
        setPin("");
      }
    } catch (error: any) {
      if (stillMine()) setErr(`PIN doğrulanamadı: ${String(error?.message || error)}`);
    } finally {
      if (mounted.current && submission.current === attempt && currentOwner.current.key === key) {
        busy.current = false;
        setPinBusy(false);
      }
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
          onChangeText={t => { setPin(t.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH)); setErr(null); }}
          placeholder="••••"
          placeholderTextColor={colors.onSurfaceTertiary}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_MAX_LENGTH}
          editable={!pinBusy && ready && !isCatalogRestoreActive()}
          autoFocus={!isTv}
          style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
        />
        {(err || parentalError || profileError) && <Text testID="parental-pin-error" style={[styles.err, { color: colors.error }]}>{err || parentalError || profileError}</Text>}

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
            disabled={pinBusy || !ready || isCatalogRestoreActive() || pin.length < PIN_MIN_LENGTH}
            style={[styles.btn, { backgroundColor: colors.brandPrimary, opacity: pinBusy || !ready || pin.length < PIN_MIN_LENGTH ? 0.5 : 1 }]}
          >
            <Text style={[styles.btnText, { color: colors.onBrandPrimary }]}>{pinBusy ? "Doğrulanıyor…" : "Onayla"}</Text>
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
