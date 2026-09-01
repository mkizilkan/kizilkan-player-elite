/**
 * KIZILKAN PLAYER — İlk Açılış Profil Kurulumu
 * Dosya  : frontend/app/profile-setup.tsx
 * Sürüm  : v1.0.0 (v5.2.0)
 *
 * Kullanıcının isteği: "Program ilk kurulumdan sonraki açılışta profil
 * oluşturma ile açılsın."
 *
 * Bu ekran SADECE ilk açılışta gösterilir. Kullanıcı adını girer, rengini
 * seçer, isterse PIN koyar. Sonra liste ekleme adımına geçilir.
 * TV Box için: tüm öğeler odaklanabilir, ilk alan otomatik odakta.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useProfiles } from "@/src/store/ProfileContext";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useTv } from "@/src/store/TvContext";
import { useTVFocus, focusStyle } from "@/src/hooks/useTVFocus";
import { storage } from "@/src/utils/storage";
import { haptic } from "@/src/utils/haptic";

export const PROFILE_SETUP_KEY = "kizilkan.profileSetupDone";

const COLORS = ["#E30A17", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA", "#00ACC1"];

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isTv, overscan } = useTv();
  const { profiles, addProfile, updateProfile, setPin } = useProfiles();
  const { playlists } = usePlaylists();

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [pin, setPinValue] = useState("");
  const [saving, setSaving] = useState(false);

  const canContinue = name.trim().length > 0 && !saving;

  const finish = async () => {
    if (!canContinue) return;
    setSaving(true);
    haptic.success();
    try {
      // İlk profil zaten var (varsayılan); onu kullanıcının verdiği bilgilerle
      // güncelliyoruz — böylece "Profil 1" gibi boş bir kayıt kalmıyor.
      const first = profiles[0];
      if (first) {
        await updateProfile(first.id, { name: name.trim(), color });
        if (pin.trim().length >= 4) await setPin(first.id, pin.trim());
      } else {
        const p = await addProfile(name.trim(), color);
        if (pin.trim().length >= 4) await setPin(p.id, pin.trim());
      }
      await storage.setItem(PROFILE_SETUP_KEY, "1");
      // Liste yoksa liste ekleme adımına, varsa ana ekrana.
      router.replace(playlists.length === 0 ? "/onboarding" : "/(tabs)");
    } finally {
      setSaving(false);
    }
  };

  // v15.0.1 BUILD FIX: ThemePalette sözleşmesinin ana zemini `surface`; tanımsız `background` kullanılmaz.
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.surface, padding: SPACING.lg + overscan }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxxl }} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Ionicons name="person-circle" size={isTv ? 72 : 56} color={colors.brandPrimary} />
            <Text style={[styles.title, { color: colors.onSurface, fontSize: isTv ? 30 : 24 }]}>
              Hoş geldiniz
            </Text>
            <Text style={[styles.sub, { color: colors.onSurfaceSecondary }]}>
              Başlamadan önce profilinizi oluşturalım. Her profilin kendi favorileri,
              izleme geçmişi ve listesi olur.
            </Text>
          </View>

          {/* İsim */}
          <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>PROFİL ADI</Text>
          <TextInput
            testID="profile-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Örn: Mehmet"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoFocus={!isTv}
            style={[
              styles.input,
              {
                color: colors.onSurface,
                borderColor: colors.border,
                backgroundColor: colors.surfaceSecondary,
                fontSize: isTv ? 20 : FONT.size.base,
              },
            ]}
          />

          {/* Renk */}
          <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>RENK</Text>
          <View style={styles.colorRow}>
            {COLORS.map(c => (
              <ColorDot key={c} color={c} selected={color === c} onPress={() => setColor(c)} accent={colors.onSurface} />
            ))}
          </View>

          {/* PIN (isteğe bağlı) */}
          <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>
            PIN (isteğe bağlı — 4 hane)
          </Text>
          <TextInput
            testID="profile-pin-input"
            value={pin}
            onChangeText={(t) => setPinValue(t.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="Boş bırakırsanız kilit olmaz"
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="number-pad"
            secureTextEntry
            style={[
              styles.input,
              {
                color: colors.onSurface,
                borderColor: colors.border,
                backgroundColor: colors.surfaceSecondary,
                fontSize: isTv ? 20 : FONT.size.base,
              },
            ]}
          />

          <ContinueButton
            enabled={canContinue}
            label={saving ? "Kaydediliyor..." : "Devam Et"}
            accent={colors.brandPrimary}
            textColor={colors.onBrandPrimary}
            onPress={finish}
            big={isTv}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Renk seçme noktası — TV odağı destekli. */
function ColorDot({
  color, selected, onPress, accent,
}: { color: string; selected: boolean; onPress: () => void; accent: string }) {
  const { isFocused, onFocus, onBlur } = useTVFocus();
  return (
    <TouchableOpacity
      testID={`profile-color-${color}`}
      focusable
      onFocus={onFocus}
      onBlur={onBlur}
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.colorDot,
        { backgroundColor: color, borderColor: selected ? accent : "transparent" },
        focusStyle(accent, isFocused, 24),
      ]}
    >
      {selected ? <Ionicons name="checkmark" size={20} color="#fff" /> : null}
    </TouchableOpacity>
  );
}

/** Devam butonu — TV odağı destekli, ilk odak burada. */
function ContinueButton({
  enabled, label, accent, textColor, onPress, big,
}: {
  enabled: boolean; label: string; accent: string; textColor: string; onPress: () => void; big?: boolean;
}) {
  const { isFocused, onFocus, onBlur } = useTVFocus();
  return (
    <TouchableOpacity
      testID="profile-continue-btn"
      focusable
      onFocus={onFocus}
      onBlur={onBlur}
      disabled={!enabled}
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.continue,
        { backgroundColor: accent, opacity: enabled ? 1 : 0.4, height: big ? 62 : 54 },
        focusStyle(accent, isFocused, 30),
      ]}
    >
      <Text style={[styles.continueText, { color: textColor, fontSize: big ? 20 : FONT.size.base }]}>
        {label}
      </Text>
      <Ionicons name="arrow-forward" size={20} color={textColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.xl, marginTop: SPACING.lg },
  title: { fontWeight: FONT.weight.bold },
  sub: { fontSize: FONT.size.sm, textAlign: "center", paddingHorizontal: SPACING.lg },
  label: {
    fontSize: FONT.size.xs, fontWeight: FONT.weight.bold,
    letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.md,
  },
  input: {
    height: 54, borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: SPACING.md,
  },
  colorRow: { flexDirection: "row", gap: SPACING.md, flexWrap: "wrap" },
  colorDot: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 3,
    alignItems: "center", justifyContent: "center",
  },
  continue: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: SPACING.sm, borderRadius: RADIUS.pill, marginTop: SPACING.xl,
  },
  continueText: { fontWeight: FONT.weight.bold },
});
